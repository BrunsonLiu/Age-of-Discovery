import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { GAME_BALANCE } from '@/data/gameConfig'
import { calculateDailyConsumption, prevailingWindBearing, dailyDistanceNm } from '@/utils/navigation'
import { ports } from '@/data/ports'
import { shipSprite } from '@/data/shipSprites'
import { onUiCommand } from '@/utils/uiBus'
import { WEATHER_INFO, weatherForecast, weatherFavorFactor } from '@/utils/weather'
import { stanceLedgers } from '@/utils/segment'

function dangerStars(level: number): string {
  return '★'.repeat(level) + '☆'.repeat(5 - level)
}

function windLabel(favor: number): { text: string; cls: string } {
  if (favor >= 1.15) return { text: `顺风 ×${favor.toFixed(2)}`, cls: 'text-safe-400' }
  if (favor <= 0.85) return { text: `逆风 ×${favor.toFixed(2)}`, cls: 'text-danger-400' }
  return { text: `侧风 ×${favor.toFixed(2)}`, cls: 'text-gold-400' }
}

/**
 * 可折叠区块（默认收起）。
 *
 * 【为什么定义在模块顶层】若定义在 VoyagePlanModal 内部，
 * 每次父组件渲染都会创建一个新的组件类型，React 判定"组件换了"
 * → 卸载重建 → 展开状态立刻丢失，表现为"点了展开又自己合上"。
 *
 * 【收起时给一行摘要】折叠不等于藏起来。摘要让玩家不必展开
 * 就知道里面大概是什么（"晴 → 小雨 → 多云"），需要细节才点开。
 */
function Fold({
  title, summary, children, danger,
}: {
  title: string
  summary?: string
  children: React.ReactNode
  danger?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded border ${danger ? 'border-danger-700/40 bg-danger-900/10' : 'border-gold-700/20 bg-ocean-800/35'}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left press"
      >
        <span className={`font-serif text-[11px] shrink-0 ${danger ? 'text-danger-300' : 'text-gold-400'}`}>
          {title}
        </span>
        {!open && summary && (
          <span className="font-serif text-[10px] text-gold-600 truncate flex-1">{summary}</span>
        )}
        <span className="ml-auto font-serif text-[10px] text-gold-700 shrink-0">
          {open ? '收起 ▴' : '▾'}
        </span>
      </button>
      {open && <div className="px-2.5 pb-2.5 space-y-1.5">{children}</div>}
    </div>
  )
}

/**
 * 出航计划：点击地图后先做计划再起航。
 *
 * 【本面板的设计原则：先给结论，细节按需展开】
 *
 * 重构前这里摊开了全部数据：433 字 / 54 行 / 39 个数字，包括三天天气预报
 * （3 张卡 × 4 行）、航线情报说明、以及「三种方针走完整条航线的总账」
 * （3 行 × 4 个带正负号的数字）。
 *
 * 问题是玩家在这一步要回答的只有一件事：**我现在走，到得了吗？**
 * 其余都不是此刻的决策：
 * - 航段方针要到每段起点才选（面板自己也写着"每到航段起点再定"），
 *   在这里摊开三套账，玩家读完既不能用、也记不住；
 * - 三个方针在**每个维度上都是同序的**（抢行永远最省粮水、最伤船、最易遇事），
 *   摊开 5 个维度不增加信息量，只增加阅读量；
 * - 三天天气玩家此刻改不了，也不影响"走不走"——只影响"走多快"，那是下一步的事。
 *
 * 所以顶部直接给一句人话结论（够不够、几天），其余收进折叠。
 * 想深究的玩家仍然点得开——**折叠是把选择权还给玩家，不是砍掉信息**。
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

  // ---- 一句话结论 ----
  //
  // 【为什么要算这个】原先补给是否需要玩家自己比
  // 「最快方针需 12 粮 / 18 水」和「12 / 500」两组数字。
  // 那是一次心算，而玩家此刻只想得到一个"能走/不能走"。
  // 系统明明有全部数据，没理由让玩家自己除。
  const steadyDays = ledgers.find(l => l.stance.id === 'steady')?.days ?? 0
  const foodDays = consumption.food > 0 ? Math.floor(fleet.food / consumption.food) : 99
  const waterDays = consumption.water > 0 ? Math.floor(fleet.water / consumption.water) : 99

  const verdict = (() => {
    if (!foodOk || !waterOk) {
      const what = !foodOk && !waterOk ? '粮水都不够' : !foodOk ? '粮食不够' : '淡水不够'
      const shortDays = Math.min(foodDays, waterDays)
      return {
        tone: 'danger' as const,
        icon: '⚠',
        text: `${what}——只够 ${shortDays} 天，这趟最少要 ${steadyDays} 天`,
        sub: '回港补给，或改去更近的港口',
      }
    }
    // 够但余量不到 1.5 倍：不拦你，但提醒一句
    const tight = fleet.food < cheapestFood * 1.5 || fleet.water < cheapestWater * 1.5
    return {
      tone: tight ? 'gold' as const : 'safe' as const,
      icon: tight ? '△' : '✓',
      text: tight ? `补给偏紧 · 约 ${steadyDays} 天可达` : `补给充足 · 约 ${steadyDays} 天可达`,
      sub: tight ? '路上别耽搁；「抢行」能再省一些粮水' : '',
    }
  })()

  const verdictCls = verdict.tone === 'danger'
    ? 'border-danger-700/50 bg-danger-900/20 text-danger-200'
    : verdict.tone === 'gold'
      ? 'border-gold-600/45 bg-gold-900/15 text-gold-200'
      : 'border-safe-700/40 bg-safe-900/15 text-safe-200'

  // 预报摘要（收起时也给一行）
  const forecastSummary = forecast
    .map(w => `${WEATHER_INFO[w.kind].icon}${WEATHER_INFO[w.kind].label}`)
    .join(' · ')

  return (
    <div className="fixed inset-0 flex items-start justify-center bg-black/70 backdrop-blur-sm p-3 md:p-4 overflow-y-auto" style={{ zIndex: 80 }}>
      <div className="my-auto w-[24rem] max-w-[92vw] bg-ocean-900/95 border border-gold-700/40 rounded-lg shadow-2xl overflow-hidden animate-slide-in-right">
        {/* 标题 */}
        <div className="px-4 py-2.5 border-b border-gold-700/30 bg-ocean-800/50 flex items-center gap-3">
          <img
            src={shipSprite(fleet.ships.find(s => s.id === fleet.flagshipId)?.type || fleet.ships[0]?.type || 'galleon')}
            alt=""
            aria-hidden="true"
            className="h-9 w-auto object-contain drop-shadow-md shrink-0"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
          />
          <div className="min-w-0">
            <h2 className="pirate-title text-base text-gold-300">出航计划</h2>
            <p className="text-gold-500 font-serif text-[11px] mt-0.5 truncate">
              {fromPort?.nameCn ?? '当前海域'} → <span className="text-gold-200">{destName}</span>
            </p>
          </div>
        </div>

        <div className="p-3 space-y-2">
          {/* ① 结论：够不够、几天 —— 本面板唯一必须被读到的一行 */}
          <div className={`rounded border px-3 py-2 ${verdictCls}`}>
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm shrink-0">{verdict.icon}</span>
              <span className="font-serif text-[13px] leading-snug">{verdict.text}</span>
            </div>
            {verdict.sub && (
              <p className="font-serif text-[10px] mt-0.5 opacity-70">{verdict.sub}</p>
            )}
          </div>

          {/* ② 三个关键数字：航程 / 危险 / 风向 */}
          <div className="grid grid-cols-3 gap-2 text-center bg-ocean-800/40 rounded px-2 py-1.5">
            <div>
              <div className="text-gold-600 text-[10px] font-serif">航程</div>
              <div className="text-gold-200 text-xs font-serif tabular-nums">{route.distance} 海里</div>
            </div>
            <div>
              <div className="text-gold-600 text-[10px] font-serif">危险</div>
              <div className="text-danger-400 text-xs font-serif">{dangerStars(route.dangerLevel)}</div>
            </div>
            <div>
              <div className="text-gold-600 text-[10px] font-serif">风向</div>
              <div className={`text-xs font-serif ${wind.cls}`}>{wind.text}</div>
            </div>
          </div>

          {/* ③ 细节全部折叠：想深究才点开 */}
          {forecast.length > 0 && (
            <Fold title="🌤️ 未来几天天气" summary={forecastSummary}>
              <div className="grid grid-cols-3 gap-1.5">
                {forecast.map((w, i) => {
                  const fi = WEATHER_INFO[w.kind]
                  return (
                    <div key={i} className="text-center bg-ocean-900/40 rounded py-1">
                      <div className="text-gold-600 text-[10px] font-serif">第{fleet.day + i}天</div>
                      <div className="text-sm leading-tight my-0.5">{fi.icon}</div>
                      <div className="text-gold-200 text-[11px] font-serif">{fi.label}</div>
                      <div className={`text-[10px] font-serif tabular-nums ${fi.sailMul < 1 ? 'text-danger-400' : 'text-safe-400'}`}>
                        航速 ×{fi.sailMul.toFixed(2)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Fold>
          )}

          {/* 航线情报：只有 3 个数字，买之前只有一行——不需要折叠 */}
          <div className="bg-ocean-800/35 border border-gold-700/20 rounded px-2.5 py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-gold-400 font-serif text-[11px] shrink-0">🗺️ 航线情报</span>
              {intel ? (
                <span className="font-mono text-[10px] tabular-nums text-gold-600">
                  晴 <span className="text-safe-400">{Math.round(intel.fairWeather * 100)}%</span>
                  {' · '}匪 <span className="text-danger-400">{Math.round(intel.pirateRisk * 100)}%</span>
                  {' · '}风暴 <span className="text-danger-400">{Math.round(intel.stormRisk * 100)}%</span>
                </span>
              ) : (
                <>
                  <span className="font-serif text-[10px] text-gold-700 flex-1 truncate">未掌握</span>
                  <button
                    onClick={buyRouteIntel}
                    disabled={fleet.gold < GAME_BALANCE.INTEL_COST}
                    className="shrink-0 text-[10px] font-serif text-gold-200 bg-gold-700/40 hover:bg-gold-600/50 disabled:opacity-40 px-2 py-0.5 rounded transition-colors"
                  >
                    买通老船长 · {GAME_BALANCE.INTEL_COST} 金
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 方针总账：这一步不选它，但让想提前规划的玩家能看 */}
          <Fold title="⚓ 三种方针能差多少" summary="抢行最快最险 · 谨慎最慢最稳">
            <div className="space-y-1">
              {ledgers.map(l => {
                const s = l.stance
                const d = l.delta
                /**
                 * 差值标签。`goodWhenNegative` 区分方向：
                 * 粮/水/船损/遇事是**越少越好**（省下的就是赚的），
                 * 士气是**越多越好**。两者颜色必须相反，否则玩家读到的
                 * 是一个自相矛盾的界面。
                 */
                const deltaText = (n: number, goodWhenNegative = true) => {
                  if (n === 0) return <span className="text-gold-700">±0</span>
                  const good = goodWhenNegative ? n < 0 : n > 0
                  return (
                    <span className={good ? 'text-safe-400' : 'text-danger-400'}>
                      {n > 0 ? '+' : ''}{n}
                    </span>
                  )
                }
                return (
                  <div key={s.id} className="flex items-baseline gap-2 text-[10px] font-mono tabular-nums text-gold-500">
                    <span className="font-serif text-gold-300 w-14 shrink-0">{s.icon} {s.name}</span>
                    <span className="text-gold-200 w-10 shrink-0">{l.days} 天</span>
                    <span>粮{deltaText(d.food)}</span>
                    <span>损{deltaText(d.wear)}</span>
                    <span>事{deltaText(d.events)}</span>
                    <span>士气{deltaText(l.morale, false)}</span>
                  </div>
                )
              })}
            </div>
            <p className="font-serif text-[10px] text-gold-700 leading-relaxed">
              数字是与「按部就班」相比的差值。每到航段起点再选，这里只是提前看一眼。
            </p>
          </Fold>

          {/* 当前库存：一行，供对照 */}
          <div className="flex items-center justify-between text-[10px] font-serif text-gold-600 px-0.5">
            <span>
              船上：粮 <span className="text-gold-300 tabular-nums">{fleet.food}</span>
              {' · '}水 <span className="text-gold-300 tabular-nums">{fleet.water}</span>
              {' · '}士气 <span className="text-gold-300 tabular-nums">{fleet.morale}</span>
            </span>
            <span className="text-gold-700">每日耗 {consumption.food} 粮 / {consumption.water} 水</span>
          </div>
        </div>

        {/* 操作 */}
        <div className="px-3 py-2.5 border-t border-gold-700/30 bg-ocean-800/50 flex gap-2">
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
            🏴 出航
          </button>
        </div>
      </div>
    </div>
  )
}
