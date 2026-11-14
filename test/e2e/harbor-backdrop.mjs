// 岸上整屏背景：21 个港是不是都真有画、画有没有被 UI 压没
//
// 跑法：先起 dev server，再 `node test/e2e/harbor-backdrop.mjs`
//
// 【为什么要有这一套】
// 2026-11-14 巡检发现两件事，都是"做了但没收口"：
//   ① `harborBackdrop()` 只有欧洲一个 key，18 个港回落到 96px 面板缩略图 —
//      后来补了整屏图，但"补到哪张加哪张"的机制没人验；
//   ② 更隐蔽的：`HarborView` 的压暗层把整张画压掉了。上一次只改了 <img> 的
//      filter，没动三层渐变 —— 净屏实测天空只剩原图 46~51%、近水 34~37%，
//      彩度掉到一半以下。玩家看到的是"一片棕褐"，而不是"这是广州/哈瓦那"。
//
// 【判据怎么定的】
// 不用"看着糊"：把面板、服务板、前景码头、顶栏底栏全隐藏，只留背景与天光层，
// 截图后与原图**同区域**比亮度与彩度。比值与原素材无关，换图也不用改阈值。
// 阈值留了 ~10% 余量 —— 旧实现（压在 0.46/0.59）必定红，现在（0.62/0.75）绿。

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'
mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 160)) })
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })

let pass = 0, fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) }
  else { fail++; console.log('  ✗ FAIL:', msg) }
}
const until = async (fn, ms = 8000, ...args) => {
  try { await page.waitForFunction(fn, { timeout: ms }, ...args); return true } catch { return false }
}

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
check(await until(() => !!window.__gameStore), 'dev 状态钩子可用')
await page.evaluate(() => window.__gameStore.setState({
  gamePhase: 'playing', tutorialStep: -1, showHelp: false,
  dialogueSeen: ['opening_pilot'], activePanel: null,
  logbook: [], claimedVictories: [], collectedDebris: [],
}))
await until(() => !document.body.innerText.includes('选择你的船长天赋'))

/* ── 进岸上：走真实入口（港口面板里的按钮），不直接改 viewMode ───────── */
const enterHarbor = async (portId) => {
  await page.evaluate((id) => {
    window.__gameStore.setState(s => ({ fleet: { ...s.fleet, currentPortId: id, isSailing: false } }))
    window.__gameStore.setState({ activePanel: 'port' })
  }, portId)
  if (!await until(() => !!document.querySelector('[data-testid="harbor-enter"]'))) return false
  await page.click('[data-testid="harbor-enter"]')
  const ok = await until(() => {
    const v = document.querySelector('[data-testid="harbor-view"]')
    const i = document.querySelector('[data-testid="harbor-backdrop"]')
    return !!v && +getComputedStyle(v).opacity >= 0.999 && !!i && i.complete && i.naturalWidth > 0
  }, 20000)
  return ok
}
const exitHarbor = async () => {
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    window.__mapStore?.getState?.().setViewMode?.('chart')
    window.__gameStore.setState({ activePanel: null })
  })
  await new Promise(r => setTimeout(r, 150))
}

/* ── 1. 21 个港：每港都要有能铺满整屏的图 ───────────────────────────── */
// 港口清单不在 store 里（它是静态数据），从 dev server 的模块图里取
const portIds = await page.evaluate(async (base) => {
  const m = await import(base + 'src/data/ports.ts')
  return m.ports.map(p => p.id)
}, BASE)
console.log(`\n【1】逐港：背景图存在 / 解码 / 不被放大糊`)
const rows = []
for (const id of portIds) {
  if (!await enterHarbor(id)) { rows.push({ id, ok: false, why: '进不去' }); continue }
  const r = await page.evaluate(() => {
    const img = document.querySelector('[data-testid="harbor-backdrop"]')
    const host = document.querySelector('[data-testid="harbor-view"]')
    const b = host.getBoundingClientRect()
    const cover = Math.max(b.width / img.naturalWidth, b.height / img.naturalHeight)
    return {
      src: img.getAttribute('src').split('/').pop(),
      nw: img.naturalWidth, nh: img.naturalHeight,
      cover: +cover.toFixed(2),
      shown: getComputedStyle(img).display !== 'none',
    }
  })
  rows.push({ id, ...r, ok: true })
  await exitHarbor()
}
const noImg = rows.filter(r => !r.ok || !r.nw)
check(noImg.length === 0, `21 港全部有整屏背景图（缺 ${noImg.map(r => r.id).join(',') || '无'}）`)

// 同一张图被多少港共用 —— 不是错误，但要求"不是 18 个港全撞一张"
const bySrc = new Map()
for (const r of rows.filter(r => r.nw)) bySrc.set(r.src, (bySrc.get(r.src) ?? []).concat(r.id))
const worst = [...bySrc.entries()].sort((a, b) => b[1].length - a[1].length)[0]
console.log(`    用到的图 ${bySrc.size} 张；最挤的一张 ${worst[0]} 服务 ${worst[1].length} 港`)
check(bySrc.size >= 12, `21 港至少 12 张不同的画（现 ${bySrc.size} 张）`)
check(worst[1].length <= 7, `单张图最多服务 7 港（现 ${worst[0]} ← ${worst[1].length} 港）`)

const tooBig = rows.filter(r => r.nw && r.cover > 1.5)
check(tooBig.length === 0,
  `没有港拿小图糊墙（>1.5× 的：${tooBig.map(r => `${r.src}@${r.cover}×`).join(' ') || '无'}）`)
const tinySrc = rows.filter(r => r.nw && r.nw < 1400)
check(tinySrc.length === 0, `原图都 ≥1400px 宽（最窄 ${Math.min(...rows.filter(r => r.nw).map(r => r.nw))}px）`)

/* ── 2. 净背景：藏掉 UI，只量"画本身在屏幕上还剩多少" ──────────────── */
console.log(`\n【2】净背景亮度/彩度保留率（藏掉面板、码头、顶底栏）`)

// 固定到白天：日相是 performance.now 的纯函数，挪 0 即默认上午相位
await page.evaluate(() => {
  if (window.__realNow === undefined) {
    window.__realNow = performance.now.bind(performance)
    Object.defineProperty(performance, 'now', {
      configurable: true, value: () => window.__realNow() + (window.__shiftMs ?? 0),
    })
  }
  window.__shiftMs = 0
})

const REGIONS = [
  ['天空', [0.02, 0.20, 0.35, 0.65]],
  ['中景', [0.36, 0.56, 0.35, 0.65]],
  ['近水', [0.68, 0.80, 0.35, 0.65]],
]
// 原图取样用同一组相对区（图片左右各裁 5%，取 0.35~0.65 落在安全区）
const REGIONS_SRC = REGIONS.map(([n, r]) => [n, r])

const statsOf = async (b64, mime, regions) => page.evaluate(async ({ b64, mime, regions }) => {
  const im = new Image()
  im.src = `data:${mime};base64,` + b64
  await im.decode()
  const c = document.createElement('canvas')
  c.width = im.naturalWidth; c.height = im.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(im, 0, 0)
  return regions.map(([, [y0, y1, x0, x1]]) => {
    const x = Math.round(x0 * c.width), w = Math.max(1, Math.round((x1 - x0) * c.width))
    const y = Math.round(y0 * c.height), h = Math.max(1, Math.round((y1 - y0) * c.height))
    const d = ctx.getImageData(x, y, w, h).data
    let l = 0, ch = 0, n = 0
    for (let i = 0; i < d.length; i += 4) {
      l += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255
      ch += (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])) / 255
      n++
    }
    return { mean: l / n, chroma: ch / n }
  })
}, { b64, mime, regions })

const HIDE = [
  '[data-testid="harbor-arrival-plate"]',
  '[data-testid="harbor-services"]',
  '[data-testid="harbor-quay"]',
  '[data-testid="harbor-back-to-chart"]',
  '[data-testid="harbor-gulls"]',
  'header', 'footer',
]

const SAMPLES = [21, 1, 12, 6, 10, 18]
const net = []
for (const id of SAMPLES) {
  if (!await enterHarbor(id)) { console.log(`    #${id} 进不去，跳过`); continue }
  const src = await page.evaluate(() => document.querySelector('[data-testid="harbor-backdrop"]').getAttribute('src'))
  const b64shot = await (async () => {
    await page.evaluate((sels) => {
      for (const s of sels) document.querySelectorAll(s).forEach(el => { el.dataset.prevDisplay = el.style.display; el.style.display = 'none' })
    }, HIDE)
    const buf = await page.screenshot()
    await page.evaluate((sels) => {
      for (const s of sels) document.querySelectorAll(s).forEach(el => {
        el.style.display = el.dataset.prevDisplay ?? ''
        delete el.dataset.prevDisplay
      })
    }, HIDE)
    return buf.toString('base64')
  })()

  // 原图：页面里 fetch 同一张图（同源），喂给 canvas
  const srcB64 = await page.evaluate(async (url) => {
    const r = await fetch(url)
    const b = await r.arrayBuffer()
    let s = ''
    const u = new Uint8Array(b)
    for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192))
    return btoa(s)
  }, src)

  const a = await statsOf(srcB64, 'image/webp', REGIONS_SRC)
  const b = await statsOf(b64shot, 'image/png', REGIONS_SRC)
  const keep = REGIONS.map(([n], i) => ({ n, l: b[i].mean / a[i].mean, c: b[i].chroma / Math.max(1e-6, a[i].chroma) }))
  net.push({ id, src: src.split('/').pop(), keep })
  console.log(`    #${id} ${src.split('/').pop().padEnd(24)} ` +
    keep.map(k => `${k.n} 亮度${(k.l * 100).toFixed(0)}%/彩度${(k.c * 100).toFixed(0)}%`).join('  '))
  await exitHarbor()
}

const skyOk = net.filter(r => r.keep[0].l >= 0.55)
check(skyOk.length === net.length, `天空亮度保留 ≥55%（最低 ${(Math.min(...net.map(r => r.keep[0].l)) * 100).toFixed(0)}%）`)
const midOk = net.filter(r => r.keep[1].l >= 0.65)
check(midOk.length === net.length, `中景亮度保留 ≥65%（最低 ${(Math.min(...net.map(r => r.keep[1].l)) * 100).toFixed(0)}%）`)
const chromaOk = net.filter(r => r.keep[1].c >= 0.60)
check(chromaOk.length === net.length, `中景彩度保留 ≥60%（最低 ${(Math.min(...net.map(r => r.keep[1].c)) * 100).toFixed(0)}%）`)
const waterOk = net.filter(r => r.keep[2].l >= 0.42)
check(waterOk.length === net.length, `近水亮度保留 ≥42%（最低 ${(Math.min(...net.map(r => r.keep[2].l)) * 100).toFixed(0)}%）`)

/* ── 3. 结构判据：压暗层不许"叠三层" ──────────────────────────────── */
// 亮度比值会被单层大 opacity 拉回及格线，所以再守一条结构：
// 整屏级（inset-0、非天候）的黑色叠加层，累积 alpha 不得超过 1.0。
await enterHarbor(1)
const stack = await page.evaluate(() => {
  const view = document.querySelector('[data-testid="harbor-view"]')
  const LAYERS = ['harbor-vignette-band', 'harbor-vignette-edge', 'harbor-night-veil', 'harbor-dusk-warm', 'harbor-dusk-glow']
  let alpha = 0
  const detail = []
  for (const t of LAYERS) {
    const el = document.querySelector(`[data-testid="${t}"]`)
    if (!el) continue
    const op = +getComputedStyle(el).opacity
    const bg = getComputedStyle(el).backgroundImage
    // 取渐变里最重的那个 rgba 的 alpha 作为"这一层最暗处"
    const alphas = [...bg.matchAll(/rgba?\([^)]*?([\d.]+)\)/g)].map(m => +m[1]).filter(v => v <= 1)
    const peak = alphas.length ? Math.max(...alphas) : 0
    if (op > 0.01) { alpha += op * peak; detail.push(`${t}@${op.toFixed(2)}×${peak.toFixed(2)}`) }
  }
  return { alpha: +alpha.toFixed(2), detail, hasView: !!view }
})
check(stack.hasView, '岸上视图在（结构判据的取样前提）')
/*
 * 先确认"真的量到了层"。
 * 旧实现没有这两个 testid，alpha 会算成 0 —— 空集合恒真，这条断言就成了
 * 永远绿的死判据（把旧代码跑一遍时它确实"通过"了）。所以层数单独守一条。
 */
check(stack.detail.length > 0,
  `找得到整屏压暗层（${stack.detail.join(' ') || '一个都没有——判据过期了，别当成通过'}）`)
check(stack.alpha <= 1.0,
  `白天压暗层累积 alpha ≤1.0（现 ${stack.alpha}：${stack.detail.join(' ') || '无'}）`)
await exitHarbor()

check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail ? 1 : 0)
