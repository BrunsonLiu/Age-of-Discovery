import { useEffect, useRef } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { skyAt } from '@/utils/skyClock'
import { harborMood } from '@/utils/harborMood'

/**
 * 把 `harborMood` 的结果写进 DOM（只写 opacity，不进 React）。
 *
 * 【为什么不用 useState】日相每帧都在变。走 React 就是每秒 60 次重渲染
 * 岸上整棵树（两张内容板 + 五个服务入口 + 日志正文）。这里和
 * `VintageMapOverlay` 同一套做法：rAF 里直接读 store、只写 ref 的 style。
 *
 * 【为什么 4Hz 而不是每帧】一昼夜 480 秒，1 秒走 1/480 的日相；
 * 夜色曲线最陡的一段，1 秒的变化也不到 0.005，而写一次 style 会触发
 * 样式重算（这一层盖在整屏上）。所以按 0.004 的门限写、并且降到 4Hz：
 * 画面看不出台阶，代价几乎为零。
 *
 * 【为什么灯在白天地板值 0 而不是 0.05】岸上这四盏灯是本项目自己画的，
 * 不像甲板窗玻璃那样有"材质底子"要保。真值为 0 才敢让 e2e 断言
 * 「白天 getComputedStyle 读到 0」（这是"灯跟日相"的判据）。
 */
export function useHarborAmbience() {
  const veilRef = useRef<HTMLDivElement | null>(null)
  const warmRef = useRef<HTMLDivElement | null>(null)
  const warmGlowRef = useRef<HTMLDivElement | null>(null)
  const starsRef = useRef<HTMLDivElement | null>(null)
  const glintRef = useRef<HTMLDivElement | null>(null)
  const rainRef = useRef<HTMLDivElement | null>(null)
  const fogRef = useRef<HTMLDivElement | null>(null)
  const lampsRef = useRef<SVGGElement | null>(null)
  const deckRef = useRef<SVGRectElement | null>(null)

  useEffect(() => {
    let raf = 0
    let lastWrite = 0
    const seen: Record<string, number> = {}
    /** 门限写：变化小于 0.004 就当没变（4Hz 下这就是全部开销） */
    const put = (key: string, el: HTMLElement | SVGElement | null, v: number) => {
      if (Math.abs(v - (seen[key] ?? -1)) <= 0.004) return
      seen[key] = v
      if (el) el.style.opacity = v.toFixed(3)
    }

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      /*
       * 只在"往前走了 250ms 以上"时写。`dt >= 0` 这个条件不是多余的：
       * 时钟被外部挪动（探针改 performance.now 取证时会往回挪）时，
       * `now - lastWrite` 会变成一个大负数，若只写 `< 250` 就会**永远**提前返回，
       * 整层天光冻在上一帧（实测：把日相从深夜挪回正午，veil 一直是 0.8）。
       */
      const dt = now - lastWrite
      if (dt >= 0 && dt < 250) return
      lastWrite = now
      const st = useGameStore.getState()
      // 与甲板/海图/2.5D 同一个取时刻方式（`skyAt(performance.now(), 进度)`）：
      // 用 rAF 回调的 now 也行，但探针要挪日相只能改 performance.now，
      // 三处写法一致才有"同一时刻问两次答案相同"这件事。
      const { night } = skyAt(performance.now(), st.routeProgress ?? 0)
      const m = harborMood(night, st.weather.kind)
      put('veil', veilRef.current, m.veil)
      put('warm', warmRef.current, m.warm)
      put('warmGlow', warmGlowRef.current, m.warm)
      put('stars', starsRef.current, m.stars)
      put('glint', glintRef.current, m.shimmer)
      put('rain', rainRef.current, m.rain)
      put('fog', fogRef.current, m.fog)
      put('lamps', lampsRef.current, m.lamps)
      /*
       * 石面吃**同一份夜幕**。
       * 夜幕层（harbor-night-veil）只盖在画上，盖不到前景那块自己画的 SVG ——
       * 实测夜里的后果：整座城压成蓝黑，脚底下的码头还是白天的亮度，
       * 读起来像"码头漂在夜色上面"。这里给石面单独一层同色暗罩，
       * 亮度跟着 `veil` 走（灯的光池画在它上面，所以灯仍然照得亮脚下）。
       */
      put('deck', deckRef.current, m.veil)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return { veilRef, warmRef, warmGlowRef, starsRef, glintRef, rainRef, fogRef, lampsRef, deckRef }
}
