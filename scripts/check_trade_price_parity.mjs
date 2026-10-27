// 独立核验：报价（面板显示） vs 实际结算（钱包变化）
//
// 为什么要有这个脚本：单元测试里已经有一份同样的断言，
// 这里再从「外部消费者」的角度独立对账一次——两份证据不能是同一份代码。
//
// 背景：修复前 TradePanel 自己抄了一份价格公式（漏乘 priceMultiplier、
// 也漏掉 surge），面板写的价和真正结算的价在 fame=100 时 99 个条目里
// 97 个对不上，最大差 67 金。现在两者共用 store 的 selectBuyPrice /
// selectSellPrice，数字不可能再分叉。
//
// 注意：.mjs 不能写 TS 语法，这里用纯 JS + esbuild 打包 .ts 依赖
import { portGoods } from '../src/data/ports'
import { goods } from '../src/data/goods'
import { priceMultiplier, DEFAULT_TRAIT } from '../src/data/traits'
import { selectBuyPrice, selectSellPrice, useGameStore } from '../src/store/useGameStore'

const nameOf = new Map(goods.map(g => [g.id, g.nameCn]))
const CASES = [
  { label: '新档默认 merchant (fame=0)', fame: 0, trait: DEFAULT_TRAIT },
  { label: 'fame=100 + merchant', fame: 100, trait: DEFAULT_TRAIT },
]

const ship = {
  id: 1, name: '核验船', type: 'caravel', speed: 5, durability: 50,
  maxDurability: 100, capacity: 9999, usedCapacity: 0, crew: 30, maxCrew: 40,
}

/** 把影响价格系数的状态归零，否则测到的是残留状态 */
const resetState = (portId, cargo) => useGameStore.setState({
  fleet: {
    ...useGameStore.getState().fleet,
    gold: 9999999, fame: CASES[0].fame, trait: CASES[0].trait,
    currentPortId: portId, isSailing: false, ships: [ship], cargo,
  },
  marketStock: {},
  officers: [], crewRoster: [],
  factionRep: { crown: 0, guild: 0, scholars: 0, brethren: 0 },
  notoriety: { cruel: 0, mercy: 0, greed: 0, bold: 0, secret: 0 },
})

let totalBad = 0
for (const c of CASES) {
  let buyBad = 0, sellBad = 0, buyWorst = 0, sellWorst = 0
  const samples = []

  for (const pg of portGoods) {
    // --- 买入：报价 vs 实扣 ---
    resetState(pg.portId, [])
    useGameStore.setState({ fleet: { ...useGameStore.getState().fleet, fame: c.fame, trait: c.trait } })
    const quote = selectBuyPrice(useGameStore.getState(), pg.portId, pg.goodId)
    if (quote == null) continue
    const before = useGameStore.getState().fleet.gold
    useGameStore.getState().buyGood(pg.portId, pg.goodId, 1)
    const spent = before - useGameStore.getState().fleet.gold
    if (spent !== quote) {
      buyBad++
      buyWorst = Math.max(buyWorst, Math.abs(spent - quote))
      if (samples.length < 6) samples.push(`  买 ${nameOf.get(pg.goodId)} @港${pg.portId}: 报价 ${quote} 实扣 ${spent}`)
    }

    // --- 卖出：报价 vs 实收 ---
    resetState(pg.portId, [{ goodId: pg.goodId, quantity: 5 }])
    useGameStore.setState({ fleet: { ...useGameStore.getState().fleet, fame: c.fame, trait: c.trait } })
    const sellQuote = selectSellPrice(useGameStore.getState(), pg.portId, pg.goodId)
    if (sellQuote == null) continue
    const before2 = useGameStore.getState().fleet.gold
    useGameStore.getState().sellGood(pg.portId, pg.goodId, 2)
    const earned = useGameStore.getState().fleet.gold - before2
    if (earned !== sellQuote * 2) {
      sellBad++
      sellWorst = Math.max(sellWorst, Math.abs(earned - sellQuote * 2))
      if (samples.length < 6) samples.push(`  卖 ${nameOf.get(pg.goodId)} @港${pg.portId}: 报价 ${sellQuote} 实收 ${earned}`)
    }
  }

  console.log(`\n[${c.label}]  m = ${priceMultiplier({ fame: c.fame, trait: c.trait }).toFixed(3)}`)
  console.log(`  买入价不一致 ${buyBad}/${portGoods.length} (最大差 ${buyWorst})   卖出价不一致 ${sellBad}/${portGoods.length} (最大差 ${sellWorst})`)
  samples.forEach(s => console.log(s))
  totalBad += buyBad + sellBad
}

console.log(totalBad === 0
  ? '\n结论：报价与实际结算完全一致（0 处偏差）'
  : `\n结论：仍有 ${totalBad} 处偏差，需要修`)
process.exit(totalBad === 0 ? 0 : 1)
