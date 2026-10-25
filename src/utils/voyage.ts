import type { Fleet, OfficerId, WeatherState } from '@/types'
import { calculateDailyConsumption, dailyDistanceNm } from '@/utils/navigation'
import { dailyFoodUse, dailyWaterUse, STANCES, type StanceId } from '@/utils/segment'
import { WEATHER_INFO, weatherFavorFactor } from '@/utils/weather'

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
 * @param hasCook 名船员里有胖厨子班（食物 ×0.8）
 */
export function dailyRates(
  fleet: Fleet,
  stance: StanceId,
  hasCook: boolean,
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
  const cookRelief = hasCook ? 0.8 : 1
  return {
    foodPerDay: dailyFoodUse(consumption.food, supplyMul, cookRelief),
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
