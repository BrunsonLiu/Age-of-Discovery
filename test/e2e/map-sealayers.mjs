// 2D 海图「洋流 / 风箭头不许压到陆地上」（回归）
//
// 【守什么】这两个图层是按经纬度摆的，不看陆地：
//   · 风箭头按 15° 网格撒 135 个点，实测 **48 个落在陆地上**；
//   · 4 条洋流的节点直接在内陆（加那利/阿古拉斯/南赤道/季风漂流），
//     画出来是"洋流穿过撒哈拉、南非、马达加斯加、印度"。
//
// 正确的判据（每条洋流、每个箭头逐点查陆地）在单测里做——那是权威，
// 因为它用真实 geojson 逐 0.25° 加密查 `isOnLand`。
// 这个 e2e 守的是**接线**：
//  ① 图上真的只剩过滤后的 87 个箭头（网格 135 − 陆地 48）；
//  ② 洋流数据干净 ⇒ 7 条洋流各一段（护栏不该切任何一条）；
//  ③ 两个开关互不牵连：关掉风图层，箭头消失、洋流还在。
//
// 跑法：先起 dev server，再 `node test/e2e/map-sealayers.mjs`
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 网格总点数（lat -60..60 × lng -100..120，步长 15）与实测落在陆地上的个数 */
const GRID_TOTAL = 135
const GRID_ON_LAND = 48

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
  window.__mapStore.setState({ viewMode: 'chart', showWindOverlay: true, showCurrentOverlay: true })
})
await sleep(1200)
await page.evaluate(() => {
  document.querySelectorAll('div.fixed.inset-0').forEach((d) => {
    if (/跳过致辞/.test(d.textContent || '')) d.style.display = 'none'
  })
  document.querySelectorAll('[role=dialog]').forEach((d) => { d.style.display = 'none' })
})
await sleep(2200)

const read = () => page.evaluate(() => {
  const arrows = document.querySelectorAll('.wind-arrow-icon').length
  const bandPane = document.querySelector('.leaflet-windband-pane')
  const bandPaths = bandPane ? bandPane.querySelectorAll('path').length : 0
  const cur = [...document.querySelectorAll('.leaflet-overlay-pane path')].filter((p) => {
    const dash = p.getAttribute('stroke-dasharray') || ''
    const stroke = (p.getAttribute('stroke') || '').toLowerCase()
    return dash === '1 10' && (stroke === '#d4784a' || stroke === '#5a8ab5')
  })
  return {
    arrows,
    curN: cur.length,
    bandPaths,
    bandZ: bandPane ? Number(getComputedStyle(bandPane).zIndex) : null,
    bandPE: bandPane ? getComputedStyle(bandPane).pointerEvents : null,
    interactive: cur.filter((p) => (p.getAttribute('class') || '').includes('leaflet-interactive')).length,
  }
})

const a = await read()
// ① 风箭头：网格 135 个 → 过滤掉 48 个陆地点 → 87
check(a.arrows === GRID_TOTAL - GRID_ON_LAND,
  `风箭头只剩海面上的 ${GRID_TOTAL - GRID_ON_LAND} 个（实测 ${a.arrows}；未过滤时是 ${GRID_TOTAL} 个）`)
check(a.arrows < GRID_TOTAL - 10, `确实过滤掉了十几个以上（${GRID_TOTAL} → ${a.arrows}）`)
// ② 洋流：数据干净 → 每条一段，共 7 条
check(a.curN === 7, `7 条洋流各一段（实测 ${a.curN} 段；数据穿陆时会被护栏切成更多段）`)
check(a.interactive === 0, '洋流不吃点击')

// ③ 风带虚线必须在陆地**之下**（否则一条青色虚线横穿撒哈拉）
check(a.bandPaths >= 2, `风带虚线画出来了（${a.bandPaths} 条）`)
check(a.bandZ === 330, `风带虚线在自建 pane、z=330（陆地填充是 400）—— 实测 ${a.bandZ}`)
check(a.bandPE === 'none', `风带 pane 不吃指针（${a.bandPE}）`)

// ④ 开关互不牵连
await page.evaluate(() => window.__mapStore.setState({ showWindOverlay: false }))
await sleep(900)
const b = await read()
check(b.arrows === 0, `关掉风图层后箭头消失（${b.arrows} 个）`)
check(b.curN === a.curN, `关风图层不影响洋流（${a.curN} → ${b.curN} 段）`)

await page.evaluate(() => window.__mapStore.setState({ showCurrentOverlay: false }))
await sleep(900)
const c = await read()
check(c.curN === 0, `关掉洋流图层后洋流消失（${c.curN} 段）`)

await page.evaluate(() => window.__mapStore.setState({ showWindOverlay: true, showCurrentOverlay: true }))
await sleep(900)
const d = await read()
check(d.arrows === a.arrows && d.curN === a.curN, `两个开关都能开回来（${d.arrows} 箭头 / ${d.curN} 段洋流）`)

console.log(`\n报错：${errors.length ? errors.join(' | ') : '无'}`)
check(errors.length === 0, '无页面报错')
console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
