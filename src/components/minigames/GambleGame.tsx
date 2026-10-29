import { useEffect, useRef, useState } from 'react'
import { Coins } from 'lucide-react'
import {
  GAMBLE_ROUNDS,
  GAMBLE_STAKE,
  type GambleSide,
  type GambleState,
  type MiniGameModifiers,
  cashOutGamble,
  createGambleState,
  dealGamble,
  gamblePerformance,
  nextGambleRound,
  placeGambleBet,
  skipGambleRound,
} from '@/utils/miniGame'
import { useMiniGameLoop } from '@/hooks/useMiniGameLoop'
import { useFxStore as useFx } from '@/store/useFxStore'

/**
 * 赌博：押注对赌。
 *
 * 庄家摇一个点数，但只报出一个含而不露的区间。
 * 玩家选「押大」「押小」「不押」——或者见好就收，拿钱走人。
 *
 * 视觉：中间是庄家的区间牌，下方是你的赌本，右侧三个下注按钮。
 */
export default function GambleGame({ modifiers, onDone }: {
  modifiers: MiniGameModifiers
  onDone: (score: number) => void
}) {
  const stateRef = useRef<GambleState | null>(null)
  const [hint, setHint] = useState('')
  const [bankroll, setBankroll] = useState(0)
  const [round, setRound] = useState(1)
  const [revealed, setRevealed] = useState(false)

  const rangeRef = useRef<HTMLSpanElement>(null)
  const dealerRef = useRef<HTMLSpanElement>(null)
  const playerRef = useRef<HTMLSpanElement>(null)
  const pnlRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const s = dealGamble(createGambleState(), modifiers, Math.random)
    stateRef.current = s
    setBankroll(s.bankroll)
    setHint('庄家报了区间——押大还是押小？')
  }, [modifiers])

  // 下注后延迟推进到下一手（给玩家看结果的时间）
  const pendingRef = useRef<number | null>(null)

  useMiniGameLoop<GambleState>({
    active: true,
    stateRef,
    runtime: {
      create: createGambleState,
      step: (s) => s.finished,
      onKey: (s, key) => {
        if (s.finished) return false
        if (s.revealed) return false

        if (key === 'ArrowUp' || key === 'w' || key === 'W') {
          bet(s, 'high')
          return true
        }
        if (key === 'ArrowDown' || key === 's' || key === 'S') {
          bet(s, 'low')
          return true
        }
        if (key === ' ' || key === 'Enter') {
          // 收手：保住当前赌本
          cashOutGamble(s)
          setHint('见好就收，落袋为安')
          setBankroll(s.bankroll)
          useFx.getState().cue('task')
          return true
        }
        if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'a' || key === 'A' || key === 'd' || key === 'D') {
          // 跳过这一手
          skipGambleRound(s)
          setHint('这一手不押')
          setRevealed(true)
          scheduleNext(s)
          return true
        }
        return false
      },
      score: (s) => gamblePerformance(s, modifiers),
    },
    onFinish: (score) => onDone(score),
    render: (s) => {
      if (rangeRef.current) {
        rangeRef.current.textContent = s.revealed && s.dealer > 0
          ? `${s.dealer}`
          : `${s.low} ~ ${s.high}`
      }
      if (dealerRef.current) dealerRef.current.textContent = s.dealer > 0 ? String(s.dealer) : '?'
      if (playerRef.current) playerRef.current.textContent = s.player > 0 ? String(s.player) : '?'
      if (pnlRef.current) {
        pnlRef.current.textContent = `${s.pnl >= 0 ? '+' : ''}${s.pnl}`
        pnlRef.current.style.color = s.pnl >= 0 ? '#7dd3a0' : '#e07b5a'
      }
    },
  })

  function bet(s: GambleState, side: GambleSide) {
    const { won } = placeGambleBet(s, side, modifiers, Math.random)
    setHint(won ? `押中了！庄家 ${s.dealer} 点，你 ${s.player} 点` : `没押中——庄家 ${s.dealer} 点，你 ${s.player} 点`)
    setBankroll(s.bankroll)
    setRevealed(true)
    useFx.getState().cue(won ? 'milestone' : 'impact')
    scheduleNext(s)
  }

  function scheduleNext(s: GambleState) {
    if (pendingRef.current !== null) window.clearTimeout(pendingRef.current)
    pendingRef.current = window.setTimeout(() => {
      pendingRef.current = null
      nextGambleRound(s)
      if (s.finished) return
      dealGamble(s, modifiers, Math.random)
      setBankroll(s.bankroll)
      setRevealed(false)
      setRound(s.round + 1)
      setHint('庄家报了区间——押大还是押小？')
    }, 1100)
  }

  useEffect(() => () => {
    if (pendingRef.current !== null) window.clearTimeout(pendingRef.current)
  }, [])

  return (
    <div className="p-5 space-y-3">
      {/* 庄家的区间牌 */}
      <div className="rounded-lg border-2 border-gold-700/40 bg-ocean-800/60 p-4 text-center">
        <p className="text-[10px] font-serif text-gold-600 mb-1">
          {revealed ? '庄家开牌' : '庄家报了区间（点数在此范围内）'}
        </p>
        <div className="text-3xl font-serif text-gold-200 tracking-widest">
          <span ref={rangeRef}>{'--'}</span>
        </div>
        <div className="flex items-center justify-center gap-4 mt-2 text-xs font-serif">
          <span className="text-gold-500">庄家 <span ref={dealerRef} className="text-gold-200">?</span></span>
          <span className="text-gold-500">你 <span ref={playerRef} className="text-gold-200">?</span></span>
        </div>
      </div>

      {/* 赌本 */}
      <div className="flex items-center justify-between text-xs font-serif">
        <span className="text-gold-500">
          赌本 <span className="text-gold-200 text-base">{bankroll}</span>
        </span>
        <span className="text-gold-500">
          盈亏 <span ref={pnlRef} className="text-base">+0</span>
        </span>
        <span className="text-gold-500">第 {round}/{GAMBLE_ROUNDS} 手</span>
      </div>

      <p className="text-gold-300 text-xs font-serif text-center h-4">{hint}</p>

      {/* 下注按钮 */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => { const s = stateRef.current; if (s && !s.revealed) bet(s, 'high') }}
          className="py-3 rounded-lg border border-gold-700/40 bg-ocean-800/60 hover:bg-gold-700/30 press transition-all"
        >
          <div className="text-lg text-gold-200">押大 ↑</div>
          <div className="text-[10px] font-serif text-gold-500 mt-0.5">赢 +{GAMBLE_STAKE}</div>
        </button>
        <button
          onClick={() => { const s = stateRef.current; if (s && !s.revealed) bet(s, 'low') }}
          className="py-3 rounded-lg border border-gold-700/40 bg-ocean-800/60 hover:bg-gold-700/30 press transition-all"
        >
          <div className="text-lg text-gold-200">押小 ↓</div>
          <div className="text-[10px] font-serif text-gold-500 mt-0.5">赢 +{GAMBLE_STAKE}</div>
        </button>
        <button
          onClick={() => { const s = stateRef.current; if (s && !s.revealed) { skipGambleRound(s); setRevealed(true); scheduleNext(s) } }}
          className="py-3 rounded-lg border border-gold-700/40 bg-ocean-800/60 hover:bg-gold-700/30 press transition-all"
        >
          <div className="text-lg text-gold-200">不押 ←→</div>
          <div className="text-[10px] font-serif text-gold-500 mt-0.5">观望一手</div>
        </button>
      </div>

      <button
        onClick={() => { const s = stateRef.current; if (s && !s.finished) { cashOutGamble(s); setBankroll(s.bankroll); setHint('见好就收，落袋为安') } }}
        className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-serif text-gold-300 bg-ocean-800/60 hover:bg-gold-700/25 rounded-lg press transition-all"
      >
        <Coins size={12} aria-hidden="true" />
        见好就收（空格）· 带着 {bankroll} 走人
      </button>
    </div>
  )
}
