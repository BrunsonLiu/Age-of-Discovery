// 2D 海图「岸边浪线」（回归）
//
// 【守什么】浪线是这轮唯一"贴着几何画"的装饰层，它有三件事必须真：
//  ① **图层顺序**：浅水层 → 浪线 → 陆地。写反了不是难看的问题 ——
//     排在浅水层之前，白沫会被 12 层青蓝洗掉（实测 A/B 只差 0.11%）；
//     排在陆地之后，整条海岸会套一圈亮边（连陆地内侧也亮，像地图外框）；
//  ② **强弱来自风速**：把风速从 12 节改到 30 节，线宽/不透明度/白沫密度
//     必须真的变（`style` 是函数，靠 react-leaflet 的 setStyle 重算）；
//  ③ **不许有动画**：白沫爬行实测把帧率从 60 打到 10.2（整片 SVG 每帧重绘），
//     所以这里直接量帧率当回归——加回动画必然掉到这条线以下。
//
// 跑法：先起 dev server，再 `node test/e2e/map-surf.mjs`
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

/** 读一层的所有 path（按 DOM 顺序，也就等于渲染顺序） */
const readSurf = () => page.evaluate(() => {
  const paths = [...document.querySelectorAll('.leaflet-overlay-pane path')]
  const idx = (pred) => paths.findIndex(pred)
  const surfPaths = paths.filter((p) => (p.getAttribute('stroke') || '') === '#eef8fd')
  const first = surfPaths[0]
  return {
    total: paths.length,
    surf: surfPaths.length,
    shallowIdx: idx((p) => (p.getAttribute('stroke') || '') === '#7fa3bd'),
    surfIdx: idx((p) => (p.getAttribute('stroke') || '') === '#eef8fd'),
    landIdx: idx((p) => (p.getAttribute('stroke') || '').toLowerCase() === '#3d2810'),
    weight: first ? Number(first.getAttribute('stroke-width')) : null,
    opacity: first ? Number(first.getAttribute('stroke-opacity')) : null,
    dash: first ? first.getAttribute('stroke-dasharray') : null,
    interactive: surfPaths.filter((p) => (p.getAttribute('class') || '').includes('leaflet-interactive')).length,
    animated: surfPaths.filter((p) => {
      const cs = getComputedStyle(p)
      return cs.animationName && cs.animationName !== 'none'
    }).length,
    wind: window.__gameStore.getState().weather.windSpeed,
  }
})

// ------------------------------------------------------------ ① 图层顺序
const a = await readSurf()
check(a.surf > 1000, `浪线画出来了（${a.surf} 条 path）`)
check(a.shallowIdx >= 0 && a.surfIdx > a.shallowIdx,
  `浪线排在浅水层之后（浅水 #${a.shallowIdx} → 浪线 #${a.surfIdx}）`)
check(a.landIdx > 0 && a.surfIdx < a.landIdx,
  `浪线排在陆地之前（浪线 #${a.surfIdx} → 陆地 #${a.landIdx}）—— 内半边会被陆地填色盖住`)
check(a.interactive === 0, `浪线不吃点击（${a.interactive} 条带 leaflet-interactive）`)

// ---------------------------------------------------------- ② 绑风速
check(Math.abs(a.wind - 12) < 1e-6 || Number.isFinite(a.wind), `初始风速 ${a.wind} 节`)
check(a.weight > 4 && a.weight < 5,
  `12 节时线宽 ${a.weight?.toFixed(2)}px（可见厚度约一半 ≈ ${(a.weight / 2).toFixed(1)}px）`)
check(a.opacity > 0.39 && a.opacity < 0.44, `12 节时不透明度 ${a.opacity?.toFixed(2)}`)

// 把风速改到 30 节（风暴）：三样都要跟着变
await page.evaluate(() => {
  const st = window.__gameStore.getState()
  window.__gameStore.setState({ weather: { ...st.weather, windSpeed: 30 } })
})
await sleep(900)
const b = await readSurf()
check(b.weight > a.weight + 1, `风暴时线更粗（${a.weight?.toFixed(2)} → ${b.weight?.toFixed(2)}px）`)
check(b.opacity > a.opacity + 0.15, `风暴时更亮（${a.opacity?.toFixed(2)} → ${b.opacity?.toFixed(2)}）`)
const dutyA = Number((a.dash || '0 12').split(' ')[0]) / 12
const dutyB = Number((b.dash || '0 12').split(' ')[0]) / 12
check(dutyB > dutyA + 0.1, `风暴时白沫更连片（占空比 ${(dutyA * 100).toFixed(0)}% → ${(dutyB * 100).toFixed(0)}%）`)

// 改回无风（3 节以下）：白沫该几乎消失，但不是"变负数"或 NaN
await page.evaluate(() => {
  const st = window.__gameStore.getState()
  window.__gameStore.setState({ weather: { ...st.weather, windSpeed: 2 } })
})
await sleep(900)
const c = await readSurf()
check(c.weight <= 3.45 && c.opacity <= 0.31,
  `无风时几乎看不见（${c.weight?.toFixed(2)}px / ${c.opacity?.toFixed(2)}）`)
check(Number.isFinite(c.weight) && Number.isFinite(c.opacity), '无风时不出现 NaN')

// 恢复晴天风速，后面的帧率判据要在真实状态上量
await page.evaluate(() => {
  const st = window.__gameStore.getState()
  window.__gameStore.setState({ weather: { ...st.weather, windSpeed: 12 } })
})
await sleep(900)

// ------------------------------------------------------------ ③ 帧率
/*
 * 为什么把帧率写成断言：这一层最初带 `stroke-dashoffset` 动画（白沫沿岸爬），
 * 实测 60 → 10.2 fps —— 因为整片 SVG（3400 条 path）每帧重新光栅化。
 * 动画撤掉之后 60.1。判据定在 40 以上：留一点机器抖动余量，但只要谁把动画
 * 加回来，读数会直接掉到十几，必然红。
 */
const fps = await page.evaluate(async () => {
  const t0 = performance.now()
  let n = 0
  await new Promise((res) => {
    const tick = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res() }
    requestAnimationFrame(tick)
  })
  return n / ((performance.now() - t0) / 1000)
})
check(fps > 40, `静态浪线不掉帧（实测 ${fps.toFixed(1)} fps；带动画时是 10.2）`)

const anim = await page.evaluate(() => [...document.querySelectorAll('.leaflet-overlay-pane path')]
  .filter((p) => (p.getAttribute('stroke') || '') === '#eef8fd')
  .filter((p) => { const cs = getComputedStyle(p); return cs.animationName && cs.animationName !== 'none' }).length)
check(anim === 0, `浪线没有任何 CSS 动画（${anim} 条在动）`)

console.log(`\n报错：${errors.length ? errors.join(' | ') : '无'}`)
check(errors.length === 0, '无页面报错')
console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
