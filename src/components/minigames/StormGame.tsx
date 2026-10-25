import { useEffect, useRef, useState } from 'react'
import {
  STORM_ROUNDS,
  STORM_ROUND_LIMIT,
  type MiniGameModifiers,
  type StormState,
  advanceStorm,
  createStormState,
  stormPerformance,
  tryReef,
} from '@/utils/miniGame'
import { useMiniGameLoop } from '@/hooks/useMiniGameLoop'
import { useFxStore as useFx } from '@/store/useFxStore'

/**
 * 风暴收帆：指针在风压表上来回扫，钻进绿区时按空格收帆。
 */
export default function StormGame({ modifiers, onDone }: {
  modifiers: MiniGameModifiers
  onDone: (score: number) => void
}) {
  const stateRef = useRef<StormState | null>(null)
  const [hint, setHint] = useState('')

  const needleRef = useRef<HTMLDivElement>(null)
  const windowRef = useRef<HTMLDivElement>(null)
  const roundBarRef = useRef<HTMLDivElement>(null)
  const roundTextRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const s = createStormState(Math.random, modifiers)
    stateRef.current = s
    // 首帧就把窗口带摆到第一轮的位置，避免开局闪一下默认位置
    const spec = s.rounds[0]
    const effHalf = spec.halfWidth * (1 + modifiers.windowBonus)
    if (windowRef.current) {
      windowRef.current.style.left = `${(spec.center - effHalf) * 100}%`
      windowRef.current.style.width = `${effHalf * 2 * 100}%`
    }
    if (needleRef.current) needleRef.current.style.left = `${s.needle * 100}%`
  }, [modifiers])

  useMiniGameLoop<StormState>({
    active: true,
    stateRef,
    runtime: {
      create: () => createStormState(Math.random, modifiers),
      step: (s, dt) => {
        advanceStorm(s, dt)
        return s.finished
      },
      onKey: (s, key) => {
        if (key !== ' ' && key !== 'Enter') return false
        const { hit, precision } = tryReef(s, modifiers)
        if (hit) {
          setHint(`收帆成功${precision > 0.8 ? '——正中窗口！' : ''}`)
          useFx.getState().cue('sail')
        } else if (s.cooldown <= 0) {
          setHint('收得太早或太晚——帆被扯裂了')
          useFx.getState().cue('impact')
        }
        return true
      },
      score: (s) => stormPerformance(s, modifiers),
    },
    onFinish: (score) => onDone(score),
    render: (s) => {
      if (needleRef.current) needleRef.current.style.left = `${s.needle * 100}%`
      const spec = s.rounds[Math.min(s.round, s.rounds.length - 1)]
      if (windowRef.current && spec) {
        const effHalf = spec.halfWidth * (1 + modifiers.windowBonus)
        windowRef.current.style.left = `${(spec.center - effHalf) * 100}%`
        windowRef.current.style.width = `${effHalf * 2 * 100}%`
      }
      if (roundBarRef.current) {
        roundBarRef.current.style.width = `${Math.min(100, (s.roundTime / STORM_ROUND_LIMIT) * 100)}%`
      }
      if (roundTextRef.current) {
        roundTextRef.current.textContent = `${Math.min(STORM_ROUNDS, s.round + 1)}/${STORM_ROUNDS}`
      }
    },
  })

  return (
    <div className="p-5 space-y-3">
      {/* 风压表 */}
      <div>
        <div className="flex items-center justify-between text-[10px] font-serif text-gold-600 mb-1">
          <span>风压</span>
          <span>绿区 = 收帆窗口</span>
        </div>
        <div className="relative h-14 rounded-lg overflow-hidden border border-gold-700/30 bg-ocean-800/70">
          <div className="absolute inset-0 flex justify-between px-[2%] pointer-events-none">
            {[0, 1, 2, 3, 4].map(i => (
              <span key={i} className="w-px bg-gold-700/25" />
            ))}
          </div>
          <div
            ref={windowRef}
            className="absolute top-0 bottom-0 bg-emerald-500/25 border-x-2 border-emerald-400/70"
            style={{ left: '40%', width: '20%' }}
          />
          <div
            ref={needleRef}
            className="absolute top-1 bottom-1 w-1.5 -ml-[3px] bg-gold-200 shadow-[0_0_8px_rgba(240,216,138,0.9)]"
            style={{ left: '50%' }}
          />
        </div>
        <div className="flex items-center gap-2 text-xs font-serif mt-2">
          <span className="text-gold-500 w-14 shrink-0">本轮</span>
          <div className="flex-1 h-2 bg-ocean-700 rounded-full overflow-hidden">
            <div ref={roundBarRef} className="h-full bg-sky-400/80 rounded-full" style={{ width: '0%' }} />
          </div>
        </div>
      </div>

      <p className="text-gold-300 text-xs font-serif text-center h-4">{hint}</p>

      <button
        onClick={() => {
          const s = stateRef.current
          if (!s) return
          const { hit } = tryReef(s, modifiers)
          if (hit) {
            setHint('收帆成功')
            useFx.getState().cue('sail')
          } else if (s.cooldown <= 0) {
            setHint('收得太早或太晚')
            useFx.getState().cue('impact')
          }
        }}
        className="w-full py-3 text-base font-serif text-gold-100 bg-gold-700/70 hover:bg-gold-600/80 rounded-lg press transition-all"
      >
        🪢 收帆（空格）
      </button>
    </div>
  )
}
