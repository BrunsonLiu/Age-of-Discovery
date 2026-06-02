import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Fleet, Ship, GameState, GameEvent, EventOutcome, EventLogEntry,
  Route, PanelType, CargoItem, Waypoint,
} from '@/types'
import { ports } from '@/data/ports'
import { events } from '@/data/events'
import { tasks } from '@/data/tasks'
import { goods } from '@/data/goods'
import { portGoods } from '@/data/ports'
import { calculateDailyConsumption, dangerLevelFromDistance } from '@/utils/navigation'
import { getRandomEvents } from '@/utils/eventEngine'
import { calculateBuyPrice, calculateSellPrice, canAfford, hasCargoSpace } from '@/utils/trade'
import { historicalTimeline } from '@/data/historicalTimeline'
import { GAME_BALANCE } from '@/data/gameConfig'
import { shipTemplates } from '@/data/ships'

const createStartingShip = (): Ship => ({
  id: 1,
  ...shipTemplates.caravel,
  name: '圣玛利亚号',
})

const createStartingFleet = (): Fleet => ({
  id: 1,
  name: '无敌舰队',
  gold: 500,
  morale: 70,
  food: 100,
  water: 100,
  currentPortId: 6,
  isSailing: false,
  day: 1,
  ships: [createStartingShip()],
  cargo: [],
})

const initialGameState: GameState = {
  fleet: createStartingFleet(),
  currentRoute: null,
  routeProgress: 0,
  waypoint: null,
  completedTasks: [],
  activeTasks: [],
  eventLog: [],
  discoveredPorts: [6],
  currentEvent: null,
  gamePhase: 'start',
}

interface GameStore extends GameState {
  activePanel: PanelType
  tutorialStep: number
  showHelp: boolean
  notifications: Array<{ id: string; type: 'discovery' | 'history' | 'achievement' | 'warning'; title: string; message: string; timestamp: number }>
  seenHistoricalEvents: number[]
  simSpeed: number
  shipPosition: [number, number] | null
  addNotification: (notification: Omit<GameStore['notifications'][0], 'timestamp'>) => void
  removeNotification: (id: string) => void
  setWaypoint: (waypoint: Waypoint | null) => void
  setSimSpeed: (speed: number) => void
  setShipPosition: (pos: [number, number]) => void
  sailToWaypoint: (waypoint: Waypoint) => void
  changeCourse: (waypoint: Waypoint) => void
  initGame: () => void
  setGamePhase: (phase: GameState['gamePhase']) => void
  setCurrentEvent: (event: GameEvent) => void
  clearCurrentEvent: () => void
  selectRoute: (route: Route) => void
  advanceDay: () => void
  arriveAtPort: (portId: number) => void
  buyGood: (portId: number, goodId: number, quantity: number) => void
  sellGood: (portId: number, goodId: number, quantity: number) => void
  repairShip: (shipId: number) => void
  supplyFleet: () => void
  recruitCrew: (shipId: number, count: number) => void
  acceptTask: (taskId: number) => void
  completeTask: (taskId: number) => void
  applyEventOutcome: (outcome: EventOutcome) => void
  addEventLog: (entry: EventLogEntry) => void
  discoverPort: (portId: number) => void
  setActivePanel: (panel: PanelType) => void
  nextTutorialStep: () => void
  skipTutorial: () => void
  setShowHelp: (show: boolean) => void
  resetGame: () => void
}

function updateCargo(cargo: CargoItem[], goodId: number, delta: number): CargoItem[] {
  const existingIndex = cargo.findIndex(c => c.goodId === goodId)
  if (existingIndex >= 0) {
    const newQty = cargo[existingIndex].quantity + delta
    if (newQty <= 0) return cargo.filter((_, i) => i !== existingIndex)
    return cargo.map((c, i) => i === existingIndex ? { ...c, quantity: newQty } : c)
  }
  if (delta > 0) return [...cargo, { goodId, quantity: delta }]
  return cargo
}

function syncUsedCapacity(fleet: Fleet): Fleet {
  const totalUsed = fleet.cargo.reduce((sum, c) => sum + c.quantity, 0)
  let remaining = totalUsed
  const newShips = fleet.ships.map(ship => {
    const allocated = Math.min(ship.capacity, remaining)
    remaining -= allocated
    return { ...ship, usedCapacity: allocated }
  })
  return { ...fleet, ships: newShips }
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      ...initialGameState,
      activePanel: null,
      tutorialStep: -1,
      showHelp: false,
      notifications: [],
      seenHistoricalEvents: [],
      simSpeed: 3,
      shipPosition: null,

      setWaypoint: (waypoint) => set({ waypoint }),
      setSimSpeed: (speed) => set({ simSpeed: speed }),
      setShipPosition: (pos) => set({ shipPosition: pos }),

      sailToWaypoint: (waypoint) => set((state) => {
        if (state.fleet.isSailing) return state

        const originLat: number | null = state.fleet.currentPortId
          ? (ports.find(p => p.id === state.fleet.currentPortId))?.latitude ?? null
          : state.shipPosition?.[0] ?? null
        const originLng: number | null = state.fleet.currentPortId
          ? (ports.find(p => p.id === state.fleet.currentPortId))?.longitude ?? null
          : state.shipPosition?.[1] ?? null

        if (originLat == null || originLng == null) return state

        const distanceNm = haversineDistance(originLat, originLng, waypoint.latitude, waypoint.longitude) * 0.539957
        const dangerLevel = dangerLevelFromDistance(distanceNm)

        const customRoute: Route = {
          id: -(Date.now()),
          fromPortId: state.fleet.currentPortId ?? 0,
          toPortId: waypoint.portId ?? 0,
          distance: Math.round(distanceNm),
          dangerLevel,
          windFavor: 1,
        }

        return {
          currentRoute: customRoute,
          routeProgress: 0,
          waypoint,
          shipPosition: state.shipPosition ?? [originLat, originLng],
          fleet: { ...state.fleet, isSailing: true, currentPortId: null },
        }
      }),

      changeCourse: (waypoint) => set((state) => {
        if (!state.fleet.isSailing) return state

        const currentPos = state.shipPosition
        if (!currentPos) return state

        const distanceNm = haversineDistance(currentPos[0], currentPos[1], waypoint.latitude, waypoint.longitude) * 0.539957
        const dangerLevel = dangerLevelFromDistance(distanceNm)

        const customRoute: Route = {
          id: -(Date.now()),
          fromPortId: state.currentRoute?.fromPortId ?? 0,
          toPortId: waypoint.portId ?? 0,
          distance: Math.round(distanceNm),
          dangerLevel,
          windFavor: 1,
        }

        return {
          currentRoute: customRoute,
          routeProgress: 0,
          waypoint,
        }
      }),

      initGame: () => {
        const startPort = ports.find(p => p.id === 6)
        set({
          fleet: createStartingFleet(),
          currentRoute: null,
          routeProgress: 0,
          waypoint: null,
          shipPosition: startPort ? [startPort.latitude, startPort.longitude] : null,
          completedTasks: [],
          activeTasks: [],
          eventLog: [],
          discoveredPorts: [6],
          currentEvent: null,
          gamePhase: 'playing',
          activePanel: null,
          tutorialStep: 0,
          showHelp: false,
          notifications: [],
          seenHistoricalEvents: [],
          simSpeed: 3,
        })
      },

      setGamePhase: (phase) => set({ gamePhase: phase }),
      setCurrentEvent: (event) => set({ currentEvent: event, gamePhase: 'event' }),
      clearCurrentEvent: () => set({ currentEvent: null, gamePhase: 'playing' }),

      selectRoute: (route) => set((state) => {
        let actualRoute = route
        if (state.fleet.currentPortId === route.toPortId && state.fleet.currentPortId !== route.fromPortId) {
          actualRoute = { ...route, fromPortId: route.toPortId, toPortId: route.fromPortId }
        }
        const fromPort = ports.find(p => p.id === actualRoute.fromPortId)
        const toPort = ports.find(p => p.id === actualRoute.toPortId)
        return {
          currentRoute: actualRoute,
          routeProgress: 0,
          shipPosition: fromPort ? [fromPort.latitude, fromPort.longitude] : state.shipPosition,
          waypoint: toPort ? { latitude: toPort.latitude, longitude: toPort.longitude, name: toPort.nameCn, portId: toPort.id } : null,
          fleet: { ...state.fleet, isSailing: true, currentPortId: null },
        }
      }),

      advanceDay: () => {
        const state = get()
        if (state.gamePhase !== 'playing') return

        const { fleet } = state
        const newDay = fleet.day + 1

        let newFleet = { ...fleet, day: newDay }
        let newGamePhase: GameState['gamePhase'] = 'playing'
        let newCurrentEvent: GameEvent | null = null
        let newNotifications = [...state.notifications]
        let newSeenHistoricalEvents = state.seenHistoricalEvents

        if (fleet.isSailing) {
          const consumption = calculateDailyConsumption(fleet)
          const newFood = Math.max(0, fleet.food - consumption.food)
          const newWater = Math.max(0, fleet.water - consumption.water)
          let newMorale = fleet.morale
          if (newFood === 0 || newWater === 0) {
            newMorale = Math.max(0, fleet.morale - GAME_BALANCE.MORALE_DECAY_PER_DAY)
          }
          newFleet = { ...newFleet, food: newFood, water: newWater, morale: newMorale }

          const triggeredEvent = getRandomEvents({ ...state, fleet: newFleet, routeProgress: state.routeProgress }, events)
          if (triggeredEvent) {
            newCurrentEvent = triggeredEvent
            newGamePhase = 'event'
          }
        }

        const allShipsDestroyed = newFleet.ships.every(s => s.durability <= 0)
        if (allShipsDestroyed || newFleet.morale <= 0) {
          newGamePhase = 'gameover'
        }

        const historicalEvent = historicalTimeline.find(e => e.day === newDay)
        if (historicalEvent && !state.seenHistoricalEvents.includes(historicalEvent.day)) {
          newNotifications = [...newNotifications, {
            id: `history-${historicalEvent.day}`,
            type: 'history' as const,
            title: `${historicalEvent.year}年`,
            message: historicalEvent.title,
            timestamp: Date.now(),
          }]
          newSeenHistoricalEvents = [...newSeenHistoricalEvents, historicalEvent.day]
        }

        set({
          fleet: newFleet,
          gamePhase: newGamePhase,
          currentEvent: newCurrentEvent,
          notifications: newNotifications,
          seenHistoricalEvents: newSeenHistoricalEvents,
        })
      },

      arriveAtPort: (portId) => set((state) => {
        const port = ports.find(p => p.id === portId)
        return {
          fleet: { ...state.fleet, currentPortId: portId, isSailing: false },
          currentRoute: null,
          routeProgress: 0,
          waypoint: null,
          shipPosition: port ? [port.latitude, port.longitude] : state.shipPosition,
          discoveredPorts: state.discoveredPorts.includes(portId) ? state.discoveredPorts : [...state.discoveredPorts, portId],
        }
      }),

      buyGood: (portId, goodId, quantity) => set((state) => {
        if (state.fleet.currentPortId !== portId || state.fleet.isSailing) return state
        const pg = portGoods.find(p => p.portId === portId && p.goodId === goodId)
        if (!pg || pg.stock < quantity) return state
        const good = goods.find(g => g.id === goodId)
        if (!good) return state
        const buyPrice = calculateBuyPrice(pg)
        if (!canAfford(state.fleet.gold, buyPrice, quantity)) return state
        if (!hasCargoSpace(state.fleet, quantity)) return state
        const newCargo = updateCargo(state.fleet.cargo, goodId, quantity)
        return { fleet: syncUsedCapacity({ ...state.fleet, gold: state.fleet.gold - buyPrice * quantity, cargo: newCargo }) }
      }),

      sellGood: (portId, goodId, quantity) => set((state) => {
        if (state.fleet.currentPortId !== portId || state.fleet.isSailing) return state
        const cargoItem = state.fleet.cargo.find(c => c.goodId === goodId)
        if (!cargoItem || cargoItem.quantity < quantity) return state
        const pg = portGoods.find(p => p.portId === portId && p.goodId === goodId)
        if (!pg) return state
        const good = goods.find(g => g.id === goodId)
        if (!good) return state
        const sellPrice = calculateSellPrice(pg)
        const newCargo = updateCargo(state.fleet.cargo, goodId, -quantity)
        return { fleet: syncUsedCapacity({ ...state.fleet, gold: state.fleet.gold + sellPrice * quantity, cargo: newCargo }) }
      }),

      repairShip: (shipId) => set((state) => {
        if (!state.fleet.currentPortId) return state
        const port = ports.find(p => p.id === state.fleet.currentPortId)
        if (!port || !port.services.includes('repair')) return state
        const ship = state.fleet.ships.find(s => s.id === shipId)
        if (!ship || ship.durability >= ship.maxDurability) return state
        const cost = (ship.maxDurability - ship.durability) * GAME_BALANCE.REPAIR_COST_PER_DURABILITY
        if (state.fleet.gold < cost) return state
        return { fleet: { ...state.fleet, gold: state.fleet.gold - cost, ships: state.fleet.ships.map(s => s.id === shipId ? { ...s, durability: s.maxDurability } : s) } }
      }),

      supplyFleet: () => set((state) => {
        if (!state.fleet.currentPortId) return state
        const port = ports.find(p => p.id === state.fleet.currentPortId)
        if (!port || !port.services.includes('supply')) return state
        const totalCost = GAME_BALANCE.SUPPLY_TOTAL_COST
        if (state.fleet.gold < totalCost) return state
        return { fleet: { ...state.fleet, gold: state.fleet.gold - totalCost, food: state.fleet.food + GAME_BALANCE.SUPPLY_AMOUNT, water: state.fleet.water + GAME_BALANCE.SUPPLY_AMOUNT } }
      }),

      recruitCrew: (shipId, count) => set((state) => {
        if (!state.fleet.currentPortId) return state
        const port = ports.find(p => p.id === state.fleet.currentPortId)
        if (!port || !port.services.includes('recruit')) return state
        if (state.fleet.gold < count * GAME_BALANCE.CREW_COST_PER_PERSON) return state
        const ship = state.fleet.ships.find(s => s.id === shipId)
        if (!ship) return state
        const actualCount = Math.min(count, ship.maxCrew - ship.crew)
        if (actualCount <= 0) return state
        return { fleet: { ...state.fleet, gold: state.fleet.gold - actualCount * GAME_BALANCE.CREW_COST_PER_PERSON, ships: state.fleet.ships.map(s => s.id === shipId ? { ...s, crew: s.crew + actualCount } : s) } }
      }),

      acceptTask: (taskId) => set((state) => {
        const task = tasks.find(t => t.id === taskId)
        if (!task || state.activeTasks.some(t => t.id === taskId)) return state
        return { activeTasks: [...state.activeTasks, { ...task, status: 'active' as const }] }
      }),

      completeTask: (taskId) => set((state) => {
        const task = state.activeTasks.find(t => t.id === taskId)
        if (!task) return state
        const targetPort = task.targetPortId ?? task.portId
        if (state.fleet.currentPortId !== targetPort) return state
        if (task.requiredGoods) {
          for (const req of task.requiredGoods) {
            const cargoItem = state.fleet.cargo.find(c => c.goodId === req.goodId)
            if (!cargoItem || cargoItem.quantity < req.quantity) return state
          }
        }
        let newCargo = [...state.fleet.cargo]
        if (task.requiredGoods) {
          for (const req of task.requiredGoods) { newCargo = updateCargo(newCargo, req.goodId, -req.quantity) }
        }
        return {
          fleet: syncUsedCapacity({ ...state.fleet, gold: state.fleet.gold + task.reward.gold, cargo: newCargo }),
          completedTasks: [...state.completedTasks, taskId],
          activeTasks: state.activeTasks.filter(t => t.id !== taskId),
        }
      }),

      applyEventOutcome: (outcome) => set((state) => {
        const newFleet = {
          ...state.fleet,
          gold: Math.max(0, state.fleet.gold + outcome.goldChange),
          food: Math.max(0, state.fleet.food + outcome.foodChange),
          water: Math.max(0, state.fleet.water + outcome.waterChange),
          morale: Math.max(0, Math.min(GAME_BALANCE.MORALE_MAX, state.fleet.morale + outcome.moraleChange)),
          ships: state.fleet.ships.map(ship => ({
            ...ship,
            durability: Math.max(0, Math.min(ship.maxDurability, ship.durability + outcome.durabilityChange)),
            crew: Math.max(0, Math.min(ship.maxCrew, ship.crew + outcome.crewChange)),
          })),
        }
        const allShipsDestroyed = newFleet.ships.every(s => s.durability <= 0)
        return { fleet: newFleet, gamePhase: allShipsDestroyed || newFleet.morale <= 0 ? 'gameover' : state.gamePhase }
      }),

      addEventLog: (entry) => set((state) => ({ eventLog: [...state.eventLog, entry] })),

      discoverPort: (portId) => set((state) => {
        if (state.discoveredPorts.includes(portId)) return state
        const port = ports.find(p => p.id === portId)
        return {
          discoveredPorts: [...state.discoveredPorts, portId],
          notifications: [...state.notifications, { id: `discover-${portId}-${Date.now()}`, type: 'discovery' as const, title: '发现新港口！', message: port ? `${port.nameCn}（${port.name}）` : '未知港口', timestamp: Date.now() }],
        }
      }),

      setActivePanel: (panel) => set({ activePanel: panel }),
      addNotification: (notification) => set((state) => ({ notifications: [...state.notifications, { ...notification, timestamp: Date.now() }] })),
      removeNotification: (id) => set((state) => ({ notifications: state.notifications.filter(n => n.id !== id) })),
      nextTutorialStep: () => set((state) => ({ tutorialStep: state.tutorialStep + 1 })),
      skipTutorial: () => set({ tutorialStep: -1 }),
      setShowHelp: (show) => set({ showHelp: show }),

      resetGame: () => {
        const startPort = ports.find(p => p.id === 6)
        set({
          ...initialGameState,
          activePanel: null, tutorialStep: -1, showHelp: false,
          notifications: [], seenHistoricalEvents: [],
          waypoint: null, simSpeed: 3,
          shipPosition: startPort ? [startPort.latitude, startPort.longitude] : null,
        })
      },
    }),
    {
      name: 'age-of-discovery-save',
      version: 2,
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('存档数据损坏，已重置', error)
          return
        }
        if (!state) return
        if (!state.shipPosition) {
          const portId = state.fleet.currentPortId ?? 6
          const startPort = ports.find(p => p.id === portId)
          if (startPort) {
            state.shipPosition = [startPort.latitude, startPort.longitude]
          }
        }
      },
      migrate: (persistedState, version) => {
        if (!persistedState) return persistedState
        if (version < 2) {
          const pState = persistedState as { fleet?: { currentPortId?: number | null }; shipPosition?: [number, number] | null }
          const portId = pState.fleet?.currentPortId ?? 6
          const startPort = ports.find(p => p.id === portId)
          if (startPort && !pState.shipPosition) {
            pState.shipPosition = [startPort.latitude, startPort.longitude]
          }
        }
        return persistedState
      },
      partialize: (state) => ({
        fleet: state.fleet,
        currentRoute: state.currentRoute,
        routeProgress: state.routeProgress,
        waypoint: state.waypoint,
        shipPosition: state.shipPosition,
        simSpeed: state.simSpeed,
        completedTasks: state.completedTasks,
        activeTasks: state.activeTasks,
        eventLog: state.eventLog,
        discoveredPorts: state.discoveredPorts,
        gamePhase: state.gamePhase,
        tutorialStep: state.tutorialStep,
        seenHistoricalEvents: state.seenHistoricalEvents,
      }),
    }
  )
)
