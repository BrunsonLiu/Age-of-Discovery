import { Ship as ShipIcon, Coins, Users, Package, Gauge, Anchor } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { shipTemplates, shipResaleValue } from '@/data/ships'
import { ports } from '@/data/ports'
import { effectiveFleetSpeed } from '@/utils/navigation'
import ParchmentCard from '@/components/ui/ParchmentCard'
import ActionButton from '@/components/ui/ActionButton'

const buyableKeys = ['sloop', 'frigate', 'galleon'] as const

const shipTypeNames: Record<string, string> = {
  caravel: '卡拉维尔', galleon: '盖伦大帆船', sloop: '单桅快船', frigate: '护卫舰',
}

export default function ShipyardPanel() {
  const fleet = useGameStore(s => s.fleet)
  const buyShip = useGameStore(s => s.buyShip)
  const sellShip = useGameStore(s => s.sellShip)
  const setActivePanel = useGameStore(s => s.setActivePanel)

  const portId = fleet.currentPortId
  const port = portId ? ports.find(p => p.id === portId) : null
  const hasShipyard = !!port?.services.includes('shipyard')
  if (!portId || !port || !hasShipyard) return null

  const totalCapacity = fleet.ships.reduce((s, sh) => s + sh.capacity, 0)
  const usedCapacity = fleet.cargo.reduce((s, c) => s + c.quantity, 0)

  return (
    <div className="w-80 animate-slide-in-right">
      <ParchmentCard title="造船厂" onClose={() => setActivePanel(null)}>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gold-400 font-serif">
            <span className="flex items-center gap-1"><Coins size={12} /> {fleet.gold} 金币</span>
            <span className="flex items-center gap-1"><Package size={12} /> {usedCapacity}/{totalCapacity} 货舱</span>
          </div>

          <div className="border-t border-gold-700/30 pt-2">
            <h4 className="text-gold-300 font-serif text-xs mb-1.5 flex items-center gap-1">
              <ShipIcon size={12} /> 出售旧船
            </h4>
            {fleet.ships.map(ship => (
              <div key={ship.id} className="flex items-center justify-between text-xs mb-1">
                <span className="text-gold-400 font-serif">
                  {ship.name} <span className="text-gold-600">({shipTypeNames[ship.type]})</span>
                </span>
                {fleet.ships.length > 1 && ship.usedCapacity === 0 ? (
                  <ActionButton onClick={() => sellShip(ship.id)} variant="secondary">
                    <Coins size={10} /> {shipResaleValue(ship)}
                  </ActionButton>
                ) : (
                  <span className="text-gold-600 text-xs">
                    {fleet.ships.length <= 1 ? '唯一座舰' : '卸货后可售'}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-gold-700/30 pt-2">
            <h4 className="text-gold-300 font-serif text-xs mb-1.5 flex items-center gap-1">
              <Anchor size={12} /> 购入新船
            </h4>
            <div className="space-y-1.5">
              {buyableKeys.map(key => {
                const template = shipTemplates[key]
                const canBuyRegion = template.regions.includes(port.region)
                const affordable = fleet.gold >= template.price
                const disabled = !canBuyRegion || !affordable
                return (
                  <div key={key} className="bg-ocean-800/40 rounded p-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gold-200 text-xs font-serif">{template.name}</span>
                      <ActionButton
                        onClick={() => buyShip(key)}
                        disabled={disabled}
                        variant="secondary"
                      >
                        <Coins size={10} /> {template.price}
                      </ActionButton>
                    </div>
                    <div className="flex items-center gap-3 text-gold-600 text-xs">
                      <span className="flex items-center gap-0.5"><Gauge size={10} /> {template.speed}节</span>
                      <span className="flex items-center gap-0.5"><ShipIcon size={10} /> 耐久{template.maxDurability}</span>
                      <span className="flex items-center gap-0.5"><Package size={10} /> {template.capacity}舱</span>
                      <span className="flex items-center gap-0.5"><Users size={10} /> {template.maxCrew}人</span>
                    </div>
                    {!canBuyRegion && (
                      <p className="text-gold-600 text-xs mt-1 font-serif">
                        ⚓ 此型船只在{template.regions.map(r => r === 'europe' ? '欧洲' : r === 'caribbean' ? '加勒比' : r === 'asia' ? '亚洲' : '非洲').join('、')}造船厂才有售
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div className="border-t border-gold-700/30 pt-2 text-xs text-gold-500 font-serif">
            <span className="flex items-center gap-1">
              <Gauge size={11} /> 当前舰队均速：{effectiveFleetSpeed(fleet).toFixed(1)} 节
            </span>
          </div>
        </div>
      </ParchmentCard>
    </div>
  )
}
