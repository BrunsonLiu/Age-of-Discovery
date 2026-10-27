import { useEffect, useState } from 'react'

/**
 * 移动端断点（px）。与 Tailwind 的 `md` 一致：768px。
 *
 * 为什么用 matchMedia 而不是 `window.innerWidth < 768`：
 * 后者只在首次渲染算一次，转屏（横竖屏切换、折叠屏展开）后布局就错了。
 * matchMedia 会自己跟着断点变化走。
 */
export const MOBILE_BREAKPOINT = 768

/**
 * 当前是不是移动端布局。
 *
 * 【为什么要单独一个 hook，而不是全靠 Tailwind 的 md: 断点】
 * 本作有两类"响应"：
 * 1. **样式级**（字号、间距、宽度）——用 Tailwind 的 md:/lg: 就够了。
 * 2. **结构级**（侧栏变成底部标签栏、面板变成底部抽屉）——
 *    这不是样式能变的，是**换了一套 DOM 布局**，必须用 JS 条件渲染。
 *
 * 两者混用会出乱子：比如用 CSS 把侧栏移到屏幕外，Panel 容器还留在原地，
 * 抽屉就永远盖不住地图。所以结构级的切换一律走这个 hook。
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(mq.matches)
    // 挂载时同步一次：SSR/首帧与 matchMedia 可能不一致
    onChange()
    // Safari 14 以下只有 addListener
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])

  return isMobile
}

/**
 * 是否是"触屏为主的设备"。
 *
 * 用途：操舵挑战这类实时键盘操作必须给触屏玩家一个虚拟摇杆，
 * 否则在手机上完全没法玩。判定用 `pointer: coarse`（主输入是指针粗的设备，
 * 即手指），比 `ontouchstart` 可靠——后者在装了触摸屏的笔记本上也是 true，
 * 但那些机器有真正的键盘。
 */
export function useIsTouchPrimary(): boolean {
  const [isTouch, setIsTouch] = useState(() => {
    if (typeof window === 'undefined') return false
    return typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches
  })

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const onChange = () => setIsTouch(mq.matches)
    onChange()
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])

  return isTouch
}
