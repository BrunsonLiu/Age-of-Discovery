import { Ship as ShipIcon, Users, Package, Gauge, Anchor, Crown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { shipTemplates, shipResaleValue } from '@/data/ships'
import { shipSprite } from '@/data/shipSprites'
import { ports } from '@/data/ports'
import { effectiveFleetSpeed } from '@/utils/navigation'
import FullScreenPanel from '@/components/ui/FullScreenPanel'
import { DOCK_TABS } from '@/components/ui/dockTabs'
import DockEmpty from '@/components/ui/DockEmpty'
import ActionButton from '@/components/ui/ActionButton'
import { useFxStore as useFx } from '@/store/useFxStore'

const buyableKeys = ['sloop', 'frigate', 'galleon'] as const

const shipTypeNames: Record<string, string> = {
  caravel: '卡拉维尔', galleon: '盖伦大帆船', sloop: '单桅快船', frigate: '护卫舰',
}

/** 整数就写整数，小数保留一位（速度是 8.0 这种，耐久是 120） */
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

/**
 * 一项属性 + 它相对**你的旗舰**的差。
 *
 * 【为什么要有这个差】原来四个数字是绝对值的并列：
 *   `8.0 节 · 耐久 120 · 100 舱 · 60 人`
 * 玩家要判断"该不该换船"，得自己把四个数跟现在的船比一遍 —— 而"现在的船"的数字
 * 在另一个面板里（舰队）。这是本作反复修的那类问题：**别让玩家做算术**。
 *
 * 对比对象是**旗舰**（你天天开的那艘），不是"舰队里最好的那艘"：
 * 换船换的正是旗舰，和最好的那艘比会得出"买了反而变差"的错觉。
 */
function Stat({ icon: Icon, label, value, delta, unit }: {
  icon: LucideIcon
  label: string
  value: number
  delta: number
  unit: string
}) {
  /*
   * 判"相等"不能用 `delta === 0`：速度是小数，`8.0 - 8.0` 之外还会有
   * `-0` 与 `1e-16` 这种浮点残差。第一版就踩到了 —— 耐久明明一样，
   * 屏幕上却写着「−0」，看着像有个我们不认识的负数。
   */
  const flat = Math.abs(delta) < 0.05
  /*
   * 色阶要挑亮一档：safe-400 (#5f9440) 在深棕底上是 4.51（刚好卡线），
   * danger-400 (#b8432e) 只有 **3.02** —— 12px 的差值读不清。
   * 实测（截图像素直方图，底色是 inlay 的 rgb(51,39,24) 而不是面板底）：
   * safe-300 = 7.72 过，但 danger-300 只有 **4.15** —— 再提一档到 danger-200。
   */
  const tone = flat ? 'text-gold-500' : delta > 0 ? 'text-safe-300' : 'text-danger-200'
  return (
    /*
     * 【差值自己占一格，右对齐定宽】
     * 原来是「图标 标签 数值 差值」一路 inline：差值的起点跟着数值宽度跑，
     * 实测同一张卡里四个差值的左边缘分别是 428 / 432 / 484 / 508 ——
     * 而这四列存在的唯一理由就是"竖着比船型"（速度 +4 / 耐久 −20 …）。
     * 差值挤在数值后面时，比的是"哪行短"，不是"哪个数大"。
     * 现在 `ml-auto + w-[2.1rem] + 右对齐`，四个差值落在四列等宽的网格里，
     * 三张卡共用同一套列线，整列往下扫就能看出哪条船更能装。
     */
    <span className="flex items-baseline gap-1 text-[13px] font-serif text-gold-400 whitespace-nowrap">
      <Icon size={10} className="shrink-0 self-center" aria-hidden="true" />
      <span className="text-gold-500">{label}</span>
      <span className="text-gold-200 tabular-nums">{fmt(value)}{unit}</span>
      <span
        className={`ml-auto w-[2.1rem] text-right tabular-nums text-[12px] ${tone}`}
        data-delta={flat ? 0 : delta}
        aria-label={flat ? '与旗舰相同' : `比旗舰${delta > 0 ? '多' : '少'} ${fmt(Math.abs(delta))}`}
      >
        {flat ? '0' : `${delta > 0 ? '+' : '-'}${fmt(Math.abs(delta))}`}
      </span>
    </span>
  )
}

export default function ShipyardPanel() {
  const fleet = useGameStore(s => s.fleet)
  const buyShip = useGameStore(s => s.buyShip)
  const sellShip = useGameStore(s => s.sellShip)
  const setActivePanel = useGameStore(s => s.setActivePanel)

  const portId = fleet.currentPortId
  const port = portId ? ports.find(p => p.id === portId) : null
  const hasShipyard = !!port?.services.includes('shipyard')
  /*
   * 【没船厂时不再 return null】
   * 它原来是"顶栏页签点得到、点开一片空白"的来源：页签是四个恒定的入口，
   * 而这块面板在没有船坞的港口会直接返回 null —— 玩家点「造船」什么也不会发生，
   * 连"为什么没有"都不说。空态至少交代一句，并保留回海图/切别的页签的路。
   */
  if (!portId) {
    return (
      <DockEmpty
        testId="shipyard-panel"
        title="造船厂"
        activeTab="shipyard"
        onTab={setActivePanel}
        onClose={() => setActivePanel(null)}
        hint="买卖船只与整船大修只在带大船坞的港口办得成。"
      />
    )
  }
  if (!port || !hasShipyard) {
    return (
      <FullScreenPanel
        testId="shipyard-panel"
        title="造船厂"
        subtitle={port ? `${port.nameCn} · 第 ${fleet.day} 天` : `第 ${fleet.day} 天`}
        tabs={DOCK_TABS}
        activeTab="shipyard"
        onTab={setActivePanel}
        footer="只有带大船坞的港口能买卖船只"
        onClose={() => setActivePanel(null)}
      >
        <div className="rounded-sm border border-gold-700/25 bg-black/20 px-5 py-8 text-center">
          <p className="text-gold-300 font-serif text-[14px]">这座港没有造船厂</p>
          <p className="text-gold-500 font-serif text-[13px] mt-2 leading-relaxed">
            买卖船只与整船大修只在有大船坞的港口办得成。日常修理与补给在「港口」那一页。
          </p>
        </div>
      </FullScreenPanel>
    )
  }

  const totalCapacity = fleet.ships.reduce((s, sh) => s + sh.capacity, 0)
  const usedCapacity = fleet.cargo.reduce((s, c) => s + c.quantity, 0)
  // 差值基准：旗舰（老存档没有 flagshipId 时退回第一艘）
  const flag = fleet.ships.find(s => s.id === fleet.flagshipId) ?? fleet.ships[0]
  const fleetSpeed = effectiveFleetSpeed(fleet)

  return (
    <FullScreenPanel
      testId="shipyard-panel"
      title="造船厂"
      subtitle={`${port.nameCn} · 第 ${fleet.day} 天`}
      tabs={DOCK_TABS}
      activeTab="shipyard"
      onTab={setActivePanel}
      footer="差值一栏是拿新船和你的旗舰比；旗舰不能卖"
      onClose={() => setActivePanel(null)}
      >
        <div className="space-y-3">
          {/*
            【三格仪表条】与贸易面板同一套：金币 / 货舱 / 航速。
            这三个数是"能不能买"的全部约束，原来挤成顶上的一行 13px 小字。
          */}
          <div className="grid grid-cols-3 rounded-sm border border-gold-700/25 bg-black/25 overflow-hidden
            divide-x divide-gold-700/25">
            <div className="px-3 md:px-4 py-2.5">
              <div className="text-[12px] tracking-[0.1em] text-gold-600 font-serif">金币</div>
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-gold-200 text-[18px] md:text-[21px] font-serif tabular-nums leading-none">{fleet.gold}</span>
                {/* 后缀单位用字不用图标：那枚 12px 金币在 21px 数字后读作 "500 ％" */}
                <span className="text-gold-500 text-[13px] font-serif">金</span>
              </div>
            </div>
            <div className="px-3 md:px-4 py-2.5">
              <div className="text-[12px] tracking-[0.1em] text-gold-600 font-serif">货舱</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-gold-200 text-[18px] md:text-[21px] font-serif tabular-nums leading-none">{usedCapacity}</span>
                <span className="text-gold-500 text-[13px] font-serif tabular-nums">/ {totalCapacity}</span>
              </div>
            </div>
            <div className="px-3 md:px-4 py-2.5">
              <div className="text-[12px] tracking-[0.1em] text-gold-600 font-serif">舰队航速</div>
              <div className="flex items-baseline gap-1 mt-0.5" data-testid="shipyard-fleet-speed">
                <span className="text-gold-200 text-[18px] md:text-[21px] font-serif tabular-nums leading-none">
                  {fleetSpeed.toFixed(1)}
                </span>
                <span className="text-gold-500 text-[13px] font-serif">节</span>
              </div>
            </div>
          </div>

          <div className="border-t border-gold-700/30 pt-2">
            <h4 className="text-gold-300 font-serif text-[13px] mb-1.5 flex items-center gap-1">
              <ShipIcon size={12} /> 出售旧船
              <span className="ml-auto text-gold-500 text-[12px]">{fleet.ships.length} 艘</span>
            </h4>
            {fleet.ships.map(ship => {
              const isFlagship = ship.id === fleet.flagshipId
              const canSell = fleet.ships.length > 1 && ship.usedCapacity === 0 && !isFlagship
              return (
                <div key={ship.id} className="flex items-center justify-between gap-2 text-[13px] mb-1">
                  <span className="text-gold-400 font-serif truncate">
                    {isFlagship && <Crown size={10} className="inline -mt-0.5 mr-1 text-gold-400" aria-hidden="true" />}
                    {ship.name} <span className="text-gold-500">({shipTypeNames[ship.type]})</span>
                  </span>
                  {canSell ? (
                    <ActionButton onClick={() => sellShip(ship.id)} variant="secondary">
                      {shipResaleValue(ship)} 金
                    </ActionButton>
                  ) : (
                    <span className="text-gold-400 text-[13px] shrink-0">
                      {fleet.ships.length <= 1 ? '唯一座舰' : isFlagship ? '旗舰（先改旗）' : '卸货后可售'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <div className="border-t border-gold-700/30 pt-2">
            <h4 className="text-gold-300 font-serif text-[13px] mb-1.5 flex items-center gap-1">
              <Anchor size={12} /> 购入新船
              <span className="ml-auto text-gold-500 text-[12px]">差值对比旗舰</span>
            </h4>
            <div className="space-y-2">
              {buyableKeys.map(key => {
                const template = shipTemplates[key]
                const canBuyRegion = template.regions.includes(port.region)
                const affordable = fleet.gold >= template.price
                const disabled = !canBuyRegion || !affordable
                return (
                  /*
                   * 【船卡改成横向三段：剪影 | 名称+四项差值 | 价格】
                   * 原来是竖着堆的窄卡：名称在左上、价格按钮在右上，其余四行
                   * 数据贴着左边 —— 768 正文里右半边整整 500px 是空的，
                   * 三张卡读起来像三个测了一半的表格。
                   * 横向排之后每一行都填满，四列数值共用列线，可以竖着比船型。
                   */
                  <div
                    key={key}
                    className="inlay rounded px-3 py-2.5 grid gap-x-4 gap-y-2
                      sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:items-center"
                    data-testid={`shipyard-offer-${key}`}
                  >
                    <img
                      src={shipSprite(key)}
                      alt=""
                      aria-hidden="true"
                      className="h-12 w-auto object-contain drop-shadow-md justify-self-center"
                      onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-gold-100 text-[15px] font-serif">{template.name}</span>
                        {/*
                          类型名不再重复显示：`shipTemplates[key].name` 本身就是
                          「单桅快船」这种中文全名，与 shipTypeNames 完全同字 ——
                          并排打出来是「单桅快船 单桅快船」，看起来像渲染了两次。
                          只在两者确实不同的时候才补类型。
                        */}
                        {shipTypeNames[key] && shipTypeNames[key] !== template.name && (
                          <span className="text-gold-500 text-[12px] font-serif">{shipTypeNames[key]}</span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 mt-1.5">
                        <Stat icon={Gauge} label="速度" value={template.speed} delta={template.speed - flag.speed} unit="节" />
                        <Stat icon={ShipIcon} label="耐久" value={template.maxDurability} delta={template.maxDurability - flag.maxDurability} unit="" />
                        <Stat icon={Package} label="舱位" value={template.capacity} delta={template.capacity - flag.capacity} unit="" />
                        <Stat icon={Users} label="船员" value={template.maxCrew} delta={template.maxCrew - flag.maxCrew} unit="" />
                      </div>
                      {!canBuyRegion && (
                        <p className="flex items-start gap-1 text-gold-400 text-[12px] mt-1.5 font-serif leading-snug">
                          <Anchor size={10} aria-hidden="true" className="mt-0.5 shrink-0" />
                          <span>此型船只在{template.regions.map(r => r === 'europe' ? '欧洲' : r === 'caribbean' ? '加勒比' : r === 'asia' ? '亚洲' : '非洲').join('、')}造船厂才有售</span>
                        </p>
                      )}
                      {!affordable && canBuyRegion && (
                        <p className="text-gold-400 text-[12px] mt-1.5 font-serif" data-testid={`shipyard-short-${key}`}>
                          还差 {template.price - fleet.gold} 金
                        </p>
                      )}
                    </div>
                    <div className="justify-self-end sm:justify-self-auto">
                      <ActionButton
                        onClick={() => {
                          const before = useGameStore.getState().fleet.ships.length
                          buyShip(key)
                          if (useGameStore.getState().fleet.ships.length > before) {
                            useFx.getState().fx(
                              { kind: 'banner', tone: 'gold', text: `${template.name} 入列`, sub: `-${template.price} 金` },
                              'ship',
                            )
                          }
                        }}
                        disabled={disabled}
                        variant="secondary"
                        className="w-24 justify-center"
                      >
                        {template.price} 金
                      </ActionButton>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </FullScreenPanel>
  )
}
