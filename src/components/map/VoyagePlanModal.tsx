import { useGameStore } from '@/store/useGameStore'
import { GAME_BALANCE } from '@/data/gameConfig'
import { calculateDailyConsumption, prevailingWindBearing, dailyDistanceNm } from '@/utils/navigation'
import { ports } from '@/data/ports'
import { shipSprite } from '@/data/shipSprites'
import { onUiCommand } from '@/utils/uiBus'
import { WEATHER_INFO, weatherForecast, weatherFavorFactor } from '@/utils/weather'
import { stanceLedgers } from '@/utils/segment'
import { useEffect } from 'react'

function dangerStars(level: number): string {
  return '★'.repeat(level) + '☆'.repeat(5 - level)
}

function windLabel(favor: number): { text: string; cls: string } {
  if (favor >= 1.15) return { text: `顺风 ×${favor.toFixed(2)}`, cls: 'text-safe-400' }
  if (favor <= 0.85) return { text: `逆风 ×${favor.toFixed(2)}`, cls: 'text-danger-400' }
  return { text: `侧风 ×${favor.toFixed(2)}`, cls: 'text-gold-400' }
}

/**
 * 出航计划：点击地图后先做计划再起航。
 *
 * 距离/危险/风向/补给充足性一目了然。
 * 这里**不再选航速**——速度与风险的唯一旋钮是「航段方针」，
 * 它在每个航段开始时选（见 SegmentDecision）。
 * 本面板改为展示**全程方针总账**：三种方针走完整条航线各要多少天、
 * 多少粮水、磨多少船、遇多少次事。
 * 玩家在起航前就能看见取舍，但选择留到真正面对该段海况时再做——
 * 那时候的选择才是有信息的决策，而不是盲选。
 */
export default function VoyagePlanModal() {
  const pendingVoyage = useGameStore(s => s.pendingVoyage)
  const fleet = useGameStore(s => s.fleet)
  const officers = useGameStore(s => s.officers)
  const routeIntel = useGameStore(s => s.routeIntel)
  const confirmDeparture = useGameStore(s => s.confirmDeparture)
  const cancelVoyage = useGameStore(s => s.cancelVoyage)
  const buyRouteIntel = useGameStore(s => s.buyRouteIntel)
  const weather = useGameStore(s => s.weather)
  const shipPos = useGameStore(s => s.shipPosition)
  const crewRoster = useGameStore(s => s.crewRoster)

  // 键盘通道：Enter 升起旗帜，Esc 再想想（见 hooks/useKeyboardControls）
  // 注意：钩子必须在提前 return 之前注册，避免 pendingVoyage 变化时钩子顺序变化
  useEffect(() => {
    const off = onUiCommand((cmd) => {
      if (cmd.type === 'voyage:confirm') confirmDeparture()
      else if (cmd.type === 'voyage:cancel') cancelVoyage()
    })
    return off
  }, [confirmDeparture, cancelVoyage])

  if (!pendingVoyage) return null

  const { waypoint, route } = pendingVoyage
  const fromPort = ports.find(p => p.id === route.fromPortId)
  const toPort = ports.find(p => p.id === route.toPortId)
  const destName = toPort?.nameCn ?? waypoint.name ?? '无名海域'
  const consumption = calculateDailyConsumption(fleet)
  const intel = routeIntel[`${route.fromPortId}-${route.toPortId}`]
  const wind = windLabel(route.windFavor)

  // 全程方针总账：三种方针各走完整条航线的账
  const cookRelief = crewRoster.some(m => m.id === 'cook') ? 0.8 : 1
  const weatherMul = WEATHER_INFO[weather.kind].sailMul * weatherFavorFactor(weather.kind)
  const baseNmPerDay = dailyDistanceNm(fleet, officers, route.windFavor, 1, weatherMul)
  // 遇事概率：全局闸门 0.25 × 天候偏置（不含方针倍率，那是方针自己加的）
  const dailyEventProb = 0.25 * WEATHER_INFO[weather.kind].eventBias
  const ledgers = stanceLedgers({
    distanceNm: route.distance,
    baseNmPerDay,
    dailyFood: consumption.food,
    dailyWater: consumption.water,
    cookRelief,
    dailyEventProb,
    durabilityCarry: fleet.durabilityCarry,
  })

  // 补给是否够：按最省的方针算（抢行最省粮），仍不够就是真的不够
  const cheapestFood = Math.min(...ledgers.map(l => l.food))
  const cheapestWater = Math.min(...ledgers.map(l => l.water))
  const foodOk = fleet.food >= cheapestFood
  const waterOk = fleet.water >= cheapestWater

  // 三日天气预报：起锚前的最后一眼（位置取出发地/船位）
  const forecast = (() => {
    const lat = shipPos?.[0] ?? fromPort?.latitude
    const lng = shipPos?.[1] ?? fromPort?.longitude
    if (lat == null || lng == null) return []
    return weatherForecast(weather, fleet.day, lat, lng, prevailingWindBearing(lat), 3)
  })()

  return (
    <div className="fixed inset-0 flex items-start justify-center bg-black/70 backdrop-blur-sm p-3 md:p-4 overflow-y-auto" style={{ zIndex: 80 }}>
      <div className="my-auto w-[26rem] max-w-[92vw] bg-ocean-900/95 border border-gold-700/40 rounded-lg shadow-2xl overflow-hidden animate-slide-in-right">
        {/* 标题 */}
        <div className="px-4 py-3 border-b border-gold-700/30 bg-ocean-800/50 flex items-center gap-3">
          <img
            src={shipSprite(fleet.ships.find(s => s.id === fleet.flagshipId)?.type || fleet.ships[0]?.type || 'galleon')}
            alt=""
            aria-hidden="true"
            className="h-10 w-auto object-contain drop-shadow-md shrink-0"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
          />
          <div>
            <h2 className="pirate-title text-lg text-gold-300">出航计划</h2>
            <p className="text-gold-500 font-serif text-xs mt-0.5">
              {fromPort?.nameCn ?? '当前海域'} → <span className="text-gold-200">{destName}</span>
            </p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* 航线摘要 */}
          <div className="grid grid-cols-3 gap-2 text-center bg-ocean-800/40 rounded p-2">
            <div>
              <div className="text-gold-500 text-[10px] font-serif">航程</div>
              <div className="text-gold-200 text-xs font-serif">{route.distance} 海里</div>
            </div>
            <div>
              <div className="text-gold-500 text-[10px] font-serif">危险</div>
              <div className="text-danger-400 text-xs font-serif">{dangerStars(route.dangerLevel)}</div>
            </div>
            <div>
              <div className="text-gold-500 text-[10px] font-serif">风向</div>
              <div className={`text-xs font-serif ${wind.cls}`}>{wind.text}</div>
            </div>
          </div>

          {/* 天候预报：未来三天的风——等一个顺风天再走，是环境线的决策 */}
          {forecast.length > 0 && (
            <div className="bg-ocean-800/40 border border-gold-700/20 rounded p-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-gold-300 font-serif text-xs">🌤️ 天候预报</span>
                <span className="text-gold-600 font-serif text-[10px]">天气持续 1-3 天后转变</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {forecast.map((w, i) => {
                  const fi = WEATHER_INFO[w.kind]
                  const mul = fi.sailMul
                  return (
                    <div key={i} className="text-center bg-ocean-900/40 rounded py-1.5">
                      <div className="text-gold-500 text-[10px] font-serif">第{fleet.day + i}天</div>
                      <div className="text-base leading-tight my-0.5">{fi.icon}</div>
                      <div className="text-gold-200 text-[11px] font-serif">{fi.label}</div>
                      <div className={`text-[10px] font-serif tabular-nums ${mul < 1 ? 'text-danger-400' : 'text-safe-400'}`}>
                        航速 ×{mul.toFixed(2)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 航线情报 */}
          <div className="bg-ocean-800/40 border border-gold-700/20 rounded p-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-gold-300 font-serif text-xs">🗺️ 航线情报</span>
              {!intel && (
                <button
                  onClick={buyRouteIntel}
                  disabled={fleet.gold < GAME_BALANCE.INTEL_COST}
                  className="text-xs font-serif text-gold-200 bg-gold-700/40 hover:bg-gold-600/50 disabled:opacity-40 px-2 py-0.5 rounded transition-colors"
                >
                  购买 · {GAME_BALANCE.INTEL_COST} 金币
                </button>
              )}
            </div>
            {intel ? (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-gold-500 text-[10px] font-serif">好天气</div>
                  <div className="text-safe-400 text-xs font-serif">{Math.round(intel.fairWeather * 100)}%</div>
                </div>
                <div>
                  <div className="text-gold-500 text-[10px] font-serif">海盗出没</div>
                  <div className="text-danger-400 text-xs font-serif">{Math.round(intel.pirateRisk * 100)}%</div>
                </div>
                <div>
                  <div className="text-gold-500 text-[10px] font-serif">风暴</div>
                  <div className="text-danger-400 text-xs font-serif">{Math.round(intel.stormRisk * 100)}%</div>
                </div>
              </div>
            ) : (
              <p className="text-gold-600 text-xs font-serif italic">
                未掌握这条航线的实况——好天气、匪踪与风暴都只能靠经验估。花钱可在港口买通老船长。
              </p>
            )}
          </div>

          {/* 全程方针总账：三种方针走完整条航线的账，一眼比出取舍 */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-gold-300 font-serif text-xs">⚓ 航段方针总账</span>
              <span className="text-gold-600 font-serif text-[10px]">每到航段起点再定</span>
            </div>
            <div className="space-y-1">
              {ledgers.map(l => {
                const s = l.stance
                const d = l.delta
                const badge = (n: number, unit: string, goodWhenNegative: boolean) => {
                  if (n === 0) return null
                  const good = goodWhenNegative ? n < 0 : n > 0
                  return (
                    <span className={`font-mono text-[10px] ${good ? 'text-safe-400' : 'text-danger-400'}`}>
                      {n > 0 ? '+' : ''}{n}{unit}
                    </span>
                  )
                }
                return (
                  <div key={s.id} className="p-2 rounded border border-gold-700/20 bg-ocean-800/30">
                    <div className="flex items-center justify-between">
                      <span className="font-serif text-xs text-gold-300">
                        {s.icon} {s.name}
                      </span>
                      <span className="text-gold-200 text-xs font-serif tabular-nums">
                        {l.days} 天
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 mt-1 text-[10px] font-mono tabular-nums text-gold-500">
                      <span>粮 {l.food}{badge(d.food, '', true)}</span>
                      <span>水 {l.water}{badge(d.water, '', true)}</span>
                      <span>损 {l.wear}{badge(d.wear, '', true)}</span>
                      <span>事 {l.events}{badge(d.events, '', true)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-gold-600 font-serif text-[10px] mt-1 leading-relaxed">
              没有免费的安全，也没有无代价的速度：抢行最省粮水但最伤船、最易遇事；谨慎最稳但最费粮水。
            </p>
          </div>

          {/* 补给评估：按最省的方针（抢行）算——仍不够就是真的不够 */}
          <div className={`rounded p-2.5 border ${foodOk && waterOk ? 'border-safe-700/30 bg-safe-900/10' : 'border-danger-700/40 bg-danger-900/15'}`}>
            <div className="flex items-center justify-between text-xs font-serif">
              <span className="text-gold-400">补给评估</span>
              <span className="text-gold-500">最快方针需 {cheapestFood} 粮 / {cheapestWater} 水</span>
            </div>
            <div className="flex items-center justify-between text-xs font-serif mt-1">
              <span className="text-gold-400">🍖 食物</span>
              <span className={foodOk ? 'text-safe-400' : 'text-danger-400'}>
                {cheapestFood} / {fleet.food}{!foodOk && '（不足，中途断粮！）'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-serif mt-0.5">
              <span className="text-gold-400">💧 淡水</span>
              <span className={waterOk ? 'text-safe-400' : 'text-danger-400'}>
                {cheapestWater} / {fleet.water}{!waterOk && '（不足，中途断水！）'}
              </span>
            </div>
          </div>
        </div>

        {/* 操作 */}
        <div className="px-4 py-3 border-t border-gold-700/30 bg-ocean-800/50 flex gap-2">
          <button
            onClick={cancelVoyage}
            className="flex-1 py-2 text-xs font-serif text-gold-400 bg-ocean-700/50 hover:bg-ocean-600/60 border border-gold-700/20 rounded transition-colors"
          >
            再想想
          </button>
          <button
            onClick={confirmDeparture}
            className="flex-1 py-2 text-xs font-serif text-gold-100 bg-gold-700/70 hover:bg-gold-600/80 rounded transition-colors"
          >
            🏴 升起旗帜，出航！
          </button>
        </div>
      </div>
    </div>
  )
}
