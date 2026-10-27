// 量化核验：贸易面板的「便宜/昂贵」颜色提示对玩家是否真的有用
//
// 提示语义（TradePanel.tsx）：priceDiff = 报价 - good.basePrice
//   priceDiff < 0 → 绿色（相对基准价便宜），> 0 → 红色（昂贵）
//
// 两个问题要分清：
//   ① 颜色依据的价是不是玩家真付的价？—— 修复前面板自算公式漏乘系数，
//      颜色与真实结算不同源（现已统一到 selectBuyPrice）。
//   ② 颜色指向的结论对不对？—— 「相对基准价便宜」未必等于
//      「这里是全港最低价」。若大量条目标绿却不是最便宜的港，
//      玩家按颜色选港就会亏钱。
import { portGoods } from '../src/data/ports'
import { goods } from '../src/data/goods'
import { selectBuyPrice, useGameStore } from '../src/store/useGameStore'

const baseOf = new Map(goods.map(g => [g.id, g.basePrice]))
const nameOf = new Map(goods.map(g => [g.id, g.nameCn]))

const ship = {
  id: 1, name: '核验船', type: 'caravel', speed: 5, durability: 50,
  maxDurability: 100, capacity: 9999, usedCapacity: 0, crew: 30, maxCrew: 40,
}

// 固定一份干净状态：声望 0、特质默认、二条线归零
useGameStore.setState({
  fleet: {
    ...useGameStore.getState().fleet,
    gold: 9999999, currentPortId: 1, isSailing: false, ships: [ship], cargo: [],
  },
  marketStock: {},
  officers: [], crewRoster: [],
  factionRep: { crown: 0, guild: 0, scholars: 0, brethren: 0 },
  notoriety: { cruel: 0, mercy: 0, greed: 0, bold: 0, secret: 0 },
})

// 各商品在每个港的报价
const quoteAt = new Map() // `${portId}:${goodId}` -> price
for (const pg of portGoods) {
  const q = selectBuyPrice(useGameStore.getState(), pg.portId, pg.goodId)
  if (q != null) quoteAt.set(`${pg.portId}:${pg.goodId}`, q)
}

const tone = (diff) => (diff < 0 ? '绿' : diff > 0 ? '红' : '金')
let greenTotal = 0, greenIsCheapest = 0, redTotal = 0, redIsDearest = 0
const misleading = []

for (const g of goods) {
  const entries = portGoods.filter(p => p.goodId === g.id)
  if (entries.length < 2) continue
  const base = baseOf.get(g.id)
  const priced = entries.map(p => ({ portId: p.portId, price: quoteAt.get(`${p.portId}:${g.id}`) }))
  const min = Math.min(...priced.map(p => p.price))
  const max = Math.max(...priced.map(p => p.price))
  for (const p of priced) {
    const t = tone(p.price - base)
    if (t === '绿') {
      greenTotal++
      if (p.price === min) greenIsCheapest++
      else if (misleading.length < 8) misleading.push(`  ${g.nameCn} @港${p.portId}: 标绿（${p.price}）但最便宜的是 ${min}`)
    } else if (t === '红') {
      redTotal++
      if (p.price === max) redIsDearest++
    }
  }
}

console.log(`\n绿色（相对基准价便宜）条目：${greenTotal}，其中确实是全港最低价：${greenIsCheapest}（${(greenIsCheapest / greenTotal * 100).toFixed(1)}%）`)
console.log(`红色（相对基准价昂贵）条目：${redTotal}，其中确实是全港最高价：${redIsDearest}（${(redIsDearest / redTotal * 100).toFixed(1)}%）`)
console.log('\n标绿却不是最便宜的例子：')
misleading.forEach(s => console.log(s))
console.log('\n说明：颜色是「相对世界基准价」的信号，不是「相对其它港口」的信号。')
console.log('      玩家若想找最便宜的港口，应看「本地特产 / 高价收购」提示，而不是只看颜色。')
