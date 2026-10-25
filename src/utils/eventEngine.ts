import type { GameEvent, GameState, EventOutcome, FactionId, NotorietyAxis } from '@/types'
import { ports } from '@/data/ports'
import { biasProbabilities } from '@/utils/miniGame'

export function checkEventTrigger(event: GameEvent, gameState: GameState): boolean {
  const { triggerCondition } = event
  const { fleet, currentRoute } = gameState

  if (triggerCondition.minDay !== undefined && fleet.day < triggerCondition.minDay) {
    return false
  }

  if (triggerCondition.maxMorale !== undefined && fleet.morale > triggerCondition.maxMorale) {
    return false
  }

  if (triggerCondition.region) {
    let inRegion = false
    if (fleet.currentPortId) {
      const port = ports.find(p => p.id === fleet.currentPortId)
      if (port && port.region === triggerCondition.region) inRegion = true
    }
    if (!inRegion && currentRoute) {
      const fromPort = ports.find(p => p.id === currentRoute.fromPortId)
      const toPort = ports.find(p => p.id === currentRoute.toPortId)
      if (
        (fromPort && fromPort.region === triggerCondition.region) ||
        (toPort && toPort.region === triggerCondition.region)
      ) {
        inRegion = true
      }
    }
    if (!inRegion) return false
  }

  if (triggerCondition.dangerLevelMin !== undefined) {
    if (!currentRoute || currentRoute.dangerLevel < triggerCondition.dangerLevelMin) {
      return false
    }
  }

  // 事件链：需要全部持有才触发
  const flags = gameState.eventFlags ?? {}
  if (triggerCondition.requiresFlags) {
    if (!triggerCondition.requiresFlags.every(f => flags[f])) return false
  }
  // 收集类防重：持有任一旗标则不触发
  if (triggerCondition.conflictsWithFlags) {
    if (triggerCondition.conflictsWithFlags.some(f => flags[f])) return false
  }

  // 第二条线：派系声望门槛（王室的密令、兄弟会的请柬……）
  const rep = gameState.factionRep ?? {}
  if (triggerCondition.factionMin) {
    for (const [fid, min] of Object.entries(triggerCondition.factionMin)) {
      if ((rep[fid as FactionId] ?? 0) < (min ?? 0)) return false
    }
  }
  if (triggerCondition.factionMax) {
    for (const [fid, max] of Object.entries(triggerCondition.factionMax)) {
      if ((rep[fid as FactionId] ?? 0) > (max ?? 0)) return false
    }
  }

  // 第二条线：名船员门槛（个人事件只找得到人）
  if (triggerCondition.requiresCrew) {
    const roster = gameState.crewRoster ?? []
    if (!triggerCondition.requiresCrew.some(id => roster.some(m => m.id === id))) return false
  }

  // 第二条线：身份取向门槛（"铁腕"路线才有铁腕的选择）
  const notoriety = gameState.notoriety ?? {}
  if (triggerCondition.notorietyMin) {
    for (const [axis, min] of Object.entries(triggerCondition.notorietyMin)) {
      if ((notoriety[axis as NotorietyAxis] ?? 0) < (min ?? 0)) return false
    }
  }

  // 探险家特质：发现类事件触发率 +30%
  let probability = triggerCondition.probability
  if (fleet.trait === 'explorer' && event.type === 'discovery') {
    probability *= 1.3
  }
  // 第二条线：随船学者同样擅长撞见奇遇
  if ((gameState.crewRoster ?? []).some(m => m.id === 'scholar') && event.type === 'discovery') {
    probability *= 1.2
  }

  // 「遇事率」由航段方针统一控制（STANCES[stance].eventRateMul），
  // 施加在**全局触发闸门**上（见 store.advanceDay 的 eventBias）。
  // 这里不再叠第二层——两个旋钮都改同一件事，玩家会算不清账。

  return Math.random() < probability
}

/**
 * 从结局列表里掷一个结果。
 *
 * performance：可选的 0..1 表现分（来自事件小游戏）。
 * 给定时先按表现分重新分配各结局概率（biasProbabilities），
 * 于是"手稳的人把好结果拉过来，手抖的人被推向坏结果"——
 * 选项不再等价于一次纯掷骰。
 */
export function selectOutcome(outcomes: EventOutcome[], performance?: number): EventOutcome {
  const weights = performance === undefined
    ? outcomes.map(o => o.probability)
    : biasProbabilities(outcomes, performance)
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  if (totalWeight <= 0) return outcomes[outcomes.length - 1]
  let random = Math.random() * totalWeight
  for (let i = 0; i < outcomes.length; i++) {
    random -= weights[i]
    if (random <= 0) return outcomes[i]
  }
  return outcomes[outcomes.length - 1]
}

// 事件节奏：平均约每 9 个航行日触发一次（间隔下限 5 天 + 概率 0.25），
// 避免长途航行被事件卡反复打断
const GLOBAL_EVENT_CHANCE = 0.25
const MIN_DAYS_BETWEEN_EVENTS = 5

export function getRandomEvents(
  gameState: GameState,
  events: GameEvent[],
  daysSinceLastEvent: number = 99,
  /** 天气偏置：乘在全局触发率上（暴风雨天更容易出事，晴天更太平） */
  chanceMultiplier = 1,
): GameEvent | null {
  if (daysSinceLastEvent < MIN_DAYS_BETWEEN_EVENTS) return null
  if (Math.random() > GLOBAL_EVENT_CHANCE * chanceMultiplier) return null

  const shuffled = [...events].sort(() => Math.random() - 0.5)
  for (const event of shuffled) {
    if (checkEventTrigger(event, gameState)) {
      return event
    }
  }
  return null
}

/**
 * 事件触发后消耗 requiresFlags 旗标（一次性事件链）。
 * 返回新旗标表；无 requiresFlags 时原样返回。
 */
export function consumeEventFlags(event: GameEvent, flags: Record<string, number>): Record<string, number> {
  const required = event.triggerCondition.requiresFlags
  if (!required) return flags
  const next = { ...flags }
  for (const f of required) delete next[f]
  return next
}
