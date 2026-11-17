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

type Leg = { from: string; to: string; nm: number; days: number; good: string; buy: number; sell: number }
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
      legs.push({ from: a.nameCn, to: b.nameCn, nm: facts.distanceNm, days, good: g.nameCn, buy, sell })
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
