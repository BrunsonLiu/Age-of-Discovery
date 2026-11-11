// 2D 海图「商船尾迹」（回归）
//
// 【守什么】尾迹是"这艘船从哪儿来"的唯一线索，三件事必须真：
//  ① **长在航迹上**：折线最后一点必须就在商船图标中心（同一个 positionAtNm），
//     不是另外画一条装饰线；
//  ② **会随船走**：它的 `d` 必须随时间变化（船在动，尾迹就得跟着动）；
//  ③ **不许把帧率吃掉**：逐帧 `setLatLngs` 会让 SVG 每帧重绘 —— 实测世界缩放
//     60.3 → **27.4 fps**（把尾迹 display:none 立刻回 60.3）。节流到"屏幕上
//     移动 ≥2px 才重画"之后回到 60。这条判据就是那道闸。
//
// 跑法：先起 dev server，再 `node test/e2e/npc-wake.mjs`
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const page = await (await browser.createBrowserContext()).newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (/favicon|AudioContext|net::ERR_/.test(t)) return
  errors.push('CONSOLE: ' + t.slice(0, 160))
})
await page.setViewport({ width: 1440, height: 900 })

let pass = 0
let fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) }
}

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2400)
await page.evaluate(() => {
  window.__gameStore.setState({ gamePhase: 'playing', currentEvent: null })
  window.__mapStore.setState({ viewMode: 'chart' })
})
await sleep(1200)
await page.evaluate(() => {
  document.querySelectorAll('div.fixed.inset-0').forEach((d) => {
    if (/跳过致辞/.test(d.textContent || '')) d.style.display = 'none'
  })
  document.querySelectorAll('[role=dialog]').forEach((d) => { d.style.display = 'none' })
})
await sleep(2000)
// 缩一级：商船航线在大西洋，默认视野里未必有船（尾迹的点会被裁成空）
await page.mouse.move(700, 430)
await page.mouse.wheel({ deltaY: 300 })
await sleep(900)
await sleep(2200)

/** 尾迹 path 与商船图标的屏幕位置 */
const read = () => page.evaluate(() => {
  const wakes = [...document.querySelectorAll('path[stroke="#eaf5fb"]')]
  const ships = [...document.querySelectorAll('.npc-ship-icon')].map((el) => {
    const b = el.getBoundingClientRect()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  })
  const ends = wakes.map((p) => {
    let pt = null
    try {
      const q = p.getPointAtLength(p.getTotalLength())
      const m = p.getScreenCTM()
      const s = new DOMPoint(q.x, q.y).matrixTransform(m)
      pt = { x: s.x, y: s.y }
    } catch { pt = null }
    return { pt, d: (p.getAttribute('d') || '').slice(0, 40), len: p.getAttribute('d')?.length ?? 0 }
  })
  return { wakes: ends, ships }
})

const a = await read()
check(a.wakes.length > 0, `尾迹画出来了（${a.wakes.length} 条）`)
check(a.ships.length > 0, `商船在场（${a.ships.length} 艘）`)
check(a.wakes.length === a.ships.length, `每条商船一条尾迹（${a.wakes.length} 条 / ${a.ships.length} 艘）`)

// ① 尾迹的末端就在船身上
let attached = 0
for (const w of a.wakes) {
  if (!w.pt) continue
  const near = a.ships.some((s) => Math.hypot(s.x - w.pt.x, s.y - w.pt.y) < 8)
  if (near) attached++
}
check(attached === a.wakes.length,
  `每条尾迹的末端都贴在一条商船上（${attached}/${a.wakes.length}；阈值 8px）`)

// ② 会随船走
const before = a.wakes.map((w) => w.d)
await sleep(2200)
const b = await read()
const after = b.wakes.map((w) => w.d)
check(JSON.stringify(before) !== JSON.stringify(after),
  '尾迹随时间移动（两根时刻的路径不同）')
check(b.wakes.every((w) => w.len > 8), `每条尾迹都有实质长度（最短 d 长度 ${Math.min(...b.wakes.map((w) => w.len))}）`)

// ③ 帧率（节流是否真的生效）
const fps = await page.evaluate(async () => {
  const t0 = performance.now()
  let n = 0
  await new Promise((res) => {
    const tick = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(tick); else res() }
    requestAnimationFrame(tick)
  })
  return n / ((performance.now() - t0) / 1000)
})
check(fps > 40, `世界缩放下不掉帧（实测 ${fps.toFixed(1)} fps；逐帧重画时是 27.4）`)

// 【别写恒真式】第一版是 `pe === 'none' || pe === 'auto' ? true : true` ——
// 两边都是 true，等于没判。真正的依据是 Leaflet 的类：只有带
// `leaflet-interactive` 的 path 才接收指针事件。
const cls = await page.evaluate(() => document.querySelector('path[stroke="#eaf5fb"]')?.getAttribute('class') || '')
check(!cls.includes('leaflet-interactive'), `尾迹不吃点击（class="${cls}"）`)

console.log(`\n报错：${errors.length ? errors.join(' | ') : '无'}`)
check(errors.length === 0, '无页面报错')
console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
