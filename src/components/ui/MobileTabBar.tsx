import type { ViewMode } from '@/store/useMapStore'
import type { ReactNode } from 'react'
import { Anchor, Compass, HelpCircle } from 'lucide-react'
import type { PanelType } from '@/types'
import { useWideViewport } from '@/hooks/useIsMobile'

interface MobileTabBarProps {
  /** 面板入口按钮（顺序即排列顺序） */
  buttons: { type: PanelType; icon: ReactNode; label: string; badge?: number }[]
  activePanel: PanelType
  onToggle: (panel: PanelType) => void
  showHelp: boolean
  onToggleHelp: () => void
  /** 第二空间的常驻开关：海图 / 岸上 */
  viewMode: ViewMode
  canAshore: boolean
  onToggleView: () => void
}

interface Item {
  key: string
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
  badge?: number
  disabled?: boolean
  /** 空间切换不是"再开一个面板"，视觉上要和九个面板入口分开 */
  emphasis?: boolean
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
 * 又能让所有入口全部可见（而不是藏在"更多"里）的位置。
 *
 * 两行而非一行：十个入口一行排开需要 ~520px，横向滚动会把「港口」「贸易」
 * 这类高频入口推到屏幕外——玩家找不到，就等于没有。
 *
 * 高度固定在 ~76px（两行 × 38px），不随按钮数变化。
 */
export default function MobileTabBar({
  buttons, activePanel, onToggle, showHelp, onToggleHelp,
  viewMode, canAshore, onToggleView,
}: MobileTabBarProps) {
  const renderButton = (it: Item) => (
    <button
      key={it.key}
      onClick={it.onClick}
      disabled={it.disabled}
      aria-label={it.label}
      aria-pressed={it.active}
      title={it.disabled ? '还在海上，靠岸后才能上岸' : it.label}
      data-testid={it.key === 'view' ? 'view-mode-switch' : undefined}
      className={`relative flex flex-col items-center justify-center gap-1 py-2 rounded-md transition-all duration-200 active:scale-95 ${
        it.disabled
          ? 'opacity-40 cursor-not-allowed text-gold-600'
          : it.active
            ? 'bg-gold-700/60 text-gold-100'
            : 'text-gold-400 active:bg-ocean-700/60'
      } ${it.emphasis && !it.disabled ? 'ring-1 ring-gold-500/45' : ''}`}
    >
      <span className="shrink-0 flex items-center justify-center">{it.icon}</span>
      <span className="font-serif text-xs leading-none whitespace-nowrap">{it.label}</span>
      {/* 新见闻的小圆点：移动端没有侧栏，这个信号不能只在桌面有 */}
      {it.badge != null && it.badge > 0 && (
        <span
          className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-gold-300"
          aria-label={`${it.badge} 页新见闻`}
        />
      )}
    </button>
  )

  /*
   * 第一个位置留给「海图 ↔ 岸上」。
   * 上一轮的第二空间只有港口面板里的一个入口 + 9 秒自动收的到港邀请，
   * 玩家完全可能整局都没发现还有另一个景别。把它放进主导航、并且**一直在**，
   * 才真正回答"感觉就一个界面"。
   */
  const all: Item[] = [
    {
      key: 'view',
      icon: viewMode === 'harbor' ? <Compass size={18} /> : <Anchor size={18} />,
      label: viewMode === 'harbor' ? '回海图' : '上岸',
      active: viewMode === 'harbor',
      onClick: onToggleView,
      disabled: !canAshore && viewMode !== 'harbor',
      emphasis: true,
    },
    ...buttons.map(b => ({
      key: b.type,
      icon: b.icon,
      label: b.label,
      active: activePanel === b.type,
      onClick: () => onToggle(b.type),
      badge: b.badge,
    })),
    { key: 'help', icon: <HelpCircle size={18} />, label: '帮助', active: showHelp, onClick: onToggleHelp },
  ]

  const left = all.slice(0, 5)
  const right = all.slice(5)
  /*
   * 横屏（宽 ≥ 640）排成一行。
   *
   * 竖屏两行是因为十个入口一行排不下（约需 520px，实际只有 390px）。
   * 但横屏宽 844px 时一行绰绰有余，而横屏最缺的是**高度**：
   * 两行 84px 占掉 390px 里的 21%，一行只要 44px。
   */
  const singleRow = useWideViewport()

  return (
    <div
      data-testid="mobile-tab-bar"
      data-rows={singleRow ? '1' : '2'}
      className="bg-ocean-900/95 backdrop-blur-sm border-t border-gold-700/30 px-1 pt-1"
      // 定位交给外层容器（与底栏叠在一起），这里只管自己的样式。
      style={{ paddingBottom: 'max(4px, env(safe-area-inset-bottom))' }}
    >
      {singleRow ? (
        <div className="grid grid-cols-10 gap-0.5">
          {all.map(renderButton)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-5 gap-0.5">
            {left.map(renderButton)}
          </div>
          <div className="grid grid-cols-5 gap-0.5 mt-0.5">
            {right.map(renderButton)}
          </div>
        </>
      )}
    </div>
  )
}
