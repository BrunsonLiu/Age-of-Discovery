/**
 * 航迹与船首破浪的参数（纯函数，可单测）。
 *
 * 【为什么值得做】这轮之前的船是"贴在画上的一条船"：它与海之间没有任何交换 ——
 * 没有浪被推开、没有白沫沿着船体拖出来。而"船在走"这件事恰恰是靠水面被扰动来表达的。
 * 更关键的是，它是**机制的可视化**：系泊时船侧只有淡淡一道水痕，航行时才有白沫
 * 沿船体拖出、船首才有那个 V 形浪 —— 于是"我在动 / 我停着"不用看 HUD。
 */

/**
 * 水线所在的模型高度（模型米）。船被抬高 SHIP_DRAFT_LIFT/0.05 = 2.4 米，水面就在这儿。
 *
 * 【为什么是常数】船现在精确跟随浪高（`ship.position.y = deckWaveHeight + lift`），
 * 所以水面相对于船体是固定的 —— 这一点是"水线带能贴着船壳画"的前提。
 */
export const WATERLINE_Y_M = -2.4
/** 泡沫带在船长方向的分段（要够密才能贴着船体的曲线走） */
export const WAKE_SEGMENTS = 28

/**
 * 航迹强度 0..1。
 *
 * 系泊时不是 0 而是 0.26：船停在水里也会有一圈贴身的细小水痕（风推的、浪打的）。
 * 完全 0 会让静止的船像"被抠图贴在海上"。
 */
export function wakeStrength(isSailing: boolean, speedKnots: number): number {
  if (!Number.isFinite(speedKnots)) return 0.26
  if (!isSailing) return 0.26
  // 4 节以下几乎不动（起步那一刻没有浪），12 节满
  const k = Math.max(0, Math.min(1, (speedKnots - 4) / 8))
  return 0.42 + 0.58 * k
}

/**
 * 船首 V 形浪的张角（弧度，单侧）。
 *
 * 慢船的张角大（水被慢慢挤开、往两侧走），快船的张角小（浪被推成正前方的一道开
 * 尔文波）。4 节约 26°，12 节约 15°。
 */
export function bowWaveSpread(speedKnots: number): number {
  const k = Math.max(0, Math.min(1, ((Number.isFinite(speedKnots) ? speedKnots : 0) - 4) / 8))
  return ((26 - 11 * k) * Math.PI) / 180
}

/**
 * 船首 V 浪的长度（模型米）：越快越长。
 * 停在港里时它是 0（没有破浪），这也让"没在走"有一处明确的表现。
 */
export function bowWaveLength(isSailing: boolean, speedKnots: number): number {
  if (!isSailing) return 0
  const k = Math.max(0, Math.min(1, ((Number.isFinite(speedKnots) ? speedKnots : 0) - 4) / 8))
  return 2.2 + 5.5 * k
}
