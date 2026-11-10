/**
 * 船上视角的浪（纯函数，GPU 与 CPU 共用同一组参数）。
 *
 * 【为什么必须共用】船体要贴着水面起伏、相机要跟着晃。如果海面用一套参数、
 * 船用另一套近似，第一眼就能看出"船浮在浪外面"——那是最伤的可信度问题。
 * 所以这里只写一次公式：顶点着色器按同一组 uniform 算位移，JS 侧算船的姿态。
 *
 * 【尺度】船上视角的单位是**船**：船长 1.3、桅高约 1.2。所以浪的振幅取
 * 0.011~0.062（约船长的 1%~5%），波长 0.85~3.4（0.65~2.6 个船长）——
 * 这是"涌浪"，不是"洗澡水"。振幅再大就会拍到甲板上，读作风暴。
 */

export interface DeckWave {
  /** 行进方向（xz，未归一化也行） */
  dir: readonly [number, number]
  /** 振幅（世界单位） */
  amp: number
  /** 波长（世界单位） */
  len: number
  /** 陡度：影响法线的竖向分量，越大越"尖" */
  steep: number
}

export const DECK_WAVES: readonly DeckWave[] = [
  { dir: [0.92, 0.39], amp: 0.062, len: 3.4, steep: 0.55 },
  { dir: [-0.45, 0.89], amp: 0.038, len: 2.1, steep: 0.5 },
  { dir: [0.78, -0.63], amp: 0.021, len: 1.35, steep: 0.45 },
  { dir: [-0.86, -0.51], amp: 0.011, len: 0.85, steep: 0.4 },
]

const G = 9.8

interface Term {
  dx: number
  dz: number
  k: number
  amp: number
  steep: number
  f: number
  cos: number
  sin: number
}

/** 每个分量的中间量（与顶点着色器里的同名计算逐项对应） */
function terms(x: number, z: number, t: number): Term[] {
  const out: Term[] = []
  for (const w of DECK_WAVES) {
    const len = Math.hypot(w.dir[0], w.dir[1]) || 1
    const dx = w.dir[0] / len
    const dz = w.dir[1] / len
    const k = (2 * Math.PI) / w.len
    const c = Math.sqrt(G / k)
    const f = k * (dx * x + dz * z) - c * t
    out.push({ dx, dz, k, amp: w.amp, steep: w.steep, f, cos: Math.cos(f), sin: Math.sin(f) })
  }
  return out
}

/**
 * 某点水面高度（相对静止水面）。
 *
 * `ampScale` 是**天气**给的整体浪高倍数（暴风雨 1.9，浓雾 1.05）。
 * 必须与顶点着色器里的 `uWaveScale` 是同一个数，否则船会浮在浪面之外 ——
 * 这正是"GPU 与 CPU 共用一组参数"这条规矩的原因。
 */
export function deckWaveHeight(x: number, z: number, t: number, ampScale = 1): number {
  const a = Number.isFinite(ampScale) ? ampScale : 1
  let y = 0
  for (const w of terms(x, z, t)) y += w.amp * a * w.sin
  return y
}

/** 某点法线（未归一化前先按 steep 缩放竖向分量） */
export function deckWaveNormal(x: number, z: number, t: number, ampScale = 1): { x: number; y: number; z: number } {
  const a = Number.isFinite(ampScale) ? ampScale : 1
  let nx = 0
  let ny = 1
  let nz = 0
  for (const w of terms(x, z, t)) {
    nx -= w.dx * w.k * w.amp * a * w.cos
    nz -= w.dz * w.k * w.amp * a * w.cos
    ny -= w.steep * w.k * w.amp * a * w.sin
  }
  const l = Math.hypot(nx, ny, nz) || 1
  return { x: nx / l, y: ny / l, z: nz / l }
}

/**
 * 船的纵摇/横摇：用首尾、左右的高度差算。
 *
 * 【为什么不直接用船的坐标取一次高度】取一次只能让船上下平移，桨不摇、帆不摆，
 * 船会像电梯一样"浮"在浪上。首尾差决定纵摇（pitch），左右差决定横摇（roll），
 * 两个都是玩家一眼能看出来的信号。
 */
export function deckShipPose(t: number, halfLen = 0.55, halfBeam = 0.22, ampScale = 1) {
  const bowY = deckWaveHeight(0, halfLen, t, ampScale)
  const sternY = deckWaveHeight(0, -halfLen, t, ampScale)
  const portY = deckWaveHeight(-halfBeam, 0, t, ampScale)
  const starY = deckWaveHeight(halfBeam, 0, t, ampScale)
  return {
    /** 船体中心高度（四点平均，比单点稳） */
    y: (bowY + sternY + portY + starY) / 4,
    /** 纵摇：船首抬起为正（绕 X 轴） */
    pitch: Math.atan2(bowY - sternY, halfLen * 2),
    /** 横摇：右舷抬起为正（绕 Z 轴） */
    roll: Math.atan2(starY - portY, halfBeam * 2),
  }
}
