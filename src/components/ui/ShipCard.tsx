import { Anchor, Package, Users, Gauge, Shield, X } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { shipSprite } from '@/data/shipSprites'
import { goods } from '@/data/goods'
import { durabilityColor } from '@/utils/shipVitals'

/**
 * 旗舰卡：底栏上方展开的一块船只详情。
 *
 * 【为什么做成浮层而不是常驻】
 * 参考图底部是常驻船卡（船图 + 四项属性 + 六个货格），但那是 1080p 宽屏、
 * 底栏独占一整条。我们的底栏只有 40px 高，左侧还要塞航行状态、航段、剩余天数。
 * 硬塞进去只能砍别的东西。做成点开才出现的浮层：常驻只留船图和船名（知道
 * 自己开什么船），要看细节点一下——信息不减，空间不抢。
 *
 * 【为什么数据都从 store 现取】
 * 载重、耐久会随买卖和事件实时变。船卡如果从父组件传快照，买卖完成后
 * 卡片上的数字会停在打开那一刻。直接从 store 订阅，买卖时跟着变。
 */

const SHIP_TYPE_NAMES: Record<string, string> = {
  caravel: '卡拉维尔', galleon: '盖伦帆船', sloop: '单桅纵帆', frigate: '护卫舰',
}

function Meter({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-1.5 flex-1 rounded-full overflow-hidden bg-black/40">
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function ShipCard({ onClose }: { onClose: () => void }) {
  const fleet = useGameStore(s => s.fleet)
  const ship = fleet.ships.find(sh => sh.id === fleet.flagshipId) ?? fleet.ships[0]
  if (!ship) return null

  const used = fleet.ships.reduce((sum, sh) => sum + sh.usedCapacity, 0)
  const total = fleet.ships.reduce((sum, sh) => sum + sh.capacity, 0)
  const isFlagship = ship.id === fleet.flagshipId

  // 耐久色：低于 30% 才红，避免"正常航行时船卡一片红"
  const durPct = ship.maxDurability > 0 ? ship.durability / ship.maxDurability : 0
  const durColor = durabilityColor(durPct)

  const cargo = fleet.cargo.filter(c => c.quantity > 0).slice(0, 8)

  return (
    <div
      className="w-[19rem] max-w-[92vw] rounded-lg border border-gold-700/55 overflow-hidden animate-fade-in-scale"
      style={{
        background: 'linear-gradient(180deg, rgba(52,38,22,0.98) 0%, rgba(24,17,9,0.98) 100%)',
        boxShadow: '0 6px 20px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,238,186,0.16)',
      }}
    >
      {/* 头部：船图 + 名字 */}
      <div className="flex items-center gap-2.5 px-3 py-2 border-b border-gold-700/30 bg-black/20">
        <img
          src={shipSprite(ship.type)}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="h-10 w-auto object-contain shrink-0 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-serif text-sm text-gold-200 truncate">{ship.name}</span>
            {isFlagship && (
              <span className="shrink-0 text-[9px] font-serif text-gold-300 bg-gold-700/40 border border-gold-600/40 rounded px-1 py-[1px]">
                旗舰
              </span>
            )}
          </div>
          <div className="text-[10px] font-serif text-gold-600">
            {SHIP_TYPE_NAMES[ship.type] ?? ship.type}
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1 rounded text-gold-600 hover:text-gold-200 hover:bg-gold-700/30 transition-colors"
          aria-label="关闭船只详情"
        >
          <X size={14} />
        </button>
      </div>

      {/* 四项属性 */}
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-2 text-[10px] font-serif">
          <Shield size={11} className="shrink-0 text-gold-500" aria-hidden="true" />
          <span className="text-gold-500 w-7">耐久</span>
          <Meter value={ship.durability} max={ship.maxDurability} color={durColor} />
          <span className="text-gold-300 tabular-nums shrink-0 w-14 text-right">
            {ship.durability}/{ship.maxDurability}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-serif">
          <Package size={11} className="shrink-0 text-gold-500" aria-hidden="true" />
          <span className="text-gold-500 w-7">货舱</span>
          <Meter value={used} max={total} color="#c9a96e" />
          <span className="text-gold-300 tabular-nums shrink-0 w-14 text-right">
            {used}/{total}
          </span>
        </div>
        <div className="flex items-center gap-4 pt-0.5 text-[10px] font-serif text-gold-400">
          <span className="flex items-center gap-1">
            <Gauge size={11} className="text-gold-500" aria-hidden="true" />
            {ship.speed} 节
          </span>
          <span className="flex items-center gap-1">
            <Users size={11} className="text-gold-500" aria-hidden="true" />
            {ship.crew}/{ship.maxCrew} 人
          </span>
          <span className="flex items-center gap-1">
            <Anchor size={11} className="text-gold-500" aria-hidden="true" />
            {fleet.ships.length} 艘
          </span>
        </div>
      </div>

      {/* 货物 */}
      {cargo.length > 0 && (
        <div className="px-3 pb-2.5">
          <div className="text-[9px] font-serif text-gold-700 mb-1">舱内货物</div>
          <div className="flex flex-wrap gap-1">
            {cargo.map(c => {
              const g = goods.find(x => x.id === c.goodId)
              return (
                <span
                  key={c.goodId}
                  className="text-[10px] font-serif text-gold-300 bg-black/30 border border-gold-700/30 rounded px-1.5 py-0.5"
                  title={g?.name}
                >
                  {g?.name ?? '?'} ×{c.quantity}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
