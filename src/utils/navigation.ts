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

export function calculateSailingDays(route: Route, fleet: Fleet): number {
  if (fleet.ships.length === 0) return Infinity
  const avgSpeed = fleet.ships.reduce((sum, ship) => sum + ship.speed, 0) / fleet.ships.length
  const effectiveSpeed = avgSpeed * Math.max(0.5, route.windFavor)
  return Math.max(1, Math.ceil(route.distance / (effectiveSpeed * 24)))
}

export function calculateDailyConsumption(fleet: Fleet): { food: number; water: number } {
  const totalCrew = fleet.ships.reduce((sum, ship) => sum + ship.crew, 0)
  return {
    food: Math.ceil(totalCrew * 0.1),
    water: Math.ceil(totalCrew * 0.15),
  }
}

export function calculateRouteProgress(currentDay: number, totalDays: number): number {
  if (totalDays <= 0) return 1
  return Math.min(1, currentDay / totalDays)
}

export function getRoutesFromPort(portId: number, routes: Route[]): Route[] {
  return routes.filter(r => r.fromPortId === portId)
}

export function estimateArrival(route: Route, fleet: Fleet): Date {
  const days = calculateSailingDays(route, fleet)
  const arrival = new Date()
  arrival.setDate(arrival.getDate() + days)
  return arrival
}

/** 根据航行距离（海里）推断危险等级 */
export function dangerLevelFromDistance(distanceNm: number): 1 | 2 | 3 | 4 | 5 {
  if (distanceNm < 500) return 1
  if (distanceNm < 1500) return 2
  if (distanceNm < 3000) return 3
  if (distanceNm < 5000) return 4
  return 5
}
