import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { startAmbience } from '@/utils/audio'
import { traits, DEFAULT_TRAIT } from '@/data/traits'
import { BG_ASSETS } from '@/data/envAssets'
import Badge from '@/components/ui/Badge'

export default function IntroScreen() {
  const [currentPage, setCurrentPage] = useState(0)
  const [fade, setFade] = useState(true)
  const [selectedTrait, setSelectedTrait] = useState<string>(DEFAULT_TRAIT)
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
          <div className="text-7xl mb-6 animate-ship-sway">⛵</div>
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
            <p>🗺️ 自由探索世界，没有强制目标</p>
            <p>💰 买卖商品，低买高卖，积累财富</p>
            <p>⛈️ 在风暴与奇遇中体验航海的浪漫</p>
            <p>📜 道听途说的冒险线索，随心而行</p>
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
                      : 'border-gold-700/30 bg-ocean-800/40 hover:border-gold-500/50 hover:bg-ocean-700/40'
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
          <h2 className="pirate-title text-3xl text-gold-300 mb-6">航海指南</h2>
          <div className="space-y-3 font-serif text-gold-200 text-sm leading-relaxed max-w-md">
            <div className="flex items-start gap-3">
              <span className="text-gold-400 mt-0.5">◀</span>
              <p><span className="text-gold-300">左侧栏</span>：舰队状态、航线选择、任务、日志与成就</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gold-400 mt-0.5">▶</span>
              <p><span className="text-gold-300">右侧栏</span>：港口详情、贸易面板、造船厂</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gold-400 mt-0.5">▼</span>
              <p><span className="text-gold-300">底部栏</span>：时间推进、资源一览、地图图层</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-gold-400 mt-0.5">●</span>
              <p><span className="text-gold-300">地图</span>：点击地图上任何位置设定航向，自由探索世界</p>
            </div>
          </div>
        </>
      ),
      button: '启航！',
    },
  ]

  const page = pages[currentPage]
  if (!page) {
    initGame(selectedTrait)
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
      initGame(selectedTrait)
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
