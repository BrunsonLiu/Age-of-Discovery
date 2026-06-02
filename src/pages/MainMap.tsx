import { Ship, Anchor, Scroll, Flag, Package, HelpCircle } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import MapView from '@/components/map/MapView'
import SailingController from '@/components/map/SailingController'
import FleetPanel from '@/components/panels/FleetPanel'
import PortDetail from '@/components/panels/PortDetail'
import TradePanel from '@/components/panels/TradePanel'
import EventLog from '@/components/panels/EventLog'
import TaskPanel from '@/components/panels/TaskPanel'
import EventCard from '@/components/events/EventCard'
import BottomBar from '@/components/ui/BottomBar'
import Compass from '@/components/ui/Compass'
import TimelineBar from '@/components/ui/TimelineBar'
import NotificationToast from '@/components/ui/NotificationToast'
import IntroScreen from '@/components/intro/IntroScreen'
import TutorialOverlay from '@/components/intro/TutorialOverlay'
import HelpPanel from '@/components/intro/HelpPanel'
import type { PanelType } from '@/types'

const panelButtons: { type: PanelType; icon: React.ReactNode; label: string; side: 'left' | 'right' }[] = [
  { type: 'fleet', icon: <Ship size={18} />, label: '舰队', side: 'left' },
  { type: 'port', icon: <Anchor size={18} />, label: '港口', side: 'right' },
  { type: 'trade', icon: <Package size={18} />, label: '贸易', side: 'right' },
  { type: 'task', icon: <Flag size={18} />, label: '任务', side: 'left' },
  { type: 'event', icon: <Scroll size={18} />, label: '日志', side: 'left' },
]

const Z = {
  MAP: 0,
  COMPASS: 10,
  SIDE_BUTTONS: 20,
  PANEL: 30,
  BOTTOM_BAR: 40,
  TIMELINE: 50,
  NOTIFICATION: 60,
  OVERLAY: 70,
}

const LEFT_PANELS: readonly PanelType[] = ['fleet', 'task', 'event'] as const
const RIGHT_PANELS: readonly PanelType[] = ['port', 'trade'] as const

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
      </div>

      <div className="absolute top-14 left-3" style={{ zIndex: Z.COMPASS }}>
        <Compass />
      </div>

      <div
        className="absolute left-0 flex flex-col justify-center gap-2 px-1.5"
        style={{ zIndex: Z.SIDE_BUTTONS, top: '60px', bottom: '52px' }}
      >
        {panelButtons.filter(b => b.side === 'left').map(btn => (
          <button
            key={btn.type}
            onClick={() => togglePanel(btn.type)}
            className={`p-2.5 rounded-lg transition-all duration-200 ${
              activePanel === btn.type
                ? 'bg-gold-700/50 text-gold-200 shadow-lg shadow-gold-900/30'
                : 'bg-ocean-900/80 text-gold-500 hover:text-gold-300 hover:bg-ocean-800/80'
            } backdrop-blur-sm border border-gold-700/20`}
            title={btn.label}
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
            className={`p-2.5 rounded-lg transition-all duration-200 ${
              activePanel === btn.type
                ? 'bg-gold-700/50 text-gold-200 shadow-lg shadow-gold-900/30'
                : 'bg-ocean-900/80 text-gold-500 hover:text-gold-300 hover:bg-ocean-800/80'
            } backdrop-blur-sm border border-gold-700/20`}
            title={btn.label}
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
        </div>
      )}

      {activeRightPanel && (
        <div
          className="absolute right-10 top-12 bottom-12 w-80"
          style={{ zIndex: Z.PANEL }}
        >
          {activeRightPanel === 'port' && <PortDetail />}
          {activeRightPanel === 'trade' && <TradePanel />}
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

      {gamePhase === 'playing' && tutorialStep >= 0 && tutorialStep <= 6 && (
        <div className="absolute inset-0" style={{ zIndex: Z.OVERLAY }}>
          <TutorialOverlay />
        </div>
      )}

      {gamePhase === 'gameover' && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md" style={{ zIndex: Z.OVERLAY }}>
          <div className="text-center space-y-6">
            <div className="text-5xl mb-4">🏴‍☠️</div>
            <h1 className="pirate-title text-4xl text-danger-400">航行终结</h1>
            <p className="text-gold-400 font-serif text-lg">
              你的舰队在第{fleet.day}天走向了终结
            </p>
            <p className="text-gold-500 font-serif">
              积累财富: <span className="text-gold-300">{fleet.gold} 金币</span>
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