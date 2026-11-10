/**
 * 甲板上的水手：站位、人数规则。
 *
 * 【为什么是纯数据 + 纯函数】人数必须由**真实的船员数**决定（屏幕上的人和
 * `fleet.ships[].crew` 必须是同一件事），站位要能被单测验（不能站在舷墙外、
 * 不能挡住舱口与舵轮、不能站在桅杆里面）。渲染（three 的几何与动画）在 shipModel。
 */

export type SailorKind = 'helm' | 'hatch' | 'bow'

export interface SailorStation {
  /** 模型米坐标（船的局部系，与 shipModel 其余部分一致） */
  x: number
  z: number
  /** 朝向：0 = 面向船首（+z） */
  yaw: number
  kind: SailorKind
  /** 站立时的轻微摇晃相位（每人不同，否则三个人像连体一起晃） */
  phase: number
}

/**
 * 三个站位：舵轮旁、货舱口旁、船首。
 *
 * 【为什么是这三处】它们是这条船上**真的有活**的地方，而且各自给玩家一个
 * "该干点什么"的暗示：舵轮对应航向、舱口对应载货、船首对应前方（陆地/天气）。
 * 三个位置也分散在船的前中后，从甲板上任何一档机位看过去都有一个人入画。
 */
export const SAILOR_STATIONS: readonly SailorStation[] = [
  // 舵轮：站在轮盘的**后方偏右**（z 更负 = 更靠船尾），面朝船首 ——
  // 掌舵的人看着前方，不是看着轮子；而且他必须站在轮盘与船尾楼之间那条 1.1 米的缝里
  { x: 1.15, z: -11.9, yaw: 0.12, kind: 'helm', phase: 0.0 },
  // 货舱口：蹲在格栅左舷侧（舱口中心 x=0.4、半宽 1.5，所以站到 2.3 才不压住格栅）
  { x: 2.35, z: 5.4, yaw: -1.15, kind: 'hatch', phase: 2.1 },
  // 船首：靠左舷，望着前方
  { x: -0.9, z: 14.0, yaw: 0.05, kind: 'bow', phase: 4.3 },
]

/**
 * 甲板上该有几个水手。
 *
 * 【三段阈值，而不是"按比例四舍五入"】船员 8 人是小船的下限、40 人是大船：
 * 用比例算的话，一条 8 人船永远只有 1 个人站在甲板上，而 40 人船会站满 ——
 * 看起来都一样"少"。按绝对人数分档更符合直觉：**甲板上总得有人**，船越大越多。
 *
 * 返回 0 的情况只有一种：船上真没人了（`crew <= 0`）—— 那时候一条空船飘在海上，
 * 比什么都说明问题，不应该还站着一个水手。
 */
export function sailorCount(crew: number): number {
  if (!Number.isFinite(crew) || crew <= 0) return 0
  if (crew < 8) return 1
  if (crew < 20) return 2
  return 3
}
