import { ports } from '@/data/ports'
import type { Port } from '@/types'
import { calculateBearing, haversineNm } from '@/utils/navigation'

/**
 * 船上视角里"近岸"的判定与摆放。
 *
 * 【为什么需要】船上海面是一块无限延展的平板：不管在比斯开湾还是停在塞维利亚港，
 * 画面一模一样。玩家判断"到岸了没有"只能回海图看。近岸的岸线 + 灯塔是这个视角
 * 唯一的地理锚点。
 *
 * 【为什么不按真实比例放】1 场景单位 ≈ 18 米（船 36 米长 = 2 单位）。42 海里 =
 * 7.8 万米 = 4300 单位，透视下就是一条看不见的细线；而 2 海里 = 200 单位，
 * 岸会突然占满屏幕。所以距离用**非线性映射**到一个可读的半径上，
 * 这不是比例尺，是"景别"。UI 上的海里数来自真实距离，画面位置来自景别。
 */

/** 超过这个距离就不画岸：42 海里以外只该看到海 */
export const COAST_MAX_NM = 42

/**
 * 岸线最近能贴到多近（再近也不会撞到船）
 *
 * 【上限被海面尺寸卡住】海面的几何只有 140×140（半径 70），而它的 fragment
 * 在 d=28~62 之间把颜色混成天光色 —— 62 以外读作"地平线"。岸线画到 62 之外
 * 就会浮在那层天光色上，像一块悬在天里的板。所以最远只到 58。
 */
const COAST_NEAR_R = 24
/** 岸线最远铺到多远（<62，见上面） */
const COAST_FAR_R = 58

export interface CoastSighting {
  port: Port
  /** 真实距离（海里），HUD 直接显示这个数 */
  distNm: number
  /**
   * 港口相对**船头**的方位（度）。0 = 正前方，+90 = 右舷，−90 = 左舷。
   * 用它决定岸线画在场景的哪一边。
   */
  relBearingDeg: number
  /** 0..1：越近越大。1 = 贴岸，0 = 刚好在可视边缘 */
  presence: number
}

/** 最近的港口（不管多远） */
export function nearestPort(lat: number, lng: number): { port: Port; distNm: number } | null {
  let best: Port | null = null
  let bestD = Infinity
  for (const p of ports) {
    const d = haversineNm(lat, lng, p.latitude, p.longitude)
    if (d < bestD) {
      bestD = d
      best = p
    }
  }
  return best ? { port: best, distNm: bestD } : null
}

/** 把一个角度折到 −180..180（右正左负） */
export function wrapDeg(d: number): number {
  if (!Number.isFinite(d)) return 0
  const x = ((d % 360) + 540) % 360 - 180
  return x
}

/**
 * 找当前的近岸。
 *
 * 【为什么用"相对艏向"而不是绝对方位】镜头跟着船头走（相机永远在船尾后方），
 * 所以画面里的左/右只由相对角决定。用绝对方位的话，船一转向岸就"跳"到另一边。
 */
export function findCoast(
  lat: number,
  lng: number,
  headingDeg: number,
  maxNm: number = COAST_MAX_NM,
): CoastSighting | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const near = nearestPort(lat, lng)
  if (!near || near.distNm > maxNm) return null
  const bearing = calculateBearing(lat, lng, near.port.latitude, near.port.longitude)
  const head = Number.isFinite(headingDeg) ? headingDeg : 0
  // presence 用平方根：近处变化慢、远处散得快，靠近时"岸忽然变大"的感觉才对
  const t = Math.max(0, Math.min(1, 1 - near.distNm / maxNm))
  return {
    port: near.port,
    distNm: near.distNm,
    relBearingDeg: wrapDeg(bearing - head),
    presence: Math.pow(t, 0.65),
  }
}

/** 岸线在场景里的景别（半径、宽度、高度、灯塔高度） */
export interface CoastLayout {
  /** 岸线所在的水线半径 */
  radius: number
  /** 岸线总宽（世界单位），随半径增长才铺得满视野 */
  width: number
  /** 山脊最高点 */
  ridgeHeight: number
  /** 灯塔高度（地标：远处允许比真实比例大，否则看不见） */
  towerHeight: number
}

export function coastLayout(presence: number): CoastLayout {
  const p = Math.max(0, Math.min(1, Number.isFinite(presence) ? presence : 0))
  // 半径：presence=1 贴到 86，presence 越小越退远（指数让远处退得慢，看起来像"岸在远处横着"）
  const radius = COAST_NEAR_R + (COAST_FAR_R - COAST_NEAR_R) * Math.pow(1 - p, 1.7)
  /*
   * 宽度 = 2.0 × 半径：比"该距离上的可见全宽"大一圈。
   * 相机 fov 42°、宽高比 1.6 → 水平半视角 ≈ 31.5°，可见半宽 = radius·tan(31.5°) ≈ 0.61·radius，
   * 全宽 1.22·radius。取 2.0 倍既让岸伸出画面，又不至于超出海面（半径 70）。
   */
  const width = radius * 2.0
  return {
    radius,
    width,
    ridgeHeight: radius * 0.055,
    /*
     * 灯塔高度：**故意比"真实比例"高**。
     * 它是这张图上唯一能一眼说出"这里有人"的东西，按比例给（真实灯塔 30 米 ≈ 0.17 单位）
     * 在 24 单位外只有 5 像素。给 3.0 后屏幕上约 90px，才读得出塔与光。
     * 与 2D 海图上"港口图标比真实城市大"是同一个取舍。
     */
    towerHeight: Math.max(3.0, Math.min(5.6, radius * 0.062)),
  }
}

/**
 * 岸线在场景里的坐标：**只做左右偏移，不按方位旋转**。
 *
 * 【为什么不旋转】第一版把整组按 `-relBearing` 绕 Y 转，想让岸"真正在那一侧"。
 * 实测停泊时（相对方位 −78°）整条岸连同灯塔被转到 56° 偏轴——远超水平半视角
 * 31.5°，直接出画（截图上岸只剩左边缘一小条，灯塔完全不见）。
 * 原因：岸线本来就是一条很长的横带，转过去只会把长边转成"竖边"。
 *
 * 【现在的语义】岸**永远横贯远处**，用左右偏移表示"港口在左还是右"；
 * 前后关系不画（岸在身后时视野里本来就看不到，见 `COAST_HIDE_BEHIND_DEG`），
 * 精确方位与距离由 HUD 的文字给。画面表达景别，文字表达方位，各管一件事。
 *
 * 【符号为什么是负的 sin】相机在船尾后方（z 为负）看向 +Z，等于绕 Y 转了 180°，
 * 于是**屏幕右侧是世界 −X**。"右舷有岸"要放在 −X；写反的话岸在相反一侧，
 * 看着还挺对，只有拿已知方位对账才发现。
 */
export const COAST_HIDE_BEHIND_DEG = 120

export function coastScenePos(relBearingDeg: number, radius: number): { x: number; z: number } {
  const rad = (Number.isFinite(relBearingDeg) ? relBearingDeg : 0) * Math.PI / 180
  return { x: -Math.sin(rad) * radius * 0.5, z: radius }
}

/**
 * 罗盘方位词（八向）。
 *
 * 【为什么不复用 `bearingWord`】那个是**相对船首**的说法（左前方/右舷），
 * 只对"看得见的东西"有意义。风是绝对方位（`weather.windDir` 是**风吹去**的
 * 罗盘方位），瞭望手报的是"风往东北去"，不是"右前方有风"。
 */
export function compassWord(deg: number): string {
  const names = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  /*
   * `wrapDeg` 把 190° 折成 −170°，`Math.round(-170/45) = -4`，`-4 % 8` 在 JS 里还是
   * **−4**（取余保留符号）→ `names[-4]` 是 undefined。单测就是在这里炸的。
   * 要两次取模才是非负下标。
   */
  const i = (((Math.round(wrapDeg(deg) / 45) % 8) + 8) % 8)
  return names[i]
}

/** HUD 用的方位词：左前方 / 右舷 / 正后方 …… */
export function bearingWord(relBearingDeg: number): string {
  const a = wrapDeg(relBearingDeg)
  const abs = Math.abs(a)
  if (abs < 12) return '正前方'
  if (abs > 168) return '正后方'
  const side = a > 0 ? '右' : '左'
  if (abs < 55) return `${side}前方`
  if (abs < 125) return `${side}舷`
  return `${side}后方`
}

/** 山脊起伏（单位宽度 −0.5..0.5 上的采样，确定性的哈希，保证每次启动一致） */
export function hash01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * 山脊高度剖面（每段一个值，0..约 1）。
 *
 * 【为什么放在这个纯模块里】岸上的树必须站在坡面上，"树不飘"这件事要能被单测
 * 直接验：几何与植被读**同一份**采样，插值也走同一个函数（`ridgeHeightAt`）。
 */
export function ridgeHeights(segments = 72): number[] {
  const out: number[] = []
  for (let i = 0; i <= segments; i++) {
    const u = i / segments
    // 三层起伏叠加：大屿 + 小山 + 碎丘；两端压低，岸线才不像被裁断
    const edgeFade = Math.sin(Math.PI * u) ** 0.6
    // 低频岬角：让岸线有几处明显的高地，不然整条岸像一条正弦波
    const cape = 0.22 * Math.sin(u * Math.PI * 3.1 + 1.3) * Math.sin(u * Math.PI * 1.7)
    out.push((0.62 + 0.26 * hash01(i * 3.1) + 0.15 * hash01(i * 7.7 + 11) + 0.08 * hash01(i * 13.3 + 29) + cape) * edgeFade)
  }
  return out
}

/** 任意 u（0..1）处的山脊高度：在相邻两个采样点之间线性插值 */
export function ridgeHeightAt(u: number, segments = 72): number {
  const hs = ridgeHeights(segments)
  const fi = Math.max(0, Math.min(segments - 1e-9, u * segments))
  const i0 = Math.floor(fi)
  const frac = fi - i0
  return hs[i0] + (hs[Math.min(segments, i0 + 1)] - hs[i0]) * frac
}
