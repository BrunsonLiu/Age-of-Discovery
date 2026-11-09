import { mercNorm } from '@/utils/mapProjection'

/**
 * 海岸的**接触阴影**：沿着海岸线往陆地内侧压一道很淡的暗带。
 *
 * 【解决什么】陆地是一块"厚板"：顶面米黄、侧壁深褐、海岸压一条墨线。
 * 中景看过去，顶面与侧壁的交界只有一条 1.5px 的线——读作"印上去的轮廓"，
 * 而不是"一块有厚度的东西压在水上"。真实的浮雕/沙盘里，海岸线上方总有一道
 * 由侧壁投下的浅影，正是它把"平面"读成"实体"。
 *
 * 【为什么画进贴图，而不是加几何或打光】几何已经在上一轮试过（局部高度场，
 * 必然露接缝）；靠灯光更不行——侧壁是不受光材质，主光再斜也照不出接触影。
 * 贴图里画一道渐变是零成本、零接缝的：它跟着海岸线走，也随冰盖重绘一起更新。
 *
 * 【为什么用模糊描边而不是距离场】距离场是 0.35°/格（39 公里），
 * 在当前这个贴图尺寸下会把本该 3~6px 的影带糊成 20px 的一圈灰。
 * 描边 + 模糊是按像素来的，宽度可控。
 *
 * 只画在**陆地内侧**：用 `source-atop`，海上那一半自动被裁掉。
 */

/*
 * 实测（.workbuddy/probe-shade-count.mjs，把合成后的陆地图与原图逐像素比，
 * 只统计 |lat|<50 的陆地）：影带覆盖 **20.0%** 的陆地像素，
 * 覆盖处的亮度平均下降 **11.6/255**（≈4.5%）。这个量级看得出来"有厚度"，
 * 但不会与海岸墨线抢戏。
 */

/** 影带宽度（画布像素，1024 宽的海图 = 0.35°/px 量级） */
const SHADE_WIDTH_PX = 9
/** 模糊半径：让影带有一个从 0 渐深的过渡，而不是一条带子 */
const SHADE_BLUR_PX = 3
/** 影的最大不透明度：再深就会与海岸墨线抢戏 */
const SHADE_ALPHA = 0.2

type Ring = [number, number][]
interface PolyFeature {
  geometry?: { type: string; coordinates: unknown }
}

/**
 * 在陆地画布上压一道海岸接触影。
 *
 * 调用方负责：先画陆地贴图、再调用本函数（内部只用 `source-atop`，
 * 不会画到海上去）、最后把 texture.needsUpdate 置 true。
 */
export function paintCoastShade(
  ctx: CanvasRenderingContext2D,
  geojson: unknown,
  w: number,
  h: number,
): void {
  const feats = (geojson as { features?: PolyFeature[] })?.features
  if (!Array.isArray(feats) || !feats.length) return

  ctx.save()
  // 只作用在已有内容（陆地）上：海上那一半描边会被裁掉
  ctx.globalCompositeOperation = 'source-atop'
  ctx.strokeStyle = `rgba(52,36,16,${SHADE_ALPHA})`
  ctx.lineWidth = SHADE_WIDTH_PX
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  // 模糊让影带没有硬边（Edge 支持 canvas filter；不支持时退化成硬描边，仍可用）
  try { ctx.filter = `blur(${SHADE_BLUR_PX}px)` } catch { /* 老浏览器忽略 */ }

  ctx.beginPath()
  for (const f of feats) {
    const geom = f.geometry
    if (!geom) continue
    const polys: unknown[] = geom.type === 'Polygon'
      ? [geom.coordinates]
      : geom.type === 'MultiPolygon'
        ? (geom.coordinates as unknown[])
        : []
    for (const poly of polys) {
      for (const ring of poly as Ring[]) {
        if (!Array.isArray(ring) || ring.length < 3) continue
        for (let i = 0; i < ring.length; i++) {
          const [lng, lat] = ring[i]
          const x = ((lng + 180) / 360) * w
          const y = mercNorm(lat) * h
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
      }
    }
  }
  ctx.stroke()
  ctx.restore()
}
