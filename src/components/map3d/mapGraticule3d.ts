import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { graticuleSegments } from '@/utils/chartLines'

/**
 * 2.5D 海图的经纬网（画的那一半；坐标在 utils/chartLines 里算）。
 *
 * 【为什么需要】一张海图区别于一张地形渲染图，最便宜也最有效的标记就是经纬网：
 * 它声明"这是一张用来量位置的图"，而不是"这是一块被拍下来的地"。
 * 2D 视图有 Leaflet 的刻度，2.5D 之前一根都没有 —— 所以切过去就成了卫星图。
 *
 * 【线间隔 15° 的依据】默认视野约 40 世界单位宽（≈130° 经度），15° 在屏幕上
 * 约 170px：远看是"网格"，近看不会挤成一片。30° 太稀（大西洋里只有三条线，
 * 读不出"网"），10° 太密（近景线与线之间只剩几十像素，会和海岸线抢注意力）。
 *
 * 【为什么颜色这么淡（0.22）】它是**背景层**，价值在于"你注意到它存在"，
 * 而不是"你读它"。实测这一档在羊皮纸陆地上只有约 4 级亮度差 —— 也就是说
 * 网格实际上只在水面上看得见（陆地把它遮住了，见 GRATICULE_Y）。
 * 再高（试过 0.35）会和国界线混成一片，玩家分不清哪条是政治边界。
 */
export interface Map3DGraticule {
  lines: LineSegments2
  material: LineMaterial
  dispose(): void
}

export function buildMap3DGraticule(y: number): Map3DGraticule {
  const geo = new LineSegmentsGeometry()
  geo.setPositions(graticuleSegments(y))

  const material = new LineMaterial({
    color: 0x5b4425,
    linewidth: 1,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  })

  const lines = new LineSegments2(geo, material)
  lines.name = 'map3d-graticule'
  // 比国界（renderOrder 3）低：同屏重叠时让国界画在上面
  lines.renderOrder = 2

  return {
    lines,
    material,
    dispose() {
      geo.dispose()
      material.dispose()
    },
  }
}
