import { useState } from 'react'
import { Coins, Package, TrendingUp, TrendingDown } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { portGoods } from '@/data/ports'
import { goods } from '@/data/goods'
import { calculateBuyPrice, calculateSellPrice } from '@/utils/trade'
import ParchmentCard from '@/components/ui/ParchmentCard'
import ActionButton from '@/components/ui/ActionButton'

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

  const handleBuy = (goodId: number, qty: number) => {
    buyGood(portId, goodId, qty)
  }

  const handleSell = (goodId: number, qty: number) => {
    sellGood(portId, goodId, qty)
  }

  return (
    <div className="w-80 animate-slide-in-right">
      <ParchmentCard title="商品交易" onClose={() => setActivePanel(null)}>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gold-400 font-serif">
            <span className="flex items-center gap-1"><Coins size={12} /> {fleet.gold} 金币</span>
            <span className="flex items-center gap-1"><Package size={12} /> {usedCapacity}/{totalCapacity}</span>
          </div>

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
                const buyPrice = calculateBuyPrice(pg, good)
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
                      <span className="text-gold-600 text-xs">库存: {pg.stock}</span>
                      <div className="flex gap-1">
                        {[1, 5, 10].map(qty => (
                          <ActionButton
                            key={qty}
                            onClick={() => handleBuy(pg.goodId, qty)}
                            disabled={fleet.gold < buyPrice * qty || usedCapacity + qty > totalCapacity || pg.stock < qty}
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
                  if (!good || !pg) return null
                  const sellPrice = calculateSellPrice(pg, good)
                  return (
                    <div key={item.goodId} className="bg-ocean-800/30 rounded p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-gold-200 text-xs font-serif">{good.nameCn}</span>
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
