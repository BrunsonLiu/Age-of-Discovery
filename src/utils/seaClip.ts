/**
 * 把"海上的线"裁到水里：**纯计算**，不碰 Leaflet。
 *
 * 【为什么需要】洋流与风箭头是按**经纬度**摆的，谁也不看陆地长什么样：
 *   · 南赤道流的最后一个点是 `[-8, 30]` —— 那是坦桑尼亚内陆；
 *   · 它和前一个点 `[-10, 55]` 连成的直线**横穿马达加斯加与莫桑比克**；
 *   · 风箭头更直接：在 `lat -60..60 × lng -100..120`、每 15° 撒一个，
 *     撒到哪儿算哪儿，于是撒哈拉、西伯利亚、澳大利亚内陆上都有箭头。
 * 玩家看到的是"洋流从非洲大陆中间穿过去""阿拉伯沙漠里刮着信风"。
 *
 * 【为什么不直接改数据】改数据只是把这 7 条线摆对，**下次加一条洋流又会错**；
 * 而且"这条线有没有穿过陆地"靠人眼看纬度是查不出来的（马达加斯加只有
 * 12° 长，在 1440px 的世界图上就是 40 像素）。所以按陆地掩码裁 ——
 * `isOnLand` 与港口判定、上岸判定是同一个来源（`utils/landCheck`）。
 */

/** 一个经纬度点（[纬度, 经度]，与项目其它地方的顺序一致） */
export type LatLng = [number, number]

/** 两点间的近似距离（度）。**只用来丢掉太短的碎段**，不用来报航程 */
function approxDeg(a: LatLng, b: LatLng): number {
  const dLat = b[0] - a[0]
  // 经度差按纬度收缩（cos φ）：否则高纬度的碎段会被估得过长
  const dLng = (b[1] - a[1]) * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180))
  return Math.hypot(dLat, dLng)
}

/**
 * 加密：保证相邻两点不超过 `stepDeg`（度）。
 *
 * 【为什么必须加密才能裁】`isOnLand` 是**逐点**判的。原来一条边可能跨 25°
 * （[-10,55] → [-8,30]），中间马达加斯加整个被跳过 —— 只看端点是查不出来的。
 * 加密到 0.5° 之后，"是否穿陆"就变成"某一小段的中点是否在陆地上"。
 */
export function densify(points: readonly LatLng[], stepDeg = 0.5): LatLng[] {
  if (!points.length) return []
  if (!Number.isFinite(stepDeg) || stepDeg <= 0) return points.map((p) => [p[0], p[1]])
  const out: LatLng[] = [[points[0][0], points[0][1]]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (!Number.isFinite(b[0]) || !Number.isFinite(b[1])) continue
    const span = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))
    const n = Math.max(1, Math.ceil(span / stepDeg))
    for (let k = 1; k <= n; k++) {
      out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
    }
  }
  return out
}

/**
 * 按陆地掩码把一条折线切成若干"全在水里"的段。
 *
 * @param points    原始折线（[lat, lng]）
 * @param onLand    陆地判定（传 `landCheck.isOnLand`）
 * @param stepDeg   加密步长（度），默认 0.5
 * @param minRunDeg 太短的碎段直接丢掉（度），默认 1.5 —— 一段 0.4° 的洋流
 *                  在屏幕上只有 2 个像素，只会变成一粒噪点
 * @returns 若干段折线（每段至少 2 点）；全在陆地上时返回空数组
 */
export function splitAtLand(
  points: readonly LatLng[],
  onLand: (lat: number, lng: number) => boolean,
  stepDeg = 0.5,
  minRunDeg = 1.5,
): LatLng[][] {
  const dense = densify(points, stepDeg)
  const runs: LatLng[][] = []
  let cur: LatLng[] | null = null

  const lengthOf = (run: LatLng[]) => {
    let sum = 0
    for (let i = 1; i < run.length; i++) sum += approxDeg(run[i - 1], run[i])
    return sum
  }
  const close = () => {
    if (cur && cur.length >= 2 && lengthOf(cur) >= minRunDeg) runs.push(cur)
    cur = null
  }

  for (const p of dense) {
    if (onLand(p[0], p[1])) {
      close()
    } else {
      if (!cur) cur = []
      cur.push(p)
    }
  }
  close()
  return runs
}

/**
 * 过滤"海上的点"（风箭头这种单点装饰）。
 *
 * 与 `splitAtLand` 同一个判据，只是这些装饰没法裁、只能整颗丢掉。
 * 丢掉之后网格会出现空洞（陆地上本来也不该有箭头），这是**正确**的空洞。
 */
export function filterSeaPoints<T extends { lat: number; lng: number }>(
  sites: readonly T[],
  onLand: (lat: number, lng: number) => boolean,
): T[] {
  return sites.filter((s) => !onLand(s.lat, s.lng))
}
