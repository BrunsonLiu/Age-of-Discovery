// 航线几何没就绪时，地图不许出现（更不许画出一条横穿陆地的航线）
// （端到端）
//
// 跑法：先起 dev server，再 `node test/e2e/geometry-ready.mjs`
//   GAME_URL=...  EDGE_PATH=...  可覆盖默认路径
//
// 【守的是什么】
// 航线弧长靠 A* 在海陆掩码（sea-mask.bin）上搜。掩码没到位时
// `buildRouteGeometry` 找不到海路，会**退化成一条横穿陆地的大圆直线**：
//   塞维利亚→埃尔米纳  掩码未到位 439 海里（穿撒哈拉） / 已到位 781 海里 —— 差 78%
//
// 第 34 轮实测抓到的问题：地图内容（候选航线虚线、NPC 商船航线）在**挂载那一刻**
// 就算一次几何，而挂载那一刻掩码常常还在路上。那条退化直线被 React 的
// memo/ref 记住，**永远不会自己纠正**——商船会沿着一条横穿陆地的直线开一整局，
// 屏幕上的航线虚线也永远指着一条假路。
//
// 本脚本怎么测：
//   ① 把 sea-mask.bin 的请求**掐住 2.5 秒**（不是掐断——掐断就变成"失败"档了），
//      于是"几何没结论"这个状态变成确定性可复现的；
//   ② 在这 2.5 秒里断言：地图**根本没挂载**（.leaflet-container 不存在），
//      商船和候选航线一个都不许出现——玩家不该看到任何一条错航线；
//   ③ 放行后断言：地图出来了，商船每条腿的航程等于**掩码到位后重算的真值**，
//      而且与大圆直线差得开（否则这条断言没有区分力）。
//
// 【为什么用"掐住"而不是"掐断"】
// 掐断 = 掩码确认失败 = 另一档（地图照常出来，只是退化成直线）。
// 本脚本守的是"还没到"这一档：几何**没结论**，所以地图不许出来。
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** 掩码被掐住多久（毫秒）——要够长，够 land.geojson 先到 */
const MASK_HOLD_MS = 2500

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
// 独立 context：避免同 browser 其它页面写过的 localStorage 让开局遮罩被跳过
const ctx = await browser.createBrowserContext()
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (/favicon|AudioContext|net::ERR_/.test(t)) return
  errors.push('CONSOLE: ' + t.slice(0, 160))
})
await page.setViewport({ width: 1440, height: 900 })

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log('  ✗', msg) } }

/* 掐住掩码：请求先不发出去，等 MASK_HOLD_MS 之后再放行。 */
let maskSeen = false
await page.setRequestInterception(true)
page.on('request', async (req) => {
  if (/sea-mask\.bin/.test(req.url())) {
    maskSeen = true
    await sleep(MASK_HOLD_MS)
    return req.continue().catch(() => {})
  }
  return req.continue().catch(() => {})
})

console.log('=== 第 0 轮：掩码还在路上 → 地图不许出现 ===')
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })

const hooked = await page.waitForFunction(
  () => !!(window.__gameStore && window.__mapStore), { timeout: 30000, polling: 100 },
).then(() => true).catch(() => false)
if (!hooked) throw new Error('store 调试钩子没挂上（dev 编译失败或页面空白）')

// 等掩码请求真的发出去了，再留一段窗口
const t0 = Date.now()
while (!maskSeen && Date.now() - t0 < 20000) await sleep(50)
check(maskSeen, '掩码请求确实发出了（掐住生效的前提）')
await sleep(1200)

const during = await page.evaluate(() => ({
  ready: window.__mapStore.getState().landDataReady,
  failed: window.__mapStore.getState().landDataFailed,
  mapCount: document.querySelectorAll('.leaflet-container').length,
  npcCount: document.querySelectorAll('.npc-ship-icon').length,
  routeCount: document.querySelectorAll('.route-line').length,
}))
check(during.ready === false, `掩码没到位时就绪标志是 false（实测 ${during.ready}）`)
check(during.failed === false, `掩码只是没到、不是失败（实测 failed=${during.failed}）`)
check(during.mapCount === 0,
  `几何没结论时地图不许挂载（实测 .leaflet-container × ${during.mapCount}）`)
check(during.npcCount === 0,
  `几何没结论时商船不许出现（实测 .npc-ship-icon × ${during.npcCount}）`)
check(during.routeCount === 0,
  `几何没结论时候选航线不许出现（实测 .route-line × ${during.routeCount}）`)

console.log('=== 第 1 轮：掩码到位 → 几何必须是避陆后的真值 ===')
const ready = await page.waitForFunction(
  () => window.__mapStore.getState().landDataReady === true, { timeout: 30000, polling: 100 },
).then(() => true).catch(() => false)
check(ready, '掩码到位后就绪标志翻成 true')

const mounted = await page.waitForFunction(
  () => document.querySelectorAll('.leaflet-container').length > 0, { timeout: 20000, polling: 100 },
).then(() => true).catch(() => false)
check(mounted, '几何有结论后地图挂载出来')

/** 屏幕上这四条商船腿的航程（组件自己算的那份） */
const shown = await page.evaluate(() => {
  const els = [...document.querySelectorAll('.npc-ship-icon [data-leg-nm]')]
  return els.map(el => Number(el.getAttribute('data-leg-nm')))
})
check(shown.length > 0, `商船挂出来了（实测 ${shown.length} 条腿：${shown.join('/')} 海里）`)

/**
 * 掩码到位后**重新算一遍**真值。
 * 走的是同一个 getRouteGeometry —— 但模块级缓存已在掩码到位时清过，
 * 所以这里拿到的是「避陆后的弧长」，而不是组件挂载那一刻算的那条直线。
 */
const truth = await page.evaluate(async () => {
  const imp = (p) => import(`/Age-of-Discovery/src/${p}`).catch(() => import(`/src/${p}`))
  const rp = await imp('utils/routePath.ts')
  const ns = await imp('utils/npcShips.ts')
  const pd = await imp('data/ports.ts')
  const rt = await imp('data/routes.ts')
  const out = []
  for (const leg of ns.NPC_LEGS) {
    const r = rt.routes.find(x => x.id === leg.routeId)
    const a = pd.ports.find(p => p.id === r.fromPortId)
    const b = pd.ports.find(p => p.id === r.toPortId)
    const g = rp.getRouteGeometry([a.latitude, a.longitude], [b.latitude, b.longitude])
    out.push(Math.round(g.totalNm))
  }
  return out
})
console.log(`  商船航程：屏幕 ${shown.join('/')} ｜ 掩码到位后重算 ${truth.join('/')}`)

/** 大圆直线（退化路径）会是多少 —— 用来证明这条断言有区分力 */
const greatCircle = await page.evaluate(async () => {
  const imp = (p) => import(`/Age-of-Discovery/src/${p}`).catch(() => import(`/src/${p}`))
  const ns = await imp('utils/npcShips.ts')
  const pd = await imp('data/ports.ts')
  const rt = await imp('data/routes.ts')
  const nav = await imp('utils/navigation.ts')
  const out = []
  for (const leg of ns.NPC_LEGS) {
    const r = rt.routes.find(x => x.id === leg.routeId)
    const a = pd.ports.find(p => p.id === r.fromPortId)
    const b = pd.ports.find(p => p.id === r.toPortId)
    out.push(Math.round(nav.haversineNm(a.latitude, a.longitude, b.latitude, b.longitude)))
  }
  return out
})
console.log(`  大圆直线（退化路径）：${greatCircle.join('/')}`)

check(JSON.stringify(shown) === JSON.stringify(truth),
  `屏幕上的商船航程 = 掩码到位后重算的真值（${shown.join('/')} vs ${truth.join('/')}）`)
check(shown.some((v, i) => Math.abs(v - (greatCircle[i] ?? -1)) > 5),
  '商船航程与大圆直线差得开（否则上面那条断言没有区分力）')
check(shown.some((v, i) => Math.abs(v - (truth[i] ?? -1)) <= 1) &&
  shown.some((v, i) => Math.abs(v - (greatCircle[i] ?? -1)) > 5),
  '至少有一条腿既等于真值、又不同于大圆直线')

check(errors.length === 0, `无运行时错误（${errors.length} 条：${errors.slice(0, 2).join(' | ')}）`)

console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
