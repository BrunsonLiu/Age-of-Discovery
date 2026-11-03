import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { COAST_COLOR, coastSegments, type LandGeoJsonLike } from '@/utils/chartLines'

/**
 * 2.5D 海图的海岸墨线（画的那一半；坐标在 utils/chartLines 里算）。
 *
 * 【为什么必须画】陆地调成羊皮纸调子之后，和一张真海图还差最后一步：
 * **没有线**。2D 的陆地是「奶油色填充 + #3d2810 深褐描边」，海岸是硬的；
 * 2.5D 只有贴图渐变到水色，海岸是软的 —— 4 倍放大看，从海岸到内陆是
 * 连续过渡，一根线都没有。这是"切视图像换了个游戏"最直接的来源。
 *
 * 【为什么直接复用 land.geojson，不再加 coastline.geojson】
 * 2D 那边已经量过：两者坐标 99.5% 重复，本质是同一份海岸线的两种表达。
 * 多一份 1.6MB 数据只为描边不值。
 *
 * 【为什么分「大陆 / 小岛」两条线】
 * 和 2D 的 landStyleFor 同一个判据（bbox 面积 0.3 度²）。1420 块陆地里
 * 60% 是十几公里宽的碎块，远景只有 2~3 个像素；给它们上 1.5px 深褐描边，
 * 整片海域会浮一层褐色杂点（2D 踩过）。但也不能不画 —— 小岛没有轮廓
 * 就是一坨土黄污点，正是本次要修的缺陷之一。
 * 所以两条各一次 draw call：大陆 1.5px / 0.85，小岛 1px / 0.5。
 *
 * 【高度】0.006，在陆地顶面（0）与国界线（0.003）之上。线有一半会压到
 * 海岸侧壁上 —— 那是想要的：真海图的墨线本来就是沿岸"渗"出去的，
 * 压在顶面反而像贴纸。
 */
const COAST_Y = 0.006

export interface Map3DCoastline {
  lines: LineSegments2[]
  materials: LineMaterial[]
  /** 海岸线段数（e2e 用来断言"线真的建出来了"，而不是只有一个空对象） */
  segments: number
  dispose(): void
}

function makeLines(pos: number[], width: number, opacity: number, name: string) {
  const geo = new LineSegmentsGeometry()
  geo.setPositions(pos)
  const material = new LineMaterial({
    color: COAST_COLOR,
    linewidth: width,
    transparent: true,
    opacity,
    depthWrite: false,
  })
  const lines = new LineSegments2(geo, material)
  lines.name = name
  // 比国界（3）高：海岸是这张图的骨架，重叠处让它在上面
  lines.renderOrder = 4
  return { lines, material, geo }
}

export function buildMap3DCoastline(geojson: LandGeoJsonLike): Map3DCoastline {
  const { major, minor } = coastSegments(geojson, COAST_Y)
  const big = makeLines(major, 1.5, 0.85, 'map3d-coast-major')
  const small = makeLines(minor, 1, 0.5, 'map3d-coast-minor')

  return {
    lines: [big.lines, small.lines],
    materials: [big.material, small.material],
    segments: (major.length + minor.length) / 6,
    dispose() {
      big.geo.dispose(); big.material.dispose()
      small.geo.dispose(); small.material.dispose()
    },
  }
}
