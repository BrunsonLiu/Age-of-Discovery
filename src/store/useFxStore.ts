import { create } from 'zustand'
import type { CueName } from '@/utils/audio'

/**
 * 一次性消费的特效总线。
 *
 * 游戏里的「收获瞬间」分散在各处组件（买卖、发现港口、交付任务、事件结算），
 * 但它们都不该各自去管音效和动画。这里只做一件事：任意组件抛出事件，
 * FxLayer 取走并清空，负责播放。
 *
 * 刻意放在**不持久化**的独立 store 里——特效是瞬时的，
 * 若混进主存档会导致刷新后重放一遍。
 */
export interface FxEvent {
  id: string
  /** float=在场地上飘一个数字；flash=全屏闪光；banner=屏下横幅；cue=纯音效 */
  kind: 'float' | 'flash' | 'banner' | 'cue'
  tone: 'gold' | 'danger' | 'safe' | 'plain'
  text: string
  sub?: string
  /** toast 位置，百分比（相对地图区域） */
  x?: number
  y?: number
  /** 仅 kind==='banner'/'cue' 时使用 */
  sound?: CueName
}

interface FxStore {
  events: FxEvent[]
  /** 只出声，不出画（用于每一步的小反馈） */
  cue: (name: CueName) => void
  /** 视觉特效 + 可选音效 */
  fx: (event: Omit<FxEvent, 'id'>, sound?: CueName) => void
  /** FxLayer 取走并清空 */
  consume: () => FxEvent[]
}

let seq = 0
const nextId = () => `fx-${Date.now()}-${seq++}`

export const useFxStore = create<FxStore>((set, get) => ({
  events: [],

  cue: (name) => set((state) => ({
    events: [...state.events, { id: nextId(), kind: 'cue', tone: 'plain', text: '', sound: name }],
  })),

  fx: (event, sound) => set((state) => {
    const added: FxEvent[] = [{ ...event, id: nextId() }]
    if (sound) added.push({ id: nextId(), kind: 'cue', tone: 'plain', text: '', sound })
    return { events: [...state.events, ...added] }
  }),

  consume: () => {
    const events = get().events
    if (events.length > 0) set({ events: [] })
    return events
  },
}))
