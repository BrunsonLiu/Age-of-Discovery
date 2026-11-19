import { useState } from 'react'
import { Ship, Utensils, Droplets, Heart, Anchor, Wind, Skull, Map, ChevronRight, Star, Users, Sailboat, Tag, Globe, Award, Crown } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { routes } from '@/data/routes'
import { ports } from '@/data/ports'
import { getTrait } from '@/data/traits'
import { OFFICER_MAP } from '@/data/officers'
import { CREW_CHAR_MAP } from '@/data/crewChars'
import ScrollFade from '@/components/ui/ScrollFade'
import { crewPortrait } from '@/data/portraits'
import { FACTIONS, factionAttitude, nextPerk } from '@/data/factions'
import { currentTitle } from '@/data/titles'
import { shipSprite } from '@/data/shipSprites'
import { dailyDistanceNm, daysForDistance, effectiveFleetSpeed } from '@/utils/navigation'
import { STANCES } from '@/utils/segment'
import { WEATHER_INFO, weatherFavorFactor } from '@/utils/weather'
import { LOW_MORALE, dailyRates, daysToDestination, formatSupplyDays, supplyDaysRemaining, supplyLevel } from '@/utils/voyage'
import FullScreenPanel from '@/components/ui/FullScreenPanel'
import { DOCK_TABS } from '@/components/ui/dockTabs'
import ResourceBar from '@/components/ui/ResourceBar'
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
  const rates = dailyRates(fleet, stance)
  const voyageNeedDays = currentRoute
    ? daysToDestination({
        routeDistanceNm: currentRoute.distance,
        progress: routeProgress,
        fleet,
        officers,
        windFavor: currentRoute.windFavor,
        phenomenonFactor: currentRoute.phenomenonFactor,
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
    /*
     * 出航后合上面板。
     *
     * 点了「再点一次，扬帆出航」之后，玩家要看的是船从港口出发 ——
     * 而面板正好盖住那片海（320px 宽的右侧/左侧板）。实测：
     * 出航后 isSailing=true 但 activePanel 仍是 'fleet'，
     * 玩家第一眼看到的是一张没变化的面板，要自己想起来去关掉它。
     */
    setActivePanel(null)
  }

  return (
    <FullScreenPanel
      testId="fleet-panel"
      width="wide"
      tabs={DOCK_TABS}
      activeTab="fleet"
      onTab={setActivePanel}
      title="舰队状态"
      subtitle={`${fleet.name} · 第 ${fleet.day} 天 · ${fleet.ships.length} 艘`}
      /*
       * 【脚注只能写"这一屏做得到的事"】
       * 原来写的是「点地图上的港口立航线；点海面任意位置就是目的地」——
       * 可整屏面板把这屏盖住了整片海图，玩家照着做会发现哪里都点不动。
       * 这一屏真正能做的是：选中一条推荐航线、再点一次出航。
       * 自己挑目的地要合上这屏 —— 那就把"合上这屏"写出来。
       */
      footer="点推荐航线两下就出航；自己挑目的地，合上这屏再点地图"
      onClose={() => setActivePanel(null)}
    >
        <div className="space-y-3">
          {/*
            【四格仪表条】原来这里是"舰队名 + 金币"一行，紧跟一块三格总览
            （船只/均速/总货舱）—— 舰队名在顶栏副标题里已经有了，重复一遍
            只是多占一行；金币则被缩成 13px 挂在右边。四格等分之后，
            "这条船队现在什么状态"四个数字在第一眼就能读完。
          */}
          <div className="grid grid-cols-4 rounded-sm border border-gold-700/25 bg-black/25 overflow-hidden
            divide-x divide-gold-700/25">
            <div className="px-3 py-2.5 min-w-0">
              <div className="text-[12px] tracking-[0.1em] text-gold-600 font-serif">金币</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-gold-200 text-[17px] md:text-[20px] font-serif tabular-nums leading-none">{fleet.gold}</span>
                {/*
                  【后缀单位只能是字，不能是图标】
                  这里原来是一枚 11px 金币图标。它在 20px 数字后面读作 "500 ％"
                  —— 和贸易账本里那枚被读成 "‰" 的是同一个病。
                  这一行另外两格写的是「1 艘」「8.0 节」，单位都是字；
                  金币这一格改成「金」，四格才是同一套写法。
                */}
                <span className="text-gold-500 text-[12px] font-serif">金</span>
              </div>
            </div>
            <div className="px-3 py-2.5 min-w-0">
              <div className="text-[12px] tracking-[0.1em] text-gold-600 font-serif">船只</div>
              <div className="mt-0.5">
                <span className="text-gold-200 text-[17px] md:text-[20px] font-serif tabular-nums leading-none">{fleet.ships.length}</span>
                <span className="text-gold-500 text-[12px] font-serif ml-1">艘</span>
              </div>
            </div>
            <div className="px-3 py-2.5 min-w-0">
              <div className="text-[12px] tracking-[0.1em] text-gold-600 font-serif">均速</div>
              <div className="mt-0.5">
                <span className="text-gold-200 text-[17px] md:text-[20px] font-serif tabular-nums leading-none">{avgSpeed.toFixed(1)}</span>
                <span className="text-gold-500 text-[12px] font-serif ml-1">节</span>
              </div>
            </div>
            <div className="px-3 py-2.5 min-w-0">
              <div className="text-[12px] tracking-[0.1em] text-gold-600 font-serif">总货舱</div>
              <div className="mt-0.5">
                <span className="text-gold-200 text-[17px] md:text-[20px] font-serif tabular-nums leading-none">{totalCapacity}</span>
              </div>
            </div>
          </div>

          {/*
            【容器只留两种：段落 / 清单】
            这一屏原来有五种容器：无底、淡金底+边、凹陷 inlay、仅有边框、
            以及"什么容器都没有"。同层级的东西五种长相，分组就全靠猜。
            现在只允许两种：
              · **段落** = `border-t` + 标题（声望、补给、船只、四方态度、航线）
              · **清单** = `inlay` 凹陷底（军官团、船上的人：它们是"一条条记录"，
                需要一个面把它们括起来）
            只有"旗舰"那张船卡额外用淡金底 —— 那是这一屏唯一需要被挑出来的实体。
          */}
          {/* 声望与船长特质：声望 ≥40 起港口交易享优惠 */}
          <div className="border-t border-gold-700/60 pt-3 space-y-1.5">
            {/*
              每一条分隔线都要有归属。原来"声望 / 天赋 / 海上人称"三行直接挂在
              四格条下面，没有标题也没有分隔线（那一格是 25% 透明度的线，
              截图里根本看不见）—— 玩家读到的是一条连续的清单，看不出换组了。
              现在段落 = 分隔线 + 标题 + 内容，三条线各自有名字。
            */}
            <h4 className="text-gold-600 font-serif text-[12px] tracking-[0.16em] flex items-center gap-1">
              <Star size={11} aria-hidden="true" />船长
            </h4>
            <div className="flex items-center justify-between text-[13px] font-serif">
              <span className="text-gold-500 flex items-center gap-1"><Star size={11} /> 声望</span>
              <span className="text-gold-300">
                {fleet.fame}
                {fleet.fame >= 100 ? '（交易优惠 10%）' : fleet.fame >= 40 ? '（交易优惠 5%）' : '（≥40 起享交易优惠）'}
              </span>
            </div>
            {fleetTrait && (
              <div className="flex items-center justify-between text-[13px] font-serif">
                <span className="text-gold-500 flex items-center gap-1">
                  <Badge kind="trait" id={fleetTrait.id} fallback={fleetTrait.icon} size={15} />
                  天赋
                </span>
                <span className="text-gold-300">{fleetTrait.name} · {fleetTrait.effect}</span>
              </div>
            )}
            {captainTitle && (
              <div className="flex items-center justify-between text-[13px] font-serif">
                <span className="text-gold-500 flex items-center gap-1"><Tag size={11} aria-hidden="true" />海上人称</span>
                <span className="text-gold-300">{captainTitle.name} · {captainTitle.effect}</span>
              </div>
            )}
          </div>


          {/* 军官栏：按日支薪的团队成员 */}
          {officers.length > 0 && (
            <div className="rounded p-2 inlay border border-gold-700/20 space-y-1">
              <div className="flex items-center justify-between text-[13px] font-serif">
                <span className="flex items-center gap-1 text-gold-500"><Award size={11} aria-hidden="true" />军官团</span>
                <span className="text-gold-400">日薪合计 {totalWage} 金</span>
              </div>
              {officers.map(id => {
                const o = OFFICER_MAP.get(id)
                if (!o) return null
                return (
                  <div key={id} className="flex items-center justify-between text-[13px] font-serif">
                    <span className="flex items-center gap-1 text-gold-300"><o.icon size={11} aria-hidden="true" />{o.name}</span>
                    <span className="text-gold-500 text-xs">{o.effect}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* 名船员栏：有名字、有忠诚、会离船也会死的人 */}
          {crewRoster.length > 0 && (
            <div className="rounded p-2 inlay border border-gold-700/20 space-y-1.5">
              <div className="flex items-center justify-between text-[13px] font-serif">
                <span className="text-gold-500 flex items-center gap-1"><Users size={11} /> 船上的人</span>
                <span className="text-gold-400 text-xs">忠诚低会离船</span>
              </div>
              {crewRoster.map(m => {
                const def = CREW_CHAR_MAP.get(m.id)
                if (!def) return null
                const portrait = crewPortrait(m.id)
                return (
                  <div key={m.id} className="text-[13px] font-serif">
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
                        <def.icon size={11} className="inline -mt-0.5 mr-1" aria-hidden="true" />
                        {def.name} <span className="text-gold-400">· {def.title}</span>
                      </span>
                      <span className={`text-xs ${
                        m.loyalty <= 25 ? 'text-danger-400' : m.loyalty < 50 ? 'text-gold-400' : 'text-safe-400'
                      }`}>
                        忠诚 {m.loyalty}
                      </span>
                    </div>
                    <div className="h-1 bg-black/30 rounded-full mt-0.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${m.loyalty <= 25 ? 'bg-danger-500' : m.loyalty < 50 ? 'bg-gold-500' : 'bg-safe-500'}`}
                        style={{ width: `${m.loyalty}%` }}
                      />
                    </div>
                    <p className="text-gold-400 text-xs mt-0.5">{def.perk}</p>
                  </div>
                )
              })}
            </div>
          )}

          <div className="border-t border-gold-700/60 pt-3 space-y-1.5">
            <h4 className="text-gold-600 font-serif text-[12px] tracking-[0.16em] flex items-center gap-1">
              <Heart size={11} aria-hidden="true" />船况
            </h4>
            {/* 阈值的两处细节：
                食物/淡水用「可撑天数」判定（见 voyage.supplyLevel），
                但条的填充仍按 200 份算——若把天数折成百分比，
                就会出现「条才一半、却已经标红」的错位。
                士气则必须用游戏的绝对线 45/60，不能用百分比：
                沿用 30% 会让士气 38 显示成金色，而系统已按低士气处理。

                【颜色也必须跟着天数走，否则同一行里两种说法打架】
                2026-11-18 实测：食物 100/200（=50%，被 60% 的默认阈值判成
                `warn`）条是金色，可右边那句提示写的是「可撑 30+ 天」。
                危险与否在这里由"还能撑几天 vs 这趟要走几天"决定，
                不由"还剩几成"决定 —— 所以用 `tone={supplyTone(...)}`
                把判定权交给同一个函数：条的颜色与它右边的字永远说同一件事。
                反过来更危险的那个方向也一并堵住：粮水 65% 但差 27 天时，
                条会跟着变红，而不是绿着骗人。 */}
            <ResourceBar
              value={fleet.food}
              maxValue={200}
              label="食物"
              icon={<Utensils size={14} />}
              hint={supplyHint('food')}
              hintTone={supplyTone('food')}
              tone={supplyTone('food')}
            />
            <ResourceBar
              value={fleet.water}
              maxValue={200}
              label="淡水"
              icon={<Droplets size={14} />}
              hint={supplyHint('water')}
              hintTone={supplyTone('water')}
              tone={supplyTone('water')}
            />
            <ResourceBar
              value={fleet.morale}
              maxValue={100}
              label="士气"
              icon={<Heart size={14} />}
              warnBelow={60}
              criticalBelow={LOW_MORALE}
            />
            {/*
              总船员也走同一条：原先它只有一行「总船员 20/20」的裸文字，
              和上面三条进度条不是一套东西，读起来像"还有一条没画完"。
              满员时条是全色，一样能一眼看出还剩多少位置。
            */}
            <ResourceBar
              value={totalCrew}
              maxValue={maxCrew}
              label="船员"
              icon={<Users size={14} />}
            />
          </div>

          <div className="border-t border-gold-700/60 pt-3 space-y-2">
            <h4 className="text-gold-600 font-serif text-[12px] tracking-[0.16em] flex items-center gap-1">
              <Ship size={11} aria-hidden="true" />船只
            </h4>
            {fleet.ships.map(ship => {
              const isFlagship = ship.id === fleet.flagshipId
              return (
              <div key={ship.id} className={`rounded p-2 ${isFlagship ? 'bg-gold-700/15 border border-gold-600/30' : 'inlay'}`}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gold-300 font-serif flex items-center gap-1.5">
                    <img
                      src={shipSprite(ship.type)}
                      alt=""
                      aria-hidden="true"
                      className="h-9 w-auto object-contain drop-shadow-md"
                      onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                    />
                    {isFlagship && <span title="旗舰" aria-label="旗舰"><Crown size={10} className="text-gold-400" /></span>}
                    {ship.name} <span className="text-gold-400 text-[13px]">{shipTypeNames[ship.type]}</span>
                  </span>
                  <button
                    onClick={() => setPreviewId(previewId === ship.id ? null : ship.id)}
                    className="text-gold-500 hover:text-gold-300 text-[13px] font-serif transition-colors
                      underline decoration-dotted decoration-gold-700/70 underline-offset-4"
                    aria-expanded={previewId === ship.id}
                  >
                    {previewId === ship.id ? '收起 3D' : '查看 3D'}
                  </button>
                </div>
                <ResourceBar value={ship.durability} maxValue={ship.maxDurability} label="耐久" icon={<Ship size={12} />} />
                <div className="flex justify-between items-center text-[13px] text-gold-500 mt-1">
                  <span>船员 {ship.crew}/{ship.maxCrew}</span>
                  <span>货舱 {ship.usedCapacity}/{ship.capacity}</span>
                  {isFlagship ? (
                    <span className="text-gold-400 text-xs font-serif">旗舰</span>
                  ) : (
                    <button
                      onClick={() => setFlagship(ship.id)}
                      className="text-gold-400 hover:text-gold-300 text-xs font-serif transition-colors"
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

          {/* 派系态度：世界上有人记得你做过什么 */}
          <div className="border-t border-gold-700/60 pt-3 space-y-1">
            <div className="flex items-center justify-between">
              <h4 className="text-gold-600 font-serif text-[12px] tracking-[0.16em] flex items-center gap-1">
                <Globe size={11} aria-hidden="true" />四方态度
              </h4>
              <span className="text-gold-600 text-[12px] font-serif">同一行为，两副面孔</span>
            </div>
            {FACTIONS.map(f => {
              const rep = factionRep[f.id] ?? 0
              const att = factionAttitude(rep)
              /*
               * 声望涨了能换到什么 —— 原来只显示星级与数字，玩家知道"友善"，
               * 却不知道友善有什么用：factions.ts 里写好的三档特权一条都没进界面，
               * nextPerk() 这个 helper 写完就一直没人调用（死代码）。
               *
               * 只显示**真的实现了的**那几条（perks 里只剩实装的，设计稿在注释里）。
               * 已达成 → 打勾；还没到 → 写清还差几点。这条信息对玩家永远有用，
               * 也不需要点击展开：声望是长期线，玩家不会天天点开看。
               */
              const next = nextPerk(f, rep)
              const owned = [...f.perks].reverse().find(pk => rep >= pk.at)
              return (
                <div key={f.id} className="text-[13px] font-serif pt-1 first:pt-0">
                  <div className="flex items-center justify-between">
                    <span className="text-gold-400 flex items-center gap-1.5">
                      <Badge kind="faction" id={f.id} fallback={f.icon} size={15} />
                      {f.name}
                    </span>
                    <span className={`flex items-center gap-1 ${
                      att.tone === 'good' ? 'text-safe-400' : att.tone === 'bad' ? 'text-danger-400' : 'text-gold-500'
                    }`}>
                      <span aria-hidden>{'★'.repeat(att.level)}{'☆'.repeat(Math.max(0, 3 - att.level + 1))}</span>
                      {att.label} <span className="font-mono text-xs">({rep > 0 ? '+' : ''}{rep})</span>
                    </span>
                  </div>
                  {/* 已生效的档位与下一档**都要显示**：只写"再 +5 点 → 3%"会让已是 30 档的玩家
                      以为现在没有任何优惠。两行都是短的，320px 面板放得下。 */}
                  {owned && (
                    <div className="text-safe-400/85 text-xs leading-snug pl-[21px] mt-0.5" data-testid={`faction-owned-${f.id}`}>
                      ✓ {owned.text}
                    </div>
                  )}
                  {next && (
                    <div className="text-gold-600 text-xs leading-snug pl-[21px] mt-0.5" data-testid={`faction-next-${f.id}`}>
                      再 +{Math.ceil(next.at - rep)} 点 → {next.text}
                    </div>
                  )}
                  {/*
                    「被记恨」状态：`factions.ts` 里那四条 `hostility` 从写下起
                    就没进过界面（死数据）。可玩家**能感觉到代价**却找不到原因 ——
                    声望掉下去、自家港口折扣突然没了、学者公会情报不再半价。
                    不写清"为什么"，那看起来就像 bug。

                    判据绑在 `factionAttitude` 的分级上（tone === 'bad'，即 rep < -30），
                    不写死数字：分级表是"冷淡/敌对"的唯一来源，写 `rep < 0` 会与
                    帮助面板的「≤-30」打架（第一版就是这么错的）。
                  */}
                  {att.tone === 'bad' && f.hostility && (
                    <div className="text-danger-200 text-xs leading-snug pl-[21px] mt-0.5" data-testid={`faction-hostility-${f.id}`}>
                      ⚠ {f.hostility}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {fleet.currentPortId && !currentRoute && (
            <div className="border-t border-gold-700/30 pt-2">
              {/*
                「点击地图上的港口或任意位置开始航行」两行提示原来横在
                四方态度和推荐航线之间，把一条操作说明插进了数据区。
                它现在在面板的脚注条里（见 FullScreenPanel 的 footer）。
              */}
              {availableRoutes.length > 0 && (
                <>
                  <h4 className="font-pirate text-gold-500 text-[13px] mb-1.5 flex items-center gap-1">
                    <Anchor size={12} /> 推荐航线
                  </h4>
                  <ScrollFade className="space-y-1.5 max-h-32 overflow-y-auto scroll-parchment">
                    {availableRoutes.map(route => {
                      const toPort = ports.find(p => p.id === route.toPortId)
                      /*
                       * 天数与"实际怎么走"用同一口径。
                       *
                       * 【原来这里是 calculateSailingDays(route, fleet)】
                       * 它内部只传了 route.windFavor —— **不含天候、不含方针**。
                       * 于是面板写"约 2 天"，而实际推进（store / SailingController）
                       * 用的是 `风向 × 方针航速 × 天候`：抢行天晴时实际只要 1 天多，
                       * 暴风雨谨慎时可能 4 天。玩家按面板备了 2 天的水，出海就断。
                       *
                       * 现在四项全给：风向、方针、天候。列表上的数字就是
                       * "此刻按当前方针出发要几天"。
                       */
                      const weatherMul = WEATHER_INFO[weather.kind].sailMul * weatherFavorFactor(weather.kind)
                      // 现象与风乘在同一条链上：少乘这一下，列表会写「顺风 2 天」，
                      // 而船要横穿无风带，实际走 3 天。
                      const nmPerDay = dailyDistanceNm(
                        fleet, officers,
                        route.windFavor * (route.phenomenonFactor ?? 1),
                        STANCES[stance].speedMul, weatherMul,
                      )
                      const days = daysForDistance(route.distance, nmPerDay)
                      const isSelected = selectedRouteId === route.id
                      return (
                        <button
                          key={route.id}
                          /*
                           * 两次点击：第一次选中、第二次出航。
                           *
                           * 【为什么不是"点一下就出航"】出航是不可逆的高代价动作
                           * （粮食、耐久、可能全损），误触一次代价太大。
                           * 【为什么不是"只选中、再去下面找确认按钮"】那正是原设计，
                           * 用户反馈"点了没反应"—— 选中只改了背景色一档，
                           * 而变化最该发生的地方（确认按钮）在列表下方、可能还要滚动。
                           * 现在选中后这一条自己变成"再点一次出航"，下一步就在指尖下面。
                           */
                          onClick={() => {
                            if (isSelected) handleConfirmRoute()
                            else setSelectedRouteId(route.id)
                          }}
                          className={`relative w-full text-left rounded p-1.5 pl-2.5 text-[13px] transition-all ${
                            isSelected
                              ? 'bg-gold-700/40 border border-gold-500/70'
                              : 'inlay--flat border border-transparent hover:border-gold-700/30'
                          }`}
                        >
                          {/*
                            选中标记用**左侧竖金条**而不是只靠背景深浅：
                            深褐底上 `bg-gold-700/30` 与凹槽只差几个色阶，实测看着一样。
                            竖条在列表里是线性信号，扫一眼就知道选的是哪条。
                          */}
                          {isSelected && (
                            <span
                              aria-hidden="true"
                              className="absolute left-0 top-0 bottom-0 w-[2px] rounded-l"
                              style={{
                                background:
                                  'linear-gradient(180deg, rgba(229,195,92,0) 0%, rgba(229,195,92,0.95) 25%, rgba(229,195,92,0.95) 75%, rgba(229,195,92,0) 100%)',
                              }}
                            />
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-gold-200 font-serif flex items-center gap-1">
                              <Map size={11} /> {toPort?.nameCn}
                            </span>
                            <span className={`text-[13px] ${
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
                          {isSelected && (
                            <div className="mt-1 flex items-center justify-end gap-1 text-[12px] font-serif text-gold-200">
                              再点一次，扬帆出航
                              <ChevronRight size={12} aria-hidden="true" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </ScrollFade>
                  {/*
                    原来这里有一个「确认出航」按钮，只在选中航线后出现。
                    现在选中项自己就是确认入口（再点一次），这个按钮只会让
                    同一个动作出现两遍 —— 而"屏幕上多一个不用点的按钮"
                    正是这轮要清理的东西。已删除。
                  */}
                </>
              )}
            </div>
          )}

          {currentRoute && (
            <div className="border-t border-gold-700/30 pt-2">
              <div className="flex items-center justify-center gap-1.5 text-gold-400 font-serif text-sm">
                <Sailboat size={13} aria-hidden="true" />
                航行中... {Math.round(routeProgress * 100)}%
              </div>
              <div className="h-1.5 bg-black/30 rounded-full mt-1 overflow-hidden">
                <div className="h-full bg-gold-500 rounded-full transition-all duration-500" style={{ width: `${routeProgress * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </FullScreenPanel>
  )
}
