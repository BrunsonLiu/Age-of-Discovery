import { useEffect, lazy, Suspense } from 'react'
import { Ship, Anchor, Scroll, Flag, Package, HelpCircle, Trophy, Newspaper, Hammer, Map } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import HarborInvite from '@/components/harbor/HarborInvite'
import SailingController from '@/components/map/SailingController'
import WeatherFx from '@/components/map/WeatherFx'
import SeaOmen from '@/components/map/SeaOmen'
import BottomBar from '@/components/ui/BottomBar'
import BrokerTip from '@/components/map/BrokerTip'
import VoyageControls from '@/components/map/VoyageControls'
import VoyageNextHint from '@/components/map/VoyageNextHint'
import Compass from '@/components/ui/Compass'
import WeatherBadge from '@/components/ui/WeatherBadge'
import TimelineBar from '@/components/ui/TimelineBar'
import NotificationToast from '@/components/ui/NotificationToast'
import MobileTabBar from '@/components/ui/MobileTabBar'
import FxLayer from '@/components/ui/FxLayer'
import BgmController from '@/components/ui/BgmController'
import IntroScreen from '@/components/intro/IntroScreen'
import { TUTORIAL_STEP_COUNT } from '@/constants/tutorial'
import TutorialOverlay from '@/components/intro/TutorialOverlay'
import HelpPanel from '@/components/intro/HelpPanel'
import DialogueOverlay from '@/components/ui/DialogueOverlay'
import WindParticles from '@/components/map/WindParticles'
import { useKeyboardControls } from '@/hooks/useKeyboardControls'
import { useIsMobile } from '@/hooks/useIsMobile'
import { prevailingWindBearing } from '@/utils/navigation'
import type { PanelType } from '@/types'
import { currentTitle } from '@/data/titles'
import { FACTIONS } from '@/data/factions'
import { CREW_CHAR_MAP } from '@/data/crewChars'
import { achievements } from '@/data/achievements'
import { BG_ASSETS } from '@/data/envAssets'
import { OPENING_SCRIPT_ID } from '@/utils/dialogue'
import { pickDialogue } from '@/utils/dialogueTriggers'
import { skyAt } from '@/utils/skyClock'
import { DURATION, EASE_STANDARD, prefersReducedMotion } from '@/utils/motion'
import { ports } from '@/data/ports'

/*
 * 【懒加载：把「地图 + 面板 + 浮层」移出首屏】
 * bundle 实测（`.workbuddy/vite.analyze.ts`）：首屏 JS 313KB gz，其中 leaflet 43KB、
 * app-map 28KB、app-panels 15KB、app-events 15KB、app-harbor 4KB ——
 * 这 105KB 在「开局 4 屏」阶段一行都用不到（地图被开场界面整块盖着）：
 * 实测第一屏出现要 900ms，等的就是那个 313KB 的 index chunk。
 * 拆开之后，开局只需要 index（自家数据/商店/文案）+ react。
 *
 * 【不能让玩家等 chunk】`prefetchSurface()` 在第一屏画完后（空闲时）就把这些块取回来，
 * 玩家读完 4 屏点「启航」时它们已经在内存里 —— 因此点开面板仍然是"立刻"。
 */
const MapView = lazy(() => import('@/components/map/MapView'))
const HarborView = lazy(() => import('@/components/harbor/HarborView'))
const FleetPanel = lazy(() => import('@/components/panels/FleetPanel'))
const PortDetail = lazy(() => import('@/components/panels/PortDetail'))
const TradePanel = lazy(() => import('@/components/panels/TradePanel'))
const ShipyardPanel = lazy(() => import('@/components/panels/ShipyardPanel'))
const EventLog = lazy(() => import('@/components/panels/EventLog'))
const TaskPanel = lazy(() => import('@/components/panels/TaskPanel'))
const AchievementPanel = lazy(() => import('@/components/panels/AchievementPanel'))
const RivalPanel = lazy(() => import('@/components/panels/RivalPanel'))
const VoyagePlanModal = lazy(() => import('@/components/map/VoyagePlanModal'))
const SegmentDecision = lazy(() => import('@/components/map/SegmentDecision'))
const HelmModal = lazy(() => import('@/components/map/HelmModal'))
const EventCard = lazy(() => import('@/components/events/EventCard'))

/**
 * 开局期间把上面这些块悄悄取回来（幂等：同一 specifier 的 import() 只会发一次请求）。
 *
 * 用 `requestIdleCallback` 而不是立刻执行：第一屏刚画完时主线程正在解码开局大图
 * （bg_title 161KB + 船精灵 190KB），这时候抢带宽/主线程会拖慢第一屏本身。
 * 带 timeout 兜底，避免一直空闲不下来（某些浏览器后台标签页 rIC 不触发）。
 */

/*
 * 最强的那一块提前到**模块求值时**就去取：它是唯一"玩家随时可能立刻需要"的块
 * （点「启航」→ 地图）。放在首帧后再取的话，急性子玩家要等约 280ms（实测）；
 * 而 62KB gz 提前下载对第一屏的影响可以忽略（同一批请求里还有 199KB 的主包）。
 */
if (import.meta.env.PROD) void import('@/components/map/MapView')

function prefetchSurface(): void {
  /*
   * 只在生产构建里预取。
   * dev server 是按需编译的：这 13 个动态 import 会立刻触发几十个模块的编译请求，
   * 把主线程和 dev server 一起占住 —— e2e 在 dev 上跑，会变成"点开面板/帮助偶尔没反应"的假故障。
   * 而 dev 下拆包本来就没有收益（模块是分开请求的）。生产里 chunk 是切好的，预取才有意义。
   */
  if (!import.meta.env.PROD) return
  /*
   * 分两批：
   *   ① 地图块（62KB gz）—— 玩家点「启航」立刻就要它，所以首帧一画完就去取。
   *      实测：只在空闲时取，动作快的玩家点完「启航」要干等 352ms（4 屏文字很快读完的人并不多，
   *      但"点下去没反应"正是这个项目反复修的那类问题）。
   *   ② 其余（面板 / 浮层 / 岸上 / 事件卡）—— 都是"要打开才用"，放空闲里取，别抢开局大图的带宽。
   */
  const load = () => {
    void import('@/components/harbor/HarborView')
    void import('@/components/panels/FleetPanel')
    void import('@/components/panels/PortDetail')
    void import('@/components/panels/TradePanel')
    void import('@/components/panels/ShipyardPanel')
    void import('@/components/panels/EventLog')
    void import('@/components/panels/TaskPanel')
    void import('@/components/panels/AchievementPanel')
    void import('@/components/panels/RivalPanel')
    void import('@/components/map/VoyagePlanModal')
    void import('@/components/map/SegmentDecision')
    void import('@/components/map/HelmModal')
    void import('@/components/events/EventCard')
  }
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
  }).requestIdleCallback
  if (ric) ric(load, { timeout: 1200 })
  else window.setTimeout(load, 300)
}
import { useDialogueStore } from '@/store/useDialogueStore'

/** 船上视角：独立 three 场景，必须懒加载（否则把 three 拖进主包） */
const DeckView = lazy(() => import('@/components/deck/DeckView'))

const totalAchievements = achievements.length

const panelButtons: { type: PanelType; icon: React.ReactNode; label: string; side: 'left' | 'right' }[] = [
  { type: 'fleet', icon: <Ship size={18} />, label: '舰队', side: 'left' },
  { type: 'task', icon: <Flag size={18} />, label: '任务', side: 'left' },
  { type: 'event', icon: <Scroll size={18} />, label: '日志', side: 'left' },
  { type: 'achievement', icon: <Trophy size={18} />, label: '成就', side: 'left' },
  { type: 'rival', icon: <Newspaper size={18} />, label: '见闻', side: 'left' },
  { type: 'port', icon: <Anchor size={18} />, label: '港口', side: 'right' },
  { type: 'trade', icon: <Package size={18} />, label: '贸易', side: 'right' },
  // 造船厂原来只能按键盘 8 打开，没有任何可见入口——功能存在但玩家发现不了。
  // 既然侧栏现在都带中文标签了，把它一并放进来。
  { type: 'shipyard', icon: <Hammer size={18} />, label: '造船', side: 'right' },
]

const Z = {
  MAP: 0,
  WIND: 5,
  COMPASS: 10,
  /** 岸上视角：盖住地图与罗盘，但让侧栏 / 面板 / 底栏照常可点（见 HarborView 注释） */
  HARBOR: 12,
  SIDE_BUTTONS: 20,
  /** 常驻「下一站」指引：压过侧栏容器，但让位给打开的面板 */
  NEXT_HINT: 25,
  PANEL: 30,
  BOTTOM_BAR: 40,
  TIMELINE: 50,
  NOTIFICATION: 60,
  /** 移动端底部抽屉：必须压过底栏（40）与通知（60），但让位给事件卡（70）与小游戏 */
  DRAWER: 65,
  OVERLAY: 70,
}

const LEFT_PANELS: readonly PanelType[] = ['fleet', 'task', 'event', 'achievement', 'rival'] as const
const RIGHT_PANELS: readonly PanelType[] = ['port', 'trade', 'shipyard'] as const

export default function MainMap() {
  const gamePhase = useGameStore(s => s.gamePhase)
  const activePanel = useGameStore(s => s.activePanel)
  const setActivePanel = useGameStore(s => s.setActivePanel)
  const currentEvent = useGameStore(s => s.currentEvent)
  const resetGame = useGameStore(s => s.resetGame)
  const fleet = useGameStore(s => s.fleet)
  const tutorialStep = useGameStore(s => s.tutorialStep)
  const showHelp = useGameStore(s => s.showHelp)
  const setShowHelp = useGameStore(s => s.setShowHelp)
  const claimedVictories = useGameStore(s => s.claimedVictories)
  const continueAsVisitor = useGameStore(s => s.continueAsVisitor)
  /** 侧栏「日志」的小圆点：这趟带回的新页还没翻过 */
  const unreadLogbook = useGameStore(s => s.logbook.filter(e => !e.read).length)
  const discoveredPorts = useGameStore(s => s.discoveredPorts)
  const completedTasks = useGameStore(s => s.completedTasks)
  const stats = useGameStore(s => s.stats)
  const earnedAchievements = useGameStore(s => s.achievements)
  const rivals = useGameStore(s => s.rivals)
  const factionRep = useGameStore(s => s.factionRep)
  const notoriety = useGameStore(s => s.notoriety)
  const crewRoster = useGameStore(s => s.crewRoster)
  const captainTitle = currentTitle(notoriety)

  /**
   * 移动端布局：侧栏变底部标签栏、面板变底部抽屉。
   *
   * 这是**结构**上的切换，不是样式——所以必须用 JS 判断，
   * 不能靠 Tailwind 的 md: 断点把侧栏"藏起来"（那样面板容器还留在原地）。
   */
  const isMobile = useIsMobile()

  // 全键盘控制：1-8 面板 / Space 暂停 / H 操舵 / Esc 关闭 / ? 帮助 / 剧情致辞
  useKeyboardControls()

  // 剧情线触发点①：开局致辞。initGame 会清空 dialogueSeen，故每开新局必播一次；
  // 开局 4 屏期间把地图/面板的 chunk 取回来（见文件上方的 prefetchSurface）
  useEffect(() => {
    /*
     * 【为什么不是"首帧之后"就预取】实测（slow4g 限速）：首帧之后 rIC 立刻触发，
     * 13 个块约 150KB 一起发出去，而此时真正挡在地图前面的是 `land.geojson`（368KB）——
     * 预取在和地图数据抢同一条 400KB/s 的管子，等于让玩家多等 0.4 秒才看见地图。
     *
     * 现在等**陆地真的画出来**再预取：那时玩家已经能看、能点，才算真空闲。
     * 8 秒兜底 —— 地图因为异常没画出来时，也不能永远不预取。
     */
    let raf = 0
    let timer = 0
    let done = false
    const arm = () => {
      if (done) return
      done = true
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
      const ric = (window as unknown as {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number
      }).requestIdleCallback
      if (ric) ric(() => prefetchSurface(), { timeout: 2000 })
      else window.setTimeout(prefetchSurface, 300)
    }
    const tick = () => {
      // 陆地多边形画出来 = 地图可看（与 e2e 的"可看"判据同一口径）
      if (document.querySelectorAll('.leaflet-overlay-pane path').length > 100) arm()
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    timer = window.setTimeout(arm, 8000)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [])

  // 刷新页面时 dialogueSeen 已存档，不重播。后续触发点（rival 遭遇等）照此模式加。
  //
  // 【顺序：致辞在前，教学在后】原先是"教学进行中不弹，等教学结束再开场致辞"，
  // 实际效果是玩家先被 10 步教学教完，刚点「开始冒险」想做第一个决定，一段
  // 老领航员对白才压上来把侧栏全盖住——实测这时候连点两次「贸易」都命中在那层
  // `bg-black/45` 上（`elementFromPoint` 返回 DIV，`activePanel` 一直是 null）。
  // 叙事顺序也拧着：教学第一句本来就是"欢迎来到大航海时代"，等于先说结论再说开场白。
  // 现在反过来：致辞先播，教学等它播完（见下方 TutorialOverlay 的渲染条件）。
  const dialogueSeen = useGameStore(s => s.dialogueSeen)
  const dialogueOpen = useDialogueStore(s => s.scriptId !== null)
  const tutorialActive = gamePhase === 'playing' && tutorialStep >= 0 && tutorialStep < TUTORIAL_STEP_COUNT
  useEffect(() => {
    if (gamePhase === 'playing' && !dialogueSeen.includes(OPENING_SCRIPT_ID)) {
      useDialogueStore.getState().open(OPENING_SCRIPT_ID)
    }
  }, [gamePhase, dialogueSeen])

  // 视野中心所处的行星风带（罗盘风向标 + 风向粒子的风向来源）
  const mapCenter = useMapStore((s) => s.center)
  // 风向以真实天气状态为准（天气按海域生成、持续 1-3 天；初始回退到纬度风带）
  const weather = useGameStore(s => s.weather)

  /*
   * 剧情线触发点②：彩蛋对白（14 个角色，见 utils/dialogueTriggers 的规则表）。
   *
   * 【为什么统一走 pickDialogue，而不是给每个条件各写一个 useEffect】
   * 分散写会出两个必然的 bug：一是同一帧里两条条件同时成立、两个 open 抢着
   * 设 scriptId（后一个覆盖前一个，玩家只看到一段）；二是没有任何地方能回答
   * "现在到底该不该弹"。规则表 + 一个入口，条件和优先级都只在一个地方。
   *
   * 【三条护栏，全都来自踩过的坑】
   * · 教学进行中不弹：教学是全屏遮罩，对白压在底下既看不全也推进不了；
   * · 已经有对白开着就不弹：否则会顶掉玩家正在读的那一段；
   * · 额度（day >= 2+2×(已看-1)）：防止"水少+士气低+船破+到港"四连弹。
   */
  const flagship = fleet.ships.find(sh => sh.id === fleet.flagshipId)
  const flagshipDurability = flagship?.durability ?? 100
  /** 旗舰编制上限：船员招满时会有"吊床都得轮着睡"那段彩蛋 */
  const flagshipMaxCrew = flagship?.maxCrew ?? 0
  const portHasShipyard = fleet.currentPortId !== null
    && (ports.find(p => p.id === fleet.currentPortId)?.services.includes('shipyard') ?? false)
  useEffect(() => {
    if (gamePhase !== 'playing' || tutorialActive) return
    if (useDialogueStore.getState().scriptId) return
    /**
     * 玩家正在看面板 / 帮助时**不弹**。
     *
     * 【为什么加这一条】对白层是 `fixed inset-0` + z-index 75 的全屏遮罩，
     * 它一出现就会把面板、侧栏、底栏的点击全部吃掉。而这个 effect 的依赖里
     * 有 gold / morale / water / durability / currentPortId —— 玩家在港口面板里
     * 点「休整」改变士气，effect 立刻重跑、条件成立、遮罩升起，
     * 于是面板看起来"点了没反应"（其实是被遮住了）。
     *
     * 面板开着说明玩家正在做事，这时候不该被打断。关掉面板后 effect 会重跑，
     * 该弹的自然还会弹，只是挪到了玩家手空的时候。
     */
    if (activePanel || showHelp) return
    const id = pickDialogue({
      day: fleet.day,
      gold: fleet.gold,
      fame: fleet.fame,
      morale: fleet.morale,
      water: fleet.water,
      durability: flagshipDurability,
      currentPortId: fleet.currentPortId,
      portHasShipyard,
      discoveredCount: discoveredPorts.length,
      weatherKind: weather.kind,
      isSailing: fleet.isSailing,
      crewCount: crewRoster.length,
      crewMax: flagshipMaxCrew,
      completedTasks: completedTasks.length,
      /*
       * 日照只为"夜航"那一条彩蛋服务。
       * 【为什么这里也调 skyAt】它只按"时刻 + 航程增量"算，不持有进度状态以外
       * 任何东西；2D 的 rAF 与 3D 的帧循环也在调，三处拿同一个公式，
       * 所以不会出现"触发时机上的天色和画面上的天色不一致"。
       */
      lit: skyAt(performance.now(), useGameStore.getState().routeProgress ?? 0).lit,
      wellStocked: fleet.food >= 80 && fleet.water >= 80,
      seen: dialogueSeen,
    })
    if (id) useDialogueStore.getState().open(id)
  }, [
    gamePhase, tutorialActive, dialogueSeen,
    fleet.day, fleet.gold, fleet.fame, fleet.morale, fleet.water, fleet.currentPortId,
    flagshipDurability, portHasShipyard, discoveredPorts.length, weather.kind,
    fleet.isSailing, crewRoster.length, completedTasks.length, fleet.food,
    flagshipMaxCrew,
    // 面板/帮助一关，effect 重跑，把刚才让掉的彩蛋补上
    activePanel, showHelp,
  ])

  const viewMode = useMapStore(s => s.viewMode)
  const setViewMode = useMapStore(s => s.setViewMode)
  const deckView = useMapStore(s => s.deckView)
  const setDeckView = useMapStore(s => s.setDeckView)

  /*
   * 船一离港（或当前港被清空）就自动回海图。
   * 岸上是「人走到了码头上」的视角，船开走后还留在岸上等于视角撒谎；
   * 也顺手保证出航时玩家立刻看见航线，不用先手动退一层。
   * 放在 UI 层而不是 store：viewMode 是会话状态，不该污染游戏状态机。
   */
  useEffect(() => {
    if (viewMode === 'harbor' && (fleet.isSailing || fleet.currentPortId == null)) {
      setViewMode('chart')
    }
  }, [viewMode, fleet.isSailing, fleet.currentPortId, setViewMode])

  /*
   * V 键开「船上」视角。
   *
   * 【为什么搬到这里】这个快捷键原来写在 DeckView 里 —— 那时 DeckView 常驻挂载，
   * 副作用里挂监听没问题。现在 DeckView 只在打开时才 import，它的监听自然也不存在，
   * 所以开场（还没上过船）按 V 会没反应。入口在哪、谁负责它的快捷键，应该在同一层。
   * 关闭仍由 DeckView 自己处理（Esc / 再按 V），因为只有它在打开时才知道当前状态。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key !== 'v' && e.key !== 'V') return
      const st = useMapStore.getState()
      if (st.viewMode === 'harbor') return
      st.setDeckView(!st.deckView)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /*
   * 第二空间的常驻开关。
   *
   * 上一轮「岸上」只在港口面板里有一个入口，加上到港 9 秒就收的邀请，
   * 玩家完全可能整局都没发现还有另一个景别 —— 那"第二个空间"等于没做。
   * 现在桌面右侧栏、移动底栏各放一个**一直都在**的切换按钮，
   * 与 A 键、Esc 退层、出航自动回海图共用同一套判定。
   *
   * 航行中不隐藏按钮：隐藏会让玩家以为功能时有时无；改成明确的禁用态 +
   * title 说明「靠岸后才能上岸」，是可预期的灰，不是"点了没反应"。
   */
  const canAshore = !fleet.isSailing && fleet.currentPortId != null
  const viewLabel = viewMode === 'harbor' ? '回海图' : '上岸走走'
  const toggleViewMode = () => {
    if (viewMode === 'harbor') { setViewMode('chart'); return }
    if (!canAshore) return
    setViewMode('harbor')
  }

  const windBearing = weather.windDir || prevailingWindBearing(mapCenter[0])
  const windSpeed = weather.windSpeed

  // 同代船长最终座次（按金币，声望决胜）
  const finalRanking = [
    { name: '你', gold: fleet.gold, fame: fleet.fame, ports: discoveredPorts.length, isPlayer: true },
    ...rivals.map(r => ({ name: r.name, gold: r.gold, fame: r.fame, ports: r.portsFound, isPlayer: false })),
  ].sort((a, b) => b.gold - a.gold || b.fame - a.fame)

  const togglePanel = (panel: PanelType) => {
    if (showHelp) setShowHelp(false)
    setActivePanel(activePanel === panel ? null : panel)
  }

  /**
   * 移动端底部抽屉。
   *
   * 结构刻意做得像手机上的模态面板：
   *   · 遮罩 + 从底部升起的面板 + 顶部一条把手
   *   · 点遮罩关闭（手指最容易够到的关闭方式）
   *   · 面板自身滚动，overscroll-contain 防止滚到底后把地图一起滚走
   *
   * 高度用 dvh（动态视口高度）而不是 vh：手机浏览器地址栏收放时
   * vh 不会变，抽屉会顶出屏幕或留一条缝。
   */
  const drawer = (content: React.ReactNode, onClose: () => void) => (
    <div className="fixed inset-0" style={{ zIndex: Z.DRAWER }} data-testid="mobile-drawer">
      <div
        className="absolute inset-0 bg-black/65"
        onClick={onClose}
        data-testid="mobile-drawer-backdrop"
      />
      <div
        className="drawer-panel absolute bottom-0 left-0 right-0 max-h-[82dvh] overflow-y-auto
          overscroll-contain rounded-t-2xl border-t border-gold-700/40 bg-ocean-900/85
          backdrop-blur-sm"
        style={{ paddingBottom: 'max(10px, env(safe-area-inset-bottom))' }}
      >
        {/* 把手条：做成按钮，手机上"往下一划就关"是肌肉记忆，
            但不会划的人也得有条能点的路——所以把条本身做成关闭按钮。 */}
        <button
          onClick={onClose}
          aria-label="关闭面板"
          data-testid="mobile-drawer-handle"
          className="block w-full pt-2 pb-1 cursor-pointer"
        >
          <span className="block mx-auto h-1 w-10 rounded-full bg-gold-700/60" />
        </button>
        {content}
      </div>
    </div>
  )

  const activeLeftPanel = activePanel && LEFT_PANELS.includes(activePanel) ? activePanel : null
  const activeRightPanel = activePanel && RIGHT_PANELS.includes(activePanel) ? activePanel : null

  return (
    <div className="h-screen w-screen overflow-hidden bg-ocean-900">

      {/*
        地图层不卸载：Leaflet / three.js 实例重建要几百毫秒，还会丢掉相机位置。
        上岸时把它「推远压暗」当背景，关掉命中测试即可；切回来零重建。
        transform/filter 与岸上层的淡入共用 motion.ts 的同一档时长。
      */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: Z.MAP,
          transform: viewMode === 'harbor' ? 'scale(0.94)' : undefined,
          filter: viewMode === 'harbor' ? 'brightness(0.55) saturate(0.75)' : undefined,
          transition: prefersReducedMotion()
            ? undefined
            : `transform ${DURATION.grand}ms ${EASE_STANDARD}, filter ${DURATION.grand}ms ${EASE_STANDARD}`,
          pointerEvents: viewMode === 'harbor' ? 'none' : undefined,
        }}
        aria-hidden={viewMode === 'harbor'}
        data-testid="chart-layer"
      >
        <Suspense fallback={null}>
          <MapView />
        </Suspense>
        <SailingController />
        <WeatherFx />
        {/* 海上异闻：只画剪影与一行字，不接收任何点击（pointer-events-none） */}
        <SeaOmen />
      </div>

      {/*
        【为什么不再无条件挂载】DeckView 自带「船上」入口按钮，所以原来一直挂在树上 ——
        代价是它的 chunk（63KB gz）+ **three（187KB gz）** + post（13KB）在每次冷启动
        都要下载，哪怕玩家从不上船。慢速 4G 实测（test/e2e/probe-cold-start.mjs --net=slow4g）：
        这批请求在 @1934ms 发出，把地图数据（land.geojson 368KB @3000ms）挤到后面，
        冷启动 7343ms 里有约 0.7 秒是白等这三个视角。
        现在入口按钮搬到本文件，**点下去才 import**。
      */}
      {deckView && (
        <Suspense fallback={null}>
          <DeckView />
        </Suspense>
      )}

      {!deckView && viewMode !== 'harbor' && (
        /*
         * 「船上」入口。原来这个按钮在 DeckView 内部（它未打开时返回按钮）——
         * 那等于"为了一个按钮把三个视角的代码都下载下来"。搬到这里之后
         * DeckView 只在点下去时才 import。testid 保持不变，e2e 照旧按它找。
         */
        <button
          type="button"
          onClick={() => setDeckView(true)}
          data-testid="deck-view-toggle"
          title="船上视角（V）：贴着海面看自己的船"
          className="absolute right-[7.4rem] top-14 z-[900] flex items-center gap-1.5 rounded border
                     border-[#8b6f3e]/70 bg-[#1b1408]/95 px-3 py-1.5 text-xs font-serif text-[#e8d4a8]
                     shadow-[0_2px_8px_rgba(0,0,0,0.55)] transition-colors
                     hover:bg-[#2a1f0c] active:scale-95"
        >
          <Anchor size={14} aria-hidden="true" />
          船上
        </button>
      )}

      {viewMode === 'harbor' && (
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ zIndex: Z.HARBOR, backgroundColor: '#140d06' }}
        >
          <Suspense fallback={null}>
            <HarborView />
          </Suspense>
        </div>
      )}

      {/*
        罗盘 + 天候徽章（左上角）。

        【移动端为什么要缩小罗盘】
        桌面端罗盘 96px、徽章排在罗盘正下方（top-14 + 96 ≈ 152px，徽章 156px）。
        手机竖屏照搬的话，徽章会直接压在罗盘盘面上（实测截图证实），
        指针和方位字母全被盖住。所以移动端把罗盘缩到 64px，
        徽章再排到 114px —— 关系和桌面端一致（徽章永远在罗盘下方），只是整体更紧凑。
      */}
      <div
        /* 移动端原本是 top-11(44px)，而顶栏 h-12 是 48px —— 罗盘顶部被顶栏压住
           4px，加上 drop-shadow 看起来像被切掉一角。桌面一直是 top-14(56px)，
           移动端没跟着改。现在两端统一，留 8px 间隙。 */
        className={isMobile ? 'absolute top-14 left-2' : 'absolute top-14 left-3'}
        style={{ zIndex: Z.COMPASS }}
      >
        <Compass windBearing={windBearing} size={isMobile ? 'w-16 h-16' : 'w-24 h-24'} />
      </div>

      {/* 天候徽章：当前天气 + 风速 + 航速影响，点击展开三日预报 */}
      <div
        /* 徽章永远排在罗盘正下方：移动端罗盘 56+64=120，徽章 124；
           桌面 56+96=152，徽章 156。两边都留 4px。 */
        className={isMobile ? 'absolute top-[7.75rem] left-2' : 'absolute top-[9.75rem] left-3'}
        style={{ zIndex: Z.COMPASS }}
      >
        <WeatherBadge />
      </div>

      {/*
        常驻「下一站」。

        【为什么放在罗盘右边这块空地】实测这一带 x∈[120,460] / y∈[56,100] 是空的：
        罗盘在 x12~108、天候徽章从 y156 起、两列侧栏按钮垂直居中在 y300+、
        靠岸邀请条居中在 x560~880、通知在桌面右上。放在这里不新增遮罩、
        不挤顶栏时间轴，也不需要再动任何一处的定位。

        【为什么移动端走另一套结构】390px 屏没有这块空地，顶部还压着通知通栏。
        stack 分支并入底部 fixed 容器（见下），按文档流往上叠，不写死 bottom。
      */}
      {!isMobile && viewMode !== 'harbor' && (
        <div className="absolute left-[7.5rem] top-14" style={{ zIndex: Z.NEXT_HINT }}>
          <VoyageNextHint />
        </div>
      )}

      {/* 风向氛围层：粒子随风带漂移，让"风"被看见（不拦截点击） */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: Z.WIND }}>
        <WindParticles windBearing={windBearing} windSpeed={windSpeed} />
      </div>

      {/*
        侧栏按钮（桌面）：图标 + 常驻可见的中文标签。

        【为什么必须有文字】
        原来只有 lucide 图标，中文名藏在 title 里——那是"鼠标悬停才出现"的
        提示。玩家第一眼看到的是一列无名的符号，得一个个悬停试过去才知道
        哪个是港口、哪个是贸易。而触屏/手写板根本没有 hover。

        标签横向排（图标在左、文字在右，左侧栏反之），整列看起来像船上的
        仪表盘开关条，而不是一排猜谜图标。文字用 font-serif 与全局基调一致。

        【移动端不用这两列】
        竖排在 360-430px 宽的屏上会把地图挤没。移动端走底部标签栏
        （见下方 MobileTabBar）。
      */}
      {!isMobile && (
        <>
        {/* pointer-events-none：这两列容器是 top-60/bottom-52 的整条矩形，按钮却是
            垂直居中排布的，两侧留出大片透明区域。容器默认拦截点击，会把落在
            这片"空白"里的别的控件（比如地图右上角的 3D 切换）挡掉。
            容器只负责布局，点击交给按钮自己。（记忆里那条"浮层必须
            pointer-events-none"的同一条原则。） */}
        <div
          className="absolute left-0 flex flex-col justify-center gap-1.5 px-1.5 pointer-events-none"
          style={{ zIndex: Z.SIDE_BUTTONS, top: '60px', bottom: '52px' }}
        >
          {panelButtons.filter(b => b.side === 'left').map(btn => (
            <button
              key={btn.type}
              onClick={() => togglePanel(btn.type)}
              data-tut={btn.type}
              className={`side-plate pointer-events-auto flex items-center gap-2 pl-2.5 pr-3 py-2.5 rounded-sm ${
                activePanel === btn.type ? 'side-plate--active' : ''
              }`}
              title={btn.label}
              aria-label={btn.label}
              aria-pressed={activePanel === btn.type}
            >
              <span className="shrink-0 flex items-center justify-center w-5">{btn.icon}</span>
              <span className="font-serif text-sm whitespace-nowrap leading-none">{btn.label}</span>
              {btn.type === 'event' && unreadLogbook > 0 && (
                <span
                  className="w-2 h-2 rounded-full bg-gold-300 shrink-0"
                  aria-label={`${unreadLogbook} 页新见闻`}
                  data-testid="logbook-unread-dot"
                />
              )}
            </button>
          ))}
        </div>

        <div
          className="absolute right-0 flex flex-col justify-center gap-1.5 px-1.5 pointer-events-none"
          style={{ zIndex: Z.SIDE_BUTTONS, top: '60px', bottom: '52px' }}
        >
          {/* 空间切换不是「第九个面板」：金边更亮、带一道分隔，和下面三块
              面板入口分开。位置固定在最上面，两个空间一眼可辨。 */}
          <button
            onClick={toggleViewMode}
            disabled={!canAshore && viewMode !== 'harbor'}
            data-testid="view-mode-switch"
            aria-label={viewLabel}
            aria-pressed={viewMode === 'harbor'}
            title={!canAshore && viewMode !== 'harbor' ? '还在海上，靠岸后才能上岸' : (viewMode === 'harbor' ? '回到海图（A）' : '上岸走走（A）')}
            /*
             * 【为什么不再是半透明深蓝】原来是 `bg-ocean-900/55`：
             * 0.55 的底，海图上的地名（实测「地中海」）**从按钮底下透出来**，
             * 一块按钮上压着半个地名 —— 这比"材质跟旁边不一样"难看得多。
             * 项目自己的判据是"浮层 alpha ≥0.85"，这个按钮是全站唯一越线的。
             * 现在换成同一块铜牌（.side-plate），另用 .side-plate--space
             * 换成一节冷色：它换的是**空间**、不是开面板，要能一眼分开，
             * 但材质（铆钉 + 顶棱受光 + 底棱背光）必须和下面四块一致。
             */
            className={`side-plate side-plate--space pointer-events-auto flex items-center gap-2 pl-3 pr-2.5 py-2.5 rounded-sm
              font-serif text-sm whitespace-nowrap leading-none press
              disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <span>{viewLabel}</span>
            <span className="shrink-0 flex items-center justify-center w-5">
              {viewMode === 'harbor' ? <Map size={18} /> : <Anchor size={18} />}
            </span>
          </button>
          <div className="h-px mx-2 bg-gold-700/40" aria-hidden="true" />
          {panelButtons.filter(b => b.side === 'right').map(btn => (
            <button
              key={btn.type}
              onClick={() => togglePanel(btn.type)}
              data-tut={btn.type}
              className={`side-plate pointer-events-auto flex items-center gap-2 pl-3 pr-2.5 py-2.5 rounded-sm ${
                activePanel === btn.type ? 'side-plate--active' : ''
              }`}
              title={btn.label}
              aria-label={btn.label}
              aria-pressed={activePanel === btn.type}
            >
              <span className="font-serif text-sm whitespace-nowrap leading-none">{btn.label}</span>
              <span className="shrink-0 flex items-center justify-center w-5">{btn.icon}</span>
            </button>
          ))}
          <button
            onClick={() => {
              if (activePanel) setActivePanel(null)
              setShowHelp(!showHelp)
            }}
            className={`side-plate pointer-events-auto flex items-center gap-2 pl-3 pr-2.5 py-2.5 rounded-sm ${
              showHelp ? 'side-plate--active' : ''
            }`}
            title="帮助"
            aria-label="帮助"
            aria-pressed={showHelp}
          >
            <span className="font-serif text-sm whitespace-nowrap leading-none">帮助</span>
            <span className="shrink-0 flex items-center justify-center w-5"><HelpCircle size={18} /></span>
          </button>
        </div>
        </>
      )}

      {/*
        面板容器。

        桌面：左右两侧各挂一块 320px 宽的侧板。
        移动：改成**底部抽屉**——从屏幕底部升起、占满宽度。
        抽屉不是"把侧板挪到下面"，是换了一套结构：
          · 侧板固定在 `left-[5.75rem]`，在手机上会溢出屏幕；
          · 侧板高度写死 `top-12 bottom-12`，在抽屉里需要自适应内容；
          · 侧板是横向滑入的动画，抽屉应该从下往上滑。
        所以移动端走独立的渲染分支，而不是靠 CSS 挪位置。
      */}
      {/* 面板组件都是懒加载块：整块包一层 Suspense，fallback 用 null
          —— 面板平时没打开时这里本来就是空的，不会闪白。 */}
      <Suspense fallback={null}>
      {activeLeftPanel && (
        isMobile ? (
          drawer(
            activeLeftPanel === 'fleet' ? <FleetPanel />
              : activeLeftPanel === 'task' ? <TaskPanel />
              : activeLeftPanel === 'event' ? <EventLog />
              : activeLeftPanel === 'achievement' ? <AchievementPanel />
              : <RivalPanel />,
            () => setActivePanel(null),
          )
        ) : (
          <div
            className="absolute left-[5.75rem] top-12 bottom-12 w-80"
            style={{ zIndex: Z.PANEL }}
          >
            {activeLeftPanel === 'fleet' && <FleetPanel />}
            {activeLeftPanel === 'task' && <TaskPanel />}
            {activeLeftPanel === 'event' && <EventLog />}
            {activeLeftPanel === 'achievement' && <AchievementPanel />}
            {activeLeftPanel === 'rival' && <RivalPanel />}
          </div>
        )
      )}
      </Suspense>

      <Suspense fallback={null}>
      {activeRightPanel && (
        isMobile ? (
          drawer(
            activeRightPanel === 'port' ? <PortDetail />
              : activeRightPanel === 'trade' ? <TradePanel />
              : <ShipyardPanel />,
            () => setActivePanel(null),
          )
        ) : (
          <div
            className="absolute right-[5.75rem] top-12 bottom-12 w-80"
            style={{ zIndex: Z.PANEL }}
          >
            {activeRightPanel === 'port' && <PortDetail />}
            {activeRightPanel === 'trade' && <TradePanel />}
            {activeRightPanel === 'shipyard' && <ShipyardPanel />}
          </div>
        )
      )}
      </Suspense>

      {showHelp && (
        isMobile ? (
          drawer(<HelpPanel />, () => setShowHelp(false))
        ) : (
          <div
            className="absolute right-[5.75rem] top-12 bottom-12 w-80"
            style={{ zIndex: Z.PANEL }}
          >
            <HelpPanel />
          </div>
        )
      )}

      {/*
        底部区。
        桌面：只有一条状态/操作栏（速度、+1天、资源、图层开关）。
        移动：状态栏**压缩成一行**，下面再叠一排面板入口标签栏。
        两者放进同一个 fixed 容器，免得用魔法数字互相错位。
      */}
      {/*
        掮客推荐。
        桌面：浮在左下、底栏之上。
        移动：不放这里 —— 底栏高度会随折行变（42/64/三行），任何写死的 bottom
        都会在某一档把卡片压到栏底下（实测手机按钮被整条盖住）。改由下面那个
        fixed 容器按文档流往上叠，结构上就不可能重叠。
      */}
      {/* 岸上是另一个空间：跑商提案是"站在海图前"的提示，压在港口近景上
          既违和、移动端还会盖住服务按钮。回海图后照常出现，不丢功能。 */}
      {!isMobile && viewMode !== 'harbor' && <BrokerTip />}
      {/*
        航行中：改方针 / 亲手掌舵 / 加餐（原来前两个是每段自动弹的全屏层）。
        桌面：浮在左下、底栏之上。
        移动：见下面的 fixed 容器（按文档流往上叠，避免写死的 bottom 被折行底栏压住）。

        【这里原来是一句注释、没有组件】代码写着"航行中：改方针 / 亲手掌舵"，
        但只渲染了移动端那一份 —— 桌面玩家除非知道按 H，否则**看不到这两个入口**。
        与掮客卡互斥（一个停泊时出现、一个航行时出现），所以同在左下不会打架。
      */}
      {!isMobile && viewMode !== 'harbor' && <VoyageControls />}


      {isMobile ? (
        <div className="fixed bottom-0 left-0 right-0" style={{ zIndex: Z.BOTTOM_BAR }}>
          {/* 中长期目标排在最上面：眼前一单（掮客卡）在下，航路方向在上 */}
          {viewMode !== 'harbor' && <VoyageNextHint placement="stack" />}
          {viewMode !== 'harbor' && <VoyageControls placement="stack" />}
          {viewMode !== 'harbor' && <BrokerTip placement="stack" />}
          <BottomBar />
          <MobileTabBar
            buttons={panelButtons.map(b => ({
              type: b.type,
              icon: b.icon,
              label: b.label,
              badge: b.type === 'event' ? unreadLogbook : 0,
            }))}
            activePanel={activePanel}
            onToggle={togglePanel}
            viewMode={viewMode}
            canAshore={canAshore}
            onToggleView={toggleViewMode}
            showHelp={showHelp}
            onToggleHelp={() => {
              if (activePanel) setActivePanel(null)
              setShowHelp(!showHelp)
            }}
          />
        </div>
      ) : (
        <div className="absolute bottom-0 left-0 right-0" style={{ zIndex: Z.BOTTOM_BAR }}>
          <BottomBar />
        </div>
      )}

      <div className="absolute top-0 left-0 right-0" style={{ zIndex: Z.TIMELINE }}>
        <TimelineBar />
      </div>

      {/* 靠岸邀请条：只在"刚从海上回来"时露 9 秒，自己定位、自己收起。
          不放进下面的通知容器——那层是 pointer-events-none，按钮会点不动。 */}
      <HarborInvite />

      {/* 通知自己定位（桌面右上 / 移动端顶部通栏），这里只给层级。
          容器必须 pointer-events-none，否则这层会盖住整张地图的点击。 */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: Z.NOTIFICATION }}>
        <NotificationToast />
      </div>

      {/* 兑现层：音效 + 飘字 + 闪光 + 横幅 */}
      <FxLayer />

      {/* 配乐控制器：情绪跟随游戏状态 */}
      <BgmController />

      {/* 出航计划：点击地图后先评估、（可选）买情报，再升起旗帜 */}
      {/* 这四个都在懒加载块里（首屏用不到）：合成一个 Suspense，
          避免每个各包一层。fallback 用 null —— 它们平时也都不渲染任何东西。 */}
      <Suspense fallback={null}>
        {/* 出航计划：点击地图后先评估、（可选）买情报，再升起旗帜 */}
        <VoyagePlanModal />

        {/* 航段抉择：每段航程开始时选一个方针（1/2/3）——这是唯一的速度旋钮 */}
        <SegmentDecision />

        {/* 操舵挑战：航行中的实时操作小游戏（H 键或底部按钮进入） */}
        <HelmModal />
      </Suspense>

      {/* 剧情对白：角色立绘滑入致辞（开局由下方触发器拉起，Enter 推进 / Esc 跳过） */}
      <DialogueOverlay />

      {currentEvent && gamePhase === 'event' && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: Z.OVERLAY }}>
          <Suspense fallback={null}>
            <EventCard />
          </Suspense>
        </div>
      )}

      {gamePhase === 'start' && (
        <div className="absolute inset-0" style={{ zIndex: Z.OVERLAY }}>
          <IntroScreen />
        </div>
      )}

      {/* 教学引导：组件内部 portal 到 body，自带 z-index，不受这里的 OVERLAY 容器约束。
          有对白开着就先不开教学：两块都是整屏层，叠在一起玩家只会看见上面那块，
          而键盘 Enter 又同时被两边抢——先让致辞播完，教学再接手。 */}
      {gamePhase === 'playing' && !dialogueOpen && tutorialStep >= 0 && tutorialStep < TUTORIAL_STEP_COUNT && (
        <TutorialOverlay />
      )}

      {gamePhase === 'gameover' && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md overflow-y-auto py-8" style={{ zIndex: Z.OVERLAY }}>
          {/*
            三条胜利阈值已经改成"写进日志的一页称号"，达标不再停机。
            所以这块全屏层现在**只**由翻船触发，不用再判是胜是败——
            留着 `victoryDay !== null ? 胜利 : 失败` 的分支，会让"先拿了称号、
            后来翻船"的玩家看到一屏「传奇船长」，那是在说谎。
          */}
          <img
            src={BG_ASSETS.defeat}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover opacity-85"
          />
          <div className="text-center space-y-6 max-w-md px-6 relative">
            <div className="text-5xl mb-4">🏴‍☠️</div>
            <h1 className="pirate-title text-4xl text-danger-400">航行终结</h1>
            <p className="text-gold-400 font-serif text-lg">
              你的舰队在第{fleet.day}天走向了终结
            </p>
            <div className="space-y-1 text-gold-500 font-serif text-sm">
              <p>积累财富: <span className="text-gold-300">{fleet.gold} 金币</span> · 声望: <span className="text-gold-300">{fleet.fame}</span></p>
              <p>探索港口: <span className="text-gold-300">{discoveredPorts.length}/20</span> · 完成冒险: <span className="text-gold-300">{completedTasks.length}</span></p>
              {claimedVictories.length > 0 && (
                <p className="text-gold-300">册子里已写下 {claimedVictories.length} 页称号，都还在。</p>
              )}
            </div>

            {/* 生涯总结 */}
            <div className="bg-ocean-800/50 border border-gold-700/30 rounded-lg p-3 text-left">
              <h3 className="font-pirate text-gold-400 text-sm mb-2 text-center">—— 航海生涯总结 ——</h3>
              <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-xs font-serif">
                <span className="text-gold-600">海上航行</span><span className="text-gold-300 text-right">{stats.daysSailed} 天</span>
                <span className="text-gold-600">交易笔数</span><span className="text-gold-300 text-right">{stats.trades} 笔（最大单笔 {stats.bestDeal} 金）</span>
                <span className="text-gold-600">经历事件</span><span className="text-gold-300 text-right">{stats.eventsSurvived} 次</span>
                <span className="text-gold-600">击退海盗</span><span className="text-gold-300 text-right">{stats.pirateWins} 次</span>
                <span className="text-gold-600">历史目击</span><span className="text-gold-300 text-right">{stats.historySeen} 个节点</span>
                <span className="text-gold-600">解锁成就</span><span className="text-gold-300 text-right">{earnedAchievements.length}/{totalAchievements}</span>
              </div>
            </div>

            {/* 同代船长排名 */}
            <div className="bg-ocean-800/50 border border-gold-700/30 rounded-lg p-3 text-left">
              <h3 className="font-pirate text-gold-400 text-sm mb-2 text-center">—— 同代船长座次 ——</h3>
              <div className="space-y-1">
                {finalRanking.map((r, i) => (
                  <div
                    key={r.name}
                    className={`flex items-center justify-between text-xs font-serif px-2 py-1 rounded ${
                      r.isPlayer ? 'bg-gold-700/30 text-gold-200' : 'text-gold-500'
                    }`}
                  >
                    <span>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  '} {r.name}
                    </span>
                    <span>{r.gold} 金币 · 声望 {r.fame} · 探索 {r.ports}/20</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 第二条线：后世如何记载你 */}
            <div className="bg-ocean-800/50 border border-gold-700/30 rounded-lg p-3 text-left">
              <h3 className="font-pirate text-gold-400 text-sm mb-2 text-center">—— 后世如何记载你 ——</h3>
              <div className="space-y-1.5 text-xs font-serif">
                {captainTitle && (
                  <p className="text-gold-200">
                    🏷️ 海上人称你「<span className="text-gold-300">{captainTitle.name}</span>」——{captainTitle.epithet}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {FACTIONS.map(f => {
                    const rep = factionRep[f.id] ?? 0
                    const tone = rep >= 30 ? 'text-safe-400' : rep <= -30 ? 'text-danger-400' : 'text-gold-600'
                    return (
                      <span key={f.id} className={tone}>
                        {f.icon} {f.name} {rep > 0 ? '+' : ''}{rep}
                      </span>
                    )
                  })}
                </div>
                {crewRoster.length > 0 && (
                  <p className="text-gold-500">
                    与你共度此生的伙伴：{crewRoster.map(m => CREW_CHAR_MAP.get(m.id)?.name).filter(Boolean).join('、')}
                  </p>
                )}
                {crewRoster.length === 0 && (
                  <p className="text-gold-600">这一世，你的船上只有数字，没有名字。</p>
                )}
              </div>
            </div>

            <p className="text-gold-400 font-serif text-sm italic">
              大海收回了它的租金。海图还在，日志也还在——不重来，也能接着往外看。
            </p>
            {/*
              翻船不再只有「重新起航」一条路。日志、图鉴、称号是这一局攒下的东西，
              因为一次士气归零全清掉，等于前面所有"会累积"的承诺一次性作废。
            */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={continueAsVisitor}
                className="btn-nautical px-6 py-2 rounded-lg font-serif hover:bg-gold-500 transition-all"
                data-testid="continue-as-visitor"
              >
                接着看海（进度不清）
              </button>
              <button
                onClick={resetGame}
                className="px-5 py-2 rounded-lg font-serif text-gold-400 hover:text-gold-200 border border-gold-700/40 press transition-all"
              >
                重新起航
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}