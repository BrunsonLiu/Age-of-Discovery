import { useEffect, useRef } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { skyAt } from '@/utils/skyClock'

/**
 * 羊皮纸装饰层：只保留纸纹、暗角，以及**天时**两片色层。
 *
 * 【为什么把罗盘玫瑰、海怪、罗盘星全部删掉了】
 * 它们都是 `absolute` 定位的**屏幕固定**插画，位置写死在四个角上，
 * 而四个角恰好全被 UI 占着。实测（像素 A/B：关掉装饰后比同一区域的差异）：
 *   · 左下罗盘星 (12,756)  → 最大差 **0**，被掮客卡完全压住，从来没显示过；
 *   · 右上罗盘玫瑰 (1300,12) → 被「3D 海图」按钮与小地图埋掉，只剩一道弧线露在外面，
 *     那道弧线看起来像个渲染错误；
 *   · 左上/右下海怪 → 半透明褐色压在**陆地上**（默认视角右下就是撒哈拉），
 *     3 倍放大下是一团污渍，不像印花。
 * 这个文件里本来就写着一句「装饰只有在看得清的时候才是装饰，看不清就只是脏」——
 * 按同一条标准，它们该走。
 *
 * 取而代之的是 **世界坐标**里的罗经玫瑰（见 RhumbLines）：钉在开阔洋面上，
 * 随地图平移缩放，四周还有从它量出去的等角航线——那才是波托兰海图的构图。
 * 屏幕固定的插画永远躲不开 UI，也永远不知道自己底下是海还是沙漠。
 *
 * dimmed=true 时把纸纹与暗角压到三成——2.5D 立体海图用。
 * 原因：.vintage-paper 是 mix-blend-mode: multiply，
 * 在 2D 的纯色羊皮纸底图上只是"年代感"，
 * 但压在受光照的 3D 画面上会把陆地亮度压到只剩 20%（实测 p90 203 → 41）。
 *
 * 【sky 只在 2D 开】2.5D 是自己算光照的（日相直接调灯），再叠一层色片
 * 就是"两套昼夜"叠加，夜里会被压两遍。
 */
export default function VintageMapOverlay({
  dimmed = false,
  sky = false,
}: {
  dimmed?: boolean
  sky?: boolean
}) {
  const nightRef = useRef<HTMLDivElement>(null)
  const warmRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sky) return
    let raf = 0
    let lastNight = -1
    let lastWarm = -1
    const tick = () => {
      raf = requestAnimationFrame(tick)
      /*
       * 直接读 store 而不是订阅：日相每帧都在变，用 useGameStore(s => ...) 订阅
       * 会把这层组件（以及它下面整张地图）每秒重渲染 60 次。
       * 这里只写两个 opacity，连 React 都不用进。
       */
      const prog = useGameStore.getState().routeProgress ?? 0
      const { lit } = skyAt(performance.now(), prog)
      /*
       * 夜：lit=0（深夜）→ 0.42，正午 → 0。
       * 上限 0.42 是量出来的：再深一层，羊皮纸上的港口名与航线金字开始读不清
       * （这张地图上全是数字，不能为了氛围牺牲可读性）。
       */
      const night = (1 - lit) * 0.42
      /*
       * 暖：以 lit=0.34 为中心的三角窗（黎明/黄昏），峰值得在两侧都归零。
       * 用三角窗而不是 sin：sin 会让"暖"整夜都在，日落之后陆地一直偏橙。
       */
      const warm = Math.max(0, 1 - Math.abs(lit - 0.34) / 0.34) * 0.34
      // 只在变化超过 0.4% 时写 DOM，避免每帧两次样式写入
      if (Math.abs(night - lastNight) > 0.004) {
        lastNight = night
        if (nightRef.current) nightRef.current.style.opacity = night.toFixed(3)
      }
      if (Math.abs(warm - lastWarm) > 0.004) {
        lastWarm = warm
        if (warmRef.current) warmRef.current.style.opacity = warm.toFixed(3)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sky])

  return (
    <div
      className={`vintage-map-overlay pointer-events-none absolute inset-0${dimmed ? ' vintage-map-overlay--dimmed' : ''}`}
      aria-hidden="true"
    >
      <div className="vintage-paper" />
      {sky && (
        <>
          <div ref={nightRef} className="sky-night" />
          <div ref={warmRef} className="sky-warm" />
        </>
      )}
      <div className="vintage-vignette" />
    </div>
  )
}
