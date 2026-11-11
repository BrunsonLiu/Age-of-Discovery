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
 * 【为什么有 0.1 / 0.25 / 0.5】上一版最小只到 1°，于是**放大到 zoom 8 以上
 * 整屏只剩一根经线一根纬线**（zoom 10 时 1° = 728px，900px 高的画面只有 1.2°），
 * 海面大片空白、左边一行孤零零的「35°N」。海图的正解不是加别的东西，
 * 而是**把自己的刻度分细**：分（1′ = 1/60 度）本来就是度的一部分，
 * 不是新数据。0.1° = 6′、0.25° = 15′、0.5° = 30′，三个都是整分钟。
 *
 * 【为什么没有 45】minZoom=2 时 1 度只有 2.84px，45° 的间距 128px 看着合适，
 * 但算下来 30° 已经够（85px），永远不会选到 45 —— 留一个永不命中的档位只会
 * 在测试里制造假分支，所以删掉。
 */
export const GRATICULE_STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30] as const

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
  /*
   * 【为什么要给比值加 1e-9 容差】0.1 在二进制里不可精确表示：
   * `34.4 / 0.1 = 343.99999999999994`，`Math.floor` 直接掉一档 ——
   * 于是 `[34.1, 34.4] 步长 0.1` 只返回 3 个值，**边界上那条线凭空消失**。
   * 这个 bug 是本轮新判据抓到的（把步长细分到 0.1° 之后才可能触发），
   * 整数步长永远碰不到，所以之前一直没露出来。
   *
   * 【为什么用 lo + i*step 而不是累加】累加 0.1 几十次会攒出可见误差；
   * 用序号乘回去，误差始终只有一次乘法的量级，最后再抹一次尾数。
   */
  const lo = Math.ceil(min / step - 1e-9) * step
  const hi = Math.floor(max / step + 1e-9) * step
  const n = Math.floor((hi - lo) / step + 1e-9)
  if (n < 0) return []
  if (n + 1 > MAX_LINES) return []
  const out: number[] = []
  for (let i = 0; i <= n; i++) {
    // 步长可能是 0.1°：这里只抹掉浮点尾数，不能取整（取整会把 35.4 变成 35）
    out.push(Math.round((lo + i * step) * 1e4) / 1e4)
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
  /*
   * 按**分**写：35.4 → 「35°24′N」。
   *
   * 撇号是 U+2032，字体子集的基础字形里带着它（`scripts/make_font_subset.py`
   * 的 BASE 有 `°′″`），所以不会缺字。分钟补两位（06′ 不是 6′），
   * 这是海图的写法 —— 位数不齐时上下两行数字对不齐，读起来要逐位辨认。
   */
  const totalMin = Math.round(Math.abs(value) * 60)
  const deg = Math.floor(totalMin / 60)
  const min = totalMin % 60
  const body = min === 0 ? `${deg}°` : `${deg}°${String(min).padStart(2, '0')}′`
  if (deg === 0 && min === 0) return '0°'
  if (kind === 'lat') return `${body}${value > 0 ? 'N' : 'S'}`
  if (deg === 180 && min === 0) return '180°'
  return `${body}${value > 0 ? 'E' : 'W'}`
}

/** 这个值是不是整度（用来分"主刻度/分刻度"两档线宽） */
export function isWholeDegree(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value - Math.round(value)) < 1e-6
}
