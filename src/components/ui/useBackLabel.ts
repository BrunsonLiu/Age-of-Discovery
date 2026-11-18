import { useMapStore } from '@/store/useMapStore'

/**
 * 整屏面板右上那颗退出按钮的文字。
 *
 * 【为什么不能写死"回海图"】
 * 面板可以从两个地方打开：海图上点侧栏，或岸上点商行/船厂/酒馆。
 * 从岸上打开时，按下去的是 `setActivePanel(null)`，`viewMode` 仍是 'harbor' ——
 * 玩家回到的是**岸上**，不是海图。实测：
 *   面板上写「回海图」，点完 `viewMode === 'harbor'`、`harbor-view` 还在。
 * 这不是措辞问题：按钮在承诺一件它做不到的事，而"界面承诺要兑现"
 * 是这个项目的硬规矩（帮助面板曾因为写没做的事被改过三次）。
 *
 * 关掉面板只是"离开这一页"，回到哪一页由 viewMode 决定 —— 文字就该跟着它。
 */
export function useBackLabel(): string {
  const viewMode = useMapStore(s => s.viewMode)
  return viewMode === 'harbor' ? '回岸上' : '回海图'
}
