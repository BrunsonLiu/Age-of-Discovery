import { Anchor, Navigation, Coins, Drumstick, Droplets, Heart, RotateCcw, Pause, FastForward } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports } from '@/data/ports'
import { calculateSailingDays } from '@/utils/navigation'

export default function BottomBar() {
  const fleet = useGameStore((s) => s.fleet)
  const gamePhase = useGameStore((s) => s.gamePhase)
  const currentRoute = useGameStore((s) => s.currentRoute)
  const routeProgress = useGameStore((s) => s.routeProgress)
  const waypoint = useGameStore((s) => s.waypoint)
  const simSpeed = useGameStore((s) => s.simSpeed)
  const setSimSpeed = useGameStore((s) => s.setSimSpeed)
  const advanceDay = useGameStore((s) => s.advanceDay)
  const resetGame = useGameStore((s) => s.resetGame)
  const showWindOverlay = useMapStore((s) => s.showWindOverlay)
  const showCurrentOverlay = useMapStore((s) => s.showCurrentOverlay)
  const showPirateZones = useMapStore((s) => s.showPirateZones)
  const toggleWindOverlay = useMapStore((s) => s.toggleWindOverlay)
  const toggleCurrentOverlay = useMapStore((s) => s.toggleCurrentOverlay)
  const togglePirateZones = useMapStore((s) => s.togglePirateZones)

  const currentPort = fleet.currentPortId ? ports.find(p => p.id === fleet.currentPortId) : null
  const destPort = currentRoute?.toPortId ? ports.find(p => p.id === currentRoute.toPortId) : null
  const destName = destPort?.nameCn ?? waypoint?.name ?? '未知海域'

  const totalDays = currentRoute ? calculateSailingDays(currentRoute, fleet) : 0
  const daysLeft = currentRoute ? Math.max(0, Math.ceil(totalDays * (1 - routeProgress))) : 0
  const progressPct = Math.round(routeProgress * 100)

  const speedOptions = [
    { value: 0, label: '⏸', icon: <Pause size={12} /> },
    { value: 1, label: '1x', icon: null },
    { value: 3, label: '3x', icon: <FastForward size={12} /> },
    { value: 8, label: '8x', icon: <FastForward size={12} /> },
  ]

  return (
    <div className="bg-ocean-800/90 backdrop-blur-sm border-t border-gold-700/30 px-3 py-1.5 flex items-center justify-between gap-3">

      <div className="flex items-center gap-2 text-gold-300 min-w-0">
        {fleet.isSailing ? (
          <div className="flex items-center gap-2 min-w-0">
            <Navigation size={14} className="text-blue-400 shrink-0 animate-pulse" />
            <span className="font-serif text-sm text-blue-300 truncate">
              → {destName}
            </span>
            <span className="text-xs text-gold-500 shrink-0">
              {progressPct}%
            </span>
            <div className="w-16 h-1.5 bg-ocean-700 rounded-full overflow-hidden shrink-0">
              <div
                className="h-full bg-blue-400 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-gold-600 shrink-0">
              约{daysLeft}天
            </span>
          </div>
        ) : currentPort ? (
          <div className="flex items-center gap-1.5">
            <Anchor size={14} className="text-gold-400 shrink-0" />
            <span className="font-serif text-sm text-gold-300">{currentPort.nameCn}</span>
            <span className="text-xs text-gold-600">· 点击地图出航</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Navigation size={14} className="text-gold-400 shrink-0" />
            <span className="font-serif text-sm text-gold-300">点击地图设定航向</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <div className="flex items-center bg-ocean-700/60 rounded-md overflow-hidden border border-gold-700/20">
          {speedOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSimSpeed(opt.value)}
              className={`px-2 py-1 text-xs font-serif transition-colors ${
                simSpeed === opt.value
                  ? 'bg-gold-700/50 text-gold-200'
                  : 'text-gold-500 hover:text-gold-300 hover:bg-ocean-600/50'
              }`}
              title={opt.value === 0 ? '暂停' : `${opt.label}速度`}
            >
              {opt.icon || opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={advanceDay}
          className="px-2 py-1 text-xs font-serif text-gold-500 hover:text-gold-300 bg-ocean-700/40 rounded-md border border-gold-700/20 transition-colors"
          title="跳过一天"
        >
          +1天
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-gold-300">
          <span className="text-gold-500 font-serif">第{fleet.day}天</span>
          <span className="flex items-center gap-0.5"><Coins size={11} />{fleet.gold}</span>
          <span className="flex items-center gap-0.5"><Drumstick size={11} />{fleet.food}</span>
          <span className="flex items-center gap-0.5"><Droplets size={11} />{fleet.water}</span>
          <span className="flex items-center gap-0.5"><Heart size={11} />{fleet.morale}</span>
        </div>
        <div className="w-px h-4 bg-gold-700/30" />
        <div className="flex items-center gap-0.5">
          <button
            onClick={toggleWindOverlay}
            className={`p-1 rounded transition-colors ${
              showWindOverlay ? 'bg-gold-700/40 text-gold-200' : 'text-gold-500 hover:text-gold-300'
            }`}
            title="风向"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>
          </button>
          <button
            onClick={toggleCurrentOverlay}
            className={`p-1 rounded transition-colors ${
              showCurrentOverlay ? 'bg-gold-700/40 text-gold-200' : 'text-gold-500 hover:text-gold-300'
            }`}
            title="洋流"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0M2 18c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0M2 6c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0"/></svg>
          </button>
          <button
            onClick={togglePirateZones}
            className={`p-1 rounded transition-colors ${
              showPirateZones ? 'bg-danger-700/40 text-danger-200' : 'text-gold-500 hover:text-gold-300'
            }`}
            title="海盗区域"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
          </button>
          <div className="w-px h-3 bg-gold-700/30" />
          <button
            onClick={resetGame}
            className="p-1 rounded text-gold-500 hover:text-gold-300 hover:bg-gold-700/30 transition-colors"
            title="重新开始"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
