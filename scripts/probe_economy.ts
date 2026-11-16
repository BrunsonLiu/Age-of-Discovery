/*
 * 探针：远洋到底比近海划算吗。跑法 `npm run probe:economy`。
 *
 * 【为什么要它常驻在 scripts/ 而不是一次性脚本】
 * 价格是"卖的是航路"这一设计前提的地基。改 portGoods 的渴求度、
 * 改 voyageDays、改天候惩罚，都会悄悄移动这个分布 —— 而玩家只会说
 * "远洋不划算"，没人说得清是哪一环。有这个命令，改前改后各跑一次就知道。
 *
 * 【为什么要量这件事】游戏的设计前提是"卖的是航路"——跑得远应当有回报。
 * 但玩家反馈里一直有"短途倒卖更赚"的说法，而这件事**不能靠印象**：
 * 它取决于 距离/天数 与 港口价差 两个分布的相对形状。
 *
 * 输出：按航程分桶的「每件每航行日毛利」中位数/上四分位，以及最赚的 15 条。
 * 只做取证，不改任何数值。
 */
import { ports, portGoods } from '../src/data/ports'
import { goods } from '../src/data/goods'
import { routeFacts, voyageDays } from '../src/utils/voyage'
import { selectBuyPrice, selectSellPrice } from '../src/store/useGameStore'

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

type Row = { from: string; to: string; nm: number; days: number; good: string; buy: number; sell: number; perDay: number }
const rows: Row[] = []

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
    let best: Row | null = null
    for (const g of goods) {
      const buy = selectBuyPrice(baseState, a.id, g.id)
      const sell = selectSellPrice(baseState, b.id, g.id)
      if (buy == null || sell == null) continue
      const margin = sell - buy
      if (margin <= 0) continue
      const perDay = margin / days
      if (!best || perDay > best.perDay) {
        best = { from: a.nameCn, to: b.nameCn, nm: facts.distanceNm, days, good: g.nameCn, buy, sell, perDay }
      }
    }
    if (best) rows.push(best)
  }
}

const q = (arr: number[], p: number) => {
  const s = [...arr].sort((x, y) => x - y)
  if (!s.length) return 0
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]
}

const BUCKETS: [string, number, number][] = [
  ['近海  <500nm', 0, 500],
  ['中程  500–1500', 500, 1500],
  ['远洋  1500–3000', 1500, 3000],
  ['极远  >3000', 3000, 1e9],
]
console.log('每件每航行日毛利（金币/件/日），按单程航程分桶：\n')
console.log('分桶              条数   中位数   上四分位   最好的一条')
for (const [label, lo, hi] of BUCKETS) {
  const sub = rows.filter(r => r.nm >= lo && r.nm < hi)
  const vals = sub.map(r => r.perDay)
  const top = sub.slice().sort((x, y) => y.perDay - x.perDay)[0]
  console.log(
    `${label.padEnd(16)} ${String(sub.length).padStart(4)}   ${q(vals, 0.5).toFixed(2).padStart(7)}   ${q(vals, 0.75).toFixed(2).padStart(7)}   ` +
    (top ? `${top.perDay.toFixed(2)}  ${top.from}→${top.to} ${top.good}` : '—'),
  )
}

console.log('\n最赚的 15 条（每件每日毛利）：')
rows.slice().sort((x, y) => y.perDay - x.perDay).slice(0, 15).forEach((r, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. ${r.perDay.toFixed(2)}  ${r.from}→${r.to}  ${r.good} ${r.buy}→${r.sell}  ${r.nm}nm / ${r.days}天`)
})

console.log('\n最差的 8 条（同一次比较的另一端）：')
rows.slice().sort((x, y) => x.perDay - y.perDay).slice(0, 8).forEach((r, i) => {
  console.log(`  ${String(i + 1).padStart(2)}. ${r.perDay.toFixed(2)}  ${r.from}→${r.to}  ${r.good} ${r.buy}→${r.sell}  ${r.nm}nm / ${r.days}天`)
})

const far = rows.filter(r => r.nm > 3000).map(r => r.perDay)
const near = rows.filter(r => r.nm < 500).map(r => r.perDay)
console.log(`\n结论数值：远洋中位数 ${q(far, 0.5).toFixed(2)} / 近海中位数 ${q(near, 0.5).toFixed(2)} = ${(q(far, 0.5) / Math.max(0.01, q(near, 0.5))).toFixed(2)}×`)
