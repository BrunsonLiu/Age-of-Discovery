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
