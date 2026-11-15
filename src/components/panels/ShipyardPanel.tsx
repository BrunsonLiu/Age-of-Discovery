import { Ship as ShipIcon, Coins, Users, Package, Gauge, Anchor, Crown } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { shipTemplates, shipResaleValue } from '@/data/ships'
import { shipSprite } from '@/data/shipSprites'
import { ports } from '@/data/ports'
import { effectiveFleetSpeed } from '@/utils/navigation'
import ParchmentCard from '@/components/ui/ParchmentCard'
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
   * safe-300 是 6.69、danger-300 是 4.66，都过 AA。
   */
  const tone = flat ? 'text-gold-500' : delta > 0 ? 'text-safe-300' : 'text-danger-300'
  return (
    <span className="flex items-baseline gap-1 text-[13px] font-serif text-gold-400 whitespace-nowrap">
      <Icon size={10} className="shrink-0 self-center" aria-hidden="true" />
      <span className="text-gold-500">{label}</span>
      <span className="text-gold-200 tabular-nums">{fmt(value)}{unit}</span>
      <span
        className={`tabular-nums text-[12px] ${tone}`}
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
  if (!portId || !port || !hasShipyard) return null

  const totalCapacity = fleet.ships.reduce((s, sh) => s + sh.capacity, 0)
  const usedCapacity = fleet.cargo.reduce((s, c) => s + c.quantity, 0)
  // 差值基准：旗舰（老存档没有 flagshipId 时退回第一艘）
  const flag = fleet.ships.find(s => s.id === fleet.flagshipId) ?? fleet.ships[0]
  const fleetSpeed = effectiveFleetSpeed(fleet)

  return (
    <div className="w-full md:w-[26rem] animate-slide-in-right" data-testid="shipyard-panel">
      <ParchmentCard
        title="造船厂"
        /* 三个船型卡各 ~110px，加卖船区与头部 —— 默认 60vh 扣掉标题只剩 470，会把最后一张裁掉一半 */
        bodyClassName="max-h-[68dvh] md:max-h-[76vh] overflow-y-auto scroll-parchment"
        onClose={() => setActivePanel(null)}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[13px] text-gold-400 font-serif">
            <span className="flex items-center gap-1"><Coins size={12} /> {fleet.gold} 金币</span>
            <span className="flex items-center gap-1"><Package size={12} /> {usedCapacity}/{totalCapacity} 货舱</span>
            <span className="flex items-center gap-1" data-testid="shipyard-fleet-speed">
              <Gauge size={12} /> {fleetSpeed.toFixed(1)} 节
            </span>
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
                      <Coins size={10} /> {shipResaleValue(ship)}
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
            <div className="space-y-1.5">
              {buyableKeys.map(key => {
                const template = shipTemplates[key]
                const canBuyRegion = template.regions.includes(port.region)
                const affordable = fleet.gold >= template.price
                const disabled = !canBuyRegion || !affordable
                return (
                  <div key={key} className="inlay rounded p-2.5" data-testid={`shipyard-offer-${key}`}>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-gold-200 text-[14px] font-serif flex items-center gap-2 min-w-0">
                        <img
                          src={shipSprite(key)}
                          alt=""
                          aria-hidden="true"
                          className="h-12 w-auto object-contain drop-shadow-md shrink-0"
                          onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                        />
                        <span className="truncate">{template.name}</span>
                      </span>
                      <ActionButton
                        onClick={() => {
                          const before = useGameStore.getState().fleet.ships.length
                          buyShip(key)
                          if (useGameStore.getState().fleet.ships.length > before) {
                            useFx.getState().fx(
                              { kind: 'banner', tone: 'gold', text: `${template.name} 入列`, sub: `-${template.price} 金币` },
                              'ship',
                            )
                          }
                        }}
                        disabled={disabled}
                        variant="secondary"
                      >
                        <Coins size={10} /> {template.price}
                      </ActionButton>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
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
                        还差 {template.price - fleet.gold} 金币
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </ParchmentCard>
    </div>
  )
}
