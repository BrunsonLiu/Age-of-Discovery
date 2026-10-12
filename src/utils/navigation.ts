import type { Route, Fleet } from '@/types'

export function calculateBearing(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const dLng = (toLng - fromLng) * Math.PI / 180
  const lat1 = fromLat * Math.PI / 180
  const lat2 = toLat * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

/**
 * 真实风带模型（简化）：
 * - 低纬度（|lat| < 30°）：信风带，稳定吹向西（东风）
 * - 中纬度（|lat| >= 30°）：西风带，稳定吹向东（西风）
 * 返回风吹去的罗盘方位角。
 */
export function prevailingWindBearing(lat: number): number {
  return Math.abs(lat) < 30 ? 90 : 270
}

/**
 * 风向有利度：1.0 = 顺风（全速），0.5 = 逆风（半速）。
 * 对相同航向而言，同一纬度带上往返会有快慢差异——
 * 低纬度向东快、向西慢；中纬度相反。
 */
export function windFavorForBearing(lat: number, bearing: number): number {
  const wind = prevailingWindBearing(lat)
  // 夹角 0° = 正顺风，180° = 正逆风
  const diff = Math.abs(bearing - wind)
  const angle = diff > 180 ? 360 - diff : diff
  // cos(-1..1)：顺风 +，逆风 -；映射到 0.5..1.3
  const cos = Math.cos(angle * Math.PI / 180)
  return Math.round((1 + cos * 0.4) * 100) / 100
}

/** 综合风有利度：取航线起点纬度带的顺风程度（预估与实际共用此值） */
export function computeWindFavor(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const bearing = calculateBearing(fromLat, fromLng, toLat, toLng)
  const midLat = (fromLat + toLat) / 2
  return windFavorForBearing(midLat, bearing)
}

export function calculateSailingDays(route: Route, fleet: Fleet): number {
  if (fleet.ships.length === 0) return Infinity
  const avgSpeed = effectiveFleetSpeed(fleet)
  const effectiveSpeed = avgSpeed * Math.max(0.5, route.windFavor)
  return Math.max(1, Math.ceil(route.distance / (effectiveSpeed * 24)))
}

/**
 * 舰队有效速度：船员充足才有设计航速。
 * 船员率（实际/最大）低于 60% 时开始掉速，低于 20% 时只有一半速度。
 */
export function effectiveFleetSpeed(fleet: Fleet): number {
  if (fleet.ships.length === 0) return 0
  const speeds = fleet.ships.map(ship => {
    const crewRatio = ship.maxCrew > 0 ? ship.crew / ship.maxCrew : 1
    const penalty = crewRatio >= 0.6 ? 1 : 0.5 + (crewRatio / 0.6) * 0.5
    return ship.speed * penalty
  })
  return speeds.reduce((sum, s) => sum + s, 0) / speeds.length
}

export function calculateDailyConsumption(fleet: Fleet): { food: number; water: number } {
  const totalCrew = fleet.ships.reduce((sum, ship) => sum + ship.crew, 0)
  return {
    food: Math.ceil(totalCrew * 0.1),
    water: Math.ceil(totalCrew * 0.15),
  }
}

/** 根据航行距离（海里）推断危险等级 */
export function dangerLevelFromDistance(distanceNm: number): 1 | 2 | 3 | 4 | 5 {
  if (distanceNm < 500) return 1
  if (distanceNm < 1500) return 2
  if (distanceNm < 3000) return 3
  if (distanceNm < 5000) return 4
  return 5
}
