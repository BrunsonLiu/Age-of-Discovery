import { ports } from '@/data/ports'

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

export function loadLandData(): Promise<void> {
  if (loaded) return Promise.resolve()
  if (loadingPromise) return loadingPromise
  loadingPromise = fetch('/data/land.geojson')
    .then(r => {
      if (!r.ok) throw new Error(`land.geojson ${r.status}`)
      return r.json()
    })
    .then(geojson => {
      polygons = extractPolygons(geojson)
      loaded = true
    })
    .catch(err => {
      console.warn('陆地数据加载失败，陆地碰撞检测将禁用', err)
    })
  return loadingPromise
}

export function isLandLoaded(): boolean {
  return loaded
}

export function isOnLand(lat: number, lng: number): boolean {
  if (isNearAnyPort(lat, lng)) return false
  for (const poly of polygons) {
    if (pointInPolygon(lat, lng, poly)) return true
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
