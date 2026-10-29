import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { startAmbience } from '@/utils/audio'
import { traits, DEFAULT_TRAIT } from '@/data/traits'
import { BG_ASSETS } from '@/data/envAssets'
import Badge from '@/components/ui/Badge'
import { UI_ASSETS } from '@/data/uiAssets'
import { Compass, Eye, Map, Coins, CloudLightning, Scroll, type LucideIcon } from 'lucide-react'
import type { GameMode } from '@/types'

/**
 * 两种玩法模式的开局说明。
 *
 * 为什么必须在**开局就选**，而不是把一切都做成"随时可跳过"：
 * 全都可选等于没有玩法——事件不参与、操舵不玩、任务不做，
 * 航行就只剩一根进度条。所以本作把两种体验分成两局，
 * 玩家在第一秒就知道自己会遇到什么，而不是玩到一半才发现被卡住。
 */
const MODE_CARDS: {
  id: GameMode
  icon: LucideIcon
  title: string
  tagline: string
  points: string[]
}[] = [
  {
    id: 'captain',
    icon: Compass,
    title: '我要当船长',
    tagline: '完整玩法：有任务、有操舵、有输赢',
    points: [
      '十步教学带你走一遍基本操作',
      '每段航程可选航段方针，还能亲自掌舵抢时间',
      '断粮会掉士气，船会沉——有输赢才有故事',
    ],
  },
  {
    id: 'visitor',
    icon: Eye,
    title: '我只是来逛逛',
    tagline: '参观模式：只看，不被逼着做任何事',
    points: [
      '没有教学，没有任务，逛到哪算哪',
      '不会输：断粮沉船都与你无关',
      '操舵可以交给水手，遇事可以袖手旁观',
    ],
  },
]

export default function IntroScreen() {
  const [currentPage, setCurrentPage] = useState(0)
  const [fade, setFade] = useState(true)
  const [selectedTrait, setSelectedTrait] = useState<string>(DEFAULT_TRAIT)
  const [gameMode, setGameMode] = useState<GameMode>('captain')
  const initGame = useGameStore(s => s.initGame)
  const fadeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current !== null) {
        clearTimeout(fadeTimerRef.current)
      }
    }
  }, [])

  const pages = [
    {
      content: (
        <>
          {/* 首屏主视觉：原来是一个 72px 的彩色 emoji ⛵。
              换成 ui_compass_rose（金铜手绘罗盘），和整块铜木金边的材质同源。 */}
          <img
            src={UI_ASSETS.compassRose}
            alt=""
            draggable={false}
            className="w-28 h-28 mx-auto mb-5 animate-ship-sway select-none drop-shadow-[0_6px_18px_rgba(0,0,0,0.6)]"
          />
          <h1 className="pirate-title text-6xl text-gold-300 mb-3">大航海时代</h1>
          <p className="text-gold-500 font-serif text-xl tracking-widest mb-8">Age of Discovery</p>
        </>
      ),
      button: '翻开日志',
    },
    {
      content: (
        <>
          <h2 className="pirate-title text-3xl text-gold-300 mb-6">1492年，塞维利亚港</h2>
          <div className="space-y-4 font-serif text-gold-200 text-base leading-relaxed max-w-md">
            <p>
              大航海时代的序幕已经拉开。西班牙与葡萄牙两大海上帝国正竞相寻找通往东方的新航路，无数冒险者怀揣梦想驶向未知的深蓝。
            </p>
            <p>
              你是一位年轻的船长，刚刚从西班牙王室手中接过一封私掠许可证。这封信赋予了你探索未知海域、开辟新贸易航线的使命与荣耀。
            </p>
            <p>
              你的座船"圣玛利亚号"正停泊在塞维利亚港，帆布已升，补给已足，只待一声令下，便可扬帆远航。
            </p>
          </div>
        </>
      ),
      button: '继续',
    },
    {
      content: (
        <>
          <h2 className="pirate-title text-3xl text-gold-300 mb-6">你的航程</h2>
          <div className="space-y-3 font-serif text-gold-200 text-base leading-relaxed max-w-md">
            <p className="flex items-center gap-2"><Map size={14} className="text-gold-400 shrink-0" aria-hidden="true" />自由探索世界，没有强制目标</p>
            <p className="flex items-center gap-2"><Coins size={14} className="text-gold-400 shrink-0" aria-hidden="true" />买卖商品，低买高卖，积累财富</p>
            <p className="flex items-center gap-2"><CloudLightning size={14} className="text-gold-400 shrink-0" aria-hidden="true" />在风暴与奇遇中体验航海的浪漫</p>
            <p className="flex items-center gap-2"><Scroll size={14} className="text-gold-400 shrink-0" aria-hidden="true" />道听途说的冒险线索，随心而行</p>
          </div>
        </>
      ),
      button: '继续',
    },
    {
      content: (
        <>
          <h2 className="pirate-title text-3xl text-gold-300 mb-2">你想怎么玩？</h2>
          <p className="font-serif text-gold-500 text-sm leading-relaxed max-w-md mb-4">
            没有对错，选一个就好。
          </p>
          <div className="grid grid-cols-1 gap-2.5 w-full max-w-md">
            {MODE_CARDS.map(m => {
              const selected = gameMode === m.id
              return (
                <button
                  key={m.id}
                  onClick={() => setGameMode(m.id)}
                  data-mode={m.id}
                  aria-pressed={selected}
                  className={`text-left rounded-lg border p-3 transition-all ${
                    selected
                      ? 'border-gold-400 bg-gold-700/30 shadow-lg shadow-gold-900/40'
                      : 'border-gold-700/30 bg-black/25 hover:border-gold-500/50 hover:bg-black/32'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <m.icon size={18} strokeWidth={1.6} className={selected ? 'text-gold-200' : 'text-gold-400'} aria-hidden="true" />
                    <span className={`pirate-title text-lg ${selected ? 'text-gold-200' : 'text-gold-400'}`}>{m.title}</span>
                    {selected && <span className="ml-auto text-gold-300 text-xs font-serif">已选</span>}
                  </div>
                  <p className="text-gold-500 text-xs font-serif mt-1">{m.tagline}</p>
                  <ul className="mt-1.5 space-y-0.5">
                    {m.points.map(p => (
                      <li key={p} className="text-gold-600 text-[11px] font-serif">· {p}</li>
                    ))}
                  </ul>
                </button>
              )
            })}
          </div>
        </>
      ),
      button: '继续',
    },
    {
      content: (
        <>
          <h2 className="pirate-title text-3xl text-gold-300 mb-5">选择你的天赋</h2>
          <p className="font-serif text-gold-200 text-sm leading-relaxed max-w-md mb-4">
            每一位传奇船长都有自己的立身之道。选择一项天赋，它将伴随你整个航海生涯，影响贸易、海战与探索的每一次抉择。
          </p>
          <div className="grid grid-cols-1 gap-2 w-full max-w-md">
            {traits.map(trait => {
              const selected = selectedTrait === trait.id
              return (
                <button
                  key={trait.id}
                  onClick={() => setSelectedTrait(trait.id)}
                  className={`text-left rounded-lg border p-2.5 transition-all ${
                    selected
                      ? 'border-gold-400 bg-gold-700/30 shadow-lg shadow-gold-900/40'
                      : 'border-gold-700/30 bg-black/25 hover:border-gold-500/50 hover:bg-black/32'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Badge kind="trait" id={trait.id} fallback={trait.icon} size={30} />
                    <span className={`pirate-title text-lg ${selected ? 'text-gold-200' : 'text-gold-400'}`}>{trait.name}</span>
                    <span className="ml-auto text-gold-600 text-xs font-serif">{trait.title}</span>
                  </div>
                  <p className="text-gold-500 text-xs font-serif mt-1 leading-relaxed">{trait.effect}</p>
                </button>
              )
            })}
          </div>
        </>
      ),
      button: '扬帆起航！',
    },
    {
      content: (
        <>
          <h2 className="pirate-title text-3xl text-gold-300 mb-4">开船前的最后一眼</h2>
          <div className="space-y-3 font-serif text-gold-200 text-sm leading-relaxed max-w-md text-left">
            <div className="bg-black/22 border border-gold-700/25 rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-gold-500">座船</span>
                <span className="text-gold-200">「圣玛利亚号」· 塞维利亚港</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gold-500">天赋</span>
                <span className="text-gold-200">
                  {traits.find(t => t.id === selectedTrait)?.name ?? '商界血脉'}
                  <span className="text-gold-600 text-xs ml-1.5">
                    {traits.find(t => t.id === selectedTrait)?.effect}
                  </span>
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gold-500">{gameMode === 'visitor' ? '你的目标' : '你的目标'}</span>
                <span className="text-gold-200">
                  {gameMode === 'visitor'
                    ? '没有目标，看够了就下船'
                    : '发现 20 座港口 · 写满 10 段冒险'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gold-500">玩法</span>
                <span className="text-gold-200">
                  {gameMode === 'visitor' ? '参观模式 · 只逛逛' : '船长模式 · 完整玩法'}
                </span>
              </div>
            </div>
            <p>点击海图上的任何一点，就能规划第一条航线——先看距离、危险与补给，再升起旗帜。</p>
            <p className="text-gold-500 text-xs">
              {gameMode === 'visitor'
                ? '航行中每段航程开始要选一次方针；操舵随时可以交给水手（不玩就没有奖励），遇事也可以袖手旁观。没人催你做任何事。'
                : '航行中每段航程开始都要选一次方针、并亲手掌舵 15 秒；这是全游戏最要紧的两件事。'}
              完整规则随时按 <span className="text-gold-300">?</span> 或点右侧「帮助」查看。
            </p>
          </div>
        </>
      ),
      button: '启航！',
    },
  ]

  const page = pages[currentPage]
  if (!page) {
    initGame(selectedTrait, gameMode)
    return null
  }

  const handleNext = () => {
    if (currentPage < pages.length - 1) {
      setFade(false)
      if (fadeTimerRef.current !== null) {
        clearTimeout(fadeTimerRef.current)
      }
      fadeTimerRef.current = window.setTimeout(() => {
        setCurrentPage(prev => prev + 1)
        setFade(true)
        fadeTimerRef.current = null
      }, 300)
    } else {
      // 用户手势中启动环境音（满足浏览器自动播放策略）
      startAmbience()
      initGame(selectedTrait, gameMode)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-ocean-900/95 backdrop-blur-md overflow-y-auto py-6" style={{ zIndex: 9999 }}>
      {/* 主标题背景（H1）：母港夜景与银河，衬在航海日志卡片之后 */}
      <img
        src={BG_ASSETS.title}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover opacity-90"
      />
      <div
        className={`parchment-bg-dark gold-border rounded-xl p-8 max-w-lg w-full mx-4 relative
          transition-all duration-300 ${fade ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      >
        <div className="text-center min-h-[320px] flex flex-col items-center justify-center">
          {page.content}
        </div>

        <div className="flex flex-col items-center gap-4 mt-6">
          <button
            onClick={handleNext}
            className="btn-nautical px-8 py-2.5 rounded-lg font-pirate text-lg
              hover:bg-gold-500 transition-all animate-pulse-gold"
          >
            {page.button}
          </button>

          <div className="flex gap-2">
            {pages.map((_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i === currentPage ? 'bg-gold-400 w-6' : 'bg-gold-700'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
