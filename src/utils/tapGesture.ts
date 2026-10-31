/**
 * 「这一下算点击还是拖拽」的判定。
 *
 * 【为什么单独抽出来】
 * 这段逻辑埋在 pointerup 里时只能靠 e2e 验证，而验证它需要切到手机视口、
 * 重建 3D 场景、再发合成触摸序列 —— 又慢又脆。抽成纯函数后可以用单测把
 * 六种情形钉死（鼠标/触屏 × 点/微抖/拖），零 e2e 成本。
 *
 * 【为什么用净位移而不是累加位移】
 * 原来的判据是每帧增量绝对值之和（`moved`）。手指按下-抬起即使本意是"点"，
 * 也会有 3~5px 的游走，累加后轻松超过阈值。实测（CDP 发真实触摸序列，390×844）：
 *   抖动 0,0px → 算点击
 *   抖动 2,2px → 算点击
 *   **抖动 4,3px → 被判成拖拽**，航向设不上，玩家只看到"点了没反应"
 * 净位移（起点→终点直线距离）对"去而复返"的抖动不敏感，这才是区分
 * "手抖"与"想转视角"的正确度量。
 *
 * 【为什么阈值按设备分】
 * 鼠标是精确设备，移动 5px 已经是明确的拖动意图；
 * 手指的触摸报告本身就有几像素误差，10px 以内都该当作"点"。
 * 用一个统一阈值只能二选一：要么鼠标太松（想转视角却弹出航面板），
 * 要么触屏太严（点了没反应）。后者更伤，因为它让功能看起来是坏的。
 */

/** 鼠标/触控板的点击容忍位移（px）。精确设备，5px 已是明显拖动。 */
export const TAP_SLOP_MOUSE = 5

/** 触屏/触控笔的点击容忍位移（px）。手指按下-抬起天然有几像素游走。 */
export const TAP_SLOP_TOUCH = 10

export interface TapGestureInput {
  /** PointerEvent.pointerType：'mouse' | 'touch' | 'pen' */
  pointerType: string
  startX: number
  startY: number
  endX: number
  endY: number
  /** 期间是否发生过双指捏合（捏合松手不该被当成点击） */
  pinched: boolean
  /** PointerEvent.type：只有 'pointerup' 才可能是点击 */
  eventType: string
}

/** 是否应把这次指针交互当作"点击" */
export function isTapGesture(g: TapGestureInput): boolean {
  // pointercancel = 浏览器抢走了这次触摸（系统手势、来电横幅…）。
  // 它的坐标不可靠，且玩家的本意不是点。
  if (g.eventType !== 'pointerup') return false
  // 捏合过就绝不是点击：否则两指缩放松手会误触发"点海面设航向"
  if (g.pinched) return false
  const slop = g.pointerType === 'mouse' ? TAP_SLOP_MOUSE : TAP_SLOP_TOUCH
  const travel = Math.hypot(g.endX - g.startX, g.endY - g.startY)
  return travel <= slop
}
