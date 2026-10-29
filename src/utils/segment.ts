import type { Fleet, WeatherKind } from '@/types'

/**
 * 航段抉择系统。
 *
 * 这是把「连续决策」引入航海的核心。原先的循环是：
 *   点地图 → 等十七秒 → 弹事件 → 读文字 → 点一下 → 掷骰子看结果
 * 决策密度只有 1.9 次/分钟，且结果由随机数决定。
 *
 * 改法：把一次远航切成若干**航段**，每段结束时玩家必须选一个**航行方针**。
 * 方针的全部效果都是**确定的乘数**——玩家在选之前就能看到每一种方针
 * 会让航速、补给、磨损、遇事强度变成几倍。这正是《植物大战僵尸》里
 * 「你看得见下一波僵尸、看得见阳光还剩多少、看得见自己种了什么」的同构设计。
 *
 * ## 三个方针构成一个真正的三角，没有任何方针是纯赚
 *
 *   方针          航速    补给率  磨损率  遇事率  事态烈度  段末士气
 *   抢行        ×1.7   ×1.5   ×2.2   ×1.8   ×1.45    -3
 *   按部就班    ×1.0   ×1.0   ×1.0   ×1.0   ×1.00     0
 *   谨慎        ×0.6   ×1.0   ×0.3   ×0.3   ×0.50    +3
 *
 * 关键在于**天会变**：航段长度按距离固定，航速决定这段要走几天。
 * 于是「总账」是这样的（相对按部就班）：
 *
 *   方针          天数     总粮水    总磨损    事件总数
 *   抢行        0.59×    0.88×     1.29×     1.06×
 *   按部就班    1.00×    1.00×     1.00×     1.00×
 *   谨慎        1.67×    1.67×     0.50×     0.50×
 *
 * 抢行：最快、最省粮，但船最伤、事最凶、士气掉。
 * 谨慎：最慢、最费粮，但船最稳、事最少最轻、士气涨。
 * 按部就班：不偏不倚，什么都不额外发生。
 *
 * 这就是设计目标：**没有免费的安全，也没有无代价的速度。**
 */

export type StanceId = 'rush' | 'steady' | 'careful'

export interface StanceProfile {
  id: StanceId
  /** 按钮上的名字 */
  name: string
  /** 图标（几何符号，不用 emoji——保持羊皮纸质感） */
  icon: string
  /** 一句话说明这个方针的取舍 */
  hint: string
  /** 航速倍率（决定这一段要走几天） */
  speedMul: number
  /** 每日补给消耗倍率 */
  supplyMul: number
  /** 每日船体磨损倍率 */
  wearMul: number
  /** 事件触发率倍率 */
  eventRateMul: number
  /** 事件数值变化倍率（好坏都放大/缩小） */
  eventMagnitudeMul: number
  /** 选定时立刻兑现的士气变化 */
  moraleDelta: number
  /** 强调色：抢行=炽烈 谨慎=沉稳 */
  tone: 'hot' | 'even' | 'calm'
}

export const STANCES: Record<StanceId, StanceProfile> = {
  rush: {
    id: 'rush',
    name: '抢行',
    icon: '▲',
    hint: '张满帆抢时间——跑得更快，但也更耗、更伤、更险',
    speedMul: 1.7,
    supplyMul: 1.5,
    wearMul: 2.2,
    eventRateMul: 1.8,
    eventMagnitudeMul: 1.45,
    moraleDelta: -3,
    tone: 'hot',
  },
  steady: {
    id: 'steady',
    name: '按部就班',
    icon: '■',
    hint: '照常航行——不快不慢，什么都不额外发生',
    speedMul: 1,
    supplyMul: 1,
    wearMul: 1,
    eventRateMul: 1,
    eventMagnitudeMul: 1,
    moraleDelta: 0,
    tone: 'even',
  },
  careful: {
    id: 'careful',
    name: '谨慎',
    icon: '▼',
    hint: '收帆稳行——少遭事，但多在海上待许多天',
    speedMul: 0.6,
    supplyMul: 1,
    wearMul: 0.3,
    eventRateMul: 0.3,
    eventMagnitudeMul: 0.5,
    moraleDelta: 3,
    tone: 'calm',
  },
}

/** 方针的展示顺序（键盘 1/2/3 对应） */
export const STANCE_ORDER: StanceId[] = ['rush', 'steady', 'careful']

/** 每段多少「天」——决定决策节奏（基准航速下） */
export const SEGMENT_DAYS = 5

/** 航段数下限/上限：太短的航程至少给两次抉择，太长的别把玩家逼疯 */
export const MIN_SEGMENTS = 2
export const MAX_SEGMENTS = 8

/**
 * 按「按部就班」方针下的预计天数决定航段数。
 *
 * 用基准天数而不是实时天数，是为了让航段数**在整个航程中保持稳定**——
 * 否则玩家一路抢行，到第 6 段时总天数变了，段数跟着变，进度显示会跳。
 */
export function segmentCountFor(baselineDays: number): number {
  if (!isFinite(baselineDays) || baselineDays <= 0) return MIN_SEGMENTS
  const n = Math.ceil(baselineDays / SEGMENT_DAYS)
  return Math.max(MIN_SEGMENTS, Math.min(MAX_SEGMENTS, n))
}

/**
 * 航线进度（0..1）落在第几个航段（0 起）。
 *
 * 注意：游戏逻辑**不再**用它来决定推进到哪一段——
 * 那会导致高速下一帧跨过多段时跳过中间的抉择。
 * 现在 store 每次只推进一段（见 useGameStore.syncSegmentBoundary）。
 * 这个函数保留给需要「当前落在第几段」的只读场景与测试使用。
 */
export function segmentIndexFor(progress: number, segmentCount: number): number {
  if (segmentCount <= 1) return 0
  const p = Math.min(1, Math.max(0, progress))
  const idx = Math.floor(p * segmentCount)
  return Math.max(0, Math.min(segmentCount - 1, idx))
}

/**
 * 下一个航段的分界进度（0..1）。
 *
 * 逐段推进时用它判断「是否已跨过下一段的起点」：
 * 当前段 index 为 i 时，下一个分界在 (i+1)/segmentCount。
 */
export function nextSegmentBoundary(segmentIndex: number, segmentCount: number): number {
  if (segmentCount <= 0) return 1
  return Math.min(1, (segmentIndex + 1) / segmentCount)
}

/**
 * 下一段的态势预告。
 *
 * 目的只有一个：让玩家**在选之前就知道自己在赌什么**。
 * 事件本身仍然是随机的（它决定你遇到什么事），
 * 但「这段有多凶」是可见的（它决定你的方针值不值）。
 */
export function hazardLabel(dangerLevel: number, weather: WeatherKind): string {
  const base = (() => {
    if (dangerLevel <= 1) return '海面平静'
    if (dangerLevel === 2) return '风浪渐起'
    if (dangerLevel === 3) return '礁石与盗匪出没'
    if (dangerLevel === 4) return '风暴肆虐，敌舰觊觎'
    return '十死无生的海域'
  })()
  const weatherNote = (() => {
    switch (weather) {
      case 'storm': return '，暴雨在头'
      case 'fog': return '，浓雾锁航'
      case 'rain': return '，阴雨连绵'
      case 'cloudy': return '，天色阴沉'
      default: return ''
    }
  })()
  return base + weatherNote
}

/** 每日基础消耗（食物/淡水），与 utils/navigation 的口径保持一致 */
export function dailyConsumption(fleet: Pick<Fleet, 'ships'>): { food: number; water: number } {
  const totalCrew = fleet.ships.reduce((sum, ship) => sum + ship.crew, 0)
  return {
    food: Math.ceil(totalCrew * 0.1),
    water: Math.ceil(totalCrew * 0.15),
  }
}

/* ---- 消耗口径：预测层与结算层必须用同一个函数 ---- */

/**
 * 每日食物消耗。
 *
 * 之前 store.advanceDay 里有自己的取整公式，forecastSegment 里又有另一套，
 * 两者相差最多 1 份粮——于是"预测显示 32 份、实际扣 33 份"。
 * 现在统一到这里：预测显示的数字 = 实际扣掉的数字。
 *
 * @param baseFood  crew×0.1 的基准消耗
 * @param supplyMul 方针补给倍率
 * @param cookRelief 厨子减益（0.8 = 有胖厨子班；无则 1）
 */
export function dailyFoodUse(baseFood: number, supplyMul: number, cookRelief = 1): number {
  return Math.ceil(baseFood * supplyMul * cookRelief)
}

/** 每日淡水消耗（无厨子减益） */
export function dailyWaterUse(baseWater: number, supplyMul: number): number {
  return Math.ceil(baseWater * supplyMul)
}

/**
 * 每日每艘船的耐久磨损**累进值**（小数，不取整）。
 *
 * 为什么是累进而不是每日取整：
 * 磨损倍率是 ×0.3 / ×1.0 / ×2.2 这种小数。若每天取整，
 * Math.round(0.3) = 0 —— 谨慎方针就变成「船永不磨损」；
 * 而 ×2.2 也会被 ×1.7 的天数缩短抵消掉：
 *   抢行 3 天 ×2.2 = 6.6 点
 *   按部就班 5 天 ×1.0 = 5 点   ← 几乎没差别，倍率形同虚设
 *
 * 现在把每天的倍率累加到一个「余数」里，满 1 点才真正扣船：
 *   谨慎 8 天 ×0.3 = 2.4 → 磨 2 点
 *   按部就班 5 天 ×1.0 = 5 点
 *   抢行 3 天 ×2.2 = 6.6 → 磨 6 点
 * 全程比值 0.5 : 1.0 : 1.29 —— 倍率终于按设计生效了。
 */
export function dailyWearRate(stance: StanceProfile): number {
  return stance.wearMul
}

/**
 * 把累进的磨损值结算成实际扣减的耐久点数。
 *
 * @param carry     上一次结算后剩下的余数（0 ≤ carry < 1）
 * @param rate      每日磨损倍率
 * @param days      经过的天数
 * @returns 实际应扣的点数 与 新的余数
 */
export function settleWear(carry: number, rate: number, days: number): { points: number; carry: number } {
  const total = carry + rate * days
  const points = Math.floor(total)
  return { points, carry: total - points }
}

/**
 * 把事件结果按方针强度缩放。
 *
 * 事件**是什么**仍然由随机数决定（那是叙事的部分），
 * 但事件**有多惨**由玩家的方针决定（那是策略的部分）。
 * 这条界线让「选方针」变成真正的因果承诺，而不是又一次抽奖。
 */
export function scaleOutcomeMagnitude<T extends {
  goldChange: number
  foodChange: number
  waterChange: number
  moraleChange: number
  durabilityChange: number
  crewChange: number
  fameChange?: number
}>(outcome: T, mul: number): T {
  if (mul === 1) return outcome
  const s = (v: number) => Math.round(v * mul)
  return {
    ...outcome,
    goldChange: s(outcome.goldChange),
    foodChange: s(outcome.foodChange),
    waterChange: s(outcome.waterChange),
    moraleChange: s(outcome.moraleChange),
    durabilityChange: s(outcome.durabilityChange),
    crewChange: s(outcome.crewChange),
    fameChange: outcome.fameChange === undefined ? undefined : s(outcome.fameChange),
  }
}

/* ---- 航段预测：把抽象倍率翻译成玩家能直接比较的具体数字 ---- */

export interface ForecastInput {
  /** 要走的距离（海里） */
  segmentDistanceNm: number
  /** 基准每日航程（海里/天，按部就班方针） */
  nmPerDay: number
  /** 基准每日食物消耗（crew×0.1，未含方针倍率） */
  dailyFood: number
  /** 基准每日淡水消耗（crew×0.15，未含方针倍率） */
  dailyWater: number
  /** 厨子减益（0.8 = 有胖厨子班；无则 1） */
  cookRelief?: number
  /** 基准每日事件触发概率 */
  dailyEventRate: number
  /** 方针 */
  stance: StanceProfile
  /** 当前磨损累进余数（0 ≤ x < 1），用于让预测与结算逐点对齐 */
  durabilityCarry?: number
}

export interface SegmentForecast {
  /** 这一段大约要走几天 */
  days: number
  /** 这一段大约吃掉多少食物 */
  food: number
  /** 这一段大约喝掉多少淡水 */
  water: number
  /** 每艘船大约损失多少耐久 */
  wear: number
  /** 预计遭遇事件次数（期望值） */
  events: number
}

/**
 * 预测某个方针下这一段的具体后果。
 *
 * 这是「可见的因果」的关键一步：不让玩家去心算 1.7 × 1.5，
 * 而是直接把「几天 / 多少粮 / 多少水 / 伤多少 / 遇几次事」摆在他面前。
 *
 * 这里的每个数字都必须和 store.advanceDay 的实际结算**完全一致**，
 * 所以取整规则与磨损累进也走同一套函数
 * （dailyFoodUse / dailyWaterUse / settleWear）。
 * 预测与结算差 1 份粮或 1 点耐久，玩家就会觉得界面在骗人——
 * 那是这个项目最忌讳的事。
 */
export function forecastSegment(input: ForecastInput): SegmentForecast {
  const { segmentDistanceNm, nmPerDay, dailyFood, dailyWater, dailyEventRate, stance } = input
  const cookRelief = input.cookRelief ?? 1
  const effectiveNmPerDay = Math.max(0.001, nmPerDay * stance.speedMul)
  const days = Math.max(1, Math.ceil(segmentDistanceNm / effectiveNmPerDay))
  const perDayFood = dailyFoodUse(dailyFood, stance.supplyMul, cookRelief)
  const perDayWater = dailyWaterUse(dailyWater, stance.supplyMul)
  // 磨损：与结算层同一个累进函数，所以「预测 2 点」就是「实际扣 2 点」
  const wear = settleWear(input.durabilityCarry ?? 0, dailyWearRate(stance), days).points
  return {
    days,
    food: perDayFood * days,
    water: perDayWater * days,
    wear,
    events: Math.round(dailyEventRate * stance.eventRateMul * days * 100) / 100,
  }
}

/* ---- 方针总账：把三个方针并排放，让玩家直接比 ---- */

export interface LedgerInput {
  /** 要走的距离（海里）——一段用本段距离，全程用航线总距离 */
  distanceNm: number
  /** 基准每日航程（海里/天，按部就班，已含风与天候） */
  baseNmPerDay: number
  /** 基准每日食物消耗 */
  dailyFood: number
  /** 基准每日淡水消耗 */
  dailyWater: number
  /** 厨子减益（0.8 = 有胖厨子班；无则 1） */
  cookRelief?: number
  /** 基准每日遇事概率（含天候，不含方针倍率） */
  dailyEventProb: number
  /** 当前磨损累进余数（0 ≤ x < 1） */
  durabilityCarry?: number
}

export interface StanceLedger {
  stance: StanceProfile
  /** 这一程要走的��数 */
  days: number
  food: number
  water: number
  wear: number
  /** 预计遇事次数 */
  events: number
  /** 选定时立刻兑现的士气变化 */
  morale: number
  /** 相对「按部就班」的差异（负数=更省/更快） */
  delta: {
    days: number
    food: number
    water: number
    wear: number
    events: number
  }
}

/**
 * 算出三个方针各自的「总账」。
 *
 * 总账的意义在于：单个倍率看不出取舍，
 * 但「抢行快 2 天、省 11 份粮、多磨 1.6 点船、遇事多 0.5 次」是可以直接比出来的。
 *
 * 天数 = 距离 ÷ (基准每日航程 × 方针航速倍率)
 * 于是「抢行少花几天」这句话第一次是**真的**——
 * 因为每日航程里已经乘上了方针倍率（见 navigation.dailyDistanceNm）。
 */
export function stanceLedgers(input: LedgerInput): StanceLedger[] {
  const carry = input.durabilityCarry ?? 0
  const base = forecastSegment({
    segmentDistanceNm: input.distanceNm,
    nmPerDay: input.baseNmPerDay,
    dailyFood: input.dailyFood,
    dailyWater: input.dailyWater,
    cookRelief: input.cookRelief,
    dailyEventRate: input.dailyEventProb,
    stance: STANCES.steady,
    durabilityCarry: carry,
  })

  return STANCE_ORDER.map((id) => {
    const stance = STANCES[id]
    const f = forecastSegment({
      segmentDistanceNm: input.distanceNm,
      nmPerDay: input.baseNmPerDay,
      dailyFood: input.dailyFood,
      dailyWater: input.dailyWater,
      cookRelief: input.cookRelief,
      dailyEventRate: input.dailyEventProb,
      stance,
      durabilityCarry: carry,
    })
    return {
      stance,
      days: f.days,
      food: f.food,
      water: f.water,
      wear: f.wear,
      events: f.events,
      morale: stance.moraleDelta,
      delta: {
        days: f.days - base.days,
        food: f.food - base.food,
        water: f.water - base.water,
        wear: f.wear - base.wear,
        events: Math.round((f.events - base.events) * 100) / 100,
      },
    }
  })
}

/**
 * 本段（或全程）里，某个方针下要走的天数。
 * 与 stanceLedgers 用同一套口径，避免两处算出不同的天数。
 */
export function stanceDays(distanceNm: number, baseNmPerDay: number, stance: StanceProfile): number {
  const effective = Math.max(0.001, baseNmPerDay * stance.speedMul)
  return Math.max(1, Math.ceil(distanceNm / effective))
}


/**
 * 把一个方针账本翻译成一句人话代价。
 *
 * 【为什么必须从账本算，不能写死文案】
 * 直觉上「抢行 = 省粮水」，但这个方向**不是恒定的**：
 * `days = ceil(distance / (nmPerDay × speedMul))`，段短时三个方针的天数
 * 会被取整压成同一个数，而 supplyMul 的 1.5 倍差异照旧 →
 * 抢行反而多耗粮，同时船损和事件后果的代价一分不少，变成纯亏选项。
 *
 * 实测（真实初始舰队，192 海里/天，每日 2 粮 3 水）：
 *   段长 100 海里 → 抢行 1 天 / 3 粮，基准 1 天 / 2 粮  = 纯亏
 *   段长 200 海里 → 抢行 1 天 / 3 粮，基准 2 天 / 4 粮  = 又快又省
 *   段长 600 海里 → 抢行 2 天 / 6 粮，基准 4 天 / 8 粮  = 又快又省
 *
 * 同一句静态文案不可能同时说对这三种情况。所以只能从 delta 算。
 * 副产物是好的：短段上界面会如实显示「用时相同 · 费粮水」，
 * 玩家一眼就知道这段不该抢，而不是被一句"省粮水"骗着去付船损。
 *
 * 天数快慢不在返回值里——它由卡片右侧的彩色标签表达，避免同一句话说两遍。
 * 唯一显式写出的是「用时相同」：那种情况右侧没有标签，
 * 不说的话玩家会以为抢行至少快了一点。
 */
export function describeStanceTradeoff(l: StanceLedger): string {
  if (l.stance.id === 'steady') return '基准节奏 · 无额外代价'
  const d = l.delta
  const parts: string[] = []

  if (d.days === 0) parts.push('用时相同')

  // 粮水合并成一档：分开说会变成"粮-1 · 水-4"，两个字不如一个方向清楚
  const supply = d.food + d.water
  if (supply < 0) parts.push('省粮水')
  else if (supply > 0) parts.push('费粮水')

  if (d.wear > 0) parts.push('伤船')
  else if (d.wear < 0) parts.push('护船')

  // 事件后果是倍率，不随段长变——短段上它是抢行主要（甚至唯一）的代价
  if (l.stance.eventMagnitudeMul > 1) parts.push('事件更重')
  else if (l.stance.eventMagnitudeMul < 1) parts.push('事件更轻')

  return parts.join(' · ')
}
