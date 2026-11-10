import { shipDeckAt, shipHalfWidthAt } from './shipModel'

/**
 * 甲板行走的几何与移动（纯函数，可单测）。
 *
 * 【坐标全是**船模型的局部单位**（1 单位 = 1 米）】船模型半长 18、船宽 10，
 * 也就是一艘 36 米长、10 米宽的船；`deckAt(0) ≈ 1.32` 米是甲板高度。
 * 相机位置最后乘 `SHIP_SCALE`(0.05) 才是世界坐标。
 *
 * 【为什么不能在场景的世界单位里写】世界单位里船的半长只有 0.9、甲板高 0.066，
 * 而"人眼 1.7 米"在这个尺度下是 0.085 —— 稍不留神把米当成世界单位写进去，
 * 人就会比桅杆还高（20 倍）。全部用模型单位（= 米）最不容易错。
 */

/** 人眼高度（米） */
export const EYE_HEIGHT_M = 1.7
/** 步行速度（米/秒）—— 真人 1.4，游戏里给 2.4 才不觉得在挪 */
export const WALK_SPEED_M = 2.4
/** 玩家半径（米），与对方 walk.js 同一个值 */
export const WALK_RADIUS_M = 0.32

/** 船首，再往前是收窄的尖头，走不过去 */
const BOW_LIMIT = 15.2
/** 船尾楼前沿（模型坐标 z）；再往船尾是有楼的上层，甲板行走不进 */
const STERN_LIMIT = -12.4

/** 桅杆位置（模型坐标 z）与半径 */
const MASTS: { z: number; r: number }[] = [
  { z: 11, r: 1.15 },
  { z: 1, r: 1.15 },
  { z: -8, r: 1.0 },
]

/** 甲板高度（米，含人眼） */
export function deckEyeY(zModel: number): number {
  return shipDeckAt(zModel) + EYE_HEIGHT_M
}

/** 某处甲板的可行走半宽（米），已扣掉玩家半径与舷墙 */
export function deckWalkHalfWidth(zModel: number): number {
  // 0.86：舷墙内侧还有一根护栏，站太边上会穿模
  return Math.max(0, shipHalfWidthAt(zModel) * 0.86 - WALK_RADIUS_M)
}

export interface WalkPos {
  x: number
  z: number
}

/**
 * 把位置约束到甲板内的合法区域。
 *
 * 【为什么分轴而不是整体钳】整体钳到矩形会把船首的尖形区域变成方角，
 * 玩家能走到"船体外面"。这里先按 z 求该处半宽，再单独钳 x —— 于是
 * 可走区域天然是船体的轮廓。
 */
export function clampToDeck(x: number, z: number): WalkPos {
  const cz = Math.min(BOW_LIMIT, Math.max(STERN_LIMIT, z))
  const halfW = deckWalkHalfWidth(cz)
  return { x: Math.min(halfW, Math.max(-halfW, x)), z: cz }
}

/**
 * 一步移动：分轴推进 + 桅杆推离。
 *
 * 【为什么要推离而不是挡住】三根桅杆在甲板正中，挡死的话玩家会被卡住，
 * 只能后退重走。推到圆周上（沿切向滑动）才走得动。
 */
export function stepWalk(from: WalkPos, dx: number, dz: number): WalkPos {
  let x = from.x + dx
  let z = from.z + dz

  // 桅杆：进入半径就沿径向推到边缘
  for (const m of MASTS) {
    const mz = m.z
    const r = m.r + WALK_RADIUS_M
    const ddx = x - 0
    const ddz = z - mz
    const d = Math.hypot(ddx, ddz)
    if (d < r && d > 1e-9) {
      x = (ddx / d) * r
      z = mz + (ddz / d) * r
    } else if (d <= 1e-9) {
      // 正好站在桅杆中心（理论上不会发生）：往船尾推一点
      z = mz - r
    }
  }

  return clampToDeck(x, z)
}

/** 判断某点是否站在甲板上（调试与单测用） */
export function isOnDeck(x: number, z: number): boolean {
  if (z > BOW_LIMIT || z < STERN_LIMIT) return false
  return Math.abs(x) <= deckWalkHalfWidth(z)
}
