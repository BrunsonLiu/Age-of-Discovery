/**
 * 商船的尾迹：**纯计算**，不碰 Leaflet。
 *
 * 【为什么要它】2D 海图上"会动的东西"只有玩家座舰（带艏浪素材）和三艘商船
 * （一个会转的船图标）。商船走的是真实 A* 航线、位置由时刻函数算出来，
 * 但画面上看不出它"从哪儿来"—— 一艘悬在水上的图钉。
 *
 * 【为什么不用贴图】玩家座舰的尾迹是一张 V 形浪花素材（`FX_ASSETS.bowWave`），
 * 只能画在船的正后方、且不随航向弯折。商船沿折线走，转弯时贴图会横着插进海里。
 * 这里改成**沿它真正走过的折线**取一段：位置由里程决定，所以尾迹永远落在航迹上，
 * 也永远和船的实际位置同源（同一个 `positionAtNm`）。
 */
import { positionAtNm, type RouteGeometry } from './routePath'

/** 尾迹默认长度（海里）：约船长的 6~8 倍，够看出方向又不拖成一条长蛇 */
export const WAKE_DEFAULT_NM = 60

/** 尾迹想在屏幕上占多长（像素）：约商船图标的 2 倍 */
export const WAKE_SCREEN_PX = 90

/** 但实际长度要夹一下（海里）：太短量不出方向，太长会横跨半个洋 */
export const WAKE_MIN_NM = 40
export const WAKE_MAX_NM = 400

/**
 * 把"屏幕上想要的长度"换成海里的航迹长度。
 *
 * 【为什么尾迹不能是固定海里数】商船图标是**固定像素大小**的（46px），
 * 而尾迹如果固定 60 海里：zoom 5 时 27px（看得见），world zoom 时只有 **3px**
 * —— 一个点。反过来若固定成"很长"，近岸时又会拖出一条横穿海岸的长蛇。
 * 所以长度按当前缩放的「1 海里多少像素」换算，屏幕长度恒定，
 * 海里数被夹在 [40, 400] 之间。
 */
export function wakeNmForScreen(pxPerNm: number): number {
  if (!Number.isFinite(pxPerNm) || pxPerNm <= 0) return WAKE_DEFAULT_NM
  return Math.max(WAKE_MIN_NM, Math.min(WAKE_MAX_NM, WAKE_SCREEN_PX / pxPerNm))
}

/** 一段尾迹最多取几个点（几何点可能几百个，逐帧 setLatLngs 会卡） */
export const WAKE_MAX_POINTS = 14

/** 抽稀到最多 n 个点（保留首尾） */
function thin(points: [number, number][], n: number): [number, number][] {
  if (points.length <= n) return points
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    out.push(points[Math.round((i * (points.length - 1)) / (n - 1))])
  }
  return out
}

/**
 * 船身后方那一段航迹（从"当前位置"往回 `wakeNm` 海里）。
 *
 * @param geom     航线几何（与商船位置用的是同一份）
 * @param posNm    船当前沿几何的里程（海里）
 * @param sign     行进方向：1 = 正向，-1 = 返程
 * @param wakeNm   尾迹长度（海里）
 * @returns [lat, lng] 序列；**船在航线端点、身后没有航迹时返回空数组**（不画）
 */
export function wakePolyline(
  geom: RouteGeometry,
  posNm: number,
  sign: 1 | -1,
  wakeNm = WAKE_DEFAULT_NM,
): [number, number][] {
  if (!Number.isFinite(posNm) || !Number.isFinite(wakeNm) || wakeNm <= 0) return []
  const cur = Math.max(0, Math.min(geom.totalNm, posNm))
  /*
   * "身后"要按行进方向算：返程（sign=-1）时船尾在里程更大的那一侧。
   * 第一版只按 sign=1 写，返程的船尾迹会画到它**前面**去 —— 看起来像
   * 船在倒着开。
   */
  const tailNm = cur - sign * wakeNm
  const lo = Math.max(0, Math.min(cur, tailNm))
  const hi = Math.min(geom.totalNm, Math.max(cur, tailNm))
  // 身后没有航迹（刚出发 / 刚好到端点）
  if (hi - lo < 0.5) return []

  const a = positionAtNm(geom, lo)
  const b = positionAtNm(geom, hi)
  const mids: [number, number][] = []
  for (const p of geom.points) {
    if (p.cumNm > lo + 1e-6 && p.cumNm < hi - 1e-6) mids.push([p.lat, p.lng])
  }
  /*
   * 中间点必须取**几何自己的顶点**，不能等距插值：A* 的折线是绕着海岸走的，
   * 两端点之间直接连一条线会横穿陆地（尾迹是最不该穿陆的东西）。
   */
  const pts: [number, number][] = [[a.lat, a.lng], ...mids, [b.lat, b.lng]]
  /*
   * 【统一顺序：尾 → 头】正向时 lo 是船尾、hi 是船；返程时正好相反，
   * 于是同一个函数会返回两种顺序。折线本身不关心方向，但**判据关心**
   * （"最后一个点必须是船位"是最容易写的断言），而且将来要做"越靠近船越亮"
   * 的渐变时，顺序必须固定。所以返程这里翻一次，让末尾永远是船。
   */
  if (sign < 0) pts.reverse()
  return thin(pts, WAKE_MAX_POINTS)
}
