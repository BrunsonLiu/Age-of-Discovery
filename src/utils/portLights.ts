/**
 * 港口灯火的规则（纯函数，不碰 three）。
 *
 * 【为什么需要】夜里的 3D 海图目前是**全黑的一张图**：陆地暗下去、海面暗下去，
 * 港口与白天一模一样，只是变暗。真实的夜航海图上，海岸线是**一串灯**画出来的
 * ——那是整张图里唯一"有人"的证据。没有它，夜晚读作"服务器没加载完"。
 *
 * 【为什么用灯位而不是给房屋加自发光】房屋材质在 20 个港之间共用
 * （`createPortModelKit` 只造一份），改自发光等于让所有房子同时亮，
 * 而且亮的是"整面墙"——读起来像荧光板，不像窗。灯位是点，可以一处一处点。
 *
 * 【为什么规则放在这里】models.ts 引了 three.js，从单测里 import 它要拉整个
 * three + DOM（canvas 贴图）进 node。数量规则抽出来，两边都能用：
 * 建模侧按它决定摆几盏、单测按它断言"小补给站也得有一盏"。
 */

import type { PortScale } from './portScale'

/** 灯的种类：决定尺寸、颜色与叠加强度 */
export type PortLightKind =
  /** 窗：房子的前脸，最小、偏白 */
  | 'window'
  /** 码头灯：挂在旗杆上，暖黄、中等 */
  | 'lantern'
  /** 塔顶信标：只有大港有，最大最亮（远看就是"这里有港"） */
  | 'beacon'
  /**
   * 港口的暖光池：一大团很淡的光，落在整个港口上。
   *
   * 【为什么小的灯点不够】远景（全球视角）每个港只有 2~5 个像素，
   * 一个点读不出来"这里有个港"，只像屏幕上的脏点。一团 0.16 世界单位的
   * 暖光是 9px 左右的一片，远景才读得出"海岸上有一处亮"。
   */
  | 'halo'

export interface PortLightPlan {
  /** 暖光池：每个港一盏，夜景里"哪里有港"靠它 */
  halo: number
  /** 亮着的窗数（等于房屋数） */
  windows: number
  /** 码头灯数（每条有旗的港都至少一盏） */
  lanterns: number
  /** 塔顶信标数（0 或 1） */
  beacons: number
}

/**
 * 一个港摆几盏灯。数量跟着**规模**走，与建筑数量同一套判据（`portScaleOf`）。
 *
 * 【为什么小补给站也要有一盏】夜里 20 个港只有 8 个大港亮，中/小港是纯黑点，
 * 玩家会以为那些港不存在。一盏码头灯就能把"这里有个落脚点"讲清楚，
 * 而它只花一个顶点。
 */
export function portLightPlan(scale: PortScale): PortLightPlan {
  if (scale === 'major') return { halo: 1, windows: 4, lanterns: 2, beacons: 1 }
  if (scale === 'medium') return { halo: 1, windows: 2, lanterns: 1, beacons: 0 }
  return { halo: 1, windows: 1, lanterns: 1, beacons: 0 }
}

/**
 * 夜色到多深时灯才亮（0 = 全灭，1 = 全亮）。
 *
 * 【为什么不是"天黑就亮"】日落那一刻整张图同时点亮，读起来像一个开关。
 * 天还亮着的时候港口本来也该有几盏灯——但在这张图的亮度下看不出来，
 * 所以从 lit=0.65 才开始起亮、到 0.18 全亮，正好覆盖黄昏那一段。
 *
 * 参数约定与 `surfaceDimMul` 一致：`lit` 1 = 正午、0 = 深夜。
 */
export function portLightStrength(lit: number): number {
  if (!Number.isFinite(lit)) return 0
  const l = Math.min(1, Math.max(0, lit))
  const t = (0.65 - l) / (0.65 - 0.18)
  if (t <= 0) return 0
  if (t >= 1) return 1
  // 3t²-2t³：两端导数为 0，点亮过程不会在开头/结尾"顿一下"
  return t * t * (3 - 2 * t)
}

/**
 * 三种灯的视觉参数（世界单位；1 单位 ≈ 2000 公里，与港口模型同一把尺）。
 *
 * 【颜色分量为什么大于 1】这些点是**叠加混合**画的，而整张图过了 ACES 色调映射：
 * 颜色 1.0 的光点映射完只剩 0.8 左右，落在夜里深蓝的海面上就是一团灰。
 * 真实的灯在暗处是「过曝的一小点」——只有让像素值超出 1，色调映射才会把它
 * 压成发白的核心（1.0 附近的中间调会被压暗，而不是提亮）。
 * `THREE.Color` 允许分量大于 1，这里就靠它做 HDR 的核心。
 */
export interface PortLightLook {
  size: number
  /** [r, g, b]，分量可大于 1（见上面） */
  rgb: [number, number, number]
  alpha: number
}

/*
 * 下面是**世界尺寸**（1 单位 ≈ 2000 公里），交给 pointSizeForWorld 换算。
 * 近景 ≈408px/单位、远景 ≈55px/单位：
 *   窗 0.026 → 11px / 1.4px
 *   码头灯 0.06 → 24px / 3.3px
 *   信标 0.1 → 41px / 5.5px
 *   暖光池 0.17 → 69px / 9.4px
 * 远景只该看到一串小点，近景才看得清"窗 / 灯 / 塔顶信标"。
 */
export const PORT_LIGHT_LOOK: Record<PortLightKind, PortLightLook> = {
  window: { size: 0.026, rgb: [1.5, 1.15, 0.72], alpha: 0.9 },
  lantern: { size: 0.055, rgb: [1.95, 1.32, 0.66], alpha: 0.95 },
  beacon: { size: 0.075, rgb: [2.0, 1.42, 0.78], alpha: 1 },
  // 暖光池：面积大、强度低。它的作用不是"看见一盏灯"，而是"这片海岸是暖的"
  halo: { size: 0.19, rgb: [1.3, 0.82, 0.38], alpha: 0.38 },
}

/**
 * 把「世界尺寸」换算成 PointsMaterial 的 size。
 *
 * 【为什么需要换算】`PointsMaterial` 在透视相机里算的是
 *   `gl_PointSize = size · (H/2) / d`
 * 而世界尺寸到屏幕像素是
 *   `px = worldSize · H / (2·tan(fov/2) · d)`
 * 两者差一个 `tan(fov/2)`：**按世界尺寸填 size，画出来会小 2.9 倍**
 * （fov=38° 时）。第一版就踩了这个坑：0.1 的信标在近景只有 13px，
 * 4 倍放大才认得出是个灯。
 */
export function pointSizeForWorld(worldSize: number, fovDeg: number): number {
  if (!Number.isFinite(worldSize) || !Number.isFinite(fovDeg)) return 0
  const t = Math.tan((fovDeg * Math.PI) / 360)
  if (!(t > 0)) return worldSize
  return worldSize / t
}

/** 绘制顺序：光池先、灯点后（叠加混合下顺序不影响结果，只影响可读性调试） */
export const PORT_LIGHT_DRAW_ORDER: PortLightKind[] = ['halo', 'window', 'lantern', 'beacon']
