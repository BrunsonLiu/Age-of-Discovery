import type { GameEvent, GameState, EventOutcome } from '@/types'
import { ports } from '@/data/ports'

export function checkEventTrigger(event: GameEvent, gameState: GameState): boolean {
  const { triggerCondition } = event
  const { fleet, currentRoute } = gameState

  if (triggerCondition.minDay !== undefined && fleet.day < triggerCondition.minDay) {
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

  return Math.random() < triggerCondition.probability
}

export function selectOutcome(outcomes: EventOutcome[]): EventOutcome {
  const totalWeight = outcomes.reduce((sum, o) => sum + o.probability, 0)
  let random = Math.random() * totalWeight
  for (const outcome of outcomes) {
    random -= outcome.probability
    if (random <= 0) return outcome
  }
  return outcomes[outcomes.length - 1]
}

const GLOBAL_EVENT_CHANCE = 0.35
const MIN_DAYS_BETWEEN_EVENTS = 3

export function getRandomEvents(
  gameState: GameState,
  events: GameEvent[],
  daysSinceLastEvent: number = 99,
): GameEvent | null {
  if (daysSinceLastEvent < MIN_DAYS_BETWEEN_EVENTS) return null
  if (Math.random() > GLOBAL_EVENT_CHANCE) return null

  const shuffled = [...events].sort(() => Math.random() - 0.5)
  for (const event of shuffled) {
    if (checkEventTrigger(event, gameState)) {
      return event
    }
  }
  return null
}
