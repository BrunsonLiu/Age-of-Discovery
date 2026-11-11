/**
 * 气候线（南北回归线、南北极圈）：**纯计算**，不碰 Leaflet。
 *
 * 【为什么图上要有这四条线】
 * 上一轮经纬网把度数写出来了，玩家能读「23°26′N」这个数 —— 但那只是个数。
 * 回归线与极圈是**太阳直射点能到的最远处**与**极昼极夜的分界**，它们把一个
 * 连续变化的纬度切成了四段气候区，而游戏里的季风、风带、海况本来就按纬度分档
 * （`WIND_BAND_LATS`、`data/seaPhenomena`）。把它们当成"又两条纬线"画出来，
 * 读图的人就得自己在 23° 附近找那个数；写成有名字的线，一眼就知道
 * 「我现在进了热带」。
 *
 * 【它们和网格线**不重合**，这是对的】网格步长是 5°/1°/0.25° 这类整数档，
 * 而回归线在 23.4362°、极圈在 66.5638° —— 都不是整数度。所以不能"给某条网格线
 * 换个颜色"，必须单独画一条。
 *
 * 【为什么这两组数要写在同一个常量里】`90 − 黄赤交角 = 极圈` 是天文学恒等式。
 * 两处各写一遍（23.4362 与 66.5638）迟早会有一个被改掉，图上就会出现
 * 「回归线比极圈还靠北」这种没人会立刻发现的错。
 */

/**
 * 黄赤交角（度）。2026 年约 23°26′11″ = 23.4364°；这个值每世纪减少约 47″，
 * 也就是**每 100 年 0.013°**。游戏没有年份刻度，冻结在这个值即可 ——
 * 如实记录：它不是"永远的 23.5°"，21 世纪内画在图上误差不超过 1 个像素。
 */
export const OBLIQUITY_DEG = 23.4362

/** 极圈纬度 = 90° − 黄赤交角（与回归线互为余角，同一个数推出来） */
export const POLAR_CIRCLE_DEG = 90 - OBLIQUITY_DEG

export interface ClimateLine {
  /** 稳定的键（React key / 测试取用），不要用中文名当键 */
  key: 'tropic-n' | 'tropic-s' | 'arctic' | 'antarctic'
  /** 纬度（北正南负） */
  lat: number
  /** 图上写的中文名 */
  name: string
}

export const CLIMATE_LINES: readonly ClimateLine[] = [
  { key: 'tropic-n', lat: OBLIQUITY_DEG, name: '北回归线' },
  { key: 'tropic-s', lat: -OBLIQUITY_DEG, name: '南回归线' },
  { key: 'arctic', lat: POLAR_CIRCLE_DEG, name: '北极圈' },
  { key: 'antarctic', lat: -POLAR_CIRCLE_DEG, name: '南极圈' },
]

/**
 * 标签落在画面宽度的百分之多少处。
 *
 * 【为什么在线上而不是贴左边】贴左边的度数已经有一整列了（12px 字，x=100）；
 * 气候线的名字比度数长一倍多（「北回归线」四个字），挤进那一列会把度数顶到
 * 海图中央去。而海图的惯例本来就是**同名线写在线上**（线与字互不重叠，
 * 字嵌在线的一个断口里）—— 这样标签的位置不依赖任何其它界面元素，
 * 玩家往任何方向平移，名字都在线的同一个比例位置上。
 *
 * 【为什么是 0.36】避开左右两列按钮（x 0..92 / 1320..1440）、右上迷你海图
 * （x 1260..1428）、右下比例尺（x 1294..1428）。0.36 × 1440 = 518px，
 * 在整屏最空的那一段里；1024 宽时是 369px，同样在两侧按钮之外。
 */
export const CLIMATE_LABEL_FRAC = 0.36

/**
 * 断口要比字宽再放出来的余量（**单侧**，像素）。
 *
 * 断口小了会被字的描边吃掉一截，线看起来"顶着字"；大了则像线断得莫名其妙。
 * 18px 约等于 1.5 个字宽，实测（`map-climate.mjs` 判据）断口两侧各留出的
 * 空隙在 20px 上下，读起来是"线在这里让开写字"，不是"线断了"。
 */
export const CLIMATE_LABEL_PAD = 18

/**
 * 估一个标签占多少像素宽。
 *
 * 【为什么要估】断口是按"字有多宽"算出来的，而这个宽度只有渲染之后才真知道。
 * 组件里用的是 12px 字号 + 0.12em 字距 + 左右各 5px 内边距：
 * 中文字宽约等于字号（12），字距 0.12 × 12 ≈ 1.44，所以每个字约 13.4px；
 * 两端内边距共 10px。四字的「北回归线」≈ 64px（实测 63.5px）。
 *
 * 宁可估大一点：估小了线会压在字上，估大了只是断口宽几个像素。
 */
export function climateLabelPx(name: string): number {
  if (typeof name !== 'string' || name.length === 0) return 0
  return Math.round(name.length * 13.4 + 10)
}

/**
 * 断口中心落在哪条经线上。
 *
 * 墨卡托的经度在屏幕上是**线性**的（不像纬度要过 `ln(tan)`），
 * 所以"画面宽度的 36%"正好等于"可见经度跨度的 36%" —— 一个乘加就够，
 * 不需要反投影。
 */
export function climateGapCenter(west: number, east: number, frac: number = CLIMATE_LABEL_FRAC): number {
  if (!Number.isFinite(west) || !Number.isFinite(east) || east <= west) return west
  const f = Number.isFinite(frac) ? Math.min(0.95, Math.max(0.05, frac)) : CLIMATE_LABEL_FRAC
  return west + (east - west) * f
}

/**
 * 把 `[west, east]` 这一段经线**挖掉中间的一个断口**，返回剩下的若干段。
 *
 * 【为什么不是"画一条线、用白色盖住中间"】盖白色会连海面纹理一起盖掉，
 * 而且那道白痕在深色海面上比线本身更显眼。真正的做法是**不画那一段**。
 *
 * @param minRun 短于这个长度（度）的碎段直接丢掉 —— 否则线在两段之间会留下一根
 *               几像素的线头，读起来像脏点。由调用方按 8px 换算成度数传进来。
 */
export function climateRuns(
  west: number,
  east: number,
  gapCenter: number,
  halfGap: number,
  minRun: number = 0,
): [number, number][] {
  if (!Number.isFinite(west) || !Number.isFinite(east) || east <= west) return []
  if (!Number.isFinite(gapCenter) || !Number.isFinite(halfGap) || halfGap <= 0) return [[west, east]]
  const g0 = gapCenter - halfGap
  const g1 = gapCenter + halfGap
  // 断口完全落在这一段之外：线是完整的一条
  if (g1 <= west || g0 >= east) return [[west, east]]
  const out: [number, number][] = []
  if (g0 > west) out.push([west, Math.min(g0, east)])
  if (g1 < east) out.push([Math.max(g1, west), east])
  const min = Number.isFinite(minRun) && minRun > 0 ? minRun : 0
  return out.filter(([a, b]) => b - a > min)
}
