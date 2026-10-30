/**
 * 程序化地形符号：给大块陆地撒「山丘 / 树丛」，模仿古地图的画法。
 *
 * ## 为什么不在数据里写死地形
 * 参考图那种山脉、森林、沙漠是**手绘世界底图**的一部分，我们没有那张图。
 * 但古地图本来就不用写实地形——它用符号：一簇三角形表示山脉，几个小圆锥表示
 * 林地。这套画法跟我们的羊皮纸底子是一路的，而且**可以由程序生成**。
 *
 * ## 为什么只给大块陆地撒
 * land.geojson 有 1420 个多边形，绝大多数是几公里的小岛。给小岛撒符号既没有
 * 信息量，还会把 2000+ 个 DOM 节点压进地图。所以按 bbox 面积排序取前 N 块，
 * 小岛一个不撒。
 *
 * ## 为什么符号是固定像素大小（用 divIcon 而不是多边形）
 * 用地理坐标画三角形，缩到 zoom 2 会退化成一条线、放到 zoom 8 又会撑满屏幕。
 * 固定像素的符号在整条缩放范围里都稳定可读，代价是它不"贴"在地面上——
 * 对地形标识来说这个代价可以接受（港口标记也是这么做的）。
 *
 * ## 为什么用固定种子
 * 每次渲染随机撒点的话，切一下视图山就全挪位置了。mulberry32 + 固定 seed
 * 保证同一个多边形永远撒在同一处。
 */

export type TerrainKind = 'peak' | 'tree'

export interface TerrainSymbol {
  lat: number
  lng: number
  kind: TerrainKind
  /** 局部缩放（0.8~1.25），让符号大小不整齐划一 */
  scale: number
}

interface Ring { pts: [number, number][]; bbox: BBox }
interface BBox { minLng: number; maxLng: number; minLat: number; maxLat: number }

function bboxOf(pts: [number, number][]): BBox {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const [lng, lat] of pts) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return { minLng, maxLng, minLat, maxLat }
}

/** 射线法。经度相同的边跳过（分母为 0，那种边不产生穿越） */
function pointInRing(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const lngI = ring[i][0], latI = ring[i][1]
    const lngJ = ring[j][0], latJ = ring[j][1]
    if (lngI === lngJ) continue
    const hit = (lngI > lng) !== (lngJ > lng) &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI
    if (hit) inside = !inside
  }
  return inside
}

/** 外环内、且不在任何内环（湖泊）里 */
function pointInRings(lat: number, lng: number, rings: Ring[]): boolean {
  if (!rings.length) return false
  const { bbox } = rings[0]
  if (lng < bbox.minLng || lng > bbox.maxLng || lat < bbox.minLat || lat > bbox.maxLat) return false
  if (!pointInRing(lat, lng, rings[0].pts)) return false
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lat, lng, rings[i].pts)) return false
  }
  return true
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function extractRings(geojson: GeoJSON.GeoJsonObject): Ring[][] {
  const out: Ring[][] = []
  const pushPoly = (coords: [number, number][][]) => {
    const rings = coords.map(pts => ({ pts, bbox: bboxOf(pts) }))
    if (rings.length) out.push(rings)
  }
  const walk = (g: GeoJSON.Geometry | null | undefined) => {
    if (!g) return
    if (g.type === 'Polygon') pushPoly(g.coordinates as [number, number][][])
    else if (g.type === 'MultiPolygon') {
      for (const p of g.coordinates) pushPoly(p as [number, number][][])
    }
  }
  if (geojson.type === 'FeatureCollection') {
    (geojson as GeoJSON.FeatureCollection).features.forEach(f => walk(f.geometry))
  } else if (geojson.type === 'Feature') {
    walk((geojson as GeoJSON.Feature).geometry)
  } else {
    walk(geojson as GeoJSON.Geometry)
  }
  return out
}

export interface BuildTerrainOptions {
  /** 只给面积最大的前 N 块陆地撒（默认 14） */
  topBlocks?: number
  /** 每块陆地大约撒多少个（默认按面积自适应） */
  density?: number
  seed?: number
}

/**
 * 生成地形符号。
 *
 * 撒点用「抖动网格」而不是纯随机：纯随机会结块，有的地方挤成一堆、有的地方
 * 空着，看起来像噪点。网格 + 半个格子的抖动既能铺满又不会排成阵列。
 */
export function buildTerrainSymbols(
  geojson: GeoJSON.GeoJsonObject,
  opts: BuildTerrainOptions = {},
): TerrainSymbol[] {
  const topBlocks = opts.topBlocks ?? 18
  const density = opts.density ?? 1.9
  const rand = mulberry32(opts.seed ?? 20261030)

  const polys = extractRings(geojson)
  if (!polys.length) return []

  // 按 bbox 面积排序——bbox 面积不等于真实面积，但用来排"哪些是大陆"足够
  const scored = polys
    .map(rings => {
      const b = rings[0].bbox
      return { rings, area: (b.maxLng - b.minLng) * (b.maxLat - b.minLat) }
    })
    .sort((a, b) => b.area - a.area)
    .slice(0, topBlocks)

  const out: TerrainSymbol[] = []

  for (const { rings, area } of scored) {
    // 面积只用来决定撒多少：4 平方度以上按面积长，小岛至少 2 个
    const count = Math.max(2, Math.round(Math.min(72, area * 2.2) * density))
    const b = rings[0].bbox
    const wDeg = b.maxLng - b.minLng
    const hDeg = b.maxLat - b.minLat
    if (wDeg <= 0 || hDeg <= 0) continue

    // 网格：保持近似正方形，格数 = sqrt(count)
    const cols = Math.max(1, Math.round(Math.sqrt(count * (wDeg / hDeg))))
    const rows = Math.max(1, Math.ceil(count / cols))
    const cw = wDeg / cols
    const ch = hDeg / rows

    let placed = 0
    let guard = 0
    while (placed < count && guard < count * 12) {
      guard++
      const c = Math.floor(rand() * cols)
      const r = Math.floor(rand() * rows)
      const lng = b.minLng + (c + 0.25 + rand() * 0.5) * cw
      const lat = b.minLat + (r + 0.25 + rand() * 0.5) * ch
      if (!pointInRings(lat, lng, rings)) continue
      // 海岸附近不撒：贴着海岸线的符号会被描边切一半
      const inset = Math.min(cw, ch) * 0.18
      if (!pointInRings(lat + inset, lng, rings) || !pointInRings(lat - inset, lng, rings)
        || !pointInRings(lat, lng + inset, rings) || !pointInRings(lat, lng - inset, rings)) continue

      // 高纬度出雪峰，其余按 2:1 混山与树
      const snowy = Math.abs(lat) > 55
      const kind: TerrainKind = snowy ? 'peak' : (rand() < 0.62 ? 'peak' : 'tree')
      out.push({ lat, lng, kind, scale: 0.8 + rand() * 0.45 })
      placed++
    }
  }

  return out
}
