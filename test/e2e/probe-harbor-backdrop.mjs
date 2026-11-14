// 岸上视角「整屏背景」覆盖审计：21 个港，逐港进岸上，量背景图被放大几倍。
//
// 为什么量放大倍数而不是"看着糊"：
//   object-cover 的放大倍数 = max(视口宽/图宽, 视口高/图高)。
//   ≤1 表示原生像素够用；>1.5 就是拿小图糊墙。缩略图本来是给 96px 高的面板用的。
//
// 跑法：先起 dev server，再 node test/e2e/probe-harbor-backdrop.mjs
//      SHOT=1 时把代表港截图落 .workbuddy/shots/backdrop-<id>.png

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'
mkdirSync(SHOTS, { recursive: true })
const SHOT = process.env.SHOT === '1'

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 30000 })
await page.evaluate(() => window.__gameStore.setState({
  gamePhase: 'playing', tutorialStep: -1, showHelp: false,
  dialogueSeen: ['opening_pilot'], activePanel: null,
  logbook: [], claimedVictories: [], collectedDebris: [],
}))

const ports = await page.evaluate(() => window.__gameStore.getState().ports.map(p => ({ id: p.id, nameCn: p.nameCn })))
  .catch(() => null)
const list = ports ?? await page.evaluate(async () => {
  const m = await import('/Age-of-Discovery/src/data/ports.ts')
  return m.ports.map(p => ({ id: p.id, nameCn: p.nameCn }))
})

const rows = []
for (const p of list) {
  // 直接跳到该港：先选港、开港口面板，再走真实入口
  await page.evaluate((id) => {
    const g = window.__gameStore.getState()
    g.dockAt?.(id)
  }, p.id)
  const docked = await page.evaluate((id) => window.__gameStore.getState().fleet?.currentPortId === id, p.id)
  if (!docked) {
    // 退路：改 fleet 里的 currentPortId
    await page.evaluate((id) => window.__gameStore.setState(s => ({ fleet: { ...s.fleet, currentPortId: id, isSailing: false } })), p.id)
  }
  await page.evaluate(() => window.__gameStore.setState({ activePanel: 'port' }))
  await page.waitForFunction(() => !!document.querySelector('[data-testid="harbor-enter"]'), { timeout: 8000 })
  await page.click('[data-testid="harbor-enter"]')
  // 必须等入场动画（整屏 opacity 0→1）结束再截图：中途截会把画稀释成一层褐雾，
  // 而看起来"和改之前一模一样"—— 2026-11-14 就是这么被骗过一次。
  const ok = await page.waitForFunction(() => {
    const img = document.querySelector('[data-testid="harbor-backdrop"]')
    const v = document.querySelector('[data-testid="harbor-view"]')
    return img && img.complete && img.naturalWidth > 0 && v && +getComputedStyle(v).opacity >= 0.999
  }, { timeout: 15000 }).then(() => true).catch(() => false)

  const m = await page.evaluate(() => {
    const img = document.querySelector('[data-testid="harbor-backdrop"]')
    const host = document.querySelector('[data-testid="harbor-view"]')
    if (!img || !host) return null
    const r = host.getBoundingClientRect()
    const sx = r.width / img.naturalWidth
    const sy = r.height / img.naturalHeight
    return {
      src: img.getAttribute('src').split('/').pop(),
      nw: img.naturalWidth, nh: img.naturalHeight,
      vw: Math.round(r.width), vh: Math.round(r.height),
      cover: +Math.max(sx, sy).toFixed(2),
      css: Math.round(img.getBoundingClientRect().width),
    }
  })
  rows.push({ ...p, ...(m ?? {}), decoded: ok })
  if (SHOT) await page.screenshot({ path: `${SHOTS}/backdrop-${p.id}.png` })

  // 退回海图，准备下一个港
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    const ms = window.__mapStore?.getState?.()
    ms?.setViewMode?.('chart')
    window.__gameStore.setState({ activePanel: null })
  })
  await new Promise(r => setTimeout(r, 120))
}

const line = (r) => `${String(r.id).padStart(2)} ${r.nameCn.padEnd(6, '　')} ${String(r.src ?? '—').padEnd(22)} ${String(r.nw + 'x' + r.nh).padEnd(10)} 视口${r.vw}x${r.vh}  放大 ${String(r.cover ?? '-').padStart(5)}×  ${r.decoded ? '' : '⚠未解码'}`
console.log('id 港口    背景图                 原始尺寸    视口            放大倍数')
for (const r of rows) console.log(line(r))

const bad = rows.filter(r => (r.cover ?? 0) > 1.5)
console.log(`\n共 ${rows.length} 港；放大 >1.5× 的 ${bad.length} 个：`)
for (const r of bad) console.log(`   ${r.nameCn} ${r.src} ${r.cover}×`)
const undec = rows.filter(r => !r.decoded)
if (undec.length) console.log('未解码：', undec.map(r => r.nameCn).join(', '))
await browser.close()
