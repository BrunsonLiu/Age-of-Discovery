import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { lonToWorldX, latToWorldZ } from '@/utils/mapProjection'
import {
  OCEAN_CURRENTS, currentFlowPoints, PIRATE_ZONES, WIND_BAND_LATS,
  pirateZonePolygon, windArrowSites, windArrowSitesOnSea,
} from '@/data/mapLayers'
import { SEA_PHENOMENA, phenomenonRing, type SeaPhenomenon } from '@/data/seaPhenomena'
import type { OceanCurrent } from '@/data/mapLayers'
import { ALL_SEASONS, seasonAt } from '@/utils/season'
import { isLandAt } from '@/utils/seaRoute'

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
/** 季节现象（风暴带/无风带…）：压在海盗区之上、风箭头之下 */
const LAYER_Y_PHENOM = -0.0864

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
  /**
   * 季节性海上现象。与上面三组不同：**没有底栏开关**——
   * 它不是可选的参考图层，是这一季的海本身。
   */
  phenomena: PhenomenaLayer
  /** 换季：洋流点序 / 风箭头朝向 / 现象可见性一起更新（同一天重复调用是空操作） */
  setDay(day: number): void
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
function buildCurrents(
  lineMaterials: LineMaterial[],
  day?: number,
): { group: THREE.Group; setDay: (d: number) => void } {
  const g = new THREE.Group()
  g.name = 'map3d-currents'
  const items: { cur: OceanCurrent; reverses: boolean; line: Line2 }[] = []
  for (const cur of OCEAN_CURRENTS) {
    const line = makeLine(
      // 点序 = 流向；会随季风掉头的那条在这里就换向
      currentFlowPoints(cur, day),
      cur.warm ? CURRENT_WARM : CURRENT_COLD,
      { linewidth: 2.4, opacity: 0.95, dashSize: 0.14, gapSize: 0.2, y: LAYER_Y_CURRENT },
      lineMaterials,
    )
    line.renderOrder = 5
    g.add(line)
    items.push({ cur, reverses: !!cur.monsoonReverses, line })
  }
  /*
   * 换季时就地换点序。
   *
   * 【为什么不重建这一层】帧循环为了让洋流"流起来"，在挂载时把这一层的
   * LineMaterial 收进了 currentMats（见 Map3DView）。重建就等于换掉材质，
   * 那份引用当场失效——箭头不动了，而且很难看出来是为什么。
   * `LineGeometry.setPositions` 可以原地重写顶点，材质与引用都不动。
   *
   * 只有季风漂流会掉头；湾流之类的常年一个方向，重算它纯属浪费。
   */
  let lastDay = -1
  return {
    group: g,
    setDay(d: number) {
      if (d === lastDay) return
      lastDay = d
      for (const it of items) {
        if (!it.reverses) continue
        /*
         * 点序一律从 `currentFlowPoints` 重新取，**不要自己 reverse**。
         *
         * 【踩过】第一版写的是「无条件把点序倒过来」，看起来对——
         * 春→秋确实倒了，但秋→春又倒了一次，于是永远停在倒序上。
         * 判据必须只有一处：季节决定要不要倒，由 currentFlowPoints 说了算。
         * 守卫（test/logic.test.ts）就是拿「春→秋→春必须逐位还原」钉住的。
         */
        const pts = currentFlowPoints(it.cur, d)
        it.line.geometry.setPositions(toWorldPoints(pts, LAYER_Y_CURRENT))
        it.line.computeLineDistances()
      }
    },
  }
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
function buildWinds(
  lineMaterials: LineMaterial[],
  day?: number,
): { group: THREE.Group; setDay: (d: number) => void } {
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

  /*
   * 实例缓冲按**整张网格**建（数量固定），落在陆地上的那些用零缩放藏起来。
   *
   * 【为什么不直接 filter 掉】`InstancedMesh` 的 count 在构造时定死；
   * 掩码是异步加载的 —— 建层时掩码往往还没到，过滤后只剩全部，
   * 掩码到了再想减就得整块重建 InstancedMesh（还要处理材质/program 缓存）。
   * 零缩放是同一个缓冲里"不画"，掩码到齐后重跑一次 applyDay 就生效。
   */
  const sites = windArrowSites(day)
  const arrows = new THREE.InstancedMesh(arrowGeo, windMat, sites.length)
  arrows.renderOrder = 5

  /*
   * 换季时重写实例矩阵。
   *
   * 【为什么必须有一条】风箭头是"顺风方向"的可视化，而印度洋的风半年反向
   * （见 utils/season）。原来只在挂载时算一次：玩家在 3D 里过了一个换季，
   * 航线天数已经按新季风算了，箭头却还指着上一季的方向——**屏幕和实际不一致**。
   *
   * 站点数量不随季节变（网格是固定的），所以不用重建 InstancedMesh，
   * 只重写矩阵即可。
   */
  const dummy = new THREE.Object3D()
  const applyDay = (d: number) => {
    /* 掩码没到位时 `isLandAt` 一律返回 false —— 那时先画满，掩码到齐后由
       Map3DView 再调一次 setDay 把陆地上那批藏起来（见那边的 landDataReady 处理） */
    const list = windArrowSitesOnSea(d, isLandAt)
    const hidden = new Set<number>()
    const all = windArrowSites(d)
    all.forEach((s, i) => {
      if (!list.some(x => x.lat === s.lat && x.lng === s.lng)) hidden.add(i)
    })
    all.forEach((s, i) => {
      // 罗盘方位角：0=北（-Z），90=东（+X）
      const rotY = Math.PI / 2 - (s.bearing * Math.PI) / 180
      dummy.position.set(lonToWorldX(s.lng), LAYER_Y_WIND, latToWorldZ(s.lat))
      dummy.rotation.set(0, rotY, 0)
      // 在陆地上：缩到 0（同一个缓冲里"不画"），不是移开 —— 移开会在别处冒出来
      dummy.scale.setScalar(hidden.has(i) ? 0 : 1)
      dummy.updateMatrix()
      arrows.setMatrixAt(i, dummy.matrix)
    })
    arrows.userData.hidden = hidden.size
    arrows.userData.total = all.length
    arrows.instanceMatrix.needsUpdate = true
  }
  applyDay(day ?? 1)
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
  return { group: g, setDay: applyDay }
}

/**
 * 季节性海上现象的 3D 表现：一圈虚线界线。
 *
 * 【为什么四季全建好、只切 visible】
 * 换季不重建几何：一次换季要重跑 A* 之外的所有线，还会把
 * `lineMaterials`（窗口 resize 要刷 resolution 的那个数组）越滚越长。
 * 四条现象一共四百来个点，全建好也就几十 KB。
 *
 * 【为什么两个圈】
 * 单圈读作"一个圆圈符号"；外圈略粗 + 内圈更淡的两重圈，
 * 读起来才像"一片水域"——2D 那边是"描边 + 淡填充"，
 * 3D 没有半透明填充可用（海面已经在混合，再叠一层会脏），
 * 于是用两重线替代填充，视觉结果是同一种东西。
 */
export interface PhenomenaLayer {
  group: THREE.Group
  /** 换季时切可见性（同一天重复调用是空操作） */
  setDay(day: number): void
}

function phenomColor(p: SeaPhenomenon): number {
  return parseInt(p.color.replace('#', ''), 16)
}

function buildPhenomena(lineMaterials: LineMaterial[]): PhenomenaLayer {
  const group = new THREE.Group()
  group.name = 'map3d-phenomena'
  const bySeason = new Map<string, THREE.Group>()

  for (const season of ALL_SEASONS) {
    const g = new THREE.Group()
    g.name = `map3d-phenom-${season.id}`
    g.visible = false
    for (const p of SEA_PHENOMENA.filter(x => x.season === season.id)) {
      const color = phenomColor(p)
      const outer = makeLine(
        phenomenonRing(p, 64),
        color,
        // 远景下（dist 15 = 大半个世界）这个圈只有三十几像素：
        // 2.0px / 0.5 透明度在那样的尺度上几乎看不见，实测截图只剩几个点
        { linewidth: 2.4, opacity: 0.62, dashSize: 0.14, gapSize: 0.12, y: LAYER_Y_PHENOM },
        lineMaterials,
      )
      outer.renderOrder = 4
      g.add(outer)
      const inner = makeLine(
        phenomenonRing({ ...p, radiusDeg: p.radiusDeg * 0.88 }, 64),
        color,
        { linewidth: 1.2, opacity: 0.22, dashSize: 0.1, gapSize: 0.22, y: LAYER_Y_PHENOM },
        lineMaterials,
      )
      inner.renderOrder = 4
      g.add(inner)
    }
    bySeason.set(season.id, g)
    group.add(g)
  }

  let lastDay = -1
  return {
    group,
    setDay(day: number) {
      if (day === lastDay) return
      lastDay = day
      const active = seasonAt(day).id
      for (const [sid, g] of bySeason) g.visible = sid === active
    },
  }
}

/** 构建全部叠加图层 */
/**
 * @param day 游戏日——只用于「会随季风掉头的洋流」（季风漂流）。
 *            不给则按西南季风处理（不关心季节的调用方行为不变）。
 */
export function buildMap3DLayers(day?: number): Map3DLayers {
  const lineMaterials: LineMaterial[] = []
  const currentsL = buildCurrents(lineMaterials, day)
  const pirates = buildPirates(lineMaterials)
  const windsL = buildWinds(lineMaterials, day)
  const phenomena = buildPhenomena(lineMaterials)
  const currents = currentsL.group
  const winds = windsL.group
  phenomena.setDay(day ?? 1)

  const disposables: { dispose(): void }[] = [...lineMaterials]
  // 清理各组里的非 Line2 资源（填充几何/材质、箭头几何/材质）
  for (const grp of [currents, pirates, winds, phenomena.group]) {
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
    phenomena,
    /*
     * 换季：把三块「跟季节有关的东西」一起推到新的一季。
     * 洋流（季风漂流掉头）、风箭头（印度洋半年反向）、海上现象（换一片水）。
     *
     * 【为什么必须是一家】这三块原先各算各的，其中两块只在挂载时算一次——
     * 3D 里过了一个换季，天数已经按新季风算了，画面上却还是上一季的风与水流。
     * 这是"屏幕数字不等于实际发生的变化"，本项目最不能留的一类问题。
     */
    setDay(d: number) {
      currentsL.setDay(d)
      windsL.setDay(d)
      phenomena.setDay(d)
    },
    lineMaterials,
    dispose() {
      for (const d of disposables) d.dispose()
    },
  }
}
