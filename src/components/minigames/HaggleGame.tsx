import { useEffect, useRef, useState } from 'react'
import {
  HAGGLE_CEILING,
  HAGGLE_DANGER_LINE,
  HAGGLE_FLOOR,
  HAGGLE_RAISE_STEP,
  HAGGLE_ROUNDS,
  HAGGLE_START_PRICE,
  type HaggleAction,
  type HaggleState,
  type MiniGameModifiers,
  advanceHaggle,
  createHaggleState,
  haggleAction,
  hagglePerformance,
} from '@/utils/miniGame'
import { useMiniGameLoop } from '@/hooks/useMiniGameLoop'
import { useFxStore as useFx } from '@/store/useFxStore'

/**
 * 贸易议价：价格拉锯。
 *
 * 对方每轮压价，玩家三选一：加价（↑，可能谈崩）／成交（↓，按当前价落袋）／
 * 收手（空格，对方因为你态度坚决而多让一步）。
 *
 * 这是四个新原型里唯一没有时间压力的——它考的是分寸感：
 * 什么时候该再顶一手、什么时候该见好就收。
 *
 * 视觉：一条价格标尺，滑块标出当前报价，底线标出对方的心理底价。
 */
export default function HaggleGame({ modifiers, onDone }: {
  modifiers: MiniGameModifiers
  onDone: (score: number) => void
}) {
  const stateRef = useRef<HaggleState | null>(null)
  const [price, setPrice] = useState(HAGGLE_START_PRICE)
  const [hint, setHint] = useState('对方开口报价了。')
  const [broken, setBroken] = useState(false)

  const markerRef = useRef<HTMLDivElement>(null)
  const floorRef = useRef<HTMLDivElement>(null)
  const roundRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    stateRef.current = createHaggleState()
  }, [])

  useMiniGameLoop<HaggleState>({
    active: true,
    stateRef,
    runtime: {
      create: createHaggleState,
      step: (s) => {
        // 玩家还没动作时，停在当前轮；动作后由 UI 显式推进
        return s.finished
      },
      onKey: (s, key) => {
        if (s.finished) return false
        if (key === 'ArrowUp' || key === 'w' || key === 'W') {
          act(s, 'raise')
          return true
        }
        if (key === 'ArrowDown' || key === 's' || key === 'S') {
          act(s, 'concede')
          return true
        }
        if (key === ' ' || key === 'Enter') {
          act(s, 'accept')
          return true
        }
        return false
      },
      score: (s) => hagglePerformance(s, modifiers),
    },
    onFinish: (score) => onDone(score),
    render: (s) => {
      // 标尺范围：底线 → 对方上限（超出上限就是贪心区）
      const span = HAGGLE_CEILING + 20 - HAGGLE_FLOOR
      const ratio = Math.max(0, Math.min(1, (s.price - HAGGLE_FLOOR) / span))
      if (markerRef.current) {
        markerRef.current.style.left = `${ratio * 100}%`
        markerRef.current.style.background = s.broken
          ? '#e07b5a'
          : s.price >= HAGGLE_DANGER_LINE ? '#f0d88a' : '#7dd3a0'
      }
      if (floorRef.current) {
        const fr = Math.max(0, Math.min(1, (s.floor - HAGGLE_FLOOR) / span))
        floorRef.current.style.left = `${fr * 100}%`
      }
      if (roundRef.current) roundRef.current.textContent = `${Math.min(HAGGLE_ROUNDS, s.round)}/${HAGGLE_ROUNDS}`
    },
  })

  function act(s: HaggleState, action: HaggleAction) {
    const { broke, closed } = haggleAction(s, action, Math.random)
    setPrice(s.broken ? 0 : (closed ? s.finalPrice : s.price))
    if (broke) {
      setBroken(true)
      setHint('对方拂袖而去——这笔生意黄了')
      useFx.getState().cue('impact')
      return
    }
    if (closed) {
      setHint(`成交：${s.finalPrice} 金`)
      useFx.getState().cue('milestone')
      return
    }
    // 加价成功但还没成交：对方继续压价
    setHint('对方再加价了一轮……')
    useFx.getState().cue('sail')
    window.setTimeout(() => {
      const st = stateRef.current
      if (!st || st.finished) return
      advanceHaggle(st, 0.016, Math.random)
      setPrice(st.price)
      if (st.broken) {
        setBroken(true)
        setHint('对方拂袖而去——这笔生意黄了')
        useFx.getState().cue('impact')
      } else {
        setHint(`对方压价到 ${st.price} 金`)
      }
    }, 450)
  }

  return (
    <div className="p-5 space-y-4">
      {/* 价格标尺 */}
      <div>
        <div className="flex items-center justify-between text-[10px] font-serif text-gold-600 mb-2">
          <span>价格标尺</span>
          <span>第 <span ref={roundRef}>1</span>/{HAGGLE_ROUNDS} 轮</span>
        </div>
        <div className="relative h-10 rounded-lg border border-gold-700/30 bg-ocean-800/60 overflow-hidden">
          {/* 刻度 */}
          <div className="absolute inset-0 flex justify-between px-1 pointer-events-none">
            {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
              <span key={i} className="w-px bg-gold-700/25" />
            ))}
          </div>
          {/* 危险线：报价越过这里，对方开始翻脸 */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-500/60"
            style={{ left: `${((HAGGLE_DANGER_LINE - HAGGLE_FLOOR) / (HAGGLE_CEILING + 20 - HAGGLE_FLOOR)) * 100}%` }}
            title="危险线"
          />
          {/* 对方底线 */}
          <div
            ref={floorRef}
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500/70"
            style={{ left: '0%' }}
            title="对方底线"
          />
          {/* 当前报价滑块 */}
          <div
            ref={markerRef}
            className="absolute top-1 bottom-1 w-2 -ml-1 rounded-full shadow-[0_0_10px_rgba(240,216,138,0.8)] transition-none"
            style={{ left: '50%', background: '#7dd3a0' }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-serif text-gold-600 mt-1">
          <span className="text-rose-400/80">底线 {HAGGLE_FLOOR}</span>
          <span className="text-amber-500/70">危险线 {HAGGLE_DANGER_LINE}</span>
          <span>上限 {HAGGLE_CEILING}</span>
        </div>
      </div>

      {/* 当前报价 */}
      <div className="text-center rounded-lg border border-gold-700/30 bg-ocean-800/40 py-3">
        <p className="text-[10px] font-serif text-gold-600">当前报价</p>
        <p className="text-3xl font-serif text-gold-200">
          {broken ? '谈崩' : `${price}`}
          {!broken && <span className="text-sm text-gold-500 ml-1">金</span>}
        </p>
        <p className="text-[10px] font-serif text-gold-600 mt-0.5">
          开价 {HAGGLE_START_PRICE} · 对方上限 {HAGGLE_CEILING} · 每加一次 +{HAGGLE_RAISE_STEP}
        </p>
      </div>

      <p className="text-gold-300 text-xs font-serif text-center h-4">{hint}</p>

      {/* 三个动作 */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => { const s = stateRef.current; if (s && !s.finished) act(s, 'raise') }}
          className="py-3 rounded-lg border border-gold-700/40 bg-ocean-800/60 hover:bg-gold-700/30 press transition-all"
        >
          <div className="text-base text-gold-200">加价 ↑</div>
          <div className="text-[10px] font-serif text-gold-500 mt-0.5">+{HAGGLE_RAISE_STEP}</div>
        </button>
        <button
          onClick={() => { const s = stateRef.current; if (s && !s.finished) act(s, 'concede') }}
          className="py-3 rounded-lg border border-gold-700/40 bg-ocean-800/60 hover:bg-gold-700/30 press transition-all"
        >
          <div className="text-base text-gold-200">成交 ↓</div>
          <div className="text-[10px] font-serif text-gold-500 mt-0.5">按现价落袋</div>
        </button>
        <button
          onClick={() => { const s = stateRef.current; if (s && !s.finished) act(s, 'accept') }}
          className="py-3 rounded-lg border border-gold-700/40 bg-ocean-800/60 hover:bg-gold-700/30 press transition-all"
        >
          <div className="text-base text-gold-200">收手 ␣</div>
          <div className="text-[10px] font-serif text-gold-500 mt-0.5">对方再让一步</div>
        </button>
      </div>
    </div>
  )
}
