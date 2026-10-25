import { useEffect, useRef, useState } from 'react'
import { DURATION, easeOutQuint, lerp, prefersReducedMotion } from '@/utils/motion'

/**
 * 数值滚动：值变化时从旧值平滑过渡到新值，而不是"啪"地跳过去。
 *
 * 这是"设备感"最廉价也最明显的一环——iOS 上所有数字都是这样动的，
 * 人眼对"跳变"敏感，对"滚动"宽容，所以滚动会让整个界面显得更贵。
 *
 * 关键细节：
 * 1. 用 rAF 驱动，不要用 CSS transition（CSS 无法插值整数并正确取整）
 * 2. 值变化时从**当前显示值**起步，不是从旧 state 起步——
 *    否则连续快速变化会跳回起点
 * 3. 尊重 prefers-reduced-motion：直接跳到新值
 */
export function useRolledNumber(value: number, durationMs: number = DURATION.quick): number {
  const [display, setDisplay] = useState(value)
  const currentRef = useRef(value)
  const rafRef = useRef(0)
  const fromRef = useRef(value)

  useEffect(() => {
    const from = currentRef.current
    const to = value

    // 变化极小或首次挂载：直接赋值，不做动画
    if (from === to) return

    if (prefersReducedMotion()) {
      currentRef.current = to
      setDisplay(to)
      return
    }

    // 差值太小不值得滚动（比如 100 → 102），避免轻微抖动
    if (Math.abs(to - from) < 0.5) {
      currentRef.current = to
      setDisplay(to)
      return
    }

    fromRef.current = from
    const start = performance.now()

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = easeOutQuint(t)
      const next = lerp(fromRef.current, to, eased)
      currentRef.current = next
      setDisplay(next)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        currentRef.current = to
        setDisplay(to)
      }
    }
    rafRef.current = requestAnimationFrame(step)

    return () => cancelAnimationFrame(rafRef.current)
  }, [value, durationMs])

  return display
}

/**
 * 带方向标记的滚动数值：返回一个可直接显示的字符串与涨跌方向。
 * 用于 "+12" / "-8" 这种带符号的展示——方向要能一眼看出来。
 */
export function useRolledDelta(
  value: number,
  durationMs: number = DURATION.quick,
): { text: string; direction: 'up' | 'down' | 'flat'; display: number } {
  const prevRef = useRef(value)
  const display = useRolledNumber(value, durationMs)
  const [direction, setDirection] = useState<'up' | 'down' | 'flat'>('flat')

  useEffect(() => {
    const prev = prevRef.current
    if (value !== prev) {
      setDirection(value > prev ? 'up' : 'down')
      prevRef.current = value
    }
  }, [value])

  const rounded = Math.round(display)
  const signed = rounded > 0 ? `+${rounded}` : `${rounded}`
  return { text: signed, direction, display }
}
