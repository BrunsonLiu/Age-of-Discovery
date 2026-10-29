import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Anchor, Sailboat, Swords, Star, Waves } from 'lucide-react'
import MiniGameGlyph from '@/components/ui/MiniGameGlyph'
import { useGameStore } from '@/store/useGameStore'
import { useFxStore as useFx } from '@/store/useFxStore'
import { setMiniGameActive } from '@/utils/uiBus'
import {
  MINI_GAME_COPY,
  MINI_GAME_GRADE_COLOR,
  MINI_GAME_GRADE_LABEL,
  type MiniGameContext,
  type MiniGameId,
  computeModifiers,
  describeModifiers,
  describePerformance,
  miniGameGrade,
} from '@/utils/miniGame'
import StormGame from '@/components/minigames/StormGame'
import BoardingGame from '@/components/minigames/BoardingGame'
import EscapeGame from '@/components/minigames/EscapeGame'
import LookoutGame from '@/components/minigames/LookoutGame'
import GambleGame from '@/components/minigames/GambleGame'
import HaggleGame from '@/components/minigames/HaggleGame'
import CannonGame from '@/components/minigames/CannonGame'

type Phase = 'intro' | 'running' | 'done'

interface MiniGameOverlayProps {
  /** 玩哪个小游戏 */
  gameId: MiniGameId
  /** 结算回调：score 0..1 */
  onFinish: (score: number) => void
}

/** 从 store 读出经营状况 → 折算成小游戏加成 */
function useMiniGameContext(): MiniGameContext {
  const fleet = useGameStore(s => s.fleet)
  const officers = useGameStore(s => s.officers)
  return useMemo(() => {
    const flagship = fleet.ships.find(sh => sh.id === fleet.flagshipId) ?? fleet.ships[0]
    const hullRatio = flagship && flagship.maxDurability > 0
      ? flagship.durability / flagship.maxDurability
      : 0.5
    const crewRatio = flagship && flagship.maxCrew > 0
      ? flagship.crew / flagship.maxCrew
      : 0.5
    return { hullRatio, crewRatio, officers }
  }, [fleet.ships, fleet.flagshipId, officers])
}

/**
 * 事件小游戏通用容器。
 *
 * 本组件只做三件事：
 *   1. 三阶段编排（intro → running → done）
 *   2. 开场说明与结算屏（含"操作评分"，让玩家看见因果）
 *   3. portal 到 body 压过一切图层
 *
 * 各原型的实时逻辑与界面在 src/components/minigames/ 下各自独立，
 * 共享 useMiniGameLoop（ref + 60fps + DOM 直改，不触发 React 重渲染）。
 */
export default function MiniGameOverlay({ gameId, onFinish }: MiniGameOverlayProps) {
  const ctx = useMiniGameContext()
  const modifiers = useMemo(() => computeModifiers(ctx), [ctx])

  const [phase, setPhase] = useState<Phase>('intro')
  const [score, setScore] = useState(0)
  const copy = MINI_GAME_COPY[gameId]

  // 占用全局键盘：挂载期间空格/数字键/方向键归小游戏，其余通道一律不响应
  useEffect(() => {
    setMiniGameActive(true)
    return () => setMiniGameActive(false)
  }, [])

  const startRun = () => {
    setScore(0)
    useFx.getState().cue('sail')
    setPhase('running')
  }

  const finishRun = (perf: number) => {
    setScore(perf)
    setPhase('done')
    useFx.getState().cue(perf >= 0.6 ? 'milestone' : 'impact')
  }

  /* ---------------- 开场：Enter / 空格 直接开始 ---------------- */
  useEffect(() => {
    if (phase !== 'intro') return
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        startRun()
      }
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
  }, [phase])

  /* ---------------- 结算屏：Enter 继续 ---------------- */
  useEffect(() => {
    if (phase !== 'done') return
    const kd = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onFinish(score)
      }
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
  }, [phase, score, onFinish])

  const grade = miniGameGrade(score)

  // 用 portal 挂到 body：小游戏是玩家正在操作的模态，必须压过一切图层
  // （剧情对白层 z-index 75 会盖住事件卡，若小游戏挂在事件卡内部同样会被遮）
  return createPortal(
    <div
      className="fixed inset-0 flex items-start justify-center bg-black/80 backdrop-blur-sm p-3 md:p-4 overflow-y-auto"
      style={{ zIndex: 200 }}
      role="dialog"
      aria-label="事件小游戏"
    >
      <div className="my-auto w-[30rem] max-w-[94vw] bg-ocean-900/95 border border-gold-700/40 rounded-xl shadow-2xl overflow-hidden animate-fade-in-scale">
        {/* 标题栏 */}
        <div className="px-4 py-3 border-b border-gold-700/30 bg-ocean-800/50 flex items-center justify-between">
          <div>
            <h2 className="pirate-title flex items-center gap-1.5 text-lg text-gold-300">
              <MiniGameGlyph icon={copy.icon} size={16} />
              {copy.title}
            </h2>
            <p className="text-gold-500 font-serif text-xs mt-0.5">
              {phase === 'intro' && copy.intro}
              {phase === 'running' && copy.running}
              {phase === 'done' && copy.done}
            </p>
          </div>
        </div>

        {/* ---------- 开始前 ---------- */}
        {phase === 'intro' && (
          <div className="p-5 space-y-4">
            <div className="bg-ocean-800/40 border border-gold-700/20 rounded p-3 space-y-2 text-xs font-serif">
              <p
                className="text-gold-200"
                dangerouslySetInnerHTML={{ __html: copy.brief }}
              />
              <ul className="space-y-1.5 text-gold-400">
                {copy.bullets.map((b, i) => (
                  <li key={i}>· {b}</li>
                ))}
              </ul>
            </div>

            <div className="bg-gold-900/10 border border-gold-700/25 rounded p-3 text-xs font-serif">
              <p className="flex items-center gap-1 text-gold-300 mb-1">
                <Anchor size={11} aria-hidden="true" />
                你的船况
              </p>
              <ul className="space-y-1 text-gold-500">
                {describeModifiers(modifiers, ctx).map(line => (
                  <li key={line}>· {line}</li>
                ))}
              </ul>
            </div>

            <p className="text-gold-600 text-[11px] font-serif text-center">
              这一段的操作会决定结局概率往哪边偏——手稳的人拿好结果。
            </p>

            <button
              onClick={startRun}
              className="w-full py-2.5 text-sm font-serif text-gold-100 bg-gold-700/70 hover:bg-gold-600/80 rounded-lg press transition-all"
            >
              {copy.start}
            </button>
          </div>
        )}

        {/* ---------- 游戏中 ---------- */}
        {phase === 'running' && (
          <>
            {gameId === 'storm' && <StormGame modifiers={modifiers} onDone={finishRun} />}
            {gameId === 'boarding' && <BoardingGame modifiers={modifiers} onDone={finishRun} />}
            {gameId === 'escape' && <EscapeGame modifiers={modifiers} onDone={finishRun} />}
            {gameId === 'lookout' && <LookoutGame modifiers={modifiers} onDone={finishRun} />}
            {gameId === 'gamble' && <GambleGame modifiers={modifiers} onDone={finishRun} />}
            {gameId === 'haggle' && <HaggleGame modifiers={modifiers} onDone={finishRun} />}
            {gameId === 'cannon' && <CannonGame modifiers={modifiers} onDone={finishRun} />}
          </>
        )}

        {/* ---------- 结算 ---------- */}
        {phase === 'done' && (
          <div className="p-5 space-y-4">
            <div className="text-center">
              {/* 结算评级图标：原来是 🌟 / 🌀 / ⚔️ 三个彩色 emoji，
                  30px 摆在结算页正中，是整局最显眼的一块彩色，
                  和铜木金边的配色完全无关。改用描边图标 + 评级色。 */}
              <div className="flex justify-center mb-1" style={{ color: MINI_GAME_GRADE_COLOR[grade] }}>
                {grade === 'excellent'
                  ? <Star size={30} strokeWidth={1.4} fill="currentColor" aria-hidden="true" />
                  : grade === 'disaster'
                    ? <Waves size={30} strokeWidth={1.4} aria-hidden="true" />
                    : <Swords size={30} strokeWidth={1.4} aria-hidden="true" />}
              </div>
              <h3 className="pirate-title text-2xl" style={{ color: MINI_GAME_GRADE_COLOR[grade] }}>
                {MINI_GAME_GRADE_LABEL[grade]}
              </h3>
              <p className="text-gold-400 font-serif text-sm mt-1">{describePerformance(score)}</p>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center bg-ocean-800/40 rounded p-2.5">
              <div>
                <div className="text-gold-500 text-[10px] font-serif">操作评分</div>
                <div className="text-gold-200 text-lg font-serif">{score.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gold-500 text-[10px] font-serif">加成修正</div>
                <div className="text-gold-200 text-lg font-serif">
                  {modifiers.windowBonus > 0 ? `+${Math.round(modifiers.windowBonus * 100)}%` : '基准'}
                </div>
              </div>
            </div>

            <button
              onClick={() => onFinish(score)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-serif text-gold-100 bg-gold-700/70 hover:bg-gold-600/80 rounded-lg press transition-all"
            >
              <Sailboat size={13} aria-hidden="true" />
              看结果（Enter）
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
