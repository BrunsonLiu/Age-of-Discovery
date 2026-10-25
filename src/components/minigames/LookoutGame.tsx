import { useEffect, useRef, useState } from 'react'
import {
  ESCAPE_DIRS,
  ESCAPE_DIR_KEY,
  LOOKOUT_MAX_LEN,
  LOOKOUT_START_LEN,
  type LookoutState,
  type MiniGameModifiers,
  advanceLookout,
  createLookoutState,
  lookoutPerformance,
  pressLookout,
} from '@/utils/miniGame'
import { arrowToDir, useMiniGameLoop } from '@/hooks/useMiniGameLoop'
import { useFxStore as useFx } from '@/store/useFxStore'

/**
 * 瞭望：灯号记忆序列。
 *
 * 瞭望员会打出一串灯号（四个方向的信号灯依次亮起），
 * 玩家必须按同样的顺序用方向键复现。序列一轮比一轮长。
 *
 * 视觉：上方是"信号灯塔"（展示阶段亮灯），下方是玩家的复现进度格。
 */
export default function LookoutGame({ modifiers, onDone }: {
  modifiers: MiniGameModifiers
  onDone: (score: number) => void
}) {
  const stateRef = useRef<LookoutState | null>(null)
  const [phase, setPhase] = useState('')
  const [hint, setHint] = useState('')
  const [round, setRound] = useState(1)

  const lampRefs = useRef<(HTMLDivElement | null)[]>([])
  const slotRefs = useRef<(HTMLDivElement | null)[]>([])
  const seqTextRef = useRef<HTMLSpanElement>(null)
  const timerBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    stateRef.current = createLookoutState()
  }, [])

  useMiniGameLoop<LookoutState>({
    active: true,
    stateRef,
    runtime: {
      create: createLookoutState,
      step: (s, dt) => {
        const before = s.phase
        advanceLookout(s, dt, modifiers)
        // 阶段切换需要 React 重渲染（灯号高亮、输入格显示）
        if (before !== s.phase) {
          setPhase(s.phase)
          setRound(s.round + 1)
          if (s.phase === 'input') setHint('按顺序复现刚才的灯号')
          // 超时判负：阶段从 input 直接跳到 roundOver
          if (before === 'input' && s.phase === 'roundOver' && s.failReason === 'timeout') {
            setHint('太慢了——这一轮作废')
            useFx.getState().cue('impact')
          }
        }
        return s.finished
      },
      onKey: (s, key) => {
        const dir = arrowToDir(key)
        if (!dir) return false
        if (s.phase !== 'input') {
          // 展示阶段按方向键 = 空按，不惩罚
          return false
        }
        const { ok, roundFailed, cleared } = pressLookout(s, dir)
        if (roundFailed) {
          setHint('记错了——这一轮作废')
          useFx.getState().cue('impact')
        } else if (cleared) {
          setHint(`记对了！下一轮 ${Math.min(LOOKOUT_MAX_LEN, s.sequence.length + 1)} 盏`)
          useFx.getState().cue('task')
        } else if (ok) {
          useFx.getState().cue('sail')
        }
        return false
      },
      score: (s) => lookoutPerformance(s, modifiers),
    },
    onFinish: (score) => onDone(score),
    render: (s) => {
      // dev 调试钩子：让无头浏览器实测能读到当前序列并按对通关
      // 生产构建会被 tree-shake 掉（import.meta.env.DEV 为 false）
      if (import.meta.env?.DEV) {
        ;(window as unknown as { __lookout?: unknown }).__lookout = {
          phase: s.phase, seq: s.sequence, input: s.input, round: s.round,
          timer: s.timer, inputLimit: s.inputLimit, missed: s.missed, cleared: s.cleared,
        }
      }
      // 信号灯：展示阶段亮起当前那盏
      for (let i = 0; i < ESCAPE_DIRS.length; i++) {
        const el = lampRefs.current[i]
        if (!el) continue
        const lit = s.phase === 'lit' && s.sequence[s.litIndex] === ESCAPE_DIRS[i]
        el.style.opacity = lit ? '1' : '0.28'
        el.style.transform = `scale(${lit ? 1.15 : 1})`
        el.style.boxShadow = lit ? '0 0 18px rgba(251,191,36,0.7)' : 'none'
      }      // 复现进度格：按对了就填上
      for (let i = 0; i < s.sequence.length; i++) {
        const el = slotRefs.current[i]
        if (!el) continue
        const filled = i < s.input.length
        el.style.background = filled ? 'rgba(125,211,160,0.85)' : 'rgba(15,32,48,0.6)'
        el.style.borderColor = filled ? 'rgba(125,211,160,0.9)' : 'rgba(201,169,110,0.3)'
      }
      if (seqTextRef.current) {
        seqTextRef.current.textContent = `${Math.min(s.sequence.length, LOOKOUT_MAX_LEN)}`
      }
      // 复现倒计时条：只在复现阶段显示进度
      if (timerBarRef.current) {
        const ratio = s.inputLimit > 0 ? Math.max(0, s.timer / s.inputLimit) : 0
        timerBarRef.current.style.width = `${ratio * 100}%`
        timerBarRef.current.style.background = ratio < 0.32
          ? 'rgba(248,113,113,0.9)'
          : 'rgba(125,211,160,0.85)'
      }
    },
  })

  const showInput = phase === 'input'

  return (
    <div className="p-5 space-y-4">
      {/* 信号灯塔 */}
      <div>
        <div className="flex items-center justify-between text-[10px] font-serif text-gold-600 mb-2">
          <span>瞭望信号灯</span>
          <span>第 <span ref={seqTextRef} className="text-gold-400">{LOOKOUT_START_LEN}</span> 盏</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {ESCAPE_DIRS.map((dir, i) => (
            <div
              key={dir}
              ref={el => { lampRefs.current[i] = el }}
              className="h-16 rounded-lg border-2 border-gold-700/40 bg-ocean-800/60 flex flex-col items-center justify-center transition-none"
              style={{ opacity: '0.28' }}
            >
              <span className="text-xl text-gold-300">{ESCAPE_DIR_KEY[dir]}</span>
              <span className="text-[10px] font-serif text-gold-500 mt-0.5">
                {dir === 'up' ? '上' : dir === 'down' ? '下' : dir === 'left' ? '左' : '右'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 复现进度 */}
      <div>
        <div className="flex items-center justify-between text-[10px] font-serif text-gold-600 mb-1.5">
          <span>你的复现</span>
          <span className="text-gold-400">第 {round} 轮</span>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {Array.from({ length: LOOKOUT_MAX_LEN }, (_, i) => (
            <div
              key={i}
              ref={el => { slotRefs.current[i] = el }}
              className="w-6 h-6 rounded border-2"
              style={{ background: 'rgba(15,32,48,0.6)', borderColor: 'rgba(201,169,110,0.3)' }}
            />
          ))}
        </div>
      </div>

      {/* 复现倒计时条：只在复现阶段出现，展示阶段不占位 */}
      {showInput && (
        <div className="flex items-center gap-2 text-xs font-serif">
          <span className="text-gold-500 w-14 shrink-0">复现</span>
          <div className="flex-1 h-2 bg-ocean-700 rounded-full overflow-hidden">
            <div ref={timerBarRef} className="h-full rounded-full" style={{ width: '0%' }} />
          </div>
        </div>
      )}

      <p className="text-gold-300 text-xs font-serif text-center h-4">
        {showInput
          ? hint || '按方向键复现灯号'
          : phase === 'lead' ? '准备……'
          : phase === 'roundOver' ? hint || '看仔细'
          : '看仔细'}
      </p>
      <p className="text-[10px] font-serif text-gold-600 text-center">
        {showInput ? '方向键或 WASD · 顺序不能错' : '灯号亮起时不要按键'}
      </p>
    </div>
  )
}
