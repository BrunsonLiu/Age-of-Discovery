import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { startAmbience } from '@/utils/audio'
import { traits, DEFAULT_TRAIT } from '@/data/traits'
import { NATIONS, DEFAULT_NATION, nationById } from '@/data/nations'
import { ports } from '@/data/ports'
import type { NationId } from '@/types'
import { BG_ASSETS } from '@/data/envAssets'
import Badge from '@/components/ui/Badge'
import { UI_ASSETS } from '@/data/uiAssets'
import { shipSprite } from '@/data/shipSprites'
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
  /*
   * 【为什么默认选西班牙】四张卡和「模式」「天赋」是同一套交互：默认选中一张，
   * 想好了的人直接按「继续」。默认值取老版本的开局（塞维利亚），
   * 所以"不想选"的人看到的世界与从前一样。
   */
  const [selectedNation, setSelectedNation] = useState<NationId>(DEFAULT_NATION)
  const initGame = useGameStore(s => s.initGame)
  const fadeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (fadeTimerRef.current !== null) {
        clearTimeout(fadeTimerRef.current)
      }
    }
  }, [])

  /* 选中的国别与它的母港：叙事页、座船卡、initGame 三处都读这一份 */
  const chosenNation = nationById(selectedNation)
  const originPort = ports.find(p => p.id === chosenNation.portId)

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
          <h2 className="pirate-title text-2xl sm:text-3xl text-gold-300 mb-2">你为谁出海？</h2>
          <p className="hidden sm:block font-serif text-gold-200 text-sm leading-relaxed max-w-md mb-3">
            1492 年前后，五面旗正往五个方向去。选一面旗，船就停在那个港里。
          </p>
          {/*
            【为什么小屏也要两列】一列四张卡在 375×667 上把面板顶到 907px
            （实测 y=-120，顶上那截还因为 flex 居中而滚不到）。
            两列把四张卡压成两行，省下 150 多像素；窄到 145px 时说明文字会多折两行，
            但那正是可以折的东西 —— 国名与港口在顶行，一眼能认。
          */}
          <div className="grid grid-cols-2 gap-1 sm:gap-2 w-full max-w-md">
            {NATIONS.map((n, ni) => {
              const selected = selectedNation === n.id
              const port = ports.find(p => p.id === n.portId)
              // 五个国别排两列会剩一个空格：让最后一张横跨两列，
              // 既填满那一行，也让"大明"看起来不是"多出来的")
              const wide = ni === NATIONS.length - 1 && NATIONS.length % 2 === 1
              return (
                <button
                  key={n.id}
                  onClick={() => setSelectedNation(n.id)}
                  data-nation={n.id}
                  aria-pressed={selected}
                  className={`${wide ? 'col-span-2 ' : ''}relative overflow-hidden text-left rounded-lg border p-1 sm:p-2.5 transition-all inlay ${
                    selected
                      ? 'border-gold-200 shadow-[inset_0_0_0_1px_rgba(240,216,138,0.35),0_0_16px_rgba(212,168,56,0.22)]'
                      : 'border-gold-700/30 hover:border-gold-500/50'
                  }`}
                >
                  {selected && (
                    <span aria-hidden="true"
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-gold-200" />
                  )}
                  {/*
                    【国名与港口分两行，而且都不许折行】375 宽的两列卡只有 147px，
                    原来"徽章 + 国名 + 港口"挤在一行：国名被折成「葡萄/牙」、
                    港口被折成「里斯/本」——一个标题拆成两行是排版上最刺眼的一种错。
                    现在第一行只有徽章与国名（nowrap），港口单独一行。
                  */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {/* 单字徽章：四个国名在窄卡上排两行反而不像"旗"，
                        一个字更像印在箱子上的火印 */}
                    <span aria-hidden="true"
                      className={`flex h-6 w-6 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full border font-pirate text-sm sm:text-base
                        ${selected ? 'border-gold-200 text-gold-100' : 'border-gold-700/50 text-gold-300'}`}>
                      {n.short}
                    </span>
                    <span className={`pirate-title text-base sm:text-lg whitespace-nowrap ${selected ? 'text-gold-100' : 'text-gold-200'}`}>{n.name}</span>
                  </div>
                  <div className="text-gold-300 text-xs font-serif mt-0.5 whitespace-nowrap">{port?.nameCn}</div>
                  <p className="text-gold-200 text-[12px] font-serif mt-1 leading-relaxed">{n.perk}</p>
                </button>
              )
            })}
          </div>
          {/*
            【为什么把这页和"你的故事"合成一屏】
            原来计划是两屏：一屏选旗、一屏讲你的出身。但开局的屏数有一条硬上限
            （「开局是 4 屏」那条断言），每多一屏就多一次点击——而这两屏其实
            在做同一件事：选谁，就是在选哪段故事。合成一屏之后，玩家每点一张卡，
            下面那三行字**当场换成另一个国家的故事**，比翻页更能说明"这真的不一样"。
            信息一条没少：国史一句、你是谁一句、船与传说一句。
          */}
          <div className="mt-2 sm:mt-3 w-full max-w-md rounded-lg border border-gold-700/25 bg-ocean-900/30 px-2.5 sm:px-3 py-1 sm:py-2 text-left space-y-0.5 sm:space-y-1">
            <div className="hidden sm:block text-gold-300 text-xs font-serif tracking-wide">
              {`1492年 · ${originPort?.nameCn ?? '塞维利亚'}港`}
            </div>
            <p className="text-gold-200 text-[12px] sm:text-[13px] font-serif leading-snug sm:leading-relaxed">{chosenNation.history}</p>
            <p className="text-gold-200 text-[12px] sm:text-[13px] font-serif leading-snug sm:leading-relaxed">{chosenNation.origin}</p>
            {/* 船名 + 传说压成一行：小屏（375×667）下面板高度只剩几十像素余量，
                这两件事其实是同一句话的"你要开哪条船、去追哪个传说" */}
            <p className="text-gold-200 text-[12px] sm:text-[13px] font-serif leading-snug sm:leading-relaxed">
              {`座船「${chosenNation.shipName}」· 传说「${chosenNation.legend.name}」· 泊于${originPort?.nameCn ?? '塞维利亚'}港`}
            </p>
            {/* 味道句在小屏上让位：传说本身在地图上有个圈，进了游戏还能看见 */}
            <p className="hidden sm:block text-gold-200 text-[13px] font-serif leading-relaxed">
              {`临行前有人说起过${chosenNation.legend.name}——那片海在图上是一片空白。`}
            </p>
            {/* 航路写在故事里，但它是**要走的**：地图上会一段一段地立起菱形标记 */}
            <p className="text-gold-300 text-[12px] font-serif leading-snug">
              {`这一局的航路：${chosenNation.story.map(c => c.name).join(' · ')}`}
            </p>
          </div>
          <div className="hidden sm:flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-gold-300 font-serif text-xs mt-3 max-w-md">
            <span className="flex items-center gap-1"><Map size={11} aria-hidden="true" />自由探索</span>
            <span className="flex items-center gap-1"><Coins size={11} aria-hidden="true" />低买高卖</span>
            <span className="flex items-center gap-1"><CloudLightning size={11} aria-hidden="true" />风暴奇遇</span>
            <span className="flex items-center gap-1"><Scroll size={11} aria-hidden="true" />冒险线索</span>
          </div>
        </>
      ),
      button: '继续',
    },
    {
      content: (
        <>
          <h2 className="pirate-title text-3xl text-gold-300 mb-2">你想怎么玩？</h2>
          <p className="font-serif text-gold-300 text-sm leading-relaxed max-w-md mb-4">
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
                  className={`relative overflow-hidden text-left rounded-lg border p-3 transition-all inlay ${
                    selected
                      ? 'border-gold-200 shadow-[inset_0_0_0_1px_rgba(240,216,138,0.35),0_0_16px_rgba(212,168,56,0.22)]'
                      : 'border-gold-700/30 hover:border-gold-500/50'
                  }`}
                >
                  {/*
                    【选中态为什么不再提高底色】
                    原来选中是 `bg-gold-700/30` —— 把卡片底色从 rgb(76,58,29) 提亮，
                    而卡片里的字是金褐色。实测：同一段说明文字在**未选中**卡上是
                    4.26~4.49:1，在**选中**卡上掉到 3.18:1（差分掩膜实测，
                    见 .workbuddy/probe-textcr2.mjs）。也就是说"选中"这个动作
                    把玩家正要读的那张卡变得最难读。
                    现在选中改由**金环 + 左侧 3px 色条 + 标题提亮**表达，底色始终是
                    陷进去的深槽，字色与选中状态彻底解耦。
                  */}
                  {selected && (
                    <span aria-hidden="true"
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-gold-200" />
                  )}
                  <div className="flex items-center gap-2">
                    <m.icon size={18} strokeWidth={1.6} className={selected ? 'text-gold-100' : 'text-gold-300'} aria-hidden="true" />
                    <span className={`pirate-title text-lg ${selected ? 'text-gold-100' : 'text-gold-200'}`}>{m.title}</span>
                    {selected && <span className="ml-auto text-gold-200 text-xs font-serif">已选</span>}
                  </div>
                  {/*
                    tagline 原来是 text-gold-500、条目是 text-gold-600 + 11px。
                    实测这两档在深棕卡上只有 3.22 / 2.25~2.93:1，
                    而它们正是"这个模式到底怎么玩"的全部信息 —— 最该读清的反而最看不见。
                    gold-600 在本项目里只用于描边，不当字色（既有规范）。
                    另外 11px 低于中文 UI 的 12px 下限。
                  */}
                  <p className="text-gold-200 text-xs font-serif mt-1">{m.tagline}</p>
                  <ul className="mt-1.5 space-y-0.5">
                    {m.points.map(p => (
                      <li key={p} className="text-gold-300 text-xs font-serif">· {p}</li>
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
          <h2 className="pirate-title text-2xl sm:text-3xl text-gold-300 mb-3 sm:mb-5">选择你的天赋</h2>
          <p className="font-serif text-gold-200 text-sm leading-relaxed max-w-md mb-3 sm:mb-4">
            每一位传奇船长都有自己的立身之道。选择一项天赋，它将伴随你整个航海生涯，影响贸易、海战与探索的每一次抉择。
          </p>
          {/*
            小屏（375×667）必须收紧：五张卡 + 44px 徽章 + 13px 说明，
            实测面板高度 705px > 视口 667px，上下各被裁掉一截。
            收紧的三处是"内边距 / 卡片间距 / 标题字号"，**不动徽章尺寸** ——
            徽章是这屏唯一的识别线索，缩回去就又变回棕色糊块。
          */}
          <div className="grid grid-cols-1 gap-1.5 sm:gap-2 w-full max-w-md">
            {traits.map(trait => {
              const selected = selectedTrait === trait.id
              return (
                <button
                  key={trait.id}
                  onClick={() => setSelectedTrait(trait.id)}
                  className={`relative overflow-hidden text-left rounded-lg border p-2 sm:p-2.5 transition-all inlay ${
                    selected
                      ? 'border-gold-200 shadow-[inset_0_0_0_1px_rgba(240,216,138,0.35),0_0_16px_rgba(212,168,56,0.22)]'
                      : 'border-gold-700/30 hover:border-gold-500/50'
                  }`}
                >
                  {/* 选中态与模式卡同一套（金环 + 左侧色条），底色不变，理由见上 */}
                  {selected && (
                    <span aria-hidden="true"
                      className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-gold-200" />
                  )}
                  {/*
                    【为什么徽章独占左列、文字整体缩进】
                    第一版是"徽章 + 名字"在同一行、效果说明从卡片左边缘起 ——
                    于是名字缩进 56px、说明从 0 起，两行左右错开一个徽章的宽度。
                    单看一行不显眼，五行叠起来就是"没对齐"的观感（截图里最刺眼的
                    就是这条斜的锯齿）。
                    改成 flex 行：徽章垂直居中当左列，右侧一栏装"名字+头衔"和"效果"，
                    所有文字共用同一条左基线。
                  */}
                  <div className="flex items-center gap-3">
                    {/*
                      【徽章从 30px 加到 44px】
                      这五枚是手绘 SVG（钱袋+金币 / 盾+剑 / 舵轮 / 罗盘 / 柳叶刀+橙子），
                      原图 512×512。缩到 30px 时细节全丢 —— 6 倍放大看只是一团棕色，
                      唯一能区分五个天赋的视觉线索等于没有。
                      同时补一层 drop-shadow：徽章本身是黄铜/棕木色，卡片底也是棕色，
                      不给一点投影就没有轮廓（"同色系糊在一起"）。
                    */}
                    <Badge kind="trait" id={trait.id} fallback={trait.icon} size={44}
                      className="shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.75)]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className={`pirate-title text-lg ${selected ? 'text-gold-100' : 'text-gold-200'}`}>{trait.name}</span>
                        {/* 头衔是"味道"，原来是 gold-600（实测 2.25~3.09:1，几乎读不出） */}
                        <span className="ml-auto text-gold-300 text-xs font-serif">{trait.title}</span>
                      </div>
                      {/*
                        效果说明是这一屏真正的决策信息（"价格优惠 5%"），所以
                        比头衔亮一档、字号 12 → 13。原来 gold-500 + 12px，
                        在选中卡上实测只有 3.18:1。
                      */}
                      <p className="text-gold-200 text-[13px] font-serif mt-0.5 leading-relaxed">{trait.effect}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {/*
            【船卡从「第一次出航」那屏搬过来】
            原先最后一屏「第一次出航」有 91 字：船卡 + 两句提示（怎么出航、每段选方针）。
            但那两句在别处已经讲过一遍，而且讲得更细——
              · 第 3 屏模式卡：船长"每段航程可选航段方针，还能亲自掌舵抢时间"、
                访客"操舵可以交给水手，遇事可以袖手旁观"；
              · 教程第 4 步：「出航计划」距离/危险/风向/补给；
                第 5 步：三种方针 + 操舵 15 秒 + 交给水手。
            所以那一屏是**纯重复**，删掉它整个开局少一屏、少一次点击，
            信息一条没丢。只有船卡是别处没有的（船型决定航速与载重），
            搬到天赋页底部——玩家选完天赋，抬头就看见自己要开的船。
          */}
          {/* 座船卡和上面五张天赋卡长得一样，必须给一行小标题隔开——
              否则它看起来像"第六个可选天赋"，玩家会去点它然后发现点不动。 */}
          {/* 上一档金色在深色底上像素实测只有 3.92:1（12px 正文 AA 要 4.5:1）；
              提到与卡片主名同档的金色后达标，小标题仍靠字号/字距区分层次。 */}
          <p className="text-gold-300 text-xs font-serif mt-3.5 mb-1 w-full max-w-md text-left tracking-wide">
            你的座船
          </p>
          <div className="flex items-center gap-2.5 rounded-lg border border-gold-700/25 bg-ocean-900/30 px-3 py-2 w-full max-w-md">
            <img
              src={shipSprite('caravel')}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="h-9 w-auto object-contain shrink-0 select-none"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
            <div className="min-w-0 text-left">
              <div className="text-gold-300">{`「${chosenNation.shipName}」`}</div>
              <div className="text-gold-300 text-xs">{`卡拉维尔帆船 · 泊于${originPort?.nameCn ?? '塞维利亚'}港`}</div>
            </div>
          </div>
        </>
      ),
      button: '启航！',
    },
  ]

  const page = pages[currentPage]
  if (!page) {
    initGame(selectedTrait, gameMode, selectedNation)
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
      initGame(selectedTrait, gameMode, selectedNation)
    }
  }

  return (
    <div data-testid="intro-screen" className="fixed inset-0 flex items-start sm:items-center justify-center bg-ocean-900/95 backdrop-blur-md overflow-y-auto py-3 sm:py-6" style={{ zIndex: 9999 }}>
      {/* 主标题背景（H1）：母港夜景与银河，衬在航海日志卡片之后 */}
      <img
        src={BG_ASSETS.title}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover opacity-90"
      />
      <div
        className={`parchment-bg-dark gold-border rounded-xl p-5 sm:p-8 max-w-lg w-full mx-4 relative
          transition-all duration-300 ${fade ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      >
        {/* 内衬细框：与外框（2px 实金边）组成"装裱"的两道线，见 .panel-frame */}
        <span aria-hidden="true" className="panel-frame" />
        <div className="text-center min-h-[320px] flex flex-col items-center justify-center">
          {page.content}
        </div>

        <div className="flex flex-col items-center gap-2 sm:gap-4 mt-3 sm:mt-6">
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
