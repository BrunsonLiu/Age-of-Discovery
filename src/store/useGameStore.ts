import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Fleet, Ship, GameState, GameEvent, EventOutcome, EventLogEntry,
  Route, PanelType, CargoItem, Waypoint, GameStats, RouteIntel, OfficerId, Rival, RivalNews,
  FactionId, CrewCharId, CrewMember, NotorietyAxis, StanceId,
} from '@/types'
import { ports, portGoods, localDemands } from '@/data/ports'
import { events } from '@/data/events'
import { tasks } from '@/data/tasks'
import { goods } from '@/data/goods'
import { calculateDailyConsumption, dangerLevelFromDistance, computeWindFavor, effectiveFleetSpeed, prevailingWindBearing, calculateSailingDays, dailyDistanceNm } from '@/utils/navigation'
import { getRouteGeometry } from '@/utils/routePath'
import { getRandomEvents, consumeEventFlags } from '@/utils/eventEngine'
import { STANCES, segmentCountFor, nextSegmentBoundary, hazardLabel, dailyFoodUse, dailyWaterUse, dailyWearRate, settleWear } from '@/utils/segment'
import { canAfford, hasCargoSpace } from '@/utils/trade'
import { historicalTimeline } from '@/data/historicalTimeline'
import { GAME_BALANCE } from '@/data/gameConfig'
import { shipTemplates, shipResaleValue } from '@/data/ships'
import { priceMultiplier, DEFAULT_TRAIT } from '@/data/traits'
import { checkAchievements } from '@/data/achievements'
import { RIVALS, RIVAL_ACTIONS } from '@/data/rivals'
import { OFFICER_MAP } from '@/data/officers'
import { CREW_CHAR_MAP } from '@/data/crewChars'
import { currentTitle } from '@/data/titles'
import { useFxStore } from '@/store/useFxStore'
import { helmReward, type HelmRunResult } from '@/utils/helm'
import {
  WEATHER_INFO, advanceWeather, createInitialWeather, isNotableWeather,
  weatherChangeMessage, weatherFavorFactor,
} from '@/utils/weather'

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
  flagshipId: 1,
  trait: null,
  /** 磨损累进余数（满 1 点才真正扣船，见 types/index.ts 的说明） */
  durabilityCarry: 0,
})

const createInitialStats = (): GameStats => ({
  daysSailed: 0,
  trades: 0,
  bestDeal: 0,
  tradeProfit: 0,
  pirateWins: 0,
  eventsSurvived: 0,
  historySeen: 0,
})

/** 第二条线：四方势力初始态度（中立偏冷） */
const createInitialFactionRep = (): Record<FactionId, number> => ({
  crown: 0,
  guild: 0,
  scholars: 0,
  brethren: 0,
})

/** 第二条线：身份取向初始值 */
const createInitialNotoriety = (): Record<NotorietyAxis, number> => ({
  cruel: 0,
  mercy: 0,
  greed: 0,
  bold: 0,
  secret: 0,
})

/** 价格合成参数：把第二条线的状态喂给 priceMultiplier */
function priceOpts(state: GameState) {
  return {
    officers: state.officers,
    crewRoster: state.crewRoster.map(c => c.id),
    factionRep: state.factionRep,
    title: currentTitle(state.notoriety),
  }
}

/**
 * 名船员每日忠诚结算：低士气与高危航段磨掉忠诚，
 * 忠诚跌破风险线时按概率离船（带走特长）——"人"是会走的。
 */
function tickCrewLoyalty(
  state: GameState,
  fleet: Fleet,
  day: number,
  routeDanger: number,
): { roster: CrewMember[]; left: CrewCharId[]; died: CrewCharId[] } {
  const roster = state.crewRoster
  if (roster.length === 0) return { roster, left: [], died: [] }
  const lowMorale = fleet.morale < 45
  const next: CrewMember[] = []
  const left: CrewCharId[] = []
  const died: CrewCharId[] = []
  for (const m of roster) {
    let loyalty = m.loyalty
    if (lowMorale) loyalty -= GAME_BALANCE.CREW_LOYALTY_DECAY_LOW_MORALE
    if (routeDanger >= 4) loyalty -= GAME_BALANCE.CREW_LOYALTY_DECAY_DANGER
    // 水手长看人看得紧：衰减减半
    if (roster.some(r => r.id === 'boatswain')) loyalty = m.loyalty - (m.loyalty - loyalty) / 2
    // 坏血病风险：缺粮断水的日子可能带走一个人
    if ((fleet.food === 0 || fleet.water === 0) && Math.random() < GAME_BALANCE.CREW_DEATH_CHANCE) {
      died.push(m.id)
      continue
    }
    if (loyalty <= GAME_BALANCE.CREW_LOYALTY_RISK && Math.random() < GAME_BALANCE.CREW_DESERT_CHANCE) {
      left.push(m.id)
      continue
    }
    next.push({ ...m, loyalty: Math.max(0, Math.min(100, Math.round(loyalty))) })
  }
  void day
  return { roster: next, left, died }
}

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
  routeOrigin: null,
  waypoint: null,
  pendingVoyage: null,
  segmentCount: 0,
  segmentIndex: 0,
  stance: 'steady',
  pendingSegment: null,
  pendingHelm: null,
  helmAdvance: null,
  routeIntel: {},
  completedTasks: [],
  activeTasks: [],
  eventLog: [],
  discoveredPorts: [6],
  currentEvent: null,
  gamePhase: 'start',
  marketStock: createInitialMarketStock(),
  seenMarketTips: [],
  victoryDay: null,
  eventFlags: {},
  stats: createInitialStats(),
  achievements: [],
  rivals: RIVALS.map(r => ({ ...r })),
  rivalNews: [],
  officers: [],
  factionRep: createInitialFactionRep(),
  crewRoster: [],
  notoriety: createInitialNotoriety(),
  weather: createInitialWeather(),
  /** 剧情线：已播过的致辞 id（防刷新重播；新开局清空） */
  dialogueSeen: [],
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
  /** 点击地图：只生成出航计划，等玩家确认后才起航 */
  sailToWaypoint: (waypoint: Waypoint) => void
  changeCourse: (waypoint: Waypoint) => void
  /** 确认出航计划（升起旗帜） */
  confirmDeparture: () => void
  /** 取消出航计划 */
  cancelVoyage: () => void
  /**
   * 选定当前航段的航段方针。
   *
   * 这是玩家在航程中唯一能「做主」的动作：方针决定了本段的
   * 航速、补给消耗、船体磨损、事件触发率与事件强度，
   * 全部是确定乘数——选之前就能看见，选完就算数。
   *
   * 【它同时取代了原「航速档位」】游戏里不再有第二个速度旋钮：
   * 两个旋钮都在改速度与补给，叠乘后玩家无法推演因果。
   */
  chooseStance: (stance: StanceId) => void
  /**
   * 航段边界检查（由航行循环每帧调用）。
   *
   * 航段按**航线进度**划分而非天数——这样无论玩家选哪个姿态，
   * 一次远航永远是同样段数，进度条上的分段刻度始终对得上。
   */
  syncSegmentBoundary: (progress: number) => void
  /** 购买当前待出航航线的情报 */
  buyRouteIntel: () => void
  /** 招募军官 */
  recruitOfficer: (id: OfficerId) => void
  /** 第二条线：招募名船员（一次性招募费，有名字、忠诚与个人事件的人） */
  recruitCrewMember: (id: CrewCharId) => void
  initGame: (trait?: string) => void
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
  setFlagship: (shipId: number) => void
  acceptTask: (taskId: number) => void
  completeTask: (taskId: number) => void
  applyEventOutcome: (outcome: EventOutcome) => void
  addEventLog: (entry: EventLogEntry) => void
  discoverPort: (portId: number) => void
  /** 港口休整：耗时一日回士气（消耗少量补给） */
  restAtPort: () => void
  /** 甲板盛宴：花金币与食物大幅回士气、小幅涨声望 */
  holdFeast: () => void
  /** 第三条线：操舵挑战结算——沿当前航线真实推进一段航程，并按评级结算士气/耐久/声望 */
  finishHelmRun: (result: HelmRunResult) => void
  /** 剧情线：标记一段致辞已播过（幂等） */
  markDialogueSeen: (scriptId: string) => void
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

/**
 * 动态定价：库存越低越贵。
 * 实际买价 = 基准价 × modifier × (1 + (1 - 库存率) × 0.4) × 声望/特质系数
 * 每日 +1 天时库存回升 STOCK_RECOVER_PER_DAY，高需求商品随时间自然回补。
 */
export function dynamicBuyPrice(pg: { price: number; priceModifier: number }, currentStock: number, baseStock: number, fleet?: Pick<Fleet, 'fame' | 'trait'>, opts?: Parameters<typeof priceMultiplier>[1]): number {
  const stockRatio = baseStock > 0 ? Math.min(1, currentStock / baseStock) : 1
  const surge = 1 + (1 - stockRatio) * 0.4
  return Math.round(pg.price * pg.priceModifier * surge * priceMultiplier(fleet, opts))
}

export function dynamicSellPrice(pg: { price: number; priceModifier: number }, currentStock: number, baseStock: number, fleet?: Pick<Fleet, 'fame' | 'trait'>, opts?: Parameters<typeof priceMultiplier>[1]): number {
  const stockRatio = baseStock > 0 ? Math.min(1, currentStock / baseStock) : 1
  const surge = 1 + (1 - stockRatio) * 0.4
  // 声望/特质让卖出更划算：除以同一系数（系数 <1 即加价）
  return Math.round(pg.price * pg.priceModifier * surge * 0.85 / priceMultiplier(fleet, opts))
}

/** 库存回补：与 advanceDay / restAtPort 共用同一套市场节奏 */
function advanceMarketStock(stock: Record<string, number>): Record<string, number> {
  const updated: Record<string, number> = { ...stock }
  for (const pg of portGoods) {
    const key = `${pg.portId}:${pg.goodId}`
    const current = updated[key] ?? pg.stock
    if (current < pg.stock) {
      updated[key] = Math.min(pg.stock, current + GAME_BALANCE.STOCK_RECOVER_PER_DAY)
    }
  }
  return updated
}

/**
 * 生成航线情报：危险等级越高，好天气越少、匪踪与风暴越多。
 * rand 可注入以便测试。
 */
export function generateRouteIntel(route: Route, day: number, rand: () => number = Math.random): RouteIntel {
  const danger = route.dangerLevel
  const jitter = () => (rand() - 0.5) * 0.12
  const clamp01 = (v: number) => Math.max(0.05, Math.min(0.95, v))
  return {
    routeKey: `${route.fromPortId}-${route.toPortId}`,
    fairWeather: clamp01(0.78 - danger * 0.09 + jitter()),
    pirateRisk: clamp01(danger * 0.07 + jitter()),
    stormRisk: clamp01(danger * 0.055 + jitter()),
    boughtDay: day,
  }
}

/**
 * 军官工资结算：够付全扣；不够付则按名单顺序辞退到付得起为止。
 */
export function settleOfficerWages(
  officers: OfficerId[],
  gold: number,
): { officers: OfficerId[]; gold: number; left: OfficerId[] } {
  if (officers.length === 0) return { officers, gold, left: [] }
  const wageOf = (id: OfficerId) => OFFICER_MAP.get(id)?.dailyWage ?? 0
  const totalWage = officers.reduce((sum, id) => sum + wageOf(id), 0)
  if (gold >= totalWage) return { officers, gold: gold - totalWage, left: [] }
  const kept: OfficerId[] = []
  const left: OfficerId[] = []
  let owed = 0
  for (const id of officers) {
    const w = wageOf(id)
    if (owed + w <= gold) {
      kept.push(id)
      owed += w
    } else {
      left.push(id)
    }
  }
  return { officers: kept, gold: Math.max(0, gold - owed), left }
}

/**
 * 竞争船长推进：每 RIVAL_TICK_DAYS 天调用一次。
 * 按性格增长（激进涨钱快、稳健均衡、探险涨声望与发现），
 * 并概率性产生一条见闻——世界在玩家背后继续转动。
 */
export function advanceRivals(rivals: Rival[], day: number): { rivals: Rival[]; news: RivalNews[] } {
  const news: RivalNews[] = []
  const next = rivals.map(r => {
    const rng = Math.random()
    let goldGain = 0
    let fameGain = 0
    let portGain = 0
    if (r.style === 'aggressive') {
      goldGain = 60 + rng * 90
      fameGain = rng < 0.3 ? 1 : 0
      portGain = rng < 0.08 ? 1 : 0
    } else if (r.style === 'steady') {
      goldGain = 35 + rng * 60
      fameGain = rng < 0.4 ? 1 : 0
      portGain = rng < 0.05 ? 1 : 0
    } else {
      goldGain = 10 + rng * 35
      fameGain = 1 + Math.floor(rng * 3)
      portGain = rng < 0.35 ? 1 : 0
    }
    const pool = RIVAL_ACTIONS[r.style]
    const action = pool[Math.floor(rng * pool.length)]
    // 约四成的行动会写成见闻，推送给玩家
    if (rng < 0.4) {
      news.push({
        id: `rival-${r.id}-${day}-${Math.random().toString(36).slice(2, 6)}`,
        day,
        rivalId: r.id,
        text: `${r.name}${action}。`,
      })
    }
    return {
      ...r,
      gold: r.gold + Math.round(goldGain),
      fame: r.fame + fameGain,
      portsFound: Math.min(20, r.portsFound + portGain),
      lastAction: action,
      lastActionDay: day,
    }
  })
  return { rivals: next, news }
}

type StoreNotification = GameStore['notifications'][number]
/** 状态补丁：GameState 的局部 + 仅存在于 store 层的字段 */
type StatePatch = Partial<GameState> & Partial<Pick<GameStore, 'notifications' | 'seenHistoricalEvents' | 'lastEventDay' | 'simSpeed' | 'shipPosition'>>

/**
 * 成就检查 + 兑现（横幅 + 通知 + 入账）。
 * 在关键动作后调用；返回需要合并进 state 的增量。
 */
function grantAchievements(state: GameState & { notifications?: StoreNotification[] }): StatePatch | null {
  const unlocked = checkAchievements(state)
  if (unlocked.length === 0) return null
  unlocked.forEach(a => {
    useFxStore.getState().fx(
      { kind: 'banner', tone: 'gold', text: `🏆 ${a.title}`, sub: a.description },
      'milestone',
    )
    useFxStore.getState().cue('milestone')
  })
  return {
    achievements: [...state.achievements, ...unlocked.map(a => a.id)],
    notifications: [
      ...(state.notifications ?? []),
      ...unlocked.map(a => ({
        id: `achievement-${a.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'achievement' as const,
        title: `🏆 成就解锁 · ${a.title}`,
        message: a.description,
        timestamp: Date.now(),
      })),
    ],
  }
}

/** 检查并返回成就增量（供 set 回调合并） */
function withAchievements(state: GameState & { notifications?: StoreNotification[] }, patch: StatePatch): StatePatch {
  const grant = grantAchievements({ ...state, ...patch })
  return grant ? { ...patch, ...grant } : patch
}

/** 检查并返回本局达成的胜利结局描述（null 表示未达成） */
function checkVictory(state: GameState): string | null {  if (state.discoveredPorts.length >= GAME_BALANCE.VICTORY_DISCOVER_ALL) {
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
        if (state.fleet.isSailing || state.pendingVoyage) return state

        const originLat: number | null = state.fleet.currentPortId
          ? (ports.find(p => p.id === state.fleet.currentPortId))?.latitude ?? null
          : state.shipPosition?.[0] ?? null
        const originLng: number | null = state.fleet.currentPortId
          ? (ports.find(p => p.id === state.fleet.currentPortId))?.longitude ?? null
          : state.shipPosition?.[1] ?? null

        if (originLat == null || originLng == null) return state

        // 航线距离用**实际路径长度**（大圆 + 避让陆地后的弧长），
        // 而不是两点直线距离。
        //
        // 为什么：船真正走的就是这条路径。若预估按直线距离算、
        // 实际按路径长度走，抵达时总会比预估多走一点——
        // 玩家看到的「还剩 3 天」和实际差半天，这种偏差日积月累就成了
        // 「数字在骗人」。现在预估与结算同源。
        const geom = getRouteGeometry(
          [originLat, originLng],
          [waypoint.latitude, waypoint.longitude],
        )
        const distanceNm = geom.totalNm
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

        // 只生成计划——真正起航前玩家要评估补给、选航速、（可选）买情报
        return {
          pendingVoyage: { waypoint, route: customRoute },
          shipPosition: state.shipPosition ?? [originLat, originLng],
        }
      }),

      confirmDeparture: () => set((state) => {
        const pending = state.pendingVoyage
        if (!pending || state.fleet.isSailing) return state
        // 航段数按「基准天数」算一次就固定——否则玩家一路抢行，
        // 总天数变了段数跟着变，底栏的「第 N 段」会跳。
        const baselineDays = calculateSailingDays(pending.route, state.fleet, state.officers)
        const total = segmentCountFor(baselineDays)
        // 航段按**距离均分**：距离是确定的，天数会随方针漂移。
        const segmentNm = pending.route.distance / total
        const hazard = hazardLabel(pending.route.dangerLevel, state.weather.kind)
        return {
          pendingVoyage: null,
          currentRoute: pending.route,
          routeProgress: 0,
          // 航线起点 = 出航时的船位。地图画整条航线，船沿同一条走。
          routeOrigin: state.shipPosition ? [state.shipPosition[0], state.shipPosition[1]] : null,
          waypoint: pending.waypoint,
          shipPosition: state.shipPosition,
          fleet: { ...state.fleet, isSailing: true, currentPortId: null },
          segmentCount: total,
          segmentIndex: 0,
          // 出航即进入第 0 段的抉择：让玩家第一件事就是做决定，
          // 而不是先看十几秒空转。
          stance: 'steady',
          pendingSegment: {
            index: 0,
            total,
            hazard,
            segmentNm,
            remainingNm: pending.route.distance,
            daysLeft: baselineDays,
          },
          gamePhase: 'segment',
        }
      }),

      chooseStance: (stanceId) => set((state) => {
        if (!state.pendingSegment) return state
        const profile = STANCES[stanceId]
        // 姿态的士气代价在选定时立刻兑现——
        // 「抢行更累」必须马上疼，不能等到段末才结算。
        const newMorale = Math.max(
          0,
          Math.min(GAME_BALANCE.MORALE_MAX, state.fleet.morale + profile.moraleDelta),
        )
        const nextFleet = { ...state.fleet, morale: newMorale }

        // 段末兑现反馈：让玩家看见自己选了什么
        useFxStore.getState().fx({
          kind: 'banner',
          tone: profile.tone === 'hot' ? 'gold' : profile.tone === 'calm' ? 'safe' : 'plain',
          text: `${profile.icon} ${profile.name}`,
          sub: profile.hint,
        }, 'sail')

        return {
          stance: stanceId,
          pendingSegment: null,
          fleet: nextFleet,
          // 选完方针立刻进入本段操舵——「航行节拍器」的下一拍。
          //
          // 之前操舵是可选加分项（按 H 才开，每段一次），于是「最有操作感
          // 的环节」恰恰是玩家最容易被跳过的环节。现在它跟方针绑定：
          // 每段起航前都必须掌舵，评级决定这一段能少走多少海里。
          // gamePhase 切到 'helm'，SailingController 会停船等玩家。
          pendingHelm: { segmentIndex: state.pendingSegment.index },
          gamePhase: 'helm',
        }
      }),

      syncSegmentBoundary: (progress) => set((state) => {
        if (!state.fleet.isSailing || state.pendingSegment) return state
        if (state.segmentCount <= 0) return state
        // **逐段推进**：每次只跨一段。
        //
        // 之前用 segmentIndexFor(progress, count) 直接算出「当前进度落在第几段」，
        // 高速下一帧跨过好几段时会把玩家直接推到第 4 段，
        // 中间两段的抉择被完全跳过——航段抉择的核心机制就废了。
        // 现在每次只推进到「下一段的起点」，弹一次抉择，等玩家选完再走。
        const nextIndex = state.segmentIndex + 1
        if (nextIndex >= state.segmentCount) return state
        const boundary = nextSegmentBoundary(state.segmentIndex, state.segmentCount)
        if (progress < boundary) return state
        const route = state.currentRoute
        if (!route) return state
        const totalNm = route.distance
        // 剩余航程 = 总距离 × (1 − 进度)；本段按距离均分
        const remainingNm = Math.max(0, Math.round(totalNm * (1 - Math.min(1, Math.max(0, progress)))))
        const segmentNm = totalNm / state.segmentCount
        // 剩余天数按**当前方针**估算（方针改变航速，天数会变）
        const stanceMul = STANCES[state.stance].speedMul
        const weatherMul = WEATHER_INFO[state.weather.kind].sailMul * weatherFavorFactor(state.weather.kind)
        const nmPerDay = dailyDistanceNm(state.fleet, state.officers, route.windFavor, stanceMul, weatherMul)
        const daysLeft = nmPerDay > 0 ? Math.max(0, Math.ceil(remainingNm / nmPerDay)) : 0
        return {
          segmentIndex: nextIndex,
          pendingSegment: {
            index: nextIndex,
            total: state.segmentCount,
            hazard: hazardLabel(route.dangerLevel, state.weather.kind),
            segmentNm,
            remainingNm,
            daysLeft,
          },
          gamePhase: 'segment',
        }
      }),

      cancelVoyage: () => set({ pendingVoyage: null }),

      buyRouteIntel: () => set((state) => {
        const pending = state.pendingVoyage
        if (!pending || state.fleet.gold < GAME_BALANCE.INTEL_COST) return state
        const { route } = pending
        const key = `${route.fromPortId}-${route.toPortId}`
        const existing = state.routeIntel[key]
        // 有效期内的情报无需重复购买
        if (existing && state.fleet.day - existing.boughtDay < GAME_BALANCE.INTEL_VALID_DAYS) return state
        const intel = generateRouteIntel(route, state.fleet.day)
        return {
          fleet: { ...state.fleet, gold: state.fleet.gold - GAME_BALANCE.INTEL_COST },
          routeIntel: { ...state.routeIntel, [key]: intel },
          notifications: [...state.notifications, {
            id: `intel-${key}-${Date.now()}`,
            type: 'discovery' as const,
            title: '🗺️ 航线情报已入手',
            message: '老船长在桌上铺开海图，把这一带的风暴与匪踪都指给了你看。',
            timestamp: Date.now(),
          }],
        }
      }),

      recruitOfficer: (id) => set((state) => {
        if (state.officers.includes(id)) return state
        const def = OFFICER_MAP.get(id)
        if (!def || state.fleet.gold < def.hireCost) return state
        return withAchievements(state, {
          fleet: { ...state.fleet, gold: state.fleet.gold - def.hireCost },
          officers: [...state.officers, id],
          notifications: [...state.notifications, {
            id: `officer-${id}-${Date.now()}`,
            type: 'achievement' as const,
            title: `${def.icon} ${def.name}加入舰队`,
            message: `${def.effect}（日薪 ${def.dailyWage} 金币）`,
            timestamp: Date.now(),
          }],
        })
      }),

      recruitCrewMember: (id) => set((state) => {
        if (state.crewRoster.some(m => m.id === id)) return state
        if (!state.fleet.currentPortId || state.fleet.isSailing) return state
        const def = CREW_CHAR_MAP.get(id)
        if (!def || state.fleet.gold < def.hireCost) return state
        const member: CrewMember = {
          id,
          loyalty: GAME_BALANCE.CREW_LOYALTY_START,
          hiredDay: state.fleet.day,
        }
        return withAchievements(state, {
          fleet: { ...state.fleet, gold: state.fleet.gold - def.hireCost },
          crewRoster: [...state.crewRoster, member],
          notifications: [...state.notifications, {
            id: `crew-${id}-${Date.now()}`,
            type: 'achievement' as const,
            title: `${def.icon} ${def.name}（${def.title}）上了你的船`,
            message: def.origin,
            timestamp: Date.now(),
          }],
        })
      }),

      changeCourse: (waypoint) => set((state) => {
        if (!state.fleet.isSailing) return state

        const currentPos = state.shipPosition
        if (!currentPos) return state

        // 与 sailToWaypoint 同口径：距离取实际路径长度
        const geom = getRouteGeometry(
          [currentPos[0], currentPos[1]],
          [waypoint.latitude, waypoint.longitude],
        )
        const distanceNm = geom.totalNm
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
          // 中途改道：从船的当前位置重新起算一条新航线
          routeOrigin: [currentPos[0], currentPos[1]],
          waypoint,
        }
      }),

      initGame: (trait) => {
        const startPort = ports.find(p => p.id === 6)
        set({
          fleet: { ...createStartingFleet(), trait: trait ?? DEFAULT_TRAIT },
          currentRoute: null,
          routeProgress: 0,
          routeOrigin: null,
          waypoint: null,
          shipPosition: startPort ? [startPort.latitude, startPort.longitude] : null,
          segmentCount: 0,
          segmentIndex: 0,
          stance: 'steady',
          pendingSegment: null,
          pendingHelm: null,
          helmAdvance: null,
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
          eventFlags: {},
          stats: createInitialStats(),
          achievements: [],
          lastEventDay: 0,
          pendingVoyage: null,
          routeIntel: {},
          rivals: RIVALS.map(r => ({ ...r })),
          rivalNews: [],
          officers: [],
          factionRep: createInitialFactionRep(),
          crewRoster: [],
          notoriety: createInitialNotoriety(),
          weather: createInitialWeather(),
          dialogueSeen: [],
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
          // 航线起点 = 出发港坐标
          routeOrigin: fromPort ? [fromPort.latitude, fromPort.longitude] : null,
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
        let newSimSpeed = state.simSpeed
        let newStats = { ...state.stats }
        let newEventFlags = state.eventFlags

        // 军官工资结算：付不起全员工资时，按名单顺序辞退到付得起为止
        let newOfficers = state.officers
        if (newOfficers.length > 0) {
          const settled = settleOfficerWages(newOfficers, newFleet.gold)
          newOfficers = settled.officers
          newFleet = { ...newFleet, gold: settled.gold }
          for (const id of settled.left) {
            newNotifications = [...newNotifications, {
              id: `officer-left-${id}-${newDay}`,
              type: 'warning' as const,
              title: `${OFFICER_MAP.get(id)?.name ?? '军官'}离船了`,
              message: '付不起薪水的人才留不住——他在下一个港口放下了行李。',
              timestamp: Date.now(),
            }]
          }
        }

        // 港内：消耗极低但仍存在（船员上岸自给一部分），库存缓慢回补
        if (!fleet.isSailing) {
          const consumption = calculateDailyConsumption(fleet)
          const newFood = Math.max(0, fleet.food - Math.ceil(consumption.food / 4))
          const newWater = Math.max(0, fleet.water - Math.ceil(consumption.water / 4))
          newFleet = { ...newFleet, food: newFood, water: newWater }
        }

        // 库存回补
        newMarketStock = advanceMarketStock(newMarketStock)

        // 天候推移（环境线的时钟）：位置取航行中的船位，港内取所在港口
        let newWeather = state.weather
        {
          let wLat: number | null = null
          let wLng: number | null = null
          if (fleet.isSailing) {
            wLat = state.shipPosition?.[0] ?? null
            wLng = state.shipPosition?.[1] ?? null
          } else {
            const curPort = ports.find(p => p.id === fleet.currentPortId)
            wLat = curPort?.latitude ?? null
            wLng = curPort?.longitude ?? null
          }
          if (wLat != null && wLng != null) {
            const beforeKind = newWeather.kind
            newWeather = advanceWeather(newWeather, newDay, wLat, wLng, prevailingWindBearing(wLat))
            if (newWeather.kind !== beforeKind && (isNotableWeather(newWeather.kind) || isNotableWeather(beforeKind))) {
              newNotifications = [...newNotifications, {
                id: `weather-${newDay}`,
                type: 'warning' as const,
                title: '天候变化',
                message: weatherChangeMessage(newWeather),
                timestamp: Date.now(),
              }]
            }
          }
        }

        if (fleet.isSailing) {
          // 补给消耗：方针决定这一段的消耗倍率。
          // 注意「谨慎」的补给率是 ×1.0 而不是更低——航速慢意味着
          // 在海上待的天数更多，总消耗反而更高。这正是「稳」的代价。
          const profile = STANCES[state.stance]
          const supplyMul = profile.supplyMul
          const consumption = calculateDailyConsumption(fleet)
          // 第二条线：胖厨子班让咸肉与豆子经得起更久
          const cookRelief = state.crewRoster.some(m => m.id === 'cook') ? 0.8 : 1
          // 取整口径与 segment.forecastSegment 完全一致（dailyFoodUse / dailyWaterUse），
          // 这样"抉择面板预测 32 份粮"与"实际扣 32 份"是同一个数。
          const newFood = Math.max(0, fleet.food - dailyFoodUse(consumption.food, supplyMul, cookRelief))
          const newWater = Math.max(0, fleet.water - dailyWaterUse(consumption.water, supplyMul))
          let newMorale = fleet.morale
          if (newFood === 0 || newWater === 0) {
            // 船医与随船神甫让绝望来得慢一些
            const relief = (newOfficers.includes('surgeon') ? 2 : 0) + (state.crewRoster.some(m => m.id === 'chaplain') ? 2 : 0)
            const decay = Math.max(1, GAME_BALANCE.MORALE_DECAY_PER_DAY - relief)
            newMorale = Math.max(0, fleet.morale - decay)
          }
          newFleet = { ...newFleet, food: newFood, water: newWater, morale: newMorale }
          newStats = { ...newStats, daysSailed: newStats.daysSailed + 1 }
          // 航行磨损：方针决定这一段每天啃多少船体。
          //
          // 磨损用「累进余数」而不是每日取整：
          // 取整会让 Math.round(0.3)=0，谨慎方针变成「船永不磨损」；
          // 而且 ×2.2 会被 ×1.7 的天数缩短抵消（抢行 3 天 6 点 vs
          // 按部就班 5 天 5 点，倍率形同虚设）。累进后倍率才真正生效。
          {
            const { points, carry } = settleWear(newFleet.durabilityCarry, dailyWearRate(profile), 1)
            newFleet = { ...newFleet, durabilityCarry: carry }
            if (points > 0) {
              newFleet = {
                ...newFleet,
                ships: newFleet.ships.map(ship => ({
                  ...ship,
                  durability: Math.max(0, ship.durability - points),
                })),
              }
            }
          }

          const lastEventDay = state.lastEventDay ?? 0
          // 天气偏置：暴风雨/落雨/浓雾让海面更"有话可说"
          // 姿态再叠一层：抢行遇事更频繁，谨慎遇事更少
          const eventBias = WEATHER_INFO[newWeather.kind].eventBias * profile.eventRateMul
          const triggeredEvent = eventBias !== 1
            ? getRandomEvents({ ...state, fleet: newFleet, routeProgress: state.routeProgress }, events, newDay - lastEventDay, eventBias)
            : getRandomEvents({ ...state, fleet: newFleet, routeProgress: state.routeProgress }, events, newDay - lastEventDay)
          if (triggeredEvent) {
            newCurrentEvent = triggeredEvent
            newGamePhase = 'event'
            // 事件链：requiresFlags 事件触发后消耗旗标（一次性）
            if (triggeredEvent.triggerCondition.requiresFlags) {
              newEventFlags = consumeEventFlags(triggeredEvent, state.eventFlags)
            }
          }
        }

        // 竞争船长推进：世界在玩家背后继续转动
        let newRivals = state.rivals
        let newRivalNews = state.rivalNews
        if (newDay % GAME_BALANCE.RIVAL_TICK_DAYS === 0) {
          const tick = advanceRivals(state.rivals, newDay)
          newRivals = tick.rivals
          newRivalNews = [...tick.news, ...state.rivalNews].slice(0, 20)
          for (const n of tick.news) {
            newNotifications = [...newNotifications, {
              id: n.id,
              type: 'discovery' as const,
              title: '⚓ 航海见闻',
              message: n.text,
              timestamp: Date.now(),
            }]
          }
        }

        // 暴风雨的日常代价：啃船底、压士气（放在航行块之后，避免被断粮士气结算覆盖）
        if (fleet.isSailing && newWeather.kind === 'storm') {
          const wi = WEATHER_INFO.storm
          if (wi.wearAdd > 0) {
            newFleet = {
              ...newFleet,
              ships: newFleet.ships.map(ship => ({
                ...ship,
                durability: Math.max(0, ship.durability - wi.wearAdd),
              })),
            }
          }
          if (wi.moraleHit > 0) {
            newFleet = { ...newFleet, morale: Math.max(0, newFleet.morale - wi.moraleHit) }
          }
        }

        // 第二条线：名船员每日忠诚结算（低士气/高危航段磨忠诚；跌破风险线可能离船或死亡）
        let newCrewRoster = state.crewRoster
        if (state.crewRoster.length > 0) {
          const crewTick = tickCrewLoyalty(state, newFleet, newDay, state.currentRoute?.dangerLevel ?? 0)
          newCrewRoster = crewTick.roster
          for (const id of crewTick.left) {
            const def = CREW_CHAR_MAP.get(id)
            newNotifications = [...newNotifications, {
              id: `crew-desert-${id}-${newDay}`,
              type: 'warning' as const,
              title: `🚪 ${def?.name ?? '船员'}（${def?.title ?? ''}）离船了`,
              message: def
                ? `“${def.quote}” —— 他没有再说第二句话，行李卷得比帆还快。`
                : '忠诚耗尽的人留不住。',
              timestamp: Date.now(),
            }]
          }
          for (const id of crewTick.died) {
            const def = CREW_CHAR_MAP.get(id)
            newNotifications = [...newNotifications, {
              id: `crew-death-${id}-${newDay}`,
              type: 'warning' as const,
              title: `⚰️ ${def?.name ?? '船员'}（${def?.title ?? ''}）没有挺过去`,
              message: '断粮的日子里，坏血病比风暴更耐心。全舰为他把最后一点朗姆酒洒进了海里。',
              timestamp: Date.now(),
            }]
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
            // 把年份、事件、和真正的历史正文一起抬到台面上——
            // 这段 description 此前只藏在时间轴的悬停提示里，等于没给玩家看
            title: `${historicalEvent.year}年 · ${historicalEvent.title}`,
            message: historicalEvent.description,
            timestamp: Date.now(),
          }]
          newSeenHistoricalEvents = [...newSeenHistoricalEvents, historicalEvent.day]
          newStats = { ...newStats, historySeen: newStats.historySeen + 1 }
          // 一个历史节点横跨十年，值得让玩家真的停下来看一眼；
          // 自动降回 1x，之后玩家若要赶路自己调回去即可（不强制、不打断）。
          if (state.simSpeed > 1) newSimSpeed = 1
        }

        // 胜利检查（不覆盖 gameover）
        if (newGamePhase === 'playing') {
          const victoryDesc = checkVictory({ ...state, fleet: newFleet, discoveredPorts: state.discoveredPorts, completedTasks: state.completedTasks })
          if (victoryDesc) {
            set(withAchievements({ ...state, fleet: newFleet, stats: newStats }, {
              fleet: newFleet,
              gamePhase: 'gameover',
              currentEvent: null,
              notifications: newNotifications,
              seenHistoricalEvents: newSeenHistoricalEvents,
              marketStock: newMarketStock,
              lastEventDay: state.lastEventDay,
              victoryDay: newDay,
              stats: newStats,
              rivals: newRivals,
              rivalNews: newRivalNews,
              officers: newOfficers,
              crewRoster: newCrewRoster,
              weather: newWeather,
            }))
            return
          }
        }

        set(withAchievements({ ...state, fleet: newFleet, stats: newStats }, {
          fleet: newFleet,
          gamePhase: newGamePhase,
          currentEvent: newCurrentEvent,
          notifications: newNotifications,
          seenHistoricalEvents: newSeenHistoricalEvents,
          marketStock: newMarketStock,
          lastEventDay: newCurrentEvent ? newDay : state.lastEventDay,
          simSpeed: newSimSpeed,
          stats: newStats,
          eventFlags: newEventFlags,
          rivals: newRivals,
          rivalNews: newRivalNews,
          officers: newOfficers,
          crewRoster: newCrewRoster,
          weather: newWeather,
        }))
      },

      arriveAtPort: (portId) => set((state) => {
        const port = ports.find(p => p.id === portId)
        return {
          fleet: { ...state.fleet, currentPortId: portId, isSailing: false },
          currentRoute: null,
          routeProgress: 0,
          routeOrigin: null,
          waypoint: null,
          // 到港即放弃任何未确认的出航计划
          pendingVoyage: null,
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
        const buyPrice = dynamicBuyPrice(pg, stock, pg.stock, state.fleet, priceOpts(state))
        if (!canAfford(state.fleet.gold, buyPrice, quantity)) return state
        if (!hasCargoSpace(state.fleet, quantity)) return state
        const newCargo = updateCargo(state.fleet.cargo, goodId, quantity)
        const total = buyPrice * quantity
        // 大额贸易赢得商会好感（第二条线）
        const guildGain = total >= GAME_BALANCE.GUILD_DEAL_MIN ? GAME_BALANCE.GUILD_DEAL_FAME : 0
        return withAchievements(state, {
          fleet: syncUsedCapacity({ ...state.fleet, gold: state.fleet.gold - total, cargo: newCargo }),
          marketStock: { ...state.marketStock, [key]: stock - quantity },
          factionRep: guildGain
            ? { ...state.factionRep, guild: Math.min(100, state.factionRep.guild + guildGain) }
            : state.factionRep,
          stats: {
            ...state.stats,
            trades: state.stats.trades + 1,
            bestDeal: Math.max(state.stats.bestDeal, total),
            tradeProfit: state.stats.tradeProfit - total,
          },
        })
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
        const sellPrice = dynamicSellPrice(pg, stock, pg.stock, state.fleet, priceOpts(state))
        const newCargo = updateCargo(state.fleet.cargo, goodId, -quantity)
        const total = sellPrice * quantity
        // 大额贸易赢得商会好感（第二条线）
        const guildGain = total >= GAME_BALANCE.GUILD_DEAL_MIN ? GAME_BALANCE.GUILD_DEAL_FAME : 0
        return withAchievements(state, {
          fleet: syncUsedCapacity({ ...state.fleet, gold: state.fleet.gold + total, cargo: newCargo }),
          marketStock: { ...state.marketStock, [key]: stock + quantity },
          factionRep: guildGain
            ? { ...state.factionRep, guild: Math.min(100, state.factionRep.guild + guildGain) }
            : state.factionRep,
          stats: {
            ...state.stats,
            trades: state.stats.trades + 1,
            bestDeal: Math.max(state.stats.bestDeal, total),
            tradeProfit: state.stats.tradeProfit + total,
          },
        })
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
        // 旗舰不能卖——须先另立旗舰
        if (shipId === state.fleet.flagshipId) return state
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

      setFlagship: (shipId) => set((state) => {
        if (!state.fleet.ships.some(s => s.id === shipId)) return state
        return { fleet: { ...state.fleet, flagshipId: shipId } }
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
        return withAchievements(state, {
          fleet: syncUsedCapacity({ ...state.fleet, gold: state.fleet.gold + task.reward.gold, fame: state.fleet.fame + fameGain }),
          completedTasks: [...state.completedTasks, taskId],
          activeTasks: state.activeTasks.filter(t => t.id !== taskId),
        })
      }),

      applyEventOutcome: (outcome) => set((state) => {
        // 注意：这里**不再**做姿态缩放/特质修正/大副弹压。
        // 这些已经在 EventCard.resolveOutcome 里完成了——在掷出结果的瞬间
        // 就调整好，结算屏显示的正是这份已生效的数据。
        // 如果在这里再加工一次，数字会被放大两遍，
        // 玩家看到的就会和实际扣减对不上账。
        const quartered = outcome
        const newFleet = {
          ...state.fleet,
          gold: Math.max(0, state.fleet.gold + quartered.goldChange),
          food: Math.max(0, state.fleet.food + quartered.foodChange),
          water: Math.max(0, state.fleet.water + quartered.waterChange),
          morale: Math.max(0, Math.min(GAME_BALANCE.MORALE_MAX, state.fleet.morale + quartered.moraleChange)),
          fame: Math.max(0, state.fleet.fame + (quartered.fameChange ?? 0)),
          ships: state.fleet.ships.map(ship => ({
            ...ship,
            durability: Math.max(0, Math.min(ship.maxDurability, ship.durability + quartered.durabilityChange)),
            crew: Math.max(0, Math.min(ship.maxCrew, ship.crew + quartered.crewChange)),
          })),
        }
        const allShipsDestroyed = newFleet.ships.every(s => s.durability <= 0)
        // 事件旗标（事件链）
        const newFlags = quartered.setsFlag
          ? { ...state.eventFlags, [quartered.setsFlag]: (state.eventFlags[quartered.setsFlag] ?? 0) + 1 }
          : state.eventFlags
        // 派系声望结算（第二条线）：走私掉王室、献宝赢王室……
        const newFactionRep = { ...state.factionRep }
        if (quartered.factionChange) {
          for (const [fid, delta] of Object.entries(quartered.factionChange)) {
            const key = fid as FactionId
            newFactionRep[key] = Math.max(-100, Math.min(100, newFactionRep[key] + (delta ?? 0)))
          }
        }
        // 身份取向结算（第二条线）：残酷/仁慈/贪婪/鲁猛/守秘
        const newNotoriety = { ...state.notoriety }
        if (quartered.notoriety) {
          for (const [axis, delta] of Object.entries(quartered.notoriety)) {
            const key = axis as NotorietyAxis
            newNotoriety[key] = Math.max(0, newNotoriety[key] + (delta ?? 0))
          }
        }
        // 名船员个人事件结算：忠诚变化 / 离船 / 死亡
        let newRoster = state.crewRoster
        const crewNotifs: GameStore['notifications'] = []
        if (quartered.crewEvent) {
          const { member, loyaltyChange = 0, leaves = false, dies = false } = quartered.crewEvent
          const def = CREW_CHAR_MAP.get(member)
          if (dies) {
            newRoster = newRoster.filter(m => m.id !== member)
            if (def) crewNotifs.push({
              id: `crew-died-${member}-${Date.now()}`,
              type: 'warning' as const,
              title: `⚰️ ${def.name}（${def.title}）葬身大海`,
              message: '全舰默哀一分钟。他的物品被仔细收进一只木箱，等着有一天带回故乡。',
              timestamp: Date.now(),
            })
          } else if (leaves) {
            newRoster = newRoster.filter(m => m.id !== member)
            if (def) crewNotifs.push({
              id: `crew-left-${member}-${Date.now()}`,
              type: 'warning' as const,
              title: `🚪 ${def.name}（${def.title}）离船了`,
              message: '忠诚耗尽的人留不住。他在下一个港口放下了行李，从此天涯各船。',
              timestamp: Date.now(),
            })
          } else {
            newRoster = newRoster.map(m =>
              m.id === member
                ? { ...m, loyalty: Math.max(0, Math.min(100, m.loyalty + loyaltyChange)) }
                : m,
            )
          }
        }
        return withAchievements({ ...state, eventFlags: newFlags, factionRep: newFactionRep, notoriety: newNotoriety, crewRoster: newRoster }, {
          fleet: newFleet,
          gamePhase: allShipsDestroyed || newFleet.morale <= 0 ? 'gameover' : state.gamePhase,
          eventFlags: newFlags,
          factionRep: newFactionRep,
          notoriety: newNotoriety,
          crewRoster: newRoster,
          stats: { ...state.stats, eventsSurvived: state.stats.eventsSurvived + 1 },
          notifications: [...state.notifications, ...crewNotifs],
        })
      }),

      addEventLog: (entry) => set((state) => {
        // 海盗战胜判定：缴获了财物（goldChange > 0）
        const pirateWin = entry.event.type === 'pirate' && entry.outcome.goldChange > 0
        // 第二条线：击退海盗赢得王室赏识、在兄弟会结下梁子（同一行为，两副面孔）
        const factionPatch = pirateWin
          ? {
              factionRep: {
                ...state.factionRep,
                crown: Math.min(100, state.factionRep.crown + GAME_BALANCE.CROWN_PIRATE_WIN),
                brethren: Math.max(-100, state.factionRep.brethren + GAME_BALANCE.BRETHREN_PIRATE_WIN),
              },
            }
          : {}
        return withAchievements(state, {
          ...factionPatch,
          eventLog: [...state.eventLog, entry],
          stats: pirateWin
            ? { ...state.stats, pirateWins: state.stats.pirateWins + 1 }
            : state.stats,
        })
      }),

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

        // 第二条线：新海图交给学者、新疆土报效王室——一次发现，两份人情
        const discoverFaction = {
          factionRep: {
            ...state.factionRep,
            scholars: Math.min(100, state.factionRep.scholars + GAME_BALANCE.SCHOLARS_DISCOVER),
            crown: Math.min(100, state.factionRep.crown + GAME_BALANCE.CROWN_DISCOVER),
          },
        }

        if (isFirstDiscovery) {
          return withAchievements(state, {
            ...discoverFaction,
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
          })
        }

        if (isMilestone) {
          return withAchievements(state, {
            ...discoverFaction,
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
          })
        }

        return withAchievements(state, {
          ...discoverFaction,
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
        })
      }),

      restAtPort: () => set((state) => {
        if (!state.fleet.currentPortId || state.fleet.isSailing) return state
        const newDay = state.fleet.day + 1
        const newFleet = {
          ...state.fleet,
          day: newDay,
          food: Math.max(0, state.fleet.food - GAME_BALANCE.REST_FOOD),
          water: Math.max(0, state.fleet.water - GAME_BALANCE.REST_WATER),
          morale: Math.min(GAME_BALANCE.MORALE_MAX, state.fleet.morale + GAME_BALANCE.REST_MORALE),
        }
        useFxStore.getState().fx(
          { kind: 'float', tone: 'safe', text: `士气 +${GAME_BALANCE.REST_MORALE}`, sub: '港口休整一日' },
          'port',
        )
        return withAchievements(state, {
          fleet: newFleet,
          marketStock: advanceMarketStock(state.marketStock),
          notifications: [...state.notifications, {
            id: `rest-${Date.now()}`,
            type: 'history' as const,
            title: '⚓ 休整一日',
            message: `水手们上岸休整、晾晒帆布，士气回升至 ${newFleet.morale}。`,
            timestamp: Date.now(),
          }],
        })
      }),

      holdFeast: () => set((state) => {
        if (!state.fleet.currentPortId || state.fleet.isSailing) return state
        if (state.fleet.gold < GAME_BALANCE.FEAST_COST) return state
        if (state.fleet.food < GAME_BALANCE.FEAST_FOOD || state.fleet.water < GAME_BALANCE.FEAST_WATER) return state
        const newFleet = {
          ...state.fleet,
          gold: state.fleet.gold - GAME_BALANCE.FEAST_COST,
          food: state.fleet.food - GAME_BALANCE.FEAST_FOOD,
          water: state.fleet.water - GAME_BALANCE.FEAST_WATER,
          morale: Math.min(GAME_BALANCE.MORALE_MAX, state.fleet.morale + GAME_BALANCE.FEAST_MORALE),
          fame: state.fleet.fame + GAME_BALANCE.FEAST_FAME,
        }
        useFxStore.getState().fx(
          { kind: 'banner', tone: 'gold', text: '🍖 甲板盛宴！', sub: `士气 +${GAME_BALANCE.FEAST_MORALE} · 声望 +${GAME_BALANCE.FEAST_FAME}` },
          'sell',
        )
        // 第二条线：宴请行商与官吏——商会与王室都记住了这场宴席
        const feastFaction = {
          factionRep: {
            ...state.factionRep,
            guild: Math.min(100, state.factionRep.guild + GAME_BALANCE.GUILD_FEAST),
            crown: Math.min(100, state.factionRep.crown + GAME_BALANCE.CROWN_FEAST),
          },
        }
        return withAchievements(state, {
          ...feastFaction,
          fleet: newFleet,
          notifications: [...state.notifications, {
            id: `feast-${Date.now()}`,
            type: 'history' as const,
            title: '🍖 甲板盛宴',
            message: `你花 ${GAME_BALANCE.FEAST_COST} 金币办了场露天宴席，全船喝得酣畅淋漓。连港口的猫都蹭到了一块咸鱼。`,
            timestamp: Date.now(),
          }],
        })
      }),

      /**
       * 操舵挑战结算（第三条线：实时操作）。
       * 奖励沿当前航线「真实推进」——位置直接朝目标挪一段，
       * 省下的天数是真实的，不是进度条上的数字游戏。
       */
      finishHelmRun: (result) => set((state) => {
        const route = state.currentRoute
        // 只有「本段待操舵」状态才结算—— modal 关闭时调用，天然防重复
        if (!state.fleet.isSailing || !route || !state.pendingHelm) return state

        const reward = helmReward(result)
        // 奖励按**本段距离**折算，而不是全程剩余距离：
        // 段段可比——不会出现「第 1 段省 15% 全程、第 4 段只省 3%」
        // 这种越到后面操舵越不值钱的隐性惩罚。
        const segmentNm = state.segmentCount > 0
          ? route.distance / state.segmentCount
          : route.distance
        const advanceNm = Math.round(reward.progressBonus * segmentNm * 10) / 10

        const newFleet = {
          ...state.fleet,
          morale: Math.max(0, Math.min(GAME_BALANCE.MORALE_MAX, state.fleet.morale + reward.morale)),
          fame: Math.max(0, state.fleet.fame + reward.fame),
          ships: reward.wear < 0
            ? state.fleet.ships.map(s => s.id === state.fleet.flagshipId
              ? { ...s, durability: Math.max(0, s.durability + reward.wear) }
              : s)
            : state.fleet.ships,
        }
        useFxStore.getState().fx(
          {
            kind: 'banner',
            tone: reward.grade === 'poor' ? 'danger' : 'gold',
            text: `🧭 ${reward.label}`,
            sub: advanceNm > 0
              ? `${reward.comment}（本段少走 ${advanceNm.toFixed(0)} 海里）`
              : reward.comment,
          },
          'port',
        )
        return withAchievements({ ...state, fleet: newFleet }, {
          fleet: newFleet,
          // 里程交给 SailingController 入账（它唯一权威地持有 traveledNm）。
          // 旧的实现直接在 store 里挪 shipPosition，结果被下一帧的
          // positionAtNm(traveledNm) 覆盖——奖励显示省了 15%，船原地不动。
          helmAdvance: { nm: advanceNm, token: (state.helmAdvance?.token ?? 0) + 1 },
          pendingHelm: null,
          gamePhase: 'playing',
          notifications: [...state.notifications, {
            id: `helm-${state.pendingHelm.segmentIndex}-${Date.now()}`,
            type: 'achievement' as const,
            title: `🧭 操舵挑战 · ${reward.label}`,
            message: `${reward.comment}${advanceNm > 0 ? ` 本段少走约 ${advanceNm.toFixed(0)} 海里。` : ''}`,
            timestamp: Date.now(),
          }],
        })
      }),

      markDialogueSeen: (scriptId) => set((state) => (
        state.dialogueSeen.includes(scriptId)
          ? state
          : { dialogueSeen: [...state.dialogueSeen, scriptId] }
      )),

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
      version: 14,
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
        // v3→v4: 补 flagshipId（老存档没有该字段时，默认第一艘船为旗舰）
        if (version < 4 && pState.fleet) {
          const ships = pState.fleet.ships
          if (pState.fleet.flagshipId === undefined && ships && ships.length > 0) {
            pState.fleet.flagshipId = ships[0].id
          }
        }
        // v4→v5: 补 trait、eventFlags、stats、achievements
        if (version < 5) {
          if (pState.fleet && pState.fleet.trait === undefined) pState.fleet.trait = null
          if (!pState.eventFlags) pState.eventFlags = {}
          if (!pState.stats) pState.stats = createInitialStats()
          if (!pState.achievements) pState.achievements = []
        }
        // v5→v6: 补 pendingVoyage、routeIntel、rivals、rivalNews、officers
        if (version < 6) {
          if (pState.pendingVoyage === undefined) pState.pendingVoyage = null
          if (!pState.routeIntel) pState.routeIntel = {}
          if (!pState.rivals) pState.rivals = RIVALS.map(r => ({ ...r }))
          if (!pState.rivalNews) pState.rivalNews = []
          if (!pState.officers) pState.officers = []
        }
        // v6→v7: 补派系声望、名船员名册、身份取向（第二条线）
        if (version < 7) {
          if (!pState.factionRep) pState.factionRep = createInitialFactionRep()
          if (!pState.crewRoster) pState.crewRoster = []
          if (!pState.notoriety) pState.notoriety = createInitialNotoriety()
        }
        // v7→v8: 补操舵挑战已用航段记录（第三条线；v14 起该字段作废，
        // 由「每段必经」的 pendingHelm 机制取代，见下方迁移）
        if (version < 8) {
          // 旧字段名已从 GameState 移除，这里只做清理，不补默认值
          const stale = pState as Partial<GameState> & { helmDoneRoutes?: string[] }
          delete stale.helmDoneRoutes
        }
        // v8→v9: 补天候系统（环境线）
        if (version < 9) {
          if (!pState.weather) pState.weather = createInitialWeather()
        }
        // v9→v10: 补剧情致辞已播记录（剧情线）
        if (version < 10) {
          if (!pState.dialogueSeen) pState.dialogueSeen = []
        }
        // v10→v11: 航速档位并入航段方针。
        // 老存档里的 speedMode 字段作废（新的唯一旋钮是 stance），
        // 顺便补齐航段系统的初始字段，避免读档后卡在「抉择中」却没有待选内容。
        if (version < 11) {
          const stale = pState as Partial<GameState> & { speedMode?: string }
          delete stale.speedMode
          if (pState.segmentCount === undefined) pState.segmentCount = 0
          if (pState.segmentIndex === undefined) pState.segmentIndex = 0
          if (pState.stance === undefined) pState.stance = 'steady'
          if (pState.pendingSegment === undefined) pState.pendingSegment = null
          // 存档停在「航段抉择」但没有待选内容 → 落回正常航行
          if (pState.gamePhase === 'segment' && !pState.pendingSegment) {
            pState.gamePhase = 'playing'
          }
        }
        // v11→v12: 磨损改为累进余数制（谨慎 ×0.3 不再被取整抹成 0）
        if (version < 12) {
          if (pState.fleet && pState.fleet.durabilityCarry === undefined) {
            pState.fleet.durabilityCarry = 0
          }
        }
        // v12→v13: 航线起点入档。
        // 老存档没有 routeOrigin，读档后地图画不出「整条航线」，
        // 船走的线与图上画的线会对不上。退化处理：用当前船位当起点。
        if (version < 13) {
          if (pState.routeOrigin === undefined) {
            pState.routeOrigin = pState.shipPosition
              ? [pState.shipPosition[0], pState.shipPosition[1]]
              : null
          }
        }
        // v13→v14: 操舵从「可选加分」改为「每段必经的节拍」。
        // 旧的 helmDoneRoutes（每段一次机会的记录）作废——
        // 新机制由 pendingHelm/helmAdvance 驱动，天然不会重复结算。
        // 老存档若停在旧操舵界面（gamePhase 仍是 'helm' 且没有待操舵内容），
        // 落回正常航行，避免卡在打不开的模态里。
        if (version < 14) {
          const stale = pState as Partial<GameState> & { helmDoneRoutes?: string[] }
          delete stale.helmDoneRoutes
          if (pState.pendingHelm === undefined) pState.pendingHelm = null
          if (pState.helmAdvance === undefined) pState.helmAdvance = null
          if (pState.gamePhase === 'helm' && !pState.pendingHelm) {
            pState.gamePhase = 'playing'
          }
        }
        return persistedState
      },
      partialize: (state) => ({
        fleet: state.fleet,
        currentRoute: state.currentRoute,
        routeProgress: state.routeProgress,
        routeOrigin: state.routeOrigin,
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
        eventFlags: state.eventFlags,
        stats: state.stats,
        achievements: state.achievements,
        pendingVoyage: state.pendingVoyage,
        routeIntel: state.routeIntel,
        rivals: state.rivals,
        rivalNews: state.rivalNews,
        officers: state.officers,
        factionRep: state.factionRep,
        crewRoster: state.crewRoster,
        notoriety: state.notoriety,
        pendingHelm: state.pendingHelm,
        helmAdvance: state.helmAdvance,
        weather: state.weather,
        dialogueSeen: state.dialogueSeen,
      }),
      // 存档软锁修复：存档里若停在事件阶段但事件未持久化，重开时落回 playing
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as object) } as GameState & GameStore
        if (merged.gamePhase === 'event' && !merged.currentEvent) {
          merged.gamePhase = 'playing'
        }
        // 停在操舵阶段但没有待操舵内容 → 落回正常航行（软锁修复）
        if (merged.gamePhase === 'helm' && !merged.pendingHelm) {
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
  return mode === 'buy' ? dynamicBuyPrice(pg, stock, pg.stock, state.fleet) : dynamicSellPrice(pg, stock, pg.stock, state.fleet)
}

export { effectiveFleetSpeed }

/** 开发调试钩子：仅在 dev 构建下暴露 store，便于自动化验证（生产构建会被 tree-shake 掉） */
if (typeof import.meta !== 'undefined' && import.meta.env?.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __gameStore: typeof useGameStore }).__gameStore = useGameStore
}
