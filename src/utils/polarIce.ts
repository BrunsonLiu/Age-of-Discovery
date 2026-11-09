import { mercNorm } from '@/utils/mapProjection'
import { seasonAt } from '@/utils/season'

/**
 * 极地冰盖：让"地图上的白"变成一件真实的东西。
 *
 * 【为什么必须做】painted-land.png 把整块大陆都画成同一个米黄色调——
 * 连**南极洲和格陵兰**也是米黄。一个玩家拉开看全球，第一眼就是
 * "南边那块土黄的大陆是什么"，而这在真实世界里是两块冰盖。
 * 这不需要新素材，也不需要程序化噪声，只需要在两块冰盖的范围内
 * 把颜色往冷白推——纸面调子不会被破坏（冰本来就是白的）。
 *
 * 【为什么不是"按纬度刷白"】按纬度一刀切会把挪威（68°N）、西伯利亚
 * （70°N）、阿拉斯加全刷成冰，而它们不是。这里只用**两块真正的冰盖**：
 *   南极洲：纬线以南（无经度限制）
 *   格陵兰：59~84°N、74~10°W
 * 这两个范围是地理事实，不是美术偏好。
 *
 * 【为什么随季节伸缩】冰缘本来就是一年一涨一落的。
 * 南半球的寒季是我们的春(0)/夏(1)（那时他们正是冬天），北半球的寒季
 * 是我们的秋(2)/冬(3)——与 mapPeaks3d 里"南半球雪在春/夏出现"同一条口径，
 * 两个图层因此永远同时"冷"。
 *
 * 【它不影响航行】这里的冰盖是**陆地上的**，不是海冰；
 * 本作的航线最南到合恩角（约 -56°），不会撞上。不假装它会挡路。
 */

/** 冰的颜色：偏冷的白，不是纯白（纯白在纸面上会读成"没画"） */
export const ICE_RGB: [number, number, number] = [226, 236, 243]

/** 冰盖中心的不透明度：0.66 让底下的地势明暗还能透出来（否则是一块死白） */
export const MAX_ICE_ALPHA = 0.66

/** 冰缘随季伸缩的幅度（纬度度）：5° 在墨卡托高纬是一段看得见的宽度 */
export const ICE_SEASON_SHIFT_DEG = 5

/** 南极冰盖的冰缘：-62° 起、-72° 全白 */
const ANTARCTIC_EDGE = -62
const ANTARCTIC_FULL = -72

/** 格陵兰冰盖的软边界（bbox + 平滑过渡） */
const GREENLAND = { latMin: 59, latMax: 84, lngMin: -74, lngMax: -10, soft: 5 }

/** 0..1 的平滑阶跃 */
function smoothstep(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return 0
  if (hi === lo) return v >= hi ? 1 : 0
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)))
  return t * t * (3 - 2 * t)
}

/**
 * 冰缘向赤道推多少度：北/南各自看"现在是不是它的冬天"。
 */
export function iceEdgeShift(day: number): { north: number; south: number } {
  const idx = seasonAt(day).index
  // 0 春 / 1 夏 / 2 秋 / 3 冬（北半球口径）
  const northWinter = idx >= 2
  const southWinter = idx <= 1
  return {
    north: northWinter ? ICE_SEASON_SHIFT_DEG : 0,
    south: southWinter ? ICE_SEASON_SHIFT_DEG : 0,
  }
}

/**
 * 某一点的冰盖强度（0 = 没有冰，1 = 冰盖中心）。
 *
 * 画的时候会乘上 `MAX_ICE_ALPHA`，并用 `source-atop` 限制在陆地上 ——
 * 于是"格陵兰冬天向南推 5°"只会染到陆地，不会在海上凭空出现一片白。
 */
export function iceStrengthAt(lat: number, lng: number, day: number): number {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 0
  const shift = iceEdgeShift(day)

  /*
   * ---- 南极洲：越往南越白 ----
   *
   * 【符号别搞反】南极的冰缘是"最北能到哪"，冬天要**向赤道**推 ⇒
   * 边缘纬度从 -62 变成 -57（数值变大）。写成 `- shift` 会让冬天反而缩回去，
   * 屏幕上只是"好像没变"，不报错。
   */
  const aEdge = smoothstep(lat, ANTARCTIC_EDGE + shift.south, ANTARCTIC_FULL + shift.south)
  if (aEdge > 0) return aEdge

  // ---- 格陵兰：一个软边的矩形，纬度/经度各一条 ----
  const g = GREENLAND
  const latK = smoothstep(lat, g.latMin - shift.north, g.latMin - shift.north + g.soft)
  const latTop = 1 - smoothstep(lat, g.latMax, g.latMax + g.soft)
  const lngK = smoothstep(lng, g.lngMin, g.lngMin + g.soft) *
    (1 - smoothstep(lng, g.lngMax - g.soft, g.lngMax))
  return latK * latTop * lngK
}

/**
 * 把两块冰盖画到陆地图层上（就地改 canvas，`source-atop` 只染陆地像素）。
 *
 * 【为什么用渐变而不是逐像素循环】painted-land 是 1024×512，
 * 逐像素 52 万次在启动时是几十毫秒；canvas 渐变是硬件加速的，几毫秒。
 * 而且冰缘本来就是连续的，渐变正好。
 */
export function paintPolarIce(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  day: number,
): void {
  const shift = iceEdgeShift(day)
  const [r, g, b] = ICE_RGB
  const rgba = (alpha: number) => `rgba(${r},${g},${b},${alpha})`

  ctx.save()
  // 只画在已经有内容（陆地）的地方
  ctx.globalCompositeOperation = 'source-atop'

  // ---- 南极：整幅宽的一条纵向渐变 ----
  {
    const yEdge = mercNorm(ANTARCTIC_EDGE + shift.south) * h
    const yFull = mercNorm(ANTARCTIC_FULL + shift.south) * h
    const grad = ctx.createLinearGradient(0, yEdge, 0, Math.min(h, yFull))
    grad.addColorStop(0, rgba(0))
    grad.addColorStop(0.55, rgba(MAX_ICE_ALPHA * 0.8))
    grad.addColorStop(1, rgba(MAX_ICE_ALPHA))
    ctx.fillStyle = grad
    ctx.fillRect(0, yEdge, w, h - yEdge)
  }

  // ---- 格陵兰：以冰盖中心为圆心的径向渐变（软边，不会画出方块） ----
  {
    const cx = ((-42 + 180) / 360) * w
    const cy = mercNorm(74) * h
    const yS = mercNorm(GREENLAND.latMin - shift.north) * h
    const radius = Math.max(24, Math.abs(yS - cy) * 1.15)
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.35, cx, cy, radius)
    grad.addColorStop(0, rgba(MAX_ICE_ALPHA))
    grad.addColorStop(0.75, rgba(MAX_ICE_ALPHA * 0.55))
    grad.addColorStop(1, rgba(0))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
  }

  ctx.restore()
}
