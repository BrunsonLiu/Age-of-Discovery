/**
 * 2D 海图的经纬网（graticule）：**纯计算**，不碰 Leaflet。
 *
 * 【为什么需要它】
 * 图上从前只有等角线网（罗经方位线）和 30° 的风带虚线，**一个度数都没写**。
 * 于是玩家没法回答三个最基本的问题：
 *   · 我在北纬多少？——「季风」是分纬度带的，同样一片海在 10°N 与 35°N
 *     吃的是完全不同的风；
 *   · 那个港在赤道以北还是以南？——走大圆时这不是文学问题，是走哪条弧的问题；
 *   · 30° 那条虚线是什么？——现在它是"某条虚线"，标上度数之后它才成为
 *     「副热带高压带南界」，与风带箭头、与 `WIND_BAND_LATS` 是同一件事。
 *
 * 【为什么步长要跟着缩放挑】
 * 步长写死会两头出错：写 5° 时开局（1 度 ≈ 22px）线挤成一张网、数字叠在一起；
 * 写 30° 时放大到近岸（1 度 ≈ 700px）整屏一根线都没有。所以按「屏幕上相邻两线
 * 至少隔多少像素」反推步长，与比例尺、航程圈是同一套思路（量屏幕，不猜）。
 */

/**
 * 候选步长（度）。1-2-5 系列是海图惯例，15 / 30 是风带与气候带常用的整数带。
 *
 * 【为什么没有 45】minZoom=2 时 1 度只有 2.84px，45° 的间距 128px 看着合适，
 * 但算下来 30° 已经够（85px），永远不会选到 45 —— 留一个永不命中的档位只会
 * 在测试里制造假分支，所以删掉。
 *
 * 【为什么最小只到 1°】再细就要写「分」（30°30′）。那个撇号是 U+2032，
 * 字符子集里没有它（`npm run font:subset` 只收常用字），写出来就是缺字；
 * 而这条船实际的定位精度本来也只到整度（港口坐标都是整数度）。
 */
export const GRATICULE_STEPS = [1, 2, 5, 10, 15, 30] as const

/**
 * 相邻两条经纬线的最小屏幕间距（像素）。
 *
 * 【为什么是 72】数字最长是「180°E」（5 个字符 × 约 7px ≈ 35px，12px 字号），
 * 72px 留出一倍余量，标签不会互相咬住；同时又不至于让线太稀。
 */
export const MIN_LINE_GAP_PX = 72

/**
 * 按「1 度纬度在屏幕上多少像素」挑步长：**取最小的、间距仍然够宽的那一档**。
 *
 * 【注意：墨卡托里纬度每度的像素**不是**常数】它按 sec φ 随 |纬度| 增大
 * （这正是墨卡托把经线拉成平行线的代价）。1440×900 / zoom 5 实测：
 * 45°N→40°N 是 30.8px/度，20°N→25°N 只有 24.6px/度，同一屏差两成。
 * 所以调用方必须传**全屏最密的那一处**（离赤道最近的那条边的 px/度），
 * 按它挑的步长整屏都不会挤。
 *
 * @param pxPerDeg 全屏最小的「1 度纬度的屏幕像素」（见 `Graticule.tsx` 的取法）
 * @returns 步长（度）；参数不可用时返回 0 表示不画
 */
export function pickGraticuleStep(pxPerDeg: number): number {
  if (!Number.isFinite(pxPerDeg) || pxPerDeg <= 0) return 0
  for (const s of GRATICULE_STEPS) {
    if (s * pxPerDeg >= MIN_LINE_GAP_PX) return s
  }
  /*
   * 极端缩小（比 minZoom 还小，正常到不了）：连 30° 都塞不进 72px。
   * 这时返回最大的档位而不是 0 —— 线会密一点，但**度数仍然是真的**。
   * 宁可密，不可空；空着一张网会让玩家以为这片海没有经纬度。
   */
  return GRATICULE_STEPS[GRATICULE_STEPS.length - 1] as number
}

/** 一条网格线最多取多少条（防止参数出错时把浏览器卡死） */
const MAX_LINES = 400

/**
 * 取 `[min, max]` 之间所有 `step` 的整数倍。
 *
 * 【为什么要抹掉浮点尾数】`Math.ceil(min / step) * step` 在 step=15、min=-90.1 时
 * 会算出 -89.99999999999999 这种值，再乘回去做标签就变成「90.0°S」。
 * 这里统一 `Math.round` 到整数（步长都是整数度）。
 */
export function graticuleValues(min: number, max: number, step: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0) return []
  if (max < min) return []
  const lo = Math.ceil(min / step) * step
  const hi = Math.floor(max / step) * step
  const out: number[] = []
  for (let v = lo; v <= hi + 1e-9; v += step) {
    out.push(Math.round(v))
    if (out.length > MAX_LINES) return []
  }
  return out
}

/**
 * 度数标签：`30°N` / `15°S` / `120°E` / `45°W`，本初子午线与赤道写 `0°`。
 *
 * 【为什么赤道不写「0°N」】赤道不是北纬 0 度，它是南北的分界；
 * 「0°N」这种写法在海图上不存在（同样，经度 0 不写 0°E）。
 * 组件那边遇到纬度 0 会额外换成「赤道」二字，这里的 0° 是兜底。
 *
 * 【为什么 180° 不带 E/W】180° 既是东经也是西经，带一个字母就是错的。
 */
export function degreeLabel(kind: 'lat' | 'lng', value: number): string {
  if (!Number.isFinite(value)) return ''
  const v = Math.round(Math.abs(value))
  if (v === 0) return '0°'
  if (kind === 'lat') return `${v}°${value > 0 ? 'N' : 'S'}`
  if (v === 180) return '180°'
  return `${v}°${value > 0 ? 'E' : 'W'}`
}
