import type { WeatherKind } from '@/types'

/**
 * 船上视角的天气参数：雨量、雾、浪高、天光压暗、风向偏移。
 *
 * 【为什么单独一层】`utils/weather.ts` 里那套是**玩法**用的（影响航速、事件率、
 * 补给），它的数值是为平衡调的；而这里的数值是**画面**用的（雨多密、雾多远、
 * 浪多高）。两者不能混：把画面的数塞进玩法表会改变航程，把玩法的数直接拿来画
 * 又会得到"暴风雨里只有 3 滴雨"。
 *
 * 【为什么是纯函数】这五个数决定整张图的观感，却被 shader / 粒子 / 灯光 / 船姿态
 * 四处消费。写成表驱动 + 可测，才能在改一个数时知道会连带什么。
 */
export interface DeckWeatherLook {
  /** 雨量 0..1（0 = 不下，1 = 暴风雨） */
  rain: number
  /** 雾浓度 0..1（0 = 通透，1 = 只看得到船头） */
  fog: number
  /** 浪高倍数（1 = 正常涌浪，暴风雨 1.9） */
  wave: number
  /** 天光压暗 0..1（0 = 原色，1 = 压到最暗） */
  darken: number
  /**
   * 雨/浪的横向偏移（世界单位 / 秒的视觉量），正值 = 往 +x 斜。
   * 由**风向**决定，不是随机：暴风雨里雨要打在同一个方向，船也跟着横摇。
   */
  tilt: number
  /** 闪电频率：每秒期望次数（0 = 不闪） */
  lightning: number
}

const CLEAR: DeckWeatherLook = { rain: 0, fog: 0, wave: 1.0, darken: 0, tilt: 0, lightning: 0 }

/**
 * 天气 → 画面参数。
 *
 * 【为什么 rain 与 darken 不是同一条线】下雨天不一定暗（热带的阵雨出着太阳），
 * 而浓雾很暗却不下雨。所以分成两个独立维度，各自取值。
 */
export const DECK_WEATHER: Record<WeatherKind, DeckWeatherLook> = {
  clear: CLEAR,
  cloudy: { rain: 0, fog: 0.08, wave: 1.12, darken: 0.18, tilt: 0, lightning: 0 },
  rain: { rain: 0.55, fog: 0.22, wave: 1.35, darken: 0.34, tilt: 0.55, lightning: 0.02 },
  storm: { rain: 1, fog: 0.16, wave: 1.9, darken: 0.56, tilt: 1.25, lightning: 0.16 },
  fog: { rain: 0, fog: 0.92, wave: 1.05, darken: 0.30, tilt: 0, lightning: 0 },
}

/** 未知天气退回晴天（宁可没有效果，也不要画面卡在某个奇怪的中间态） */
export function deckWeatherLook(kind: WeatherKind | string | undefined | null): DeckWeatherLook {
  if (!kind) return CLEAR
  return DECK_WEATHER[kind as WeatherKind] ?? CLEAR
}

/**
 * 把天气参数做**时间平滑**。
 *
 * 【为什么要平滑】天气是"按天"切换的（`weather.startedDay`），切的那一刻如果
 * 直接跳，雨会"啪"地一下从 0 变满、浪高瞬间翻倍、船猛地一抬 —— 玩家会以为
 * 出 bug。这里用指数趋近，约 1.5 秒走完 90%。
 */
export function approachLook(
  cur: DeckWeatherLook,
  target: DeckWeatherLook,
  dt: number,
): DeckWeatherLook {
  /*
   * dt 要挡住三种坏输入：负数（时钟回拨）、NaN（首帧 / 被打断）、
   * 以及几十秒（切后台回来）—— 任何一个漏过去，`exp` 算出 NaN 之后
   * 整套天气参数会永久变成 NaN，画面直接黑掉，而控制台一声不响。
   */
  const d = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0
  const k = 1 - Math.exp(-d * 1.6)
  const m = (a: number, b: number) => a + (b - a) * k
  return {
    rain: m(cur.rain, target.rain),
    fog: m(cur.fog, target.fog),
    wave: m(cur.wave, target.wave),
    darken: m(cur.darken, target.darken),
    tilt: m(cur.tilt, target.tilt),
    lightning: m(cur.lightning, target.lightning),
  }
}

/** 雨滴总数：0 雨量时为 0，不付顶点与绘制 */
export function rainDropCount(look: DeckWeatherLook, maxDrops: number): number {
  if (!Number.isFinite(look.rain) || look.rain <= 0.01) return 0
  return Math.round(maxDrops * Math.min(1, Math.max(0, look.rain)))
}

/**
 * 闪电的亮度包络：一次闪电 = 瞬间到 1，然后 0.35 秒指数衰减。
 * 返回值 0..1。
 */
export function lightningEnvelope(ageSec: number): number {
  if (!Number.isFinite(ageSec) || ageSec < 0) return 0
  if (ageSec > 0.6) return 0
  // 前 0.05 秒是"啪"，之后按 0.18 秒的时间常数衰减
  if (ageSec < 0.05) return ageSec / 0.05
  return Math.exp(-(ageSec - 0.05) / 0.18) * 0.92
}
