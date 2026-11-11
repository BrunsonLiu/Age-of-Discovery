/**
 * 甲板上的牲口栏（livestock pen）：位置、尺寸、以及"栏里有几只"的规则。
 *
 * 【为什么值得做】真实商船会带几只活羊/鸡上船——现挤的奶和鲜蛋是坏血病的解药。
 * 但这条船真正需要它的理由在**画面上**：甲板上原本只有木桶（死的）、货舱口（洞）
 * 与缆桩（死的），活物只有三个水手。一个会随补给变化的栏子，让"粮"这个数字
 * 在画面里第一次有实体 —— 粮快见底时栏子空了，玩家不用看 HUD 也知道该靠港了。
 *
 * 【为什么它必须进"行走碰撞"】与甲板小艇同一个道理：摆在腰部的一块 2.2×2.6 米
 * 的围栏，玩家会直接穿过去。模型在而世界是空的，比不放更糟。
 *
 * 单位：模型米（船体局部系）。
 */

export const PEN = {
  /** 右舷腰部，货舱口与小艇的对侧 */
  x: 2.85,
  z: 2.6,
  halfX: 1.1,
  halfZ: 1.3,
  /** 栏板高度 */
  height: 0.78,
} as const

/** 栏子的占位（轴对齐矩形，与甲板小艇同一套推离） */
export function penObstacle(): { minX: number; maxX: number; minZ: number; maxZ: number } {
  return {
    minX: PEN.x - PEN.halfX,
    maxX: PEN.x + PEN.halfX,
    minZ: PEN.z - PEN.halfZ,
    maxZ: PEN.z + PEN.halfZ,
  }
}

/**
 * 栏里还有几只羊（0..3）。
 *
 * 【为什么按"粮"分档而不是按天数】`fleet.food` 是这一局里唯一代表"船上还有多少
 * 吃的"的数（消耗由 `calculateDailyConsumption` 从船员数算）。活畜是**最先被吃掉**
 * 的那一批，所以档位故意设得偏低：粮 20 以上才是满栏，掉到 4 以下就空了 ——
 * 于是"栏子空了"永远比"粮见底"早一点点出现，正好当预警。
 *
 * 返回的是**整数只数**：屏幕上站着几只羊必须等于算出来的数，不能"大概是两三只"。
 */
export function penLivestock(food: number): number {
  if (!Number.isFinite(food) || food <= 0) return 0
  if (food >= 20) return 3
  if (food >= 10) return 2
  if (food >= 4) return 1
  return 0
}

/** 三只羊在栏里的站位（相对栏心，米）：不能重叠、不能贴着栏板 */
export const PEN_SPOTS: readonly { dx: number; dz: number; yaw: number }[] = [
  { dx: -0.42, dz: -0.45, yaw: 0.5 },
  { dx: 0.4, dz: 0.1, yaw: -1.1 },
  { dx: -0.3, dz: 0.62, yaw: 1.9 },
]
