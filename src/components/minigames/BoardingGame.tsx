import { useEffect, useRef, useState } from 'react'
import {
  BOARDING_PLANKS,
  BOARDING_WAVES,
  type BoardingState,
  type MiniGameModifiers,
  advanceBoarding,
  boardingPerformance,
  createBoardingState,
  pushPlank,
} from '@/utils/miniGame'
import { useMiniGameLoop } from '@/hooks/useMiniGameLoop'
import { useFxStore as useFx } from '@/store/useFxStore'

/**
 * 接舷拦跳板：海盗从三条跳板爬上来，按 1/2/3 把人推回海里。
 */
export default function BoardingGame({ modifiers, onDone }: {
  modifiers: MiniGameModifiers
  onDone: (score: number) => void
}) {
  const stateRef = useRef<BoardingState | null>(null)
  const [hint, setHint] = useState('')

  const plankRefs = useRef<(HTMLButtonElement | null)[]>([])
  const waveBarRef = useRef<HTMLDivElement>(null)
  const waveTextRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    stateRef.current = createBoardingState()
  }, [])

  useMiniGameLoop<BoardingState>({
    active: true,
    stateRef,
    runtime: {
      create: createBoardingState,
      step: (s, dt) => {
        advanceBoarding(s, dt, Math.random)
        return s.finished
      },
      onKey: (s, key) => {
        const n = Number.parseInt(key, 10)
        if (!Number.isFinite(n) || n < 1 || n > BOARDING_PLANKS) return false
        const { repelled } = pushPlank(s, n - 1, modifiers)
        if (repelled) {
          setHint('那家伙被推回海里了')
          useFx.getState().cue('task')
        } else if (s.cooldown <= 0) {
          setHint('扑空了——那儿没人')
        }
        return true
      },
      score: (s) => boardingPerformance(s, modifiers),
    },
    onFinish: (score) => onDone(score),
    render: (s) => {
      for (let i = 0; i < s.planks.length; i++) {
        const el = plankRefs.current[i]
        if (!el) continue
        const p = s.planks[i]
        const fill = el.querySelector<HTMLDivElement>('.plank-fill')
        if (fill) {
          // 逼近条自下而上生长：高度 = 攀爬进度
          fill.style.height = `${Math.min(100, p.heat * 100)}%`
          fill.style.background = p.heat > 0.75
            ? 'linear-gradient(to top, rgba(248,113,113,0.55), rgba(248,113,113,0.15))'
            : 'linear-gradient(to top, rgba(251,191,36,0.42), rgba(251,191,36,0.1))'
        }
        const mark = el.querySelector<HTMLSpanElement>('.plank-mark')
        if (mark) {
          mark.style.opacity = p.active ? '1' : '0'
          mark.style.bottom = `calc(${Math.min(94, p.heat * 100)}% - 22px)`
        }
        el.classList.toggle('plank-threat', p.active && p.heat > 0.75)
        el.classList.toggle('plank-live', p.active)
      }
      if (waveBarRef.current) {
        waveBarRef.current.style.width = `${(s.repelled / s.total) * 100}%`
      }
      if (waveTextRef.current) {
        waveTextRef.current.textContent = `${s.repelled}/${s.total}`
      }
    },
  })

  return (
    <div className="p-5 space-y-3">
      {/* 三条跳板：上沿是甲板横线，下方是海，登船者从海里往上爬 */}
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: BOARDING_PLANKS }, (_, i) => (
          <button
            key={i}
            ref={el => { plankRefs.current[i] = el }}
            onClick={() => {
              const b = stateRef.current
              if (!b) return
              const { repelled } = pushPlank(b, i, modifiers)
              if (repelled) {
                setHint('被推回海里了')
                useFx.getState().cue('task')
              } else if (b.cooldown <= 0) {
                setHint('扑空了——那儿没人')
              }
            }}
            className="plank relative h-40 rounded-lg border border-gold-700/30 bg-ocean-800/60 overflow-hidden press transition-all"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-ocean-700/25 via-ocean-800/40 to-ocean-950/70" />
            <div className="absolute left-0 right-0 top-0 h-[3px] bg-gold-600/70 z-20" />
            <div className="absolute left-1.5 right-1.5 top-1 bottom-1 z-10 pointer-events-none">
              <div
                className="plank-fill absolute left-0 right-0 bottom-0 rounded-t-sm"
                style={{ height: '0%', background: 'linear-gradient(to top, rgba(248,113,113,0.5), rgba(248,113,113,0.12))' }}
              />
            </div>
            <span className="plank-mark absolute left-1/2 -translate-x-1/2 text-2xl opacity-0 transition-opacity z-30" style={{ bottom: '4px' }}>🏴‍☠️</span>
            <span className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[10px] font-serif text-gold-400 z-10">
              {i + 1}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs font-serif">
        <span className="text-gold-500 w-14 shrink-0">击退</span>
        <div className="flex-1 h-2 bg-ocean-700 rounded-full overflow-hidden">
          <div ref={waveBarRef} className="h-full bg-emerald-400/80 rounded-full" style={{ width: '0%' }} />
        </div>
        <span ref={waveTextRef} className="text-gold-300 w-12 text-right">0/{BOARDING_WAVES}</span>
      </div>

      <p className="text-gold-300 text-xs font-serif text-center h-4">{hint}</p>
      <p className="text-[10px] font-serif text-gold-600 text-center">
        按 1 / 2 / 3 或直接点跳板 · 进度条见红时推他
      </p>
    </div>
  )
}
