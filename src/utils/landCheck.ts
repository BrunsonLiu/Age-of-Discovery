import { ports } from '@/data/ports'
import { loadSeaMask, loadPortChannels } from '@/utils/seaRoute'

interface Polygon {
  rings: [number, number][][]
  bbox: { minLng: number; maxLng: number; minLat: number; maxLat: number }
}

let polygons: Polygon[] = []
let loaded = false
let loadingPromise: Promise<void> | null = null

const PORT_TOLERANCE_DEG = 0.6

function buildPolygonFromRings(rings: [number, number][][]): Polygon {
  const outer = rings[0] ?? []
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const [lng, lat] of outer) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return { rings, bbox: { minLng, maxLng, minLat, maxLat } }
}

function extractFromGeometry(geometry: GeoJSON.Geometry | null | undefined, out: Polygon[]) {
  if (!geometry) return
  if (geometry.type === 'Polygon') {
    out.push(buildPolygonFromRings(geometry.coordinates as [number, number][][]))
  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      out.push(buildPolygonFromRings(poly as [number, number][][]))
    }
  }
}

function extractPolygons(geojson: GeoJSON.FeatureCollection | GeoJSON.Feature | GeoJSON.Geometry): Polygon[] {
  const out: Polygon[] = []
  if (geojson.type === 'FeatureCollection') {
    for (const feature of geojson.features) extractFromGeometry(feature.geometry, out)
  } else if (geojson.type === 'Feature') {
    extractFromGeometry(geojson.geometry, out)
  } else {
    extractFromGeometry(geojson, out)
  }
  return out
}

function pointInRing(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const lngI = ring[i][0], latI = ring[i][1]
    const lngJ = ring[j][0], latJ = ring[j][1]
    // 经度相同的边会让分母为 0 —— 交点纬度算出来是 NaN，
    // 比较恒为 false，射线法依然正确（那种边不产生穿越）。
    if (lngI === lngJ) continue
    const intersect = (lngI > lng) !== (lngJ > lng) &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI
    if (intersect) inside = !inside
  }
  return inside
}

function pointInPolygon(lat: number, lng: number, polygon: Polygon): boolean {
  const { minLng, maxLng, minLat, maxLat } = polygon.bbox
  if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return false
  if (!pointInRing(lat, lng, polygon.rings[0])) return false
  for (let i = 1; i < polygon.rings.length; i++) {
    if (pointInRing(lat, lng, polygon.rings[i])) return false
  }
  return true
}

function isNearAnyPort(lat: number, lng: number): boolean {
  for (const p of ports) {
    if (Math.abs(p.latitude - lat) < PORT_TOLERANCE_DEG &&
        Math.abs(p.longitude - lng) < PORT_TOLERANCE_DEG) {
      return true
    }
  }
  return false
}

/**
 * 空间索引：把多边形按 5°×5° 网格挂到格子上。
 *
 * 为什么需要：50m 精度的陆地数据有 1421 个多边形，
 * 逐个做 bbox 检查也要 0.034 ms/次——而航线避让要做成千上万次。
 * 有了网格索引，单次查询只测 2~5 个候选多边形，快一个数量级。
 */
const GRID_SIZE = 5
const grid = new Map<string, number[]>()

function gridKey(lat: number, lng: number): string {
  const gy = Math.floor((lat + 90) / GRID_SIZE)
  const gx = Math.floor((lng + 180) / GRID_SIZE)
  return `${gy}:${gx}`
}

function buildGrid() {
  grid.clear()
  polygons.forEach((poly, idx) => {
    const { minLng, maxLng, minLat, maxLat } = poly.bbox
    const gx0 = Math.floor((minLng + 180) / GRID_SIZE)
    const gx1 = Math.floor((maxLng + 180) / GRID_SIZE)
    const gy0 = Math.floor((minLat + 90) / GRID_SIZE)
    const gy1 = Math.floor((maxLat + 90) / GRID_SIZE)
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const key = `${gy}:${gx}`
        let bucket = grid.get(key)
        if (!bucket) { bucket = []; grid.set(key, bucket) }
        bucket.push(idx)
      }
    }
  })
}

/**
 * 登记已经取回来的 land.geojson，不再自己 fetch 一遍。
 *
 * 为什么需要：land.geojson 有 1.2MB。渲染地图要一份，
 * 陆地碰撞检测（航线避让）也要同一份——原先两处各 fetch 一次，
 * 同一份数据在网络上白跑两趟。改成单一来源：谁先拿到就登记给谁用。
 */
export function registerLandGeojson(geojson: GeoJSON.FeatureCollection | GeoJSON.Feature | GeoJSON.Geometry): void {
  if (loaded) return
  polygons = extractPolygons(geojson)
  buildGrid()
  loaded = true
}

/**
 * land.geojson 的**唯一**取数入口。
 *
 * 渲染地图与陆地碰撞检测共用这一份 Promise——
 * 两边并发调用也只会发一次请求。
 * 地图那边拿到数据后会调 registerLandGeojson 提前登记，
 * 这里的 fetch 若稍后才回来，看到 loaded 已为真就直接跳过。
 */
let landFetchPromise: Promise<void> | null = null
let landGeojsonPromise: Promise<GeoJSON.FeatureCollection> | null = null

/**
 * 取 land.geojson（原始 geojson，供地图渲染用）。
 * 与陆地碰撞检测共用同一个请求——同一份 1.2MB 只走一趟网络。
 */
export function fetchLandGeojsonForRender(): Promise<GeoJSON.FeatureCollection> {
  if (landGeojsonPromise) return landGeojsonPromise
  landGeojsonPromise = fetch(`${import.meta.env.BASE_URL}data/land.geojson`)
    .then(r => {
      if (!r.ok) throw new Error(`land.geojson ${r.status}`)
      return r.json() as Promise<GeoJSON.FeatureCollection>
    })
    .then(geojson => {
      // 顺带登记给碰撞检测，省掉它那次独立请求
      registerLandGeojson(geojson)
      return geojson
    })
  landFetchPromise = landGeojsonPromise.then(() => undefined).catch(err => {
    console.warn('陆地数据加载失败，陆地碰撞检测将禁用', err)
  })
  return landGeojsonPromise
}

function fetchLandGeojson(): Promise<void> {
  if (landFetchPromise) return landFetchPromise
  landFetchPromise = fetch(`${import.meta.env.BASE_URL}data/land.geojson`)
    .then(r => {
      if (!r.ok) throw new Error(`land.geojson ${r.status}`)
      return r.json()
    })
    .then(geojson => {
      registerLandGeojson(geojson)
    })
    .catch(err => {
      console.warn('陆地数据加载失败，陆地碰撞检测将禁用', err)
    })
  return landFetchPromise
}

export function loadLandData(): Promise<void> {
  if (loaded) return Promise.resolve()
  if (loadingPromise) return loadingPromise
  loadingPromise = Promise.all([
    fetchLandGeojson(),
    // 海陆掩码（1 bit/格）供 A* 航路搜索使用
    loadSeaMask(import.meta.env.BASE_URL),
    // 港口航道（构建期挖好的内河/内湾通道）
    loadPortChannels(import.meta.env.BASE_URL),
  ]).then(() => {
    // 数据到位后，之前算出的航线几何全部作废——
    // 那时掩码可能还没加载，航路退化成了直线。必须清缓存重算。
    //
    // 这里用动态 import 断开循环依赖：
    // routePath 需要 seaRoute，而这里又要让 routePath 清缓存。
    // 直接 import 会形成环，ESM 下会拿到未初始化的绑定。
    import('@/utils/routePath')
      .then(m => m.invalidateRouteGeometryCache())
      .catch(() => { /* 清缓存失败不影响功能，只是航路可能偏旧 */ })
  })
  return loadingPromise
}

export function isLandLoaded(): boolean {
  return loaded
}

export function isOnLand(lat: number, lng: number): boolean {
  if (isNearAnyPort(lat, lng)) return false
  const bucket = grid.get(gridKey(lat, lng))
  if (!bucket) return false
  for (const idx of bucket) {
    if (pointInPolygon(lat, lng, polygons[idx])) return true
  }
  return false
}

export function findNearestOceanPoint(
  lat: number,
  lng: number,
  maxSearchDeg = 8,
  stepDeg = 0.4,
): [number, number] | null {
  if (!isOnLand(lat, lng)) return [lat, lng]

  for (let r = stepDeg; r <= maxSearchDeg; r += stepDeg) {
    for (let theta = 0; theta < Math.PI * 2; theta += Math.PI / 8) {
      const newLat = lat + Math.sin(theta) * r
      const newLng = lng + Math.cos(theta) * r
      if (!isOnLand(newLat, newLng)) return [newLat, newLng]
    }
  }
  return null
}
