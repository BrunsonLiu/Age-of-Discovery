/**
 * 航线几何 —— **唯一权威路径**。
 *
 * 【这个模块解决什么】
 *
 * 之前船和航线是两套互不相干的几何：
 *   - 地图上画的是二次贝塞尔弧（RouteLine.createArcPoints）
 *   - 船走的是 lat/lng 直线插值（SailingController）
 * 玩家看到船在「航线」旁边漂着走。触控礁分支还有个瞬移 bug：
 * 船一碰岸就被传送到航线中点，进度条瞬间跳到 47%、天数却停在第 1 天。
 *
 * 现在这个模块产出**一条**路径，地图画它、船沿它走、
 * 里程与天数都从它的采样点累计得到。三者永远一致。
 *
 * 【路径怎么生成】
 *
 * 1. 在海面上用 A\* 搜一条真正的航路（见 utils/seaRoute.ts）。
 *    大圆是几何最短但常常不可航——塞维利亚在内陆，
 *    大圆第一段就撞伊比利亚半岛；去好望角的大圆横穿撒哈拉。
 *    水手的做法是沿海岸绕行，A\* 就是把这件事算出来。
 * 2. 简化折线，去掉逐格锯齿。
 * 3. 折线段之间用大圆弧连接并重采样，得到带**累计里程**的采样点。
 * 4. **验证**：逐段密集采样检查是否压到陆地。
 *    简化会切角跨过海角、大圆弧会偏离折线——两者都可能把航线推进陆地。
 *    一旦发现穿陆，就退回到更保守的简化档位；全都穿陆则直接用 A* 原始格点。
 *
 * 于是「走到第几个采样点」= 「走了多少海里」，
 * 天数 = 累计里程 / 每日航程，进度 = 累计里程 / 总里程——同一个数。
 */

import { findSeaPath, simplifyPath, greatCircleAt, isLandAt } from '@/utils/seaRoute'

/** 路径采样点：纬度、经度，以及从起点到该点的累计里程（海里） */
export interface RoutePoint {
  lat: number
  lng: number
  /** 从起点到该点的累计里程（海里） */
  cumNm: number
}

/** 一条完整航线的几何 */
export interface RouteGeometry {
  /** 采样点（含起点与终点） */
  points: RoutePoint[]
  /** 航线总里程（海里）——最后一个点的 cumNm */
  totalNm: number
  /** 起点 */
  from: [number, number]
  /** 终点 */
  to: [number, number]
  /** 诊断：A* 展开节点数 */
  expansions: number
  /** 诊断：生成耗时（毫秒） */
  elapsedMs: number
}

/** 每海里对应多少度纬度 */
const NM_PER_DEG_LAT = 60
/** 每段弧的采样数 */
const ARC_SAMPLES = 10
/** 验证穿陆时的采样间隔（海里） */
const VALIDATE_STEP_NM = 1.5

/**
 * 几何采样间隔上限（海里）。
 *
 * **必须与航行控制器的 MAX_STEP_NM 一致**（见 SailingController.tsx）。
 *
 * 之前没有这一步，DP 简化后的航路点间距实测高达 221 海里，
 * 于是出了两个互相勾连的致命问题：
 *
 * 1) **验证与实走不是同一条线**。pathTouchesLand 按大圆弧以 1.5 海里
 *    密集插值检查，而 positionAtNm 在两航路点之间做的是 lat/lng **线性**
 *    插值。粗段上两者能差出好几海里——大圆弧贴着海面走，
 *     lat/lng 直线却从海角上切过去。实测塞维利亚出港 9 海里就"触礁"，
 *    而 pathTouchesLand 坚定认为这条线没压陆（它查的是另一条线）。
 * 2) **船一步跨过 221 海里里的陆地**。子步进上限是 8 海里，
 *    但两个航路点之间的陆地它一格都躲不开。
 *
 * 现在几何自身就密到 8 海里一格：线性与大圆的差降到 0.05 海里以下，
 * 验证查的就是船要走的线；海岸线也能被老老实实贴出来。
 */
const GEOM_STEP_NM = 8

/**
 * 把折线加密到 ≤GEOM_STEP_NM 的间距（段内走大圆弧）。
 */
function densify(points: [number, number][]): [number, number][] {
  if (points.length < 2) return points
  const out: [number, number][] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const segNm = greatCircleNm(a[0], a[1], b[0], b[1])
    const n = Math.max(1, Math.ceil(segNm / GEOM_STEP_NM))
    for (let k = 1; k <= n; k++) {
      out.push(greatCircleAt(a, b, k / n))
    }
  }
  return out
}

/**
 * 两点间的大圆距离（海里）。
 *
 * 与 navigation.ts 的 haversineNm 是同一个公式，但这里刻意独立一份：
 * navigation 是「业务口径」，这里要能被单独测试。
 * 两者若不一致，进度条与天数就会打架。
 */
export function greatCircleNm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 0.539957
}

/** 大圆插值（slerp）：球面上两点间比例 f∈[0,1] 的点 */
export function greatCirclePoint(
  from: [number, number],
  to: [number, number],
  f: number,
): [number, number] {
  return greatCircleAt(from, to, f)
}

/**
 * 折线段之间用大圆弧连接并重采样。
 */
function resampleWithArcs(raw: [number, number][]): [number, number][] {
  const sampled: [number, number][] = []
  for (let i = 0; i < raw.length - 1; i++) {
    const a = raw[i]
    const b = raw[i + 1]
    const segNm = greatCircleNm(a[0], a[1], b[0], b[1])
    // 短段直接连，长段插弧采样（保证里程分布均匀）
    const n = segNm > 40 ? ARC_SAMPLES : 1
    for (let k = 0; k < n; k++) {
      sampled.push(greatCircleAt(a, b, k / n))
    }
  }
  if (raw.length > 0) sampled.push(raw[raw.length - 1])
  return sampled
}

/**
 * 检查采样路径是否压到陆地。
 *
 * 采样点之间还有缝隙——两点的直线段可能正好从海角上切过去，
 * 所以要按 VALIDATE_STEP_NM 的间隔在段内密集插值再判。
 */
export function pathTouchesLand(points: [number, number][]): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const segNm = greatCircleNm(a[0], a[1], b[0], b[1])
    const steps = Math.max(1, Math.ceil(segNm / VALIDATE_STEP_NM))
    for (let k = 0; k <= steps; k++) {
      if (k === 0 && i === 1) {
        // 起点允许落在陆地上（港口在掩码里可能被挖了航道）
        if (isLandAt(a[0], a[1])) continue
      }
      const p = greatCircleAt(a, b, k / steps)
      if (isLandAt(p[0], p[1])) return true
    }
  }
  return false
}

/**
 * 生成航线几何。
 *
 * @param from 起点 [纬度, 经度]
 * @param to   终点 [纬度, 经度]
 */
export function buildRouteGeometry(from: [number, number], to: [number, number]): RouteGeometry {
  // 1) 搜海路
  const sea = findSeaPath(from, to)

  let raw: [number, number][]
  let sampled: [number, number][]
  let expansions = 0
  let elapsedMs = 0

  if (sea.found && sea.points.length >= 2) {
    expansions = sea.expansions
    elapsedMs = sea.elapsedMs
    // 2) 简化锯齿 → 3) 大圆弧重采样 → 4) **加密到 8 海里** → 5) 验证
    //    简化档位从粗到细，任一档位不穿陆就采用它。
    //    越粗 = 点越少 = 地图上越顺滑；越细 = 越贴海岸 = 越安全。
    //
    //    验证必须作用在**加密后的**路径上：简化可以把两个相距 200 海里的
    //    航路点直接连起来，中间的陆地它一笔就带过了。加密之后
    //    每一段都短到 8 海里，pathTouchesLand 查到的才真是船要走的线。
    const tolerances = [0.15, 0.06, 0]
    let chosen: [number, number][] | null = null
    for (const tol of tolerances) {
      const simplified = tol > 0 ? simplifyPath(sea.points, tol) : sea.points
      const candidate = densify(resampleWithArcs(simplified))
      if (!pathTouchesLand(candidate)) {
        chosen = candidate
        break
      }
    }
    // 全都穿陆 → 用 A* 原始格点加密（格心必在海里，只有起终点可能例外）
    raw = chosen ?? densify(resampleWithArcs(sea.points))
    sampled = raw
  } else {
    // 掩码未加载或无路可走 → 退化为大圆（宁可穿陆也不要卡死玩家）
    expansions = 0
    elapsedMs = 0
    raw = []
    const segments = 24
    for (let i = 0; i <= segments; i++) {
      raw.push(greatCircleAt(from, to, i / segments))
    }
    sampled = densify(raw)
  }

  // 5) 累计里程
  const points: RoutePoint[] = []
  let cum = 0
  for (let i = 0; i < sampled.length; i++) {
    if (i > 0) {
      cum += greatCircleNm(sampled[i - 1][0], sampled[i - 1][1], sampled[i][0], sampled[i][1])
    }
    points.push({ lat: sampled[i][0], lng: sampled[i][1], cumNm: cum })
  }

  return { points, totalNm: cum, from, to, expansions, elapsedMs }
}

/**
 * 按已航行里程求船的位置。
 *
 * @param geom 航线几何
 * @param traveledNm 已航行的里程（海里）
 */
export function positionAtNm(
  geom: RouteGeometry,
  traveledNm: number,
): { lat: number; lng: number; cumNm: number } {
  const pts = geom.points
  if (pts.length === 0) return { lat: geom.from[0], lng: geom.from[1], cumNm: 0 }
  if (pts.length === 1) return { lat: pts[0].lat, lng: pts[0].lng, cumNm: pts[0].cumNm }

  const d = Math.max(0, Math.min(geom.totalNm, traveledNm))

  // 找到 d 落在哪一段
  let i = 1
  while (i < pts.length && pts[i].cumNm < d) i++
  if (i >= pts.length) {
    const last = pts[pts.length - 1]
    return { lat: last.lat, lng: last.lng, cumNm: last.cumNm }
  }

  const a = pts[i - 1]
  const b = pts[i]
  const span = b.cumNm - a.cumNm
  const t = span > 1e-9 ? (d - a.cumNm) / span : 0
  // 插值必须用**大圆**，与 pathTouchesLand 的验证口径一致。
  // 之前这里是 lat/lng 线性插值：几何点密了之后两者差异不足 0.05 海里，
  // 但口径分裂本身就是隐患——验证说没陆、船走的线却压陆，
  // 这种事一旦发生就是"船在自己规划的航线上触礁"。
  const p = greatCircleAt([a.lat, a.lng], [b.lat, b.lng], t)
  return { lat: p[0], lng: p[1], cumNm: d }
}

/**
 * 由位置反推已航行里程。
 *
 * 用于「读档」——存档里存的是船的坐标，恢复时需要知道它走了多远。
 *
 * **必须做线段投影，不能只比顶点**：
 * 只找最近采样点时，误差等于「最近顶点到真实位置的距离」，
 * 而顶点间距在大圆弧重采样后可达上百海里（跨洋直线段尤其稀疏），
 * 实测误差 106 nm —— 读档瞬间船会往前跳 100 多海里，正是瞬移。
 *
 * 现在对每一段做局部等距圆柱投影（以段中点为原点，x 向东 y 向北，单位海里），
 * 取垂足并线性插值里程。位置本来就落在路径上，所以反算误差降到亚海里级。
 */
export function traveledNmAt(geom: RouteGeometry, lat: number, lng: number): number {
  const pts = geom.points
  if (pts.length === 0) return 0
  if (pts.length === 1) return pts[0].cumNm

  const toRad = Math.PI / 180
  const R_NM = 3440.065 // 地球平均半径（海里）
  let best = pts[0].cumNm
  let bestDist = Infinity

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const span = b.cumNm - a.cumNm
    if (span <= 1e-9) {
      const d = greatCircleNm(lat, lng, a.lat, a.lng)
      if (d < bestDist) { bestDist = d; best = a.cumNm }
      continue
    }
    // 局部平面：以本段中点为基准，把经纬度差换算成海里
    const midLat = (a.lat + b.lat) * 0.5
    const kx = R_NM * toRad * Math.cos(midLat * toRad)
    const ky = R_NM * toRad
    const ax = (a.lng - lng) * kx
    const ay = (a.lat - lat) * ky
    const bx = (b.lng - lng) * kx
    const by = (b.lat - lat) * ky
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    let t = len2 > 1e-12 ? -(ax * dx + ay * dy) / len2 : 0
    if (t < 0) t = 0
    else if (t > 1) t = 1
    const d = Math.hypot(ax + t * dx, ay + t * dy)
    if (d < bestDist) {
      bestDist = d
      best = a.cumNm + t * span
    }
  }
  return best
}

/** 把路径采样点转成 Leaflet 需要的 [lat, lng][] 数组 */
export function toLatLngList(geom: RouteGeometry): [number, number][] {
  return geom.points.map(p => [p.lat, p.lng] as [number, number])
}

/**
 * 记忆化的航线几何。
 *
 * 地图（RouteLine）与船（SailingController）都调这个函数拿几何，
 * 于是两边拿到的是**同一个对象**——图上画的那条线就是船走的那条线。
 *
 * 为什么必须记忆化而不是各算各的：
 * A\* 搜索一次要几十到几百毫秒。而且若两边各自计算，
 * 可能一个在掩码加载前算（退化成直线）、另一个在加载后算（真正的海路），
 * 于是地图上的线和船走的路分叉。记忆化从根上杜绝了这件事。
 */
const geomCache = new Map<string, RouteGeometry>()

/** 记忆化键：起点与终点各取 4 位小数（≈11 米精度，足够） */
function geomKey(from: [number, number], to: [number, number]): string {
  return `${from[0].toFixed(4)},${from[1].toFixed(4)}->${to[0].toFixed(4)},${to[1].toFixed(4)}`
}

export function getRouteGeometry(from: [number, number], to: [number, number]): RouteGeometry {
  const key = geomKey(from, to)
  const cached = geomCache.get(key)
  if (cached) return cached
  const geom = buildRouteGeometry(from, to)
  geomCache.set(key, geom)
  return geom
}

/** 掩码加载完成后需要清缓存——之前算的可能是退化的直线 */
export function invalidateRouteGeometryCache(): void {
  geomCache.clear()
}

/** 度数位移换算成海里 */
export function degToNm(deg: number): number {
  return Math.abs(deg) * NM_PER_DEG_LAT
}
