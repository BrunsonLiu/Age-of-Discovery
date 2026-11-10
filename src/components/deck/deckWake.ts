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

/**
 * 开尔文波（船首 V 形波脊）与船尾尾迹的**强度场**。
 *
 * 【为什么要它】水线带贴船壳、白沫贴船壳 —— 两者都只在近处看得见。而"船在切水"
 * 最有说服力的证据是水面上的那两条 V 形波脊（开尔文波，半角 19.47°），它从任何
 * 角度都在：从船后看是船首两侧斜出去的两道白线，从甲板看是舷外的斜纹。
 *
 * 【为什么在片元里算、不在顶点里】海面网格一格 0.7 世界单位（14 米），做不出
 * 一条 2~4 米宽的波脊。位移交给几何浪，波脊只作为**明暗与高光的调制**叠上去 ——
 * 这在视觉上就是"波脊被压亮"，物理上等价于局部法线更陡。
 *
 * 【坐标约定】船在世界原点、船首朝 +z（相机看 +z）。船的世界 yaw 只有 ±0.012
 * 的微摆（0.7°），忽略不影响判读。
 *
 * 这个函数是 GLSL 里那段同名代码的 JS 版本，专门用来单测（判据：V 角、对称性、
 * 衰减单调、船首之前没有波）。
 */
export const KELVIN_TAN = 0.354 // tan(19.47°)

export interface WakeFieldArgs {
  /** 船首的世界 z（船首朝 +z，所以船首之后是 z < bowZ） */
  bowZ: number
  /** 船尾的世界 z */
  sternZ: number
  /** 强度 0..1（由 wakeStrength 给） */
  strength: number
}

/**
 * 某点（世界 xz）的波脊强度 0..1。
 * 两条 V 脊 + 船尾一条向后拖的白带。
 */
export function kelvinStrength(x: number, z: number, a: WakeFieldArgs): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0
  const k = Math.max(0, Math.min(1, Number.isFinite(a.strength) ? a.strength : 0))
  if (k <= 0.01 || !Number.isFinite(a.bowZ)) return 0
  const d = a.bowZ - z // 沿船长方向离船首的距离（船首之后为正）
  if (d <= 0.9) return 0

  // ① 两条 V 脊：|x|/d 接近 tan(19.47°) 的地方亮。宽度随距离变宽（远的波脊又宽又矮）
  const r = Math.abs(x) / d
  // 【与 GLSL 逐项对齐】宽度与衰减系数必须和 DeckView 里那段完全相同 ——
  // 两处各写一套，单测测的就不是画面上跑的东西（这条在项目里反复踩）。
  const w = 0.045 + 0.0035 * d
  const ridge = Math.exp(-Math.pow((r - KELVIN_TAN) / w, 2))
  // ② 随距离衰减（约 20 世界单位外基本看不见）
  const decay = Math.exp(-d * 0.095)
  // ③ 船尾尾迹：船身正后方一条白带（比 V 脊更宽、更持久）
  const stern = z < a.sternZ
    ? Math.exp(-Math.pow(Math.abs(x) / (0.45 + 0.02 * (a.sternZ - z)), 2)) * Math.exp(-(a.sternZ - z) * 0.03)
    : 0

  return Math.max(0, Math.min(1, (ridge * decay * 0.95 + stern * 0.8) * k))
}
