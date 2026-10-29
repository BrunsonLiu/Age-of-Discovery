import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * 可滚动列表 + 「下面还有内容」的渐隐提示。
 *
 * 【为什么不用滚动条来提示】
 * 面板里的商品/任务/日志列表都设了 max-h + overflow-y-auto，内容溢出是常态。
 * 但滚动条在这个环境里**靠不住**：
 *   · 7 个面板原来写的 `scrollbar-thin` 是 tailwind-scrollbar 插件的类名，
 *     本项目没装这个插件，等于一行样式都没生成；
 *   · 换成项目自己的 `.scroll-parchment`（::-webkit-scrollbar 6px 金色）后，
 *     Windows 的 overlay 滚动条策略会让它默认隐藏，只有滚动时闪一下。
 * 结果就是玩家看到「朱砂」被切一半、右边什么都没有，以为功能坏了。
 *
 * 【做法】
 * 不用滚动条，直接在底部盖一层渐变——有内容可滚时是"雾"，滚到底自动消失。
 * 这跟滚动条实现无关，任何浏览器、任何系统设置下都成立。
 *
 * 渐隐色默认取 ParchmentCard 的深褐 (#30241a)；放在别的容器里时用 fadeColor 覆盖。
 */
export default function ScrollFade({
  className = '',
  fadeColor = '#30241a',
  fadeHeight = 28,
  children,
}: {
  /** 滚动容器自己的类（max-h / overflow-y-auto / padding 都写这里） */
  className?: string
  fadeColor?: string
  fadeHeight?: number
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [scrollable, setScrollable] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = () => {
      // 差 2px 容错：缩放/小数高度下 scrollTop 常差零点几
      const canScroll = el.scrollHeight > el.clientHeight + 2
      setScrollable(canScroll)
      setAtBottom(!canScroll || el.scrollTop + el.clientHeight >= el.scrollHeight - 2)
    }

    measure()
    el.addEventListener('scroll', measure, { passive: true })
    // 内容增减（买入数量变了、新日志进来）也要重算
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    if (el.firstElementChild) ro.observe(el.firstElementChild)

    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [])

  const showFade = scrollable && !atBottom

  return (
    <div className="relative">
      <div ref={ref} className={className}>{children}</div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 transition-opacity duration-200"
        style={{
          height: fadeHeight,
          opacity: showFade ? 1 : 0,
          background: `linear-gradient(to top, ${fadeColor} 0%, ${fadeColor}b3 45%, transparent 100%)`,
        }}
      />
    </div>
  )
}
