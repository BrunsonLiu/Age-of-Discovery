/**
 * 动效基础设施。
 *
 * 目标：让游戏里的每一次状态变化都"可感知但不打断"——
 * 数值变化用滚动代替跳变，元素进出用统一的弹簧曲线，
 * 并尊重系统的"减弱动态效果"偏好。
 *
 * 曲线取自 iOS 的手感特征：起步快、尾巴长（easeOutBack 用于入场，
 * easeOutQuint 用于数值滚动）。不用 linear——那是机械感的主源。
 */

/** 入场：轻微回弹，元素"落定"而不是"出现" */
export const EASE_SPRING = 'cubic-bezier(0.34, 1.32, 0.64, 1)'
/** 出场：加速离开，快而不糙 */
export const EASE_EXIT = 'cubic-bezier(0.4, 0, 1, 1)'
/** 通用：标准缓动，用于位移与颜色 */
export const EASE_STANDARD = 'cubic-bezier(0.32, 0.72, 0, 1)'

/** 时长档位（毫秒）——全项目统一，避免出现 0.2s / 0.25s / 300ms 混用 */
export const DURATION = {
  /** 微反馈：按钮按下、图标切换 */
  instant: 90,
  /** 数值滚动、资源条伸缩 */
  quick: 280,
  /** 面板进出、卡片浮起 */
  normal: 380,
  /** 全屏转场、结算落定 */
  grand: 620,
} as const

/** 数值滚动用的缓动函数（easeOutQuint） */
export function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5)
}

/** 数值滚动用的缓动函数（easeOutCubic，比 Quint 更柔和） */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

/**
 * 区间映射：把进度 t∈[0,1] 映射到 [from, to]。
 * 用于数字滚动（from=旧值, to=新值）。
 */
export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t
}

/** 系统是否要求减弱动态效果 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
