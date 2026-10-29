/**
 * 天候系统（纯逻辑层）
 *
 * 设计目标：
 * 1) 天气是"环境"这条玩法线的载体——影响航速、补给之外的耐久/士气/事件概率/能见度；
 * 2) 确定性：同一天 + 同一海域网格 → 同一天气（可复盘、可单测、可做预报）；
 * 3) 持续性：天气不是每天掷骰子，而是持续 1-3 天的"天气过程"，
 *    避免 晴→风暴→晴→风暴 的癫痫式跳动（用 startedDay + 时长哈希实现）。
 */

import type { WeatherKind, WeatherState } from '@/types'

export type { WeatherKind, WeatherState }

export interface WeatherInfo {
  kind: WeatherKind
  label: string
  /** 航行速度倍率（作用于 SailingController 的移动与日累计） */
  sailMul: number
  /** 事件触发概率倍率（风暴/雾天更容易出事） */
  eventBias: number
  /** 每日额外船体磨损（在航速磨损之上叠加） */
  wearAdd: number
  /** 每日额外士气损耗（0 = 无） */
  moraleHit: number
  /** 能见度倍率：<1 时港口发现半径与地图视野收缩 */
  visibility: number
  /** 描述一句话（用于提示条） */
  hint: string
}

export const WEATHER_INFO: Record<WeatherKind, WeatherInfo> = {
  clear: {
    kind: 'clear', label: '晴朗',
    sailMul: 1.0, eventBias: 0.85, wearAdd: 0, moraleHit: 0, visibility: 1,
    hint: '风顺日丽，正是满帆赶路的时候',
  },
  cloudy: {
    kind: 'cloudy', label: '阴云',
    sailMul: 0.95, eventBias: 1.0, wearAdd: 0, moraleHit: 0, visibility: 0.95,
    hint: '云层低压，帆兜不住风，慢半拍',
  },
  rain: {
    kind: 'rain', label: '落雨',
    sailMul: 0.85, eventBias: 1.25, wearAdd: 0, moraleHit: 0, visibility: 0.85,
    hint: '帆索吃水发沉，淡水舱倒能接一些',
  },
  storm: {
    kind: 'storm', label: '暴风雨',
    sailMul: 0.55, eventBias: 1.8, wearAdd: 1, moraleHit: 1, visibility: 0.7,
    hint: '收帆！每一道浪都在啃船底',
  },
  fog: {
    kind: 'fog', label: '浓雾',
    sailMul: 0.75, eventBias: 1.4, wearAdd: 0, moraleHit: 0, visibility: 0.55,
    hint: '白障贴海面，瞭望哨只能听见声音',
  },
}

export const WEATHER_KINDS = Object.keys(WEATHER_INFO) as WeatherKind[]

/** 天气状态：当前天候 + 风向风速 + 已持续天数（持续到 startedDay + duration） */
export function createInitialWeather(): WeatherState {
  return { kind: 'clear', windDir: 90, windSpeed: 12, startedDay: 1, duration: 2 }
}

/* ---------------- 确定性哈希 ---------------- */

/** 32 位整数哈希（xorshift 风格，纯算术、无依赖） */
function hash2(a: number, b: number): number {
  let h = (a | 0) * 374761393 + (b | 0) * 668265263
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967296
}

/** 海域网格：20° 一格。天气按格 + 日期生成 */
export function weatherCell(lat: number, lng: number): [number, number] {
  return [Math.floor((lat + 90) / 20), Math.floor((lng + 180) / 20)]
}

/**
 * 某格某日起始的天气种类（单级权重，雾为剩余桶）。
 * 纬度偏置（真实感）：
 * - 赤道无风带（|lat|<8°）：多雾少风暴——那里容易死寂
 * - 中纬度（30°-60°）：多暴风雨——西风带气旋活跃
 * - 高纬（≥60°）：阴冷少晴
 * 晴始终是权重最大的单项（坏天气是点缀，不是常态）。
 */
export function weatherKindForCell(day: number, cellX: number, cellY: number): WeatherKind {
  const latMid = cellY * 20 - 90 + 10
  const absLat = Math.abs(latMid)
  const r = hash2(cellX * 977 + day, cellY * 131 + day * 7)

  let wClear = 0.5
  let wCloudy = 0.2
  let wRain = 0.14
  let wStorm = 0.06
  // wFog = 1 - 上面各项（剩余桶），正常纬度约 10%

  if (absLat < 8) {
    // 赤道无风带：雾多、风暴少
    wClear -= 0.08; wStorm -= 0.04
  } else if (absLat > 30 && absLat < 60) {
    // 中纬度气旋带：风暴与阴雨偏多
    wStorm += 0.08; wRain += 0.06; wClear -= 0.1; wCloudy += 0.02
  } else if (absLat >= 60) {
    // 高纬：阴冷少晴
    wClear -= 0.12; wCloudy += 0.08
  }

  // 负权修正（防累加出负数）
  wClear = Math.max(0.1, wClear)
  wStorm = Math.max(0.01, wStorm)

  const accClear = wClear
  const accCloudy = accClear + wCloudy
  const accRain = accCloudy + wRain
  const accStorm = accRain + wStorm
  if (r < accClear) return 'clear'
  if (r < accCloudy) return 'cloudy'
  if (r < accRain) return 'rain'
  if (r < accStorm) return 'storm'
  return 'fog'
}

/** 本轮天气持续天数：1-3 天（同格同日确定） */
export function weatherDuration(day: number, cellX: number, cellY: number): number {
  return 1 + Math.floor(hash2(cellX * 13 + day, cellY * 29 + day * 3) * 3)
}

/**
 * 风向：基础风带 + 每格每日 ±35° 扰动（天气过程内风向也应稳定，
 * 所以用 startedDay 而不是当天计算——见 advanceWeather）。
 */
export function windDirForCell(day: number, cellX: number, cellY: number, baseWindBearing: number): number {
  const jitter = (hash2(cellX * 71 + day, cellY * 53 + day * 11) - 0.5) * 70
  return (baseWindBearing + jitter + 360) % 360
}

/** 风速：晴 8-14、阴 10-18、雨 14-22、风暴 24-38、雾 4-9（节） */
export function windSpeedFor(kind: WeatherKind, day: number, cellX: number, cellY: number): number {
  const r = hash2(cellX * 7 + day * 5, cellY * 19 + day)
  const ranges: Record<WeatherKind, [number, number]> = {
    clear: [8, 14], cloudy: [10, 18], rain: [14, 22], storm: [24, 38], fog: [4, 9],
  }
  const [lo, hi] = ranges[kind]
  return Math.round(lo + r * (hi - lo))
}

/**
 * 天气推移：返回新天气状态。
 * - 仍在持续期内：原样返回（天气有记忆）
 * - 到期：按当前位置格 + 当天掷新天气，startedDay = day
 */
export function advanceWeather(
  current: WeatherState,
  day: number,
  lat: number,
  lng: number,
  baseWindBearing: number,
): WeatherState {
  if (day < current.startedDay + current.duration) {
    return current
  }
  const [cx, cy] = weatherCell(lat, lng)
  const kind = weatherKindForCell(day, cx, cy)
  return {
    kind,
    windDir: windDirForCell(day, cx, cy, baseWindBearing),
    windSpeed: windSpeedFor(kind, day, cx, cy),
    startedDay: day,
    duration: weatherDuration(day, cx, cy),
  }
}

/** 未来 days 天的天气预报（含今天；不改动当前状态） */
export function weatherForecast(
  current: WeatherState,
  day: number,
  lat: number,
  lng: number,
  baseWindBearing: number,
  days = 3,
): WeatherState[] {
  const out: WeatherState[] = []
  let cursor = current
  for (let i = 0; i < days; i++) {
    cursor = advanceWeather(cursor, day + i, lat, lng, baseWindBearing)
    out.push(cursor)
  }
  return out
}

/**
 * 天气对风向有利度的修正：
 * - 风暴：顺风也讨不到好（帆不敢满），上限压到 0.85
 * - 雾：风向仍有效但船不敢快，×0.9
 */
export function weatherFavorFactor(kind: WeatherKind): number {
  switch (kind) {
    case 'storm': return 0.85
    case 'fog': return 0.9
    case 'rain': return 0.95
    default: return 1
  }
}

/** 该天气是否值得弹通知（进入/退出显著天气） */
export function isNotableWeather(kind: WeatherKind): boolean {
  return kind === 'storm' || kind === 'fog' || kind === 'rain'
}

/** 天气变化提示文案 */
export function weatherChangeMessage(next: WeatherState): string {
  const info = WEATHER_INFO[next.kind]
  return `天气转为${info.label}：${info.hint}（风力 ${next.windSpeed} 节）`
}
