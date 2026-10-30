/**
 * 航行一步：沿航线推进 stepNm，遇到陆地时先尝试"擦边跳过"。
 *
 * 【为什么单独抽成纯函数】
 * 这段逻辑原本埋在 SailingController 的帧循环里，依赖 isLandAt（要等掩码加载）、
 * 依赖每帧的 dt、还依赖随机的时间抖动。结果是：触发条件是概率性的，
 * 想验证"修好了没有"只能反复跑，跑十次未必复现一次。
 * 抽出来之后，用一个合成的 isLand 就能确定性地测到每一种情形。
 *
 * 【它解决的具体问题】
 * 航线是搜出来并做过穿陆校验的（简化后加密到 8 海里再验），
 * 但"8 海里的直线"和"掩码格"不是一个量级：一段 15km 的斜线可以擦过某个
 * 岬角格的角，两端的采样点却都在海里。于是船会在**自己规划的航线**上
 * 报"前方是陆地，被迫停航"——实测在塞维利亚→加的斯 47% 处出现过，
 * 玩家带着货被搁在半路，一趟白跑。
 *
 * 【策略】
 * 撞到陆地 → 沿航线向前最多 lookaheadNm 找第一个海面点：
 *   · 找到 → 跳过这一小段继续走（位移照实记账，不是瞬移）
 *   · 找不到 → 真触礁，停在原地等玩家处理
 * lookahead 取 12 海里（约一个半掩码格）：够盖住擦角，又不足以横穿半岛。
 */
export interface AdvanceResult {
  /** 推进后的已航行里程（海里）；触礁时等于入参 fromNm */
  traveledNm: number
  /** 是否发生了"擦边跳过" */
  grazed: boolean
  /** 是否真的撞上陆地、必须停下 */
  aground: boolean
}

export function advanceAlongRoute(params: {
  fromNm: number
  stepNm: number
  totalNm: number
  /** 给定里程返回该点的坐标 */
  posAt: (nm: number) => [number, number]
  /** 该坐标是否是陆地 */
  isLand: (lat: number, lng: number) => boolean
  /** 擦边前瞻距离（海里）。0 表示不容忍（等价于旧行为） */
  lookaheadNm: number
}): AdvanceResult {
  const { fromNm, stepNm, totalNm, posAt, isLand, lookaheadNm } = params

  const nextNm = Math.min(totalNm, fromNm + stepNm)
  const [lat, lng] = posAt(nextNm)
  if (!isLand(lat, lng)) return { traveledNm: nextNm, grazed: false, aground: false }

  // 擦边：向前找第一个海面点。
  // 从 1 海里起步、1 海里一档，口径与"里程"一致，避免用经纬度步长造成密度不均。
  for (let ahead = 1; ahead <= lookaheadNm; ahead++) {
    const t = nextNm + ahead
    if (t >= totalNm) break
    const [la, ln] = posAt(t)
    if (!isLand(la, ln)) return { traveledNm: t, grazed: true, aground: false }
  }

  return { traveledNm: fromNm, grazed: false, aground: true }
}
