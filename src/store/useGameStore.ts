import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Fleet, Ship, GameState, GameEvent, EventOutcome, EventLogEntry,
  Route, PanelType, CargoItem, Waypoint,
} from '@/types'
import { ports, portGoods, localDemands } from '@/data/ports'
import { events } from '@/data/events'
import { tasks } from '@/data/tasks'
import { goods } from '@/data/goods'
import { calculateDailyConsumption, dangerLevelFromDistance, computeWindFavor, effectiveFleetSpeed } from '@/utils/navigation'
import { getRandomEvents } from '@/utils/eventEngine'
import { canAfford, hasCargoSpace } from '@/utils/trade'
import { historicalTimeline } from '@/data/historicalTimeline'
import { GAME_BALANCE } from '@/data/gameConfig'
import { shipTemplates, shipResaleValue } from '@/data/ships'

const createStartingShip = (): Ship => ({
  id: 1,
  ...shipTemplates.caravel,
  name: '圣玛利亚号',
})

const createStartingFleet = (): Fleet => ({
  id: 1,
  name: '无敌舰队',
  gold: 500,
  fame: 0,
  morale: 70,
  food: 100,
  water: 100,
  currentPortId: 6,
  isSailing: false,
  day: 1,
  ships: [createStartingShip()],
  cargo: [],
})

/** 生成初始市场库存表（key: portId:goodId） */
function createInitialMarketStock(): Record<string, number> {
  const stock: Record<string, number> = {}
  for (const pg of portGoods) {
    stock[`${pg.portId}:${pg.goodId}`] = pg.stock
  }
  return stock
}

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
  marketStock: createInitialMarketStock(),
  seenMarketTips: [],
  victoryDay: null,
}

interface GameStore extends GameState {
  activePanel: PanelType
  tutorialStep: number
  showHelp: boolean
  notifications: Array<{ id: string; type: 'discovery' | 'history' | 'achievement' | 'warning'; title: string; message: string; timestamp: number }>
  seenHistoricalEvents: number[]
  simSpeed: number
  shipPosition: [number, number] | null
  lastEventDay: number
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
  buyShip: (templateKey: string) => void
  sellShip: (shipId: number) => void
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

/**
 * 动态定价：库存越低越贵。
 * 实际买价 = 基准价 × modifier × (1 + (1 - 库存率) × 0.4)
 * 每日 +1 天时库存回升 STOCK_RECOVER_PER_DAY，高需求商品随时间自然回补。
 */
export function dynamicBuyPrice(pg: { price: number; priceModifier: number }, currentStock: number, baseStock: number): number {
  const stockRatio = baseStock > 0 ? Math.min(1, currentStock / baseStock) : 1
  const surge = 1 + (1 - stockRatio) * 0.4
  return Math.round(pg.price * pg.priceModifier * surge)
}

export function dynamicSellPrice(pg: { price: number; priceModifier: number }, currentStock: number, baseStock: number): number {
  const stockRatio = baseStock > 0 ? Math.min(1, currentStock / baseStock) : 1
  const surge = 1 + (1 - stockRatio) * 0.4
  return Math.round(pg.price * pg.priceModifier * surge * 0.85)
}

/** 检查并返回本局达成的胜利结局描述（null 表示未达成） */
function checkVictory(state: GameState): string | null {
  if (state.discoveredPorts.length >= GAME_BALANCE.VICTORY_DISCOVER_ALL) {
    return '你发现了世上全部 20 座港口——每一片海岸都记得你的帆影。'
  }
  // "完成全部任务"按任务总数动态判定，随任务线扩充自动生效
  if (state.completedTasks.length >= tasks.length) {
    return `${tasks.length} 段冒险全部写进了你的航海日志——传奇船长，实至名归。`
  }
  if (state.fleet.gold >= GAME_BALANCE.VICTORY_GOLD) {
    return '两万金币的家底——你的船队比西班牙珍宝舰队还令人垂涎。'
  }
  return null
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
      lastEventDay: 0,

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
        const windFavor = computeWindFavor(originLat, originLng, waypoint.latitude, waypoint.longitude)

        const customRoute: Route = {
          id: -(Date.now()),
          fromPortId: state.fleet.currentPortId ?? 0,
          toPortId: waypoint.portId ?? 0,
          distance: Math.round(distanceNm),
          dangerLevel,
          windFavor,
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
        const windFavor = computeWindFavor(currentPos[0], currentPos[1], waypoint.latitude, waypoint.longitude)

        const customRoute: Route = {
          id: -(Date.now()),
          fromPortId: state.currentRoute?.fromPortId ?? 0,
          toPortId: waypoint.portId ?? 0,
          distance: Math.round(distanceNm),
          dangerLevel,
          windFavor,
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
          marketStock: createInitialMarketStock(),
          seenMarketTips: [],
          victoryDay: null,
          lastEventDay: 0,
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
        // 预定义航线也走真实风带计算，保证预估与实际一致
        const windFavor = fromPort && toPort
          ? computeWindFavor(fromPort.latitude, fromPort.longitude, toPort.latitude, toPort.longitude)
          : actualRoute.windFavor
        return {
          currentRoute: { ...actualRoute, windFavor },
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
        let newMarketStock = state.marketStock

        // 港内：消耗极低但仍存在（船员上岸自给一部分），库存缓慢回补
        if (!fleet.isSailing) {
          const consumption = calculateDailyConsumption(fleet)
          const newFood = Math.max(0, fleet.food - Math.ceil(consumption.food / 4))
          const newWater = Math.max(0, fleet.water - Math.ceil(consumption.water / 4))
          newFleet = { ...newFleet, food: newFood, water: newWater }
        }

        // 库存回补
        const updatedStock: Record<string, number> = { ...newMarketStock }
        for (const pg of portGoods) {
          const key = `${pg.portId}:${pg.goodId}`
          const current = updatedStock[key] ?? pg.stock
          if (current < pg.stock) {
            updatedStock[key] = Math.min(pg.stock, current + GAME_BALANCE.STOCK_RECOVER_PER_DAY)
          }
        }
        newMarketStock = updatedStock

        if (fleet.isSailing) {
          const consumption = calculateDailyConsumption(fleet)
          const newFood = Math.max(0, fleet.food - consumption.food)
          const newWater = Math.max(0, fleet.water - consumption.water)
          let newMorale = fleet.morale
          if (newFood === 0 || newWater === 0) {
            newMorale = Math.max(0, fleet.morale - GAME_BALANCE.MORALE_DECAY_PER_DAY)
          }
          newFleet = { ...newFleet, food: newFood, water: newWater, morale: newMorale }

          const lastEventDay = state.lastEventDay ?? 0
          const triggeredEvent = getRandomEvents({ ...state, fleet: newFleet, routeProgress: state.routeProgress }, events, newDay - lastEventDay)
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

        // 胜利检查（不覆盖 gameover）
        if (newGamePhase === 'playing') {
          const victoryDesc = checkVictory({ ...state, fleet: newFleet, discoveredPorts: state.discoveredPorts, completedTasks: state.completedTasks })
          if (victoryDesc) {
            set({
              fleet: newFleet,
              gamePhase: 'gameover',
              currentEvent: null,
              notifications: newNotifications,
              seenHistoricalEvents: newSeenHistoricalEvents,
              marketStock: newMarketStock,
              lastEventDay: state.lastEventDay,
              victoryDay: newDay,
            })
            return
          }
        }

        set({
          fleet: newFleet,
          gamePhase: newGamePhase,
          currentEvent: newCurrentEvent,
          notifications: newNotifications,
          seenHistoricalEvents: newSeenHistoricalEvents,
          marketStock: newMarketStock,
          lastEventDay: newCurrentEvent ? newDay : state.lastEventDay,
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
        if (!pg) return state
        const good = goods.find(g => g.id === goodId)
        if (!good) return state
        const key = `${portId}:${goodId}`
        const stock = state.marketStock[key] ?? pg.stock
        if (stock < quantity) return state
        const buyPrice = dynamicBuyPrice(pg, stock, pg.stock)
        if (!canAfford(state.fleet.gold, buyPrice, quantity)) return state
        if (!hasCargoSpace(state.fleet, quantity)) return state
        const newCargo = updateCargo(state.fleet.cargo, goodId, quantity)
        return {
          fleet: syncUsedCapacity({ ...state.fleet, gold: state.fleet.gold - buyPrice * quantity, cargo: newCargo }),
          marketStock: { ...state.marketStock, [key]: stock - quantity },
        }
      }),

      sellGood: (portId, goodId, quantity) => set((state) => {
        if (state.fleet.currentPortId !== portId || state.fleet.isSailing) return state
        const cargoItem = state.fleet.cargo.find(c => c.goodId === goodId)
        if (!cargoItem || cargoItem.quantity < quantity) return state
        const pg = portGoods.find(p => p.portId === portId && p.goodId === goodId)
        if (!pg) return state
        const good = goods.find(g => g.id === goodId)
        if (!good) return state
        const key = `${portId}:${goodId}`
        const stock = state.marketStock[key] ?? pg.stock
        const sellPrice = dynamicSellPrice(pg, stock, pg.stock)
        const newCargo = updateCargo(state.fleet.cargo, goodId, -quantity)
        return {
          fleet: syncUsedCapacity({ ...state.fleet, gold: state.fleet.gold + sellPrice * quantity, cargo: newCargo }),
          marketStock: { ...state.marketStock, [key]: stock + quantity },
        }
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

      buyShip: (templateKey) => set((state) => {
        if (!state.fleet.currentPortId) return state
        const port = ports.find(p => p.id === state.fleet.currentPortId)
        if (!port || !port.services.includes('shipyard')) return state
        const template = shipTemplates[templateKey]
        if (!template || template.price <= 0) return state
        if (!template.regions.includes(port.region)) return state
        if (state.fleet.gold < template.price) return state
        const newId = Math.max(...state.fleet.ships.map(s => s.id)) + 1
        const newShip: Ship = { id: newId, ...template, name: template.name }
        return { fleet: { ...state.fleet, gold: state.fleet.gold - template.price, ships: [...state.fleet.ships, newShip] } }
      }),

      sellShip: (shipId) => set((state) => {
        if (!state.fleet.currentPortId) return state
        const port = ports.find(p => p.id === state.fleet.currentPortId)
        if (!port || !port.services.includes('shipyard')) return state
        // 最后一艘船不能卖
        if (state.fleet.ships.length <= 1) return state
        const ship = state.fleet.ships.find(s => s.id === shipId)
        if (!ship) return state
        // 带着货的船不能卖（防止货物凭空消失）
        if (ship.usedCapacity > 0) return state
        const value = shipResaleValue(ship)
        return {
          fleet: {
            ...state.fleet,
            gold: state.fleet.gold + value,
            ships: state.fleet.ships.filter(s => s.id !== shipId),
          },
        }
      }),

      acceptTask: (taskId) => set((state) => {
        const task = tasks.find(t => t.id === taskId)
        if (!task || state.activeTasks.some(t => t.id === taskId)) return state
        if (task.minDay !== undefined && state.fleet.day < task.minDay) return state
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
        const fameGain = task.reward.fame ?? 0
        return {
          fleet: syncUsedCapacity({ ...state.fleet, gold: state.fleet.gold + task.reward.gold, fame: state.fleet.fame + fameGain }),
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
        if (!port) return state
        const newlyDiscovered = [...state.discoveredPorts, portId]
        const isFirstDiscovery = newlyDiscovered.length === 2
        const isMilestone = newlyDiscovered.length === 5 || newlyDiscovered.length === 10 || newlyDiscovered.length === 15 || newlyDiscovered.length === 20

        // 到港发现的声望奖励
        const fameGain = 5

        // 行情速报：告诉玩家此港高价收购什么，让"去哪儿卖"可以规划
        const tipKey = `${portId}`
        const hasSeenTip = state.seenMarketTips.includes(tipKey)
        const demands = localDemands(portId)
        const marketNotif = (!hasSeenTip && demands.length > 0)
          ? [{
              id: `market-${portId}-${Date.now()}`,
              type: 'warning' as const,
              title: '📜 行情速报',
              message: `${port.nameCn}正高价收购：${demands.slice(0, 2).map(id => goods.find(g => g.id === id)?.nameCn ?? '').filter(Boolean).join('、')}——运来此处出手最划算。`,
              timestamp: Date.now(),
            }]
          : []
        const newSeenMarketTips = hasSeenTip ? state.seenMarketTips : [...state.seenMarketTips, tipKey]

        if (isFirstDiscovery) {
          return {
            discoveredPorts: newlyDiscovered,
            fleet: { ...state.fleet, fame: state.fleet.fame + fameGain },
            seenMarketTips: newSeenMarketTips,
            notifications: [...state.notifications, ...marketNotif, {
              id: `first-discover-${Date.now()}`,
              type: 'achievement' as const,
              title: '✦ 首次发现新港口 ✦',
              message: `${port.nameCn}！船长日志：远方出现了从未见过的陆地轮廓，我们的名字将记入史册。（声望+${fameGain}）`,
              timestamp: Date.now(),
            }],
          }
        }

        if (isMilestone) {
          return {
            discoveredPorts: newlyDiscovered,
            fleet: { ...state.fleet, fame: state.fleet.fame + fameGain },
            seenMarketTips: newSeenMarketTips,
            notifications: [...state.notifications, ...marketNotif, {
              id: `milestone-discover-${Date.now()}`,
              type: 'achievement' as const,
              title: `⛵ 已探索 ${newlyDiscovered.length} 座港口`,
              message: `从塞维利亚启航到今天，你已经成为这条航线上最有经验的船长。（声望+${fameGain}）`,
              timestamp: Date.now(),
            }],
          }
        }

        return {
          discoveredPorts: newlyDiscovered,
          fleet: { ...state.fleet, fame: state.fleet.fame + fameGain },
          seenMarketTips: newSeenMarketTips,
          notifications: [...state.notifications, ...marketNotif, {
            id: `discover-${portId}-${Date.now()}`,
            type: 'discovery' as const,
            title: '发现新港口',
            message: `${port.nameCn}（${port.name}）`,
            timestamp: Date.now(),
          }],
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
          lastEventDay: 0,
        })
      },
    }),
    {
      name: 'age-of-discovery-save',
      version: 3,
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
        const pState = persistedState as Partial<GameState> & { fleet?: Partial<Fleet>; shipPosition?: [number, number] | null }
        // v1→v2/v3: 补 shipPosition
        if (version < 2 && pState.fleet?.currentPortId && !pState.shipPosition) {
          const startPort = ports.find(p => p.id === (pState.fleet.currentPortId ?? 6))
          if (startPort) {
            pState.shipPosition = [startPort.latitude, startPort.longitude]
          }
        }
        // v1/v2→v3: 补 fame、marketStock、seenMarketTips、victoryDay
        if (version < 3) {
          if (pState.fleet && pState.fleet.fame === undefined) pState.fleet.fame = 0
          if (!pState.marketStock) pState.marketStock = createInitialMarketStock()
          if (!pState.seenMarketTips) pState.seenMarketTips = []
          if (pState.victoryDay === undefined) pState.victoryDay = null
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
        lastEventDay: state.lastEventDay,
        marketStock: state.marketStock,
        seenMarketTips: state.seenMarketTips,
        victoryDay: state.victoryDay,
      }),
      // 存档软锁修复：存档里若停在事件阶段但事件未持久化，重开时落回 playing
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as object) } as GameState & GameStore
        if (merged.gamePhase === 'event' && !merged.currentEvent) {
          merged.gamePhase = 'playing'
        }
        return merged
      },
    }
  )
)

/** 供 UI 读取带动态库存的价格 */
export function getPriceFor(portId: number, goodId: number, state: GameState, mode: 'buy' | 'sell'): number | null {
  const pg = portGoods.find(p => p.portId === portId && p.goodId === goodId)
  if (!pg) return null
  const key = `${portId}:${goodId}`
  const stock = state.marketStock[key] ?? pg.stock
  return mode === 'buy' ? dynamicBuyPrice(pg, stock, pg.stock) : dynamicSellPrice(pg, stock, pg.stock)
}

export { effectiveFleetSpeed }
