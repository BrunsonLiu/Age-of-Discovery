// 岸上的"活"：走动的影子 / 起伏的小艇 / 白天的海鸥 + 减动效回退
//
// 跑法：先起 dev server，再 `node test/e2e/harbor-life.mjs`
//
// 【为什么这条判据值得单独一条】岸上那张远景是**画**：画里的人永远停在同一个姿势。
// 天光接上之后画面会随"时间"变，但一秒之内它是死的 —— 而这里恰恰是玩家停下来看最久的一屏。
// 判据不能是"有没有那个 class"（动画挂了 class 还在），必须是**两帧像素差**。

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'
mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
let pass = 0, fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) }
  else { fail++; console.log('  ✗ FAIL:', msg) }
}

const openHarbor = async (page) => {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => !!window.__gameStore, { timeout: 30000 })
  await page.evaluate(() => {
    window.__gameStore.setState({
      gamePhase: 'playing', tutorialStep: -1, showHelp: false,
      dialogueSeen: ['opening_pilot'], activePanel: null,
      logbook: [], claimedVictories: [], collectedDebris: [],
    })
    window.__dialogueStore?.getState().skip()
    const s = window.__gameStore.getState()
    window.__gameStore.setState({ fleet: { ...s.fleet, isSailing: false, currentPortId: 1 } })
    window.__mapStore.getState().setViewMode('harbor')
  })
  await page.waitForFunction(() => !!document.querySelector('[data-testid="harbor-view"]'), { timeout: 15000 })
  await page.waitForFunction(() => {
    const v = document.querySelector('[data-testid="harbor-view"]')
    const i = document.querySelector('[data-testid="harbor-backdrop"]')
    return !!v && +getComputedStyle(v).opacity >= 0.999 && !!i && i.complete && i.naturalWidth > 0
  }, { timeout: 20000 })
  await new Promise(r => setTimeout(r, 700))
}

/** 两张截图在指定纵向条带上的像素差（0~255 的平均/最大） */
const bandDiff = (a, b, bands) => (async () => {})() && null
const diffOf = async (page, a, b, bands) => page.evaluate(async (x, y, bs) => {
  const load = async (s) => {
    const i = new Image()
    i.src = 'data:image/png;base64,' + s
    await i.decode()
    const c = document.createElement('canvas')
    c.width = i.naturalWidth; c.height = i.naturalHeight
    c.getContext('2d').drawImage(i, 0, 0)
    return c
  }
  const A = await load(x), B = await load(y)
  const out = {}
  for (const [name, y0, y1] of bs) {
    const ay = Math.round(y0 * A.height)
    const h = Math.max(1, Math.round((y1 - y0) * A.height))
    const da = A.getContext('2d').getImageData(0, ay, A.width, h).data
    const db = B.getContext('2d').getImageData(0, ay, B.width, h).data
    let sum = 0, max = 0, n = 0
    for (let p = 0; p < da.length; p += 4) {
      const d = (Math.abs(da[p] - db[p]) + Math.abs(da[p + 1] - db[p + 1]) + Math.abs(da[p + 2] - db[p + 2])) / 3
      sum += d; n++; if (d > max) max = d
    }
    out[name] = { mean: +(sum / n).toFixed(2), max: +max.toFixed(1) }
  }
  return out
}, a, b, bands)
void bandDiff

const BANDS = [['码头带', 0.68, 0.86], ['面板带', 0.12, 0.40]]

// ---- 1. 桌面：画面在动，板子不动 ----
{
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
  await page.setViewport({ width: 1440, height: 900 })
  await openHarbor(page)

  const parts = await page.evaluate(() => ({
    walkers: document.querySelectorAll('.quay-walk').length,
    gulls: document.querySelectorAll('.quay-gull').length,
    figures: document.querySelectorAll('.quay-walkers path').length,
    parts: document.querySelectorAll('.quay-walkers rect, .quay-walkers circle, .quay-walkers g > path').length,
  }))
  check(parts.walkers === 5, `码头上五个走动的影子（${parts.walkers}）`)
  /* 影子必须"有腿有头"：人形是分段画的（腿/躯干/脖子/头）。
     一个楔形 + 一颗头在 30px 上读成钉子 —— 这条守的是"形状别再退回去"。 */
  check(parts.parts >= 5 * 5, `每个影子都是腿+躯干+脖+头（${parts.parts} 段图形，≥5×5）`)
  check(parts.gulls === 3, `白天三只海鸥（${parts.gulls}）`)

  const a = await page.screenshot({ encoding: 'base64' })
  await new Promise(r => setTimeout(r, 1500))
  const b = await page.screenshot({ encoding: 'base64' })
  const d = await diffOf(page, a, b, BANDS)
  check(d['码头带'].max >= 8, `码头那一带真的在动（相邻 1.5 秒最大差 ${d['码头带'].max} 级）`)
  check(d['面板带'].max <= 2, `两块内容板不跟着抖（${d['面板带'].max} 级）`)
  await page.screenshot({ path: `${SHOTS}/harbor-life-desktop.png` })
  check(errors.length === 0, `无页面错误${errors.length ? `（${errors[0]}）` : ''}`)
  await page.close()
}

// ---- 2. 减动效：动画关掉，但人和艇不能一起消失 ----
{
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
  await page.setViewport({ width: 1440, height: 900 })
  // 必须**在加载之前**开：prefersReducedMotion() 在首次渲染时读一次
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
  await openHarbor(page)
  const calm = await page.evaluate(() => ({
    walkers: document.querySelectorAll('.quay-walk').length,
    gulls: document.querySelectorAll('.quay-gull').length,
    figures: document.querySelectorAll('.quay-walkers path').length,
  }))
  check(calm.walkers === 0 && calm.gulls === 0,
    `减动效时两类动画全关（${calm.walkers}/${calm.gulls}）`)
  check(calm.figures > 0, `但影子本身还在（${calm.figures} 段路径）—— 关动画不等于删内容`)
  const a = await page.screenshot({ encoding: 'base64' })
  await new Promise(r => setTimeout(r, 1200))
  const b = await page.screenshot({ encoding: 'base64' })
  const d = await diffOf(page, a, b, [['码头带', 0.68, 0.86]])
  check(d['码头带'].max <= 2, `减动效时画面是静的（最大差 ${d['码头带'].max} 级）`)
  check(errors.length === 0, `减动效下无页面错误${errors.length ? `（${errors[0]}）` : ''}`)
  await page.close()
}

// ---- 3. 移动端：不渲染前景，也就没有影子 ----
{
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
  await page.setViewport({ width: 390, height: 844 })
  await openHarbor(page)
  const m = await page.evaluate(() => ({
    figures: document.querySelectorAll('.quay-walkers path').length,
    gulls: document.querySelectorAll('.quay-gull').length,
  }))
  check(m.figures === 0, '移动端不渲染前景 → 没有影子（不是"画了看不见"）')
  check(m.gulls === 3, '海鸥照旧（它在水面上，不靠前景）')
  check(errors.length === 0, `移动端无页面错误${errors.length ? `（${errors[0]}）` : ''}`)
  await page.close()
}

console.log(`\n岸上的"活" e2e：${pass} 通过 / ${fail} 失败`)
await browser.close()
if (fail > 0) process.exit(1)
