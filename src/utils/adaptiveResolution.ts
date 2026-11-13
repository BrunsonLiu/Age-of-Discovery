/**
 * 3D 视图的自适应渲染分辨率。
 *
 * 【为什么要做】
 * 实测本机（Intel UHD 630 核显，1440×900）3D 帧间隔中位 27.2ms ≈ 37fps，
 * 而 2D 是 16.7ms。消融实验证明成本大头不是陆地几何（全隐藏只回 11ms），
 * 而是**每像素的着色开销**——也就是分辨率直接决定了帧率。
 *
 * 而 `setPixelRatio(min(devicePixelRatio, 1.5))` 是写死的：
 * 在 2 倍屏上等于渲染 2.25 倍像素，同一台机器从 37fps 掉到 20fps 以下。
 * 玩家不会去调设置，只会觉得「切到 3D 就卡」。
 *
 * 【为什么只降不升】
 * 升降都会让画面清晰度突变（一次可见的"糊一下"）。如果按帧时反复判断，
 * 在 24ms 阈值附近会来回切，比一直低分辨率更难受。
 * 所以策略是：慢就降一档，降下去**不再自动回升**——
 * 宁可这一次会话糊一点，也不要画面反复抖动。
 * （重启视图 / 重新进入 3D 时会从默认值重新判断，所以不是永久的。）
 *
 * 【为什么看中位数而不是平均】
 * 单帧尖峰（GC、贴图上传、切标签页回来）会把平均拉高，
 * 但玩家感受到的是"大部分时候卡不卡"。
 */

import type { QualityLevel } from './quality'

/**
 * 每档的步长。
 *
 * 【为什么是 0.5 而不是 0.25】
 * 0.25 会让 1.5 走成 1.5 → 1.25 → 1.0。实测 1.25 那一档的帧时约 33ms，
 * **仍然超过 24ms 阈值**，所以它几乎总是立刻继续降到 1.0——
 * 玩家白白看到两次画面变糊，中间那档没有任何停留价值。
 * 一步降到 1.0 只变糊一次。（1.5 → 1.0 = 像素数降到 44%。）
 */
export const PIXEL_RATIO_STEP = 0.5

/** 帧间隔超过这个值就算"掉帧"（24ms ≈ 42fps，是 60fps 明显可感的门槛）。 */
export const SLOW_FRAME_MS = 24

/** 样本不足时不决策：至少要看这么多帧，否则一次加载抖动就会误判。 */
export const MIN_SAMPLES = 30

/**
 * 根据最近若干帧的间隔，决定要不要降渲染分辨率。
 *
 * @param current  当前 pixelRatio
 * @param frameMs  最近若干帧的帧间隔（毫秒，顺序无关）
 * @param minRatio 下限（通常 1：再低会明显模糊）
 * @returns 新的 pixelRatio；`null` 表示维持不变
 */
export function decidePixelRatio(
  current: number,
  frameMs: readonly number[],
  minRatio = 1,
): number | null {
  // 已经到下限，或者本来就不需要降
  if (!(current > minRatio)) return null
  if (frameMs.length < MIN_SAMPLES) return null

  // 中位数：排序取中间。样本量固定为几十个，拷贝+排序的成本可以忽略
  // （每 40 帧才调一次，不是每帧）。
  const sorted = [...frameMs].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]

  if (!(median > SLOW_FRAME_MS)) return null

  // 一次只降一档：降太多会直接糊成一片，而慢的原因可能是暂时的
  const next = Math.max(minRatio, Math.round((current - PIXEL_RATIO_STEP) * 100) / 100)
  return next < current ? next : null
}

/**
 * 分辨率已经降到底、帧间隔还是慢 —— 该不该再降一档**画质预设**？
 *
 * 【为什么要有第二道防线】`decidePixelRatio` 只能把内部分辨率压到
 * `preset.minScale`（0.62~0.78）。压到底之后，剩下的成本与像素无关：
 * bloom、FXAA、颗粒、装饰层（压顶石/货堆/屋脊）、阴影 pass —— 这些在
 * 1280×800 的核显上照样能吃掉 10ms 以上。此时唯一还能动的杠杆是预设本身。
 *
 * 【为什么要求"到下限"才判】分辨率还没降到底就先降画质，等于把观感
 * （多余细节消失）换成了本来还能通过"糊一点"避免的流畅度 —— 顺序反了。
 *
 * 【为什么用 p75 而不是中位数】中位数在"一半帧好一半帧烂"时是好的，
 * 但玩家对这种交替特别敏感（一卡一顺比稳定 40fps 更难受）。取 75 分位
 * 会让"每四帧卡一次"也触发降档。
 *
 * @param current     当前画质档位
 * @param frameMs     最近若干帧的帧间隔（毫秒）
 * @param atMinScale  内部渲染分辨率是否已经降到该档下限
 * @returns 建议降到的档位；`null` 表示维持不变（已在最低档 / 样本不足 / 并不慢）
 */
export function decideQualityDowngrade(
  current: QualityLevel,
  frameMs: readonly number[],
  atMinScale: boolean,
): QualityLevel | null {
  if (!atMinScale) return null
  if (current === 'low') return null
  if (frameMs.length < MIN_SAMPLES) return null

  const sorted = [...frameMs].sort((a, b) => a - b)
  const p75 = sorted[Math.floor(sorted.length * 0.75)]
  // 比 decidePixelRatio 的 24ms 更宽：分辨率已经糊了还卡，说明是真跑不动，
  // 但也要留一点余量，别因为一次 GC 就把玩家的画质降掉。
  if (!(p75 > SLOW_FRAME_MS + 8)) return null

  return current === 'high' ? 'mid' : 'low'
}
