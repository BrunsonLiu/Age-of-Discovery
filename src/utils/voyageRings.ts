/**
 * 航程圈：以本船为中心、画"几天能到"的等距圈。
 *
 * 【为什么海图上需要它】图上最能说明问题的判断是"这个港口我够得着吗"。玩家现在
 * 只能点港口、读面板上的"约 N 天"，再自己拿眼睛去比对距离 —— 也就是**做算术**。
 * 圈把这件事变成"看"：目的地落在 5 天圈外、10 天圈内，就是 6~10 天。
 *
 * 【半径不是拍的】半径 = `dailyDistanceNm(...) × 天数`，与出航计划、底部状态栏
 * 用的是同一个函数（船速 × 风 × 方针 × 天候 × 24）。所以圈不会和面板打架 ——
 * 这是本项目贯穿始终的规矩：同一件事只有一份算法。
 *
 * 【为什么标"约"】圈用的是**中性风**（windFavor=1）与"按部就班"的方针：真的跑起来
 * 顺风会更大、逆风会更小。所以文案写"约 5 天航程"，不写"5 天"。宁可显得保守，
 * 也不给一个精确到海里的假承诺。
 */

/** 候选天数（画哪几圈由 `pickRingDays` 按当前缩放挑，见下） */
export const RING_DAY_CANDIDATES = [1, 2, 3, 5, 7, 10, 15, 20, 30] as const

/** 圈的屏幕半径可接受区间（像素）：太小读不出来，太大整圈都在画面外 */
export const RING_MIN_PX = 70
export const RING_MAX_PX = 320

/** 每圈的圆周取样段数：72 段在这个尺度上肉眼分不出折线 */
export const RING_SEGMENTS = 72

/** 一圈都不画的最小半径（海里）：太小的圈会缩成一个点，反而挡视线 */
export const MIN_RING_NM = 8

/**
 * 按当前缩放挑"画哪几圈（天）"。
 *
 * 【为什么天数要自适应】第一版固定 5 / 10 天：默认缩放下 1 海里 ≈ 0.45px，
 * 5 天圈半径 430px、10 天圈 860px —— 10 天圈整个跑到画面外，标签更是看不见
 * （实测：只看到两条弧，一个字都没有）。天数跟着缩放走，圈才总是**看得见又量得准**：
 * 挑"屏幕半径落在 70~320px"里最大的那一档，再配一档大约一半的。
 *
 * @param nmPerDay 每日航程（海里）
 * @param pxPerNm  当前投影下 1 海里多少像素（`utils/mapScale.pxPerNmAt`）
 * @returns 升序的天数数组（0~2 个）；参数不可用或怎么挑都不合适时返回空
 */
export function pickRingDays(nmPerDay: number, pxPerNm: number): number[] {
  if (!Number.isFinite(nmPerDay) || nmPerDay <= 0) return []
  if (!Number.isFinite(pxPerNm) || pxPerNm <= 0) return []
  const fit = RING_DAY_CANDIDATES.filter((d) => {
    const px = nmPerDay * d * pxPerNm
    return px >= RING_MIN_PX && px <= RING_MAX_PX
  })
  if (fit.length === 0) return []
  const big = fit[fit.length - 1]
  // 再配一档"大约一半"的：两圈之间的距离感才够，太近就成双线了
  const small = fit.filter((d) => d <= big * 0.55).pop()
  return small ? [small, big] : [big]
}

/**
 * 由"每天能走多少海里"算出各圈半径。
 *
 * @returns 半径 > `MIN_RING_NM` 的圈；`nmPerDay` 不可用时返回空数组（不画）
 */
export function ringRadii(
  nmPerDay: number, days_: readonly number[] = RING_DAY_CANDIDATES,
): { days: number; nm: number }[] {
  if (!Number.isFinite(nmPerDay) || nmPerDay <= 0) return []
  const out: { days: number; nm: number }[] = []
  for (const days of days_) {
    const nm = nmPerDay * days
    if (nm > MIN_RING_NM) out.push({ days, nm })
  }
  return out
}

/**
 * 以 (lat, lng) 为圆心、半径 `radiusNm` 海里的圆周点（**球面**公式）。
 *
 * 【为什么不用平面近似】这个地图是墨卡托：纬度 60° 处同样的海里数在经度方向上
 * 要跨更多度（1/cos φ）。按平面算出来的"圆"在高纬度会变成一个横向压扁的椭圆，
 * 而且圈上每一点的真实距离都不等于半径 —— 那正是这个工具唯一的用途。
 * 用球面正算（destination point）得到的每个点与圆心的球面距离都精确等于半径，
 * 单测就是拿 haversine 逐点量的。
 *
 * @param segments 取样段数；返回数组首尾**不重复**（画折线时会自动闭合）
 */
export function circleLatLngs(
  lat: number, lng: number, radiusNm: number, segments: number = RING_SEGMENTS,
): [number, number][] {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radiusNm) || radiusNm <= 0) return []
  const n = Math.max(8, Math.round(segments))
  const R = 6371 // 地球平均半径（km）
  const d = radiusNm * 1.852 / R // 角距离（弧度）
  const φ1 = (lat * Math.PI) / 180
  const λ1 = (lng * Math.PI) / 180
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const θ = (2 * Math.PI * i) / n
    const sinφ2 = Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ)
    const φ2 = Math.asin(Math.max(-1, Math.min(1, sinφ2)))
    const λ2 = λ1 + Math.atan2(
      Math.sin(θ) * Math.sin(d) * Math.cos(φ1),
      Math.cos(d) - Math.sin(φ1) * sinφ2,
    )
    // 经度归一到 −180..180
    const lon = ((((λ2 * 180) / Math.PI) + 540) % 360) - 180
    out.push([(φ2 * 180) / Math.PI, lon])
  }
  return out
}
