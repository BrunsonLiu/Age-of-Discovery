import { calculateBearing, haversineNm } from '@/utils/navigation'
import { OCEAN_CURRENTS, currentFlowPoints } from '@/data/mapLayers'

/**
 * 洋流对航速的影响：顺流快、逆流慢。
 *
 * 【为什么这件事值得做】
 * 洋流一直只是地图上的虚线——它不参与任何计算。而大航海时代最实在的地理知识
 * 就是"顺着流走"：湾流把船从加勒比推回欧洲，阿古拉斯沿岸流把船从印度洋那边
 * **顶回来**（所以从印度回欧洲的人宁可走外海绕开它）。这些不是设定，是航线选择。
 *
 * 【口径放在哪】与季节现象完全同一条管线：按航段长度加权得出一个乘数，
 * 乘进 `windFavor`（见 utils/voyage.windFavorForRoute）。于是"面板报的天数"
 * 与"船每天实际推进"仍然只有一个来源。
 *
 * 【只影响有洋流经过的那几片海】
 * 数据里只有 7 条洋流（湾流、两条赤道流、加那利、本格拉、阿古拉斯、季风漂流）。
 * 别的海域一律 1.0 —— 不假装整个世界都有流。
 */

/**
 * 洋流带半宽（海里）。
 *
 * 真实洋流的主轴只有几十到一百公里宽，但"受它影响的表层水"要宽得多。
 * 取 140 海里是个折中：更窄的话，A* 贴着岸走的航线几乎碰不到数据里那几条
 * 粗折线（它们只有 3~5 个节点）；更宽的话，半个大西洋都算"在流里"，
 * 那就不是洋流而是气候了。
 */
const BAND_NM = 200

/**
 * 每节流速对应多少航速增减。
 *
 * 0.05 → 湾流 2.0 节 = ±10%，阿古拉斯 2.2 节 = ±11%。
 * 量级参考：6 节船遇上 2 节逆流，实际对地速度的确掉 25%~30%，
 * 但本作的日航程是抽象值（顺风 267 海里/天），照搬真实比例会把
 * 一趟 10 天的航程变成 13 天——那一趟的补给判定、掮客收益全部要重调。
 * 先取 0.05，让"顺流/逆流"能读出几天差别，又不至于压过季风。
 */
const GAIN_PER_KNOT = 0.1

export interface CurrentSample {
  /** 洋流流向（罗盘方位角，0=北） */
  bearing: number
  /** 流速（节） */
  knots: number
  /** 0~1：这一点在洋流带里的权重（中心 1，边缘 0） */
  weight: number
  name: string
}

/** 把 [lat,lng] 段投影到局部平面，返回点到线段的距离（海里）与投影参数 */
function distToSegmentNm(
  lat: number, lng: number,
  a: [number, number], b: [number, number],
): number {
  // 小范围用等距圆柱近似即可（洋流带 140 海里，误差 <0.3%）
  const kx = Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180) * 60
  const ky = 60
  const ax = (a[1]) * kx, ay = (a[0]) * ky
  const bx = (b[1]) * kx, by = (b[0]) * ky
  const px = lng * kx, py = lat * ky
  const vx = bx - ax, vy = by - ay
  const wx = px - ax, wy = py - ay
  const len2 = vx * vx + vy * vy
  let t = len2 > 0 ? (wx * vx + wy * vy) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  const dx = px - (ax + vx * t)
  const dy = py - (ay + vy * t)
  return Math.hypot(dx, dy)
}

/**
 * 该点所在的洋流（取最近的一条）。
 *
 * 只返回一条：洋流带之间没有真实的重叠区，
 * 而且两条流叠加会让乘数变成"天气骰子"，玩家算不清自己在顺什么。
 */
export function currentAt(lat: number, lng: number, day: number): CurrentSample | null {
  let best: CurrentSample | null = null
  let bestD = Infinity
  for (const cur of OCEAN_CURRENTS) {
    // 会随季风掉头的（季风漂流）在这里换向 —— 与 2D/3D 的虚线流动同一份点序
    const pts = currentFlowPoints(cur, day)
    for (let i = 1; i < pts.length; i++) {
      const d = distToSegmentNm(lat, lng, pts[i - 1], pts[i])
      if (d < bestD) {
        bestD = d
        best = {
          bearing: calculateBearing(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]),
          knots: cur.knots,
          weight: 0,
          name: cur.name,
        }
      }
    }
  }
  if (!best || bestD > BAND_NM) return null
  // 中心满强度，边缘 0（线性）
  best.weight = 1 - bestD / BAND_NM
  return best
}

/**
 * 一条航线被洋流影响后的整体乘数（1 = 不受影响）。
 *
 * 按航段长度加权：整段都在湾流里 vs 只在边缘擦过，平均下来当然不一样。
 * 与 `routePhenomenonFactor` 用的是同一套加权写法——两个因子都乘进 windFavor，
 * 加起来才是"这一趟顺不顺"。
 */
export function routeCurrentFactor(
  points: { lat: number; lng: number }[],
  day: number,
): number {
  if (points.length < 2) return 1
  let totalNm = 0
  let acc = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const seg = haversineNm(a.lat, a.lng, b.lat, b.lng)
    if (seg <= 0) continue
    totalNm += seg
    const midLat = (a.lat + b.lat) / 2
    const midLng = (a.lng + b.lng) / 2
    const cur = currentAt(midLat, midLng, day)
    if (!cur) { acc += seg * 1; continue }
    /*
     * 顺流 = 航向与流向同向（夹角 0）→ +；逆流（夹角 180）→ −。
     * 夹角用 cos 正好：0 → +1，90°（横着穿过流）→ 0，180° → −1。
     * 横穿洋流不减也不加，这与真实航海经验一致——你只是被横着推了一点，
     * 补舵就能抵掉，对里程几乎无影响。
     */
    const heading = calculateBearing(a.lat, a.lng, b.lat, b.lng)
    let d = Math.abs(heading - cur.bearing)
    if (d > 180) d = 360 - d
    const align = Math.cos(d * Math.PI / 180)
    const f = 1 + cur.knots * GAIN_PER_KNOT * align * cur.weight
    acc += seg * f
  }
  if (totalNm <= 0) return 1
  return +(acc / totalNm).toFixed(4)
}
