// 议价风险曲线实测
import {
  HAGGLE_FLOOR, HAGGLE_RAISE_STEP, HAGGLE_START_PRICE,
  advanceHaggle, createHaggleState, haggleAction,
  type HaggleAction,
} from '../src/utils/miniGame'

// 模拟"一味加价"，统计第 N 次加价的谈崩率
console.log('=== 一味加价：第 N 次加价的谈崩率 ===')
const N = 3000
const brokeAt = new Map<number, number>()
let survived = 0
for (let i = 0; i < N; i++) {
  const s = createHaggleState()
  for (let k = 1; k <= 8; k++) {
    advanceHaggle(s, 0.016, Math.random)
    if (s.finished) break
    const r = haggleAction(s, 'raise', Math.random)
    if (r.broke) { brokeAt.set(k, (brokeAt.get(k) || 0) + 1); break }
    if (k === 8) survived++
  }
}
for (let k = 1; k <= 8; k++) {
  const c = brokeAt.get(k) || 0
  const cum = [...brokeAt.entries()].filter(([kk]) => kk <= k).reduce((a, [, v]) => a + v, 0)
  console.log(`  第 ${k} 次加价：本次崩 ${c} 次 (${(c / N * 100).toFixed(1)}%)，累计崩 ${(cum / N * 100).toFixed(1)}%`)
}
console.log(`  8 次全加价仍存活：${(survived / N * 100).toFixed(1)}%`)

// "见好就收"策略：加 2 次就成交
console.log('\n=== 加 2 次就成交：成交价分布 ===')
const prices: number[] = []
let broke2 = 0
for (let i = 0; i < N; i++) {
  const s = createHaggleState()
  let done = false
  for (let k = 0; k < 3; k++) {
    advanceHaggle(s, 0.016, Math.random)
    if (s.finished) break
    const r = haggleAction(s, 'raise', Math.random)
    if (r.broke) { broke2++; done = true; break }
  }
  if (done) continue
  haggleAction(s, 'accept', Math.random)
  prices.push(s.finalPrice)
}
prices.sort((a, b) => a - b)
const med = prices[Math.floor(prices.length / 2)]
console.log(`  成交率 ${(prices.length / N * 100).toFixed(1)}%，谈崩率 ${(broke2 / N * 100).toFixed(1)}%`)
console.log(`  成交价：最低 ${prices[0]}，中位 ${med}，最高 ${prices[prices.length - 1]}（初始 ${HAGGLE_START_PRICE}）`)
