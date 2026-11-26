import { moonAt, moonLitPoints } from '@/utils/moon'

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
  const r = size / 2 - 0.9
  const c = size / 2
  /*
   * 亮区多边形由 `utils/moon` 算（形状对不对可以用面积核对 —— 见那边的注释：
   * 第一版用 SVG 两段弧，娥眉月被画成了"几乎整圆"，而所有 DOM 断言都是绿的）。
   */
  const pts = moonLitPoints(day, r, 14)
  const d = pts.length === 0
    ? ''
    : `M ${pts.map(([x, y]) => `${(c + x).toFixed(2)} ${(c + y).toFixed(2)}`).join(' L ')} Z`

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
      data-illum={m.illum.toFixed(3)}
      data-day={day}
      title={`第 ${day} 天 · ${m.name}（${Math.round(m.illum * 100)}% 亮）—— ${hint}`}
      aria-label={`${m.name}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {/* 暗面：一圈很淡的轮廓，新月时也能看见"那里有月亮" */}
        <circle cx={c} cy={c} r={r} fill="#241f14" stroke="#8a7333" strokeOpacity="0.55" strokeWidth="0.8" />
        {d && <path d={d} fill="#f4ead0" />}
      </svg>
    </span>
  )
}
