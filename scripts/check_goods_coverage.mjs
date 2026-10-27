// 统计每种商品在多少个港口经营，用于判断「死货」风险
// 目的：若某商品只在极少港口经营，玩家带着它到不经营的港口会卡死
import { portGoods } from '../src/data/ports'
import { goods } from '../src/data/goods'

const byGood = new Map()
for (const pg of portGoods) {
  if (!byGood.has(pg.goodId)) byGood.set(pg.goodId, [])
  byGood.get(pg.goodId).push(pg.portId)
}
const portIds = new Set(portGoods.map(p => p.portId))

console.log(`有商品的港口数: ${portIds.size}，商品条目数: ${portGoods.length}，商品种类: ${goods.length}`)
console.log('')
for (const g of goods) {
  const ports = byGood.get(g.id) || []
  const flag = ports.length <= 2 ? '  ← 覆盖极少，死货风险' : ''
  console.log(`  ${String(g.id).padStart(2)} ${g.nameCn.padEnd(6)} ${String(ports.length).padStart(2)} 个港口经营  [${ports.join(', ')}]${flag}`)
}
