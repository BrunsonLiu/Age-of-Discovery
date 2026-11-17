import type { ReactNode } from 'react'
import { getStatusColor } from '@/utils/resourceColor'

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
    /*
     * 【单行对齐】原来是「标签 + 提示 + 数值」一行、进度条另一行的两行结构：
     * 舰队面板里连排四条时，每条占 44px，四条读起来像四段互不相干的小卡片，
     * 而真正要比的是**条的长度** —— 被压到第二行之后，四条的口径反而看不清。
     * 现在统一成一行：图标 | 标签（定宽）| 条（吃满剩余）| 提示 | 数值（右对齐定宽）。
     * 四条的槽起点、填充终点、数字右边界都在同一条竖线上。
     */
    <div className="flex items-center gap-2 md:gap-2.5 min-w-0">
      {icon && <span className="text-gold-400 shrink-0 flex items-center">{icon}</span>}
      <span className="text-[13px] text-gold-300 font-serif w-8 shrink-0">{label}</span>
      <div className="flex-1 min-w-[48px] h-1.5 bg-black/30 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${statusColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint && (
        <span className={`hidden sm:inline text-[12px] font-serif shrink-0 ${hintColor}`}>{hint}</span>
      )}
      <span className="text-[12px] text-gold-400 font-mono tabular-nums w-[4.5rem] text-right shrink-0">
        {value}/{maxValue}
      </span>
    </div>
  )
}
