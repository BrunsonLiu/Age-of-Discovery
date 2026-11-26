import { moonAt } from '@/utils/moon'

/**
 * 月相圆盘（顶栏）。
 *
 * 【为什么是"一个会缺的圆"而不是"满月"两个字】月相是**连续的形变**：
 * 从新月到满月再回来，玩家该在余光里看出"今晚有月亮" —— 字得读，形状不用。
 * 这与"量要被看见"是同一条：能成为形状的东西不要写成句子。
 *
 * 画法（标准做法，两条弧）：先画亮面那半个圆，再用一段椭圆弧把明暗交界补上。
 *   · cos(2πphase) > 0（靠近新月）→ 交界弧向亮面鼓，得到**娥眉月**
 *   · < 0（靠近满月）→ 交界弧向暗面鼓，得到**凸月**
 * 这样八相都能由同一条路径画出来，不需要八张图。
 *
 * 只在 `sm` 以上显示：390 宽的顶栏已经装满（年份、事件、声望），
 * 多一个圆盘会把"正在发生什么"挤掉——那个比月亮重要。
 */
export default function MoonPhase({ day, size = 16 }: { day: number; size?: number }) {
  const m = moonAt(day)
  const r = size / 2 - 0.5
  const c = size / 2
  const k = Math.cos(m.phase * Math.PI * 2)   // 1 = 新月，-1 = 满月
  const rx = Math.abs(k) * r
  /* 亮面：waxing 在右，waning 在左 */
  const sweepHalf = m.waxing ? 1 : 0
  /* 交界弧：靠近新月时向亮面鼓（同向），靠近满月时向暗面鼓（反向） */
  const sweepBack = (k >= 0) === m.waxing ? sweepHalf : 1 - sweepHalf
  const d = m.illum < 0.005
    ? '' // 新月：完全不亮，只留轮廓
    : `M ${c} ${c - r} A ${r} ${r} 0 0 ${sweepHalf} ${c} ${c + r} A ${rx} ${r} 0 0 ${sweepBack} ${c} ${c - r} Z`

  const hint = m.illum >= 0.8
    ? '月明：夜航看得远，也更容易被看见（遭遇略多）'
    : m.illum <= 0.2
      ? '月暗：海面安静，遭遇略少'
      : '月光一般'
  return (
    <span
      className="hidden sm:flex items-center shrink-0"
      data-testid="moon-phase"
      data-phase={m.key}
      data-illum={m.illum.toFixed(2)}
      data-day={day}
      title={`第 ${day} 天 · ${m.name}（${Math.round(m.illum * 100)}% 亮）—— ${hint}`}
      aria-label={`${m.name}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {/* 暗面：一圈很淡的轮廓，新月时也能看见"那里有月亮" */}
        <circle cx={c} cy={c} r={r} fill="#2a2418" stroke="#8a7333" strokeOpacity="0.55" strokeWidth="0.9" />
        {d && <path d={d} fill="#f2e7c4" />}
      </svg>
    </span>
  )
}
