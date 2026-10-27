import { useState } from 'react'
import { Ship, Coins, Utensils, Droplets, Heart, Anchor, Wind, Skull, Map, ChevronRight, Star, Users } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { routes } from '@/data/routes'
import { ports } from '@/data/ports'
import { getTrait } from '@/data/traits'
import { OFFICER_MAP } from '@/data/officers'
import { CREW_CHAR_MAP } from '@/data/crewChars'
import { crewPortrait } from '@/data/portraits'
import { FACTIONS, factionAttitude } from '@/data/factions'
import { currentTitle } from '@/data/titles'
import { shipSprite } from '@/data/shipSprites'
import { calculateSailingDays, effectiveFleetSpeed } from '@/utils/navigation'
import { LOW_MORALE, dailyRates, daysToDestination, formatSupplyDays, supplyDaysRemaining, supplyLevel } from '@/utils/voyage'
import ParchmentCard from '@/components/ui/ParchmentCard'
import ResourceBar from '@/components/ui/ResourceBar'
import ActionButton from '@/components/ui/ActionButton'
import Badge from '@/components/ui/Badge'
import Ship3DView from '@/components/three/Ship3DView'

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
  const setFlagship = useGameStore(s => s.setFlagship)
  const officers = useGameStore(s => s.officers)
  const stance = useGameStore(s => s.stance)
  const weather = useGameStore(s => s.weather)
  const factionRep = useGameStore(s => s.factionRep)
  const crewRoster = useGameStore(s => s.crewRoster)
  const notoriety = useGameStore(s => s.notoriety)
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null)
  const [previewId, setPreviewId] = useState<number | null>(null)

  const totalCapacity = fleet.ships.reduce((sum, sh) => sum + sh.capacity, 0)
  const totalCrew = fleet.ships.reduce((sum, sh) => sum + sh.crew, 0)
  const maxCrew = fleet.ships.reduce((sum, sh) => sum + sh.maxCrew, 0)
  const avgSpeed = effectiveFleetSpeed(fleet, officers)
  const fleetTrait = getTrait(fleet.trait)
  const totalWage = officers.reduce((sum, id) => sum + (OFFICER_MAP.get(id)?.dailyWage ?? 0), 0)
  const captainTitle = currentTitle(notoriety)

  /* ---- 补给余量折算（与底栏 ResourceCluster、store 结算同源）---- */
  const rates = dailyRates(fleet, stance, crewRoster.some(m => m.id === 'cook'))
  const voyageNeedDays = currentRoute
    ? daysToDestination({
        routeDistanceNm: currentRoute.distance,
        progress: routeProgress,
        fleet,
        officers,
        windFavor: currentRoute.windFavor,
        stance,
        weather,
      })
    : 0

  type SupplyKind = 'food' | 'water'
  const supplyDays = (kind: SupplyKind): number =>
    supplyDaysRemaining(kind === 'food' ? fleet.food : fleet.water, kind === 'food' ? rates.foodPerDay : rates.waterPerDay)

  const supplyHint = (kind: SupplyKind): string => {
    const perDay = kind === 'food' ? rates.foodPerDay : rates.waterPerDay
    if (perDay <= 0) return '无船员，不消耗'
    const days = supplyDays(kind)
    if (fleet.isSailing && voyageNeedDays > 0 && days < voyageNeedDays) {
      return `差 ${Math.ceil(voyageNeedDays - days)} 天`
    }
    return `可撑 ${formatSupplyDays(days)} 天`
  }

  const supplyTone = (kind: SupplyKind): 'normal' | 'warn' | 'critical' => {
    const level = supplyLevel(
      kind === 'food' ? fleet.food : fleet.water,
      kind === 'food' ? rates.foodPerDay : rates.waterPerDay,
      voyageNeedDays,
    )
    return level === 'ok' ? 'normal' : level
  }

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
    <div className="w-full md:w-80 animate-slide-in-left">
      <ParchmentCard title="舰队状态" onClose={() => setActivePanel(null)}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-pirate text-gold-300">{fleet.name}</span>
            <span className="flex items-center gap-1 text-gold-400 text-sm font-serif">
              <Coins size={14} /> {fleet.gold}
            </span>
          </div>

          {/* 舰队总览 */}
          <div className="grid grid-cols-3 gap-1 text-center bg-ocean-800/30 rounded p-1.5">
            <div>
              <div className="text-gold-500 text-[10px] font-serif">船只</div>
              <div className="text-gold-200 text-xs font-serif">{fleet.ships.length} 艘</div>
            </div>
            <div>
              <div className="text-gold-500 text-[10px] font-serif">均速</div>
              <div className="text-gold-200 text-xs font-serif">{avgSpeed.toFixed(1)} 节</div>
            </div>
            <div>
              <div className="text-gold-500 text-[10px] font-serif">总货舱</div>
              <div className="text-gold-200 text-xs font-serif">{totalCapacity}</div>
            </div>
          </div>

          {/* 声望与船长特质：声望 ≥40 起港口交易享优惠 */}
          <div className="rounded p-2 bg-gold-700/10 border border-gold-600/25 space-y-1">
            <div className="flex items-center justify-between text-xs font-serif">
              <span className="text-gold-500 flex items-center gap-1"><Star size={11} /> 声望</span>
              <span className="text-gold-300">
                {fleet.fame}
                {fleet.fame >= 100 ? '（交易优惠 10%）' : fleet.fame >= 40 ? '（交易优惠 5%）' : '（≥40 起享交易优惠）'}
              </span>
            </div>
            {fleetTrait && (
              <div className="flex items-center justify-between text-xs font-serif">
                <span className="text-gold-500 flex items-center gap-1">
                  <Badge kind="trait" id={fleetTrait.id} fallback={fleetTrait.icon} size={15} />
                  天赋
                </span>
                <span className="text-gold-300">{fleetTrait.name} · {fleetTrait.effect}</span>
              </div>
            )}
            {captainTitle && (
              <div className="flex items-center justify-between text-xs font-serif">
                <span className="text-gold-500 flex items-center gap-1">🏷️ 海上人称</span>
                <span className="text-gold-300">{captainTitle.name} · {captainTitle.effect}</span>
              </div>
            )}
          </div>

          {/* 派系态度：世界上有人记得你做过什么 */}
          <div className="rounded p-2 bg-ocean-800/40 border border-gold-700/20 space-y-1">
            <div className="flex items-center justify-between text-xs font-serif">
              <span className="text-gold-500">🌐 四方态度</span>
              <span className="text-gold-600 text-[10px]">同一行为，两副面孔</span>
            </div>
            {FACTIONS.map(f => {
              const rep = factionRep[f.id] ?? 0
              const att = factionAttitude(rep)
              return (
                <div key={f.id} className="flex items-center justify-between text-xs font-serif">
                  <span className="text-gold-400 flex items-center gap-1.5">
                    <Badge kind="faction" id={f.id} fallback={f.icon} size={15} />
                    {f.name}
                  </span>
                  <span className={`flex items-center gap-1 ${
                    att.tone === 'good' ? 'text-safe-400' : att.tone === 'bad' ? 'text-danger-400' : 'text-gold-500'
                  }`}>
                    <span aria-hidden>{'★'.repeat(att.level)}{'☆'.repeat(Math.max(0, 3 - att.level + 1))}</span>
                    {att.label} <span className="font-mono text-[10px]">({rep > 0 ? '+' : ''}{rep})</span>
                  </span>
                </div>
              )
            })}
          </div>

          {/* 军官栏：按日支薪的团队成员 */}
          {officers.length > 0 && (
            <div className="rounded p-2 bg-ocean-800/40 border border-gold-700/20 space-y-1">
              <div className="flex items-center justify-between text-xs font-serif">
                <span className="text-gold-500">🎖️ 军官团</span>
                <span className="text-gold-600">日薪合计 {totalWage} 金币</span>
              </div>
              {officers.map(id => {
                const o = OFFICER_MAP.get(id)
                if (!o) return null
                return (
                  <div key={id} className="flex items-center justify-between text-xs font-serif">
                    <span className="text-gold-300">{o.icon} {o.name}</span>
                    <span className="text-gold-500 text-[10px]">{o.effect}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* 名船员栏：有名字、有忠诚、会离船也会死的人 */}
          {crewRoster.length > 0 && (
            <div className="rounded p-2 bg-ocean-800/40 border border-gold-700/20 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-serif">
                <span className="text-gold-500 flex items-center gap-1"><Users size={11} /> 船上的人</span>
                <span className="text-gold-600 text-[10px]">忠诚低会离船</span>
              </div>
              {crewRoster.map(m => {
                const def = CREW_CHAR_MAP.get(m.id)
                if (!def) return null
                const portrait = crewPortrait(m.id)
                return (
                  <div key={m.id} className="text-xs font-serif">
                    <div className="flex items-center justify-between">
                      <span className="text-gold-300 flex items-center gap-1.5">
                        {portrait && (
                          <img
                            src={portrait}
                            alt=""
                            aria-hidden="true"
                            className="w-7 h-10 object-cover object-top rounded border border-gold-700/30 shrink-0"
                            onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                          />
                        )}
                        {def.icon} {def.name} <span className="text-gold-600">· {def.title}</span>
                      </span>
                      <span className={`text-[10px] ${
                        m.loyalty <= 25 ? 'text-danger-400' : m.loyalty < 50 ? 'text-gold-400' : 'text-safe-400'
                      }`}>
                        忠诚 {m.loyalty}
                      </span>
                    </div>
                    <div className="h-1 bg-ocean-700 rounded-full mt-0.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${m.loyalty <= 25 ? 'bg-danger-500' : m.loyalty < 50 ? 'bg-gold-500' : 'bg-safe-500'}`}
                        style={{ width: `${m.loyalty}%` }}
                      />
                    </div>
                    <p className="text-gold-600 text-[10px] mt-0.5">{def.perk}</p>
                  </div>
                )
              })}
            </div>
          )}

          <div className="space-y-1.5">
            {/* 阈值的两处细节：
                食物/淡水用「可撑天数」判定（见 voyage.supplyLevel），
                但条的填充仍按 200 份算——若把天数折成百分比，
                就会出现「条才一半、却已经标红」的错位。
                士气则必须用游戏的绝对线 45/60，不能用百分比：
                沿用 30% 会让士气 38 显示成金色，而系统已按低士气处理。 */}
            <ResourceBar
              value={fleet.food}
              maxValue={200}
              label="食物"
              icon={<Utensils size={14} />}
              hint={supplyHint('food')}
              hintTone={supplyTone('food')}
            />
            <ResourceBar
              value={fleet.water}
              maxValue={200}
              label="淡水"
              icon={<Droplets size={14} />}
              hint={supplyHint('water')}
              hintTone={supplyTone('water')}
            />
            <ResourceBar
              value={fleet.morale}
              maxValue={100}
              label="士气"
              icon={<Heart size={14} />}
              warnBelow={60}
              criticalBelow={LOW_MORALE}
            />
            <div className="flex justify-between text-xs text-gold-500 px-0.5">
              <span>总船员</span>
              <span>{totalCrew}/{maxCrew}</span>
            </div>
          </div>

          <div className="border-t border-gold-700/30 pt-2 space-y-2">
            {fleet.ships.map(ship => {
              const isFlagship = ship.id === fleet.flagshipId
              return (
              <div key={ship.id} className={`rounded p-2 ${isFlagship ? 'bg-gold-700/15 border border-gold-600/30' : 'bg-ocean-800/40'}`}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gold-300 font-serif flex items-center gap-1.5">
                    <img
                      src={shipSprite(ship.type)}
                      alt=""
                      aria-hidden="true"
                      className="h-9 w-auto object-contain drop-shadow-md"
                      onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                    />
                    {isFlagship && <span title="旗舰" aria-label="旗舰">👑</span>}
                    {ship.name} <span className="text-gold-600 text-xs">{shipTypeNames[ship.type]}</span>
                  </span>
                  <button
                    onClick={() => setPreviewId(previewId === ship.id ? null : ship.id)}
                    className="text-gold-500 hover:text-gold-300 text-xs font-serif transition-colors"
                    aria-expanded={previewId === ship.id}
                  >
                    {previewId === ship.id ? '收起 3D' : '查看 3D'}
                  </button>
                </div>
                <ResourceBar value={ship.durability} maxValue={ship.maxDurability} label="耐久" icon={<Ship size={12} />} />
                <div className="flex justify-between items-center text-xs text-gold-500 mt-1">
                  <span>船员 {ship.crew}/{ship.maxCrew}</span>
                  <span>货舱 {ship.usedCapacity}/{ship.capacity}</span>
                  {isFlagship ? (
                    <span className="text-gold-400 text-[10px] font-serif">旗舰</span>
                  ) : (
                    <button
                      onClick={() => setFlagship(ship.id)}
                      className="text-gold-600 hover:text-gold-300 text-[10px] font-serif transition-colors"
                    >
                      设为旗舰
                    </button>
                  )}
                </div>
                {previewId === ship.id && (
                  <div className="mt-2 rounded overflow-hidden border border-gold-700/20 bg-ocean-900/60">
                    <Ship3DView type={ship.type} name={ship.name} />
                  </div>
                )}
              </div>
            )})}
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
