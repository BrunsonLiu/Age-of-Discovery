/**
 * 海图桌上那张图的"航线"几何（纯函数，可单测）。
 *
 * 【为什么值得画】海图桌如果只有一张装饰性的旧图，它和墙上贴一张画没区别。
 * 而玩家在船上最关心的一件事就是**我在往哪走、还有多远** —— 这个信息现在只在
 * 出航计划面板里。把真实的方位与剩余距离画到桌上那张图上，是"机制靠画面落地"：
 * 走到桌前低头一看，就知道船头朝着哪、离目标还差多少。
 *
 * 【坐标约定】图是"上北下南"的平面：方位 0°（正北）画成向上的线，90°（正东）
 * 画成向右。canvas 的 y 轴向下，所以向北的分量取负。
 */

export interface ChartCourse {
  /** 线段方向（弧度，canvas 坐标系：0 = 向右、顺时针为正） */
  angleRad: number
  /** 线段长度占图面半宽的比例（0.18~0.82，太短看不见、太长会画到图框外） */
  lengthFrac: number
}

/** 剩余距离的上限（海里）：超过它一律按"最远"画，图上不再线性可读 */
export const CHART_MAX_NM = 3000

/**
 * 把"到下一站的方位 + 剩余距离"换算成图上那条线。
 *
 * @param bearingDeg 真方位（0=北、90=东）
 * @param remainNm 剩余海里
 * @returns null 表示"没有航路"（图上不该有那条线）
 */
export function chartCourse(bearingDeg: number | null, remainNm: number | null): ChartCourse | null {
  if (bearingDeg == null || remainNm == null) return null
  if (!Number.isFinite(bearingDeg) || !Number.isFinite(remainNm)) return null
  if (remainNm <= 0) return null
  const rad = (bearingDeg * Math.PI) / 180
  /*
   * canvas 的角度：right = 0、down = +90°。向北（方位 0）要对准"上" = −90°，
   * 向东（90°）对准"右" = 0°。所以 angle = bearing − 90°。
   */
  const angleRad = rad - Math.PI / 2
  // 距离越远线越长，但永远留 18% 的边距（否则线端会被图框切掉）
  const k = Math.max(0, Math.min(1, remainNm / CHART_MAX_NM))
  const lengthFrac = 0.18 + 0.64 * k
  return { angleRad, lengthFrac }
}
