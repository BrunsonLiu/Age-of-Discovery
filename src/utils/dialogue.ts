/**
 * 剧情对白数据与纯逻辑——"疯狂的戴夫"式角色致辞。
 *
 * 数据与表现分离：这里只定义「谁来说、说什么」，
 * 滑入 / 打字机 / 键盘交互在 components/ui/DialogueOverlay.tsx。
 * 立绘直接复用 E 组肖像（src/data/portraits.ts 的槽位），零新增素材。
 *
 * 新增一段剧情 = 在 DIALOGUE_SCRIPTS 里加一条数据 + 在触发点调 open(id)，
 * 组件、键盘、防重播机制全部自动就位。
 */
import { officerPortrait } from '@/data/portraits'

const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/'

export interface Speaker {
  id: string
  /** 名牌上的名字 */
  name: string
  /** 名牌下的身份小字 */
  title: string
  /** 立绘路径；槽位取不到时为 undefined（组件不渲染立绘，只留对话框） */
  portrait: string | undefined
  /** 从屏幕哪侧入场 */
  side: 'left' | 'right'
}

export const SPEAKERS: Record<string, Speaker> = {
  pilot: {
    id: 'pilot',
    name: '老领航员',
    title: '塞维利亚 · 引路人',
    portrait: officerPortrait('pilot'),
    side: 'left',
  },
}

export interface DialogueScript {
  id: string
  speakerId: string
  /**
   * 逐句的立绘覆盖（可选）。
   *
   * 台词的情绪是变的：宽慰 → 严肃 → 期许，用同一张脸说三句话，
   * 感染力就丢了一半。老领航员的三张表情差分（calm/serious/hope）
   * 早就画好了，只是从没接进来——这个字段就是给它们用的。
   * 未指定的句子沿用 speaker.portrait。
   */
  lines: string[]
  /** 与 lines 等长：每句用哪张立绘（下标对应）。空缺表示用默认立绘 */
  portraits?: (string | undefined)[]
}

export const DIALOGUE_SCRIPTS: DialogueScript[] = [
  {
    id: 'opening_pilot',
    speakerId: 'pilot',
    lines: [
      '风向西南，潮信未起——今天是出海的好日子，船长。',
      '记住：罗盘指向野心，而帆指向风。这两样，从来不是一回事。',
      '去吧。等你的故事传回这条海岸，我会第一个登上灯塔望你。',
    ],
    // 三句对应三种表情：宽慰 → 严肃 → 期许。
    // 立绘差分素材（第二批 P3）在 assets/portraits/ 下，早已存在但一直没用上。
    portraits: [
      `${BASE}assets/portraits/officer_pilot_calm.png`,
      `${BASE}assets/portraits/officer_pilot_serious.png`,
      `${BASE}assets/portraits/officer_pilot_hope.png`,
    ],
  },
]

/** 开局致辞的剧本 id（MainMap 开局触发点用） */
export const OPENING_SCRIPT_ID = 'opening_pilot'

export function getScript(id: string): DialogueScript | undefined {
  return DIALOGUE_SCRIPTS.find(s => s.id === id)
}

export function getSpeaker(script: DialogueScript): Speaker | undefined {
  return SPEAKERS[script.speakerId]
}

/**
 * 推进一句：返回下一句下标；已在末句则返回 -1（表示整段结束）。
 * total<=0 的防御性返回 -1，避免空剧本把界面卡在"永远打不完"状态。
 */
export function advanceDialogueIndex(current: number, total: number): number {
  if (total <= 0) return -1
  return current + 1 < total ? current + 1 : -1
}
