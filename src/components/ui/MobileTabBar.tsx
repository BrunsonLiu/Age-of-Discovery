import type { ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'
import type { PanelType } from '@/types'

interface MobileTabBarProps {
  /** 面板入口按钮（顺序即排列顺序） */
  buttons: { type: PanelType; icon: ReactNode; label: string }[]
  activePanel: PanelType
  onToggle: (panel: PanelType) => void
  showHelp: boolean
  onToggleHelp: () => void
}

/**
 * 移动端底部标签栏。
 *
 * 【为什么不能用桌面那两列侧边按钮】
 * 桌面版把九个面板入口竖排在屏幕左右两侧，各占 ~92px 宽。手机上
 * 屏宽只有 360-430px，两列侧栏会把地图挤成一条缝，面板则完全放不下
 * （320px 宽的面板 + 两列侧栏 > 屏宽，必然横向溢出）。
 *
 * 所以移动端改成**底部两行标签栏**：这是手机上唯一不遮挡内容、
 * 又能让九个入口全部可见（而不是藏在"更多"里）的位置。
 *
 * 两行而非一行：九个按钮一行排开需要 ~470px，横向滚动会把「港口」「贸易」
 * 这类高频入口推到屏幕外——玩家找不到，就等于没有。
 *
 * 高度固定在 ~76px（两行 × 38px），不随按钮数变化。
 */
export default function MobileTabBar({
  buttons, activePanel, onToggle, showHelp, onToggleHelp,
}: MobileTabBarProps) {
  const renderButton = (
    key: string,
    icon: ReactNode,
    label: string,
    isActive: boolean,
    onClick: () => void,
  ) => (
    <button
      key={key}
      onClick={onClick}
      aria-label={label}
      aria-pressed={isActive}
      title={label}
      className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-md transition-all duration-200 active:scale-95 ${
        isActive
          ? 'bg-gold-700/60 text-gold-100'
          : 'text-gold-400 active:bg-ocean-700/60'
      }`}
    >
      <span className="shrink-0 flex items-center justify-center">{icon}</span>
      <span className="font-serif text-[10px] leading-none whitespace-nowrap">{label}</span>
    </button>
  )

  const left = buttons.slice(0, 5)
  const right = buttons.slice(5)

  return (
    <div
      data-testid="mobile-tab-bar"
      className="bg-ocean-900/95 backdrop-blur-sm border-t border-gold-700/30 px-1 pt-1"
      // 定位交给外层容器（与底栏叠在一起），这里只管自己的样式。
      style={{ paddingBottom: 'max(4px, env(safe-area-inset-bottom))' }}
    >
      <div className="grid grid-cols-5 gap-0.5">
        {left.map(b => renderButton(
          b.type,
          b.icon,
          b.label,
          activePanel === b.type,
          () => onToggle(b.type),
        ))}
      </div>
      <div className="grid grid-cols-4 gap-0.5 mt-0.5">
        {right.map(b => renderButton(
          b.type,
          b.icon,
          b.label,
          activePanel === b.type,
          () => onToggle(b.type),
        ))}
        {renderButton(
          'help',
          <HelpCircle size={18} />,
          '帮助',
          showHelp,
          onToggleHelp,
        )}
      </div>
    </div>
  )
}
