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
 * 视口矮于这个高度就按移动端处理。
 *
 * 520 是"桌面窗口不可能这么矮、手机横屏一定比这矮"的分界：
 * 手机横屏典型 390~430，平板横屏 744~834（不会误判成移动端），
 * 笔记本最小窗口高度通常也在 600 以上。
 */
export const SHORT_VIEWPORT = 520

/** 宽度达到这个值，底部标签栏可以排成一行（九个入口 × ~72px） */
export const TAB_SINGLE_ROW_WIDTH = 640

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
export function isCompactViewport(width: number, height: number): boolean {
  return width < MOBILE_BREAKPOINT || height < SHORT_VIEWPORT
}

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return isCompactViewport(window.innerWidth, window.innerHeight)
  })

  useEffect(() => {
    /*
     * 两个条件都要听：窄，**或者矮**。
     *
     * 【为什么必须加"矮"】手机横屏是 844×390：宽度过了 768 的断点，
     * 于是整个应用切回桌面布局——左右两列侧栏（各 92px）+ 桌面底栏
     * 全塞进 390px 高的屏幕里。实测截图：掮客卡压住左侧面板列表、
     * 小地图被右侧按钮盖住、剩下的地图不到 200px 高。
     * 桌面显示器不会矮到 520px，所以这条不会误伤。
     */
    const mqWide = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const mqShort = window.matchMedia(`(max-height: ${SHORT_VIEWPORT - 1}px)`)
    const onChange = () => setIsMobile(mqWide.matches || mqShort.matches)
    // 挂载时同步一次：SSR/首帧与 matchMedia 可能不一致
    onChange()
    const pairs = [mqWide, mqShort]
    const canAdd = typeof mqWide.addEventListener === 'function'
    for (const mq of pairs) {
      if (canAdd) mq.addEventListener('change', onChange)
      else mq.addListener(onChange)
    }
    return () => {
      for (const mq of pairs) {
        if (canAdd) mq.removeEventListener('change', onChange)
        else mq.removeListener(onChange)
      }
    }
  }, [])

  return isMobile
}

/**
 * 视口是不是"宽而矮"（手机横屏）。
 *
 * 用途：底部标签栏在竖屏要排两行（九个入口一行排不下），
 * 横屏 844px 宽时一行就够——而横屏最缺的恰恰是高度。
 */
export function useWideViewport(): boolean {
  const [wide, setWide] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth >= TAB_SINGLE_ROW_WIDTH
  })
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${TAB_SINGLE_ROW_WIDTH}px)`)
    const onChange = () => setWide(mq.matches)
    onChange()
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])
  return wide
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
