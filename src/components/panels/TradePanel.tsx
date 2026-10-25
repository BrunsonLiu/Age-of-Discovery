import { useState } from 'react'
import { Coins, Package, TrendingUp, TrendingDown, Sprout, HandCoins } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { portGoods, localSpecialties, localDemands } from '@/data/ports'
import { goods } from '@/data/goods'
import ParchmentCard from '@/components/ui/ParchmentCard'
import ActionButton from '@/components/ui/ActionButton'
import { useFxStore as useFx } from '@/store/useFxStore'

export default function TradePanel() {
  const fleet = useGameStore(s => s.fleet)
  const marketStock = useGameStore(s => s.marketStock)
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

  const getStock = (pg: { portId: number; goodId: number; stock: number }) =>
    marketStock[`${pg.portId}:${pg.goodId}`] ?? pg.stock

  const handleBuy = (goodId: number, qty: number) => {
    const before = useGameStore.getState().fleet.gold
    buyGood(portId, goodId, qty)
    const spent = before - useGameStore.getState().fleet.gold
    if (spent > 0) {
      useFx.getState().fx(
        { kind: 'float', tone: 'plain', text: `-${spent}`, sub: `${nameOf(goodId)}×${qty}` },
        'coin',
      )
    }
  }

  const handleSell = (goodId: number, qty: number) => {
    const before = useGameStore.getState().fleet.gold
    sellGood(portId, goodId, qty)
    const earned = useGameStore.getState().fleet.gold - before
    if (earned <= 0) return
    useFx.getState().fx(
      { kind: 'float', tone: 'gold', text: `+${earned}`, sub: `${nameOf(goodId)}×${qty}` },
      'sell',
    )
  }

  return (
    <div className="w-80 animate-slide-in-right">
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
              {currentPortGoods.map(pg => {
                const good = goods.find(g => g.id === pg.goodId)
                if (!good) return null
                const stock = getStock(pg)
                // 动态价格：库存越低越贵
                const stockRatio = Math.min(1, stock / pg.stock)
                const surge = 1 + (1 - stockRatio) * 0.4
                const buyPrice = Math.round(pg.price * pg.priceModifier * surge)
                const priceDiff = buyPrice - good.basePrice
                const isCheap = priceDiff < 0
                const isExpensive = priceDiff > 0
                return (
                  <div key={pg.goodId} className="bg-ocean-800/30 rounded p-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gold-200 text-xs font-serif">{good.nameCn}</span>
                      <span className={`flex items-center gap-0.5 text-xs font-serif ${
                        isCheap ? 'text-safe-400' : isExpensive ? 'text-danger-400' : 'text-gold-400'
                      }`}>
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
                            onClick={() => handleBuy(pg.goodId, qty)}
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
              })}
            </div>
          )}

          {tab === 'sell' && (
            <div className="space-y-1.5 max-h-60 overflow-y-auto scrollbar-thin">
              {fleet.cargo.length === 0 ? (
                <p className="text-gold-600 text-xs font-serif text-center py-4">货舱空空如也</p>
              ) : (
                fleet.cargo.map(item => {
                  const good = goods.find(g => g.id === item.goodId)
                  const pg = portGoods.find(p => p.portId === portId && p.goodId === item.goodId)
                  if (!good) return null
                  // 本港不经营的商品按基准价 ×0.5 折价收购（总有出路，但亏）
                  const sellPrice = pg
                    ? Math.round(pg.price * pg.priceModifier * 0.85)
                    : Math.round(good.basePrice * 0.5)
                  return (
                    <div key={item.goodId} className="bg-ocean-800/30 rounded p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-gold-200 text-xs font-serif">
                          {good.nameCn}{!pg && <span className="text-gold-600 text-xs">（本港不收，折价）</span>}
                        </span>
                        <span className="flex items-center gap-0.5 text-safe-400 text-xs font-serif">
                          <Coins size={10} /> {sellPrice}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gold-600 text-xs">持有: {item.quantity}</span>
                        <div className="flex gap-1">
                          {[1, 5, 10].map(qty => (
                            <ActionButton
                              key={qty}
                              onClick={() => handleSell(item.goodId, qty)}
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
                })
              )}
            </div>
          )}
        </div>
      </ParchmentCard>
    </div>
  )
}
