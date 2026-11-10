/**
 * 桅顶三角旗的几何（纯函数，可单测）。
 *
 * 【为什么值得做】风向在这个游戏里不是装饰：`weather.windDir` 决定这一天能走多少
 * 海里（`calculateSailingDays` 用它算顺风/逆风）。但玩家在船上**看不到风** ——
 * 唯一能看见的线索是浪与帆的形状，而这两样都太含糊。
 * 旗子是最直接的一种"风的可视化"：它指向下风侧，长度随风速，风小就垂下来。
 * 于是"看旗子 → 知道风往哪吹 → 决定要不要今天走"这条链在画面上闭合了。
 *
 * 【坐标约定】相机看 +z（船首朝 +z），所以**右舷是 −x、左舷是 +x**（与
 * `coastScenePos` / `deckBirds` 同一套）。方位 0°（北）对应 +z，90°（东）对应 −x。
 * 旗面沿局部 +x 伸出，用 `flagYaw` 把它转到位。
 */

/** 旗长（米，模型坐标系） */
export const FLAG_LEN_M = 2.4
/** 旗根高度（米）：三角旗从这么高收成一个尖 */
export const FLAG_BASE_H_M = 0.52
/** 沿旗长的分段数（波要够圆滑，但别让顶点数失控） */
export const FLAG_SEG_X = 16
/** 沿旗高的分段数（3 行就够：三角旗只有上下两条边在动） */
export const FLAG_SEG_Y = 3

/** 风速归一化：0 = 无风（旗垂下）、1 = 强风（旗拉直） */
export function windK(speedKnots: number): number {
  if (!Number.isFinite(speedKnots)) return 0
  // 5 节以下几乎不飘，25 节满。慢一点到位更符合"起风了"的过程感
  return Math.max(0, Math.min(1, (speedKnots - 5) / 20))
}

/**
 * 三角旗绕 y 轴的转角（弧度）。
 *
 * 【为什么不叫 flagYaw】`utils/portLife.ts` 里**已经**有一个 `flagYaw(t, seed)`
 * （港湾里那些旗子的摆动角）。同名在打包后互相覆盖，会把那边的测试改成红 ——
 * 上一轮 `birdPose` 就是这么踩的（港湾海鸥的判据当场炸掉）。
 *
 * 推导：旗面沿局部 +x 伸出。绕 y 转 θ 之后 +x 变成 (cos θ, 0, −sin θ)。
 * 而"风吹去"的方位 B 对应的世界方向是 (−sin B, 0, cos B)（B=0 → +z 船首；
 * B=90 → −x 右舷）。两式相等 ⇒ θ = −B − π/2。
 */
export function pennantYaw(bearingDeg: number): number {
  if (!Number.isFinite(bearingDeg)) return -Math.PI / 2
  return -(bearingDeg * Math.PI) / 180 - Math.PI / 2
}

/**
 * 旗面某一点的偏移（米）。
 *
 * @param u 0 = 绑在旗杆处，1 = 旗尾尖
 * @param v −1 = 上边，0 = 中线，1 = 下边
 * @param t 秒
 * @param speedKnots 风速（节）
 */
export function flagOffset(u: number, v: number, t: number, speedKnots: number): { z: number; y: number } {
  const k = windK(speedKnots)
  const uu = Math.max(0, Math.min(1, u))
  /*
   * 振幅随 u^1.35 增长：旗根被绑死，只有旗尾在甩 —— 线性增长会让整面旗像一块
   * 刚体在平移（第一版就是这样，看起来像一片被推着走的纸）。
   */
  const amp = (0.03 + 0.16 * k) * Math.pow(uu, 1.35)
  // 波沿旗长跑：风速越大跑得越快（相位里带 t）
  const phase = uu * 5.6 - t * (2.0 + 4.6 * k)
  const z = Math.sin(phase) * amp + Math.sin(phase * 2.3 + 1.7) * amp * 0.3
  /*
   * 下垂：风小的时候整条旗往下垂（"挂旗"），风大时被吹平。
   * 下边（v=1）比上边垂得更多 —— 布是软的，旗角的重量最大。
   */
  const droop = (1 - k) * 0.62 + 0.1
  const edge = 0.6 + 0.4 * Math.max(0, v)
  const y = -droop * uu * uu * edge
  return { z, y }
}

/**
 * 两个方位之间的最短角差（−180..180）。
 * 风不会在一帧里换个方向，但也不能"直接赋值" —— 350° → 10° 应该转 20°，
 * 而不是倒着转 340°。这个函数就是给平滑用的。
 */
export function bearingDelta(fromDeg: number, toDeg: number): number {
  if (!Number.isFinite(fromDeg) || !Number.isFinite(toDeg)) return 0
  return (((toDeg - fromDeg) % 360) + 540) % 360 - 180
}
