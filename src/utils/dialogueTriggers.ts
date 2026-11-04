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
  /** 是否在航行中（停泊时不谈"夜航""风暴"这类事） */
  isSailing: boolean
  /** 船上人数（含船长自己那一条不算，这里是招募到的船员数） */
  crewCount: number
  /** 船员编制上限 */
  crewMax: number
  /** 已完成委托数 */
  completedTasks: number
  /** 当前日照 0~1（1=正午，0=深夜）——来自 utils/skyClock */
  lit: number
  /** 食物与淡水都还充裕（用于"舱里塞满了"这类生活向的彩蛋） */
  wellStocked: boolean
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
  /*
   * 【顺序即优先级，而且**必须按"同一字段的阈值降序"排】**
   *
   * 这是 first-match-wins：一条规则成立就返回，后面的根本不看。
   * 所以"金币≥8000"排在"金币≥2500"后面 = 永远不触发（被低门槛那条吃掉）。
   * 第一版就踩了：玛丽亚的"够买下半条街"（8000）排在杰克的"听说你发财了"（2500）之后，
   * 单测立刻报"金币 8000 时玛丽亚会来搭话"失败。同类的还有
   * 声望 40/20、发现 10 港/6 港、天数 50/30/20/12 —— 一律**大阈值在前**。
   *
   * 而"所有剧本都能被触发"那条测试**抓不到这种遮蔽**（它只检查 id 在表里），
   * 所以每条高门槛规则都补了一条"该门槛下确实选中它"的断言。
   */
  // ---- 危急：会死人/会沉船的先说 ----
  { id: 'egg_low_water', why: '淡水 < 25', when: (c) => c.water < 25 },
  { id: 'egg_damaged', why: '旗舰耐久 < 40', when: (c) => c.durability < 40 },
  { id: 'egg_low_morale', why: '士气 < 35', when: (c) => c.morale < 35 },
  { id: 'egg_shipyard', why: '停在能修船的港口且耐久 < 70', when: (c) => c.currentPortId !== null && c.portHasShipyard && c.durability < 70 },
  // ---- 处境：此刻正在发生的事 ----
  { id: 'egg_storm_chaplain', why: '在海上且风暴/暴雨', when: (c) => c.isSailing && (c.weatherKind === 'storm' || c.weatherKind === 'rain') },
  { id: 'egg_night_helm', why: '在海上且日照 < 0.25（夜航）', when: (c) => c.isSailing && c.lit < 0.25 },
  { id: 'egg_broke_cook', why: '金币 < 80', when: (c) => c.gold < 80 },
  { id: 'egg_no_crew', why: '一个招募到的船员都没有', when: (c) => c.crewCount === 0 && c.day >= 3 },
  { id: 'egg_full_crew', why: '船员招满且 ≥ 3 人', when: (c) => c.crewMax > 0 && c.crewCount >= c.crewMax && c.crewCount >= 3 },
  { id: 'egg_stocked', why: '在海上且食物淡水都充裕', when: (c) => c.wellStocked && c.isSailing },
  // ---- 财富 / 声望：同一字段降序 ----
  { id: 'egg_rich_maria', why: '金币 ≥ 12000', when: (c) => c.gold >= 12000 },
  { id: 'egg_rich_blackjack', why: '金币 ≥ 2500', when: (c) => c.gold >= 2500 },
  { id: 'egg_fame_jack', why: '声望 ≥ 45', when: (c) => c.fame >= 45 },
  { id: 'egg_fame_maria', why: '声望 ≥ 20', when: (c) => c.fame >= 20 },
  // ---- 探索 / 进度 ----
  { id: 'egg_ten_ports', why: '已发现 ≥ 10 座港口', when: (c) => c.discoveredCount >= 10 },
  { id: 'egg_many_ports', why: '已发现 ≥ 6 座港口', when: (c) => c.discoveredCount >= 6 },
  { id: 'egg_first_task', why: '至少完成过 1 个委托', when: (c) => c.completedTasks >= 1 },
  // ---- 时间：同一字段降序 ----
  { id: 'egg_day50', why: '第 50 天之后', when: (c) => c.day >= 50 },
  { id: 'egg_veteran', why: '第 30 天之后', when: (c) => c.day >= 30 },
  { id: 'egg_stars_diego', why: '第 20 天之后', when: (c) => c.day >= 20 },
  { id: 'egg_long_voyage', why: '第 12 天之后', when: (c) => c.day >= 12 },
  // ---- 兜底：任何一天都可能发生的日常 ----
  // 「大西洋不过是个大池塘」放在这里：它不需要坏天气，只需要"人在海上待了一阵"
  { id: 'egg_storm_midshipman', why: '在海上且已出海 5 天以上', when: (c) => c.isSailing && c.day >= 5 },
  { id: 'egg_first_dock', why: '第 3 天之后、停靠在港', when: (c) => c.currentPortId !== null && c.day >= 3 },
]

/**
 * 当前允许弹第几段（含开场致辞那一段的额度）。
 *
 * 【为什么从 2+2× 放宽到 3+4×】
 * 这些是**彩蛋**（"船坞就在那儿""大西洋不过是个大池塘"），不是任务提示。
 * 旧额度第二天就弹第二段，之后每两天一段 —— 配合事件卡和海上异闻，
 * 玩家一天里会被打断两三次。用户的原话是"弹窗有时候更多，尤其是探索玩法"。
 *
 * 现在第 3 天、第 7 天、第 11 天…… 每四天一次。集齐十几段彩蛋要一整个存档，
 * 而"很久没听到大副说话、忽然冒出来一句"本来就是彩蛋该有的密度。
 */
export function dialogueBudget(seenCount: number): number {
  return 3 + 4 * Math.max(0, seenCount - 1)
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
