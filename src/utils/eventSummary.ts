import type { EventChoice, EventOutcome, Fleet } from '@/types'
import { adjustOutcome, clampOutcomeToFleet, type OutcomeAdjustContext } from './outcomeAdjust'

/**
 * 事件选项的结构化摘要。
 *
 * ## 这个模块解决什么问题
 *
 * 原先玩家面对一个选项时，能看到的信息只有一句话的动作描述；
 * 后果（加什么、扣什么、有多凶）藏在 outcomes 数组里，点下去之前**一无所知**。
 * 于是"选择"退化成了读两句文案然后凭感觉点——这正是玩家抱怨的
 *「没参与感，只需要点一点」的根源之一。
 *
 * 航段抉择（SegmentDecision）已经做到了「选之前就能看见全部后果」，
 * 事件选项是最后一处仍然把代价藏起来的地方。这个模块把那段隐藏的
 * 代价表翻出来，压成一行可扫读的芯片。
 *
 * ## 三条不可妥协的规矩
 *
 * 1. **预览 = 实际**：摘要走的调整流水线（adjustOutcome → clampOutcomeToFleet）
 *    与 EventCard.resolveOutcome 逐字相同。姿态放大、特质修正、大副弹压、
 *    库存截断——全部生效。显示 +20 实际扣 15 会摧毁因果承诺。
 * 2. **期望值不是承诺**：芯片是 Σ p×delta 的加权估算，实际落点仍是随机。
 *    所以 UI 一律带 `~` 前缀；风险等级（稳/搏/险）负责传达尾部。
 * 3. **小游戏选项不显示数字**：它的概率会被操作表现改写，玩之前任何数字
 *    都是半真半假的——宁可留白，不给假精度。
 */

export type ResourceKey =
  | 'gold' | 'food' | 'water' | 'morale' | 'durability' | 'crew' | 'fame'

/** 芯片展示顺序与中文名（组件层再映射到图标） */
export const RESOURCE_LABEL: Record<ResourceKey, string> = {
  gold: '金币',
  food: '食物',
  water: '淡水',
  morale: '士气',
  durability: '耐久',
  crew: '船员',
  fame: '声望',
}

/**
 * 资源的「份量」——把不同单位的损失折算成同一个风险分。
 *
 * 标定依据（与 utils/miniGame.ts 的 outcomeMerit 同源）：
 * 一条人命的重量远高于一份粮；耐久可以花金币修（5 金币/点），
 * 所以耐久的份量约为金币的 17 倍。
 */
export const RESOURCE_WEIGHT: Record<ResourceKey, number> = {
  crew: 3,
  durability: 0.5,
  morale: 0.3,
  fame: 0.3,
  food: 0.15,
  water: 0.15,
  gold: 0.03,
}

/** |期望| 小于此值的资源不占芯片位——避免一行里全是 ±1 的噪声 */
export const CHIP_MIN_EV = 3

/* ---- 风险分级阈值（按全库 127 个非小游戏选项的分布标定，见 .workbuddy/calib-ev.mjs） ---- */

/** 期望伤害低于它、且没有任何坏结局、最差也不深 → 稳 */
export const STEADY_MAX_HARM = 5
/** 「稳」还要求最差单结局的伤害不超过它（防止"平均安全但一出事就完蛋"） */
export const STEADY_MAX_WORST = 12
/** 期望伤害超过它 → 险 */
export const RISKY_MIN_HARM = 12
/** 最差单结局伤害超过它 → 险（尾部太重，平均值会骗人） */
export const RISKY_MIN_WORST = 30
/** 任一结局掉人的概率超过它 → 险（人命不看期望，看敢不敢赌） */
export const RISKY_CREW_P = 0.2

export interface AdjustedOutcome {
  probability: number
  outcome: EventOutcome
}

/**
 * 把一个选项的所有结局走一遍「显示 = 实际」的调整流水线。
 *
 * 顺序必须与 EventCard.resolveOutcome 完全一致：
 *   掷出 raw → adjustOutcome（姿态/特质/大副）→ clampOutcomeToFleet（库存截断）
 */
export function adjustedOutcomes(
  choice: EventChoice,
  ctx: OutcomeAdjustContext,
  fleet: Fleet,
  moraleMax: number,
): AdjustedOutcome[] {
  return choice.outcomes.map((raw) => {
    const adjusted = adjustOutcome(raw, ctx)
    return { probability: raw.probability, outcome: clampOutcomeToFleet(adjusted, fleet, moraleMax) }
  })
}

const RESOURCE_KEYS: ResourceKey[] = ['gold', 'food', 'water', 'morale', 'durability', 'crew', 'fame']

/** 期望值：Σ p × delta（每个资源一项） */
export function expectedDeltas(outs: AdjustedOutcome[]): Record<ResourceKey, number> {
  const acc = Object.fromEntries(RESOURCE_KEYS.map(k => [k, 0])) as Record<ResourceKey, number>
  for (const { probability, outcome } of outs) {
    for (const k of RESOURCE_KEYS) acc[k] += probability * (outcome[`${k}Change` as keyof EventOutcome] as number ?? 0)
  }
  return acc
}

/** 单结局的「伤害」：只计负向变化，按资源份量加权 */
export function outcomeHarm(outcome: EventOutcome): number {
  let harm = 0
  for (const k of RESOURCE_KEYS) {
    const v = (outcome[`${k}Change` as keyof EventOutcome] as number | undefined) ?? 0
    if (v < 0) harm += -v * RESOURCE_WEIGHT[k]
  }
  return harm
}

/** 任一结局掉船员的总概率（按结局概率求和） */
export function crewLossChance(outs: AdjustedOutcome[]): number {
  return outs.reduce((s, x) => s + (x.outcome.crewChange < 0 ? x.probability : 0), 0)
}

export type RiskGrade = 'steady' | 'gamble' | 'risky'

/**
 * 风险等级：这个选项在赌多大。
 *
 * 三个等级对应三种完全不同的决策性质：
 * - steady 稳：基本只赚不赔，或代价很小——放心选
 * - gamble 搏：有真实的坏结局，但期望仍站得住——值得赌
 * - risky  险：期望就差、或尾部太重、或可能掉人——要想清楚
 */
export function riskGrade(outs: AdjustedOutcome[]): RiskGrade {
  const expected = outs.reduce((s, x) => s + x.probability * outcomeHarm(x.outcome), 0)
  const worst = outs.reduce((m, x) => Math.max(m, outcomeHarm(x.outcome)), 0)
  const crewP = crewLossChance(outs)
  if (expected < STEADY_MAX_HARM && worst < STEADY_MAX_WORST && crewP === 0) return 'steady'
  if (expected >= RISKY_MIN_HARM || worst >= RISKY_MIN_WORST || crewP >= RISKY_CREW_P) return 'risky'
  return 'gamble'
}

export interface ChoiceChip {
  key: ResourceKey
  /** 四舍五入后的期望值（UI 加 ~ 前缀） */
  ev: number
}

export interface ChoiceSummary {
  /** 按 |ev| 降序；可能超过 MAX_CHIPS 个，组件层截断 */
  chips: ChoiceChip[]
  risk: RiskGrade
  /** true = 没有什么值得展示的影响（纯叙事/影响甚微）——UI 显示「影响甚微」 */
  plain: boolean
}

/**
 * 一个选项的结构化摘要。小游戏选项一律 plain——
 * 它的结局概率会被操作表现改写，玩之前给数字就是不诚实。
 */
export function summarizeChoice(
  choice: EventChoice,
  ctx: OutcomeAdjustContext,
  fleet: Fleet,
  moraleMax: number,
): ChoiceSummary {
  if (choice.miniGame) {
    // risk 只是个占位：小游戏选项的 UI 不渲染风险档（见 EventChoice 的守卫），
    // 因为这里的概率会被操作表现改写，任何"稳/搏/险"的断言都是编造的。
    return { chips: [], risk: 'gamble', plain: true }
  }
  const outs = adjustedOutcomes(choice, ctx, fleet, moraleMax)
  const ev = expectedDeltas(outs)
  const chips: ChoiceChip[] = RESOURCE_KEYS
    .map(k => ({ key: k, ev: Math.round(ev[k]) }))
    .filter(c => Math.abs(c.ev) >= CHIP_MIN_EV)
    .sort((a, b) => Math.abs(b.ev) - Math.abs(a.ev))
  return { chips, risk: riskGrade(outs), plain: chips.length === 0 }
}
