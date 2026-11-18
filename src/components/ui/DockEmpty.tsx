import { Anchor } from 'lucide-react'
import FullScreenPanel from '@/components/ui/FullScreenPanel'
import { DOCK_TABS } from '@/components/ui/dockTabs'
import type { PanelType } from '@/types'

/**
 * 靠岸类面板在"用不了"时的空态。
 *
 * 【为什么需要它】
 * 侧栏与顶栏页签都是**恒定入口**：玩家在任何时刻都能点到「港口 / 贸易 / 造船」。
 * 而这三块的数据源是 `fleet.currentPortId`，离港那一刻就被置成 null
 * （见 store 的 sailToWaypoint）—— 于是航行中点过去，组件 `return null`，
 * 屏幕上什么都不发生。玩家读到的不是"我在海上"，而是"这个按钮坏了"。
 *
 * 空态至少要交代三件事：我在哪、为什么没有、现在能做什么。
 * `footer` 传一句可执行的去向，别写"请稍后再试"这类空话。
 */
export default function DockEmpty({
  testId, title, activeTab, onClose, onTab, hint,
}: {
  testId: string
  title: string
  activeTab: PanelType
  onClose: () => void
  onTab?: (key: PanelType) => void
  hint: string
}) {
  return (
    <FullScreenPanel
      testId={testId}
      title={title}
      subtitle="在海上"
      tabs={DOCK_TABS}
      activeTab={activeTab}
      onTab={onTab}
      footer="回到海图继续航行；靠岸后再打开这一页"
      onClose={onClose}
    >
      <div className="rounded-sm border border-gold-700/25 bg-black/20 px-5 py-8 text-center">
        <Anchor size={22} className="mx-auto text-gold-500 opacity-70" aria-hidden="true" />
        <p className="text-gold-300 font-serif text-[14px] mt-2.5">船还在海上</p>
        <p className="text-gold-500 font-serif text-[13px] mt-2 leading-relaxed max-w-md mx-auto">
          {hint}
        </p>
      </div>
    </FullScreenPanel>
  )
}
