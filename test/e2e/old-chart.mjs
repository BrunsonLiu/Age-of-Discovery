// 古海图（学者公会 90 档）：海图上标出**近处一处 + 远处一处**未至之地
//
// 【这套要证明的四件事】
//   ① 声望 89 时图上什么都没有，90 时才出现 —— 门槛不是摆设；
//   ② 选择规则真的是"最近的 + 另一条航路上够远的一处"：
//      第一处必须是离船最近的未至之地，两处间距必须 ≥300 海里
//      （否则会标出塞维利亚+加的斯这种相邻港，两个圈与两行字在图上叠成一团）；
//   ③ 它点不到：纸上的墨不是能捡的东西。`elementFromPoint` 命中的不该是它，
//      点下去也不该选中港口（否则玩家会以为那是一处可以直航的地方）；
//   ④ 都是拿真 DOM 读的（data-old-chart-nm + 标签文字），不看内部状态。
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'

let pass = 0
const fails = []
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) }
  else { fails.push(msg); console.log('  ✗ FAIL:', msg) }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
/** 轮询真条件（懒加载块挂上、DOM 写完），不要靠固定 sleep */
const until = async (fn, timeout = 10000, ...args) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn, ...args).catch(() => false)) return true
    await sleep(80)
  }
  return false
}
/** 大圆距离（海里）—— 与 utils/navigation.haversineNm 同一个公式，判据独立重算 */
const nm = (a, b) => {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLon = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)) * 0.539957
}

// swiftshader：最后一节要切到 3D 海图，无头环境需要软件渲染（与 map3d-check 同一套参数）
const browser = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 140)) })
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })

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
  const d = window.__dialogueStore
  for (let i = 0; i < 8 && d?.getState?.().scriptId; i++) d.getState().skip()
})
await sleep(700)

/** 图上现在有几个古海图标记，以及它们的 portId、标签文字、字号 */
const readMarks = () => page.evaluate(() => {
  const els = [...document.querySelectorAll('.old-chart-mark [data-old-chart-nm]')]
  return els.map(e => ({
    id: Number(e.getAttribute('data-old-chart-nm')),
    title: (e.closest('.old-chart-label')?.querySelector('.old-chart-label__t')?.textContent || '').trim(),
    dist: (e.textContent || '').trim(),
    size: parseFloat(getComputedStyle(e).fontSize),
  }))
})

/** 把状态摆到"船停在某个港、已发现哪些港、学者声望多少"；返回港口坐标表 */
const setup = (opts) => page.evaluate(async (o) => {
  const P = await import('/Age-of-Discovery/src/data/ports.ts').catch(() => import('/src/data/ports.ts'))
  const st = window.__gameStore.getState()
  const port = P.ports.find(p => p.id === o.atPortId)
  window.__gameStore.setState({
    factionRep: { ...st.factionRep, scholars: o.scholarsRep },
    discoveredPorts: o.discovered,
    fleet: { ...st.fleet, currentPortId: port.id, isSailing: false, day: st.fleet.day + 1 },
    shipPosition: [port.latitude, port.longitude],
  })
  // 港口表也带回去：判据在页面外算"该标哪两处"，不从源码里抄一份
  return P.ports.map(p => ({ id: p.id, lat: p.latitude, lng: p.longitude }))
}, opts)

const LISBON = 7          // 里斯本：学者港，也是本作欧洲起点
const MIN_APART = 300

/** 规格：第一处 = 离船最近的未至之地；第二处 = 离第一处 ≥300nm 的最近一处 */
const spec = (table, atPortId, discovered) => {
  const ship = table.find(p => p.id === atPortId)
  const cand = table
    .filter(p => !discovered.includes(p.id))
    .map(p => ({ ...p, d: nm(ship, p) }))
    .sort((a, b) => a.d - b.d || a.id - b.id)
  if (!cand.length) return []
  const first = cand[0]
  const far = cand.find(c => nm(first, c) >= MIN_APART)
  return far ? [first.id, far.id] : [first.id]
}

/**
 * 比"标了哪几处"时按**集合**比，不比顺序。
 * Leaflet 的 Marker 在同一个 pane 里按纬度排 DOM，DOM 顺序 ≠ 选出顺序 ——
 * 拿 join(',') 直接比会出现"8,20 vs 20,8"这种假红（实测踩过一次）。
 */
const sameSet = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).join(',') === [...b].sort((x, y) => x - y).join(',')

const allIds = await page.evaluate(async () => {
  const P = await import('/Age-of-Discovery/src/data/ports.ts').catch(() => import('/src/data/ports.ts'))
  return P.ports.map(p => p.id)
})

/* ───────── 1. 门槛 ───────── */
console.log('=== 门槛：89 不标，90 才标 ===')
await setup({ atPortId: LISBON, discovered: [LISBON], scholarsRep: 89 })
await sleep(500)
check((await readMarks()).length === 0, '声望 89：海图上一个古海图标记都没有')

const table = await setup({ atPortId: LISBON, discovered: [LISBON], scholarsRep: 90 })
check(await until(() => document.querySelectorAll('.old-chart-mark [data-old-chart-nm]').length === 2),
  '声望 90：图上出现 2 处标记')
const marks = await readMarks()
check(marks.length === 2, `读到 2 处（实际 ${marks.length}）`)

/* ───────── 2. 选择规则 ───────── */
console.log('=== 选择规则：最近的一处 + 另一条航路上够远的一处 ===')
{
  const want = spec(table, LISBON, [LISBON])
  check(sameSet(marks.map(m => m.id), want),
    `标的是 ${marks.map(m => m.id).join(',')}（应为 ${want.join(',')}）`)
  const g = (id) => table.find(p => p.id === id)
  check(nm(g(marks[0].id), g(marks[1].id)) >= MIN_APART,
    `两处相距 ${Math.round(nm(g(marks[0].id), g(marks[1].id)))} 海里 ≥ ${MIN_APART}（没标成相邻港）`)
  const nearest = table.filter(p => p.id !== LISBON)
    .sort((a, b) => nm(g(LISBON), a) - nm(g(LISBON), b))[0]
  check(marks.some(m => m.id === nearest.id), `离船最近的那座（#${nearest.id}）在图上`)
  check(marks.every(m => m.title === '古海图' && /^\d+ 海里$/.test(m.dist)),
    `标签是两行「古海图 / N 海里」（${marks.map(m => m.title + '|' + m.dist).join('  ·  ')}）`)
  check(marks.every(m => m.size >= 12), `标签字号 ≥12px（${marks.map(m => m.size).join('/')}）`)
}

/* ───────── 3. 去过的港口从图上撤掉 ───────── */
console.log('=== 去过的港口从图上撤掉 ===')
{
  const went = marks[0].id
  await setup({ atPortId: LISBON, discovered: [LISBON, went], scholarsRep: 90 })
  await sleep(500)
  const after = await readMarks()
  check(!after.some(m => m.id === went), `刚发现的那处（#${went}）不再标出来`)
  check(!after.some(m => m.id === LISBON), '出发港自己从来不标')
  const want = spec(table, LISBON, [LISBON, went])
  check(sameSet(after.map(m => m.id), want),
    `剩下的按同一规则重算（${after.map(m => m.id).join(',')} / 应为 ${want.join(',')}）`)
}

/* ───────── 4. 换一片海：标的重算 ───────── */
console.log('=== 船换位置，标的重算 ===')
{
  const before = (await readMarks()).map(m => m.id).join(',')
  const table2 = await setup({ atPortId: 21, discovered: [21], scholarsRep: 90 })   // 广州（大明母港）
  await sleep(600)
  const after = await readMarks()
  const want = spec(table2, 21, [21])
  check(sameSet(after.map(m => m.id), want),
    `到了广州：标的是 ${after.map(m => m.id).join(',')}（应为 ${want.join(',')}）`)
  check(after.map(m => m.id).join(',') !== before,
    `标的随船位变（里斯本时 ${before} → 广州时 ${after.map(m => m.id).join(',')}）`)
}

/* ───────── 5. 点不到：它是纸上的墨 ───────── */
console.log('=== 不可交互 ===')
{
  await setup({ atPortId: LISBON, discovered: [LISBON], scholarsRep: 90 })
  await sleep(600)
  const hit = await page.evaluate(() => {
    const el = document.querySelector('.old-chart-mark')
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const top = document.elementFromPoint(cx, cy)
    return {
      x: cx, y: cy,
      // 命中自己 = 它会挡住下面的海图；正确结果是命中的是别的东西（海图容器）
      self: !!top && (top === el || el.contains(top)),
      hitTag: top?.tagName ?? null,
      pointer: getComputedStyle(el).pointerEvents,
    }
  })
  check(hit?.self === false, `标记中心命中的不是它自己（命中 ${hit?.hitTag}）—— 不挡海图拖拽`)
  check(hit?.pointer === 'none', `pointer-events: none（现 ${hit?.pointer}）`)
  const before = await page.evaluate(() => ({
    panel: window.__gameStore.getState().activePanel,
    selected: window.__mapStore.getState().selectedPortId,
  }))
  await page.mouse.click(hit.x, hit.y)
  await sleep(400)
  const after = await page.evaluate(() => ({
    panel: window.__gameStore.getState().activePanel,
    selected: window.__mapStore.getState().selectedPortId,
  }))
  check(after.panel === before.panel && after.selected === before.selected,
    `点了也不该有任何反应（panel ${before.panel}→${after.panel}，选中 ${before.selected}→${after.selected}）`)
}

/* ───────── 6. 全都去过：图上干净 ───────── */
console.log('=== 走遍世界之后 ===')
{
  await setup({ atPortId: LISBON, discovered: allIds, scholarsRep: 100 })
  await sleep(600)
  check((await readMarks()).length === 0, '21 座都去过了：图上不再有古海图标记')
}

/* ───────── 7. 2.5D 立体海图里也有，但它是 div 不是按钮 ───────── */
console.log('=== 3D 海图：同一段 HTML，但不是按钮 ===')
{
  await setup({ atPortId: LISBON, discovered: [LISBON], scholarsRep: 90 })
  await page.evaluate(() => window.__mapStore.setState({ renderMode: '3d' }))
  const ok3d = await until(
    () => document.querySelectorAll('[data-old-chart-id]').length === 2, 30000)
  check(ok3d, '切到 3D 后图上也有 2 处古海图标注')
  const info = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-old-chart-id]')]
    return els.map(e => ({
      tag: e.tagName,
      pe: getComputedStyle(e).pointerEvents,
      // 与 2D 共用同一段 HTML：圈、点、标签三件都在
      parts: ['.old-chart-ring', '.old-chart-dot', '.old-chart-label']
        .every(sel => !!e.querySelector(sel)),
      label: (e.querySelector('.old-chart-label__t')?.textContent || '').trim(),
      shown: getComputedStyle(e).display !== 'none',
    }))
  })
  check(info.every(i => i.tag === 'DIV'), `3D 侧是 div（${info.map(i => i.tag).join('/')}）—— 不是假按钮`)
  check(info.every(i => i.pe === 'none'), `不吃指针（${info.map(i => i.pe).join('/')}）`)
  check(info.every(i => i.parts && i.label === '古海图'), '圈/点/标签三件齐全，标签仍是「古海图」')
  check(info.some(i => i.shown), '投影到画面上的那处真的显示出来了')

  // 切回 2D：别把后面（或下一次运行）留在 3D 状态里
  await page.evaluate(() => window.__mapStore.setState({ renderMode: '2d' }))
  await sleep(500)
}

check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)

console.log(`\n最终结果：${pass} 通过 / ${fails.length} 失败`)
if (fails.length) { console.log('失败项：'); fails.forEach(f => console.log('  ·', f)) }
await browser.close()
process.exit(fails.length ? 1 : 0)
