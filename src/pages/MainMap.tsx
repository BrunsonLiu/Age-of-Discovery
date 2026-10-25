import { useEffect } from 'react'
import { Ship, Anchor, Scroll, Flag, Package, HelpCircle, Trophy, Newspaper } from 'lucide-react'
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
import Compass from '@/components/ui/Compass'
import WeatherBadge from '@/components/ui/WeatherBadge'
import TimelineBar from '@/components/ui/TimelineBar'
import NotificationToast from '@/components/ui/NotificationToast'
import FxLayer from '@/components/ui/FxLayer'
import IntroScreen from '@/components/intro/IntroScreen'
import { TUTORIAL_STEP_COUNT } from '@/constants/tutorial'
import TutorialOverlay from '@/components/intro/TutorialOverlay'
import HelpPanel from '@/components/intro/HelpPanel'
import HelmModal from '@/components/map/HelmModal'
import DialogueOverlay from '@/components/ui/DialogueOverlay'
import WindParticles from '@/components/map/WindParticles'
import { useKeyboardControls } from '@/hooks/useKeyboardControls'
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

  const activeLeftPanel = activePanel && LEFT_PANELS.includes(activePanel) ? activePanel : null
  const activeRightPanel = activePanel && RIGHT_PANELS.includes(activePanel) ? activePanel : null

  return (
    <div className="h-screen w-screen overflow-hidden bg-ocean-900">

      <div className="absolute inset-0" style={{ zIndex: Z.MAP }}>
        <MapView />
        <SailingController />
        <WeatherFx />
      </div>

      <div className="absolute top-14 left-3" style={{ zIndex: Z.COMPASS }}>
        <Compass windBearing={windBearing} />
      </div>

      {/* 天候徽章：当前天气 + 风速 + 航速影响，点击展开三日预报 */}
      <div className="absolute top-[9.75rem] left-3" style={{ zIndex: Z.COMPASS }}>
        <WeatherBadge />
      </div>

      {/* 风向氛围层：粒子随风带漂移，让"风"被看见（不拦截点击） */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: Z.WIND }}>
        <WindParticles windBearing={windBearing} windSpeed={windSpeed} />
      </div>

      <div
        className="absolute left-0 flex flex-col justify-center gap-2 px-1.5"
        style={{ zIndex: Z.SIDE_BUTTONS, top: '60px', bottom: '52px' }}
      >
        {panelButtons.filter(b => b.side === 'left').map(btn => (
          <button
            key={btn.type}
            onClick={() => togglePanel(btn.type)}
            data-tut={btn.type}
            className={`p-2.5 rounded-lg transition-all duration-200 ${
              activePanel === btn.type
                ? 'bg-gold-700/50 text-gold-200 shadow-lg shadow-gold-900/30'
                : 'bg-ocean-900/80 text-gold-500 hover:text-gold-300 hover:bg-ocean-800/80'
            } backdrop-blur-sm border border-gold-700/20`}
            title={btn.label}
            aria-label={btn.label}
            aria-pressed={activePanel === btn.type}
          >
            {btn.icon}
          </button>
        ))}
      </div>

      <div
        className="absolute right-0 flex flex-col justify-center gap-2 px-1.5"
        style={{ zIndex: Z.SIDE_BUTTONS, top: '60px', bottom: '52px' }}
      >
        {panelButtons.filter(b => b.side === 'right').map(btn => (
          <button
            key={btn.type}
            onClick={() => togglePanel(btn.type)}
            data-tut={btn.type}
            className={`p-2.5 rounded-lg transition-all duration-200 ${
              activePanel === btn.type
                ? 'bg-gold-700/50 text-gold-200 shadow-lg shadow-gold-900/30'
                : 'bg-ocean-900/80 text-gold-500 hover:text-gold-300 hover:bg-ocean-800/80'
            } backdrop-blur-sm border border-gold-700/20`}
            title={btn.label}
            aria-label={btn.label}
            aria-pressed={activePanel === btn.type}
          >
            {btn.icon}
          </button>
        ))}
        <button
          onClick={() => {
            if (activePanel) setActivePanel(null)
            setShowHelp(!showHelp)
          }}
          className={`p-2.5 rounded-lg transition-all duration-200 ${
            showHelp
              ? 'bg-gold-700/50 text-gold-200 shadow-lg shadow-gold-900/30'
              : 'bg-ocean-900/80 text-gold-500 hover:text-gold-300 hover:bg-ocean-800/80'
          } backdrop-blur-sm border border-gold-700/20`}
          title="帮助"
          aria-label="帮助"
          aria-pressed={showHelp}
        >
          <HelpCircle size={18} />
        </button>
      </div>

      {activeLeftPanel && (
        <div
          className="absolute left-10 top-12 bottom-12 w-80"
          style={{ zIndex: Z.PANEL }}
        >
          {activeLeftPanel === 'fleet' && <FleetPanel />}
          {activeLeftPanel === 'task' && <TaskPanel />}
          {activeLeftPanel === 'event' && <EventLog />}
          {activeLeftPanel === 'achievement' && <AchievementPanel />}
          {activeLeftPanel === 'rival' && <RivalPanel />}
        </div>
      )}

      {activeRightPanel && (
        <div
          className="absolute right-10 top-12 bottom-12 w-80"
          style={{ zIndex: Z.PANEL }}
        >
          {activeRightPanel === 'port' && <PortDetail />}
          {activeRightPanel === 'trade' && <TradePanel />}
          {activeRightPanel === 'shipyard' && <ShipyardPanel />}
        </div>
      )}

      {showHelp && (
        <div
          className="absolute right-10 top-12 bottom-12 w-80"
          style={{ zIndex: Z.PANEL }}
        >
          <HelpPanel />
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0" style={{ zIndex: Z.BOTTOM_BAR }}>
        <BottomBar />
      </div>

      <div className="absolute top-0 left-0 right-0" style={{ zIndex: Z.TIMELINE }}>
        <TimelineBar />
      </div>

      <div className="absolute top-14 right-4" style={{ zIndex: Z.NOTIFICATION }}>
        <NotificationToast />
      </div>

      {/* 兑现层：音效 + 飘字 + 闪光 + 横幅 */}
      <FxLayer />

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