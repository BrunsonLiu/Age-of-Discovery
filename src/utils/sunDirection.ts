/**
 * 主光（太阳）的方向：随**日相**摆动、随**航季**升降。
 *
 * 【为什么需要】主光原来钉死在 (-9, 6, 6)：太阳不动。于是
 *   · 一整天里地图的地势明暗完全一样，只有亮度在变——不像太阳，像调光台；
 *   · 季节对光照毫无影响（只有海色/陆色/雪线在变），"冬天"缺一条最直觉的线索。
 * 真实的船队看天：晨光从东边来、下午从西边来、冬天太阳更低、影子更长。
 *
 * 【为什么只摆 ±35°，而不是让太阳绕一圈】这是俯视的海图，不是天空。
 * 让光源一天转 360° 会让整张地图的地势明暗**旋转**，读起来像地图在转，
 * 而不是时间在走。±35° 的摆动足够让港口影子偏向、让山脊的亮面换边，
 * 又不会破坏"纸面稳定"的观感。
 *
 * 【南北半球的季节不能同时正确】全局只有一盏主光，而南北半球的冬天相反。
 * 这里按**北半球**的日历升降（与雪线的主体一致），不假装两个半球都成立。
 */

/**
 * 整段日相（0..1）里太阳摆动的总角度。
 * 日出到日落（0.25→0.75）只走一半：±SUN_SWING_DEG/4。
 */
export const SUN_SWING_DEG = 70

/** 各航季的太阳高度系数（春/夏/秋/冬）：夏天高、冬天低 */
const SEASON_ALTITUDE = [0.95, 1.12, 0.9, 0.72]

/** 基准方向：与原来钉死的 (-9, 6, 6) 同一个朝向，摆动以它为中心 */
const BASE = (() => {
  const l = Math.hypot(-9, 6, 6)
  return { x: -9 / l, y: 6 / l, z: 6 / l }
})()

/**
 * 太阳方向（单位向量，指向**太阳所在的方向**）。
 *
 * @param phase 日相 0..1（0.5 是正午）
 * @param seasonIdx 0..3
 */
export function sunDirection(phase: number, seasonIdx: number): { x: number; y: number; z: number } {
  const p = Number.isFinite(phase) ? phase : 0.5
  const si = Number.isFinite(seasonIdx) ? Math.min(3, Math.max(0, Math.round(seasonIdx))) : 1
  // 绕 Y 轴摆：正午时在中位，清晨与黄昏各偏一侧
  const swing = ((p - 0.5) * SUN_SWING_DEG * Math.PI) / 180
  const cos = Math.cos(swing)
  const sin = Math.sin(swing)
  const x = BASE.x * cos - BASE.z * sin
  const z = BASE.x * sin + BASE.z * cos
  const y = BASE.y * SEASON_ALTITUDE[si]
  const len = Math.hypot(x, y, z) || 1
  return { x: x / len, y: y / len, z: z / len }
}
