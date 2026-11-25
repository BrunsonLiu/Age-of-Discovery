import type { NotorietyAxis } from '@/types'
import { events } from './events'

/**
 * 五轴取向的**唯一**中文名表。
 *
 * 【为什么收到这里】原来只写在 `EventResult` 里（一个局部常量）。取向现在有两个
 * 出口：结算屏的「海上人称」列表，和带取向门槛的选项角标（R3）。两处各写一份，
 * 就会出现"结算屏叫守秘、选项角标叫隐秘"——同一个东西两个名字，玩家会当成两件事。
 * 改名字只改这一处。
 */
export const NOTORIETY_LABELS: Record<NotorietyAxis, string> = {
  cruel: '冷酷',
  mercy: '仁慈',
  greed: '贪婪',
  bold: '鲁猛',
  secret: '守秘',
}

/**
 * 某条轴的"选项门槛"：该轴在事件库里所有 `requireAxis.min` 里的**最小值**；
 * 一条带该轴门槛的选项都没有时返回 `null`。
 *
 * 【为什么不写一个常量 `AXIS_UNLOCK_AT = 3`】因为那句话可能是假的。
 * 门槛值属于**内容**（哪条选项要多深的守秘才看得见），写在数据里；
 * 如果哪天给 `cruel` 加一条 min 4 的选项，这个函数会自动给出 4，
 * 而不需要有人记得同步一个常量。反过来，`cruel` 现在**没有任何**门槛选项，
 * 于是函数返回 null —— 结算屏就不会对玩家说"你解锁了专属选项"。
 * **宁可不说，也不说一句没有对应实现的话。**
 */
export function optionGateFor(axis: NotorietyAxis): number | null {
  let best: number | null = null
  for (const ev of events) {
    for (const c of ev.choices ?? []) {
      if (c.requireAxis?.axis !== axis) continue
      const min = c.requireAxis.min
      if (!Number.isFinite(min) || min <= 0) continue
      if (best == null || min < best) best = min
    }
  }
  return best
}

/**
 * 本次结算**第一次**跨过某条轴的门槛时，返回那条轴。
 *
 * 判据是"跨过"（before < gate ≤ before+delta），不是"达到"：
 * 达到在之后每次 +1 都成立，会变成每屏都弹一次的噪声。
 * 用"结算前的值 + 本次增量"算，所以不需要在存档里存任何"提示过没有"的旗标 ——
 * **状态转移本身就是判据**，读档、重开、换设备都不会重复提示。
 *
 * ⚠️ `before` 必须是**这次结算之前**的值。现状满足：结算屏渲染时 store 还没写入
 * （`addEventLog` 是点「继续」时才调的）。这条耦合由 `notoriety-choices.mjs` 的
 * ④/⑤ 两条盯住 —— 哪天改成"掷骰即入账"，那两条会红。
 */
export function crossedGates(
  deltas: Partial<Record<NotorietyAxis, number>> | undefined,
  before: Record<NotorietyAxis, number>,
): { axis: NotorietyAxis; at: number }[] {
  if (!deltas) return []
  const out: { axis: NotorietyAxis; at: number }[] = []
  for (const [rawAxis, rawDelta] of Object.entries(deltas)) {
    const axis = rawAxis as NotorietyAxis
    const delta = rawDelta ?? 0
    if (delta <= 0) continue
    const gate = optionGateFor(axis)
    if (gate == null) continue
    const was = before[axis] ?? 0
    const now = was + delta
    if (was < gate && now >= gate) out.push({ axis, at: gate })
  }
  return out
}
