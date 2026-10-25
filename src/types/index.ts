export interface Ship {
  id: number
  name: string
  type: 'caravel' | 'galleon' | 'sloop' | 'frigate'
  speed: number
  durability: number
  maxDurability: number
  capacity: number
  usedCapacity: number
  crew: number
  maxCrew: number
}

export interface Fleet {
  id: number
  name: string
  gold: number
  fame: number
  morale: number
  food: number
  water: number
  currentPortId: number | null
  isSailing: boolean
  day: number
  ships: Ship[]
  cargo: CargoItem[]
  /** 旗舰的船只 id，玩家视角的"座舰" */
  flagshipId: number
  /** 船长特质 id（开局选择，见 data/traits.ts），null 为老存档兜底 */
  trait: string | null
  /**
   * 耐久磨损的**累计余数**（0 ≤ x < 1）。
   *
   * 为什么需要它：磨损倍率是 ×0.3 / ×1.0 / ×2.2 这种小数，
   * 若每天取整，Math.round(0.3) = 0 —— 谨慎方针就变成「船永不磨损」，
   * 而 ×2.2 也会被 ×1.7 的天数缩短抵消掉（抢行 3 天磨 6 点，
   * 按部就班 5 天磨 5 点，几乎没差别）。磨损轴就此失去意义。
   *
   * 现在每天把倍率累加进来，满 1 点才真正扣船：
   *   谨慎 8 天 ×0.3 = 2.4 → 磨 2 点
   *   按部就班 5 天 ×1.0 = 5 点
   *   抢行 3 天 ×2.2 = 6.6 → 磨 6 点
   * 全程比值 0.5 : 1.0 : 1.29 —— 倍率终于按设计生效了。
   */
  durabilityCarry: number
}

/** 生涯统计：成就判定与结局总结的数据源 */
export interface GameStats {
  /** 累计航行天数（在海上度过的天数） */
  daysSailed: number
  /** 交易笔数（买+卖） */
  trades: number
  /** 单笔最大成交额 */
  bestDeal: number
  /** 累计贸易毛利（卖出收入 - 买入成本，按成交时点价估算） */
  tradeProfit: number
  /** 击退/战胜海盗次数 */
  pirateWins: number
  /** 经历并结算的事件总数 */
  eventsSurvived: number
  /** 历史节点目击数 */
  historySeen: number
}

export interface Achievement {
  id: string
  title: string
  description: string
  /** 图标（emoji，避免额外依赖） */
  icon: string
  /** 达成判定；传入完整 GameState */
  check: (state: GameState) => boolean
}

export interface CargoItem {
  goodId: number
  quantity: number
}

export interface Port {
  id: number
  name: string
  nameCn: string
  latitude: number
  longitude: number
  region: 'caribbean' | 'europe' | 'africa' | 'asia'
  description: string
  services: ('repair' | 'supply' | 'recruit' | 'trade' | 'shipyard')[]
}

export interface Good {
  id: number
  name: string
  nameCn: string
  basePrice: number
  category: 'food' | 'luxury' | 'material' | 'weapon' | 'spice'
}

export interface PortGood {
  portId: number
  goodId: number
  price: number
  stock: number
  priceModifier: number
}

/** 玩家视角的港口行情速报：某港正高价收购某商品 */
export interface MarketTip {
  portId: number
  goodId: number
  multiplier: number
}

export interface Route {
  id: number
  fromPortId: number
  toPortId: number
  distance: number
  dangerLevel: 1 | 2 | 3 | 4 | 5
  windFavor: number
}

/** 天候种类：晴 / 阴 / 雨 / 暴风雨 / 浓雾（见 utils/weather.ts 属性表） */
export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog'

/** 当前天气状态：种类 + 风向风速 + 本轮持续天数 */
export interface WeatherState {
  kind: WeatherKind
  /** 风向：风吹去的罗盘方位 */
  windDir: number
  /** 风速（节） */
  windSpeed: number
  /** 本轮天气开始的第几天 */
  startedDay: number
  /** 本轮天气持续天数（1-3） */
  duration: number
}

/**
 * 派系：王室 / 商人商会 / 学者公会 / 海盗兄弟会。
 * 同一种行为在不同派系眼里意义相反——这是第二条线的核心张力。
 */
export type FactionId = 'crown' | 'guild' | 'scholars' | 'brethren'

/** 名船员角色 id（有名字、有来历、有忠诚度的"人"，不是 crew 数字） */
export type CrewCharId =
  | 'boatswain' | 'gunner' | 'purser' | 'chaplain'
  | 'scholar' | 'cook' | 'midshipman' | 'corsair'

/** 已招募的名船员 */
export interface CrewMember {
  id: CrewCharId
  /** 忠诚度 0-100，低士气/危险航行/付不起承诺会掉，归零即离船 */
  loyalty: number
  /** 上船那天的日程 */
  hiredDay: number
}

/** 身份取向轴：玩家的选择累积成"你是哪种船长" */
export type NotorietyAxis = 'cruel' | 'mercy' | 'greed' | 'bold' | 'secret'

export interface GameEvent {
  id: number
  type: 'storm' | 'pirate' | 'disease' | 'accident' | 'discovery' | 'historical'
    | 'kraken' | 'ghost' | 'festival' | 'smuggle' | 'siren' | 'volcano' | 'fog' | 'treasure'
    | 'faction' | 'crew' | 'reckoning'
  /** 场景插图键（见 components/events/EventScene.tsx 注册表） */
  sceneKey?: string
  title: string
  description: string
  triggerCondition: {
    minDay?: number
    region?: string
    dangerLevelMin?: number
    /** 士气高于该值不触发（哗变等低士气事件） */
    maxMorale?: number
    /** 需要持有的事件旗标（全部满足才触发；触发后不自动消耗） */
    requiresFlags?: string[]
    /** 持有任一旗标则不触发（防止收集类事件重复出现） */
    conflictsWithFlags?: string[]
    /** 派系声望门槛：全部满足才触发（如王室密令要求 crown ≥ 30） */
    factionMin?: Partial<Record<FactionId, number>>
    /** 派系声望上限：任一满足即不触发（如通缉令要求 crown ≤ -30） */
    factionMax?: Partial<Record<FactionId, number>>
    /** 需要某名船员在船（个人事件） */
    requiresCrew?: CrewCharId[]
    /** 身份取向门槛：全部满足才触发（如"铁腕"路线需要 cruel ≥ 2） */
    notorietyMin?: Partial<Record<NotorietyAxis, number>>
    probability: number
  }
  choices: EventChoice[]
}

/**
 * 事件内嵌小游戏。
 *
 * 挂在选项（而非事件）上：同一个事件里，「绕开风暴」可以稳稳过关，
 * 「硬闯风暴」就要真的上手操作一次。是否动手，由玩家自己选。
 *
 * 六种原型各自对应一种操作方式，覆盖不同的能力维度：
 *   storm    收帆时机条 —— 时机把握（反应）
 *   boarding 拦跳板     —— 多目标注意力（手速）
 *   escape   方向键闪避 —— 危机反应（QTE）
 *   lookout  灯号复现   —— 观察记忆（记性）
 *   gamble   押注对赌   —— 风险判断（胆量）
 *   haggle   价格拉锯   —— 谈判时机（分寸）
 */
export type MiniGameId = 'storm' | 'boarding' | 'escape' | 'lookout' | 'gamble' | 'haggle' | 'cannon'

export interface EventChoice {
  text: string
  outcomes: EventOutcome[]
  /** 该选项附带的小游戏：选完先玩，表现再回头修正结局概率 */
  miniGame?: MiniGameId
}

export interface EventOutcome {
  probability: number
  goldChange: number
  foodChange: number
  waterChange: number
  moraleChange: number
  durabilityChange: number
  crewChange: number
  /** 声望变化（可正可负） */
  fameChange?: number
  /** 本结果达成后写入的事件旗标（用于事件链） */
  setsFlag?: string
  /** 派系态度变化（可正可负，正=赢得该派系好感） */
  factionChange?: Partial<Record<FactionId, number>>
  /** 身份取向累积（塑造"你是哪种船长"） */
  notoriety?: Partial<Record<NotorietyAxis, number>>
  /** 名船员个人事件结算：忠诚变化 / 离船 / 死亡 */
  crewEvent?: {
    member: CrewCharId
    loyaltyChange?: number
    leaves?: boolean
    dies?: boolean
  }
  description: string
  historicalNote?: string
}

export interface Task {
  id: number
  title: string
  description: string
  type: 'main' | 'trade' | 'escort' | 'treasure' | 'rescue'
  status: 'available' | 'active' | 'completed' | 'failed'
  reward: { gold: number; fame?: number }
  portId: number
  targetPortId?: number
  requiredGoods?: { goodId: number; quantity: number }[]
  /** 达到该天数后任务才出现在列表（用于让任务随航行逐步浮现） */
  minDay?: number
}

export interface EventLogEntry {
  event: GameEvent
  choiceIndex: number
  outcome: EventOutcome
  day: number
}

export interface Waypoint {
  latitude: number
  longitude: number
  name?: string
  portId?: number
}

/**
 * 航段方针（见 utils/segment.ts 的 STANCES）。
 *
 * 这是**唯一**的速度/风险旋钮。此前游戏里有两个语义重叠的旋钮
 * （航速档位 full/cruise/economy 与航段方针），两者叠乘后玩家
 * 无法推演因果——而且航速档位实际上根本没改变航程天数（每日航程
 * 没有乘它的倍率），只有 UI 上的数字在变。
 *
 * 现在合并成一个：每段开始前必须选定，后果全是确定乘数，
 * 选之前就能看见「几天 / 多少粮 / 多少水 / 遇几次事 / 伤多少」。
 */
export type StanceId = 'rush' | 'steady' | 'careful'

/** 待玩家抉择的航段 */
export interface PendingSegment {
  /** 航段序号（0 起） */
  index: number
  /** 航段总数 */
  total: number
  /** 下一段的态势预告（玩家在选之前就知道在赌什么） */
  hazard: string
  /**
   * 本段航程（海里）——整条航线按航段数**均分**。
   *
   * 用距离均分而不是天数均分，是因为距离是确定的：
   * 若按天数切段，玩家一路抢行后每天走的海里数变了，段界就会漂移，
   * 进度条与「第 N 段」的指示会跟着抖。距离均分则永远对齐。
   */
  segmentNm: number
  /** 剩余航程（海里，含本段） */
  remainingNm: number
  /** 距离目的港还有多少天（按当前方针估算） */
  daysLeft: number
}

/** 航线情报：花钱在港口购买的航线风险构成（按 from-to 港口对缓存） */
export interface RouteIntel {
  /** `${fromPortId}-${toPortId}` */
  routeKey: string
  /** 天气展望：好天气概率 */
  fairWeather: number
  /** 遭遇海盗的概率 */
  pirateRisk: number
  /** 风暴/恶劣天气概率 */
  stormRisk: number
  /** 购买时的天数 */
  boughtDay: number
}

/** 竞争船长（AI 对手）实时状态 */
export interface Rival {
  id: string
  name: string
  title: string
  style: 'aggressive' | 'steady' | 'explorer'
  gold: number
  fame: number
  portsFound: number
  /** 最近一次行动描述（叙事） */
  lastAction: string
  lastActionDay: number
}

/** 竞争船长的动态见闻（按天归档） */
export interface RivalNews {
  id: string
  day: number
  rivalId: string
  text: string
}

/** 已招募军官 id 列表 */
export type OfficerId = 'pilot' | 'quartermaster' | 'surgeon'

export interface GameState {
  fleet: Fleet
  currentRoute: Route | null
  routeProgress: number
  /**
   * 本次远航的**航线起点**（出航时的坐标）。
   *
   * 为什么必须单独存：地图上画的航线是「起点 → 目的地」这一整条，
   * 而船在其中的某个位置上。若地图每次都用「当前船位 → 目的地」重画，
   * 画出来的线每帧都在变，玩家看到的就不是船真正在走的那条路——
   * 这正是「船和路线没对齐」的根源。
   *
   * 存了起点之后：地图画整条航线，船沿着同一条航线走，
   * 玩家能看见自己在航线的哪一段上。
   */
  routeOrigin: [number, number] | null
  waypoint: Waypoint | null
  /** 待确认的出航计划（点击地图后先计划、后起航） */
  pendingVoyage: { waypoint: Waypoint; route: Route } | null
  /**
   * 航段抉择系统（见 utils/segment.ts）。
   *
   * 一次远航被切成若干航段，每段开始前玩家必须选定一个「航段方针」，
   * 方针的全部效果都是确定乘数——这是把「连续决策 + 可见因果」
   * 引入航海循环的核心。
   *
   * 它同时承担了原「航速档位」的全部职责（速度 / 补给 / 磨损 / 事件率），
   * 因此游戏里**只有这一个速度旋钮**，不存在两套语义重叠的乘数叠乘。
   */
  /** 本次远航的航段总数（按基准天数算出，出航时固定） */
  segmentCount: number
  /** 当前航段序号（0 起） */
  segmentIndex: number
  /** 当前生效的航段方针 */
  stance: StanceId
  /** 待玩家抉择的航段（null 表示不在抉择中） */
  pendingSegment: PendingSegment | null
  /**
   * 第三条线·航行节拍器：待进行的本段操舵（null 表示不在操舵中）。
   *
   * 选完航段方针后立刻进入——船停住（gamePhase: 'helm'），
   * 玩家实时掌舵一段，评级决定本段能少走多少海里。
   * 这是「每段都有事做」的节拍：决策不再是等出来的，是敲出来的。
   */
  pendingHelm: { segmentIndex: number } | null
  /**
   * 操舵省下的里程（海里），由 SailingController 消费一次。
   *
   * 为什么不由 store 直接改船位：船位每帧都由权威几何
   * （positionAtNm(traveledNm)）重新推导，store 里直接挪船位
   * 会被下一帧覆盖——旧的 progressBonus 就是这么被抹掉的
   * （显示省了 15%，船原地不动）。现在只递交「里程」，
   * 由唯一拥有 traveledNm 的控制器入账。
   */
  helmAdvance: { nm: number; token: number } | null
  /** 已购买的航线情报（routeKey -> 情报） */
  routeIntel: Record<string, RouteIntel>
  completedTasks: number[]
  activeTasks: Task[]
  eventLog: EventLogEntry[]
  discoveredPorts: number[]
  currentEvent: GameEvent | null
  gamePhase: 'start' | 'playing' | 'event' | 'segment' | 'helm' | 'gameover'
  /** 港口动态库存与每日价格波动，随天数演进 */
  marketStock: Record<string, number>
  /** 本局已看过的行情速报（portId:goodId），避免重复弹 */
  seenMarketTips: string[]
  /** 触发胜利结局的天数（null 表示未达成） */
  victoryDay: number | null
  /** 事件链旗标（如海图残片、幽灵船遭遇），来自事件结果的 setsFlag */
  eventFlags: Record<string, number>
  /** 生涯统计 */
  stats: GameStats
  /** 已解锁成就 id */
  achievements: string[]
  /** 竞争船长实时状态 */
  rivals: Rival[]
  /** 竞争船长动态见闻流 */
  rivalNews: RivalNews[]
  /** 已招募军官 */
  officers: OfficerId[]
  /** 派系声望 -100..100：王室/商会/学者/兄弟会各自对你的态度 */
  factionRep: Record<FactionId, number>
  /** 名船员名册（有名字、忠诚度与个人事件的人） */
  crewRoster: CrewMember[]
  /** 身份取向累积： cruel 冷酷 / mercy 仁慈 / greed 贪婪 / bold 鲁猛 / secret 守秘 */
  notoriety: Record<NotorietyAxis, number>
  /** 当前天候（动态环境：影响航速/事件/耐久/士气/能见度） */
  weather: WeatherState
  /** 剧情线：已播过的致辞 id（防刷新重播；新开局清空） */
  dialogueSeen: string[]
}

export type PanelType = 'fleet' | 'port' | 'event' | 'task' | 'trade' | 'shipyard' | 'achievement' | 'rival' | null
