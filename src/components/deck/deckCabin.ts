import { shipDeckAt } from './shipModel'
import { EYE_HEIGHT_M, type WalkPos } from './deckWalk'

/**
 * 船长室（船尾楼内部）的可行走区域与进出机位。
 *
 * 【为什么单独一个模块】舱内是一个**矩形房间**，而甲板是"船体轮廓"（按 z 求半宽）。
 * 两套约束混在一个函数里，改一处就会让另一处漏。这里只留舱内的矩形，
 * 与 `deckWalk` 的甲板规则并列，两边各自可单测。
 *
 * 坐标是船模型局部的**米**（与 deckWalk 同一套）。船尾楼：中心 z=−14.6、
 * 进深 5.2、宽 6.6、高 2.7，底面坐在 `shipDeckAt(−15)` 上。
 */

/** 船尾楼内部的地面高度（米）—— 楼底就是甲板面 */
export function cabinFloorY(): number {
  return shipDeckAt(-15)
}

/** 舱内的人眼高度（米） */
export function cabinEyeY(): number {
  return cabinFloorY() + EYE_HEIGHT_M
}

/** 房间内壁（米）。留 0.4 的余量：玩家半径 0.32，再留一点，贴墙时不会穿进木板 */
export const CABIN_BOUNDS = {
  /*
   * 内宽 5.6（半宽 2.8）而不是船体在船尾的半宽：舱是**船壳里的一间木屋**，
   * 它比船壳窄 —— 用 3.3 会让玩家能走进船壳木板与舱壁之间的缝里。
   */
  minX: -2.8 + 0.4,
  maxX: 2.8 - 0.4,
  minZ: -17.2 + 0.4,
  maxZ: -12.0 - 0.4,
} as const

/** 舱门所在的墙（船尾楼前壁，米） */
export const CABIN_DOOR_Z = -12.0

/**
 * 进门那一刻的机位：门内一步、面朝舱里（−z）。
 * 站得太靠门会在进门瞬间又点到门（指针还停在门的投影位置上），所以往里走 1.2 米。
 */
export const CABIN_ENTER = { x: 0, z: -13.2, yaw: Math.PI, pitch: -0.04 } as const
/** 出门那一刻的机位：门外一步、面朝船首（+z） */
export const CABIN_EXIT = { x: 0, z: -11.1, yaw: 0, pitch: -0.06 } as const

/** 把位置钳进房间矩形 */
export function clampToCabin(x: number, z: number): WalkPos {
  return {
    x: Math.min(CABIN_BOUNDS.maxX, Math.max(CABIN_BOUNDS.minX, x)),
    z: Math.min(CABIN_BOUNDS.maxZ, Math.max(CABIN_BOUNDS.minZ, z)),
  }
}

/**
 * 舱内走一步。
 *
 * 【为什么不做"圆角"】舱里没有桅杆，只有四面墙；矩形钳制就是全部规则。
 * 家具（桌子/床/箱子）**不挡人** —— 它们占的地方本来就不大，而"被桌子卡住"是
 * 一种纯粹的挫败感，不值得。
 */
export function stepInCabin(from: WalkPos, dx: number, dz: number): WalkPos {
  return clampToCabin(from.x + dx, from.z + dz)
}

/** 判断某点是否在舱内（调试与单测用） */
export function isInCabin(x: number, z: number): boolean {
  return x >= CABIN_BOUNDS.minX && x <= CABIN_BOUNDS.maxX
    && z >= CABIN_BOUNDS.minZ && z <= CABIN_BOUNDS.maxZ
}
