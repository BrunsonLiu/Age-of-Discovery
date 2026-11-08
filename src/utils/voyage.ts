import type { Fleet, OfficerId, WeatherState } from '@/types'
import { calculateDailyConsumption, computeWindFavor, dailyDistanceNm } from '@/utils/navigation'
import { dailyFoodUse, dailyWaterUse, forecastSegment, STANCES, type StanceId } from '@/utils/segment'
import { WEATHER_INFO, weatherFavorFactor } from '@/utils/weather'
import { getRouteGeometry } from '@/utils/routePath'
import { routePhenomenonFactor } from '@/data/seaPhenomena'

/**
 * 航程测算的公共口径。
 *
 * 这个文件存在的唯一理由：**同一个数字不许算两遍。**
 *
 * 在它之前，「每天吃多少粮」在 store 的 advanceDay 里算一遍、
 * 在航段抉择面板的 forecastSegment 里再算一遍，两套取整公式最多差 1 份粮——
 * 于是面板预测「还剩 32 份」、实际扣 33 份。玩家发现自己信不过界面，
 * 而一个数字会说谎的界面，比没有数字更糟。
 *
 * 现在三处共用这里：
 *   1. store.advanceDay    —— 真正扣粮水的地方
 *   2. BottomBar           —— 「约 N 天」剩余航程
 *   3. ResourceCluster     —— 「粮还能撑 N 天」与「撑到目的港够不够」
 *
 * 改任何一处口径都必须改这里，否则立刻会有测试红掉。
 */

/** 港内消耗折扣：船员上岸自给一部分，海上消耗的 1/4 */
export const PORT_CONSUMPTION_DIVISOR = 4

export interface DailyRates {
  /** 每日食物消耗（份/天） */
  foodPerDay: number
  /** 每日淡水消耗（份/天） */
  waterPerDay: number
  /** 当前是否处于港内（影响口径与文案） */
  inPort: boolean
}

/**
 * 当前每日粮水消耗——与 store.advanceDay 的结算公式逐字对应。
 *
 * 注意调用方必须传**当前正在生效的方针**：航行中由 STANCES[stance].supplyMul
 * 决定（抢行 ×1.5、按部就班 ×1.0、谨慎 ×1.0），港内不乘方针倍率。
 *
 */
export function dailyRates(
  fleet: Fleet,
  stance: StanceId,
): DailyRates {
  const consumption = calculateDailyConsumption(fleet)
  const inPort = !fleet.isSailing

  if (inPort) {
    return {
      foodPerDay: Math.ceil(consumption.food / PORT_CONSUMPTION_DIVISOR),
      waterPerDay: Math.ceil(consumption.water / PORT_CONSUMPTION_DIVISOR),
      inPort: true,
    }
  }

  const supplyMul = STANCES[stance].supplyMul
  return {
    foodPerDay: dailyFoodUse(consumption.food, supplyMul),
    waterPerDay: dailyWaterUse(consumption.water, supplyMul),
    inPort: false,
  }
}

export interface VoyageInput {
  /** 航线总里程（海里）——必须是路径实际长度，不是直线距离 */
  routeDistanceNm: number
  /** 当前进度 0~1 */
  progress: number
  fleet: Fleet
  officers: OfficerId[]
  /** 航线的风力偏好（0.5~1.5） */
  windFavor: number
  stance: StanceId
  weather: WeatherState
}

/**
 * 一趟航程的**路线事实**：走哪条线、实际多长、风顺不顺。
 *
 * 【为什么距离必须来自 getRouteGeometry，而不是大圆距离】
 *
 * 船走的是**避陆弧线**：塞维利亚在伊比利亚半岛内陆，大圆第一段就撞陆；
 * 去好望角的大圆横穿撒哈拉。水手的做法是沿海岸绕行，A* 就是把这件事算出来
 * （见 utils/routePath.ts）。
 *
 * 常驻「下一站」指引原先用 haversine 大圆距离报海里数，于是同一趟航主屏写
 * 「1956 海里 · 约 10 天」、出航计划面板写「航程 2917 海里 · 约 15 天可达」——
 * 两个数字差 49%。玩家照主屏备水备粮，到海上才发现差 5 天，
 * 而补给判定又是按面板那个数字算的。**界面自己打自己。**
 *
 * 现在这条弧长由本函数一处算出：出航计划（store.sailToWaypoint）与
 * 主屏指引（hooks/useVoyageNext）都调它，于是两屏必然同源。
 */
export interface RouteFacts {
  /** 实际航线弧长（海里，避陆后）——玩家看到的「航程」 */
  distanceNm: number
  /** 这条航线的风力偏好（0.5~1.5） */
  windFavor: number
}

/**
 * 算出两点之间的航线事实。
 *
 * 【为什么取整在这里做】出航计划面板显示的「航程 N 海里」用的是
 * `Math.round(geom.totalNm)`；主屏指引要显示同一个数，就不能在这里
 * 留下小数让两处各自取整（一个用 ceil 一个用 round 就会差 1 海里）。
 * 危险等级仍按取整前的值算——阈值是 500/1500/3000/5000，取整不会翻转档位。
 *
 * 【报数之前必须等航线几何就绪——第 33 轮实测】
 * 海陆掩码（810KB）是异步加载的。在它到位之前，`buildRouteGeometry` 找不到海路，
 * 会**退化成大圆弧**（见 routePath.ts 里那句「宁可穿陆也不要卡死玩家」）。
 * 船照样能开，但那条直线会直接穿过陆地：
 *   埃尔米纳 → 里斯本   掩码未到位：2157 海里（直线横穿撒哈拉）
 *                  掩码已到位：2903 海里（绕开陆地）   —— 差 35%
 *
 * 所以：**船的移动不等掩码，报给玩家的里程与天数必须等。**
 * 判据用 `useMapStore.landDataReady`（不是"掩码加载了没"）：
 * 掩码到位之后还要 `invalidateRouteGeometryCache()`，
 * 那一步没做完之前缓存里躺着的仍是旧的直线几何。
 */
export function routeFacts(
  from: [number, number],
  to: [number, number],
  day: number,
  /** 已识得的航路（拾到迪亚士的石十字之后，风暴带不再拖慢你） */
  knownPassages: readonly string[] = [],
): RouteFacts {
  const geom = getRouteGeometry(from, to)
  return {
    distanceNm: Math.round(geom.totalNm),
    windFavor: windFavorForRoute(from, to, day, geom.points, knownPassages),
  }
}

/**
 * 一条航线的风力系数 —— **含季节性海上现象**。
 *
 * 【为什么单独开一个函数，而不是在 computeWindFavor 里算】
 * `computeWindFavor` 只知道两个点，不知道船**实际走哪条弧线**。
 * 季节现象是海上一片一片的区域（见 data/seaPhenomena），
 * 而绕好望角的航线与那条直线大圆根本不是同一条线——
 * 拿直线去判"有没有穿过风暴带"会得出相反的结论
 * （好望角那条真正的航线贴着海岸走，直线却从南大西洋正中穿过）。
 *
 * 【为什么必须传 day、不设默认值】
 * 默认值会让"某个调用方忘了传"变成**静默失效**：季节现象不生效，
 * 而界面上一切正常。宁可编译报错。
 *
 * 【为什么这个乘数要乘进 windFavor，而不是另开一个字段】
 * 天数只有一条链：`windFavor → dailyDistanceNm → daysForDistance`。
 * 多一个字段就要在"预估天数"与"船每天实际推进"两处各乘一次，
 * 而这正是本项目最忌讳的分叉（界面报 6 天、船走了 9 天）。
 */
export function windFavorForRoute(
  from: [number, number],
  to: [number, number],
  day: number,
  /** 已经算好的航线点（不给就自己取，走缓存） */
  points?: { lat: number; lng: number }[],
  /** 已识得的航路——传进来就按"知道怎么走"算 */
  knownPassages: readonly string[] = [],
): number {
  const base = computeWindFavor(from[0], from[1], to[0], to[1], day)
  const pts = points ?? getRouteGeometry(from, to).points
  return base * routePhenomenonFactor(pts, day, knownPassages)
}

/**
 * 一趟航程「按部就班」要走几天 —— **全项目唯一的算法**。
 *
 * 【为什么必须是同一个函数】
 * 「下一站」常驻条与出航计划面板都报「约 N 天」。两处若各算一遍，
 * 玩家会在同一趟航上读到两个天数：主屏按**当前方针**算（抢行 ×1.7），
 * 面板按**按部就班**算（×1.0）。实测塞维利亚→埃尔米纳：主屏「约 10 天」，
 * 面板「约 15 天可达」——差 5 天，而补给够不够又是按面板那个天数判的。
 *
 * 口径固定为**按部就班**（STANCES.steady）：这正是出航计划结论句
 * 「约 N 天可达」用的基准，也是玩家默认会走的节奏。方针要到每段起点才选，
 * 不该在这一层参与天数计算。
 *
 * 军官（领航员 +15%）要算进来：出航计划面板用的是 `dailyDistanceNm(fleet, officers, …)`，
 * 漏掉军官就会让主屏比实际慢 15%。
 */
export function voyageDays(input: {
  /** 航线弧长（海里）——来自 routeFacts，不要用大圆距离 */
  distanceNm: number
  /** 航线的风力偏好 */
  windFavor: number
  fleet: Fleet
  officers: OfficerId[]
  weather: WeatherState
}): number {
  const weatherMul = WEATHER_INFO[input.weather.kind].sailMul * weatherFavorFactor(input.weather.kind)
  // 方针固定 ×1（按部就班）：与出航计划面板的 steady 一份总账同口径
  const baseNmPerDay = dailyDistanceNm(input.fleet, input.officers, input.windFavor, 1, weatherMul)
  // 走 forecastSegment 而不是自己写 ceil：天数取整规则只留这一份实现
  return forecastSegment({
    segmentDistanceNm: input.distanceNm,
    nmPerDay: baseNmPerDay,
    dailyFood: 0,
    dailyWater: 0,
    dailyEventRate: 0,
    stance: STANCES.steady,
  }).days
}

/**
 * 抵达目的港还需几天。
 *
 * 口径与 BottomBar 原先的内联实现完全一致：
 *   剩余里程 ÷（船速 × 风 × 方针航速倍率 × 天候倍率 × 24）
 *
 * 为什么天气要乘两次（WEATHER_INFO.sailMul × weatherFavorFactor）：
 * sailMul 是天候种类的固有影响（暴风雨 0.5），favorFactor 是
 * 「这一天的风相对于航向是顺是逆」。少乘任何一个都会让预估偏离实际。
 */
export function daysToDestination(input: VoyageInput): number {
  const remainingNm = input.routeDistanceNm * (1 - input.progress)
  if (remainingNm <= 0) return 0

  const stanceMul = STANCES[input.stance].speedMul
  const weatherMul = WEATHER_INFO[input.weather.kind].sailMul * weatherFavorFactor(input.weather.kind)
  const nmPerDay = dailyDistanceNm(
    input.fleet,
    input.officers,
    input.windFavor,
    stanceMul,
    weatherMul,
  )
  return nmPerDay > 0 ? Math.max(0, Math.ceil(remainingNm / nmPerDay)) : 0
}

/**
 * 按当前消耗速率，某项补给还能撑几天。
 *
 * 返回 Infinity 表示「不消耗」（没有船员时），调用方应显示为「∞」而不是 0——
 * 把「够用」显示成「0 天」会让玩家以为要断粮了。
 */
export function supplyDaysRemaining(amount: number, perDay: number): number {
  if (perDay <= 0) return Infinity
  if (amount <= 0) return 0
  return amount / perDay
}

/** 补给水位：ok=充裕 / warn=开始紧张 / critical=会出人命 */
export type SupplyLevel = 'ok' | 'warn' | 'critical'

/** 紧张线（天）：少于这么多天就黄字提醒 */
export const LOW_DAYS = 3
/** 士气告警线——与 store 里 lowMorale 的判定线一致 */
export const LOW_MORALE = 45

/**
 * 补给该显示成什么颜色。
 *
 * 三档各自的含义必须分清，否则预警就只是装饰：
 *   critical —— 已经断（amount=0），或按当前速率**撑不到目的港**
 *   warn     —— 还够走到，但余量已不到 3 天
 *   ok       —— 其余
 *
 * 「撑不到目的港」是最高优先级的判据：它不是「有点紧张」，
 * 而是「不改方针或不补给就一定会在海上断粮」——那意味着
 * 断粮当天士气开始崩，且每天 12% 概率死船员。
 *
 * @param needDays 到目的港所需天数；0 表示不在航行，不做抵达判定
 */
export function supplyLevel(amount: number, perDay: number, needDays: number): SupplyLevel {
  if (amount <= 0) return 'critical'
  const days = supplyDaysRemaining(amount, perDay)
  if (needDays > 0 && days < needDays) return 'critical'
  if (days <= LOW_DAYS) return 'warn'
  return 'ok'
}

/** 士气水位：低于 45 会连锁拖垮忠诚度，必须显眼 */
export function moraleLevel(morale: number): SupplyLevel {
  if (morale < LOW_MORALE) return 'critical'
  if (morale < 60) return 'warn'
  return 'ok'
}

/** 天数的人类可读形式：>30 天一律显示 30+，避免「87 天」这种噪音 */
export function formatSupplyDays(days: number): string {
  if (!Number.isFinite(days)) return '∞'
  if (days >= 30) return '30+'
  if (days >= 10) return String(Math.round(days))
  return days.toFixed(1).replace(/\.0$/, '')
}
