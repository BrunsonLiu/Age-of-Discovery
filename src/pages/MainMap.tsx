import { useEffect } from 'react'
import { Ship, Anchor, Scroll, Flag, Package, HelpCircle, Trophy, Newspaper, Hammer } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import MapView from '@/components/map/MapView'
import SailingController from '@/components/map/SailingController'
import FleetPanel from '@/components/panels/FleetPanel'
import PortDetail from '@/components/panels/PortDetail'
import TradePanel from '@/components/panels/TradePanel'
import ShipyardPanel from '@/components/panels/ShipyardPanel'
import EventLog from '@/components/panels/EventLog'
import TaskPanel from '@/components/panels/TaskPanel'
import AchievementPanel from '@/components/panels/AchievementPanel'
import RivalPanel from '@/components/panels/RivalPanel'
import VoyagePlanModal from '@/components/map/VoyagePlanModal'
import SegmentDecision from '@/components/map/SegmentDecision'
import WeatherFx from '@/components/map/WeatherFx'
import EventCard from '@/components/events/EventCard'
import BottomBar from '@/components/ui/BottomBar'
import BrokerTip from '@/components/map/BrokerTip'
import VoyageControls from '@/components/map/VoyageControls'
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
import HelmModal from '@/components/map/HelmModal'
import DialogueOverlay from '@/components/ui/DialogueOverlay'
import WindParticles from '@/components/map/WindParticles'
import { useKeyboardControls } from '@/hooks/useKeyboardControls'
import { useIsMobile } from '@/hooks/useIsMobile'
import { prevailingWindBearing } from '@/utils/navigation'
import type { PanelType } from '@/types'
import { tasks } from '@/data/tasks'
import { currentTitle } from '@/data/titles'
import { FACTIONS } from '@/data/factions'
import { CREW_CHAR_MAP } from '@/data/crewChars'
import { achievements } from '@/data/achievements'
import { BG_ASSETS } from '@/data/envAssets'
import { OPENING_SCRIPT_ID } from '@/utils/dialogue'
import { useDialogueStore } from '@/store/useDialogueStore'

const totalTasks = tasks.length
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
  SIDE_BUTTONS: 20,
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
  const victoryDay = useGameStore(s => s.victoryDay)
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
  // 刷新页面时 dialogueSeen 已存档，不重播。后续触发点（rival 遭遇等）照此模式加。
  //
  // 教学进行中暂缓播放：教学是全屏遮罩且键盘优先级更高，对白压在底下既看不全
  // 也推进不了（Enter 被教学吃掉），等教学结束再开场致辞。
  const dialogueSeen = useGameStore(s => s.dialogueSeen)
  const tutorialActive = gamePhase === 'playing' && tutorialStep >= 0 && tutorialStep < TUTORIAL_STEP_COUNT
  useEffect(() => {
    if (gamePhase === 'playing' && !tutorialActive && !dialogueSeen.includes(OPENING_SCRIPT_ID)) {
      useDialogueStore.getState().open(OPENING_SCRIPT_ID)
    }
  }, [gamePhase, dialogueSeen, tutorialActive])

  // 视野中心所处的行星风带（罗盘风向标 + 风向粒子的风向来源）
  const mapCenter = useMapStore((s) => s.center)
  // 风向以真实天气状态为准（天气按海域生成、持续 1-3 天；初始回退到纬度风带）
  const weather = useGameStore(s => s.weather)
  const windBearing = weather.windDir || prevailingWindBearing(mapCenter[0])
  const windSpeed = weather.windSpeed

  // 同代船长最终座次（按金币，声望决胜）
  const finalRanking = [
    { name: '你', gold: fleet.gold, fame: fleet.fame, ports: discoveredPorts.length, isPlayer: true },
    ...rivals.map(r => ({ name: r.name, gold: r.gold, fame: r.fame, ports: r.portsFound, isPlayer: false })),
  ].sort((a, b) => b.gold - a.gold || b.fame - a.fame)

  const victoryDesc = useGameStore(() => {
    if (discoveredPorts.length >= 20) return '你发现了世上全部 20 座港口——每一片海岸都记得你的帆影。'
    if (completedTasks.length >= totalTasks) return `${totalTasks} 段冒险全部写进了你的航海日志——传奇船长，实至名归。`
    if (fleet.gold >= 20000) return '两万金币的家底——你的船队比西班牙珍宝舰队还令人垂涎。'
    return '你的名字已被这片大海记住。'
  })

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

      <div className="absolute inset-0" style={{ zIndex: Z.MAP }}>
        <MapView />
        <SailingController />
        <WeatherFx />
      </div>

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
            </button>
          ))}
        </div>

        <div
          className="absolute right-0 flex flex-col justify-center gap-1.5 px-1.5 pointer-events-none"
          style={{ zIndex: Z.SIDE_BUTTONS, top: '60px', bottom: '52px' }}
        >
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
      {!isMobile && <BrokerTip />}
      {/* 航行中：改方针 / 亲手掌舵（原来这两个是每段自动弹的全屏层） */}


      {isMobile ? (
        <div className="fixed bottom-0 left-0 right-0" style={{ zIndex: Z.BOTTOM_BAR }}>
          <VoyageControls placement="stack" />
          <BrokerTip placement="stack" />
          <BottomBar />
          <MobileTabBar
            buttons={panelButtons.map(b => ({ type: b.type, icon: b.icon, label: b.label }))}
            activePanel={activePanel}
            onToggle={togglePanel}
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
      <VoyagePlanModal />

      {/* 航段抉择：每段航程开始时选一个方针（1/2/3）——这是唯一的速度旋钮 */}
      <SegmentDecision />

      {/* 操舵挑战：航行中的实时操作小游戏（H 键或底部按钮进入） */}
      <HelmModal />

      {/* 剧情对白：角色立绘滑入致辞（开局由下方触发器拉起，Enter 推进 / Esc 跳过） */}
      <DialogueOverlay />

      {currentEvent && gamePhase === 'event' && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: Z.OVERLAY }}>
          <EventCard />
        </div>
      )}

      {gamePhase === 'start' && (
        <div className="absolute inset-0" style={{ zIndex: Z.OVERLAY }}>
          <IntroScreen />
        </div>
      )}

      {/* 教学引导：组件内部 portal 到 body，自带 z-index，不受这里的 OVERLAY 容器约束 */}
      {gamePhase === 'playing' && tutorialStep >= 0 && tutorialStep < TUTORIAL_STEP_COUNT && (
        <TutorialOverlay />
      )}

      {gamePhase === 'gameover' && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md overflow-y-auto py-8" style={{ zIndex: Z.OVERLAY }}>
          {/* 结局背景（H2/H3）：凯旋夕阳 / 暴风雨沉船 */}
          <img
            src={victoryDay !== null ? BG_ASSETS.victory : BG_ASSETS.defeat}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover opacity-85"
          />
          <div className="text-center space-y-6 max-w-md px-6 relative">
            {victoryDay !== null ? (
              <>
                <div className="text-5xl mb-4">👑</div>
                <h1 className="pirate-title text-4xl text-gold-300">传奇船长</h1>
                <p className="text-gold-400 font-serif text-lg">第{victoryDay}天，四海皆知你的名号</p>
                <div className="space-y-1 text-gold-500 font-serif text-sm">
                  <p>{victoryDesc}</p>
                  <p>累积财富: <span className="text-gold-300">{fleet.gold} 金币</span> · 声望: <span className="text-gold-300">{fleet.fame}</span></p>
                  <p>探索港口: <span className="text-gold-300">{discoveredPorts.length}/20</span> · 完成冒险: <span className="text-gold-300">{completedTasks.length}</span></p>
                </div>
              </>
            ) : (
              <>
                <div className="text-5xl mb-4">🏴‍☠️</div>
                <h1 className="pirate-title text-4xl text-danger-400">航行终结</h1>
                <p className="text-gold-400 font-serif text-lg">
                  你的舰队在第{fleet.day}天走向了终结
                </p>
                <div className="space-y-1 text-gold-500 font-serif text-sm">
                  <p>积累财富: <span className="text-gold-300">{fleet.gold} 金币</span> · 声望: <span className="text-gold-300">{fleet.fame}</span></p>
                  <p>探索港口: <span className="text-gold-300">{discoveredPorts.length}/20</span> · 完成冒险: <span className="text-gold-300">{completedTasks.length}</span></p>
                </div>
              </>
            )}

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

            <p className="text-gold-600 font-serif text-sm italic">
              {victoryDay !== null
                ? '大航海时代落幕了，但酒馆里永远流传着你的航迹。'
                : '大海收回了它的租金。下一次，也许风会站在你这边。'}
            </p>
            <button
              onClick={resetGame}
              className="btn-nautical px-6 py-2 rounded-lg font-serif hover:bg-gold-500 transition-all"
            >
              重新起航
            </button>
          </div>
        </div>
      )}
    </div>
  )
}