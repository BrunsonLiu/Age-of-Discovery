import { DIALOGUE_SCRIPTS, OPENING_SCRIPT_ID } from '@/utils/dialogue'

/**
 * 彩蛋对白的触发规则。
 *
 * 【为什么单独抽成一个纯函数】
 * 触发条件一旦写进 useEffect，就只能靠"跑一遍游戏看看弹不弹"来验证——
 * 而彩蛋的判据恰恰是**边界**（水 24 弹、25 不弹；耐久 39 弹、40 不弹），
 * 这种边界只有穷举才测得干净。所以这里只做判断，MainMap 里只负责把
 * 当前状态喂进来、拿到 id 就 open。
 *
 * 【节奏：为什么有冷却】
 * 如果只看条件，会有很糟糕的连锁：某一刻水少 + 士气低 + 船破 + 到港，
 * 四条同时成立，玩家关掉一段立刻又弹一段——这正是"第一分钟弹 7 个
 * 全屏层"那个教训的复发。所以给一个按天计的额度：
 *
 *     只有 day >= 2 + 2 × （已看过段数 - 1） 时才允许再弹一段
 *
 * 也就是开局面（第 1 段）之后，最快第 2 天弹第一段彩蛋，之后每 2 天最多一段。
 * 【为什么用"已看段数"而不是存一个 lastDialogueDay】存档里没有这个字段，
 * 而 persist 没有 version/migrate，加字段要考虑旧档兜底；dialogueSeen 本来
 * 就在存档里、而且只增不减，天然就是一个"彩蛋计数器"。
 */
export interface DialogueContext {
  /** 航行天数 */
  day: number
  gold: number
  fame: number
  morale: number
  water: number
  /** 旗舰耐久（0~100） */
  durability: number
  /** 当前所在港口；航行中为 null */
  currentPortId: number | null
  /** 当前港口能不能修船（currentPortId 为 null 时无意义） */
  portHasShipyard: boolean
  /** 已发现港口数 */
  discoveredCount: number
  /** 天气种类，'clear' 以外都算"天不好" */
  weatherKind: string
  /** 已看过的剧本 id */
  seen: readonly string[]
}

interface Rule {
  id: string
  /** 一句人能看懂的触发说明，测试失败时直接打出来 */
  why: string
  when: (c: DialogueContext) => boolean
}

/**
 * 规则表。**顺序即优先级**：危急的先说（没水会死人），
 * 抒情/挑衅的排后面（晚一天讲也不影响）。
 */
export const DIALOGUE_RULES: Rule[] = [
  { id: 'egg_low_water', why: '淡水 < 25', when: (c) => c.water < 25 },
  { id: 'egg_damaged', why: '旗舰耐久 < 40', when: (c) => c.durability < 40 },
  { id: 'egg_low_morale', why: '士气 < 35', when: (c) => c.morale < 35 },
  { id: 'egg_shipyard', why: '停在能修船的港口且耐久 < 70', when: (c) => c.currentPortId !== null && c.portHasShipyard && c.durability < 70 },
  { id: 'egg_broke_cook', why: '金币 < 80', when: (c) => c.gold < 80 },
  { id: 'egg_fame_maria', why: '声望 ≥ 20', when: (c) => c.fame >= 20 },
  { id: 'egg_rich_blackjack', why: '金币 ≥ 2500', when: (c) => c.gold >= 2500 },
  { id: 'egg_many_ports', why: '已发现 ≥ 6 座港口', when: (c) => c.discoveredCount >= 6 },
  { id: 'egg_storm_midshipman', why: '天气不是晴', when: (c) => c.weatherKind !== 'clear' },
  { id: 'egg_first_dock', why: '第 3 天之后、停靠在港', when: (c) => c.currentPortId !== null && c.day >= 3 },
  { id: 'egg_long_voyage', why: '第 12 天之后', when: (c) => c.day >= 12 },
  { id: 'egg_stars_diego', why: '第 20 天之后', when: (c) => c.day >= 20 },
  { id: 'egg_veteran', why: '第 30 天之后', when: (c) => c.day >= 30 },
]

/** 当前允许弹第几段（含开场致辞那一段的额度） */
export function dialogueBudget(seenCount: number): number {
  return 2 + 2 * Math.max(0, seenCount - 1)
}

/**
 * 挑一段该弹的彩蛋；没有就返回 null。
 *
 * 返回 null 的三种情况都必须区分清楚（测试里分别钉死）：
 *   1) 额度没到 —— 今天不许再弹
 *   2) 没有条件成立 —— 玩家过得很正常
 *   3) 条件成立但都看过了 —— 内容写少了，不该重复播
 */
export function pickDialogue(c: DialogueContext): string | null {
  if (c.day < dialogueBudget(c.seen.length)) return null
  for (const rule of DIALOGUE_RULES) {
    if (c.seen.includes(rule.id)) continue
    if (!rule.when(c)) continue
    // 规则表里写错 id 时不要"静默什么都不弹"——那会表现为"某段台词永远不出现"，
    // 极难排查。这里直接跳过并留一个明确的空值。
    if (!DIALOGUE_SCRIPTS.some((s) => s.id === rule.id)) continue
    return rule.id
  }
  return null
}

/** 除开场致辞外，所有剧本都必须在规则表里出现一次（避免写了台词却永远不触发） */
export function unreachableScripts(): string[] {
  const triggered = new Set(DIALOGUE_RULES.map((r) => r.id))
  return DIALOGUE_SCRIPTS.map((s) => s.id).filter((id) => id !== OPENING_SCRIPT_ID && !triggered.has(id))
}
