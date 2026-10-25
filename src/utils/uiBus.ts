/**
 * UI 命令总线：键盘 → 界面组件的单向广播。
 *
 * 键盘钩子不该知道 EventCard 里藏着哪些 state，
 * 组件也不该各自挂 keydown。这里只传"意图"（选第几个、继续、确认、取消），
 * 由对应组件自行决定怎么执行。
 */

export type UiCommand =
  | { type: 'event:choice'; index: number }
  | { type: 'event:continue' }
  | { type: 'voyage:confirm' }
  | { type: 'voyage:cancel' }
  | { type: 'segment:choose'; stance: 'rush' | 'steady' | 'careful' }
  | { type: 'dialogue:advance' }
  | { type: 'dialogue:skip' }

type UiHandler = (cmd: UiCommand) => void

const handlers = new Set<UiHandler>()

/** 订阅 UI 命令，返回取消订阅函数 */
export function onUiCommand(handler: UiHandler): () => void {
  handlers.add(handler)
  return () => { handlers.delete(handler) }
}

/** 广播 UI 命令（无订阅者时静默丢弃） */
export function emitUiCommand(cmd: UiCommand): void {
  for (const h of handlers) h(cmd)
}

/* ---- 事件小游戏的输入占用标记 ----
 *
 * 小游戏运行期间，事件卡仍在 gamePhase='event'，
 * 全局键盘钩子会把空格 / 数字键当成"选选项 / 继续"抢走。
 * 这里用一个模块级标志让钩子知道"现在键盘归小游戏管"。
 */
let miniGameActive = false

export function setMiniGameActive(active: boolean): void {
  miniGameActive = active
}

export function isMiniGameActive(): boolean {
  return miniGameActive
}
