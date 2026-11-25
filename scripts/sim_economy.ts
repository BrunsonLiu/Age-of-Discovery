/*
 * 远洋收益倒挂：四种改法各值多少？跑法 `npm run sim:economy`。
 *
 * 【为什么先算再改】
 * `probe:economy` 给出基线（远洋/近海 = 0.56×），但"要不要动数值、动多少"
 * 一直是悬着的决策。悬着的原因不是不想改，是**没人知道改多少才够**。
 * 这里把四种改法各自的效果算成同一把尺子上的数字，改不改由人拍板，
 * 但"改多少"从此有依据。
 *
 * 【为什么不改数据、只在内存里模拟】
 * 改 `portGoods` 的渴求度会连带影响掮客推荐、里程碑收益、存档里的旧价格……
 * 一次改不干净就会在别处露出不一致（本项目的头号罪名）。
 * 先把效果量出来，等定了方案再一次性落到数据上。
 *
 * 四种改法（与 MEMORY 里记的四个方向对应）：
 *   A 距离渴求：卖价随单程里程上浮（越远的港越缺货）
 *   B 动态稀缺：连着卖同一件货、同一座港，价格回落
 *   C 非金钱回报：不加钱，改成声望/情报/图鉴 —— 本脚本**量不出来**，只列结论
 *   D 缩短远航：远洋的天数打八折（更强风带 / 更好的船）
 */
import { ports, portGoods } from '../src/data/ports'
import { goods } from '../src/data/goods'
import { routeFacts, voyageDays } from '../src/utils/voyage'
import { selectBuyPrice, selectSellPrice } from '../src/store/useGameStore'

/* ── 与 probe_economy 完全相同的夹具与口径（两份必须一致，否则数字不可比） ── */
const fleet = {
  id: 1, name: 't', gold: 10000, fame: 0, morale: 80, food: 200, water: 200,
  currentPortId: null, isSailing: false, day: 120,
  ships: [{ id: 1, name: 'x', type: 'caravel', capacity: 100, usedCapacity: 0, durability: 100, crew: 40, speed: 7, maxCrew: 40 }],
  cargo: [], flagshipId: 1, trait: null,
}
const baseState = {
  fleet,
  currentRoute: null, routeProgress: 0, waypoint: null,
  completedTasks: [], activeTasks: [], eventLog: [], discoveredPorts: [],
  currentEvent: null, gamePhase: 'playing', marketStock: {}, seenMarketTips: [],
  victoryDay: null, eventFlags: {},
  stats: { daysSailed: 0, trades: 0, bestDeal: 0, tradeProfit: 0, pirateWins: 0, eventsSurvived: 0, historySeen: 0 },
  achievements: [], pendingVoyage: null, stance: 'steady', routeIntel: {},
  rivals: [], rivalNews: [], officers: [],
  factionRep: { crown: 0, guild: 0, scholars: 0, brethren: 0 },
  crewRoster: [], notoriety: { cruel: 0, mercy: 0, greed: 0, bold: 0, secret: 0 },
} as never
const weather = { kind: 'clear', windDir: 0, windSpeed: 12, duration: 6 } as never
const DAY = 120

type Leg = { from: string; to: string; nm: number; days: number; good: string; buy: number; sell: number; favor: number }
const legs: Leg[] = []

for (const a of ports) {
  for (const b of ports) {
    if (a.id === b.id) continue
    const facts = routeFacts([a.latitude, a.longitude], [b.latitude, b.longitude], DAY)
    if (facts.distanceNm <= 0) continue
    const days = voyageDays({
      distanceNm: facts.distanceNm, windFavor: facts.windFavor,
      phenomenonFactor: facts.phenomenonFactor,
      fleet: fleet as never, officers: [], weather,
    })
    if (!Number.isFinite(days) || days <= 0) continue
    for (const g of goods) {
      const buy = selectBuyPrice(baseState, a.id, g.id)
      const sell = selectSellPrice(baseState, b.id, g.id)
      if (buy == null || sell == null) continue
      if (sell - buy <= 0) continue
      legs.push({ from: a.nameCn, to: b.nameCn, nm: facts.distanceNm, days, good: g.nameCn, buy, sell, favor: facts.windFavor })
    }
  }
}

const q = (arr: number[], p: number) => {
  const s = [...arr].sort((x, y) => x - y)
  if (!s.length) return 0
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]
}
const BUCKETS: [string, number, number][] = [
  ['近海 <500', 0, 500],
  ['中程 500–1500', 500, 1500],
  ['远洋 1500–3000', 1500, 3000],
  ['极远 >3000', 3000, 1e9],
]

/**
 * 跑一种改法。
 * @param adj 把「买价/卖价/天数」按这条航线的属性改写
 */
function evaluate(
  label: string,
  adj: (l: Leg) => { buy: number; sell: number; days: number },
) {
  // 每条航线取"该航线上每件每日毛利最好的一件货"（与 probe_economy 同一口径）
  const best = new Map<string, number>()
  for (const l of legs) {
    const a = adj(l)
    const margin = a.sell - a.buy
    if (margin <= 0) continue
    const perDay = margin / a.days
    const k = `${l.from}→${l.to}`
    const prev = best.get(k)
    if (prev == null || perDay > prev) best.set(k, perDay)
  }
  const byBucket = BUCKETS.map(([name, lo, hi]) => {
    const legsIn = legs.filter(l => l.nm >= lo && l.nm < hi)
    const vals = [...new Set(legsIn.map(l => `${l.from}→${l.to}`))]
      .map(k => best.get(k))
      .filter((v): v is number => v != null)
    return { name, n: vals.length, med: q(vals, 0.5), p75: q(vals, 0.75) }
  })
  const far = byBucket[3].med
  const near = byBucket[0].med
  return { label, byBucket, ratio: far / Math.max(0.01, near), far, near }
}

const rows: ReturnType<typeof evaluate>[] = []

/* 基线 */
rows.push(evaluate('基线（现状）', l => ({ buy: l.buy, sell: l.sell, days: l.days })))

/*
 * A 距离渴求：卖价 ×(1 + k × min(1, nm/5000))
 * 用 5000nm 作饱和点 —— 欧洲到加勒比约 4000、到东亚约 9000，
 * 取 5000 意味着"跨大西洋基本吃满、绕好望角超一点但不失控"。
 */
for (const k of [0.2, 0.35, 0.5]) {
  rows.push(evaluate(`A 距离渴求 k=${k}`, l => ({
    buy: l.buy,
    sell: l.sell * (1 + k * Math.min(1, l.nm / 5000)),
    days: l.days,
  })))
}

/*
 * B 动态稀缺：同一件货连着卖，第 n 趟价格 ×(1 - 0.12×min(n,4))
 * 这里只量"第 1 趟"之外的第 4 趟 —— 玩家实际会跑的重复趟数最坏情况。
 * 注意它**压的是近海**（近海周转快、重复多），所以单看比值会更好看，
 * 但真实体验是"近海越跑越不值钱、远洋单趟仍然贵"。
 */
rows.push(evaluate('B 动态稀缺（第 4 趟，×0.52）', l => ({
  buy: l.buy,
  sell: l.buy + (l.sell - l.buy) * 0.52,
  days: l.days,
})))

/*
 * A' 带门槛的距离渴求：前 800nm 一分不给，之后按剩余里程线性上浮。
 *
 * 【为什么需要这一版】纯 A 有天花板：近海也有 400nm 的航线，照样吃 8% 奖励，
 * 于是 A 把分子分母一起抬高 —— k=0.5 的比值（0.73）甚至比 k=0.35（0.76）更差。
 * 而玩家真正吃亏的是「跑得不近不远」那一段（中程中位数 1.60，全场最低）：
 * 距离已经付出去了，价差却还没长起来。
 * 门槛设在 800nm：地中海内部（约 300~700）、加勒比内部（约 400~900）基本不动，
 * 跨大西洋（4000）与绕好望角（9000）吃满。
 */
for (const k of [0.35, 0.5]) {
  rows.push(evaluate(`A' 门槛800 k=${k}`, l => {
    const over = Math.max(0, l.nm - 800)
    return { buy: l.buy, sell: l.sell * (1 + k * Math.min(1, over / 4200)), days: l.days }
  }))
}

/* D 缩短远航：天数 ×0.8（远洋吹得更久的顺风 / 更好操纵的船） */
rows.push(evaluate('D 远航天数 ×0.8', l => ({
  buy: l.buy,
  sell: l.sell,
  days: l.nm > 3000 ? l.days * 0.8 : l.days,
})))

/* A + D 组合 */
rows.push(evaluate('A(k=0.35) + D', l => ({
  buy: l.buy,
  sell: l.sell * (1 + 0.35 * Math.min(1, l.nm / 5000)),
  days: l.nm > 3000 ? l.days * 0.8 : l.days,
})))
rows.push(evaluate("A'(k=0.5) + D", l => {
  const over = Math.max(0, l.nm - 800)
  return {
    buy: l.buy,
    sell: l.sell * (1 + 0.5 * Math.min(1, over / 4200)),
    days: l.nm > 3000 ? l.days * 0.8 : l.days,
  }
}))

/* ── 输出 ── */
/*
 * `--wind`：把每个距离桶再按**风向系数**拆开。
 *
 * 为什么要拆：中程那一档的中位数（1.60）里混着两种完全不同的航线 ——
 * 哈瓦那→卡塔赫纳 913nm 走 **5 天**（顺风顺流），皇家港→韦拉克鲁斯 1125nm 走 **12 天**
 * （加勒比逆风，~90 海里/天）。把"逆风"的代价算进"距离划不划算"里，
 * 等于用一条错误的尺子做决策：看着像"中程不赚钱"，其实是"逆风不赚钱"。
 * 分开看，才知道该改数据（渴求品）、改船（风向），还是什么都不改。
 */
if (process.argv.includes('--wind')) {
  const CLS: [string, number, number][] = [['逆风 <0.6', -9, 0.6], ['平风 0.6–1.0', 0.6, 1.0], ['顺风 ≥1.0', 1.0, 9]]
  const bestPerLane = new Map<string, Leg & { perDay: number }>()
  for (const l of legs) {
    const perDay = (l.sell - l.buy) / l.days
    const k = `${l.from}→${l.to}`
    const prev = bestPerLane.get(k)
    if (!prev || perDay > prev.perDay) bestPerLane.set(k, { ...l, perDay })
  }
  const lanes = [...bestPerLane.values()]
  const q2 = (arr: number[], p: number) => {
    const a = [...arr].sort((x, y) => x - y)
    if (!a.length) return 0
    return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))]
  }
  console.log('\n按「距离桶 × 风向」分开看（每件每日毛利中位数，括号里是航线数）：')
  console.log('  距离桶'.padEnd(20) + CLS.map(([n]) => n.padStart(16)).join(''))
  for (const [name, lo, hi] of BUCKETS) {
    const row = CLS.map(([, flo, fhi]) => {
      const v = lanes.filter(l => l.nm >= lo && l.nm < hi && l.favor >= flo && l.favor < fhi).map(l => l.perDay)
      return `${q2(v, 0.5).toFixed(2)} (${v.length})`.padStart(16)
    })
    console.log('  ' + name.padEnd(18) + row.join(''))
  }
  console.log('')
}

/*
 * `--lanes`：把中程（500–1500nm）那段**逐条航线**摊开看。
 *
 * 为什么要它：分桶中位数只告诉你"中程最差（1.60）"，不告诉你**差在哪**。
 * 是"没有一件够贵的货"，还是"有贵货但被天数吃掉了"？这两件事的修法完全不同
 * （前者加渴求品，后者改航速）。这条 dump 是给"改数据"之前用的显微镜。
 */
/*
 * `--lane 皇家港~韦拉克鲁斯`：把**一条航线**的所有货摊开。
 *
 * 【为什么需要它】2026-11-26 我给韦拉克鲁斯补了朗姆（史实也成立），
 * 目标是那条渴求度 0.00 的航线；结果 `--wind` 的中程中位数 2.00 → 1.60。
 * 看着像"改坏了"，其实**是量尺的问题**：中位数是"每条航线一个数"的中位数，
 * 补一条需求会新增若干条航线（每个产地 × 该港），这批新航线多半是逆风长途、
 * 每件每日很低，于是中位数被拉低，而目标那条其实变好了。
 *
 * **给数据做加法时，"全体中位数"不是判据**——它奖励删除航线、惩罚增加航线。
 * 判据应该是：① 目标航线本身变好没；② 有没有别的航线变差。
 * 这条命令就是为①准备的；②靠 `--lane` 逐条抽查。
 */
const laneArg = process.argv.find(a => a.startsWith('--lane=')) ?? (process.argv.includes('--lane') ? `--lane=${process.argv[process.argv.indexOf('--lane') + 1] ?? ''}` : null)
if (laneArg) {
  const want = laneArg.slice('--lane='.length).trim()
  const rows = legs.filter(l => `${l.from}→${l.to}`.includes(want))
  if (rows.length === 0) {
    console.log(`没有匹配「${want}」的航线。可用：${[...new Set(legs.map(l => `${l.from}→${l.to}`))].slice(0, 8).join(' / ')} …`)
  } else {
    rows.sort((a, b) => (b.sell - b.buy) / b.days - (a.sell - a.buy) / a.days)
    console.log(`\n「${want}」共 ${rows.length} 条（港口 × 商品），按每件每日毛利降序：`)
    console.log('  到达港'.padEnd(16) + '商品'.padEnd(12) + '买价'.padStart(6) + '卖价'.padStart(6) + '每件'.padStart(7) + '天数'.padStart(6) + '每件每日'.padStart(9))
    for (const r of rows) {
      const per = (r.sell - r.buy) / r.days
      console.log('  ' + r.to.padEnd(14) + r.good.padEnd(10) + String(r.buy).padStart(6) + String(r.sell).padStart(6) +
        String(r.sell - r.buy).padStart(7) + r.days.toFixed(1).padStart(6) + per.toFixed(2).padStart(9))
    }
    console.log('')
  }
}

/*
 * `--gaps`：**顺风但到岸没人要**的中长航线（"跑了却不值"的真缺口）。
 *
 * 判据：500–3000nm、风系数 ≥1.0（顺风，天数不是瓶颈）、且最好那件货的到岸渴求度 <1.3。
 * 逆风航线不列进来 —— 那是航海常识（顶风要走十几天），补价等于把风向的意义抹平。
 * 这里列出来的才是"本可以赚钱、但目的港不收这种货"的洞，也就是**该补渴求品**的地方。
 */
if (process.argv.includes('--gaps')) {
  const pmAt = (portName: string, goodName: string) => {
    const to = ports.find(p => p.nameCn === portName)
    const g = goods.find(x => x.nameCn === goodName)
    if (!to || !g) return { pm: 0, portId: to?.id ?? 0 }
    return { pm: portGoods.find(pg => pg.portId === to.id && pg.goodId === g.id)?.priceModifier ?? 0, portId: to.id }
  }
  const best = new Map<string, Leg & { perDay: number }>()
  for (const l of legs) {
    const perDay = (l.sell - l.buy) / l.days
    const k = `${l.from}→${l.to}`
    const prev = best.get(k)
    if (!prev || perDay > prev.perDay) best.set(k, { ...l, perDay })
  }
  const gaps = [...best.values()]
    .map(l => ({ ...l, ...pmAt(l.to, l.good) }))
    .filter(l => l.nm >= 500 && l.nm < 3000 && l.favor >= 1.0 && l.pm < 1.3)
    .sort((a, b) => a.perDay - b.perDay)
  console.log(`\n顺风但到岸没人要的中长航线：${gaps.length} 条（按每件每日毛利升序，只列前 15）`)
  console.log('  航线'.padEnd(26) + '海里'.padStart(7) + '天'.padStart(6) + '风'.padStart(6) + '  货'.padEnd(10) + '毛利/日'.padStart(9) + '  到岸渴求'.padStart(9))
  for (const l of gaps.slice(0, 15)) {
    console.log('  ' + `${l.from}→${l.to}`.padEnd(24) + String(Math.round(l.nm)).padStart(7) +
      l.days.toFixed(1).padStart(6) + l.favor.toFixed(2).padStart(6) + '  ' + l.good.padEnd(8) +
      l.perDay.toFixed(2).padStart(9) + l.pm.toFixed(2).padStart(9))
  }
  console.log('')
}

if (process.argv.includes('--lanes')) {
  const bestPerLane = new Map<string, Leg & { perDay: number }>()
  for (const l of legs) {
    const perDay = (l.sell - l.buy) / l.days
    const k = `${l.from}→${l.to}`
    const prev = bestPerLane.get(k)
    if (!prev || perDay > prev.perDay) bestPerLane.set(k, { ...l, perDay })
  }
  const mid = [...bestPerLane.values()].filter(l => l.nm >= 500 && l.nm < 1500)
    .sort((a, b) => a.perDay - b.perDay)
  const pmOf = (nameCn: string, goodName: string) => {
    const to = ports.find(p => p.nameCn === nameCn)
    const g = goods.find(x => x.nameCn === goodName)
    if (!to || !g) return 0
    return portGoods.find(pg => pg.portId === to.id && pg.goodId === g.id)?.priceModifier ?? 0
  }
  console.log(`\n中程（500–1500nm）共 ${mid.length} 条航线，按「每件每日毛利」升序：`)
  console.log('  航线'.padEnd(26) + '海里'.padStart(7) + '天'.padStart(5) + '风'.padStart(6) + '  最好的一件货'.padEnd(14) + '毛利/日'.padStart(9) + '  到岸渴求度'.padStart(11))
  for (const l of [...mid.slice(0, 14), ...mid.slice(-6)]) {
    console.log('  ' + `${l.from}→${l.to}`.padEnd(24) + String(Math.round(l.nm)).padStart(7) +
      l.days.toFixed(1).padStart(5) + l.favor.toFixed(2).padStart(6) + '  ' + l.good.padEnd(12) +
      l.perDay.toFixed(2).padStart(9) + pmOf(l.to, l.good).toFixed(2).padStart(11))
  }
  console.log('')
}

console.log(`样本：${legs.length} 条「港口对 × 商品」组合\n`)
const head = '改法'.padEnd(26) + BUCKETS.map(b => b[0].padStart(14)).join('') + '   远/近'
console.log(head)
console.log('─'.repeat(head.length + 6))
for (const r of rows) {
  const cells = r.byBucket.map(b => b.med.toFixed(2).padStart(14)).join('')
  const flag = r.ratio >= 0.9 ? ' ✅' : r.ratio >= 0.75 ? ' ⚠️' : ''
  console.log(r.label.padEnd(26) + cells + `   ${r.ratio.toFixed(2)}×${flag}`)
}

console.log('\n说明：每格是该桶**每件每航行日毛利的中位数**（金币/件/日）。')
console.log('「远/近」= 极远(>3000nm) 中位数 ÷ 近海(<500nm) 中位数，基线是 0.56×。')
console.log('判定线：≥0.90 视为「远洋不再吃亏」；0.75~0.90 是「差距可接受」。')

console.log('\nC 方案（非金钱回报）量不出来，但值得记一笔：')
console.log('  远洋单趟的金钱毛利本来就不该比近海高——它的回报是**图鉴/见闻/声望**。')
console.log('  本项目已经有：新港口首次抵达 +5 声望（见习航海士 +50%）、')
console.log('  里程碑金币、历史节点、遗物、传说。也就是说 C 已经落地了一部分，')
console.log('  缺的是"远洋的图鉴内容密度"——那是内容工作，不是数值工作。')
