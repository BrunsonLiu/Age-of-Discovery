// 量化核验：贸易面板的颜色提示是否可信、是否有行动价值
//
// 新语义（修复后）：
//   绿 = 该商品在所有经营它的港口里当前买价最低（要买就在这买）
//   红 = 当前买价最高（别在这买）
//   金 = 居中
//
// 旧语义是「相对全局基准价便宜/昂贵」——量过：36 个标绿条目里只有
// 9 个（25%）真是全港最低价，玩家看绿色买，实际买贵了一倍。
//
// 这个脚本查两件事：
//   ① 档位本身自洽吗？（标绿的是否真是全港最低，标红的是否真是最高）
//   ② 颜色对玩家有用吗？（每个港口能看到几个「这里最便宜」的信号）
import { portGoods } from '../src/data/ports'
import { goods } from '../src/data/goods'
import { selectBuyPrice, selectPriceTone, useGameStore } from '../src/store/useGameStore'

const nameOf = new Map(goods.map(g => [g.id, g.nameCn]))

const ship = {
  id: 1, name: '核验船', type: 'caravel', speed: 5, durability: 50,
  maxDurability: 100, capacity: 9999, usedCapacity: 0, crew: 30, maxCrew: 40,
}

// 固定一份干净状态
useGameStore.setState({
  fleet: {
    ...useGameStore.getState().fleet,
    gold: 9999999, fame: 0, currentPortId: 1, isSailing: false, ships: [ship], cargo: [],
  },
  marketStock: {},
  officers: [], crewRoster: [],
  factionRep: { crown: 0, guild: 0, scholars: 0, brethren: 0 },
  notoriety: { cruel: 0, mercy: 0, greed: 0, bold: 0, secret: 0 },
})

let cheap = 0, cheapIsMin = 0, expensive = 0, expensiveIsMax = 0, normal = 0
const bad = []
const perPort = new Map()

for (const g of goods) {
  const ports = portGoods.filter(p => p.goodId === g.id)
  if (ports.length === 0) continue
  const prices = ports.map(p => selectBuyPrice(useGameStore.getState(), p.portId, g.id))
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  ports.forEach((p, i) => {
    const tone = selectPriceTone(useGameStore.getState(), p.portId, g.id)
    if (tone === 'cheap') {
      cheap++
      if (prices[i] === min) cheapIsMin++
      else bad.push(`  ${g.nameCn}@港${p.portId}: 标绿但不是最低价（${prices[i]} vs ${min}）`)
      perPort.set(p.portId, (perPort.get(p.portId) || 0) + 1)
    } else if (tone === 'expensive') {
      expensive++
      if (prices[i] === max) expensiveIsMax++
      else bad.push(`  ${g.nameCn}@港${p.portId}: 标红但不是最高价（${prices[i]} vs ${max}）`)
    } else {
      normal++
      if (prices[i] === min || prices[i] === max) {
        bad.push(`  ${g.nameCn}@港${p.portId}: 标中性却是极值（${prices[i]}）`)
      }
    }
  })
}

console.log(`\n绿色（这里最便宜）：${cheap} 条，其中确实是全港最低价：${cheapIsMin}（${(cheapIsMin / Math.max(1, cheap) * 100).toFixed(1)}%）`)
console.log(`红色（这里最贵）：  ${expensive} 条，其中确实是全港最高价：${expensiveIsMax}（${(expensiveIsMax / Math.max(1, expensive) * 100).toFixed(1)}%）`)
console.log(`金色（居中）：      ${normal} 条`)

const counts = [...perPort.values()]
const avg = counts.reduce((a, b) => a + b, 0) / Math.max(1, counts.length)
console.log(`\n每个港口平均能看到 ${avg.toFixed(2)} 个「这里最便宜」的信号（共 ${perPort.size} 个港有信号）`)
console.log('信号数量：' + JSON.stringify(counts.sort((a, b) => b - a)))

if (bad.length) {
  console.log('\n档位不自洽的地方：')
  bad.forEach(s => console.log(s))
} else {
  console.log('\n档位全部自洽：标绿 = 全港最低，标红 = 全港最高。')
}
process.exit(bad.length === 0 ? 0 : 1)
