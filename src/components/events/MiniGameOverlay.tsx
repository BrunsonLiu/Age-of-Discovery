import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGameStore } from '@/store/useGameStore'
import { useFxStore as useFx } from '@/store/useFxStore'
import { setMiniGameActive } from '@/utils/uiBus'
import {
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

/** 六个原型的文案配置（标题 / 副标题 / 开场说明 / 按键提示） */
interface GameCopy {
  icon: string
  title: string
  /** 副标题（intro / running / done 三阶段共用一个，按 phase 前缀） */
  intro: string
  running: string
  done: string
  /** 开场白（可含 <b> 标签） */
  brief: string
  /** 开场要点列表 */
  bullets: string[]
  /** 开始按钮 */
  start: string
  /** 角标（EventChoice 上显示） */
  tag: string
}

export const MINI_GAME_COPY: Record<MiniGameId, GameCopy> = {
  storm: {
    icon: '🌪',
    title: '收帆',
    intro: '看准窗口再收帆',
    running: '指针进入绿区时按空格',
    done: '这一场操作结束了',
    brief: '一根指针在风压表上来回扫。指针钻进<span class="text-emerald-300">绿区</span>的那一刻按 <span class="text-gold-200">空格</span>收帆——早了晚了都是破帆。',
    bullets: ['一共 5 轮，窗口一轮比一轮窄', '一轮 4.5 秒内不收帆，算失手', '收得越正中间，评分越高'],
    start: '⚓ 起帆迎风（Enter）',
    tag: '收帆',
  },
  boarding: {
    icon: '⚔',
    title: '拦跳板',
    intro: '别让他们踏上甲板',
    running: '按 1 / 2 / 3 推回去',
    done: '这一场操作结束了',
    brief: '海盗从三条跳板爬上来。哪条跳板有人，就按对应的 <span class="text-gold-200">1 / 2 / 3</span> 把他推回海里。',
    bullets: ['共 8 波登船者，越到后面越快', '进度条见红就要爬上来——那一瞬间推他', '推空（打在不存在的跳板上）会扣分'],
    start: '⚔ 短兵相接（Enter）',
    tag: '接舷',
  },
  escape: {
    icon: '🏃',
    title: '逃脱',
    intro: '按对方向躲开袭击',
    running: '箭头亮起就按对应方向',
    done: '这一场操作结束了',
    brief: '袭击者会从<span class="text-gold-200">四个方向</span>扑来。箭头亮起的那一刻，按下对应的 <span class="text-gold-200">方向键</span>格挡开。',
    bullets: ['一共 8 次袭击', '按错方向或来不及反应，都会被击中', '按得越早，评分越高'],
    start: '🏃 拔腿就跑（Enter）',
    tag: '逃脱',
  },
  lookout: {
    icon: '🔭',
    title: '瞭望',
    intro: '记住灯号，再复现一遍',
    running: '按顺序复现刚才的灯号',
    done: '这一场操作结束了',
    brief: '瞭望员打出一串<span class="text-gold-200">灯号</span>。你必须用方向键按<span class="text-gold-200">同样的顺序</span>复现一遍。',
    bullets: ['序列一轮比一轮长', '顺序错一个，这轮就作废', '灯亮着的时候别急着按'],
    start: '🔭 登上桅杆（Enter）',
    tag: '瞭望',
  },
  gamble: {
    icon: '🎲',
    title: '对赌',
    intro: '庄家报了区间，押大还是押小',
    running: '押大 / 押小 / 见好就收',
    done: '这一场操作结束了',
    brief: '庄家摇了一个点数，但只告诉你<span class="text-gold-200">大概的范围</span>。你押大还是押小——也可以不押，或者见好就收。',
    bullets: ['共 6 手，每手押注 20 金', '押错了赔 20 金，押对了赚 20 金', '随时可以收手，带着赌本走人'],
    start: '🎲 坐上赌桌（Enter）',
    tag: '对赌',
  },
  haggle: {
    icon: '⚖',
    title: '议价',
    intro: '价格拉锯，见好就收',
    running: '加价 / 成交 / 收手',
    done: '这一场操作结束了',
    brief: '对方每轮压价。你决定<span class="text-gold-200">加价</span>、<span class="text-gold-200">成交</span>还是<span class="text-gold-200">收手</span>——报价越过对方的<span class="text-amber-400">上限</span>，他就会拂袖而去。',
    bullets: ['共 8 轮谈判，每轮对方压价 6~12 金', '每次加价 +12，但越过危险线风险陡增', '收手会让对方多让一步'],
    start: '⚖ 摊开价单（Enter）',
    tag: '议价',
  },
  cannon: {
    icon: '💥',
    title: '舷炮',
    intro: '三轮齐射，定胜负',
    running: '空格开火 · ↓ 架盾',
    done: '这一场操作结束了',
    brief: '瞄准标在敌舰上方来回扫，扫到<span class="text-gold-200">正中间</span>时按 <span class="text-gold-200">空格</span>开火。每一轮开火之后，对方的炮弹必然砸回来——来袭标<span class="text-amber-400">越过中线</span>再按 <span class="text-gold-200">↓</span> 架盾，架早了只挡掉一半。',
    bullets: ['一共三轮齐射，轮轮有来有回', '标尺越正，炮越狠：命中 / 擦弹 / 落水三档', '等炮弹越过中线再架盾，才算及时'],
    start: '💥 炮弹上膛（Enter）',
    tag: '炮战',
  },
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
      className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
      style={{ zIndex: 200 }}
      role="dialog"
      aria-label="事件小游戏"
    >
      <div className="w-[30rem] max-w-[94vw] bg-ocean-900/95 border border-gold-700/40 rounded-xl shadow-2xl overflow-hidden animate-fade-in-scale">
        {/* 标题栏 */}
        <div className="px-4 py-3 border-b border-gold-700/30 bg-ocean-800/50 flex items-center justify-between">
          <div>
            <h2 className="pirate-title text-lg text-gold-300">
              {copy.icon} {copy.title}
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
              <p className="text-gold-300 mb-1">⚓ 你的船况</p>
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
              <div className="text-3xl mb-1">
                {grade === 'excellent' ? '🌟' : grade === 'disaster' ? '🌀' : '⚔️'}
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
              className="w-full py-2.5 text-sm font-serif text-gold-100 bg-gold-700/70 hover:bg-gold-600/80 rounded-lg press transition-all"
            >
              ⛵ 看结果（Enter）
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
