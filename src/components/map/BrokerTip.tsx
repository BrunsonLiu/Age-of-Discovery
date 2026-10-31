import { useMemo, useState } from 'react'
import { Coins, X, Anchor, PackageOpen } from 'lucide-react'
import { useGameStore, selectBestDeal, selectCargoSale, selectReturnLeg } from '@/store/useGameStore'

/**
 * 港口左下角的一张小卡，负责**把一笔生意从头做到尾**。
 *
 * 【两种状态，一个位置】
 *   · 舱里有货 → 「全部出手 · +N 金」：一手交钱，gold 立刻变
 *   · 舱里没货 → 「丝绸 85 → 219 · +670 金 · 买进并起航」：一键买入并设航向
 * 两个状态互斥，所以共用一个位置，不会同时出现两张卡。
 *
 * 【为什么必须替玩家买入/卖出】
 * 实测第一笔钱的闭环：卡片把你送到加的斯只要 2 秒，但**到港时船舱是空的**
 * ——它只设了航向，没帮你买货；到了港也没人提醒你卖。
 * 于是"+670"这个承诺在真实操作里一分钱都落不了地。
 * 4399 那种手感之所以成立，是因为"点一下"就等于"这件事做完了"，
 * 而不是"点一下给你打开一个待办清单"。
 *
 * 【数字必须等于实际到账】
 *   买价 selectBuyPrice · 卖价 selectSellPrice · 数量 min(空舱, 买得起, 本港库存)
 *   天数 calculateSailingDays(真实航线, 真实风向系数)
 * 全部与 buyGood / sellGood 同源，单测直接做"卡片说 +670，实际到账 670"的对账。
 *
 * 【为什么不用 useGameStore(selectXxx) 直接订阅】
 * 选择器里有一次真实航线寻路，而 store 每天数变化都会触发订阅。
 * 改成 useMemo + 少量显式依赖，只在这些东西变了才重算。
 *
 * 【移动端为什么并入底栏容器】
 * 第一版手机用 `bottom-[8.5rem]` 浮动，实测**整条按钮被底栏盖住**
 * （卡片底边 709px、底栏顶边 ~700px），点不到。底栏高度随折行变（42/64/三行），
 * 任何写死的 bottom 都会在某一档算错。改成按文档流往上叠，结构上不可能重叠。
 */
export default function BrokerTip({ placement = 'float' }: { placement?: 'float' | 'stack' }) {
  const portId = useGameStore(s => s.fleet.currentPortId)
  const isSailing = useGameStore(s => s.fleet.isSailing)
  const gold = useGameStore(s => s.fleet.gold)
  const fame = useGameStore(s => s.fleet.fame)
  const marketStock = useGameStore(s => s.marketStock)
  const cargo = useGameStore(s => s.fleet.cargo)
  const pendingVoyage = useGameStore(s => s.pendingVoyage)
  const activePanel = useGameStore(s => s.activePanel)
  const gamePhase = useGameStore(s => s.gamePhase)
  const sailToWaypoint = useGameStore(s => s.sailToWaypoint)
  const buyGood = useGameStore(s => s.buyGood)
  const sellGood = useGameStore(s => s.sellGood)

  const [dismissed, setDismissed] = useState<string | null>(null)

  const lastPortId = useGameStore(s => s.lastPortId)

  const { sale, deal, back } = useMemo(
    () => ({
      sale: selectCargoSale(useGameStore.getState()),
      deal: selectBestDeal(useGameStore.getState()),
      back: selectReturnLeg(useGameStore.getState()),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portId, isSailing, gold, fame, marketStock, cargo, lastPortId],
  )

  if (isSailing || pendingVoyage || activePanel || gamePhase !== 'playing') return null

  // 优先级：把手里的货换成钱 → 接一单新的 → 什么都没得做就指条回程
  const mode: 'sell' | 'buy' | 'return' | null = sale ? 'sell' : deal ? 'buy' : back ? 'return' : null
  if (!mode) return null

  const key = mode === 'sell'
    ? `sell:${portId}:${sale!.qty}:${sale!.total}`
    : mode === 'buy'
      ? `buy:${portId}:${deal!.goodId}:${deal!.toPortId}`
      : `return:${portId}:${back!.toPortId}`
  if (dismissed === key) return null

  const wrapper = placement === 'stack' ? 'px-2 pb-1.5' : 'absolute left-3 bottom-16 z-20'

  const cardStyle = {
    maxWidth: 320,
    background: 'linear-gradient(180deg, #3d2d18 0%, #2b1f10 55%, #1d1509 100%)',
    border: '1px solid rgba(201,169,110,0.42)',
    boxShadow: 'inset 0 1px 0 rgba(255,225,170,0.14), 0 8px 22px rgba(0,0,0,0.6)',
  } as const

  const btnClass =
    'press flex items-center gap-1.5 rounded border border-gold-500/70 bg-gold-600/30 px-3 py-2 font-serif text-[13px] text-gold-100 hover:bg-gold-600/45'

  return (
    <div className={`${wrapper} pointer-events-auto`}>
      <div className="mx-auto rounded-lg overflow-hidden" style={cardStyle}>
        <div className="flex items-center justify-between pl-3 pr-1.5 pt-1.5">
          <span className="font-serif text-[13px] tracking-wide text-gold-400">
            {mode === 'sell' ? '货已到港' : mode === 'buy' ? '掮客递来一单' : '本港行情已平'}
          </span>
          <button
            type="button"
            aria-label="不必了"
            onClick={() => setDismissed(key)}
            className="press p-1.5 text-gold-600 hover:text-gold-300"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        <div className="px-3 pb-2.5">
          {mode === 'sell' ? (
            <>
              <div className="flex items-baseline gap-2 font-serif leading-tight">
                <span className="text-gold-100 text-base">{sale!.items[0].goodName}</span>
                <span className="font-mono text-base text-gold-200 tabular-nums">{sale!.items[0].unit}</span>
                <span className="text-gold-500 text-xs">
                  × {sale!.qty} 件{sale!.items.length > 1 ? `（共 ${sale!.items.length} 种货）` : ''}
                </span>
              </div>
              <div className="mt-1.5 font-serif text-[13px] text-gold-400">本港现价，全部出手</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="flex items-baseline gap-1 font-serif text-gold-200">
                  <Coins size={15} className="translate-y-[1px]" aria-hidden="true" />
                  <span className="font-mono text-lg tabular-nums">+{sale!.total}</span>
                  <span className="text-xs text-gold-400">金</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const pid = portId!
                    for (const it of sale!.items) sellGood(pid, it.goodId, it.qty)
                  }}
                  className={btnClass}
                >
                  <PackageOpen size={14} aria-hidden="true" />
                  全部出手
                </button>
              </div>
            </>
          ) : mode === 'return' ? (
            <>
              <div className="flex items-baseline gap-2 font-serif leading-tight">
                <span className="text-gold-100 text-base">回 {back!.toPortName}</span>
                <span className="text-gold-400 text-[13px]">空船补货</span>
              </div>
              <div className="mt-1.5 font-serif text-[13px] text-gold-400">
                {back!.days} 天 · {back!.nm} 海里 · 那里才有货可进
              </div>
              <div className="mt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() =>
                    sailToWaypoint({
                      latitude: back!.toLat,
                      longitude: back!.toLng,
                      portId: back!.toPortId,
                      name: back!.toPortName,
                    })
                  }
                  className={btnClass}
                >
                  <Anchor size={14} aria-hidden="true" />
                  起航返程
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-2 font-serif leading-tight">
                <span className="text-gold-100 text-base">{deal!.goodName}</span>
                <span className="font-mono text-base text-gold-200 tabular-nums">{deal!.buy}</span>
                <span className="text-gold-500 text-sm">→</span>
                <span className="font-mono text-base text-safe-300 tabular-nums">{deal!.sell}</span>
              </div>
              <div className="mt-1.5 font-serif text-[13px] text-gold-400">
                {deal!.toPortName} · {deal!.days} 天 · {deal!.nm} 海里 · 买 {deal!.qty} 件
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="flex items-baseline gap-1 font-serif text-gold-200">
                  <Coins size={15} className="translate-y-[1px]" aria-hidden="true" />
                  <span className="font-mono text-lg tabular-nums">+{deal!.totalProfit}</span>
                  <span className="text-xs text-gold-400">金</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    // 先按推荐数量买入（真实扣钱、真实占舱），再设航向。
                    // 分两步是为了让"扣了多少钱"在底栏上看得见——
                    // 一键把两件事都做掉，玩家会不知道钱怎么少的。
                    buyGood(portId!, deal!.goodId, deal!.qty)
                    sailToWaypoint({
                      latitude: deal!.toLat,
                      longitude: deal!.toLng,
                      portId: deal!.toPortId,
                      name: deal!.toPortName,
                    })
                  }}
                  className={btnClass}
                >
                  <Anchor size={14} aria-hidden="true" />
                  买进并起航
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
