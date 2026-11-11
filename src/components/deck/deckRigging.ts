/**
 * 动索：帆脚索（sheet）与转桁索（brace）—— 船上视角里**会动的那几根绳**。
 *
 * 【为什么只做动索，不做静索】静索（前后支索、侧支索）是绑死的，它们的价值是
 * "桅杆立得住"的剪影，上一轮已经做完。而帆船真正在动的是**动索**：帆脚索从帆角
 * 拉到舷边，风小的时候是垂的、起风后被拉直；转桁索把帆桁绕桅转，风向一变帆就
 * 跟着转。这两样东西让"风"从数字变成看得见的东西 —— 与三角旗同一套逻辑。
 *
 * 【为什么全在这里算】绳子的形状必须与**帆的几何**一致：帆脚索的上端就是帆脚的
 * 角（clew），差一厘米就会"绳子和布分开"。帆的收分（`SAIL_TAPER`）与帆的挂点
 * （`SAIL_DROP` / `SAIL_Z_OFF`）在这里定义一次，`shipModel` 建模时 import 同一份，
 * 于是"布在哪、绳绑在哪"不可能分叉 —— 这与价格、航程的单一来源是同一条纪律。
 */

/** 帆面收分：帆脚的半宽 = 帆桁长 × sailW / 2 × (1 − SAIL_TAPER)（帆顶不收） */
export const SAIL_TAPER = 0.13
/** 帆挂点相对帆桁中心下沉多少米（`sail.position.y = yardY - sh/2 - SAIL_DROP`） */
export const SAIL_DROP = 0.2
/** 帆面在 z 上比帆桁往前偏多少米（桅杆在 z 上占位置，布不能穿桅） */
export const SAIL_Z_OFF = 0.42
/** 帆脚索的分段数：10 段足够圆滑，顶点数也不失控 */
export const SHEET_SEGMENTS = 10
/** 转桁索的分段数（绷得直，6 段就够） */
export const BRACE_SEGMENTS = 6

/** 0..1 夹紧（NaN 归 0） */
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0)

/**
 * 帆脚索中点的下垂量（米）。
 *
 * @param t 秒
 * @param seed 每根绳自己的相位（同一张帆的左右两根不能一起摆）
 * @param k 风速归一化 0（无风）..1（强风）—— 与三角旗共用 `windK`
 *
 * 【为什么用"风速"而不是"帆的松紧"】帆脚索是**手拉的**：风小的时候水手把索松开
 * （帆被风拍打会撕），索就垂下来；风大时索被拉直，帆才兜得住。所以"垂多少"直接
 * 由风速决定，不需要额外的状态 —— 也不会出现"旗子被吹直、索却垂着"的自相矛盾。
 */
export function sheetSag(t: number, seed: number, k: number): number {
  const slack = 1 - clamp01(k)
  /*
   * 时间先挡 NaN：一次 NaN 时间会让这根索的所有顶点变成 NaN，WebGL 直接把整条线
   * 丢掉（"绳凭空消失"，而且不报错）。挡一下只花一次比较。
   */
  const tt = Number.isFinite(t) ? t : 0
  // 绷直时也留 0.16 米（真实的索也有自重弧），全松时垂到 1.4 米
  const base = 0.16 + 1.28 * slack
  // 一下一下的抽动：周期约 5 秒，松的时候幅度大（绷紧的索几乎不动）
  const pump = (0.02 + 0.13 * slack) * Math.sin(tt * 1.25 + seed * 2.7)
  // 更慢的一层起伏（船在涌浪上起落，索跟着一松一紧）
  const surge = 0.06 * slack * Math.sin(tt * 0.41 + seed * 1.3)
  return Math.max(0.03, base + pump + surge)
}

/**
 * 帆脚索中点的侧向摆（米）。索是软的，横摇时整根索在水平面里甩。
 * 松的时候摆 0.30 米，绷紧时几乎不摆（0.04 米）。
 */
export function sheetSway(t: number, seed: number, k: number): number {
  const slack = 1 - clamp01(k)
  const tt = Number.isFinite(t) ? t : 0
  return (0.04 + 0.26 * slack) * Math.sin(tt * 0.83 + seed * 3.1)
}

/**
 * 把一根索的顶点写进 `out`（`(n+1)×3` 的扁平数组），返回 `out`。
 *
 * 【为什么是二次贝塞尔而不是"每段都往下偏一点"】分段偏移算出来的曲线在端点处
 * 有一阶不连续（绳头和帆角之间会有一个折角）；贝塞尔在两端是切线连续的，绳根
 * 与帆角、绳尾与舷边都平滑相接。
 *
 * 【`sag` / `sway` 是"中点的实际偏移"，不是控制点偏移】二次贝塞尔的 B(0.5) =
 * 0.25A + 0.5C + 0.25B ⇒ 中点= 原始中点 + 控制点偏移/2。所以这里控制点取 2×，
 * 免得单测说 1 米、画面上只有 0.5 米（这个坑在船吃水上踩过一次）。
 *
 * @param sway 沿**水平垂线**（AB 在 xz 平面上的垂线）的偏移
 */
export function writeSheetPoints(
  out: Float32Array,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  sag: number, sway: number,
  n: number = SHEET_SEGMENTS,
): Float32Array {
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2
  const mz = (az + bz) / 2
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  // 水平垂线：A→B 转 90°。船头船尾对齐（len≈0）时退化，直接不摆
  const px = len > 1e-6 ? -dz / len : 0
  const pz = len > 1e-6 ? dx / len : 0
  const cx = mx + px * sway * 2
  const cy = my - sag * 2
  const cz = mz + pz * sway * 2
  for (let i = 0; i <= n; i++) {
    const s = i / n
    const u = 1 - s
    const a = u * u
    const b = 2 * u * s
    const c = s * s
    out[i * 3] = a * ax + b * cx + c * bx
    out[i * 3 + 1] = a * ay + b * cy + c * by
    out[i * 3 + 2] = a * az + b * cz + c * bz
  }
  return out
}

/**
 * 帆脚的角（clew）：帆面**下缘两端的那个点**，帆脚索就绑在这里。
 *
 * 【为什么必须由这个函数算】帆是用 `PlaneGeometry` 变形出来的（收分 + 帆脚弧 +
 * 鼓胀），帆角的位置藏在三次变形之后。建模那边如果不是从这里取，而是自己再写
 * 一遍 `yardY - sh - 0.2`，改一次帆高就会错位（而绳子错位在截图上极难发现）。
 */
export function sailClew(
  sw: number, sh: number, yardY: number, yardZ: number, side: 1 | -1,
): { x: number; y: number; z: number } {
  /*
   * 帆脚弧（roach）在帆角处为 0：`foot = -0.06*(1-|x|)*sh` 在 |x|=1 时是 0，
   * 鼓胀 `cos(x·π/2)` 在 |x|=1 时也是 0 —— 所以帆角就是"收分后的半个帆宽"那个点。
   */
  return {
    x: side * (sw / 2) * (1 - SAIL_TAPER),
    y: yardY - sh - SAIL_DROP,
    z: yardZ + SAIL_Z_OFF,
  }
}

/**
 * 转桁索把帆桁绕桅转多少（弧度）。
 *
 * @param windBearingDeg 风**吹去**的罗盘方位（与旗子、`calculateSailingDays` 同一个数）
 * @param k 风速归一化
 *
 * 【推导】帆桁沿船宽（局部 +x），方帆要兜住风就得让桁垂直于风向。
 *  · 风沿船首尾吹（0°/180°）：桁本来就垂直于风 ⇒ 不转；
 *  · 风从右舷（90°）来：+x 那一端要转向船首 ⇒ 绕 y 负向转。
 * 所以转角 ∝ −sin(方位)。**不是 ±90°**：真实的转桁索最多转 5~6 个 rumb
 * （≈30°），而这条船是商船，画面上给它上限 15°（0.26 rad）就够读出"帆在追风"，
 * 再多会让 17 米宽的帆扫进侧支索里。
 */
export function braceYaw(windBearingDeg: number, k: number): number {
  if (!Number.isFinite(windBearingDeg)) return 0
  const b = (windBearingDeg * Math.PI) / 180
  return -Math.sin(b) * 0.26 * clamp01(k)
}

/**
 * 绕 y 轴把一点转到帆桁的**实际**朝向（转桁角）。
 *
 * 绳子的两端必须用**同一个**转角 —— 帆转了多少，绑在帆角上的索就得转多少，
 * 否则"布转过去了、绳还留在原地"。角度用**平滑后的当前值**（不是目标值），
 * 因为帆本身是逐帧趋近的，绳必须跟着它那一个数走。
 */
export function rotateAboutYaw(
  x: number, z: number, centerZ: number, yaw: number,
): { x: number; z: number } {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const dx = x
  const dz = z - centerZ
  return { x: dx * c + dz * s, z: centerZ + (-dx * s + dz * c) }
}
