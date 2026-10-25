import type { ReactNode } from 'react'

interface ResourceBarProps {
  value: number
  maxValue: number
  label: string
  icon?: ReactNode
  /**
   * 数值右侧的补充说明，例如「还能撑 6.2 天」。
   *
   * 单独一个数量对玩家是不可行动的：68 份粮既可能是富余也可能是等死，
   * 差别全在每天吃多少、还要走几天。把折算结果摆在数字旁边，
   * 这条进度条才从装饰变成决策依据。
   */
  hint?: string
  /** 提示文案的颜色基调（默认跟随数值水位） */
  hintTone?: 'normal' | 'warn' | 'critical'
  /**
   * 变色阈值（按**数值**，不是百分比）。
   *
   * 为什么需要它：默认的 60% / 30% 对耐久度是合理的，但对士气不是——
   * 游戏的低士气规则是「< 45」（store 里 lowMorale 的判定线，
   * 低于它忠诚度每天掉 3）。若沿用 30%，士气 38 会显示成金色，
   * 而系统已经在按「士气崩溃」处理了——颜色在骗人。
   */
  warnBelow?: number
  criticalBelow?: number
}

/**
 * 水位配色。
 *
 * 阈值可以用数值覆盖（warnBelow / criticalBelow），
 * 因为「多少算危险」对不同资源是不同的规则：
 * 耐久度看百分比，士气看 45 这条绝对线，粮水看到港天数。
 * 让所有资源共用一组百分比阈值，就等于让颜色说谎。
 *
 * 导出以便测试：这是一条**规则**，不是样式——
 * 规则必须能在没有浏览器的情况下被验证。
 */
export function getStatusColor(value: number, maxValue: number, warnBelow?: number, criticalBelow?: number): string {
  const warn = warnBelow ?? maxValue * 0.6
  const critical = criticalBelow ?? maxValue * 0.3
  if (value <= critical) return 'bg-danger-400'
  if (value <= warn) return 'bg-gold-400'
  return 'bg-safe-400'
}

export default function ResourceBar({
  value, maxValue, label, icon, hint, hintTone = 'normal', warnBelow, criticalBelow,
}: ResourceBarProps) {
  const pct = Math.min(100, Math.max(0, (value / maxValue) * 100))
  const statusColor = getStatusColor(value, maxValue, warnBelow, criticalBelow)
  const hintColor =
    hintTone === 'critical' ? 'text-danger-300'
      : hintTone === 'warn' ? 'text-gold-300'
        : 'text-gold-500'

  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      {icon && <span className="text-gold-400 flex-shrink-0">{icon}</span>}
      <div className="flex-1">
        <div className="flex justify-between items-baseline mb-0.5">
          <span className="text-xs text-gold-300 font-serif">{label}</span>
          <span className="flex items-baseline gap-1.5">
            {hint && <span className={`text-[10px] font-serif ${hintColor}`}>{hint}</span>}
            <span className="text-xs text-gold-400 font-mono">
              {value}/{maxValue}
            </span>
          </span>
        </div>
        <div className="h-1.5 bg-ocean-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${statusColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
