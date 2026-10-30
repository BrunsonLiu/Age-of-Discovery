import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Fleet, Ship, GameState, GameEvent, EventOutcome, EventLogEntry,
  Route, PanelType, CargoItem, Waypoint, GameStats, RouteIntel, OfficerId, Rival, RivalNews,
  FactionId, CrewCharId, CrewMember, NotorietyAxis, StanceId, GameMode,
} from '@/types'
import { ports, portGoods, localDemands } from '@/data/ports'
import { events } from '@/data/events'
import { tasks } from '@/data/tasks'
import { goods } from '@/data/goods'
import { calculateDailyConsumption, dangerLevelFromDistance, computeWindFavor, effectiveFleetSpeed, prevailingWindBearing, calculateSailingDays, dailyDistanceNm, haversineNm } from '@/utils/navigation'
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
import type { CueName } from '@/utils/audio'
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

/**
 * 事件场景 → 开场音效。
 * 声音必须与画面同源：玩家看到暗礁就该听到浪，看到风暴就该听到雷。
 */
const EVENT_SCENE_CUE: Record<string, CueName> = {
  storm: 'thunder',
  cape: 'thunder',
  pirate: 'cannon',
  navy: 'cannon',
  mutiny: 'creak',
  disease: 'creak',
  reef: 'wave',
  wave: 'wave',
  meteor: 'bell',
  doldrums: 'creak',
  ghostship: 'bell',
  kraken: 'wave',
  siren: 'bell',
}

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
  lastPortId: null,
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
  /** 默认船长模式；参观模式由 initGame(mode) 写入 */
  gameMode: 'captain',
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
   * 航行中主动召唤操舵（原「按 H」）。
   *
   * 操舵从"每段必弹"改成"随时可召唤"之后，需要一个入口把玩家送进那个状态。
   * 与时序无关的纯状态切换，所以放在 store 里而不是 UI 里的 setTimeout。
   */
  requestHelm: () => void
  /**
   * 航行中打开方针面板（默认只在第一段自动弹一次，之后由玩家主动调）。
   *
   * 复用 pendingSegment + gamePhase='segment' 这条既有链路：
   * 航行循环本来就会在 pendingSegment 存在时停下等玩家，
   * 没必要为"主动打开"再写一套面板。
   */
  openStancePicker: () => void
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
  /**
   * 开新局。
   *
   * @param trait  天赋 id
   * @param mode   玩法模式：captain = 完整玩法；visitor = 只逛逛（不被迫）
   */
  initGame: (trait?: string, mode?: GameMode) => void
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
  /**
   * 跳过本段操舵：把这节拍交给水手，自己不碰舵轮。
   *
   * 为什么必须有这条路：操舵一度是**每段必经**的硬门槛——
   * 选完方针就被弹进一个必须玩 15 秒实时操作的模态，不想玩也得玩。
   * 对"只想看看这张海图"的人说，那不是游戏，是路障。
   *
   * 跳过的代价只有一条：**本段拿不到操舵奖励**（省里程 / 士气 / 声望）。
   * 不扣任何东西、不掉士气、不磨损船体——纯粹的"不参与，就没有回报"。
   */
  skipHelmRun: () => void
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

/**
 * 动态卖价。
 *
 * 【14 号修订：库存过剩必须压价，否则套利永远成立】
 * 原实现是 `stockRatio = Math.min(1, 库存 / 基准库存)`，把"库存超过基准"
 * 的情况全部截成 1 —— 于是 `surge` 恒等于 1，**卖得越多、本港越满，
 * 卖价一分不降**。实测（塞维利亚→加的斯，丝绸）：
 *   加的斯库存 40 → 62 → 100（+150%），卖价始终 301；
 *   同期塞维利亚库存 60 → 0，买价只从 85 涨到 97（+14%，上限 +40%）。
 * 结果是 500 金 3 天内滚到 12953 金（26 倍），而且这笔钱是零风险的
 * ——54 海里、1 天航程，连补给都不怎么耗。
 *
 * 现在两侧对称：
 *   库存 < 基准（缺货）→ 涨价，最高 +40%（原逻辑不变）
 *   库存 > 基准（过剩）→ 按 1/(1 + 超出比例×0.55) 压价，永远高于 0
 * 系数 0.55 是权衡：库存翻倍（ratio=2）时卖价降到 0.645，
 * 既能把套利利润压到"值得跑但不再暴利"，又不会让正常卖货变成亏损。
 *
 * 声望/特质仍按"除以同一系数"处理（系数 <1 即加价），与买价同源。
 */
export function dynamicSellPrice(pg: { price: number; priceModifier: number }, currentStock: number, baseStock: number, fleet?: Pick<Fleet, 'fame' | 'trait'>, opts?: Parameters<typeof priceMultiplier>[1]): number {
  const stockRatio = baseStock > 0 ? currentStock / baseStock : 1
  const surge = stockRatio <= 1
    ? 1 + (1 - stockRatio) * 0.4
    : 1 / (1 + (stockRatio - 1) * 0.55)

  const mult = priceMultiplier(fleet, opts)
  // 同港买入价（不含 surge 之外任何额外项），用来给卖价兜底
  const buySide = pg.price * pg.priceModifier * surge * mult
  // 声望/特质让卖出更划算：除以同一系数（系数 <1 即加价）
  const raw = pg.price * pg.priceModifier * surge * 0.85 / mult

  /*
   * 【15 号修订：卖价必须永远低于同港买价】
   * 买价是 `× mult`、卖价是 `÷ mult`，两边都朝着"对玩家有利"的方向，
   * 于是 mult 一旦足够小（声望高），除法带来的加价就会吃掉 15% 的价差并反超。
   * 实测：
   *   fame=0    同港卖价 > 买价 的组合 0 / 99
   *   fame=50   **92 / 99**
   *   fame=100  **97 / 99**（哈瓦那丝绸：买 286、卖 336）
   * 玩家因此可以在原地反复买卖赚钱，一步不用挪。
   *
   * 【为什么上限是「买价取整后 − 1」而不是「买价 × 0.95」】
   * 百分比在低价商品上会被四舍五入吃掉：买价 5 时 0.95 倍是 4.75，
   * 卖价四舍五入又回到 5 —— 价差归零。货币的最小单位是 1，那就按 1 保证：
   * 卖价永远比同港买价至少便宜一枚金币。高价商品几乎不受影响，
   * 低价商品则获得明确的"买了立刻卖必亏"。
   */
  const buyRounded = Math.max(1, Math.round(buySide))
  // 下限 1：库存被灌到几十倍基准时 surge 趋近 0，四舍五入会变成 0 价。
  // 白送比"价格低"更危险（0 价买入 = 无限资源）。
  return Math.max(1, Math.min(Math.round(raw), buyRounded - 1))
}

/**
 * 本港不经营某商品时的折价收购比例（相对全局基准价）。
 *
 * 为什么必须有这条退路：商品的经营覆盖极不均匀——雪茄只在哈瓦那（1 号港）
 * 经营，其余港口都不收。若这里直接拒绝出售，玩家一旦带着雪茄离开哈瓦那，
 * 货舱里就多了一份**永远换不成钱**的死货，白占容量、无法处置。
 */
export const OFFER_PRICE_RATIO = 0.5

/**
 * 买入报价 —— 面板显示价与实际结算价的**唯一来源**。
 *
 * 以前 TradePanel 自己抄了一份公式（漏乘 priceMultiplier、也漏掉 surge），
 * 于是面板上写的价和真正结算的价能差到 67 金：玩家照着面板的价做买卖
 * 决策，看到的却不是真实世界。现在面板与结算共用同一个函数，数字不可能再分叉。
 *
 * @returns 单价；null = 本港不经营该商品
 */
export function selectBuyPrice(state: GameState, portId: number, goodId: number): number | null {
  const pg = portGoods.find(p => p.portId === portId && p.goodId === goodId)
  if (!pg) return null
  const stock = state.marketStock[`${portId}:${goodId}`] ?? pg.stock
  return dynamicBuyPrice(pg, stock, pg.stock, state.fleet, priceOpts(state))
}

/**
 * 卖出报价 —— 面板显示价与实际结算价的**唯一来源**。
 *
 * 本港不经营该商品时走折价收购（见 OFFER_PRICE_RATIO），而不是拒绝：
 * 拒绝会让货变成死货，而面板此前却显示着折价和可点的按钮，玩家点了
 * 货不减、钱不加、屏幕毫无反应——那是最坏的一种「数字在骗人」。
 */
export function selectSellPrice(state: GameState, portId: number, goodId: number): number | null {
  const good = goods.find(g => g.id === goodId)
  if (!good) return null
  const pg = portGoods.find(p => p.portId === portId && p.goodId === goodId)
  const opts = priceOpts(state)
  if (!pg) {
    // 本港不收：按全局基准价折价出清。声望/特质系数同样生效
    //（系数 <1 表示对玩家有利，除以它等于折价收得更高）。
    return Math.round((good.basePrice * OFFER_PRICE_RATIO) / priceMultiplier(state.fleet, opts))
  }
  const stock = state.marketStock[`${portId}:${goodId}`] ?? pg.stock
  return dynamicSellPrice(pg, stock, pg.stock, state.fleet, opts)
}

/**
 * 价格档位：给贸易面板上色用。
 *   cheap    —— 该商品在所有经营它的港口里，当前**买价最低**
 *   expensive—— 当前**买价最高**
 *   normal   —— 居中
 */
export type PriceTone = 'cheap' | 'expensive' | 'normal'

/**
 * 某个商品在某个港口的价格档位。
 *
 * 为什么不是「相对全局基准价」：那套语义量过——36 个标绿的条目里只有
 * 9 个（25%）真的是全港最低价，朗姆酒在有的港标绿（6）却还有更便宜的
 * 港（3）。玩家看到绿色就以为「这里买最划算」，实际买贵了一倍。
 * 颜色是玩家用来做决定的信号，必须直接可行动：**绿 = 这里最便宜**。
 *
 * 顶部「本地特产 / 高价收购」提示仍按结构性口径（priceModifier）给，
 * 那是另一种知识（这港产什么、收什么），两者互补不冲突。
 *
 * @returns 该商品在所有港口中的当前买价档位
 */
export function selectPriceTone(state: GameState, portId: number, goodId: number): PriceTone {
  const pg = portGoods.find(p => p.portId === portId && p.goodId === goodId)
  if (!pg) return 'normal'
  const price = selectBuyPrice(state, portId, goodId)
  if (price == null) return 'normal'
  let min = Infinity
  let max = -Infinity
  for (const other of portGoods) {
    if (other.goodId !== goodId) continue
    const q = selectBuyPrice(state, other.portId, goodId)
    if (q == null) continue
    if (q < min) min = q
    if (q > max) max = q
  }
  if (price <= min) return 'cheap'
  if (price >= max) return 'expensive'
  return 'normal'
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
  // "完成全部任务"按任务总数动态判定，随任务线扩充自动生效。
  // 参观模式跳过这一条：只看世界的人不该被"任务做完没"判定输赢，
  // 他们的结束条件只有一个——把 20 座港口都看过。
  if (state.completedTasks.length >= tasks.length && state.gameMode !== 'visitor') {
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
        /*
         * 参观模式：出航不进入航段抉择，直接开船。
         *
         * 「出航即进入第 0 段的抉择」对船长模式是好的（第一件事就是做决定），
         * 但对"只看，不被逼着做任何事"的参观模式来说，第一秒就被拦一次。
         * 这里连同后面的 syncSegmentBoundary 一起分流：
         * 参观模式全程不产生 pendingSegment，也就不弹抉择、不弹操舵。
         */
        const isVisitor = state.gameMode === 'visitor'
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
          pendingSegment: isVisitor ? null : {
            index: 0,
            total,
            hazard,
            segmentNm,
            remainingNm: pending.route.distance,
            daysLeft: baselineDays,
          },
          gamePhase: isVisitor ? 'playing' : 'segment',
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
          // 选完方针 → 第一段强制操舵，之后改为船上「亲手掌舵」按钮召唤。
          //
          // 原设计是"每段必弹"：因为操舵曾是可选加分项，而它恰恰是最容易被
          // 跳过的环节。方向没错，但**每段都弹**把一份加分项变成了每段一次的
          // 门槛——2~4 段的航程就是 2~4 次全屏打断。
          //
          // 现在：第 0 段必弹（保证每个玩家都试过这个环节），
          // 之后段不再自动弹，改由船上的按钮随时召唤（requestHelm）。
          // 想玩的人一秒钟就能开，不想玩的人不会被拦。
          //
          // 【参观模式】完全不弹，也不进 helm 阶段。
          pendingHelm: state.gameMode === 'visitor' || state.pendingSegment.index > 0
            ? null
            : { segmentIndex: state.pendingSegment.index },
          gamePhase: state.gameMode === 'visitor' || state.pendingSegment.index > 0 ? 'playing' : 'helm',
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

        /*
         * 参观模式：不做航段抉择，直接推进段号继续走。
         *
         * 一次远航有 2~4 段，每段都会弹「抢行 / 按部就班 / 谨慎」。
         * 对只想沿海岸线看看的人来说，这是每段一次的拦截；而且这个选择
         * 对他没有后果——参观模式不扣粮水、耐久下限 1、不判胜负。
         *
         * 【为什么在 store 里分流，而不是在 UI 里自动点按钮】
         * 先试过在 SegmentDecision 里用 effect + setTimeout 自动 chooseStance，
         * 实测没生效：这个流程的时序由航行循环驱动，UI 层的延时提交
         * 会被帧循环挤掉。而"参观模式没有航段抉择"本来就是状态层的语义，
         * 放在这里既准确又不会和渲染时序打架。
         *
         * 方针保持上一次的选择（初始是 steady），不重置。
         */
        if (state.gameMode === 'visitor') {
          return { segmentIndex: nextIndex }
        }


        const totalNm = route.distance
        // 剩余航程 = 总距离 × (1 − 进度)；本段按距离均分
        const remainingNm = Math.max(0, Math.round(totalNm * (1 - Math.min(1, Math.max(0, progress)))))
        const segmentNm = totalNm / state.segmentCount
        // 剩余天数按**当前方针**估算（方针改变航速，天数会变）
        const stanceMul = STANCES[state.stance].speedMul
        const weatherMul = WEATHER_INFO[state.weather.kind].sailMul * weatherFavorFactor(state.weather.kind)
        const nmPerDay = dailyDistanceNm(state.fleet, state.officers, route.windFavor, stanceMul, weatherMul)
        const daysLeft = nmPerDay > 0 ? Math.max(0, Math.ceil(remainingNm / nmPerDay)) : 0
        /*
         * 【方针只问一次：出航时那一次就是唯一一次】
         *
         * 实测过新玩家的第一分钟：到地图后 12 秒内被 7 个全屏层打断
         * （出航计划 → 方针 1/2 → 操舵 → 方针 2/2 …），75 秒里一分钱没进账。
         * 4399 那一类游戏从不这样——**同一类问题不反复问**。
         *
         * 但也不能一句话不问：玩家需要知道"我现在走到哪了、还剩几天"。
         * 所以**跨段一律不再弹**，只留一条飘字（不打断、不遮挡）；
         * 想知道细节或改主意，船上有常驻的「方针」按钮随时点开。
         *
         * 【为什么不是"跨第一次还问一下"】
         * 第一版写的是 nextIndex > 1 才跳过，结果 2 段航线照样问两次
         * （出航时第 0 段 + 第一次跨段第 1 段）—— 实测弹层数一个没少。
         * 常见的短途本来就是 2 段，"只问一次"必须字面兑现。
         *
         * 决策权没有减少，只是从"你必须回答"变成"你想问就看"。
         */
        if (nextIndex >= 1) {
          useFxStore.getState().fx(
            {
              kind: 'float',
              tone: 'plain',
              text: `第 ${nextIndex + 1} 段`,
              sub: `剩 ${daysLeft} 天 · ${STANCES[state.stance].name}`,
            },
            'sail',
          )
          return { segmentIndex: nextIndex }
        }

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

      requestHelm: () => set((state) => {
        if (!state.fleet.isSailing || state.pendingHelm) return state
        if (state.gameMode === 'visitor') return state
        // 只允许在正常航行时召唤：事件 / 抉择 / 出航计划期间不该插队
        if (state.gamePhase !== 'playing') return state
        return { pendingHelm: { segmentIndex: state.segmentIndex }, gamePhase: 'helm' }
      }),

      openStancePicker: () => set((state) => {
        const route = state.currentRoute
        if (!route || !state.fleet.isSailing) return state
        if (state.pendingSegment || state.pendingHelm) return state
        if (state.gameMode === 'visitor') return state
        if (state.gamePhase !== 'playing') return state

        // 与 syncSegmentBoundary 用同一套算法，否则面板里的"剩几天"会是假的
        const progress = Math.min(1, Math.max(0, state.routeProgress))
        const remainingNm = Math.max(0, Math.round(route.distance * (1 - progress)))
        const stanceMul = STANCES[state.stance].speedMul
        const weatherMul = WEATHER_INFO[state.weather.kind].sailMul * weatherFavorFactor(state.weather.kind)
        const nmPerDay = dailyDistanceNm(state.fleet, state.officers, route.windFavor, stanceMul, weatherMul)
        const daysLeft = nmPerDay > 0 ? Math.max(0, Math.ceil(remainingNm / nmPerDay)) : 0

        return {
          pendingSegment: {
            index: state.segmentIndex,
            total: state.segmentCount,
            hazard: hazardLabel(route.dangerLevel, state.weather.kind),
            segmentNm: route.distance / Math.max(1, state.segmentCount),
            remainingNm,
            daysLeft,
          },
          gamePhase: 'segment',
        }
      }),

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

      initGame: (trait, mode = 'captain') => {
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
          // 参观模式**不弹教学**：只想看看世界的人，一上来就被 10 步引导
          // 按着走一遍，是本作最劝退的开局。船长模式才需要教。
          tutorialStep: mode === 'visitor' ? -1 : 0,
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
          gameMode: mode,
        })
      },

      setGamePhase: (phase) => set({ gamePhase: phase }),
      setCurrentEvent: (event) => {
        // 事件开场：按事件场景选择环境音效（炮击/雷声等），让画面与声音同源
        const cue = EVENT_SCENE_CUE[event.sceneKey ?? '']
        if (cue) useFxStore.getState().cue(cue)
        set({ currentEvent: event, gamePhase: 'event' })
      },
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

        /**
         * 参观模式：**只看，不受苦**。
         *
         * 具体说：不吃不喝（不扣粮水）、不会因为断粮士气崩、
         * 船体不会被啃到报废。这里不是把难度调低，而是把
         * "生存压力"整个拿掉——只想看看这张海图的人，
         * 不该被一根粮草的余量逼着做决定。
         *
         * 事件造成的金币/士气/耐久变化**照常显示**（数字仍然是真的），
         * 只是不再有"归零即结束"的死亡线。
         */
        const isVisitor = state.gameMode === 'visitor'

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
        if (!fleet.isSailing && !isVisitor) {
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
              // 声音跟着天况走：暴风雨配雷，浓雾配浪，其余配木船吱呀
              const weatherCue: CueName =
                newWeather.kind === 'storm' ? 'thunder'
                : newWeather.kind === 'fog' ? 'wave'
                : 'creak'
              useFxStore.getState().cue(weatherCue)
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
          //
          // 参观模式不吃不喝：粮水保持原样，士气也不会因为断粮而崩。
          const newFood = isVisitor
            ? fleet.food
            : Math.max(0, fleet.food - dailyFoodUse(consumption.food, supplyMul, cookRelief))
          const newWater = isVisitor
            ? fleet.water
            : Math.max(0, fleet.water - dailyWaterUse(consumption.water, supplyMul))
          let newMorale = fleet.morale
          if (!isVisitor && (newFood === 0 || newWater === 0)) {
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
              // 参观模式：船体不会被啃到报废（下限 1 点），
              // 但磨损照常显示——玩家仍看得见"这一路花了多少船板"。
              const floor = isVisitor ? 1 : 0
              newFleet = {
                ...newFleet,
                ships: newFleet.ships.map(ship => ({
                  ...ship,
                  durability: Math.max(floor, ship.durability - points),
                })),
              }
            }
          }

          const lastEventDay = state.lastEventDay ?? 0
          // 天气偏置：暴风雨/落雨/浓雾让海面更"有话可说"
          // 姿态再叠一层：抢行遇事更频繁，谨慎遇事更少
          // 参观模式：事件卡是「必须停下来做个选择」的强制打断。
          // 只想看看世界的人被每段一次的抉择拦住，正是本作最劝退的一点。
          // 压到三成而不是归零——世界仍需一点活性，且事件卡本来就带
          // 「站在一边看」的旁观选项，真遇上了也能什么都不做。
          const modeEventMul = isVisitor ? 0.3 : 1
          const eventBias = WEATHER_INFO[newWeather.kind].eventBias * profile.eventRateMul * modeEventMul
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
              title: '航海见闻',
              message: n.text,
              timestamp: Date.now(),
            }]
          }
        }

        // 暴风雨的日常代价：啃船底、压士气（放在航行块之后，避免被断粮士气结算覆盖）
        if (fleet.isSailing && newWeather.kind === 'storm') {
          const wi = WEATHER_INFO.storm
          const floor = isVisitor ? 1 : 0
          if (wi.wearAdd > 0) {
            newFleet = {
              ...newFleet,
              ships: newFleet.ships.map(ship => ({
                ...ship,
                durability: Math.max(floor, ship.durability - wi.wearAdd),
              })),
            }
          }
          if (wi.moraleHit > 0) {
            newFleet = { ...newFleet, morale: Math.max(floor, newFleet.morale - wi.moraleHit) }
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
        // 参观模式没有"输"这回事：船不会报废、士气不会归零，
        // 于是没有什么能终结这一局——想逛多久逛多久。
        if (!isVisitor && (allShipsDestroyed || newFleet.morale <= 0)) {
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

      arriveAtPort: (portId) => {
        // 抛锚：铁链哗啦 + 闷撞，与"靠岸"这一动作对应
        useFxStore.getState().cue('anchor')
        set((state) => {
          const port = ports.find(p => p.id === portId)
          return {
            fleet: { ...state.fleet, currentPortId: portId, isSailing: false },
            // 记下"从哪来"：currentRoute 马上就要清空，回程建议要用它
            lastPortId: state.currentRoute?.fromPortId ?? state.lastPortId,
            currentRoute: null,
            routeProgress: 0,
            routeOrigin: null,
            waypoint: null,
            // 到港即放弃任何未确认的出航计划
            pendingVoyage: null,
            shipPosition: port ? [port.latitude, port.longitude] : state.shipPosition,
            discoveredPorts: state.discoveredPorts.includes(portId) ? state.discoveredPorts : [...state.discoveredPorts, portId],
          }
        })
      },

      buyGood: (portId, goodId, quantity) => set((state) => {
        if (state.fleet.currentPortId !== portId || state.fleet.isSailing) return state
        const pg = portGoods.find(p => p.portId === portId && p.goodId === goodId)
        if (!pg) return state
        const good = goods.find(g => g.id === goodId)
        if (!good) return state
        const key = `${portId}:${goodId}`
        const stock = state.marketStock[key] ?? pg.stock
        if (stock < quantity) return state
        // 报价走唯一来源：面板显示的就是这里真正扣的钱
        const buyPrice = selectBuyPrice(state, portId, goodId)
        if (buyPrice == null) return state
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
        const good = goods.find(g => g.id === goodId)
        if (!good) return state
        // 报价走唯一来源：本港不经营时会给折价价，而不是静默拒绝
        // （静默拒绝会让货变成死货，面板却显示着可点的按钮）
        const sellPrice = selectSellPrice(state, portId, goodId)
        if (sellPrice == null) return state
        const pg = portGoods.find(p => p.portId === portId && p.goodId === goodId)
        const key = `${portId}:${goodId}`
        const stock = pg ? (state.marketStock[key] ?? pg.stock) : 0
        const newCargo = updateCargo(state.fleet.cargo, goodId, -quantity)
        const total = sellPrice * quantity
        // 大额贸易赢得商会好感（第二条线）
        const guildGain = total >= GAME_BALANCE.GUILD_DEAL_MIN ? GAME_BALANCE.GUILD_DEAL_FAME : 0
        return withAchievements(state, {
          fleet: syncUsedCapacity({ ...state.fleet, gold: state.fleet.gold + total, cargo: newCargo }),
          // 折价出清时本港没有这个市场，库存不动
          marketStock: pg ? { ...state.marketStock, [key]: stock + quantity } : state.marketStock,
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
        // 参观模式：数字照常变（这是真的），但不设"归零即完蛋"的线。
        // 耐久与士气留 1 点底，事件再怎么狠也不会把这一局结束掉。
        const floor = state.gameMode === 'visitor' ? 1 : 0
        const newFleet = {
          ...state.fleet,
          gold: Math.max(0, state.fleet.gold + quartered.goldChange),
          food: Math.max(0, state.fleet.food + quartered.foodChange),
          water: Math.max(0, state.fleet.water + quartered.waterChange),
          morale: Math.max(floor, Math.min(GAME_BALANCE.MORALE_MAX, state.fleet.morale + quartered.moraleChange)),
          fame: Math.max(0, state.fleet.fame + (quartered.fameChange ?? 0)),
          ships: state.fleet.ships.map(ship => ({
            ...ship,
            durability: Math.max(floor, Math.min(ship.maxDurability, ship.durability + quartered.durabilityChange)),
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
          gamePhase: (state.gameMode !== 'visitor' && (allShipsDestroyed || newFleet.morale <= 0)) ? 'gameover' : state.gamePhase,
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
              title: `已探索 ${newlyDiscovered.length} 座港口`,
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
            title: '休整一日',
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

      /**
       * 把这一段的操舵交给水手（跳过）。
       *
       * 唯一的代价是**没有操舵奖励**——不递交 helmAdvance，
       * 所以船不会因为这一段而少走任何海里（这正是"没玩就没赚"）。
       * 不扣士气、不磨损船体、不影响任何结算。
       */
      skipHelmRun: () => set((state) => {
        if (!state.pendingHelm) return state
        const seg = state.pendingHelm.segmentIndex
        return {
          pendingHelm: null,
          gamePhase: 'playing',
          notifications: [...state.notifications, {
            id: `helm-skip-${seg}-${Date.now()}`,
            type: 'history' as const,
            title: '🧭 舵轮交给水手',
            message: `第 ${seg + 1} 段由水手操舵。没人盯舵，风就白白吹过去了——这一段没有操舵奖励。`,
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
      version: 15,
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
        // v14→v15: 玩法模式（captain 完整玩法 / visitor 只逛逛）。
        // 老存档一律按船长模式读入——不要把老玩家突然扔进参观模式。
        if (version < 15) {
          if (pState.gameMode === undefined) pState.gameMode = 'captain'
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
        gameMode: state.gameMode,
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

/**
 * 「掮客推荐」：在当前港口、当前金币、当前空舱下，最值得跑的一趟买卖。
 *
 * 【为什么要这个东西】
 * 量化过新玩家的第一分钟：到地图后 12 秒内被 7 个全屏层打断
 * （出航计划 → 方针 1/2 → 操舵 → 方针 2/2 …），而 75 秒里一分钱没进账、
 * 飘字 0 次。4399 那一类游戏的手感恰恰相反：**手上一直在动，结果立刻回来**。
 * 它们也从不让新手自己找"该干什么"——第一关永远是送上门的一次成功。
 *
 * 这张卡就是那次成功：把"该买什么、卖到哪、几天到、赚多少"一次说完，
 * 点一下直接设航向。
 *
 * 【数字必须与结算完全一致，所以全部走同一个来源】
 *   买价   selectBuyPrice   （与 buyGood 同）
 *   卖价   selectSellPrice  （与 sellGood 同）
 *   可买量 min(空舱, 买得起的数量, 本港库存)
 *   天数   calculateSailingDays(真实航线, 真实风向系数)  （与 confirmDeparture 同）
 * 少一样都会出现"卡片说赚 1095、实际到账 700"。
 *
 * 【排序用直线距离，最终数字用真实航线】
 * 每港每货都算真实航线（要绕开陆地寻路）会让进港明显卡顿；
 * 而排序只需要一个稳定的相对量。命中那一单最后会用真实航程重算距离与天数，
 * 所以**屏幕上显示的数字仍然是准的**——只有"选哪一单"用了近似。
 */
export interface BrokerDeal {
  goodId: number
  goodName: string
  toPortId: number
  toPortName: string
  toLat: number
  toLng: number
  buy: number
  sell: number
  qty: number
  unitProfit: number
  totalProfit: number
  nm: number
  days: number
}

/**
 * 推荐门槛：**每天**净赚少于这么多就不推。
 *
 * 实测：卖掉第一批货之后，加的斯只剩"丝绸 233→301、35 天、4040 海里、+340 金"
 * 这种单子（约 10 金/天）。把它摆在左下角，等于告诉新手"去跑一个月赚 340"——
 * 4399 绝不会这么干。宁可什么都不显示，也不要推一个不值得跑的单。
 */
const MIN_DEAL_PROFIT_PER_DAY = 45

export function selectBestDeal(state: GameState): BrokerDeal | null {
  const fromPortId = state.fleet.currentPortId
  if (!fromPortId || state.fleet.isSailing) return null
  const fromPort = ports.find(p => p.id === fromPortId)
  if (!fromPort) return null

  const freeSpace = state.fleet.ships.reduce((sum, sh) => sum + Math.max(0, sh.capacity - sh.usedCapacity), 0)
  if (freeSpace < 1) return null
  const gold = state.fleet.gold

  type Cand = { goodId: number; goodName: string; toPortId: number; buy: number; sell: number; qty: number; unit: number; est: number }
  let best: Cand | null = null

  for (const pg of portGoods) {
    if (pg.portId !== fromPortId) continue
    const buy = selectBuyPrice(state, fromPortId, pg.goodId)
    if (buy == null || buy < 1) continue
    const stock = state.marketStock[`${fromPortId}:${pg.goodId}`] ?? pg.stock
    const qty = Math.min(freeSpace, Math.floor(gold / buy), stock)
    if (qty < 1) continue
    const good = goods.find(g => g.id === pg.goodId)
    if (!good) continue

    for (const p of ports) {
      if (p.id === fromPortId) continue
      const sell = selectSellPrice(state, p.id, pg.goodId)
      if (sell == null) continue
      const unit = sell - buy
      if (unit <= 0) continue
      // 排序指标：每海里能赚多少 → 新手会先拿到"最近一趟就赚翻"的那单
      const straight = haversineNm(fromPort.latitude, fromPort.longitude, p.latitude, p.longitude)
      const est = (unit * qty) / Math.max(1, straight)
      if (!best || est > best.est) {
        best = { goodId: pg.goodId, goodName: good.nameCn, toPortId: p.id, buy, sell, qty, unit, est }
      }
    }
  }
  if (!best) return null

  const toPort = ports.find(p => p.id === best.toPortId)
  if (!toPort) return null

  // 真实航程 + 真实风向系数（与 sailToWaypoint / confirmDeparture 同一套）
  const geom = getRouteGeometry([fromPort.latitude, fromPort.longitude], [toPort.latitude, toPort.longitude])
  const nm = Math.round(geom.totalNm)
  const windFavor = computeWindFavor(fromPort.latitude, fromPort.longitude, toPort.latitude, toPort.longitude)
  const route: Route = {
    id: -1, fromPortId, toPortId: toPort.id, distance: nm, dangerLevel: 2, windFavor,
  }
  const days = calculateSailingDays(route, state.fleet, state.officers)

  const totalProfit = best.unit * best.qty
  if (totalProfit / Math.max(1, days) < MIN_DEAL_PROFIT_PER_DAY) return null

  return {
    goodId: best.goodId,
    goodName: best.goodName,
    toPortId: toPort.id,
    toPortName: toPort.nameCn,
    toLat: toPort.latitude,
    toLng: toPort.longitude,
    buy: best.buy,
    sell: best.sell,
    qty: best.qty,
    unitProfit: best.unit,
    totalProfit,
    nm,
    days,
  }
}

/**
 * 「卸货金额」：船上现有货物在本港全部卖出能拿多少钱。
 *
 * 【为什么需要】
 * 实测第一笔钱的闭环：掮客卡把你送到加的斯只要 2 秒，但到港后船舱是空的
 * ——卡片只设了航向，没帮你买货；到了港也没人提醒你卖。
 * 于是"+670"这个承诺在真实操作里一分钱都落不了地。
 *
 * 这里算的就是"现在卖掉能拿多少"，与 sellGood 用同一个 selectSellPrice，
 * 所以卡片显示的数就是点到账的数（有单测对账）。
 */
export interface CargoSale {
  items: { goodId: number; goodName: string; qty: number; unit: number; total: number }[]
  total: number
  qty: number
}

export function selectCargoSale(state: GameState): CargoSale | null {
  const portId = state.fleet.currentPortId
  if (!portId) return null
  const items: CargoSale['items'] = []
  let total = 0
  let qty = 0
  for (const c of state.fleet.cargo) {
    if (c.quantity <= 0) continue
    const good = goods.find(g => g.id === c.goodId)
    if (!good) continue
    const unit = selectSellPrice(state, portId, c.goodId)
    if (unit == null || unit <= 0) continue
    items.push({ goodId: c.goodId, goodName: good.nameCn, qty: c.quantity, unit, total: unit * c.quantity })
    total += unit * c.quantity
    qty += c.quantity
  }
  if (!items.length) return null
  return { items, total, qty }
}

/**
 * 「回程」：本港已经没有值得跑的货时，指一条回去补货的路。
 *
 * 实测：在加的斯卖完丝绸后，本港唯一有正向差价的货是"丝绸→哈瓦那"，
 * 22 天、4035 海里。对一个刚赚到 1170 金的新手来说，那不是建议，是劝退。
 * 贸易本来就是往返——卖完就该回去进货。
 *
 * 【只指"从哪来"这一个地方，不猜】
 * 不写死塞维利亚，也不去算"哪个港口货最便宜"（那要遍历全图找航线，很慢）。
 * 记的是玩家自己刚走过的上一条航线起点，所以这条建议永远是"回到你熟悉的地方"。
 */
export interface ReturnLeg {
  toPortId: number
  toPortName: string
  toLat: number
  toLng: number
  nm: number
  days: number
}

export function selectReturnLeg(state: GameState): ReturnLeg | null {
  const here = state.fleet.currentPortId
  const back = state.lastPortId
  if (!here || !back || back === here || state.fleet.isSailing) return null
  const a = ports.find(p => p.id === here)
  const b = ports.find(p => p.id === back)
  if (!a || !b) return null

  const geom = getRouteGeometry([a.latitude, a.longitude], [b.latitude, b.longitude])
  const nm = Math.round(geom.totalNm)
  const windFavor = computeWindFavor(a.latitude, a.longitude, b.latitude, b.longitude)
  const route: Route = { id: -1, fromPortId: here, toPortId: back, distance: nm, dangerLevel: 2, windFavor }
  const days = calculateSailingDays(route, state.fleet, state.officers)
  return { toPortId: b.id, toPortName: b.nameCn, toLat: b.latitude, toLng: b.longitude, nm, days }
}

/*
 * 这里原本有一个 getPriceFor(portId, goodId, state, mode) 的辅助函数。
 * 它自己拼了一份价格公式：`dynamicSellPrice(pg, stock, pg.stock, state.fleet)`
 * ——**漏了最后一个 opts 参数**（名船员账房 −2%、商会 −1~3%、王室 −3%、称号）。
 * 也就是说它算出来的价与面板/结算能差到 10%。它当时恰好在全项目无人调用
 * （grep src/ 与 test/ 都只有定义处），所以没造成事故，但留着就是一个
 * 「以后谁顺手 import 它，玩家就会发现屏幕数字和实际到账不一致」的定时炸弹。
 * 已删除。要读价格一律用 selectBuyPrice / selectSellPrice，那是唯一来源。
 */

export { effectiveFleetSpeed }

/** 开发调试钩子：仅在 dev 构建下暴露 store，便于自动化验证（生产构建会被 tree-shake 掉） */
if (typeof import.meta !== 'undefined' && import.meta.env?.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __gameStore: typeof useGameStore }).__gameStore = useGameStore
}
