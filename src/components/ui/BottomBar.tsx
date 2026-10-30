import { Anchor, Navigation, Coins, RotateCcw, Pause, FastForward, Sailboat } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports } from '@/data/ports'
import { STANCES } from '@/utils/segment'
import { daysToDestination } from '@/utils/voyage'
import { shipSprite } from '@/data/shipSprites'
import ResourceCluster from '@/components/ui/ResourceCluster'
import SoundToggle from '@/components/ui/SoundToggle'

export default function BottomBar() {
  const fleet = useGameStore((s) => s.fleet)
  const currentRoute = useGameStore((s) => s.currentRoute)
  const routeProgress = useGameStore((s) => s.routeProgress)
  const waypoint = useGameStore((s) => s.waypoint)
  const simSpeed = useGameStore((s) => s.simSpeed)
  const setSimSpeed = useGameStore((s) => s.setSimSpeed)
  const stance = useGameStore((s) => s.stance)
  const segmentIndex = useGameStore((s) => s.segmentIndex)
  const segmentCount = useGameStore((s) => s.segmentCount)
  const officers = useGameStore((s) => s.officers)
  const weather = useGameStore((s) => s.weather)
  const advanceDay = useGameStore((s) => s.advanceDay)
  const resetGame = useGameStore((s) => s.resetGame)
  const showWindOverlay = useMapStore((s) => s.showWindOverlay)
  const showCurrentOverlay = useMapStore((s) => s.showCurrentOverlay)
  const showPirateZones = useMapStore((s) => s.showPirateZones)
  const toggleWindOverlay = useMapStore((s) => s.toggleWindOverlay)
  const toggleCurrentOverlay = useMapStore((s) => s.toggleCurrentOverlay)
  const togglePirateZones = useMapStore((s) => s.togglePirateZones)

  const flagship = fleet.ships.find(sh => sh.id === fleet.flagshipId) ?? fleet.ships[0]
  const currentPort = fleet.currentPortId ? ports.find(p => p.id === fleet.currentPortId) : null
  const destPort = currentRoute?.toPortId ? ports.find(p => p.id === currentRoute.toPortId) : null
  const destName = destPort?.nameCn ?? waypoint?.name ?? '未知海域'

  // 剩余天数口径见 utils/voyage.daysToDestination——与资源条的「还能撑几天」
  // 共用同一套换算，避免两处各算一套后数字互相矛盾。
  // 之前这里额外除以航速档位倍率，而天数推进时又没除——数字在骗人。
  const daysLeft = currentRoute
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
  const progressPct = Math.round(routeProgress * 100)
  const stanceProfile = STANCES[stance]

  const speedOptions = [
    { value: 0, label: '⏸', icon: <Pause size={12} /> },
    { value: 1, label: '1x', icon: null },
    { value: 3, label: '3x', icon: <FastForward size={12} /> },
    { value: 8, label: '8x', icon: <FastForward size={12} /> },
  ]

  return (
    /*
      桌面：一条横栏（状态 | 速度/方针 | 天数/资源/图层）。
      移动：同一个 DOM，靠 flex-wrap 自动折成三行：
        行1 状态 / 行2 速度与方针 / 行3 天数、资源、图层
      为什么用折行而不是另写一套移动端 DOM：
      折行后每一行的内容与桌面**完全同源**，不会出现"移动端少了某个按钮"
      这种只有实测才能发现的差异。
    */
    <div
      data-tut="bottombar"
      className="px-2 md:px-3 py-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 md:flex-nowrap md:py-1.5"
      style={{
        /* 与顶栏同一根梁的"下半截"：渐变方向反转（贴屏幕底边的一侧更亮），
           这样上下两条边读起来是同一个材质的两个端面，而不是两条独立的黑条。 */
        background: 'linear-gradient(180deg, #150f07 0%, #1d1409 38%, #2e2212 100%)',
        borderTop: '2px solid rgba(150, 117, 47, 0.65)',
        boxShadow: 'inset 0 -1px 0 rgba(255, 238, 186, 0.16), 0 -2px 10px rgba(0, 0, 0, 0.55)',
      }}
    >

      <div className="flex items-center gap-2 text-gold-300 min-w-0 basis-full md:basis-auto md:flex-none order-1">
        {/* 旗舰缩略图：底栏原先只有文字，看不出"我开的是什么船"。
            参考图底部那张船卡的第一眼就是船本身，这里先用最小的代价补上存在感。
            画在文字左边、跟着状态块一起走，移动端折行时也不会孤立。 */}
        {flagship && (
          <img
            src={shipSprite(flagship.type)}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="h-7 w-auto object-contain shrink-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)] select-none"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
        )}
        {fleet.isSailing ? (
          <div className="flex items-center gap-2 min-w-0">
            <Navigation size={14} className="text-blue-400 shrink-0 animate-pulse" />
            <span className="font-serif text-sm text-blue-300 truncate">
              → {destName}
            </span>
            <span className="text-xs text-gold-500 shrink-0">
              {progressPct}%
            </span>
            <div className="w-16 h-1.5 bg-ocean-700 rounded-full overflow-hidden shrink-0 hidden sm:block">
              <div
                className="h-full bg-blue-400 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-gold-600 shrink-0">
              约{daysLeft}天
            </span>
            {/* 航段指示：第几段 / 共几段——玩家随时知道"下次抉择还有多远" */}
            {segmentCount > 0 && (
              <span
                className="text-[10px] font-serif text-gold-700 shrink-0 tabular-nums"
                title={`航段 ${segmentIndex + 1} / ${segmentCount}`}
              >
                段{segmentIndex + 1}/{segmentCount}
              </span>
            )}
          </div>
        ) : currentPort ? (
          <div className="flex items-center gap-1.5">
            <Anchor size={14} className="text-gold-400 shrink-0" />
            <span className="font-serif text-sm text-gold-300">{currentPort.nameCn}</span>
            <span className="text-xs text-gold-600 hidden sm:inline">· 点击地图出航</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <Navigation size={14} className="text-gold-400 shrink-0" />
            <span className="font-serif text-sm text-gold-300">点击地图设定航向</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0 order-2">
        {/* 航段方针：唯一的速度/风险旋钮。
            它在航段开始时选定（见 SegmentDecision），此处只读展示——
            展示「现在正以什么姿态航行」比展示一堆可点的按钮更有用。 */}
        {fleet.isSailing && (
          <div
            className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md border border-gold-700/30 bg-ocean-700/50"
            title={`当前方针：${stanceProfile.name}——${stanceProfile.hint}`}
          >
            <Sailboat size={12} className="text-gold-400 shrink-0" />
            <span className="text-xs font-serif text-gold-200">{stanceProfile.name}</span>
            <span className="text-[10px] font-mono text-gold-600 tabular-nums">
              ×{stanceProfile.speedMul.toFixed(1)}
            </span>
          </div>
        )}
        {/* 这里原本还有一枚「🧭 段 N/M · 方针」的蓝色小牌。
            它和左边状态行里的「段N/M」、右边方针 chip 里的方针名**三重重复**，
            又是底栏唯一一块 sky 蓝，已删。 */}
        <div className="flex items-center bg-ocean-700/60 rounded-md overflow-hidden border border-gold-700/20">
          {speedOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setSimSpeed(opt.value)}
              className={`px-2 py-1 text-xs font-serif press transition-all ${
                simSpeed === opt.value
                  ? 'bg-gold-700/50 text-gold-200'
                  : 'text-gold-500 hover:text-gold-300 hover:bg-ocean-600/50'
              }`}
              title={opt.value === 0 ? '暂停' : `${opt.label}速度`}
              aria-label={opt.value === 0 ? '暂停' : `${opt.label}速度`}
              aria-pressed={simSpeed === opt.value}
            >
              {opt.icon || opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={advanceDay}
          className="px-2 py-1 text-xs font-serif text-gold-500 hover:text-gold-300 bg-ocean-700/40 rounded-md border border-gold-700/20 press transition-all"
          title="跳过一天"
          aria-label="跳过一天"
        >
          +1天
        </button>
      </div>

      {/*
        天数/金币 + 资源条。
        order：移动端排到图标组之后（见下面的图标组注释），
        桌面端回到原位（md:order-3）。
      */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0 order-4 md:order-3">
        <div className="flex items-center gap-2 text-xs text-gold-300">
          <span className="text-gold-500 font-serif">第{fleet.day}天</span>
          {/* 金币也要带字——和粮/水/士气三个片保持同一种"图标 + 单字 + 数字"
              的读法，否则底栏右侧是一串无标签数字，玩家得靠位置去猜。 */}
          <span className="flex items-center gap-0.5" title="金币">
            <Coins size={11} className="text-gold-500" aria-hidden="true" />
            <span className="font-serif text-[10px] text-gold-600">金</span>
            <span className="font-mono tabular-nums">{fleet.gold}</span>
          </span>
        </div>
        {/* 常驻资源条：粮/水/士气带余量条、可撑天数与短缺预警。
            金币不在这里——它是货币不是消耗品，画成进度条没有意义。 */}
        <ResourceCluster />
        <div className="hidden md:block w-px h-4 bg-gold-700/30" />
      </div>

      {/*
        图层开关 + 声音 + 重开。
        【为什么单独拆出来，还带 order】
        这一组约 92px 宽，和"天数/资源"组（≈318px）加在一起是 410px，
        在 390px 的手机上放不下——flex-wrap 会把它挤到第四行，底栏变得很厚。
        用 order 把它挪到速度组那一行：
          移动端  状态 / 速度+图层开关 / 天数+资源     （三行）
          桌面端  状态 / 速度 / 天数+资源 / 图层开关  （一行，与原版一致）
        order 只影响 flex 容器的排列顺序，不影响内容，
        所以桌面端的观感完全没变。
      */}
      <div className="flex items-center gap-0.5 shrink-0 order-3 md:order-4">
          <button
            onClick={toggleWindOverlay}
            className={`p-1 rounded press transition-all ${
              showWindOverlay ? 'bg-gold-700/40 text-gold-200' : 'text-gold-500 hover:text-gold-300'
            }`}
            title="风向"
            aria-label="风向"
            aria-pressed={showWindOverlay}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>
          </button>
          <button
            onClick={toggleCurrentOverlay}
            className={`p-1 rounded press transition-all ${
              showCurrentOverlay ? 'bg-gold-700/40 text-gold-200' : 'text-gold-500 hover:text-gold-300'
            }`}
            title="洋流"
            aria-label="洋流"
            aria-pressed={showCurrentOverlay}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M2 12c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0M2 18c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0M2 6c1.5-2 3.5-2 5 0s3.5 2 5 0 3.5-2 5 0 3.5 2 5 0"/></svg>
          </button>
          <button
            onClick={togglePirateZones}
            className={`p-1 rounded press transition-all ${
              showPirateZones ? 'bg-danger-700/40 text-danger-200' : 'text-gold-500 hover:text-gold-300'
            }`}
            title="海盗区域"
            aria-label="海盗区域"
            aria-pressed={showPirateZones}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
          </button>
          <div className="hidden md:block w-px h-3 bg-gold-700/30" />
          <SoundToggle />
          <div className="hidden md:block w-px h-3 bg-gold-700/30" />
          <button
            onClick={resetGame}
            className="p-1 rounded text-gold-500 hover:text-gold-300 hover:bg-gold-700/30 press transition-all"
            title="重新开始"
            aria-label="重新开始"
          >
            <RotateCcw size={12} aria-hidden="true" />
          </button>
      </div>
    </div>
  )
}
