import { useState } from 'react'
import { Coins, Package, TrendingUp, TrendingDown, Sprout, HandCoins } from 'lucide-react'
import { useGameStore, selectBuyPrice, selectSellPrice, selectPriceTone } from '@/store/useGameStore'
import { portGoods, localSpecialties, localDemands } from '@/data/ports'
import { goods } from '@/data/goods'
import ParchmentCard from '@/components/ui/ParchmentCard'
import ActionButton from '@/components/ui/ActionButton'
import ScrollFade from '@/components/ui/ScrollFade'
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
  const tone = useGameStore(s => selectPriceTone(s, portId, pg.goodId))
  const stock = useGameStore(s => s.marketStock[`${portId}:${pg.goodId}`] ?? pg.stock)
  const good = goods.find(g => g.id === pg.goodId)
  if (!good || buyPrice == null) return null

  // 颜色 = 可行动的市场信号：绿 = 全港最低价，红 = 全港最高价
  const TONE_CLASS = { cheap: 'text-safe-400', expensive: 'text-danger-400', normal: 'text-gold-400' }
  const TONE_HINT = {
    cheap: '全港最低价——要买这个，就在这里买',
    expensive: '全港最高价——别在这里买',
    normal: '价格居中',
  }

  return (
    <div className="inlay--flat rounded p-2" data-testid="trade-buy-row" data-good-id={pg.goodId}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-gold-200 text-[14px] font-serif">{good.nameCn}</span>
        <span
          className={`flex items-center gap-1 text-[15px] font-serif ${TONE_CLASS[tone]}`}
          data-price={buyPrice}
          data-tone={tone}
          title={TONE_HINT[tone]}
        >
          {tone === 'cheap' && <TrendingDown size={12} />}
          {tone === 'expensive' && <TrendingUp size={12} />}
          <Coins size={12} /> {buyPrice}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-gold-400 text-[13px]">库存: {stock}</span>
        <div className="flex gap-1">
          {/*
           * 三个数量按钮必须等宽：ActionButton 是 px-4 + 自适应宽度，
           * "+1" 比 "+10" 窄 8px，三个并排时右边缘参差，整排读起来是"没对齐的三个东西"。
           * 固定 44px（触摸最小尺寸）+ !px-0 把内边距让给宽度。
           */}
          {[1, 5, 10].map(qty => (
            <ActionButton
              key={qty}
              onClick={() => onBuy(pg.goodId, qty)}
              disabled={fleet.gold < buyPrice * qty || usedCapacity + qty > totalCapacity || stock < qty}
              variant="secondary"
              className="w-11 !px-0 justify-center"
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
    <div className="inlay--flat rounded p-2" data-testid="trade-sell-row" data-good-id={item.goodId}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-gold-200 text-[14px] font-serif">
          {good.nameCn}{!tradedHere && <span className="text-gold-400 text-[13px]">（本港不收，折价）</span>}
        </span>
        <span className="flex items-center gap-1 text-safe-400 text-[15px] font-serif" data-price={sellPrice}>
          <Coins size={12} /> {sellPrice}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-gold-400 text-[13px]">持有: {item.quantity}</span>
        <div className="flex gap-1">
          {[1, 5, 10].map(qty => (
            <ActionButton
              key={qty}
              onClick={() => onSell(item.goodId, qty)}
              disabled={item.quantity < qty}
              variant="secondary"
              className="w-11 !px-0 justify-center"
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
    <div className="w-full md:w-80 animate-slide-in-right" data-testid="trade-panel">
      <ParchmentCard title="商品交易" onClose={() => setActivePanel(null)}>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[13px] text-gold-400 font-serif">
            <span className="flex items-center gap-1"><Coins size={12} /> {fleet.gold} 金币</span>
            <span className="flex items-center gap-1"><Package size={12} /> {usedCapacity}/{totalCapacity}</span>
          </div>

          {(specialties.length > 0 || demands.length > 0) && (
            <div className="inlay border border-gold-700/20 rounded p-2 space-y-1">
              {specialties.length > 0 && (
                <p className="text-safe-400 text-[13px] font-serif flex items-start gap-1">
                  <Sprout size={11} className="mt-0.5 shrink-0" />
                  <span>本地出产：{specialties.join('、')}（价格通常偏低）</span>
                </p>
              )}
              {demands.length > 0 && (
                <p className="text-gold-300 text-[13px] font-serif flex items-start gap-1">
                  <HandCoins size={11} className="mt-0.5 shrink-0" />
                  <span>高价收购：{demands.slice(0, 3).join('、')}（在这里卖更划算）</span>
                </p>
              )}
              {sellableHigh.length > 0 && (
                <p className="text-gold-400 text-[13px] font-serif italic">
                  ✓ 你船上的 {sellableHigh.join('、')} 在此可卖高价
                </p>
              )}
            </div>
          )}

          {/*
           * 【买卖页签：凸/凹，不是深/浅】
           * 原来选中态是 bg-gold-700/40，未选中是 .inlay--flat —— 两者混合到面板底色后
           * 只差几个色阶，放大截图看不出哪一个被按下了（选错标签的代价是买成卖）。
           * 色差在深棕底上是弱信号，凸凹才是强信号：
           *   选中 = 铜牌（.plate-btn，与次级按钮同一材质）+ 亮字
           *   未选中 = 挖空的槽（.inlay--flat）+ 暗字
           */}
          <div className="flex gap-1">
            <button
              onClick={() => setTab('buy')}
              aria-pressed={tab === 'buy'}
              className={`flex-1 py-1.5 text-[13px] font-serif rounded transition-all duration-150 ${
                tab === 'buy' ? 'plate-btn text-gold-200' : 'inlay--flat text-gold-500 hover:text-gold-300'
              }`}
            >
              购买
            </button>
            <button
              onClick={() => setTab('sell')}
              aria-pressed={tab === 'sell'}
              className={`flex-1 py-1.5 text-[13px] font-serif rounded transition-all duration-150 ${
                tab === 'sell' ? 'plate-btn text-gold-200' : 'inlay--flat text-gold-500 hover:text-gold-300'
              }`}
            >
              出售
            </button>
          </div>

          {tab === 'buy' && (
            <ScrollFade className="space-y-1.5 max-h-60 overflow-y-auto scroll-parchment">
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
            </ScrollFade>
          )}

          {tab === 'sell' && (
            <ScrollFade className="space-y-1.5 max-h-60 overflow-y-auto scroll-parchment">
              {fleet.cargo.length === 0 ? (
                <p className="text-gold-400 text-[13px] font-serif text-center py-4">货舱空空如也</p>
              ) : (
                fleet.cargo.map(item => (
                  <SellRow key={item.goodId} portId={portId} item={item} onSell={handleSell} />
                ))
              )}
            </ScrollFade>
          )}
        </div>
      </ParchmentCard>
    </div>
  )
}
