// 2D 海图「经纬网 + 边缘度数」（回归）
//
// 【守什么】经纬网是玩家**报坐标**与**判断风带**的唯一依据。四件事必须真：
//  ① 度数真的落在海图上：既不被顶部木梁/底栏压住，也不跑到画面外；
//  ② 度数的大小顺序与屏幕方向一致（北在上：45°N 的 y 必须小于 20°N）；
//  ③ **网格线与风带分界重合**：30°N 那条线必须和图层里的风带虚线落在同一行
//     —— 这两个数是两条独立算出来的（网格按纬度投影、风带按 `WIND_BAND_LATS`），
//     对不上就说明有一边在说谎；
//  ④ 步长跟着缩放走：放大之后每秒的度数必须变密（写死步长会在这里露馅）。
//
// 跑法：先起 dev server，再 `node test/e2e/map-grid.mjs`
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
// 开场致辞与引导会盖住海图，先收掉
await page.evaluate(() => {
  document.querySelectorAll('div.fixed.inset-0').forEach((d) => {
    if (/跳过致辞/.test(d.textContent || '')) d.style.display = 'none'
  })
  document.querySelectorAll('[role=dialog]').forEach((d) => { d.style.display = 'none' })
})
await sleep(1800)

/** 读出所有度数标签：文字 + 屏幕矩形（标签容器是 0 尺寸，必须量内部 span） */
const readLabels = () => page.evaluate(() => {
  const out = []
  document.querySelectorAll('.grat-label').forEach((el) => {
    const s = el.querySelector('span')
    if (!s) return
    const b = s.getBoundingClientRect()
    out.push({
      t: (s.textContent || '').trim(),
      x: b.x + b.width / 2,
      y: b.y + b.height / 2,
      w: b.width,
      h: b.height,
      pe: getComputedStyle(el).pointerEvents,
    })
  })
  const map = document.querySelector('.leaflet-container')
  const mr = map.getBoundingClientRect()
  return { labels: out, map: { x: mr.x, y: mr.y, w: mr.width, h: mr.height } }
})

/**
 * 等画面稳定后再读：Leaflet 的缩放是 CSS transform 动画，动画途中
 * `getBoundingClientRect()` 拿到的是**被缩放过**的坐标（实测同一帧量出 58.5px/2°，
 * 终值是 116px）—— 直接判会得到"放大之后线反而更密"这种假红。
 * 这里要求连续两次读数完全一致（标签的度数 + 取整后的 y 都相同）才认。
 */
const readStable = async () => {
  let prev = null
  for (let i = 0; i < 15; i++) {
    const s = await readLabels()
    const sig = s.labels
      .map((l) => `${l.t}@${Math.round(l.y)}`)
      .sort()
      .join(',')
    if (sig === prev && s.labels.length) return s
    prev = sig
    await sleep(400)
  }
  return readLabels()
}

/** 把 "30°N" / "45°W" / "赤道" / "0°" 解析成 { kind, deg } */
const parse = (t) => {
  if (t === '赤道') return { kind: 'lat', deg: 0 }
  /*
   * 高缩放级会写「35°24′N」（分刻度）。这里必须一起解析，否则
   * "每个标签都能解析"会在放大之后假红。
   */
  const m = /^(\d+)°(?:(\d{2})′)?([NSEW])?$/.exec(t)
  if (!m) return null
  const deg = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0)
  const d = m[3]
  if (d === 'N') return { kind: 'lat', deg }
  if (d === 'S') return { kind: 'lat', deg: -deg }
  if (d === 'E') return { kind: 'lng', deg }
  if (d === 'W') return { kind: 'lng', deg: -deg }
  return { kind: 'lng', deg: 0 }
}

// ---------------------------------------------------------------- ① 基本在场
const s1 = await readStable()
const parsed = s1.labels.map((l) => ({ ...l, p: parse(l.t) })).filter((l) => l.p)
const lats = parsed.filter((l) => l.p.kind === 'lat').sort((a, b) => b.p.deg - a.p.deg)
const lngs = parsed.filter((l) => l.p.kind === 'lng').sort((a, b) => a.p.deg - b.p.deg)
const raw = s1.labels.map((l) => l.t).join(' | ')
check(lats.length >= 3, `左侧有纬度度数（${lats.length} 个：${lats.map((l) => l.t).join(' ')}）`)
check(lngs.length >= 3, `底部有经度度数（${lngs.length} 个：${lngs.map((l) => l.t).join(' ')}）`)
check(parsed.length === s1.labels.length, `每个标签都能解析（${s1.labels.length} 个：${raw}）`)
check(parsed.every((l) => l.w > 10 && l.h >= 10),
  `标签都真的渲染出了字（最窄 ${Math.min(...parsed.map((l) => l.w)).toFixed(0)}px 宽）`)

// ------------------------------------------------- ② 不出画面、不被木梁压住
// 顶部木梁 0..48、底栏 849..900、左侧按钮列 0..92（实测，见 Graticule 注释）
const mr = s1.map
check(parsed.every((l) => l.x > 92 && l.x < mr.w - 4),
  `所有度数都在左右按钮列之间（x∈[${Math.min(...parsed.map((l) => Math.round(l.x)))}..${Math.max(...parsed.map((l) => Math.round(l.x)))}]）`)
check(lats.every((l) => l.y > 48 && l.y < 845),
  `纬度度数没被顶部木梁/底栏压住（y∈[${Math.min(...lats.map((l) => Math.round(l.y)))}..${Math.max(...lats.map((l) => Math.round(l.y)))}]）`)
check(lngs.every((l) => l.y > 60 && l.y < 845),
  `经度度数在底栏上方（y=${Math.round(lngs[0].y)}，底栏 849 起）`)

// ------------------------------------------------------------ ③ 方向与顺序
let yOrder = true
for (let i = 1; i < lats.length; i++) if (lats[i].y <= lats[i - 1].y) yOrder = false
check(yOrder, `纬度越大 y 越小（${lats.map((l) => `${l.t}@${Math.round(l.y)}`).join(' ')}）`)
let xOrder = true
for (let i = 1; i < lngs.length; i++) if (lngs[i].x <= lngs[i - 1].x) xOrder = false
check(xOrder, `经度越大 x 越大（${lngs.map((l) => `${l.t}@${Math.round(l.x)}`).join(' ')}）`)

/*
 * 【间距本身**不是**常数】墨卡托按 sec φ 纵向拉伸，纬度每度的像素随 |φ| 增大
 * （实测同一屏里 45°N 一带 30.8px/度、20°N 一带 24.6px/度）。所以不能判"间距相等"，
 * 要判更本质的一条：**spacing × cos(φ) 必须是常数**（= 赤道处每度像素）。
 * 这条同时验证了两件事——线的位置真的来自投影、而不是按纬度线性插值出来的。
 */
const lineGaps = []
for (let i = 1; i < lats.length; i++) {
  const dLat = Math.abs(lats[i - 1].p.deg - lats[i].p.deg)
  const dy = Math.abs(lats[i - 1].y - lats[i].y)
  const mid = (lats[i - 1].p.deg + lats[i].p.deg) / 2
  lineGaps.push({ dy, perDeg: dy / dLat, k: (dy / dLat) * Math.cos((mid * Math.PI) / 180) })
}
const kMin = Math.min(...lineGaps.map((g) => g.k))
const kMax = Math.max(...lineGaps.map((g) => g.k))
check(kMax / kMin < 1.05,
  `间距 × cos(纬度) 恒定（${kMin.toFixed(1)}..${kMax.toFixed(1)}px/度，比值 ${(kMax / kMin).toFixed(3)}）—— 线位置来自投影，不是线性插值`)
const gapMin = Math.min(...lineGaps.map((g) => g.dy))
check(gapMin > 60, `相邻纬线间距最小 ${gapMin.toFixed(0)}px 足够放字（否则数字会叠）`)

// ------------------------------------- ④ 网格线与风带分界必须在同一行
// 打开风带图层（30° 纬线虚线），比它和 30°N 那条网格线的 y
const bandY = await page.evaluate(async () => {
  const st = window.__mapStore.getState()
  window.__mapStore.setState({ showWindOverlay: true })
  await new Promise((r) => setTimeout(r, 900))
  /*
   * 风带虚线在**自建 `windband` pane**（z=330，陆地之下）里，不在 overlayPane ——
   * 它原来挂在 overlayPane 会横穿撒哈拉（第 93 轮修掉）。所以这里两个 pane 都查。
   */
  const paths = [
    ...document.querySelectorAll('.leaflet-overlay-pane path'),
    ...document.querySelectorAll('.leaflet-windband-pane path'),
  ]
  // 风带：stroke #3a6b7c、虚线 2 8
  const bands = paths.filter((p) => (p.getAttribute('stroke') || '').toLowerCase() === '#3a6b7c'
    && (p.getAttribute('stroke-dasharray') || '') === '2 8')
  const ys = bands.map((p) => { const b = p.getBoundingClientRect(); return b.y + b.height / 2 })
  window.__mapStore.setState({ showWindOverlay: st.showWindOverlay })
  return ys
})
const l30 = lats.find((l) => l.p.deg === 30)
check(!!l30, `画面里有 30°N 的度数（${l30?.t}）`)
check(bandY.length >= 1, `风带分界画出来了（${bandY.length} 条）`)
/*
 * 取"离 30°N 网格线最近的那条风带"。不能取 min：-30° 那条在画面外，
 * 它的 bounding box 会给出 0，min 就永远是 0（第一版因此报了"网格 559 vs 风带 0"）。
 */
const nearestBand = bandY.length ? bandY.reduce((a, b) => (Math.abs(b - l30.y) < Math.abs(a - l30.y) ? b : a)) : null
check(nearestBand !== null && Math.abs(nearestBand - l30.y) <= 1.5,
  `30°N 网格线与风带分界重合（网格 ${Math.round(l30.y)} vs 风带 ${nearestBand === null ? '—' : Math.round(nearestBand)}）`)

// ------------------------------------------- ⑤ 步长跟着缩放走（放大 → 更密）
// 放大前"每度像素"（用相邻两线里最密的一段，单位是 px/度）
const gapBeforePerDeg = Math.min(...lineGaps.map((g) => g.perDeg))
await page.mouse.move(720, 430)
/*
 * 【为什么要"滚到够密为止"而不是固定滚几下】滚轮一格对应几级缩放由 Leaflet
 * 的滚动逻辑决定，不同 delta 值折算出 1~4 级不等。固定 4 格时实测直接跳到
 * zoom 9（1 度 ≈ 364px，整屏只有 1.2 度）—— 屏上只剩一个纬度数字，
 * 判"至少两个"就假红了。这里逐格滚、每格看一眼，到"屏上有 3 个以上纬线"就停。
 */
let probe = s1
for (let i = 0; i < 9; i++) {
  await page.mouse.wheel({ deltaY: -130 })
  await sleep(700)
  probe = await readLabels()
  const ls = probe.labels.map((l) => ({ ...l, p: parse(l.t) }))
    .filter((l) => l.p && l.p.kind === 'lat').sort((a, b) => b.p.deg - a.p.deg)
  const degs = ls.map((l) => l.p.deg).sort((a, b) => a - b)
  const stepNow = degs.length >= 2
    ? Math.min(...degs.slice(1).map((d, k) => Number((d - degs[k]).toFixed(4)))) : 99
  // 目标：已经在分刻度（< 0.5°）且一屏还有 3 个以上度数
  if (ls.length >= 3 && stepNow < 0.5) break
}
await sleep(600)
const s2 = await readStable()
const lats2 = s2.labels.map((l) => ({ ...l, p: parse(l.t) })).filter((l) => l.p && l.p.kind === 'lat')
  .sort((a, b) => b.p.deg - a.p.deg)
const lngs2 = s2.labels.map((l) => ({ ...l, p: parse(l.t) })).filter((l) => l.p && l.p.kind === 'lng')
check(lats2.length >= 2, `放大后仍有纬度度数（${lats2.map((l) => l.t).join(' ')}）`)
// 每度像素（放大后必须变大）与相邻两线的实际间距（必须仍放得下字）分开算：
// 前者是几何量，后者才是"数字会不会叠"的判据。
const perDeg2 = lats2.length >= 2 ? Math.abs(lats2[0].y - lats2[1].y) / Math.abs(lats2[0].p.deg - lats2[1].p.deg) : 0
const lineGap2 = lats2.length >= 2 ? Math.abs(lats2[0].y - lats2[1].y) : 0
check(perDeg2 > gapBeforePerDeg * 1.5,
  `放大后每度像素变大（${gapBeforePerDeg.toFixed(1)} → ${perDeg2.toFixed(1)}px/度）`)
check(lineGap2 >= 60 && lineGap2 <= 900,
  `相邻纬线间距 ${lineGap2.toFixed(0)}px 仍可读、也没跑到画面外`)
/*
 * 放大后步长必须变细 —— 而且现在会细到**分刻度**（0.5/0.25/0.1°）。
 * 写死 5° 时每格会涨到几百像素、一屏只剩一根线（上一版最小 1°，
 * zoom 10 就是这样：整屏一根纬线）。
 */
const degs2 = lats2.map((l) => l.p.deg).sort((a, b) => a - b)
const steps2 = degs2.slice(1).map((d, i) => Number((d - degs2[i]).toFixed(4)))
const step2 = steps2.length ? Math.min(...steps2) : 0
check(step2 > 0 && step2 < 5, `放大后网格步长变细到 ${step2}°（写死 5° 会在这里红）`)
const minuteLabels = lats2.filter((l) => l.t.includes('′'))
check(step2 < 1 ? minuteLabels.length >= 1 : true,
  step2 < 1 ? `分刻度的度数写成「分」（${minuteLabels.map((l) => l.t).join(' ')}）` : '本级别还是整度（不需要分）')
check(lats2.length >= 3, `放大后一屏仍有 ${lats2.length} 个纬度度数（不会只剩一个）`)
check(lngs2.length >= 1, `放大后仍有经度度数（${lngs2.map((l) => l.t).join(' ')}）`)

// ------------------------------------------------------ ⑥ 不吃点击（装饰层）
const pe = await page.evaluate(() => {
  const grid = document.querySelector('.leaflet-graticule-pane')
  const lbl = document.querySelector('.leaflet-graticuleLabels-pane')
  const lab = document.querySelector('.grat-label')
  return {
    grid: grid ? getComputedStyle(grid).pointerEvents : null,
    lbl: lbl ? getComputedStyle(lbl).pointerEvents : null,
    lab: lab ? getComputedStyle(lab).pointerEvents : null,
    gridZ: grid ? getComputedStyle(grid).zIndex : null,
    lblZ: lbl ? getComputedStyle(lbl).zIndex : null,
  }
})
check(pe.grid === 'none' && pe.lbl === 'none', `两个 pane 都不吃指针（网线 ${pe.grid} / 度数 ${pe.lbl}）`)
check(pe.lab === 'none', `度数本身也不吃指针（${pe.lab}）`)
check(pe.gridZ === '340' && pe.lblZ === '520',
  `层级：网线 340（陆地以下）/ 度数 520（陆地以上、港口 600 以下）—— 实测 ${pe.gridZ} / ${pe.lblZ}`)

console.log(`\n报错：${errors.length ? errors.join(' | ') : '无'}`)
check(errors.length === 0, '无页面报错')
console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
