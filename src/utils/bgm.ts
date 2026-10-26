/**
 * BGM 控制器层：负责"何时播放、切什么情绪、如何随游戏状态变化"。
 *
 * 实际的合成逻辑在 bgmEngine.ts（纯函数、可离线渲染测试）。
 * 本文件只做三件事：
 *   1. 从 audio.ts 拿到 BGM 总线
 *   2. 用 setInterval 提前排定下一小节（避免 setTimeout 抖动导致节奏不稳）
 *   3. 根据游戏状态切换情绪
 *
 * 与音效共用同一个 AudioContext，因此总开关同时作用于两者；
 * BGM 另有独立的音量比例（getBgmLevel/setBgmLevel）。
 */

import { getBgmBus, getBgmLevel, setBgmLevel } from './audio'
import {
  MOODS,
  barDuration,
  scheduleBar,
  type BgmMood,
} from './bgmEngine'

export type { BgmMood }
export { MOODS, getBgmLevel, setBgmLevel }

let scheduler: number | null = null
let currentMood: BgmMood = 'calm'
/** 下一小节的调度时间（AudioContext 时间轴） */
let nextBarTime = 0
let barIndex = 0

/**
 * 调度循环：提前 0.6 秒排下一小节。
 * 用 setInterval 而非 setTimeout——setTimeout 的实际触发时间会抖动，
 * 累积起来会让节奏越走越偏；提前排定则由采样精确的 ctx 时间轴执行。
 */
function tick() {
  const handle = getBgmBus()
  if (!handle || scheduler === null) return
  const { ctx, bus } = handle

  while (nextBarTime < ctx.currentTime + 0.6) {
    if (nextBarTime < ctx.currentTime) nextBarTime = ctx.currentTime + 0.05
    scheduleBar(ctx, bus, currentMood, nextBarTime, barIndex)
    barIndex++
    nextBarTime += barDuration(currentMood)
  }
}

/**
 * 启动 BGM。必须在用户手势中调用（浏览器自动播放策略）。
 * 重复调用是安全的——已启动时直接返回。
 */
export function startBgm() {
  const handle = getBgmBus()
  if (!handle) return
  const { ctx } = handle
  if (ctx.state === 'suspended') void ctx.resume()
  if (scheduler !== null) return
  nextBarTime = ctx.currentTime + 0.15
  barIndex = 0
  scheduler = window.setInterval(tick, 250)
  tick()
}

/** 停止 BGM 调度（已排定的音符会自然衰减完） */
export function stopBgm() {
  if (scheduler !== null) {
    clearInterval(scheduler)
    scheduler = null
  }
}

/**
 * 切换情绪。在下一小节边界换和声，实现无缝衔接。
 * 未播放时只记录情绪，等 startBgm() 后生效。
 */
export function setBgmMood(mood: BgmMood) {
  if (mood === currentMood) return
  currentMood = mood
  const handle = getBgmBus()
  if (handle && scheduler !== null) {
    // 换情绪时重置小节计数，让新情绪从自己的第一小节开始
    nextBarTime = Math.max(nextBarTime, handle.ctx.currentTime + 0.05)
    barIndex = 0
  }
}

export function getBgmMood(): BgmMood {
  return currentMood
}

export function isBgmRunning(): boolean {
  return scheduler !== null
}

/**
 * 开发调试钩子：暴露真实实例的调度状态。
 * 理由同 utils/audio.ts —— HMR 时间戳会让脚本重新 import 出另一个实例。
 */
if (typeof import.meta !== 'undefined' && import.meta.env?.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __bgm: unknown }).__bgm = {
    isRunning: () => scheduler !== null,
    getMood: () => currentMood,
    getNextBarTime: () => nextBarTime,
    getBarIndex: () => barIndex,
    start: () => startBgm(),
    stop: () => stopBgm(),
    setMood: (m: BgmMood) => setBgmMood(m),
  }
}
