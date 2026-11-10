/**
 * 船体形状：**唯一来源**。船壳放样、甲板、甲板行走的边界都从这三个函数取。
 *
 * 【为什么单独一个文件】放样几何要在没有 canvas / WebGL 的环境里被测到
 * （`shipHull.ts` 只吐纯数组），而形状函数原先和贴图生成混在 `shipModel.ts` 里，
 * 单测一 import 就会碰到 canvas。这里只放数字与公式，不碰 three。
 *
 * 单位是**模型米**：半长 18（总长 36）、船宽 10。调用方整体缩到场景里
 * （`SHIP_SCALE` 0.05 → 总长 1.8 世界单位）。
 */
const HALF = 18
const BEAM = 10

/** 船模型 → 世界单位的统一缩放（甲板行走要用它换算人眼高度与步速） */
export const SHIP_SCALE = 0.05
/** 放样站位（沿船长方向的分段数） */
export const HULL_STATIONS = 30
/** 每个横截面圆弧的段数 */
export const HULL_ARC = 10
/**
 * 船的"吃水抬升"（世界单位）：模型的水线在 y=0、甲板只有 1.32 模型米高，
 * 相当于 36 米长的船只有 1.3 米干舷 —— 而涌浪是 ±0.13 世界单位，浪峰一过就
 * 盖住甲板。抬 0.12（= 2.4 模型米 ≈ 4 米干舷）才符合真实比例。
 * 甲板行走的相机跟着船走，所以只要这一处改，站位与画面一起对。
 */
export const SHIP_DRAFT_LIFT = 0.12

/** 舷墙高度（甲板面往上） */
export const HULL_BULWARK = 0.95
/** 半长 / 船宽，供几何与测试共用 */
export const SHIP_HALF_LENGTH = HALF
export const SHIP_BEAM = BEAM

/** 某站位处船体的半宽（船首收得比船尾快） */
export function shipHalfWidthAt(z: number): number {
  const t = Math.min(1, Math.abs(z) / HALF)
  return z > 0
    ? (BEAM / 2) * (1 - 0.78 * Math.pow(t, 2.6))
    : (BEAM / 2) * (1 - 0.42 * Math.pow(t, 1.9))
}

/** 某站位处龙骨深度（水线往下） */
export function shipKeelAt(z: number): number {
  const t = Math.min(1, Math.abs(z) / HALF)
  return z > 0 ? 3.1 * (1 - 0.62 * Math.pow(t, 1.35)) : 3.1 * (1 - 0.28 * Math.pow(t, 1.5))
}

/** 某站位处甲板面高度（有舷弧：船首尾比船中高） */
export function shipDeckAt(z: number): number {
  const t = Math.min(1, Math.abs(z) / HALF)
  return 1.32 + 0.62 * Math.pow(t, 2.4)
}

/** 某站位处甲板半宽（甲板比船壳窄一点，留出舷墙厚度） */
export function shipDeckHalfWidthAt(z: number): number {
  return shipHalfWidthAt(z) * 0.94
}
