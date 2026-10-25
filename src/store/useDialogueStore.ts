import { create } from 'zustand'
import { advanceDialogueIndex, getScript } from '@/utils/dialogue'
import { useGameStore } from '@/store/useGameStore'

/**
 * 剧情对白的瞬态状态。
 *
 * 刻意放在**不持久化**的独立 store 里（同 useFxStore 的思路）：
 * 刷新页面时瞬态清零，靠主存档的 dialogueSeen 防止同一段致辞重播——
 * open() 第一时间就往 dialogueSeen 记账，刷新重进时 MainMap 的触发点
 * 见它已看过，不再拉起。
 */
interface DialogueStore {
  scriptId: string | null
  lineIndex: number
  /** 打开一段剧本（幂等；未知 id 静默忽略） */
  open: (scriptId: string) => void
  /** 推进一句；末句之后整段关闭 */
  advance: () => void
  /** 跳过整段（Esc） */
  skip: () => void
}

export const useDialogueStore = create<DialogueStore>((set, get) => ({
  scriptId: null,
  lineIndex: 0,

  open: (scriptId) => {
    const script = getScript(scriptId)
    if (!script) return
    // 开场即记账：刷新不重播
    useGameStore.getState().markDialogueSeen(scriptId)
    set({ scriptId, lineIndex: 0 })
  },

  advance: () => {
    const { scriptId, lineIndex } = get()
    const script = scriptId ? getScript(scriptId) : undefined
    if (!script) return
    const next = advanceDialogueIndex(lineIndex, script.lines.length)
    if (next < 0) set({ scriptId: null, lineIndex: 0 })
    else set({ lineIndex: next })
  },

  skip: () => set({ scriptId: null, lineIndex: 0 }),
}))
