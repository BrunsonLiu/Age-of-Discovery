/**
 * 等角航线网（rhumb lines / loxodromes）—— 波托兰海图最标志性的装饰。
 *
 * 【为什么要加这个】
 * 默认视角下海面占屏约 60%，是一片均匀的深蓝 + 一层重复的浪纹。
 * 洋名只有一个"大西洋"孤零零贴在中间，整片海读起来就是"没画完"。
 * 14~16 世纪的地中海海图（portolan chart）上，海面是被一整套**从若干罗经点
 * 放射出来的直线网**铺满的：它本来是为了让领航员用直尺量方位角的工具，
 * 后来成了这类地图的视觉签名。
 *
 * 【为什么直线在墨卡托上是直的】
 * 等角航线的定义就是"与所有经线夹角恒定"，而在墨卡托投影下它恰好是一条直线
 * ——这正是墨卡托 1569 年做这个投影的理由。所以这里不需要航向计算，
 * 只要在投影坐标里画直线、再投回经纬度即可。
 *
 * 【为什么分三档透明度】
 * 一条从罗经点射出的直线如果通篇同一个透明度，末端就是一个硬切点。
 * 分三档（近浓远淡）之后，网络看起来像"以罗经点为中心晕开的"，而不是
 * 一堆等长的棍子。
 *
 * 【为什么只做纯计算】
 * 画在哪个 pane、用什么颜色、要不要被陆地遮住，都是渲染层的事；
 * 这里只产出经纬度数组，方便单测断言"线在投影空间里是直的""方位角 0 真的朝北"。
 */

/** 墨卡托投影：纬度（度）→ 归一化 y（弧度制） */
function toMercY(latDeg: number): number {
  const phi = (latDeg * Math.PI) / 180
  return Math.log(Math.tan(Math.PI / 4 + phi / 2))
}

/** 反投影 */
function fromMercY(y: number): number {
  return ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI
}

/** 把经度折回 [-180, 180) */
function wrapLng(lngDeg: number): number {
  return ((((lngDeg + 180) % 360) + 360) % 360) - 180
}

export type LatLngTuple = [number, number]

export interface RhumbOptions {
  /** 射线条数。罗盘玫瑰是 32 方位，所以 32 条射线 = 16 条贯穿线 */
  bearings?: number
  /** 半径，单位是墨卡托 y 的弧度（≈ 赤道上的纬度度数）。0.9 ≈ 51° */
  radius?: number
  /**
   * 每条射线在**每一圈内**采样几段（点数 = steps + 1）。
   *
   * 默认 1（两个点）就够：等角航线在墨卡托投影里是一条**真正的直线**，
   * 而 Leaflet 把相邻两点画成直线段，所以在任何缩放下两点连成的就是那条直线。
   * 原先给 12 是错的——13 个共线的点只多画了 12 段没有意义的线段。
   */
  steps?: number
  /** 分成几圈衰减，由近及远；每圈是一整组子线 */
  bands?: number[]
}

/**
 * 一个罗经点放射出的整张网，按"由近及远"分圈返回。
 * 每一圈是 `[ [lat,lng], ... ][ ]` —— 一圈里的所有射线合成**一条** Leaflet
 * 多段线（一个 path 元素，多条子路径），比每条射线一个 Polyline 省两个数量级。
 */
export function buildRhumbNetwork(
  center: LatLngTuple,
  opts: RhumbOptions = {},
): LatLngTuple[][][] {
  const bearings = opts.bearings ?? 32
  const radius = opts.radius ?? 0.9
  const steps = opts.steps ?? 1
  const bands = opts.bands ?? [0.42, 0.76, 1]

  const [lat0, lng0] = center
  const x0 = (lng0 * Math.PI) / 180
  const y0 = toMercY(lat0)

  // 每个点都必须先夹到 ±85°：墨卡托在极点发散，不加夹会在高纬爆掉
  const MAX_Y = toMercY(85)

  const out: LatLngTuple[][][] = []
  let prev = 0
  for (const upto of bands) {
    const ring: LatLngTuple[][] = []
    for (let b = 0; b < bearings; b++) {
      const th = (b / bearings) * Math.PI * 2
      const dx = Math.sin(th)
      const dy = Math.cos(th)
      const line: LatLngTuple[] = []
      // 从上一圈的结束点开始接，否则圈与圈之间会出现一道缝
      for (let s = 0; s <= steps; s++) {
        const t = (prev + ((upto - prev) * s) / steps) * radius
        const y = Math.max(-MAX_Y, Math.min(MAX_Y, y0 + dy * t))
        line.push([fromMercY(y), wrapLng(((x0 + dx * t) * 180) / Math.PI)])
      }
      ring.push(line)
    }
    out.push(ring)
    prev = upto
  }
  return out
}

/**
 * 罗经点。挑的是**开阔海面**：航线网本来就是为了在看不见陆地时量方位，
 * 贴着海岸放既不真实、也会和浅滩/岸线糊在一起。
 *
 * 单位是 [纬度, 经度]。
 */
export const RHUMB_CENTERS: LatLngTuple[] = [
  [38, -28],   // 亚速尔群岛附近——大西洋航线的传统转运点
  [-2, -22],   // 南大西洋
  [14, -52],   // 西大西洋（加勒比以东）。加这个是因为默认视角下西半边
               // 只能看到一束近乎平行的线——单靠远处一个罗经点，
               // 射线扩散得太开，读不出"网"。
  [-22, 72],   // 印度洋
  [6, -138],   // 东太平洋
]
