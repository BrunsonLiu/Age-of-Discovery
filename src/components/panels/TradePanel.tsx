import { useState } from 'react'
import { Coins, Package, TrendingUp, TrendingDown, Sprout, HandCoins } from 'lucide-react'
import { useGameStore, selectBuyPrice, selectSellPrice } from '@/store/useGameStore'
import { portGoods, localSpecialties, localDemands } from '@/data/ports'
import { goods } from '@/data/goods'
import ParchmentCard from '@/components/ui/ParchmentCard'
import ActionButton from '@/components/ui/ActionButton'
import { useFxStore as useFx } from '@/store/useFxStore'

/**
 * 买入行。
 *
 * 价格**不能**在这里自己算。历史上 TradePanel 抄了一份公式，
 * 漏乘 priceMultiplier、也漏掉 surge——屏幕上的价和真正结算的价能差 67 金，
 * 玩家照着面板的价做买卖决策，看到的却不是真实世界。
 * 现在价格一律取自 store 的 selectBuyPrice（与 buyGood 结算走同一个函数），
 * 面板显示 = 实际发生。
 */
function BuyRow({ portId, pg, fleet, usedCapacity, totalCapacity, onBuy }: {
  portId: number
  pg: (typeof portGoods)[number]
  fleet: { gold: number }
  usedCapacity: number
  totalCapacity: number
  onBuy: (goodId: number, qty: number) => void
}) {
  const buyPrice = useGameStore(s => selectBuyPrice(s, portId, pg.goodId))
  const stock = useGameStore(s => s.marketStock[`${portId}:${pg.goodId}`] ?? pg.stock)
  const good = goods.find(g => g.id === pg.goodId)
  if (!good || buyPrice == null) return null

  // 与全局基准价比较，回答的是「这个港口相对便宜吗」
  const priceDiff = buyPrice - good.basePrice
  const isCheap = priceDiff < 0
  const isExpensive = priceDiff > 0

  return (
    <div className="bg-ocean-800/30 rounded p-2" data-testid="trade-buy-row" data-good-id={pg.goodId}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-gold-200 text-xs font-serif">{good.nameCn}</span>
        <span
          className={`flex items-center gap-0.5 text-xs font-serif ${
            isCheap ? 'text-safe-400' : isExpensive ? 'text-danger-400' : 'text-gold-400'
          }`}
          data-price={buyPrice}
        >
          {isCheap && <TrendingDown size={10} />}
          {isExpensive && <TrendingUp size={10} />}
          <Coins size={10} /> {buyPrice}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-gold-600 text-xs">库存: {stock}</span>
        <div className="flex gap-1">
          {[1, 5, 10].map(qty => (
            <ActionButton
              key={qty}
              onClick={() => onBuy(pg.goodId, qty)}
              disabled={fleet.gold < buyPrice * qty || usedCapacity + qty > totalCapacity || stock < qty}
              variant="secondary"
            >
              +{qty}
            </ActionButton>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * 卖出行。
 *
 * 同一原则：价格取自 selectSellPrice，与 sellGood 结算同一个函数。
 * 「本港不收」时价格是基准价折价（不是拒绝）——面板此前显示着折价和
 * 可点的按钮，而 store 却静默 return，玩家点了货不减钱不加，屏幕毫无反应。
 */
function SellRow({ portId, item, onSell }: {
  portId: number
  item: { goodId: number; quantity: number }
  onSell: (goodId: number, qty: number) => void
}) {
  const sellPrice = useGameStore(s => selectSellPrice(s, portId, item.goodId))
  const good = goods.find(g => g.id === item.goodId)
  const tradedHere = portGoods.some(p => p.portId === portId && p.goodId === item.goodId)
  if (!good || sellPrice == null) return null

  return (
    <div className="bg-ocean-800/30 rounded p-2" data-testid="trade-sell-row" data-good-id={item.goodId}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-gold-200 text-xs font-serif">
          {good.nameCn}{!tradedHere && <span className="text-gold-600 text-xs">（本港不收，折价）</span>}
        </span>
        <span className="flex items-center gap-0.5 text-safe-400 text-xs font-serif" data-price={sellPrice}>
          <Coins size={10} /> {sellPrice}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-gold-600 text-xs">持有: {item.quantity}</span>
        <div className="flex gap-1">
          {[1, 5, 10].map(qty => (
            <ActionButton
              key={qty}
              onClick={() => onSell(item.goodId, qty)}
              disabled={item.quantity < qty}
              variant="secondary"
            >
              -{qty}
            </ActionButton>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function TradePanel() {
  const fleet = useGameStore(s => s.fleet)
  const buyGood = useGameStore(s => s.buyGood)
  const sellGood = useGameStore(s => s.sellGood)
  const setActivePanel = useGameStore(s => s.setActivePanel)
  const [tab, setTab] = useState<'buy' | 'sell'>('buy')

  const portId = fleet.currentPortId
  if (!portId) return null

  const currentPortGoods = portGoods.filter(pg => pg.portId === portId)
  const totalCapacity = fleet.ships.reduce((s, sh) => s + sh.capacity, 0)
  const usedCapacity = fleet.cargo.reduce((s, c) => s + c.quantity, 0)

  const nameOf = (id: number) => goods.find(g => g.id === id)?.nameCn ?? ''
  const specialties = localSpecialties(portId).map(nameOf).filter(Boolean)
  const demands = localDemands(portId).map(nameOf).filter(Boolean)
  // 玩家货舱里此港高价收购的商品（直接提示"可在此出手"）
  const sellableHigh = fleet.cargo
    .filter(c => demands.includes(nameOf(c.goodId)))
    .map(c => `${nameOf(c.goodId)}×${c.quantity}`)

  const handleBuy = (goodId: number, qty: number) => {
    const before = useGameStore.getState().fleet.gold
    buyGood(portId, goodId, qty)
    const spent = before - useGameStore.getState().fleet.gold
    if (spent > 0) {
      useFx.getState().fx(
        { kind: 'float', tone: 'plain', text: `-${spent}`, sub: `${nameOf(goodId)}×${qty}` },
        'coin',
      )
    } else {
      // 点了却没成交——必须说清楚为什么，不能默默吞掉
      useFx.getState().fx(
        { kind: 'float', tone: 'danger', text: '无法买入', sub: '金币不足、货舱已满或库存不足' },
        'error',
      )
    }
  }

  const handleSell = (goodId: number, qty: number) => {
    const before = useGameStore.getState().fleet.gold
    sellGood(portId, goodId, qty)
    const earned = useGameStore.getState().fleet.gold - before
    if (earned > 0) {
      useFx.getState().fx(
        { kind: 'float', tone: 'gold', text: `+${earned}`, sub: `${nameOf(goodId)}×${qty}` },
        'sell',
      )
    } else {
      useFx.getState().fx(
        { kind: 'float', tone: 'danger', text: '无法出售', sub: '货舱里没有这么多' },
        'error',
      )
    }
  }

  return (
    <div className="w-80 animate-slide-in-right" data-testid="trade-panel">
      <ParchmentCard title="商品交易" onClose={() => setActivePanel(null)}>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gold-400 font-serif">
            <span className="flex items-center gap-1"><Coins size={12} /> {fleet.gold} 金币</span>
            <span className="flex items-center gap-1"><Package size={12} /> {usedCapacity}/{totalCapacity}</span>
          </div>

          {(specialties.length > 0 || demands.length > 0) && (
            <div className="bg-ocean-800/40 border border-gold-700/20 rounded p-2 space-y-1">
              {specialties.length > 0 && (
                <p className="text-safe-400 text-xs font-serif flex items-start gap-1">
                  <Sprout size={11} className="mt-0.5 shrink-0" />
                  <span>本地特产：{specialties.join('、')}（买入最便宜）</span>
                </p>
              )}
              {demands.length > 0 && (
                <p className="text-gold-300 text-xs font-serif flex items-start gap-1">
                  <HandCoins size={11} className="mt-0.5 shrink-0" />
                  <span>高价收购：{demands.slice(0, 3).join('、')}</span>
                </p>
              )}
              {sellableHigh.length > 0 && (
                <p className="text-gold-400 text-xs font-serif italic">
                  ✓ 你船上的 {sellableHigh.join('、')} 在此可卖高价
                </p>
              )}
            </div>
          )}

          <div className="flex gap-1">
            <button
              onClick={() => setTab('buy')}
              className={`flex-1 py-1.5 text-xs font-serif rounded transition-colors ${
                tab === 'buy' ? 'bg-gold-700/40 text-gold-200' : 'bg-ocean-800/30 text-gold-500 hover:text-gold-300'
              }`}
            >
              购买
            </button>
            <button
              onClick={() => setTab('sell')}
              className={`flex-1 py-1.5 text-xs font-serif rounded transition-colors ${
                tab === 'sell' ? 'bg-gold-700/40 text-gold-200' : 'bg-ocean-800/30 text-gold-500 hover:text-gold-300'
              }`}
            >
              出售
            </button>
          </div>

          {tab === 'buy' && (
            <div className="space-y-1.5 max-h-60 overflow-y-auto scrollbar-thin">
              {currentPortGoods.map(pg => (
                <BuyRow
                  key={pg.goodId}
                  portId={portId}
                  pg={pg}
                  fleet={fleet}
                  usedCapacity={usedCapacity}
                  totalCapacity={totalCapacity}
                  onBuy={handleBuy}
                />
              ))}
            </div>
          )}

          {tab === 'sell' && (
            <div className="space-y-1.5 max-h-60 overflow-y-auto scrollbar-thin">
              {fleet.cargo.length === 0 ? (
                <p className="text-gold-600 text-xs font-serif text-center py-4">货舱空空如也</p>
              ) : (
                fleet.cargo.map(item => (
                  <SellRow key={item.goodId} portId={portId} item={item} onSell={handleSell} />
                ))
              )}
            </div>
          )}
        </div>
      </ParchmentCard>
    </div>
  )
}
