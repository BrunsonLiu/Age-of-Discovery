import { Anchor, Wrench, Package, Users, Coins, Shield, Heart, Ship, Map, Compass } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports } from '@/data/ports'
import { tasks } from '@/data/tasks'
import { GAME_BALANCE } from '@/data/gameConfig'
import { OFFICERS } from '@/data/officers'
import { CREW_CHARS } from '@/data/crewChars'
import { officerPortrait, crewPortrait } from '@/data/portraits'
import { portImage } from '@/data/portImages'
import { FACTIONS, portFaction, factionAttitude } from '@/data/factions'
import Badge from '@/components/ui/Badge'
import { UI_ASSETS } from '@/data/uiAssets'
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
  shipyard: <Ship size={14} />,
}

const serviceNames: Record<string, string> = {
  repair: '修理', supply: '补给', recruit: '招募', trade: '贸易', shipyard: '造船厂',
}

export default function PortDetail() {
  const fleet = useGameStore(s => s.fleet)
  const selectedPortId = useMapStore(s => s.selectedPortId)
  const setActivePanel = useGameStore(s => s.setActivePanel)
  const repairShip = useGameStore(s => s.repairShip)
  const supplyFleet = useGameStore(s => s.supplyFleet)
  const recruitCrew = useGameStore(s => s.recruitCrew)
  const activeTasks = useGameStore(s => s.activeTasks)
  const completedTasks = useGameStore(s => s.completedTasks)
  const acceptTask = useGameStore(s => s.acceptTask)
  const restAtPort = useGameStore(s => s.restAtPort)
  const holdFeast = useGameStore(s => s.holdFeast)
  const officers = useGameStore(s => s.officers)
  const recruitOfficer = useGameStore(s => s.recruitOfficer)
  const crewRoster = useGameStore(s => s.crewRoster)
  const recruitCrewMember = useGameStore(s => s.recruitCrewMember)
  const factionRep = useGameStore(s => s.factionRep)

  const portId = fleet.currentPortId || selectedPortId
  const port = ports.find(p => p.id === portId)

  if (!port) return null

  const isAtPort = fleet.currentPortId === port.id
  const portImg = portImage(port)
  const portTasks = tasks.filter(t => {
    if (t.portId !== port.id || t.status !== 'available') return false
    if (activeTasks.some(at => at.id === t.id)) return false
    if (completedTasks.includes(t.id)) return false
    if (t.minDay !== undefined && fleet.day < t.minDay) return false
    return true
  })

  const handleRepair = (shipId: number) => {
    const ship = fleet.ships.find(s => s.id === shipId)
    if (!ship) return
    const cost = (ship.maxDurability - ship.durability) * GAME_BALANCE.REPAIR_COST_PER_DURABILITY
    if (fleet.gold < cost) return
    repairShip(shipId)
  }

  const handleSupply = () => {
    if (fleet.gold < GAME_BALANCE.SUPPLY_TOTAL_COST) return
    supplyFleet()
  }

  const handleRest = () => {
    restAtPort()
  }

  const handleFeast = () => {
    holdFeast()
  }

  const RECRUIT_COST = GAME_BALANCE.DEFAULT_RECRUIT_COUNT * GAME_BALANCE.CREW_COST_PER_PERSON

  const handleRecruit = (shipId: number) => {
    if (fleet.gold < RECRUIT_COST) return
    recruitCrew(shipId, GAME_BALANCE.DEFAULT_RECRUIT_COUNT)
  }

  return (
    <div className="w-full md:w-80 animate-slide-in-right">
      <ParchmentCard title={port.nameCn} onClose={() => setActivePanel(null)}>
        {/* 港口场景插图（C 组）：到港第一眼——按区域/建筑风格选图 */}
        {portImg && (
          <div className="relative -mx-1 mb-2 h-24 overflow-hidden rounded border border-gold-700/30">
            <img
              src={portImg}
              alt=""
              aria-hidden="true"
              className="w-full h-full object-cover object-center"
            />
            {/* 底部渐隐，融进卡片 */}
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
              style={{ background: 'linear-gradient(180deg, rgba(30,22,13,0) 0%, rgba(30,22,13,0.85) 100%)' }}
            />
          </div>
        )}
        {/* 三角旗串（F5）：港口张灯结彩 */}
        <img
          src={UI_ASSETS.pennants}
          alt=""
          aria-hidden="true"
          className="w-[82%] mx-auto h-auto block mb-2 drop-shadow"
        />
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-gold-400 font-serif text-sm">{port.name}</span>
            <span className="text-xs bg-ocean-700/60 text-gold-300 px-2 py-0.5 rounded font-serif">
              {regionNames[port.region] || port.region}
            </span>
          </div>

          <p className="text-gold-500 text-xs font-serif leading-relaxed">{port.description}</p>

          {/* 本港势力态度：第二条线的本地视角 */}
          {(() => {
            const fid = portFaction(port.id)
            const f = FACTIONS.find(x => x.id === fid)
            if (!f) return null
            const rep = factionRep[fid] ?? 0
            const att = factionAttitude(rep)
            return (
              <div className="flex items-center justify-between bg-ocean-800/40 border border-gold-700/20 rounded p-1.5 text-xs font-serif">
                <span className="text-gold-500 flex items-center gap-1.5">
                  <Badge kind="faction" id={fid} fallback={f.icon} size={15} />
                  本港由{f.name}话事
                </span>
                <span className={
                  att.tone === 'good' ? 'text-safe-400' : att.tone === 'bad' ? 'text-danger-400' : 'text-gold-500'
                }>
                  {att.label}（{rep > 0 ? '+' : ''}{rep}）
                </span>
              </div>
            )
          })()}

          {!isAtPort && (
            <div className="flex items-center gap-1.5 bg-ocean-800/40 border border-gold-700/20 rounded p-2 text-xs text-gold-400 font-serif">
              <Ship size={12} aria-hidden="true" className="shrink-0" />
              你当前不在此港，点击地图航行前往
            </div>
          )}

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
                      if (svc === 'shipyard') setActivePanel('shipyard')
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
                const cost = damage * GAME_BALANCE.REPAIR_COST_PER_DURABILITY
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
                <span className="text-gold-400 font-serif">食物+{GAME_BALANCE.SUPPLY_AMOUNT} 淡水+{GAME_BALANCE.SUPPLY_AMOUNT}</span>
                <ActionButton onClick={handleSupply} disabled={fleet.gold < GAME_BALANCE.SUPPLY_TOTAL_COST} variant="secondary">
                  <Coins size={10} /> {GAME_BALANCE.SUPPLY_TOTAL_COST}
                </ActionButton>
              </div>
            </div>
          )}

          {isAtPort && (
            <div className="border-t border-gold-700/30 pt-2">
              <h4 className="text-gold-300 font-serif text-xs mb-1.5 flex items-center gap-1">
                <Heart size={12} /> 港口休整
              </h4>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gold-400 font-serif">
                    休整一日：士气+{GAME_BALANCE.REST_MORALE}（耗食物{GAME_BALANCE.REST_FOOD}/淡水{GAME_BALANCE.REST_WATER}）
                  </span>
                  <ActionButton onClick={handleRest} variant="secondary">
                    休整
                  </ActionButton>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gold-400 font-serif">
                    甲板盛宴：士气+{GAME_BALANCE.FEAST_MORALE}、声望+{GAME_BALANCE.FEAST_FAME}
                  </span>
                  <ActionButton
                    onClick={handleFeast}
                    disabled={fleet.gold < GAME_BALANCE.FEAST_COST || fleet.food < GAME_BALANCE.FEAST_FOOD || fleet.water < GAME_BALANCE.FEAST_WATER}
                    variant="secondary"
                  >
                    <Coins size={10} /> {GAME_BALANCE.FEAST_COST}
                  </ActionButton>
                </div>
                <p className="text-gold-600 text-[10px] font-serif">士气低于 45 时，舰队可能爆发哗变——疲惫的船员比风暴更危险。</p>
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
                      +{GAME_BALANCE.DEFAULT_RECRUIT_COUNT}人 <Coins size={10} /> {RECRUIT_COST}
                    </ActionButton>
                  )}
                </div>
              ))}
            </div>
          )}

          {isAtPort && (
            <div className="border-t border-gold-700/30 pt-2">
              <h4 className="text-gold-300 font-serif text-xs mb-1.5 flex items-center gap-1">
                <Compass size={12} /> 酒馆·招募军官
              </h4>
              <p className="text-gold-600 text-[10px] font-serif mb-1.5">
                军官按日支薪——养团队是长期投资，也是长期开销。
              </p>
              <div className="space-y-1.5">
                {OFFICERS.map(o => {
                  const hired = officers.includes(o.id)
                  const portrait = officerPortrait(o.id)
                  return (
                    <div key={o.id} className="bg-ocean-800/30 rounded p-2 flex gap-2.5">
                      {portrait && (
                        <img
                          src={portrait}
                          alt=""
                          aria-hidden="true"
                          className="w-11 h-16 object-cover object-top rounded border border-gold-700/30 shrink-0"
                          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-gold-200 text-xs font-serif">
                            <o.icon size={11} className="inline -mt-0.5 mr-1" aria-hidden="true" />
                            {o.name} <span className="text-gold-600">· {o.title}</span>
                          </span>
                          {hired ? (
                            <span className="text-safe-400 text-xs font-serif">已在编</span>
                          ) : (
                            <ActionButton
                              onClick={() => recruitOfficer(o.id)}
                              disabled={fleet.gold < o.hireCost}
                              variant="secondary"
                            >
                              <Coins size={10} /> {o.hireCost}
                            </ActionButton>
                          )}
                        </div>
                        <p className="text-gold-500 text-[10px] font-serif">{o.effect}</p>
                        <p className="text-gold-600 text-[10px] font-serif">日薪 {o.dailyWage} 金币</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {isAtPort && (
            <div className="border-t border-gold-700/30 pt-2">
              <h4 className="text-gold-300 font-serif text-xs mb-1.5 flex items-center gap-1">
                <Users size={12} /> 码头·寻访名船员
              </h4>
              <p className="text-gold-600 text-[10px] font-serif mb-1.5">
                这些人有名字、有过去、有脾气。低士气会磨掉他们的忠诚——忠诚归零，人就会走。
              </p>
              <div className="space-y-1.5">
                {CREW_CHARS.map(c => {
                  const hired = crewRoster.some(m => m.id === c.id)
                  const portrait = crewPortrait(c.id)
                  return (
                    <div key={c.id} className="bg-ocean-800/30 rounded p-2 flex gap-2.5">
                      {portrait && (
                        <img
                          src={portrait}
                          alt=""
                          aria-hidden="true"
                          className="w-11 h-16 object-cover object-top rounded border border-gold-700/30 shrink-0"
                          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-gold-200 text-xs font-serif">
                            <c.icon size={11} className="inline -mt-0.5 mr-1" aria-hidden="true" />
                            {c.name} <span className="text-gold-600">· {c.title}</span>
                          </span>
                          {hired ? (
                            <span className="text-safe-400 text-xs font-serif">已在船</span>
                          ) : (
                            <ActionButton
                              onClick={() => recruitCrewMember(c.id)}
                              disabled={fleet.gold < c.hireCost}
                              variant="secondary"
                            >
                              <Coins size={10} /> {c.hireCost}
                            </ActionButton>
                          )}
                        </div>
                        <p className="text-gold-500 text-[10px] font-serif">{c.perk}</p>
                        <p className="text-gold-600 text-[10px] font-serif italic">“{c.quote}”</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {isAtPort && portTasks.length > 0 && (
            <div className="border-t border-gold-700/30 pt-2">
              <h4 className="text-gold-300 font-serif text-xs mb-1.5 flex items-center gap-1">
                <Heart size={12} /> 可接任务
              </h4>
              {portTasks.slice(0, 3).map(task => (
                <div key={task.id} className="bg-ocean-800/30 rounded p-1.5 mb-1">
                  <div className="flex items-center justify-between">
                    <span className="text-gold-200 text-xs font-serif">{task.title}</span>
                    <button
                      onClick={() => acceptTask(task.id)}
                      className="text-gold-400 hover:text-gold-300 text-xs font-serif transition-colors"
                    >
                      接受
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-gold-500 text-xs mt-0.5">
                    <span>奖励: <Coins size={10} className="inline" /> {task.reward.gold}{task.reward.fame ? ` +${task.reward.fame}声望` : ''}</span>
                    {task.targetPortId && (
                      <span className="flex items-center gap-0.5">
                        <Map size={9} /> {ports.find(p => p.id === task.targetPortId)?.nameCn}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ParchmentCard>
    </div>
  )
}
