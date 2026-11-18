import { useState } from 'react'
import { Coins, TrendingUp, TrendingDown, Sprout, HandCoins } from 'lucide-react'
import { useGameStore, selectBuyPrice, selectSellPrice, selectPriceTone, selectBestDeal } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports, portGoods, localSpecialties, localDemands } from '@/data/ports'
import { goods } from '@/data/goods'
import FullScreenPanel from '@/components/ui/FullScreenPanel'
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
function BuyRow({ portId, pg, fleet, usedCapacity, totalCapacity, onBuy, recommended }: {
  portId: number
  pg: (typeof portGoods)[number]
  fleet: { gold: number }
  usedCapacity: number
  totalCapacity: number
  onBuy: (goodId: number, qty: number) => void
  recommended?: boolean
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

  /*
   * 【为什么是账本行，不再是卡片】
   * 面板从 416 窄浮窗改成整屏后，原来那套「名称…价格 / 库存…按钮」两行小卡
   * 在 1024 正文里读起来像六个孤岛：每张卡内部是 justify-between，
   * 中间空出 400px，六张卡之间没有共同的列线，眼睛找不到"价格在第几列"。
   * 账本行共用一条表头与四条列线，横向扫一列就能比价 —— 这也是玩家真正在做的事。
   */
  return (
    <div
      className={`relative grid items-center gap-x-2 gap-y-1 px-3 py-2.5 border-t border-gold-700/25 even:bg-white/[0.014]
        grid-cols-[minmax(0,1fr)_4rem_7.5rem]
        sm:grid-cols-[minmax(0,1fr)_4.5rem_6rem_9.5rem]
        transition-colors ${recommended ? 'bg-gold-700/12' : 'hover:bg-gold-700/8'}`}
      data-testid="trade-buy-row"
      data-good-id={pg.goodId}
      data-recommended={recommended ? '1' : undefined}
    >
      {/* 推荐项左侧一道金条：行底色在深棕上不够醒目，竖条是不看文字也能扫到的信号 */}
      {recommended && (
        <span aria-hidden="true" className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-gold-400/80" />
      )}

      <div className="min-w-0">
        <span className="text-gold-100 text-[14px] font-serif leading-none">
          {good.nameCn}
          {/* 标出"掮客让你买的这一件"。没有这个标记时，玩家在五件货里只能靠
              "哪件便宜"来选——实测开局最便宜的烟草 52 金，卖到最近的加的斯只
              +2/件；而丝绸 89 金卖过去 +77/件。便宜 ≠ 能赚，这一步需要算，
              而玩家不该算。 */}
          {recommended && (
            <span className="ml-1.5 text-gold-400 text-[12px] font-serif">· 掮客推荐</span>
          )}
        </span>
        {/* 手机上省掉"库存"整列，把它并进名称下方 */}
        <span className="sm:hidden block text-gold-500 text-[12px] font-serif mt-0.5 tabular-nums">
          库存 {stock}
        </span>
      </div>

      <span className="hidden sm:block text-right text-gold-500 text-[13px] font-serif tabular-nums">
        {stock}
      </span>

      <span
        className={`flex items-center justify-end gap-1 text-[15px] font-serif tabular-nums ${TONE_CLASS[tone]}`}
        data-price={buyPrice}
        data-tone={tone}
        title={TONE_HINT[tone]}
      >
        {tone === 'cheap' && <TrendingDown size={12} />}
        {tone === 'expensive' && <TrendingUp size={12} />}
        {buyPrice}
        <Coins size={11} className="opacity-60" />
      </span>

      <div className="flex gap-1 justify-end">
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
            className="w-9 sm:w-11 !px-0 justify-center"
          >
            +{qty}
          </ActionButton>
        ))}
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
    <div
      className="relative grid items-center gap-x-2 gap-y-1 px-3 py-2.5 border-t border-gold-700/25 even:bg-white/[0.014]
        grid-cols-[minmax(0,1fr)_4rem_7.5rem]
        sm:grid-cols-[minmax(0,1fr)_4.5rem_6rem_9.5rem]
        transition-colors hover:bg-gold-700/8"
      data-testid="trade-sell-row"
      data-good-id={item.goodId}
    >
      <div className="min-w-0">
        <span className="text-gold-100 text-[14px] font-serif leading-none">
          {good.nameCn}
          {!tradedHere && <span className="text-gold-500 text-[12px]"> · 本港不收，折价</span>}
        </span>
        <span className="sm:hidden block text-gold-500 text-[12px] font-serif mt-0.5 tabular-nums">
          持有 {item.quantity}
        </span>
      </div>

      <span className="hidden sm:block text-right text-gold-500 text-[13px] font-serif tabular-nums">
        {item.quantity}
      </span>

      <span
        className="flex items-center justify-end gap-1 text-safe-400 text-[15px] font-serif tabular-nums"
        data-price={sellPrice}
      >
        {sellPrice}
        <Coins size={11} className="opacity-60" />
      </span>

      <div className="flex gap-1 justify-end">
        {[1, 5, 10].map(qty => (
          <ActionButton
            key={qty}
            onClick={() => onSell(item.goodId, qty)}
            disabled={item.quantity < qty}
            variant="secondary"
            className="w-9 sm:w-11 !px-0 justify-center"
          >
            -{qty}
          </ActionButton>
        ))}
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
  /*
   * 航线几何就绪与否（第 33 轮）。
   *
   * 海陆掩码异步到位之前，selectBestDeal 算出的航程是**大圆直线**：
   * 埃尔米纳 → 里斯本 报 2157 海里（横穿撒哈拉），就绪后才是 2903 海里。
   * 天数是由航程算出来的，所以那一档的「N 天」也是错的。
   *
   * 这里与左下角掮客卡、主屏常驻条用同一条规则：**没就绪就不报**。
   * 宁可少一个数字，也不显示少报 35% 的数字。
   *
   * 【为什么这行必须在提前 return 之前】下面有一句 `if (!portId) return null`，
   * hook 写在它后面就是条件调用——React 会直接抛 "Rendered fewer hooks than expected"。
   */
  const landDataReady = useMapStore(s => s.landDataReady)

  const portId = fleet.currentPortId
  if (!portId) return null

  /*
   * 掮客这一单：与左下角那张掮客卡**同一个函数**（selectBestDeal），
   * 所以两边说的货、数量、目的地、利润必然一致——不会出现"卡片说丝绸、
   * 面板标烟草"这种自相矛盾。
   *
   * 为什么不订阅 marketStock：它变了但 fleet 没变时确实不会重渲染，
   * 但买卖本身一定会改 fleet（金币/货舱），所以每一次真实交易后这里都会重算。
   * 少订阅一个对象，少一次全局重渲染。
   */
  const deal = selectBestDeal(useGameStore.getState())
  const dealDays = landDataReady && deal ? deal.days : null

  /*
   * 推荐那件必须排第一。实测它在第三行时，面板滚动区只有 240px 高，
   * `+1/+5/+10` 三个按钮刚好落在折叠线以下——玩家看见"掮客说买丝绸"，
   * 伸手却点不到，得先滚动。推荐不能只写在标题上。
   */
  const currentPortGoods = portGoods
    .filter(pg => pg.portId === portId)
    .sort((a, b) => Number(b.goodId === deal?.goodId) - Number(a.goodId === deal?.goodId))
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

  const handleSell = (goodId: number, qty: number) => {    const before = useGameStore.getState().fleet.gold
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
    <FullScreenPanel
      testId="trade-panel"
      width="lg"
      title="商品交易"
      subtitle={`${ports.find(p => p.id === portId)?.nameCn ?? ''} · 第 ${fleet.day} 天`}
      footer="点 +1 / +5 / +10 直接成交；屏幕上的价格就是结算价"
      onClose={() => setActivePanel(null)}
    >
      <div className="space-y-3">
        {/*
          【三格数据条】原来金币与舱位是 13px 的一行小字浮在顶上，
          在整屏里几乎读不到。金币是这一屏每一次点击的约束条件，
          它应该是第一眼看到的东西 —— 三格等分的仪表条，数字用 20px。
          第三格给「掮客这一单」，玩家进交易面板就是为了这一单。
        */}
        <div className="grid grid-cols-3 rounded-sm border border-gold-700/25 bg-black/25 overflow-hidden
          divide-x divide-gold-700/25">
          <div className="px-3 md:px-4 py-2.5 min-w-0">
            <div className="text-[12px] tracking-[0.1em] text-gold-600 font-serif">金币</div>
            <div className="flex items-baseline gap-1.5 mt-0.5" data-testid="trade-gold">
              <span className="text-gold-200 text-[18px] md:text-[21px] font-serif tabular-nums leading-none">
                {fleet.gold}
              </span>
              <Coins size={12} className="text-gold-500 shrink-0" />
            </div>
          </div>
          <div className="px-3 md:px-4 py-2.5 min-w-0">
            <div className="text-[12px] tracking-[0.1em] text-gold-600 font-serif">货舱</div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-gold-200 text-[18px] md:text-[21px] font-serif tabular-nums leading-none">
                {usedCapacity}
              </span>
              <span className="text-gold-500 text-[13px] font-serif tabular-nums">/ {totalCapacity}</span>
            </div>
          </div>
          <div className="px-3 md:px-4 py-2.5 min-w-0">
            <div className="text-[12px] tracking-[0.1em] text-gold-600 font-serif truncate">
              {tab === 'buy' ? '掮客这一单' : '船舱货值'}
            </div>
            <div className="mt-0.5 truncate">
              {tab === 'buy' && deal ? (
                <span className="text-gold-200 text-[18px] md:text-[21px] font-serif tabular-nums leading-none">
                  {deal.totalProfit}
                  <span className="text-gold-500 text-[12px] ml-1">
                    金{dealDays != null ? ` / ${dealDays} 天` : ''}
                  </span>
                </span>
              ) : (
                <span className="text-gold-400 text-[15px] font-serif leading-none">
                  {fleet.cargo.reduce((n, c) => n + c.quantity, 0)} 件
                </span>
              )}
            </div>
          </div>
        </div>

        {/*
          行情一行：原来是一块三行的提示卡，占了 90px 却只说了三句短话。
          合成一行、用 · 分隔，宽屏能全放下，窄屏自然折行。
        */}
        {(specialties.length > 0 || demands.length > 0 || sellableHigh.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-serif px-1">
            {specialties.length > 0 && (
              <span className="text-safe-400 flex items-center gap-1">
                <Sprout size={11} className="shrink-0" />本地出产 {specialties.join('、')}
              </span>
            )}
            {demands.length > 0 && (
              <span className="text-gold-300 flex items-center gap-1">
                <HandCoins size={11} className="shrink-0" />高价收购 {demands.slice(0, 3).join('、')}
              </span>
            )}
            {sellableHigh.length > 0 && (
              <span className="text-gold-400 italic">
                船上 {sellableHigh.join('、')} 在此可卖高价
              </span>
            )}
          </div>
        )}

        {/* 页签与掮客建议同一行（手机上竖排）：左边是"我在做什么"，右边是"建议做什么" */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3">
          {/*
           * 【买卖页签：凸/凹，不是深/浅】
           * 原来选中态是 bg-gold-700/40，未选中是 .inlay--flat —— 两者混合到面板底色后
           * 只差几个色阶，看不出哪一个被按下了（选错标签的代价是买成卖）。
           * 色差在深棕底上是弱信号，凸凹才是强信号：
           *   选中 = 铜牌（.plate-btn）+ 亮字 ；未选中 = 挖空的槽（.inlay--flat）+ 暗字
           */}
          <div className="shrink-0 inline-flex rounded-sm border border-gold-700/30 bg-black/30 p-0.5">
            <button
              onClick={() => setTab('buy')}
              aria-pressed={tab === 'buy'}
              className={`px-7 py-1.5 text-[13px] font-serif rounded-sm transition-all duration-150 ${
                tab === 'buy' ? 'plate-btn text-gold-200' : 'text-gold-500 hover:text-gold-300'
              }`}
            >
              购买
            </button>
            <button
              onClick={() => setTab('sell')}
              aria-pressed={tab === 'sell'}
              className={`px-7 py-1.5 text-[13px] font-serif rounded-sm transition-all duration-150 ${
                tab === 'sell' ? 'plate-btn text-gold-200' : 'text-gold-500 hover:text-gold-300'
              }`}
            >
              出售
            </button>
          </div>

          {tab === 'buy' && deal && (
            <div
              className="flex-1 min-w-0 rounded-sm border border-gold-600/35 bg-gold-700/10 px-3 py-1.5"
              data-testid="trade-recommend"
            >
              {/*
                一行说完。原来是两行（建议 + 价差），在 1440 下这块比左边的
                页签高 10px，两者顶对齐时底部差一条边 —— 一排放两个控件，
                高度不一致就永远是"两个按钮没对齐"。
                价差不能删（它决定玩家在哪个港买），并到句尾用 · 断开。
              */}
              <p className="text-gold-300 text-[13px] font-serif flex items-center gap-1 leading-none">
                <HandCoins size={12} className="shrink-0" />
                <span className="min-w-0">
                  掮客说：买 <span className="text-gold-100">{deal.goodName}</span> {deal.qty} 件，运到{' '}
                  <span className="text-gold-100">{deal.toPortName}</span> 卖
                  <span className="text-gold-500 mx-1.5">·</span>
                  <span className="text-gold-500 tabular-nums">本港 {deal.buy} / 那边 {deal.sell}</span>
                </span>
              </p>
            </div>
          )}
        </div>

        {/*
          【账本容器】表头 + 行，共用同一条列宽定义（见 BuyRow / SellRow 的 grid-cols）。
          表头 sticky：滚到第十行时玩家仍然知道哪一列是价格。
        */}
        <div className="rounded-sm border border-gold-700/25 overflow-hidden bg-black/15">
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_4.5rem_6rem_9.5rem] items-center gap-x-2
            px-3 h-9 bg-black/35 border-b border-gold-700/30
            text-[12px] tracking-[0.1em] font-serif text-gold-600">
            <span>货物</span>
            <span className="text-right">{tab === 'buy' ? '库存' : '持有'}</span>
            <span className="text-right">单价</span>
            <span className="text-center">{tab === 'buy' ? '买入' : '卖出'}</span>
          </div>

          {tab === 'buy' && (
            /* 不再套一层内滚动：FullScreenPanel 的正文区已经是滚动容器，
               在它里面再放一条更矮的滚动区就是两层滚动条。
               列数由行自己决定（宽屏四列 / 手机三列），这里只负责排。 */
            <div>
              {/*
               * 推荐那件必须排第一。实测它在第三行时，面板滚动区只有 240px 高，
               * `+1/+5/+10` 三个按钮刚好落在折叠线以下——玩家看见"掮客说买丝绸"，
               * 伸手却点不到，得先滚动。推荐不能只写在标题上。
               */}
              {currentPortGoods.map(pg => (
                <BuyRow
                  key={pg.goodId}
                  portId={portId}
                  pg={pg}
                  fleet={fleet}
                  usedCapacity={usedCapacity}
                  totalCapacity={totalCapacity}
                  onBuy={handleBuy}
                  recommended={deal?.goodId === pg.goodId}
                />
              ))}
            </div>
          )}

          {tab === 'sell' && (
            <div>
              {fleet.cargo.length === 0 ? (
                <p className="text-gold-500 text-[13px] font-serif text-center py-10">
                  货舱空空如也 —— 先回到「购买」进一批货
                </p>
              ) : (
                fleet.cargo.map(item => (
                  <SellRow key={item.goodId} portId={portId} item={item} onSell={handleSell} />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </FullScreenPanel>
  )
}
