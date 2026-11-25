import { useEffect, useState } from 'react'
import { Anchor, CloudSun, Flag, Map as MapIcon } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { UI_ASSETS } from '@/data/uiAssets'
import { intelCost } from '@/utils/crewPerks'
import { calculateDailyConsumption, prevailingWindBearing, dailyDistanceNm } from '@/utils/navigation'
import { dailyRates, voyageDays } from '@/utils/voyage'
import { ports } from '@/data/ports'
import { pickVoyageMod } from '@/data/voyageModifiers'
import { departureWindows } from '@/utils/voyage'
import { shipSprite } from '@/data/shipSprites'
import { onUiCommand } from '@/utils/uiBus'
import { WEATHER_INFO, weatherForecast, weatherFavorFactor } from '@/utils/weather'
import { stanceLedgers } from '@/utils/segment'
import WeatherIcon from '@/components/ui/WeatherIcon'

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
 *
 * 【icon 与 title 分开传】标题文字里塞 emoji（🌤️ ⚓）在 Windows 上会被
 * Segoe UI Emoji 渲染成彩色，和整块铜木金边的配色打架；而 title 又是
 * 被单测按字符串断言的。所以图标走独立的 icon 槽，title 保持纯文字。
 */
function Fold({
  title, icon, summary, children, danger,
}: {
  title: string
  icon?: React.ReactNode
  summary?: string
  children: React.ReactNode
  danger?: boolean
}) {
  const [open, setOpen] = useState(false)
  /*
   * 【这三行要"看得出来能点"】未来几天天气 / 航线情报 / 三种方针 是同一类可展开的行，
   * 但原来底是 `bg-ocean-800/35`（冷蓝灰）压在同样深的弹窗底上 —— 1440 实际渲染下
   * 三行的细边几乎看不见（截图里只剩三行小字），读起来像三个段落标题，不像可点的行。
   * 改成与底栏开关板同一套"凹槽"配方：黑半透 + 细金边 + 上缘内投影。
   * 冷色只留给"海"，不给弹窗。
   */
  return (
    <div
      className={`rounded border ${danger ? 'border-danger-700/50 bg-danger-900/15' : 'border-gold-700/30'}`}
      style={danger ? undefined : {
        background: 'rgba(0,0,0,0.22)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left press"
      >
        <span className={`inline-flex items-center gap-1.5 font-serif text-xs shrink-0 ${danger ? 'text-danger-300' : 'text-gold-400'}`}>
          {icon}
          {title}
        </span>
        {/*
          【手机上不显示摘要】390 宽里「三种方针能差多少」+ 摘要 + ▾ 挤不下，
          摘要会被 `truncate` 截成「抢行最快最险 · 谨慎最…」—— 一句预告只读到一半，
          比不读更吵。摘要的作用是"点开前先看一眼"，手机上那一眼本来也读不全，
          所以窄屏只留标题与 ▾，展开后正文照旧完整。
        */}
        {!open && summary && (
          <span className="hidden sm:inline font-serif text-xs text-gold-600 truncate flex-1">{summary}</span>
        )}
        <span className="ml-auto font-serif text-xs text-gold-700 shrink-0">
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
  const stance = useGameStore(s => s.stance)
  /*
   * 情报价必须问一次"学者在不在、学者公会声望到没到"。
   * 原来这里直接印 GAME_BALANCE.INTEL_COST —— 学者在船时界面 80、实际扣 40，
   * 金币 40~79 还会被 disabled 挡住。价格只有 intelCost 一个来源。
   */
  const crewRoster = useGameStore(s => s.crewRoster)
  const factionRep = useGameStore(s => s.factionRep)
  const intelPrice = intelCost(crewRoster.some(m => m.id === 'scholar'), factionRep.scholars ?? 0)

  // 键盘通道：Enter 升起旗帜，Esc 再想想（见 hooks/useKeyboardControls）
  // 注意：钩子必须在提前 return 之前注册，避免 pendingVoyage 变化时钩子顺序变化
  useEffect(() => {
    const off = onUiCommand((cmd) => {
      if (cmd.type === 'voyage:confirm') confirmDeparture()
      else if (cmd.type === 'voyage:cancel') cancelVoyage()
    })
    return off
  }, [confirmDeparture, cancelVoyage])

  /**
   * 参观模式：不弹出航计划，直接起航。
   *
   * 「只想看看世界」的人每点一次海面就被问一次「选哪个方针、补给够不够」，
   * 是这套流程里最招人烦的一处——而且他来这里本来就不打算为补给操心
   * （参观模式不扣粮水、不判胜负）。方针用默认的「稳妥」，
   * 想细看的玩家仍然能点开局时的船长模式。
   *
   * 用 effect 而不是在 sailToWaypoint 里分流：store 的起航流程是共用的，
   * 在 UI 层"自动按确认键"等价于玩家自己点了一下，不动核心状态机。
   */
  useEffect(() => {
    if (!pendingVoyage) return
    if (useGameStore.getState().gameMode !== 'visitor') return
    confirmDeparture()
  }, [pendingVoyage, confirmDeparture])

  if (!pendingVoyage) return null

  const { waypoint, route } = pendingVoyage
  const fromPort = ports.find(p => p.id === route.fromPortId)
  const toPort = ports.find(p => p.id === route.toPortId)
  const destName = toPort?.nameCn ?? waypoint.name ?? '无名海域'
  const consumption = calculateDailyConsumption(fleet)
  const intel = routeIntel[`${route.fromPortId}-${route.toPortId}`]
  const wind = windLabel(route.windFavor)
  /*
   * R2：这一趟的"海况脾气"。与 advanceDay 里那次调用**同一条推导**（同一天同一段航线），
   * 所以面板说的和真跑起来的一致 —— 面板上不出现"可能会"这种模糊词。
   */
  const voyageMod = pickVoyageMod(fleet.day, route.fromPortId, route.toPortId)

  // 全程方针总账：三种方针各走完整条航线的账
  const weatherMul = WEATHER_INFO[weather.kind].sailMul * weatherFavorFactor(weather.kind)
  const baseNmPerDay = dailyDistanceNm(fleet, officers, route.windFavor, 1, weatherMul)
  // 遇事概率：全局闸门 0.25 × 天候偏置（不含方针倍率，那是方针自己加的）
  const dailyEventProb = 0.25 * WEATHER_INFO[weather.kind].eventBias
  const ledgers = stanceLedgers({
    distanceNm: route.distance,
    baseNmPerDay,
    dailyFood: consumption.food,
    dailyWater: consumption.water,
    dailyEventProb,
    durabilityCarry: fleet.durabilityCarry,
  })

  /**
   * 补给够不够：**按结论句里写的那个走法算**。
   *
   * 结论写的是「约 N 天可达」，N 是「按部就班」的天数；旧实现却拿
   * 三个方针里最省的（抢行）总消耗当判定线。实测：粮 15 / 水充足、
   * 6 天航程，抢行只要 15 粮但按部就班要 18 粮 —— 界面说「补给偏紧 ·
   * 约 6 天可达」，玩家照默认一路按部就班，第 5 天就断粮。
   * 判定与文案不同源，等于开了一张兑现不了的空头支票。
   *
   * 抢行仍够时另给一条可行动的路（明确写清总共要多少粮水），
   * 而不是笼统一句「回港补给」。
   */
  const steadyLedger = ledgers.find(l => l.stance.id === 'steady')!
  const rushLedger = ledgers.find(l => l.stance.id === 'rush')!
  const needFood = steadyLedger.food
  const needWater = steadyLedger.water
  const foodOk = fleet.food >= needFood
  const waterOk = fleet.water >= needWater
  const rushOk = fleet.food >= rushLedger.food && fleet.water >= rushLedger.water
  /**
   * 两套日耗都必须走 dailyRates（与顶栏、store.advanceDay 同源）。
   * 港内是「船员上岸自给」的 1/4 口径，起航后才按方针倍率扣。
   * 旧实现在这里直接写基础消耗 crew×0.1 / ×0.15：实测 30 人船
   * 面板写「每日耗 3 粮 / 5 水」，顶栏同一屏写「每天吃 1 份」，
   * 港内实际只扣 1 / 2 —— 一屏两个互相矛盾的数字。
   */
  const portRates = dailyRates(fleet, stance)
  const seaRates = dailyRates({ ...fleet, isSailing: true }, 'steady')

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
  // 天数与主屏常驻的「下一站」指引**同源**（utils/voyage.voyageDays）：
  // 两处各算一遍必然对不上——实测塞维利亚→埃尔米纳主屏写「约 10 天」、
  // 面板写「约 15 天可达」，差 5 天，而补给够不够又是按面板这个天数判的。
  const steadyDays = voyageDays({
    distanceNm: route.distance,
    windFavor: route.windFavor,
    phenomenonFactor: route.phenomenonFactor ?? 1,
    fleet,
    officers,
    weather,
  })
  /*
   * R4：出发窗口。季风半年反向，但玩家现在只能看到一个 ×0.60 —— 无法据此规划
   * "等两周再走"。这里把同一套链路（`routeFacts` + `voyageDays`）在几个不同日子
   * 上各跑一遍，只在**省 ≥ 2 天**时给出一句话（省 1 天是噪声，写出来像骗人）。
   */
  const windows = fromPort
    ? departureWindows(
      [fromPort.latitude, fromPort.longitude],
      [waypoint.latitude, waypoint.longitude],
      fleet.day,
      (facts) => voyageDays({
        distanceNm: facts.distanceNm,
        windFavor: facts.windFavor,
        phenomenonFactor: facts.phenomenonFactor,
        fleet,
        officers,
        weather,
      }),
      useGameStore.getState().knownPassages ?? [],
    )
    : null
  // 「只够几天」也按起航后按部就班的日耗算，不拿港内口径或基础值混用
  const foodDays = seaRates.foodPerDay > 0 ? Math.floor(fleet.food / seaRates.foodPerDay) : 99
  const waterDays = seaRates.waterPerDay > 0 ? Math.floor(fleet.water / seaRates.waterPerDay) : 99

  const verdict = (() => {
    if (!foodOk || !waterOk) {
      const what = !foodOk && !waterOk ? '粮水都不够' : !foodOk ? '粮食不够' : '淡水不够'
      const shortDays = Math.min(foodDays, waterDays)
      return {
        tone: 'danger' as const,
        icon: '⚠',
        text: `${what}——按部就班只够 ${shortDays} 天，这趟要 ${steadyDays} 天`,
        sub: rushOk
          ? `回港补给，或一路「抢行」：全程只需 ${rushLedger.food} 粮 / ${rushLedger.water} 水`
          : '回港补给，或改去更近的港口',
      }
    }
    // 够但余量不到 1.5 倍：不拦你，但提醒一句（口径与上面的判定同源）
    const tight = fleet.food < needFood * 1.5 || fleet.water < needWater * 1.5
    return {
      tone: tight ? 'gold' as const : 'safe' as const,
      icon: tight ? '△' : '✓',
      text: tight ? `补给偏紧 · 约 ${steadyDays} 天可达` : `补给充足 · 约 ${steadyDays} 天可达`,
      sub: tight ? '路上别耽搁；细账可展开看' : '',
    }
  })()

  const verdictCls = verdict.tone === 'danger'
    ? 'border-danger-700/50 bg-danger-900/20 text-danger-200'
    : verdict.tone === 'gold'
      ? 'border-gold-600/45 bg-gold-900/15 text-gold-200'
      : 'border-safe-700/40 bg-safe-900/15 text-safe-200'

  // 预报摘要（收起时也给一行）
  // 摘要用「晴朗 → 阴云 → 落雨」代替图标堆叠：三个词合起来 8 个字，
  // 远比三个彩色天气 emoji 更轻，箭头也比「·」更能说明这是时间推进
  const forecastSummary = forecast
    .map(w => WEATHER_INFO[w.kind].label)
    .join(' → ')

  return (
    <div className="fixed inset-0 flex items-start justify-center bg-black/70 backdrop-blur-sm p-3 md:p-4 overflow-y-auto" style={{ zIndex: 80 }}>
      <div className="my-auto w-[27rem] max-w-[92vw] overflow-hidden animate-slide-in-right"
        style={{
          // 【底色跟其余面板同族】
          // 原来这里是 bg-ocean-900/95（#0a1219，冷黑蓝）。它和事件卡共用外壳，
          // 但外壳是"金框"，底色才是材质 —— 结果点地图弹出来的是全站唯一一块
          // 冷色面板：左边海图暖、上面顶栏暖、这一块发蓝，读作"别的游戏的东西"。
          // 换成 --panel-bg 同一族之后，它才像"从同一张桌上抽出来的纸"。
          backgroundColor: '#14100b',
          // 金质九宫格边框（F2 治愈版切片）——与事件卡**同一套外壳**。
          //
          // 【为什么要统一】原来这里是 `border border-gold-700/40 rounded-lg`，
          // 1px 细线 + 圆角读起来像网页表单。而事件卡是 20px 金框 + 船徽 + 缎带标题，
          // 玩家从"点地图看出航计划"到"遇到事件看事件卡"，视觉上像两个游戏。
          //
          // borderImage 的 `140 / 20px` 表示"源图切 140px 的角、显示成 20px"，
          // 所以任何尺寸的面板都能套，不会被拉伸变形（角块是固定像素映射）。
          borderWidth: '20px',
          borderStyle: 'solid',
          borderImage: `url(${UI_ASSETS.frameGoldSlice}) ${UI_ASSETS.frameGoldSliceSize} / 20px / 0 stretch`,
        }}
      >
        {/* 标题 */}
        <div className="px-4 py-2.5 border-b border-gold-700/30 bg-black/30 flex items-center gap-3">
          <img
            src={shipSprite(fleet.ships.find(s => s.id === fleet.flagshipId)?.type || fleet.ships[0]?.type || 'galleon')}
            alt=""
            aria-hidden="true"
            className="h-9 w-auto object-contain drop-shadow-md shrink-0"
            onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
          />
          <div className="min-w-0">
            <h2 className="pirate-title text-base text-gold-300">出航计划</h2>
            <p className="text-gold-500 font-serif text-xs mt-0.5 truncate">
              {fromPort?.nameCn ?? '当前海域'} → <span className="text-gold-200">{destName}</span>
            </p>
          </div>
        </div>

        <div className="p-3 space-y-2">
          {/* ① 结论：够不够、几天 —— 本面板唯一必须被读到的一行 */}
          <div className={`rounded border px-3 py-2 ${verdictCls}`}>
            <div className="flex items-baseline gap-1.5">
              {/*
                【图标不许比它旁边的字还小】原来是 14px 对 13px —— 差 1px 等于没有差，
                ⚠ 读起来像句末的一个标点。提到 17px（= 正文 13 的 1.3 倍）才像一个"信号"，
                同时仍小于标题 16？不：它必须**大于**正文而不是小于，所以取 17。
                基线对齐保留（`items-baseline`）：正文会折两行，居中会让图标吊在中间。
              */}
              <span className="text-[17px] leading-none shrink-0">{verdict.icon}</span>
              <span data-testid="voyage-verdict-text" className="font-serif text-[13px] leading-snug">{verdict.text}</span>
            </div>
            {verdict.sub && (
              <p className="font-serif text-xs mt-0.5 opacity-70">{verdict.sub}</p>
            )}
          </div>

          {/*
            ② 三个关键数字：航程 / 危险 / 风向
            【为什么改成 15px】这三个是这屏**唯一要玩家做判断的输入**，原来值和标签
            同为 12px —— 一格里两行同样的字号，读起来是"两个标签"，不是"标签 + 数字"。
            全站规矩也是重要数字 15~16（12px 是正文下限）。标签保持 12px 不动，
            层级靠字号差拉出来；`leading-tight` 让盒子高度只涨 2~3px。
            `tabular-nums` 保持等宽，三格的数字仍落在各自列的中央。
          */}
          <div className="grid grid-cols-3 gap-2 text-center bg-black/25 rounded px-2 py-1.5">
            <div>
              <div className="text-gold-600 text-xs font-serif">航程</div>
              <div data-testid="voyage-route-distance" className="text-gold-200 text-[15px] font-serif tabular-nums leading-tight">{route.distance} 海里</div>
            </div>
            <div>
              <div className="text-gold-600 text-xs font-serif">危险</div>
              <div className="text-danger-400 text-[15px] font-serif leading-tight">{dangerStars(route.dangerLevel)}</div>
            </div>
            <div>
              <div className="text-gold-600 text-xs font-serif">风向</div>
              <div className={`text-[15px] font-serif leading-tight ${wind.cls}`}>{wind.text}</div>
            </div>
          </div>

          {/*
            R2：这一趟的脾气，一行说完。放在三个决策数字之后、折叠之前 ——
            它是"这趟为什么不一样"的一句话，不是需要计算的数。
          */}
          <div className="flex items-baseline gap-2 rounded border border-gold-700/25 px-2.5 py-1.5"
            style={{ background: 'rgba(0,0,0,0.18)' }}
            data-testid="voyage-mod"
            data-mod={voyageMod.id}
            data-mul={voyageMod.eventMul}
          >
            <span className="shrink-0 font-serif text-[12px] text-gold-600">这一趟</span>
            <span className="shrink-0 font-serif text-[13px] text-gold-200">{voyageMod.name}</span>
            <span className="min-w-0 truncate font-serif text-[12px] text-gold-500">{voyageMod.line}</span>
          </div>

          {/*
            R4：只有当"等一等真的划算"（省 ≥ 2 天）时才出现这一行。
            没有可等的时候什么都不写 —— 空话比没有更吵。
            数字与上面「这一趟要几天」同一条链路（routeFacts + voyageDays），
            只是把 day 换成 day+等待天数。
          */}
          {windows?.better && (
            <div
              className="flex items-baseline gap-2 rounded border border-gold-700/25 px-2.5 py-1.5"
              style={{ background: 'rgba(0,0,0,0.18)' }}
              data-testid="departure-window"
              data-wait={windows.better.waitDays}
              data-days={windows.better.days}
              data-saved={windows.better.saved}
            >
              <span className="shrink-0 font-serif text-[12px] text-gold-600">等 {windows.better.waitDays} 天</span>
              <span className="shrink-0 font-serif text-[13px] text-gold-200">{windows.better.days} 天到</span>
              <span className="min-w-0 truncate font-serif text-[12px] text-safe-400">比现在少 {windows.better.saved} 天</span>
            </div>
          )}

          {/* ③ 细节全部折叠：想深究才点开 */}
          {forecast.length > 0 && (
            <Fold title="未来几天天气" icon={<CloudSun size={11} />} summary={forecastSummary}>
              <div className="grid grid-cols-3 gap-1.5">
                {forecast.map((w, i) => {
                  const fi = WEATHER_INFO[w.kind]
                  return (
                    <div key={i} className="text-center bg-ocean-900/40 rounded py-1">
                      <div className="text-gold-600 text-xs font-serif">第{fleet.day + i}天</div>
                      <div className="flex justify-center my-1 text-gold-300">
                        <WeatherIcon kind={w.kind} size={15} />
                      </div>
                      <div className="text-gold-200 text-xs font-serif">{fi.label}</div>
                      <div className={`text-xs font-serif tabular-nums ${fi.sailMul < 1 ? 'text-danger-400' : 'text-safe-400'}`}>
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
              <span className="flex items-center gap-1 text-gold-400 font-serif text-xs shrink-0">
                <MapIcon size={11} aria-hidden="true" />
                航线情报
              </span>
              {intel ? (
                <span className="font-mono text-xs tabular-nums text-gold-600">
                  晴 <span className="text-safe-400">{Math.round(intel.fairWeather * 100)}%</span>
                  {' · '}匪 <span className="text-danger-400">{Math.round(intel.pirateRisk * 100)}%</span>
                  {' · '}风暴 <span className="text-danger-400">{Math.round(intel.stormRisk * 100)}%</span>
                </span>
              ) : (
                <>
                  <span className="font-serif text-xs text-gold-700 flex-1 truncate">未掌握</span>
                  <button
                    onClick={buyRouteIntel}
                    disabled={fleet.gold < intelPrice}
                    className="shrink-0 text-xs font-serif text-gold-200 bg-gold-700/40 hover:bg-gold-600/50 disabled:opacity-40 px-2 py-0.5 rounded transition-colors"
                  >
                    买通老船长 · {intelPrice} 金
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 方针总账：这一步不选它，但让想提前规划的玩家能看 */}
          <Fold title="三种方针能差多少" icon={<Anchor size={11} />} summary="抢行最快最险 · 谨慎最慢最稳">
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
                  <div key={s.id} className="flex items-baseline gap-2 text-xs font-mono tabular-nums text-gold-500">
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
            <p className="font-serif text-xs text-gold-700 leading-relaxed">
              数字是与「按部就班」相比的差值。每到航段起点再选，这里只是提前看一眼。
            </p>
          </Fold>

          {/* 当前库存 + 两套日耗：港内是此刻真正生效的口径，起航后是这趟的口径。
              数字都走 dailyRates，与顶栏和 store.advanceDay 逐字同源。 */}
          <div className="flex flex-col gap-0.5 text-xs font-serif text-gold-600 px-0.5">
            {/*
              【这三个数是上面那条警告的"证据"】
              "淡水不够——只够 33 天" 说的是 100 水；可它原来是 12px、和句子同一个字号，
              玩家得逐字读才知道是哪个数不够。数字提到 14px（**只提数字，句子留 12px**），
              一行里就有"标签小、数字大"的节奏，扫一眼就能对上警告。
              没有提到 15px：那是上面「航程/危险/风向」那一档，这三项是次级证据。
            */}
            <span>
              船上：粮 <span className="text-gold-300 text-[14px] tabular-nums">{fleet.food}</span>
              {' · '}水 <span className="text-gold-300 text-[14px] tabular-nums">{fleet.water}</span>
              {' · '}士气 <span className="text-gold-300 text-[14px] tabular-nums">{fleet.morale}</span>
            </span>
            {/*
              【两套日耗改成"两列对照"，不再是一句带斜杠的长句】
              原来是「港内每日 1 粮 / 1 水 · 起航后按部就班 2 粮 / 3 水」——
              玩家要做的动作是**比较**（这趟比停港多烧多少），而比较需要两个数
              落在同一列里对齐；串成一句话时，四个数字挤在一行、单位斜杠混在一起，
              眼睛得来回跳。现在：两列并排、表头一行、数字 14px 等宽 ——
              这屏前面「航程/危险/风向」用的就是同一套"标签在上、数字在下"的格子，
              这里沿用，翻上来不会觉得换了一种版式。
            */}
            <div data-testid="voyage-supply-rates" className="grid grid-cols-2 gap-2 mt-0.5">
              <div className="rounded-sm bg-black/20 px-2 py-1">
                <div className="text-gold-600 text-xs font-serif">港内每日</div>
                <div className="text-gold-300 text-[14px] font-serif tabular-nums leading-tight">
                  {portRates.foodPerDay} 粮 / {portRates.waterPerDay} 水
                </div>
              </div>
              <div className="rounded-sm bg-black/20 px-2 py-1">
                <div className="text-gold-600 text-xs font-serif">起航后按部就班</div>
                <div className="text-gold-300 text-[14px] font-serif tabular-nums leading-tight">
                  {seaRates.foodPerDay} 粮 / {seaRates.waterPerDay} 水
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 操作 */}
        <div className="px-3 py-3.5 border-t border-gold-700/30 bg-black/30 flex gap-2">
          <button
            onClick={cancelVoyage}
            className="shrink-0 px-4 py-2.5 text-[13px] font-serif text-gold-500 hover:text-gold-300
              border border-gold-700/30 rounded-sm transition-colors"
          >
            再想想
          </button>
          {/* 出航是这一屏唯一的主动作：等宽的两个按钮读完不知道哪个是"继续" */}
          <button
            onClick={confirmDeparture}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-serif
              text-gold-100 bg-gold-700/70 hover:bg-gold-600/80 rounded-sm transition-colors press"
          >
            <Flag size={12} aria-hidden="true" />
            出航
          </button>
        </div>
      </div>
    </div>
  )
}
