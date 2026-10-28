import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { lonToWorldX, latToWorldZ } from '@/utils/mapProjection'
import {
  OCEAN_CURRENTS, PIRATE_ZONES, WIND_BAND_LATS,
  pirateZonePolygon, windArrowSites,
} from '@/data/mapLayers'

/**
 * 2.5D 海图的叠加图层：洋流 / 海盗区 / 风带。
 *
 * 【为什么要有这层】
 * 2D（Leaflet）那侧有这三个图层，底栏有对应的开关按钮。
 * 而底栏在 3D 模式下**照样渲染**——玩家能看见按钮、能点下去，
 * 但 3D 里什么都没有。那就是"承诺不兑现"：
 * 界面说这个开关有用，实际按了没反应。
 *
 * 所以这里用**同一份数据**（@/data/mapLayers）把三个图层在 3D 里重建一遍。
 *
 * 【与 2D 的表现差异是刻意的】
 * 2D 是俯视平面图，洋流是贴图上的虚线；
 * 3D 是斜俯视，洋流做成**贴着海面浮起一点的发光线**，
 * 顺着透视方向延伸——这是 3D 视图独有的表达，
 * 但**指向的东西必须一模一样**（同一批洋流、同一批海盗区、同一批箭头）。
 */

/**
 * 图层浮在海面上方的高度。
 *
 * 【高度账（别随便改）】
 *   海面平面      y = -PLATE_THICKNESS - 0.004 = -0.089
 *   陆地板块底    y = -PLATE_THICKNESS           = -0.085
 *   陆地板块顶    y = 0
 *
 * 海面与板块底之间只有 0.004 的窄缝，图层就铺在这条缝里：
 *   海盗区填充  -0.0880   （最靠下，压在海面上）
 *   洋流线      -0.0872
 *   海盗区环    -0.0868
 *   风带箭头    -0.0862
 *
 * 之前洋流设在 -0.073，离海面 0.016——斜俯视下这个高度差
 * 在屏幕上被放大成几十像素，看起来像**浮在海面上空的绳子**（截图证实）。
 * 现在贴到 0.002 以内，视觉上就是"画在海面上"。
 *
 * 【为什么都低于板块底（-0.085）】
 * 陆地浮雕是不透明的：图层在板块下方时，陆地区域的那段会被顶盖挡住，
 * 于是洋流"从海岸外的海里开始"——这正是洋流该有的样子。
 * 2D 的 Leaflet 是把洋流直接盖在陆地上面的（没有遮挡概念），
 * 两边可见范围因此略有差异：3D 会自动裁掉陆地部分。
 */
const LAYER_Y_FILL = -0.0880
const LAYER_Y_CURRENT = -0.0872
const LAYER_Y_PIRATE = -0.0868
const LAYER_Y_WIND = -0.0862

/** 洋流颜色：暖流红、寒流蓝（与 2D 一致） */
const CURRENT_WARM = 0xd4784a
const CURRENT_COLD = 0x5a8ab5

/** 海盗区：红环 + 淡红填充 */
const PIRATE_COLOR = 0xa03030

/** 风带：蓝绿色系 */
const WIND_COLOR = 0x3a6b7c

export interface Map3DLayers {
  /** 洋流图层组 */
  currents: THREE.Group
  /** 海盗区图层组 */
  pirates: THREE.Group
  /** 风带图层组 */
  winds: THREE.Group
  /** 所有需要随窗口尺寸更新 resolution 的线材质 */
  lineMaterials: LineMaterial[]
  dispose(): void
}

/** 把 [lat,lng] 点列转成 three.js 的世界坐标点列 */
function toWorldPoints(points: [number, number][], y: number): number[] {
  const out: number[] = []
  for (const [lat, lng] of points) {
    out.push(lonToWorldX(lng), y, latToWorldZ(lat))
  }
  return out
}

/** 建一条 Line2（支持虚线），返回对象并把材质登记到 lineMaterials */
function makeLine(
  points: [number, number][],
  color: number,
  opts: { linewidth: number; opacity: number; dashSize?: number; gapSize?: number; y: number },
  lineMaterials: LineMaterial[],
): Line2 {
  const mat = new LineMaterial({
    color,
    linewidth: opts.linewidth,
    transparent: true,
    opacity: opts.opacity,
    dashed: opts.dashSize !== undefined,
    dashSize: opts.dashSize ?? 1,
    gapSize: opts.gapSize ?? 1,
    depthWrite: false,
  })
  lineMaterials.push(mat)
  const geo = new LineGeometry()
  geo.setPositions(toWorldPoints(points, opts.y))
  const line = new Line2(geo, mat)
  // 虚线必须显式算距离累积，否则 dashSize/gapSize 无效
  line.computeLineDistances()
  return line
}

/**
 * 洋流：每条洋流一根发光线。
 *
 * 【为什么用 Line2 而不是 Line】
 * Line（原生线段）在多数平台上线宽恒为 1px，且不支持虚线——
 * 而洋流在 2D 里是带虚线样式的（dashArray '1 10'）。
 * Line2 才能同时拿到「可调线宽」和「虚线」。
 */
function buildCurrents(lineMaterials: LineMaterial[]): THREE.Group {
  const g = new THREE.Group()
  g.name = 'map3d-currents'
  for (const cur of OCEAN_CURRENTS) {
    const line = makeLine(
      cur.points,
      cur.warm ? CURRENT_WARM : CURRENT_COLD,
      { linewidth: 2.4, opacity: 0.95, dashSize: 0.14, gapSize: 0.2, y: LAYER_Y_CURRENT },
      lineMaterials,
    )
    line.renderOrder = 5
    g.add(line)
  }
  return g
}

/**
 * 海盗区：红色虚线环 + 淡红半透明填充。
 *
 * 【填充怎么做】
 * 不用 Canvas 贴图（那是 2D 的做法），直接用一个扇形三角面：
 * 圆心 + 边界点逐个连成三角形。
 * 半透明材质 + depthWrite=false → 不会把后面的海面/航线挡住。
 */
function buildPirates(lineMaterials: LineMaterial[]): THREE.Group {
  const g = new THREE.Group()
  g.name = 'map3d-pirates'
  for (const zone of PIRATE_ZONES) {
    const ring = pirateZonePolygon(zone)
    const line = makeLine(
      ring,
      PIRATE_COLOR,
      { linewidth: 2, opacity: 0.85, dashSize: 0.2, gapSize: 0.14, y: LAYER_Y_PIRATE },
      lineMaterials,
    )
    line.renderOrder = 6
    g.add(line)

    // 填充：圆心扇形
    const [cLat, cLng] = zone.center
    const cx = lonToWorldX(cLng), cz = latToWorldZ(cLat)
    const pos: number[] = []
    for (let i = 0; i + 1 < ring.length; i++) {
      const [la1, ln1] = ring[i]
      const [la2, ln2] = ring[i + 1]
      pos.push(cx, LAYER_Y_FILL, cz)
      pos.push(lonToWorldX(ln1), LAYER_Y_FILL, latToWorldZ(la1))
      pos.push(lonToWorldX(ln2), LAYER_Y_FILL, latToWorldZ(la2))
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    const mat = new THREE.MeshBasicMaterial({
      color: PIRATE_COLOR,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const fill = new THREE.Mesh(geo, mat)
    fill.renderOrder = 4
    g.add(fill)
    g.userData.fills = g.userData.fills ?? []
    g.userData.fills.push(geo, mat)
  }
  return g
}

/**
 * 风带：箭头网格 + ±30° 分界虚线。
 *
 * 【箭头为什么做成「平躺的浮雕符号」】
 * Age of Sail 那类老地图上，风向就是**印在纸上的符号**——
 * 不是会飞的物体。所以这里把箭头做成贴海面的薄浮雕：
 * 平躺的箭头轮廓（箭杆 + 三角头）挤出一丁点厚度，
 * 斜俯视时能看出"压印在海面上"，而不是悬空的碎冰碴。
 *
 * 【踩过的坑 1：第一版用躺平的锥体】
 * 侧看只剩一条线，完全读不出方向，截图放大后像"一堆碎冰碴"。
 *
 * 【踩过的坑 2：第二版太小】
 * 箭身 0.34 个世界单位 ≈ 20px，在 1440px 视口里被斜视一压，
 * 实测每个箭头簇只有 **19.7×9.5 像素**——还是短横条，读不出方向。
 * 现在放大到 0.62（箭头间距 15° ≈ 0.83 单位，够放不打架）。
 *
 * 【为什么放大就能解决】
 * prevailingWindBearing 只有 90（东）与 270（西）两个取值，
 * 而东西向恰好**不被斜视压缩**（南北向才会被压扁）。
 */
function buildWinds(lineMaterials: LineMaterial[]): THREE.Group {
  const g = new THREE.Group()
  g.name = 'map3d-winds'

  // 箭头轮廓（朝 +X），单位为世界单位
  const LEN = 0.62, HEAD = 0.21, SHAFT = 0.075
  const shape = new THREE.Shape()
  shape.moveTo(-LEN / 2, -SHAFT / 2)
  shape.lineTo(LEN / 2 - HEAD, -SHAFT / 2)
  shape.lineTo(LEN / 2 - HEAD, -HEAD / 2)
  shape.lineTo(LEN / 2, 0)
  shape.lineTo(LEN / 2 - HEAD, HEAD / 2)
  shape.lineTo(LEN / 2 - HEAD, SHAFT / 2)
  shape.lineTo(-LEN / 2, SHAFT / 2)
  shape.closePath()
  // 挤出一丁点厚度 → 斜视时边缘有厚度感，像压在纸上的符号
  const arrowGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.018, bevelEnabled: false })
  arrowGeo.rotateX(-Math.PI / 2)   // 平躺到 XZ 平面

  const windMat = new THREE.MeshBasicMaterial({
    color: WIND_COLOR,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    side: THREE.DoubleSide,
  })

  const sites = windArrowSites()
  const arrows = new THREE.InstancedMesh(arrowGeo, windMat, sites.length)
  arrows.renderOrder = 5

  const dummy = new THREE.Object3D()
  sites.forEach((s, i) => {
    // 罗盘方位角：0=北（-Z），90=东（+X）
    const rotY = Math.PI / 2 - (s.bearing * Math.PI) / 180
    dummy.position.set(lonToWorldX(s.lng), LAYER_Y_WIND, latToWorldZ(s.lat))
    dummy.rotation.set(0, rotY, 0)
    dummy.updateMatrix()
    arrows.setMatrixAt(i, dummy.matrix)
  })
  arrows.instanceMatrix.needsUpdate = true
  g.add(arrows)
  g.userData.arrowGeo = arrowGeo
  g.userData.arrowMat = windMat

  // ±30° 风带分界虚线
  for (const lat of WIND_BAND_LATS) {
    const pts: [number, number][] = []
    for (let lng = -120; lng <= 120; lng += 4) pts.push([lat, lng])
    const line = makeLine(
      pts,
      WIND_COLOR,
      { linewidth: 1.3, opacity: 0.55, dashSize: 0.1, gapSize: 0.3, y: LAYER_Y_WIND },
      lineMaterials,
    )
    line.renderOrder = 4
    g.add(line)
  }
  return g
}

/** 构建全部叠加图层 */
export function buildMap3DLayers(): Map3DLayers {
  const lineMaterials: LineMaterial[] = []
  const currents = buildCurrents(lineMaterials)
  const pirates = buildPirates(lineMaterials)
  const winds = buildWinds(lineMaterials)

  const disposables: { dispose(): void }[] = [...lineMaterials]
  // 清理各组里的非 Line2 资源（填充几何/材质、箭头几何/材质）
  for (const grp of [currents, pirates, winds]) {
    grp.traverse(o => {
      const any = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } }
      if (any.geometry) disposables.push(any.geometry)
      if (any.material) disposables.push(any.material)
    })
  }

  return {
    currents,
    pirates,
    winds,
    lineMaterials,
    dispose() {
      for (const d of disposables) d.dispose()
    },
  }
}
