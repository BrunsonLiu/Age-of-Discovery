// 单独验证瞭望的展示阶段时序
import {
  advanceLookout, createLookoutState, pressLookout,
  type MiniGameModifiers,
} from '../src/utils/miniGame'

const noMods: MiniGameModifiers = { windowBonus: 0, forgiveness: 0, edgeBonus: 0 }
const s = createLookoutState(() => 0.5)
console.log('初始:', JSON.stringify({ phase: s.phase, litIndex: s.litIndex, timer: s.timer, seq: s.sequence }))

let t = 0
let lastPhase = s.phase
while (t < 20) {
  advanceLookout(s, 0.05, noMods)
  if (s.phase !== lastPhase) {
    console.log(`t=${t.toFixed(2)} phase: ${lastPhase} → ${s.phase} (litIndex=${s.litIndex}, timer=${s.timer.toFixed(2)})`)
    lastPhase = s.phase
  }
  if (s.phase === 'input') { console.log('>>> 进入 input'); break }
  t += 0.05
}
console.log('最终 phase:', s.phase, 'litIndex:', s.litIndex, 'timer:', s.timer.toFixed(2))
console.log('序列:', s.sequence.join(','))

// 模拟按对
if (s.phase === 'input') {
  for (const d of s.sequence) {
    const r = pressLookout(s, d)
    console.log('按', d, '→', JSON.stringify({ ok: r.ok, cleared: r.cleared, failed: r.roundFailed }))
  }
}
