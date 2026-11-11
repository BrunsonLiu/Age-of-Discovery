// 2D 海图「光标读数」（回归）
//
// 【守什么】读数框是玩家报坐标用的工具，三件事必须真：
//  ① 指到网格线的交叉点，读数就是那两条线的值（差不超过 0.12° ≈ 7′，
//     即标签文字中心与线本身的那两三个像素）；
//  ② 气候带跟着纬度变，而且**翻转的位置就是回归线**（用二分法夹出来，
//     与 23°26′ 在 20°N/25°N 之间的比例对账）；
//  ③ 贴边翻到光标另一侧、不吃点击、不重复创建节点、鼠标离开就藏。
//
// 跑法：先起 dev server（5174），再 `node test/e2e/map-cursor.mjs`
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
await sleep(1800)

/** 网格度数标签（用来对账） */
const readGrid = () => page.evaluate(() => {
  const out = []
  document.querySelectorAll('.grat-label span').forEach((s) => {
    const b = s.getBoundingClientRect()
    out.push({ t: s.textContent.trim(), x: b.x + b.width / 2, y: b.y + b.height / 2 })
  })
  return out
})

/** 光标读数框的当前状态 */
const readPill = () => page.evaluate(() => {
  const p = document.querySelector('[data-testid=cursor-readout]')
  const c = document.querySelector('[data-testid=cursor-cross]')
  if (!p) return null
  const b = p.getBoundingClientRect()
  const cb = c ? c.getBoundingClientRect() : null
  const cs = getComputedStyle(p)
  return {
    text: (p.textContent || '').trim(),
    zone: p.dataset.zone || '',
    flip: p.dataset.flip || '',
    x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom,
    opacity: Number(cs.opacity), pe: cs.pointerEvents, fs: parseFloat(cs.fontSize),
    crossX: cb ? cb.x : null, crossY: cb ? cb.y : null, crossOp: c ? Number(getComputedStyle(c).opacity) : null,
    nodes: document.querySelectorAll('[data-testid=cursor-readout]').length,
  }
})

const hover = async (x, y) => { await page.mouse.move(x, y); await sleep(220); return readPill() }

/** "30°N" / "29°57′N" / "10°W" / "0°" → { kind, deg } */
const parse = (t) => {
  if (t === '赤道') return { kind: 'lat', deg: 0 }
  const m = /^(\d+)°(?:(\d{2})′)?([NSEW])?$/.exec(t)
  if (!m) return null
  const deg = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0)
  if (m[3] === 'S') return { kind: 'lat', deg: -deg }
  if (m[3] === 'W') return { kind: 'lng', deg: -deg }
  return { kind: m[3] === 'N' ? 'lat' : 'lng', deg }
}

const grid = await readGrid()
const lats = grid.map((g) => ({ ...g, p: parse(g.t) })).filter((g) => g.p && g.p.kind === 'lat')
const lngs = grid.map((g) => ({ ...g, p: parse(g.t) })).filter((g) => g.p && g.p.kind === 'lng')
check(lats.length >= 2 && lngs.length >= 2, `网格有度数可对账（纬 ${lats.length} / 经 ${lngs.length}）`)

// ------------------------------------------------ ① 指到交叉点，读数就是它
const gLat = lats.find((l) => l.t === '30°N') ?? lats[Math.floor(lats.length / 2)]
const gLng = lngs.find((l) => l.t === '10°W') ?? lngs[Math.floor(lngs.length / 2)]
const A = await hover(gLng.x, gLat.y)
check(!!A && A.opacity === 1, `读数框出现了（opacity=${A?.opacity}）`)
check(!!A && A.text.length > 0, `读数有字（「${A?.text}」）`)
const pa = A ? A.text.split(' · ')[0] : ''
const mA = /^(\d+°(?:\d{2}′)?[NS])\s+(\d+°(?:\d{2}′)?[EW])$/.exec(pa)
check(!!mA, `读数写成「度分 + 南北东西」（${pa}）`)
if (mA) {
  const dLat = parse(mA[1]).deg
  const dLng = parse(mA[2]).deg
  check(Math.abs(dLat - gLat.p.deg) <= 0.12,
    `指在 ${gLat.t} 的线上 → 读数 ${mA[1]}（差 ${Math.abs(dLat - gLat.p.deg).toFixed(3)}° ≤ 0.12°）`)
  check(Math.abs(dLng - gLng.p.deg) <= 0.12,
    `指在 ${gLng.t} 的线上 → 读数 ${mA[2]}（差 ${Math.abs(dLng - gLng.p.deg).toFixed(3)}° ≤ 0.12°）`)
}
check(A?.zone === '北温带', `30°N 属于北温带（读数：${A?.zone}）`)
check(A?.pe === 'none', `读数框不吃点击（pointer-events=${A?.pe}）`)
check(A !== null && A.fs >= 12, `读数用 ${A?.fs}px（项目下限 12）`)
check(A !== null && A.x > gLng.x && A.y > gLat.y, `默认朝光标右下方摆（框 ${Math.round(A?.x)},${Math.round(A?.y)} vs 光标 ${Math.round(gLng.x)},${Math.round(gLat.y)}）`)
check(A !== null && Math.abs(A.crossX - gLng.x) <= 2 && Math.abs(A.crossY - gLat.y) <= 2 && A.crossOp === 1,
  `十字准星钉在光标上（${Math.round(A?.crossX)},${Math.round(A?.crossY)}）`)
check(A?.nodes === 1, `读数框只有一个节点（${A?.nodes}）`)

// ------------------------------------- ② 气候带翻转的位置就是回归线
const l25 = lats.find((l) => l.t === '25°N')
const l20 = lats.find((l) => l.t === '20°N')
check(!!l25 && !!l20, `画面里有 25°N 与 20°N（${l25?.t} / ${l20?.t}）`)
if (l25 && l20) {
  /*
   * 【为什么要用 x=700 而不是标签自己的 x】纬度度数贴在左边缘（x=100），
   * 而左下角那张「掮客送来一单」卡片的按钮压在那条线上 —— 在 x=100 上量
   * 会读到**上一处的旧读数**（第一版就是这么误红了一条）。x=700 是空海面。
   */
  const probeX = 700
  const z25 = await hover(probeX, l25.y)
  const z20 = await hover(probeX, l20.y)
  check(z25?.zone === '北温带', `25°N → 北温带（${z25?.zone}）`)
  check(z20?.zone === '热带', `20°N → 热带（${z20?.zone}）`)
  /*
   * 二分夹出翻转的那一行像素：热带在上（南）还是北温带在上（北）？
   * 屏幕 y 小的更北 —— 所以 y 从 l25.y（北、北温带）到 l20.y（南、热带）。
   */
  let hi = Math.min(l25.y, l20.y)  // 北温带侧
  let lo = Math.max(l25.y, l20.y)  // 热带侧
  for (let i = 0; i < 6; i++) {
    const midY = (hi + lo) / 2
    const r = await hover(probeX, midY)
    if (r?.zone === '北温带') hi = midY
    else lo = midY
  }
  const flipY = (hi + lo) / 2
  // 23°26′ 在 20°N 与 25°N 之间靠南 31%（(23.4362-20)/5）
  const ratio = (Math.max(l25.y, l20.y) - flipY) / Math.abs(l20.y - l25.y)
  check(Math.abs(ratio - (23.4362 - 20) / 5) < 0.05,
    `气候带翻转落在回归线上：位置比 ${ratio.toFixed(3)} vs 理论 ${((23.4362 - 20) / 5).toFixed(3)}（y=${flipY.toFixed(0)}）`)
  check(flipY > Math.min(l25.y, l20.y) && flipY < Math.max(l25.y, l20.y),
    '翻转确实发生在 20°N 与 25°N 之间（不是别处）')
}

// ------------------------------------------------------ ③ 贴边翻侧
const corner = await hover(1400, 830)
check(corner?.flip.includes('x') && corner.x + corner.w <= 1400,
  `贴右边翻到光标左侧（flip=${corner?.flip}，框右 ${Math.round(corner?.right)} < 光标 1400）`)
check(corner?.flip.includes('y') && corner.bottom <= 900,
  `贴下边翻到光标上方（框底 ${Math.round(corner?.bottom)} < 900）`)
check(corner !== null && corner.x >= 0 && corner.y >= 0 && corner.right <= 1440 && corner.bottom <= 900,
  `翻侧后整个框仍在画面里（${Math.round(corner?.x)},${Math.round(corner?.y)} → ${Math.round(corner?.right)},${Math.round(corner?.bottom)}）`)

// --------------------------------------------- ④ 连续移动不重复造节点
for (let i = 0; i < 40; i++) await page.mouse.move(300 + i * 20, 400 + (i % 7) * 10)
await sleep(200)
const after = await readPill()
check(after !== null && after.nodes === 1, `移动 40 次后仍然只有 1 个读数节点（${after?.nodes}）`)

// ---------------------------- ⑤ 指针落在海图上的浮层里 → 藏起来（不留旧值）
/*
 * 【这条守的是本轮抓到的一个真 bug】左下角「掮客送来一单」卡片的按钮是容器的
 * 子节点，它会截住原生 mousemove 的冒泡 —— Leaflet 的 map.on('mousemove')
 * 收不到，读数就**停在上一处**：探针里在按钮上读到 22°01′N（其实那是卡片
 * 左边的海面）。现在改成容器上的**捕获**监听 + 命中判据：浮层上一律藏。
 * 卡片只在有掮客来单时出现，所以这条是"有条件"的判据（没有卡片就跳过）。
 */
const overCard = await page.evaluate(() => {
  const el = document.elementFromPoint(119, 810)
  const c = document.querySelector('.leaflet-container')
  const inside = el && c && el !== c && c.contains(el) && !el.closest('.leaflet-pane')
  return inside ? (el.tagName + '.' + String(el.className).slice(0, 24)) : null
})
if (overCard) {
  await hover(700, 700)          // 先在海面上留下一个有效读数
  const before = await readPill()
  const off2 = await hover(119, 810)  // 再移到浮层上
  check(before.opacity === 1 && off2.opacity === 0,
    `指针落到海图上的浮层（${overCard}）→ 读数藏起来，不停在旧值（${before.text} → opacity ${off2.opacity}）`)
} else {
  console.log('  · 左下角没有浮层（掮客卡片没出现），跳过这条')
}

// ---------------------------------------------- ⑥ 鼠标离开海图 → 藏起来
await page.mouse.move(720, 880)
await sleep(350)
const off = await readPill()
check(off !== null && off.opacity === 0, `鼠标移到顶栏/底栏上 → 读数隐藏（opacity=${off?.opacity}）`)

console.log(`\n报错：${errors.length ? errors.join(' | ') : '无'}`)
check(errors.length === 0, '无页面报错')
console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
