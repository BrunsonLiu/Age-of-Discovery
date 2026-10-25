import { useEffect, useRef, useState } from 'react'
import {
  ESCAPE_DIRS,
  ESCAPE_DIR_KEY,
  ESCAPE_WAVES,
  type EscapeDir,
  type EscapeState,
  type MiniGameModifiers,
  advanceEscape,
  createEscapeState,
  dodgeEscape,
  escapePerformance,
} from '@/utils/miniGame'
import { arrowToDir, useMiniGameLoop } from '@/hooks/useMiniGameLoop'
import { useFxStore as useFx } from '@/store/useFxStore'

/**
 * 逃脱：方向键闪避。
 *
 * 屏幕上四个方向会亮起一个"来袭方向"，玩家必须在攻击落下前
 * 按下对应的方向键（↑↓←→ 或 WASD）格挡开。
 *
 * 视觉：中央一个"你"的位置，四个方向各有一个来袭指示箭头，
 * 箭头越亮 = 攻击越近。倒计时条同步收缩。
 */
export default function EscapeGame({ modifiers, onDone }: {
  modifiers: MiniGameModifiers
  onDone: (score: number) => void
}) {
  const stateRef = useRef<EscapeState | null>(null)
  const [hint, setHint] = useState('')

  // DOM 直改引用
  const arrowRefs = useRef<(HTMLDivElement | null)[]>([])
  const timerBarRef = useRef<HTMLDivElement>(null)
  const countRef = useRef<HTMLSpanElement>(null)
  const dodgedRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    stateRef.current = createEscapeState()
  }, [])

  useMiniGameLoop<EscapeState>({
    active: true,
    stateRef,
    runtime: {
      create: createEscapeState,
      step: (s, dt) => {
        advanceEscape(s, dt, Math.random, modifiers)
        return s.finished
      },
      onKey: (s, key) => {
        const dir = arrowToDir(key)
        if (!dir) return false
        const { dodged, speed } = dodgeEscape(s, dir)
        if (dodged) {
          setHint(speed > 0.75 ? '漂亮——提前量十足' : '挡住了')
          useFx.getState().cue('sail')
        } else {
          setHint('方向按错了——挨了一下')
          useFx.getState().cue('impact')
        }
        return false
      },
      score: (s) => escapePerformance(s, modifiers),
    },
    onFinish: (score) => onDone(score),
    render: (s) => {
      // 四个箭头：来袭方向高亮 + 缩放，其他方向暗淡
      for (let i = 0; i < ESCAPE_DIRS.length; i++) {
        const el = arrowRefs.current[i]
        if (!el) continue
        const isTarget = s.dir === ESCAPE_DIRS[i]
        const urgent = isTarget && s.timer < 0.45
        el.style.opacity = isTarget ? '1' : '0.22'
        el.style.transform = `scale(${isTarget ? (urgent ? 1.25 : 1.05) : 0.9})`
        el.style.borderColor = isTarget
          ? (urgent ? 'rgba(248,113,113,0.95)' : 'rgba(251,191,36,0.9)')
          : 'rgba(201,169,110,0.25)'
        el.style.background = isTarget
          ? (urgent ? 'rgba(248,113,113,0.22)' : 'rgba(251,191,36,0.18)')
          : 'rgba(15,32,48,0.5)'
      }
      if (timerBarRef.current) {
        const ratio = s.window > 0 ? Math.max(0, s.timer / s.window) : 0
        timerBarRef.current.style.width = `${ratio * 100}%`
        timerBarRef.current.style.background = ratio < 0.32
          ? 'rgba(248,113,113,0.9)'
          : 'rgba(125,211,160,0.85)'
      }
      if (countRef.current) countRef.current.textContent = `${Math.min(ESCAPE_WAVES, s.wave + (s.dir ? 1 : 0))}/${ESCAPE_WAVES}`
      if (dodgedRef.current) dodgedRef.current.textContent = `${s.dodged}`
    },
  })

  return (
    <div className="p-5 space-y-3">
      {/* 方向键指示盘：中央是"你"，四周是来袭方向 */}
      <div className="relative mx-auto w-56 h-56">
        {/* 中央：你自己 */}
        <div className="absolute inset-0 m-auto w-16 h-16 rounded-full border-2 border-gold-600/60 bg-ocean-800/70 flex items-center justify-center">
          <span className="text-2xl">🧍</span>
        </div>
        {/* 四个来袭方向 */}
        {ESCAPE_DIRS.map((dir, i) => {
          const pos: Record<EscapeDir, string> = {
            up: 'left-1/2 -translate-x-1/2 top-0',
            down: 'left-1/2 -translate-x-1/2 bottom-0',
            left: 'left-0 top-1/2 -translate-y-1/2',
            right: 'right-0 top-1/2 -translate-y-1/2',
          }
          return (
            <div
              key={dir}
              ref={el => { arrowRefs.current[i] = el }}
              className={`absolute w-14 h-14 rounded-lg border-2 flex items-center justify-center text-xl transition-none ${pos[dir]}`}
              style={{ opacity: '0.22' }}
            >
              {ESCAPE_DIR_KEY[dir]}
            </div>
          )
        })}
      </div>

      {/* 倒计时条 */}
      <div className="flex items-center gap-2 text-xs font-serif">
        <span className="text-gold-500 w-14 shrink-0">来袭</span>
        <div className="flex-1 h-2 bg-ocean-700 rounded-full overflow-hidden">
          <div ref={timerBarRef} className="h-full rounded-full" style={{ width: '0%' }} />
        </div>
        <span ref={countRef} className="text-gold-300 w-12 text-right">1/{ESCAPE_WAVES}</span>
      </div>

      <div className="flex items-center justify-between text-xs font-serif">
        <span className="text-gold-500">
          已格挡 <span ref={dodgedRef} className="text-emerald-300">0</span> 次
        </span>
        <span className="text-gold-600">方向键或 WASD</span>
      </div>

      <p className="text-gold-300 text-xs font-serif text-center h-4">{hint}</p>
    </div>
  )
}
