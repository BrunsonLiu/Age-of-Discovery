/**
 * 天时（日相）的唯一来源。
 *
 * 【为什么必须是"时间的纯函数"，而不是一份会被推进的状态】
 * 2D 与 2.5D 是两套渲染，两个视图如果各自 `phase += dt / 周期`，那么：
 *   · 两边起点不同 → 切视图时天色**跳一下**；
 *   · 谁先跑、跑多少帧，决定谁的天色是对的 → 同屏两个数不一样。
 * 改成 `phase = f(nowMs, 航程推力)`：同一个时刻问两次，答案必然相同，
 * 两个视图自然对齐，也不需要谁去"同步"。
 *
 * 航程推力只认**增量**（routeProgress 到港会归零）：归零不是倒退，
 * 它只是新的一趟航程从 0 开始。
 */

/** 一昼夜多少秒（实时）。8 分钟：看得出在走，又不会让人以为要赶时间 */
export const DAY_CYCLE_SEC = 480
/** 一趟完整航程额外把太阳往前推多少（0~1 个昼夜） */
export const VOYAGE_SUN_PUSH = 0.35
/** 起始日相：0.18 ≈ 上午，开局第一眼是亮的 */
const START_PHASE = 0.18

/** 模块级：起点时刻与累计的航程推力 */
let t0 = 0
let sunPush = 0
let lastProgress = 0

/** 测试/热更新用：把时钟归零 */
export function resetSkyClock(nowMs = 0): void {
  t0 = nowMs
  sunPush = 0
  lastProgress = 0
}

export interface SkyInfo {
  /** 0~1 的日相：0.25 = 正午，0.75 = 深夜 */
  phase: number
  /** 日照强度 0~1（1 = 正午） */
  lit: number
  /** 夜色程度 0~1（1 = 深夜），渲染侧直接用这个 */
  night: number
}

/**
 * 当前天时。
 *
 * @param nowMs performance.now()（两个视图传同一个来源即可对齐）
 * @param routeProgress 当前航程进度 0~1（停泊时通常是 0）
 */
export function skyAt(nowMs: number, routeProgress = 0): SkyInfo {
  if (t0 === 0) t0 = nowMs
  const p = Number.isFinite(routeProgress) ? Math.max(0, Math.min(1, routeProgress)) : 0
  if (p > lastProgress) {
    sunPush += (p - lastProgress) * VOYAGE_SUN_PUSH
  }
  lastProgress = p
  let phase = ((nowMs - t0) / 1000 / DAY_CYCLE_SEC + START_PHASE + sunPush) % 1
  if (phase < 0) phase += 1
  const lit = 0.5 + 0.5 * Math.sin(phase * Math.PI * 2)
  return { phase, lit, night: 1 - lit }
}
