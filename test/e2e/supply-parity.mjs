// 出航计划的补给数字对账（端到端）
//
// 跑法：先起 dev server，再 `node test/e2e/supply-parity.mjs`
//   GAME_URL=...  EDGE_PATH=...  可覆盖默认路径
//
// 守的是项目最核心的规矩：**屏幕上显示的数字 = 实际发生的变化**，
// 以及「界面说够，照默认走法就真的够」。
//
// 第 27 轮实测抓到的两处旧缺陷（30 人船，哈瓦那 → 皇家港，6 天航程）：
//   ① 面板写「每日耗 3 粮 / 5 水」，同一屏顶栏却写「每天吃 1 份（港内自给）」，
//      港内 advanceDay 实际只扣 1 粮 / 2 水；起航后抢行实际扣 5 粮 / 8 水。
//      面板那个数是「基础消耗」，既没标注口径，也不是当下真正扣掉的数。
//   ② 判定够不够用三档里最省的抢行（15 粮），结论句却写「约 6 天可达」
//      （按部就班，要 18 粮）。粮=15 时界面说「补给偏紧」，玩家照默认走
//      第 5 天断粮 —— 承诺兑现不了。
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)) })
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
const sleep = ms => new Promise(r => setTimeout(r, ms))
await sleep(2000)

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log('  ✗', msg) } }

// 30 名船员 => 基础 3 粮 / 5 水；港内 1 / 2；按部就班 3 / 5；抢行 5 / 8
const setup = (food = 100, water = 100) => page.evaluate(([f, w]) => {
  const s = window.__gameStore.getState()
  const ship = {
    id: 1, name: '对账船', type: 'caravel', speed: 5, durability: 80,
    maxDurability: 100, capacity: 500, usedCapacity: 0, crew: 30, maxCrew: 40,
  }
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, dialogueSeen: ['opening_pilot'],
    gameMode: 'captain', currentEvent: null, pendingVoyage: null, waypoint: null,
    currentRoute: null, routeProgress: 0, stance: 'steady', simSpeed: 1,
    rand: () => 1,
    fleet: {
      ...s.fleet, gold: 100000, food: f, water: w, morale: 80, day: 1,
      currentPortId: 1, isSailing: false, ships: [ship], cargo: [], trait: null,
    },
  })
}, [food, water])

const openPlan = () => page.evaluate(() => {
  window.__gameStore.getState().sailToWaypoint({
    latitude: 17.9367, longitude: -76.8425, portId: 2, name: '皇家港',
  })
})

const readRates = () => page.evaluate(() => {
  const el = document.querySelector('[data-testid="voyage-supply-rates"]')
  const t = (el?.textContent || '').replace(/\s+/g, ' ')
  const m = t.match(/港内每日\s*(\d+)\s*粮\s*\/\s*(\d+)\s*水.*?起航后按部就班\s*(\d+)\s*粮\s*\/\s*(\d+)\s*水/)
  const foodTip = document.querySelector('button[aria-label^="食物"]')?.getAttribute('title') || ''
  const waterTip = document.querySelector('button[aria-label^="淡水"]')?.getAttribute('title') || ''
  const readPerDay = (tip, verb) => {
    const mm = tip.match(new RegExp(`每天${verb}\\s*(\\d+)\\s*份`))
    return mm ? Number(mm[1]) : null
  }
  const overlay = [...document.querySelectorAll('div.fixed.inset-0')]
    .find(x => /出航计划/.test(x.textContent || ''))
  const vt = (overlay?.textContent || '').replace(/\s+/g, ' ')
  // 直接读结论节点本身，不用正则从整屏文本里捞（后者会把折叠标题、航程数字一起吃进来）
  const verdict = (document.querySelector('[data-testid="voyage-verdict-text"]')?.textContent || '').replace(/\s+/g, ' ')
  return {
    text: t,
    portFood: m ? Number(m[1]) : null,
    portWater: m ? Number(m[2]) : null,
    seaFood: m ? Number(m[3]) : null,
    seaWater: m ? Number(m[4]) : null,
    tipFood: readPerDay(foodTip, '吃'),
    tipWater: readPerDay(waterTip, '喝'),
    verdict,
    overlayText: vt,
  }
})

const advanceOnce = () => page.evaluate(() => {
  const g = window.__gameStore.getState()
  const before = { food: g.fleet.food, water: g.fleet.water }
  g.advanceDay()
  const a = window.__gameStore.getState().fleet
  return { food: before.food - a.food, water: before.water - a.water }
})

// ---- ① 面板同时报出港内与起航后两套日耗，且与顶栏字面一致 ----
await setup(); await sleep(400)
await openPlan(); await sleep(700)
const r = await readRates()
check(r.portFood !== null && r.seaFood !== null,
  `面板列出两套日耗（读到：「${r.text}」）`)
check(r.portFood === r.tipFood && r.portWater === r.tipWater,
  `港内日耗 = 顶栏 tooltip（面板 ${r.portFood}/${r.portWater}，顶栏 ${r.tipFood}/${r.tipWater}）`)
check(r.seaFood > r.portFood && r.seaWater > r.portWater,
  `起航后日耗高于港内自给（${r.portFood}/${r.portWater} → ${r.seaFood}/${r.seaWater}）`)

// ---- ② 港内推进一天，实际扣的必须等于面板写的港内日耗 ----
const inPort = await advanceOnce()
check(inPort.food === r.portFood && inPort.water === r.portWater,
  `港内实际扣 ${inPort.food}/${inPort.water} = 面板 ${r.portFood}/${r.portWater}`)

// ---- ③ 起航后按部就班：实际扣的必须等于面板写的「起航后」----
const measure = async (stance) => {
  await setup(); await sleep(350)
  await openPlan(); await sleep(450)
  await page.evaluate(st => {
    window.__gameStore.getState().confirmDeparture()
    window.__gameStore.setState({ stance: st, currentEvent: null, gamePhase: 'playing' })
  }, stance)
  await sleep(350)
  return advanceOnce()
}
const steadyUsed = await measure('steady')
check(steadyUsed.food === r.seaFood && steadyUsed.water === r.seaWater,
  `按部就班实际扣 ${steadyUsed.food}/${steadyUsed.water} = 面板 ${r.seaFood}/${r.seaWater}`)

// ---- ④ 抢行：实际扣的必须等于 dailyRates 的抢行口径（不是面板那个数）----
const rushExpected = await page.evaluate(async () => {
  const p = new URL('src/utils/voyage.ts', document.baseURI).pathname
  const { dailyRates } = await import(p)
  const s = window.__gameStore.getState()
  return dailyRates({ ...s.fleet, isSailing: true }, 'rush')
})
const rushUsed = await measure('rush')
check(rushUsed.food === rushExpected.foodPerDay && rushUsed.water === rushExpected.waterPerDay,
  `抢行实际扣 ${rushUsed.food}/${rushUsed.water} = dailyRates 抢行 ${rushExpected.foodPerDay}/${rushExpected.waterPerDay}`)
check(rushUsed.food > steadyUsed.food,
  `抢行确实比按部就班费粮（${steadyUsed.food} → ${rushUsed.food}），判据有区分力`)

// ---- ⑤ 三档总账：抢行更省粮，才存在「判定线分叉」这个测得到的区间 ----
// 前面 measure() 起过航，pendingVoyage 已被清掉，这里重开一次计划再算账
await setup(); await sleep(350)
await openPlan(); await sleep(450)
const ledgers = await page.evaluate(async () => {
  const mod = p => import(new URL(p, document.baseURI).pathname)
  const [seg, nav, wx] = await Promise.all([
    mod('src/utils/segment.ts'), mod('src/utils/navigation.ts'), mod('src/utils/weather.ts'),
  ])
  const g = window.__gameStore.getState()
  const pv = g.pendingVoyage
  if (!pv) return null
  const mul = wx.WEATHER_INFO[g.weather.kind].sailMul * wx.weatherFavorFactor(g.weather.kind)
  const baseNmPerDay = nav.dailyDistanceNm(g.fleet, g.officers, pv.route.windFavor, 1, mul)
  const c = nav.calculateDailyConsumption(g.fleet)
  return seg.stanceLedgers({
    distanceNm: pv.route.distance, baseNmPerDay,
    dailyFood: c.food, dailyWater: c.water,
    dailyEventProb: 0.25 * wx.WEATHER_INFO[g.weather.kind].eventBias,
    durabilityCarry: g.fleet.durabilityCarry,
  }).map(x => ({ stance: x.stance.id, days: x.days, food: x.food, water: x.water }))
})
check(!!ledgers && ledgers.length === 3, '算出了三档总账（防「根本没进计划」的假绿）')
if (ledgers) {
  const rush = ledgers.find(l => l.stance === 'rush')
  const steady = ledgers.find(l => l.stance === 'steady')
  check(rush.food < steady.food,
    `这条航线抢行总耗粮 ${rush.food} < 按部就班 ${steady.food}，分叉区间存在`)

  // 粮刚好够抢行、不够按部就班：旧实现会说「补给偏紧」，玩家照默认走法断粮
  const between = Math.max(rush.food, steady.food - 1)
  await setup(between, 999); await sleep(350)
  await openPlan(); await sleep(550)
  const tight = await readRates()
  check(/不够/.test(tight.verdict),
    `粮=${between}（抢行够 ${rush.food}、按部就班要 ${steady.food}）必须报「不够」，实际：「${tight.verdict}」`)
  // 不能用 /抢行/ 判：折叠区收起摘要本来就写着「抢行最快最险」，那是永远为真的假绿
  const altRoute = new RegExp(`回港补给，或一路「抢行」：全程只需\\s*${rush.food}\\s*粮\\s*/\\s*${rush.water}\\s*水`)
  check(altRoute.test(tight.overlayText),
    `不够时给可行动的第二条路，且写清抢行全程只要 ${rush.food} 粮 / ${rush.water} 水`)

  // 刚好够按部就班：不该再报「不够」
  await setup(steady.food, 999); await sleep(350)
  await openPlan(); await sleep(550)
  const enough = await readRates()
  check(!/不够/.test(enough.verdict),
    `粮=${steady.food}（按部就班刚好够）不该报「不够」，实际：「${enough.verdict}」`)
}

check(errors.length === 0, `运行时错误 0 条（实际 ${errors.length}：${errors.slice(0, 2).join(' | ')}）`)

console.log(`\n补给数字对账：${pass} 通过 / ${fail} 失败`)
await browser.close()
if (fail > 0) process.exit(1)
