/**
 * 月相：**航程天数的纯函数**。
 *
 * 【为什么按"天"而不是按实时】本作的一天 = 一个航行日（8 分钟实时一昼夜只是天色）。
 * 月相是航海历法的一部分：玩家记的是"第几天走这趟"，不是"看了几秒钟"。
 * 用 `fleet.day` 推导，读档、重开、切视图都不会变，也不需要存渲染状态。
 *
 * 【周期】朔望月 29.53 天（真实值）。取整会三年差出一个月，这里保留小数，
 * 天数可以是小数（航程按天推进）。
 *
 * 【它影响什么】只乘在事件概率链上（`store.advanceDay` 里那一条 eventBias），
 * 不新开一套"月亮系统"：月明则夜航看得远、也更容易被人看见；
 * 新月夜海面安静。系数 0.85~1.15，小到不会改变一局的走向，大到能感到"今晚不太一样"。
 */

/** 朔望月长度（天） */
export const SYNODIC_MONTH_DAYS = 29.53

/** 第 n 天（1 起）距离最近一次朔（新月）的天数相位，0~1：0/1 = 新月，0.5 = 满月 */
export function moonPhaseAt(day: number): number {
  const d = Number.isFinite(day) ? day : 1
  /* 以第 1 天为新月起算（开局那晚没有月亮，玩家第一次出航就看得见变化） */
  const p = ((d - 1) / SYNODIC_MONTH_DAYS) % 1
  return p < 0 ? p + 1 : p
}

/** 被照亮的比例 0~1（真实公式：(1 - cos θ) / 2） */
export function moonIlluminationAt(day: number): number {
  const p = moonPhaseAt(day)
  return (1 - Math.cos(p * Math.PI * 2)) / 2
}

export type MoonKey = 'new' | 'waxingCrescent' | 'firstQuarter' | 'waxingGibbous' | 'full' | 'waningGibbous' | 'lastQuarter' | 'waningCrescent'

export interface MoonInfo {
  /** 0~1 相位（0 = 新月） */
  phase: number
  /** 0~1 照亮比例 */
  illum: number
  /** 是不是"变亮的那半个月"（决定亮面在左还是右） */
  waxing: boolean
  key: MoonKey
  name: string
}

const NAMES: Record<MoonKey, string> = {
  new: '新月',
  waxingCrescent: '娥眉月',
  firstQuarter: '上弦月',
  waxingGibbous: '盈凸月',
  full: '满月',
  waningGibbous: '亏凸月',
  lastQuarter: '下弦月',
  waningCrescent: '残月',
}

/** 八相分档（每档 1/16 个周期的边界，与肉眼观感一致） */
export function moonAt(day: number): MoonInfo {
  const phase = moonPhaseAt(day)
  const illum = moonIlluminationAt(day)
  const waxing = phase < 0.5
  const e = 1 / 16
  let key: MoonKey
  if (phase < e || phase >= 1 - e) key = 'new'
  else if (phase < 0.25 - e) key = 'waxingCrescent'
  else if (phase < 0.25 + e) key = 'firstQuarter'
  else if (phase < 0.5 - e) key = 'waxingGibbous'
  else if (phase < 0.5 + e) key = 'full'
  else if (phase < 0.75 - e) key = 'waningGibbous'
  else if (phase < 0.75 + e) key = 'lastQuarter'
  else key = 'waningCrescent'
  return { phase, illum, waxing, key, name: NAMES[key] }
}

/**
 * 月光对事件概率的倍率（唯一消费者：`advanceDay` 里的 `eventBias` 链）。
 *
 * 线性：满月 ×1.15、新月 ×0.85。方向是"月明看得远、也更容易被人看见"，
 * 不是"晚上更危险"——后者听上去更刺激，但玩家没法验证，等于编一个数。
 */
export function moonEventMul(day: number): number {
  return 1 + 0.3 * (moonIlluminationAt(day) - 0.5)
}
