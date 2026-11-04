import { isOnLand } from './landCheck'
import { DEBRIS_MAX, DEBRIS_SPAWN_CHANCE, DEBRIS_TTL_DAYS, type DebrisKind, type DebrisSpot } from '@/data/debris'

const KINDS: DebrisKind[] = ['barrel', 'crate', 'coins', 'bottle']

/**
 * 在船附近的海面上放一个漂流物。
 *
 * 【为什么锚在船位】漂流物要"被看见"才有意义。固定撒在全世界的结果是：
 * 99% 的漂流物在玩家一辈子不会去的海域里过期消失，白白占内存与视觉。
 * 挂在船附近 8~30 海里，就是"航行时偶尔瞥见水里有个东西"。
 *
 * 【为什么要试多次】直接取随机方位会落进陆地（尤其在地中海、爱琴海那种碎海岸）。
 * 每次重掷方位与距离，最多 12 次；都落在陆地上就这一轮不生成（宁可没有，
 * 也不要一个画在岸上的木桶 —— 海上异闻那次就是被这个坑咬过）。
 */
export function spawnDebris(
  around: readonly [number, number] | null,
  day: number,
  rand: () => number = Math.random,
): DebrisSpot | null {
  if (!around) return null
  const [lat0, lng0] = around
  for (let attempt = 0; attempt < 12; attempt++) {
    const bearing = rand() * Math.PI * 2
    // 8~30 海里：太近会压在船图标下面，太远在这一级缩放下看不见
    const distNm = 8 + rand() * 22
    // 1° 纬度 ≈ 60 海里；经度按纬度收缩
    const dLat = (Math.cos(bearing) * distNm) / 60
    const cosLat = Math.max(0.2, Math.cos((lat0 * Math.PI) / 180))
    const dLng = (Math.sin(bearing) * distNm) / (60 * cosLat)
    const lat = lat0 + dLat
    const lng = lng0 + dLng
    if (lat > 84 || lat < -84) continue
    // 经度跨越 180° 时归一到 [-180, 180]
    const normLng = ((lng + 540) % 360) - 180
    if (isOnLand(lat, normLng)) continue
    return {
      id: `debris-${day}-${Math.round(lat * 1e4)}-${Math.round(normLng * 1e4)}`,
      kind: KINDS[Math.floor(rand() * KINDS.length) % KINDS.length],
      lat,
      lng: normLng,
      bornDay: day,
    }
  }
  return null
}

/**
 * 每天推进时更新漂流物：先清过期的，再按概率补一个新的。
 *
 * 纯函数，输入输出都是数组 —— 这样"会不会无限增长""过期会不会真的消失"
 * 都能在单测里断言，不必开浏览器。
 */
export function advanceDebris(
  current: readonly DebrisSpot[],
  day: number,
  around: readonly [number, number] | null,
  opts: { sailing: boolean; rand?: () => number } = { sailing: true },
): DebrisSpot[] {
  const rand = opts.rand ?? Math.random
  // 漂走的
  const alive = current.filter(d => day - d.bornDay < DEBRIS_TTL_DAYS)
  // 停泊时不再生成：码头边漂着木桶不合理，而且那时玩家的注意力在面板上
  if (!opts.sailing) return alive
  if (alive.length >= DEBRIS_MAX) return alive
  if (rand() >= DEBRIS_SPAWN_CHANCE) return alive
  const spot = spawnDebris(around, day, rand)
  return spot ? [...alive, spot] : alive
}
