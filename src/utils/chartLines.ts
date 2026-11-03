/**
 * 2.5D 海图的「线」：海岸环与经纬网。**纯计算**，不碰 three。
 *
 * 【为什么单独放在 utils 而不是 map3d 目录里】
 * map3d 下的模块要 import three 的 LineSegments2 / LineMaterial，
 * 单测把它们拖进 Node 就得 mock 半个渲染器。而真正容易错的东西
 * —— 环闭不闭合、洞有没有漏、分档阈值、零长段、极区 NaN ——
 * 全在「坐标数组」这一层。所以坐标在这里算，three 那边只负责画。
 *
 * 同一个模式在项目中已有先例：portScale 从 map3d/models 里抽出，
 * 就是为了让 2D 不必为了一个字符串引入 565KB 的 three。
 */
import { lonToWorldX, latToWorldZ, MERCATOR_LAT_LIMIT } from './mapProjection'
import { featureArea } from './terrainDecor'

// ---------------------------------------------------------------- 经纬网

/** 网格间隔（度） */
export const GRATICULE_STEP_DEG = 15
/** 纬线取样步长（度）：只影响顶点数，不影响形状（墨卡托纬线是水平直线） */
const PARALLEL_SAMPLE_DEG = 5

/**
 * 产出 LineSegmentsGeometry 需要的「每段两个端点」扁平数组 [x,y,z, x,y,z, ...]。
 *
 * 【为什么经线只要一段两点】
 * 墨卡托投影里经线是**直线**，一段就够（和 Leaflet 画等角航线同理）。
 * 纬线也是直线，但仍按 5° 分段：将来若换非直投影或在纬线上加弧度，
 * 不用改数据结构；代价只是共线线段多了些顶点，GPU 上可忽略。
 *
 * @param y 高度（世界坐标）。2.5D 取海平面略上（见 Map3DView 的 GRATICULE_Y）。
 */
export function graticuleSegments(y: number): number[] {
  const pos: number[] = []

  // ---- 经线：x 恒定，从墨卡托北沿拉到南沿 ----
  const zTop = latToWorldZ(MERCATOR_LAT_LIMIT)
  const zBot = latToWorldZ(-MERCATOR_LAT_LIMIT)
  for (let lng = -180; lng <= 180; lng += GRATICULE_STEP_DEG) {
    const x = lonToWorldX(lng)
    pos.push(x, y, zTop, x, y, zBot)
  }

  // ---- 纬线：z 恒定，横跨 ±180 ----
  for (let lat = -75; lat <= 75; lat += GRATICULE_STEP_DEG) {
    const z = latToWorldZ(lat)
    for (let lng = -180; lng < 180; lng += PARALLEL_SAMPLE_DEG) {
      pos.push(
        lonToWorldX(lng), y, z,
        lonToWorldX(lng + PARALLEL_SAMPLE_DEG), y, z,
      )
    }
  }

  return pos
}

/** 经线条数（含 ±180 这条重复的边线）：-180..180 步长 15 → 25 条 */
export const GRATICULE_MERIDIANS = 2 * (180 / GRATICULE_STEP_DEG) + 1
/** 纬线条数：-75..75 步长 15 → 11 条 */
export const GRATICULE_PARALLELS = 2 * (75 / GRATICULE_STEP_DEG) + 1

// ---------------------------------------------------------------- 海岸线

/** 与 2D 的 LAND_BASE.color '#3d2810' 同一个数：两个视图同一支笔 */
export const COAST_COLOR = 0x3d2810

/**
 * 「小岛」的判据：bbox 面积 < 0.3 度²（约 55km × 55km）。
 *
 * 和 2D 的 landStyleFor 用同一个阈值、同一个函数（featureArea）。
 * 1.3px 深褐描边套在只有 2~3 像素的礁石上，整片海域会浮一层褐色杂点
 * —— 2D 已经踩过，这里必须分档。
 */
export const MINOR_AREA_DEG2 = 0.3

export interface LandGeoJsonLike {
  features: {
    geometry: { type: string; coordinates: unknown } | null
  }[]
}

/** 把一个要素的所有环（外环 + 洞/湖）推成线段对，返回推入的线段数 */
function pushFeature(feature: GeoJSON.Feature, dst: number[], y: number): number {
  const geom = feature.geometry
  if (!geom) return 0
  if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') return 0
  const polys = (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates) as number[][][][]
  let n = 0
  for (const poly of polys) {
    for (const ring of poly) {
      if (!ring || ring.length < 4) continue
      for (let i = 0; i + 1 < ring.length; i++) {
        const a = ring[i], b = ring[i + 1]
        const ax = lonToWorldX(a[0]), az = latToWorldZ(a[1])
        const bx = lonToWorldX(b[0]), bz = latToWorldZ(b[1])
        // 零长段会让 LineSegmentsGeometry 算出 NaN 方向（three 的已知行为：
        // 方向归一化除以 0 → 整条线消失，而不是只丢这一段）
        if (ax === bx && az === bz) continue
        dst.push(ax, y, az, bx, y, bz)
        n++
      }
    }
  }
  return n
}

/** 环数（外环 + 洞），供单测断言"湖泊没被漏掉" */
export function ringCount(feature: GeoJSON.Feature): number {
  const geom = feature.geometry
  if (!geom) return 0
  if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') return 0
  const polys = (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates) as number[][][][]
  let n = 0
  for (const poly of polys) n += poly.length
  return n
}

export interface CoastSegments {
  /** 大陆环（粗线） */
  major: number[]
  /** 小岛环（细线） */
  minor: number[]
  /** 采样到的环数，用来确认洞/湖也进来了 */
  rings: number
  /** 因长度 < 4 或零长而被跳过的环数（正常应极少） */
  skipped: number
}

/**
 * 把陆地要素分成「大陆环」与「小岛环」两组线段。
 *
 * 直接复用 land.geojson 的环，不再加载 coastline.geojson ——
 * 2D 那边已经量过：两者坐标 99.5% 重复，本质是同一份海岸线的两种表达。
 */
export function coastSegments(geojson: LandGeoJsonLike, y = 0.006): CoastSegments {
  const major: number[] = []
  const minor: number[] = []
  let rings = 0
  let skipped = 0
  for (const f of geojson.features) {
    const feat = f as unknown as GeoJSON.Feature
    const geom = feat.geometry
    const short = geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon')
      ? ringCount(feat) - countLongRings(feat)
      : 0
    skipped += Math.max(0, short)
    rings += ringCount(feat)
    pushFeature(feat, featureArea(feat) < MINOR_AREA_DEG2 ? minor : major, y)
  }
  return { major, minor, rings, skipped }
}

function countLongRings(feature: GeoJSON.Feature): number {
  const geom = feature.geometry
  if (!geom) return 0
  if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') return 0
  const polys = (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates) as number[][][][]
  let n = 0
  for (const poly of polys) for (const r of poly) if (r && r.length >= 4) n++
  return n
}
