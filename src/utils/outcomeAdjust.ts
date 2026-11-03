import type { EventOutcome, Fleet } from '@/types'
import { applyTraitToOutcome, getTrait } from '@/data/traits'
import { scaleOutcomeMagnitude } from './segment'

/**
 * 事件结果的最终调整。
 *
 * 这个模块存在的唯一理由：**屏幕上显示的数字必须等于实际发生的变化**。
 *
 * 之前的问题是调整发生在结算时刻（store.applyEventOutcome），
 * 而结算屏读的是未调整的原始数据——玩家看到「-10 食物」，
 * 实际扣了 15（抢行姿态 ×1.45）。这在别的游戏里也许能接受，
 * 但这游戏的卖点之一就是「因果可预测」，显示与实际不符会直接摧毁它。
 *
 * 所以调整被提取成一条流水线，三步按固定顺序执行：
 *   掷出 raw → adjustOutcome（姿态/特质/大副）→ clampOutcomeToFleet（资源不足时按实际可扣量显示）
 * 结果对象一路带到结算屏，也一路带到 applyEventOutcome —— 同一个对象，不再二次加工。
 */

export interface OutcomeAdjustContext {
  /** 姿态的事件强度倍率（抢行 ×1.45 / 按部就班 ×1.0 / 谨慎 ×0.5） */
  stanceMagnitudeMul: number
  /** 船长特质（铁壁/魅力/医生…） */
  trait: string | null | undefined
  /** 是否有大副在船（士气打击减半） */
  hasQuartermaster: boolean
}

/**
 * 把掷出的原始结果调整成最终结果。
 *
 * 顺序有讲究：先按姿态缩放（幅度），再按特质修正（方向性减免），
 * 最后是大副弹压（只砍士气）。每一步都是「乘」或「减半」，
 * 所以顺序不同结果会差 1 点——固定下来，别让后人乱改。
 */
export function adjustOutcome(raw: EventOutcome, ctx: OutcomeAdjustContext): EventOutcome {
  // 1. 姿态缩放：事件「是什么」由随机数决定，「有多惨」由玩家姿态决定
  const scaled = scaleOutcomeMagnitude(raw, ctx.stanceMagnitudeMul)

  // 2. 特质修正：铁壁减耐久损、魅力增士气、医生减船员损
  const adjusted = applyTraitToOutcome(scaled, ctx.trait)

  // 3. 大副弹压：一切士气打击减半（哗变、海盗、坏血病都算）
  if (ctx.hasQuartermaster && adjusted.moraleChange < 0) {
    return { ...adjusted, moraleChange: Math.ceil(adjusted.moraleChange / 2) }
  }
  return adjusted
}

/**
 * 天赋这一次**具体做了什么**（反事实：把天赋摘掉，用同一条流水线再算一遍）。
 *
 * 【为什么必须把它显示出来】五个天赋的效果全都实现了（商界血脉走 priceMultiplier，
 * 铁壁/魅力/医生走 applyTraitToOutcome，探险家走事件触发率），但**没有一处显示**。
 * 玩家在开局花了一次点击选它，此后整局都看不到它起过作用 ——
 * 一次看不见后果的选择，在心理上等于没选。更糟的是他会据此认为
 * "后面那些选择大概也一样"，从而不再认真对待任何一个。
 *
 * 航段姿态已经有一模一样的处理（outcomeAdjustDelta + 横幅"这一段的风险被放大到 1.45 倍"），
 * 天赋照同一套做：**只说它省了什么，不夸大**。
 *
 * @returns null = 这个天赋在本次结算里没有生效（例如铁壁遇到的是加耐久的好事）
 */
export interface TraitEffect {
  traitId: string
  /** 给玩家看的一句话，例如「铁壁舰长 · 少损 4 点耐久」 */
  text: string
  /** 受影响量的绝对值合计，用来判断值不值得显示 */
  magnitude: number
}

export function traitEffect(
  raw: EventOutcome,
  ctx: OutcomeAdjustContext,
): TraitEffect | null {
  if (!ctx.trait) return null
  const withTrait = adjustOutcome(raw, ctx)
  const without = adjustOutcome(raw, { ...ctx, trait: null })

  const dur = (without.durabilityChange ?? 0) - (withTrait.durabilityChange ?? 0)
  const crew = (without.crewChange ?? 0) - (withTrait.crewChange ?? 0)
  const morale = (withTrait.moraleChange ?? 0) - (without.moraleChange ?? 0)
  const magnitude = Math.abs(dur) + Math.abs(crew) + Math.abs(morale)
  if (magnitude === 0) return null

  const name = getTrait(ctx.trait)?.name ?? ctx.trait
  // 只描述**主要**那一项：一次事件里三条同时变化的情况几乎不存在，
  // 而罗列三条会把一行说明变成一张表。
  let detail = ''
  if (Math.abs(dur) >= Math.abs(crew) && Math.abs(dur) >= Math.abs(morale) && dur !== 0) {
    detail = `少损 ${Math.abs(dur)} 点耐久`
  } else if (Math.abs(crew) >= Math.abs(morale) && crew !== 0) {
    detail = `少损 ${Math.abs(crew)} 名船员`
  } else if (morale !== 0) {
    detail = `多得 ${Math.abs(morale)} 点士气`
  }
  if (!detail) return null
  return { traitId: ctx.trait, text: `${name} · ${detail}`, magnitude }
}

/**
 * 单船属性变化的「实际生效量」。
 *
 * 耐久/船员是**逐船**结算的：一条船耐久 5，事件扣 7，实际只扣 5（归零）。
 * 结算屏显示的是所有船的**合计**实际变化，所以这里必须逐船算完再求和，
 * 否则会出现「显示 -14，实际 -15」这种对不上账的情况。
 */
export function effectiveShipDelta(
  ships: Fleet['ships'],
  delta: number,
  kind: 'durability' | 'crew',
): number {
  if (delta === 0) return 0
  let total = 0
  for (const ship of ships) {
    const cur = kind === 'durability' ? ship.durability : ship.crew
    const max = kind === 'durability' ? ship.maxDurability : ship.maxCrew
    const next = Math.max(0, Math.min(max, cur + delta))
    total += next - cur
  }
  return total
}

/**
 * 按当前资源把结果「截断」到实际能发生的幅度。
 *
 * 只剩 3 罐淡水却遇到「-10 淡水」时，实际只会扣 3。
 * 结算屏显示 -3 才是诚实的；显示 -10 再在结算时被悄悄截断，
 * 是玩家最恨的那种「数字在骗我」。
 */
export function clampOutcomeToFleet(outcome: EventOutcome, fleet: Fleet, moraleMax: number): EventOutcome {
  const neg = (want: number, have: number) => (want < 0 ? Math.max(want, -have) : want)
  const pos = (want: number, have: number, cap: number) =>
    want > 0 ? Math.min(want, Math.max(0, cap - have)) : want

  return {
    ...outcome,
    goldChange: neg(outcome.goldChange, fleet.gold),
    foodChange: neg(outcome.foodChange, fleet.food),
    waterChange: neg(outcome.waterChange, fleet.water),
    moraleChange: outcome.moraleChange < 0
      ? neg(outcome.moraleChange, fleet.morale)
      : pos(outcome.moraleChange, fleet.morale, moraleMax),
    fameChange: outcome.fameChange === undefined
      ? undefined
      : neg(outcome.fameChange, fleet.fame),
    durabilityChange: effectiveShipDelta(fleet.ships, outcome.durabilityChange, 'durability'),
    crewChange: effectiveShipDelta(fleet.ships, outcome.crewChange, 'crew'),
  }
}

/**
 * 这次调整是否真的改动了数值——用来决定要不要给玩家一个提示。
 * 「抢行让你多赔 5 个金币」值得说；「按部就班，一切照旧」不值得占屏。
 */
export function outcomeAdjustDelta(raw: EventOutcome, adjusted: EventOutcome): {
  changed: boolean
  magnitude: number
} {
  const keys = ['goldChange', 'foodChange', 'waterChange', 'moraleChange', 'durabilityChange', 'crewChange'] as const
  let magnitude = 0
  for (const k of keys) {
    const a = (raw[k] ?? 0) as number
    const b = (adjusted[k] ?? 0) as number
    if (a !== b) magnitude += Math.abs(b - a)
  }
  return { changed: magnitude > 0, magnitude }
}
