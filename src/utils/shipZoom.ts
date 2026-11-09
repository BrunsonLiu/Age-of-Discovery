/**
 * 3D 里"船随相机距离缩放"的唯一一条曲线。
 *
 * 【为什么需要缩放】拉到近景（dist≈3）时，船就在相机注视点正中心，
 * 实测占屏 **54.5%**，把港口整块压住——刚做出来的三档港口辨识度
 * 在最该看清的距离上直接失效。所以近景必须让船让位。
 *
 * 【为什么要抽成函数】玩家座舰与 NPC 商船是两段代码（一个在船位段、
 * 一个在 NPC 段），原来只有前者乘了这条曲线：
 *   玩家船 `(docked?0.5:0.8) × nearK`，dist=4 时 = 0.5×0.5 = 0.25
 *   NPC    固定 0.72
 * 结果近景下**别人的商船比自己的座舰大 1.78 倍**（实测包围球 0.34 vs 0.49）。
 * 一条曲线写在两处就会这样分叉，所以收成一个函数，两边都调它。
 *
 * 曲线取 `dist/8`：8 以上完全不缩（远景本来就小，占屏 1.7%），
 * 到 dist=3 缩到 0.45。
 */
export const SHIP_NEAR_ZOOM_MIN = 0.45

export function shipNearZoomScale(camDist: number): number {
  if (!Number.isFinite(camDist)) return 1
  return Math.min(1, Math.max(SHIP_NEAR_ZOOM_MIN, camDist / 8))
}

/**
 * 远景也要收：`15/dist`，钳在 0.6 以上。
 *
 * 【为什么"远景不缩"是错的】原来的曲线到 dist=8 就封顶 1.0，看起来"远景不放大"，
 * 但线宽/模型尺寸都是世界单位——**相机拉远时物体在屏幕上反而变小**是常识，
 * 船却不缩，于是它在画面里的占比越来越大。实测 dist=15 时船长 ≈73px，
 * dist=26 时 ≈123px（占屏高 14%），比伊比利亚半岛还高，读作"四艘巨轮压着欧洲"。
 *
 * 0.6 的意思是：拉到最远时船在屏幕上仍和 dist=15 时差不多大（≈80px），
 * 也就是"它始终是个能点的标记"，而不是随地图一起缩成看不见的点。
 */
export const SHIP_FAR_ZOOM_MIN = 0.6
/** 这条曲线从哪个距离开始收（与近景曲线的分界） */
export const SHIP_FAR_START_DIST = 15

export function shipFarZoomScale(camDist: number): number {
  if (!Number.isFinite(camDist) || camDist <= SHIP_FAR_START_DIST) return 1
  return Math.max(SHIP_FAR_ZOOM_MIN, SHIP_FAR_START_DIST / camDist)
}

/** 近景让位 × 远景收敛：两段合成一条，座舰与 NPC 都调它 */
export function shipZoomScale(camDist: number): number {
  return shipNearZoomScale(camDist) * shipFarZoomScale(camDist)
}
