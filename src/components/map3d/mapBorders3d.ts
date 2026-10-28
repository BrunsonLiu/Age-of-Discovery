import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { lonToWorldX, latToWorldZ } from '@/utils/mapProjection'
import type { BordersGeoJson } from '@/utils/mapGeoJson'

/**
 * 2.5D 海图的国界线图层。
 *
 * 【为什么要有】
 * 2D 地图画了 borders.geojson（390 个要素的陆上国界），
 * 3D 里没有的话，玩家切视图就少了一层地理信息——
 * 大洲内部的政治分界在斜俯视下尤其有助于定位。
 *
 * 【与 2D 的差别是刻意的】
 * 2D 用 GeoJSON + Leaflet 的 SVG 描边（weight 0.6, dashArray '3 2'）。
 * 3D 用 LineSegments2（屏幕空间可调线宽 + 虚线），与洋流/风带同一套机制。
 *
 * 【为什么合成一个 mesh 而不是 393 个】
 * borders.geojson 有 393 段。逐段建 Line2 就是 393 个 draw call，
 * 在移动端会直接掉帧。LineSegmentsGeometry.setPositions() 接受
 * 「每段两个端点」交替的扁平数组，能把 393 段塞进**一个** geometry，
 * 一次 draw call 画完。
 *
 * 【高度】
 * 国界线画在陆地顶面（y=0）之上一点点。
 * 实测：国界 19859 个点里 19662 个（99.01%）在陆上，只有 197 个点在海上。
 * 那 197 个点在 3D 里会浮在海面上方 0.089——但它们本来就是
 * 争议边界/海上划界（实测 4 段整段在海上，如美加海上边界），
 * 浮在海面上反而符合"这条线画在海上"的语义。
 */
const BORDER_Y = 0.003

/** 国界线颜色：深褐，与 2D 的 '#7a5a30' 同族但更实一点（3D 底色更深） */
const BORDER_COLOR = 0x6b4a22

export interface Map3DBorders {
  /** 国界线 mesh */
  lines: LineSegments2
  /** 材质（需要随窗口尺寸更新 resolution） */
  material: LineMaterial
  dispose(): void
}

export function buildMap3DBorders(geojson: BordersGeoJson): Map3DBorders {
  // 收集所有线段的端点：[x1,y1,z1, x2,y2,z2, ...]
  const pos: number[] = []

  for (const f of geojson.features) {
    const g = f.geometry
    if (!g) continue
    // GeoJSON：LineString.coordinates = Position[]，MultiLineString.coordinates = LineString[]
    // 两者统一成「线的数组」
    const lines: number[][][] =
      g.type === 'LineString'
        ? [(g.coordinates as unknown as number[][])]
        : (g.type === 'MultiLineString' ? (g.coordinates as unknown as number[][][]) : [])

    for (const line of lines) {
      if (!line || line.length < 2) continue
      for (let i = 0; i + 1 < line.length; i++) {
        const a = line[i], b = line[i + 1]
        const ax = lonToWorldX(a[0]), az = latToWorldZ(a[1])
        const bx = lonToWorldX(b[0]), bz = latToWorldZ(b[1])
        // 跳过零长段：LineSegmentsGeometry 会算出 NaN 法线
        if (ax === bx && az === bz) continue
        pos.push(ax, BORDER_Y, az, bx, BORDER_Y, bz)
      }
    }
  }

  const geo = new LineSegmentsGeometry()
  geo.setPositions(pos)

  const material = new LineMaterial({
    color: BORDER_COLOR,
    linewidth: 1.1,
    transparent: true,
    opacity: 0.55,
    dashed: true,
    dashSize: 0.05,
    gapSize: 0.035,
    depthWrite: false,
  })

  const lines = new LineSegments2(geo, material)
  lines.name = 'map3d-borders'
  // 虚线必须显式算距离累积，否则 dashSize/gapSize 无效
  lines.computeLineDistances()
  lines.renderOrder = 3

  return {
    lines,
    material,
    dispose() {
      geo.dispose()
      material.dispose()
    },
  }
}
