import type { Route, Fleet, OfficerId } from '@/types'

/** 领航员速度加成 */
const PILOT_SPEED_BONUS = 1.15

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

export function calculateSailingDays(route: Route, fleet: Fleet, officers: OfficerId[] = []): number {
  return daysForDistance(route.distance, dailyDistanceNm(fleet, officers, route.windFavor))
}

/**
 * 两点间的大圆距离（海里）。
 *
 * 放在这里而不是 store 私有函数里：航程总距离、剩余距离、进度百分比
 * 三者必须用**同一个**距离公式，否则进度条永远对不上。
 */
export function haversineNm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 0.539957
}

/**
 * 航线进度：已航行距离占总距离的比例。
 *
 * 之前的实现每帧都拿「当前位置 → 目标点」当分母，
 * 于是 progress 每帧都约等于 0（因为每帧只挪动一点点），
 * 航段边界永远跨不过去——航段抉择机制形同虚设。
 *
 * 现在分母是**航程总距离**（起航时算定一次，之后不变），
 * 分子是「总距离 − 当前到目标的剩余距离」。这样进度是单调累加的，
 * 而且天然自校正——船偏航时进度会略微回退，与真实航迹一致。
 */
export function routeProgressOf(totalNm: number, remainingNm: number): number {
  if (totalNm <= 0) return 0
  return Math.min(1, Math.max(0, (totalNm - remainingNm) / totalNm))
}

/**
 * 每日实际航程（海里/天）——**唯一权威口径**。
 *
 * 之前这里有三套互相打架的算法：
 *   - `calculateSailingDays` 用「距离 ÷ (航速×24)」
 *   - `SailingController` 用「移动度数 × 每海里度数」推算天数
 *   - `BottomBar` 显示的天数又额外除以航速档位倍率
 * 结果是：航速档位在**地图上的移动速度**变了，但**航程总天数**没变，
 * 而 UI 上显示的天数却变了——数字在骗人。
 *
 * 现在统一到这里：任何地方要问「这条航线要几天」，都走这个函数。
 * 乘数全部显式传进来，于是每一句"抢行真的少花几天"都能被验证。
 *
 * @param speedMul  航段方针的航速倍率（见 utils/segment.ts）
 * @param weatherMul 天候对航速的倍率（晴阴雨风暴雾各有不同）
 */
export function dailyDistanceNm(
  fleet: Fleet,
  officers: OfficerId[] = [],
  windFavor = 1,
  speedMul = 1,
  weatherMul = 1,
): number {
  if (fleet.ships.length === 0) return 0
  const avgSpeed = effectiveFleetSpeed(fleet, officers)
  return avgSpeed * Math.max(0.5, windFavor) * speedMul * Math.max(0.1, weatherMul) * 24
}

/** 按给定每日航程，抵达指定距离需要几天 */
export function daysForDistance(distanceNm: number, nmPerDay: number): number {
  if (nmPerDay <= 0) return Infinity
  return Math.max(1, Math.ceil(distanceNm / nmPerDay))
}

/**
 * 舰队有效速度：船员充足才有设计航速。
 * 船员率（实际/最大）低于 60% 时开始掉速，低于 20% 时只有一半速度。
 * 领航员在任时整体 +15%。
 */
export function effectiveFleetSpeed(fleet: Fleet, officers: OfficerId[] = []): number {
  if (fleet.ships.length === 0) return 0
  const speeds = fleet.ships.map(ship => {
    const crewRatio = ship.maxCrew > 0 ? ship.crew / ship.maxCrew : 1
    const penalty = crewRatio >= 0.6 ? 1 : 0.5 + (crewRatio / 0.6) * 0.5
    return ship.speed * penalty
  })
  const base = speeds.reduce((sum, s) => sum + s, 0) / speeds.length
  return officers.includes('pilot') ? base * PILOT_SPEED_BONUS : base
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
