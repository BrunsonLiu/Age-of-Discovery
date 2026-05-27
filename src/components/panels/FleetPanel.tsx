import { useState } from 'react'
import { Ship, Coins, Utensils, Droplets, Heart, Anchor, Wind, Skull, Map, ChevronRight } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { routes } from '@/data/routes'
import { ports } from '@/data/ports'
import { calculateSailingDays } from '@/utils/navigation'
import ParchmentCard from '@/components/ui/ParchmentCard'
import ResourceBar from '@/components/ui/ResourceBar'
import ActionButton from '@/components/ui/ActionButton'

const shipTypeNames: Record<string, string> = {
  caravel: '卡拉维尔', galleon: '盖伦帆船', sloop: '单桅纵帆', frigate: '护卫舰',
}

const dangerLabels = ['安全', '低危', '中危', '高危', '极危']

export default function FleetPanel() {
  const fleet = useGameStore(s => s.fleet)
  const currentRoute = useGameStore(s => s.currentRoute)
  const setActivePanel = useGameStore(s => s.setActivePanel)
  const selectRoute = useGameStore(s => s.selectRoute)
  const setCenter = useMapStore(s => s.setCenter)
  const routeProgress = useGameStore(s => s.routeProgress)
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null)

  const availableRoutes = fleet.currentPortId
    ? routes.filter(r => r.fromPortId === fleet.currentPortId)
    : []

  const handleConfirmRoute = () => {
    const route = availableRoutes.find(r => r.id === selectedRouteId)
    if (!route) return
    selectRoute(route)
    const toPort = ports.find(p => p.id === route.toPortId)
    if (toPort) setCenter([toPort.latitude, toPort.longitude])
    setSelectedRouteId(null)
  }

  return (
    <div className="w-80 animate-slide-in-left">
      <ParchmentCard title="舰队状态" onClose={() => setActivePanel(null)}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-pirate text-gold-300">{fleet.name}</span>
            <span className="flex items-center gap-1 text-gold-400 text-sm font-serif">
              <Coins size={14} /> {fleet.gold}
            </span>
          </div>

          <div className="space-y-1.5">
            <ResourceBar value={fleet.food} maxValue={200} label="食物" color="" icon={<Utensils size={14} />} />
            <ResourceBar value={fleet.water} maxValue={200} label="淡水" color="" icon={<Droplets size={14} />} />
            <ResourceBar value={fleet.morale} maxValue={100} label="士气" color="" icon={<Heart size={14} />} />
          </div>

          <div className="border-t border-gold-700/30 pt-2 space-y-2">
            {fleet.ships.map(ship => (
              <div key={ship.id} className="bg-ocean-800/40 rounded p-2">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gold-300 font-serif">{ship.name}</span>
                  <span className="text-gold-500 text-xs">{shipTypeNames[ship.type]}</span>
                </div>
                <ResourceBar value={ship.durability} maxValue={ship.maxDurability} label="耐久" color="" icon={<Ship size={12} />} />
                <div className="flex justify-between text-xs text-gold-500 mt-1">
                  <span>船员 {ship.crew}/{ship.maxCrew}</span>
                  <span>货舱 {ship.usedCapacity}/{ship.capacity}</span>
                </div>
              </div>
            ))}
          </div>

          {fleet.currentPortId && !currentRoute && (
            <div className="border-t border-gold-700/30 pt-2">
              <div className="bg-gold-700/15 rounded p-2 mb-2 text-center">
                <p className="text-gold-300 font-serif text-sm">🗺️ 点击地图上的港口或任意位置开始航行</p>
                <p className="text-gold-600 text-xs mt-1">你可以点击地图上任何位置来设定目的地</p>
              </div>
              {availableRoutes.length > 0 && (
                <>
                  <h4 className="font-pirate text-gold-500 text-xs mb-1.5 flex items-center gap-1">
                    <Anchor size={12} /> 推荐航线
                  </h4>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto scrollbar-thin">
                    {availableRoutes.map(route => {
                      const toPort = ports.find(p => p.id === route.toPortId)
                      const days = calculateSailingDays(route, fleet)
                      const isSelected = selectedRouteId === route.id
                      return (
                        <button
                          key={route.id}
                          onClick={() => setSelectedRouteId(route.id)}
                          className={`w-full text-left rounded p-1.5 text-xs transition-all ${
                            isSelected
                              ? 'bg-gold-700/30 border border-gold-500/50'
                              : 'bg-ocean-800/30 border border-transparent hover:border-gold-700/30'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-gold-200 font-serif flex items-center gap-1">
                              <Map size={11} /> {toPort?.nameCn}
                            </span>
                            <span className={`text-xs ${
                              route.dangerLevel >= 4 ? 'text-danger-400' :
                              route.dangerLevel >= 3 ? 'text-gold-400' : 'text-safe-400'
                            }`}>
                              {dangerLabels[route.dangerLevel - 1]}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-gold-500 mt-0.5">
                            <span className="flex items-center gap-0.5"><Wind size={9} /> {route.distance}海里</span>
                            <span>约{days}天</span>
                            <span className="flex items-center gap-0.5"><Skull size={9} /> Lv.{route.dangerLevel}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  {selectedRouteId && (
                    <div className="mt-2">
                      <ActionButton onClick={handleConfirmRoute} icon={<ChevronRight size={14} />}>
                        确认出航
                      </ActionButton>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {currentRoute && (
            <div className="border-t border-gold-700/30 pt-2">
              <div className="text-center text-gold-400 font-serif text-sm">
                ⛵ 航行中... {Math.round(routeProgress * 100)}%
              </div>
              <div className="h-1.5 bg-ocean-700 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-gold-500 rounded-full transition-all duration-500" style={{ width: `${routeProgress * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </ParchmentCard>
    </div>
  )
}
