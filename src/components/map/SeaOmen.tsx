import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'

/**
 * 海上异闻：海面上升起的一个剪影 + 一行字，几秒后自己消失。
 *
 * 【这一层存在的理由】
 * 试玩反馈是"任务感太重、弹窗太多"。所以这里刻意**什么都不做**：
 * 没有按钮、没有选项、没有奖励，甚至不需要玩家看见。
 * 玩家可以完全无视它继续开船——而世界因此还活着。
 *
 * 【为什么是 SVG 剪影而不是插图】
 * 现有事件插图是 1200×675 的油画，贴到海图上就是一个矩形，
 * 和手绘海图的语言打架。剪影是矢量：随船位缩放、边缘能融进海面，
 * 观感上像"海图边角上画的怪物"，而且零加载字节。
 *
 * 【时长】8 秒。短于 5 秒来不及看清那行字，长于 10 秒就变成挡在屏幕上的东西了。
 */
const SHOW_MS = 8000

/** 每种异闻摆在哪、怎么动（位置写死，避免每次出现都"跳一下"） */
const LAYOUT: Record<string, { box: string; cls: string }> = {
  kraken: { box: 'left-[6%] bottom-[14%] w-[34%] max-w-[380px]', cls: 'omen-rise' },
  whale: { box: 'left-[10%] bottom-[26%] w-[30%] max-w-[340px]', cls: 'omen-drift' },
  ghost: { box: 'right-[8%] top-[24%] w-[26%] max-w-[300px]', cls: 'omen-drift-slow' },
  siren: { box: 'right-[10%] bottom-[20%] w-[22%] max-w-[250px]', cls: 'omen-rise' },
  meteor: { box: 'right-[16%] top-[8%] w-[26%] max-w-[300px]', cls: 'omen-fall' },
  lights: { box: 'left-[18%] bottom-[8%] w-[46%] max-w-[520px]', cls: 'omen-glow' },
}

function Silhouette({ kind }: { kind: string }) {
  // 统一用墨色：海图上画的东西本来就该是墨，不是彩色贴纸
  const ink = '#1a1207'
  const soft = 'rgba(26,18,7,0.55)'
  switch (kind) {
    case 'kraken':
      // 三条触手破水，最高的那条弯着
      return (
        <svg viewBox="0 0 300 160" className="w-full h-auto" aria-hidden="true">
          <path d="M40 160c4-40 10-70 26-92 8-11 22-9 24 4 3 18-6 34-2 52" fill={ink} opacity="0.9" />
          <path d="M120 160c2-52 8-96 30-120 10-11 24-4 22 10-3 22-16 40-14 62 1 16 6 32 8 48" fill={ink} opacity="0.95" />
          <path d="M210 160c-4-30-2-58 10-76 8-12 22-6 20 8-3 20-12 38-10 68" fill={ink} opacity="0.85" />
          <ellipse cx="150" cy="158" rx="120" ry="10" fill={soft} />
        </svg>
      )
    case 'whale':
      return (
        <svg viewBox="0 0 300 120" className="w-full h-auto" aria-hidden="true">
          <path d="M10 96c40-34 96-44 150-36 26 4 48 14 62 26-18 6-34 4-52 0-30-6-58-2-84 10" fill={ink} opacity="0.9" />
          {/* 尾鳍 */}
          <path d="M232 84c12-14 26-18 40-10-8 8-16 16-22 26-6-4-12-10-18-16z" fill={ink} opacity="0.9" />
          {/* 水花 */}
          <path d="M120 96c6-14 16-20 28-18-6 12-14 18-24 22z" fill="rgba(240,236,220,0.5)" />
        </svg>
      )
    case 'ghost':
      return (
        <svg viewBox="0 0 220 220" className="w-full h-auto" aria-hidden="true">
          {/* 残帆 */}
          <path d="M96 30c22 8 34 30 32 62-14-10-24-16-36-18 6-16 6-30 4-44z" fill={ink} opacity="0.75" />
          <path d="M92 96c-18 6-28 18-30 34 14-6 24-10 34-10z" fill={ink} opacity="0.5" />
          {/* 船体 */}
          <path d="M44 150c26 10 70 10 100-2l-10 16c-26 8-58 8-82-2z" fill={ink} opacity="0.9" />
          <rect x="94" y="44" width="4" height="108" fill={ink} opacity="0.9" />
          {/* 甲板上的人影 */}
          {[62, 78, 112, 126].map((x, i) => (
            <rect key={i} x={x} y={138} width="4" height="12" fill={ink} opacity="0.8" />
          ))}
        </svg>
      )
    case 'siren':
      return (
        <svg viewBox="0 0 200 180" className="w-full h-auto" aria-hidden="true">
          {/* 礁石 */}
          <path d="M0 180c30-22 48-56 60-78 6-12 16-14 24-6 12 12 18 32 30 44 16 16 46 24 86 40z" fill={ink} opacity="0.95" />
          {/* 坐着的人影 */}
          <path d="M92 102c6-14 18-20 26-14 6 4 8 14 4 22-6 12-16 18-24 14-8-4-10-14-6-22z" fill={ink} />
          <circle cx="112" cy="78" r="8" fill={ink} />
        </svg>
      )
    case 'meteor':
      return (
        <svg viewBox="0 0 300 140" className="w-full h-auto" aria-hidden="true">
          <defs>
            <linearGradient id="omen-meteor" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,226,150,0)" />
              <stop offset="70%" stopColor="rgba(255,214,130,0.55)" />
              <stop offset="100%" stopColor="rgba(255,246,210,0.95)" />
            </linearGradient>
          </defs>
          <path d="M8 4 L120 130 L96 132 L0 18 Z" fill="url(#omen-meteor)" />
          <circle cx="120" cy="130" r="3.5" fill="#fff6d2" />
        </svg>
      )
    case 'lights':
    default:
      return (
        <svg viewBox="0 0 320 90" className="w-full h-auto" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <ellipse key={i} cx={24 + i * 44} cy={60 - (i % 3) * 8} rx={26} ry={5}
              fill="rgba(150,225,225,0.35)" />
          ))}
        </svg>
      )
  }
}

export default function SeaOmen() {
  const omen = useGameStore(s => s.seaOmen)
  const panel = useGameStore(s => s.activePanel)
  const [shown, setShown] = useState<{ kind: string; text: string; day: number } | null>(null)
  const lastDayRef = useRef<number>(-1)

  useEffect(() => {
    if (!omen) return
    if (omen.day === lastDayRef.current) return
    lastDayRef.current = omen.day
    setShown(omen)
    const t = setTimeout(() => setShown(null), SHOW_MS)
    return () => clearTimeout(t)
  }, [omen])

  // 面板打开时不抢戏：玩家正在看数据，不需要海面同时讲故事
  if (!shown || panel) return null

  const layout = LAYOUT[shown.kind] ?? LAYOUT.lights

  return (
    <div
      data-sea-omen={shown.kind}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 460 }}
      aria-hidden="true"
    >
      <div className={`absolute ${layout.box} ${layout.cls}`}>
        <Silhouette kind={shown.kind} />
      </div>
      {/* 一行字压在剪影下方：这是整段体验唯一的"文本"，不再弹任何东西 */}
      <div className={`absolute left-1/2 -translate-x-1/2 bottom-[6%] omen-caption`}>
        <span className="font-serif text-[13px] tracking-wide" style={{ color: 'rgba(240,226,196,0.86)', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
          {shown.text}
        </span>
      </div>
    </div>
  )
}
