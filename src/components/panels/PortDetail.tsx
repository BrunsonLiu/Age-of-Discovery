import { Anchor, Wrench, Package, Users, Coins, Shield, Heart } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports } from '@/data/ports'
import { tasks } from '@/data/tasks'
import ParchmentCard from '@/components/ui/ParchmentCard'
import ActionButton from '@/components/ui/ActionButton'

const regionNames: Record<string, string> = {
  europe: '欧洲', africa: '非洲', asia: '亚洲', caribbean: '加勒比',
}

const serviceIcons: Record<string, React.ReactNode> = {
  repair: <Wrench size={14} />,
  supply: <Package size={14} />,
  recruit: <Users size={14} />,
  trade: <Coins size={14} />,
}

const serviceNames: Record<string, string> = {
  repair: '修理', supply: '补给', recruit: '招募', trade: '贸易',
}

export default function PortDetail() {
  const fleet = useGameStore(s => s.fleet)
  const selectedPortId = useMapStore(s => s.selectedPortId)
  const setActivePanel = useGameStore(s => s.setActivePanel)
  const repairShip = useGameStore(s => s.repairShip)
  const supplyFleet = useGameStore(s => s.supplyFleet)
  const recruitCrew = useGameStore(s => s.recruitCrew)

  const portId = fleet.currentPortId || selectedPortId
  const port = ports.find(p => p.id === portId)

  if (!port) return null

  const isAtPort = fleet.currentPortId === port.id
  const portTasks = tasks.filter(t => t.portId === port.id && t.status === 'available')

  const handleRepair = (shipId: number) => {
    const ship = fleet.ships.find(s => s.id === shipId)
    if (!ship) return
    const cost = (ship.maxDurability - ship.durability) * 5
    if (fleet.gold < cost) return
    repairShip(shipId)
  }

  const handleSupply = () => {
    if (fleet.gold < 60) return
    supplyFleet()
  }

  const RECRUIT_COUNT = 5
  const RECRUIT_COST = RECRUIT_COUNT * 10

  const handleRecruit = (shipId: number) => {
    if (fleet.gold < RECRUIT_COST) return
    recruitCrew(shipId, RECRUIT_COUNT)
  }

  return (
    <div className="w-80 animate-slide-in-right">
      <ParchmentCard title={port.nameCn} onClose={() => setActivePanel(null)}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-gold-400 font-serif text-sm">{port.name}</span>
            <span className="text-xs bg-ocean-700/60 text-gold-300 px-2 py-0.5 rounded font-serif">
              {regionNames[port.region] || port.region}
            </span>
          </div>

          <p className="text-gold-500 text-xs font-serif leading-relaxed">{port.description}</p>

          {isAtPort && (
            <div className="border-t border-gold-700/30 pt-2">
              <h4 className="text-gold-300 font-serif text-sm mb-2 flex items-center gap-1">
                <Anchor size={14} /> 港口服务
              </h4>
              <div className="grid grid-cols-2 gap-1.5">
                {port.services.map(svc => (
                  <button
                    key={svc}
                    onClick={() => {
                      if (svc === 'trade') setActivePanel('trade')
                    }}
                    className="flex items-center gap-1.5 bg-ocean-800/40 hover:bg-ocean-700/40 border border-gold-700/20 rounded px-2 py-1.5 text-xs text-gold-300 font-serif transition-colors"
                  >
                    {serviceIcons[svc]}
                    {serviceNames[svc]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isAtPort && port.services.includes('repair') && (
            <div className="border-t border-gold-700/30 pt-2">
              <h4 className="text-gold-300 font-serif text-xs mb-1.5 flex items-center gap-1">
                <Shield size={12} /> 修理船只
              </h4>
              {fleet.ships.map(ship => {
                const damage = ship.maxDurability - ship.durability
                const cost = damage * 5
                return (
                  <div key={ship.id} className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gold-400 font-serif">{ship.name} ({ship.durability}/{ship.maxDurability})</span>
                    {damage > 0 ? (
                      <ActionButton onClick={() => handleRepair(ship.id)} disabled={fleet.gold < cost} variant="secondary">
                        <Coins size={10} /> {cost}
                      </ActionButton>
                    ) : (
                      <span className="text-safe-400 text-xs">完好</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {isAtPort && port.services.includes('supply') && (
            <div className="border-t border-gold-700/30 pt-2">
              <h4 className="text-gold-300 font-serif text-xs mb-1.5 flex items-center gap-1">
                <Package size={12} /> 补给物资
              </h4>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gold-400 font-serif">食物+20 淡水+20</span>
                <ActionButton onClick={handleSupply} disabled={fleet.gold < 60} variant="secondary">
                  <Coins size={10} /> 60
                </ActionButton>
              </div>
            </div>
          )}

          {isAtPort && port.services.includes('recruit') && (
            <div className="border-t border-gold-700/30 pt-2">
              <h4 className="text-gold-300 font-serif text-xs mb-1.5 flex items-center gap-1">
                <Users size={12} /> 招募船员
              </h4>
              {fleet.ships.map(ship => (
                <div key={ship.id} className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gold-400 font-serif">{ship.name} ({ship.crew}/{ship.maxCrew})</span>
                  {ship.crew < ship.maxCrew && (
                    <ActionButton onClick={() => handleRecruit(ship.id)} disabled={fleet.gold < RECRUIT_COST} variant="secondary">
                      +{RECRUIT_COUNT}人 <Coins size={10} /> {RECRUIT_COST}
                    </ActionButton>
                  )}
                </div>
              ))}
            </div>
          )}

          {portTasks.length > 0 && (
            <div className="border-t border-gold-700/30 pt-2">
              <h4 className="text-gold-300 font-serif text-xs mb-1.5 flex items-center gap-1">
                <Heart size={12} /> 港口任务
              </h4>
              {portTasks.slice(0, 2).map(task => (
                <div key={task.id} className="bg-ocean-800/30 rounded p-1.5 mb-1">
                  <div className="text-gold-200 text-xs font-serif">{task.title}</div>
                  <div className="text-gold-500 text-xs">奖励: <Coins size={10} className="inline" /> {task.reward.gold}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ParchmentCard>
    </div>
  )
}
