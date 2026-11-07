import { useMemo, useState } from 'react'
import { Coins, X, Anchor, PackageOpen, ChevronDown, ChevronUp } from 'lucide-react'
import { useGameStore, selectBestDeal, selectCargoSale, selectDealTalentBonus, selectReturnLeg } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { useIsMobile } from '@/hooks/useIsMobile'

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
 *   天数 voyageDays(真实航线, 真实风向系数, 当前天候)  ← 与出航计划面板同口径
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
  /*
   * 手机上默认折叠成一行。
   *
   * 【为什么】实测 390×844：底部固定容器高 383px（占屏 45%），其中这张卡占 210px。
   * 卡里真正需要"立刻决定"的只有两件事：这一单赚多少、按哪个按钮。
   * 航线天数、天赋多赚多少、价格箭头这些都是"想细看时再看"的信息。
   * 折叠后一行约 44px，地图立刻多出 166px —— 而主操作仍然一键可达，
   * 短闭环没有被破坏（展开只是为了让想看的人看细节）。
   * 桌面端不折叠：那里横向空间充足，卡片浮动在左下角不挡地图。
   */
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const compact = isMobile && placement === 'stack' && !open

  const lastPortId = useGameStore(s => s.lastPortId)
  /*
   * 天候也要进依赖：卡上的「N 天」含天候倍率（暴风雨时天数翻倍）。
   * 原来依赖里没有 weather，于是「在港休整一天」触发 advanceDay → advanceWeather
   * 之后，卡片仍显示旧天候下的天数——玩家看到的天数和点开面板后对不上。
   */
  const weather = useGameStore(s => s.weather)
  /*
   * 航线几何就绪与否也要进依赖（第 33 轮）。
   *
   * 【为什么】海陆掩码是异步加载的，在它到位之前算出来的航程是**大圆直线**：
   * 埃尔米纳 → 里斯本 掩码未到位报 2157 海里（横穿撒哈拉），
   * 就绪后才是 2903 海里（绕开陆地），差 35%。
   *
   * 原来这里既不等就绪、也不在就绪后重算，于是卡上会**一直挂着那个少报 35% 的直线里程**——
   * 玩家照着它备粮水，到海上才发现要多走三分之一的日子。
   *
   * 现在：几何没就绪就不报里程与天数（宁可少一个数字，也不报错数字），
   * 就绪后 landDataReady 由 false 翻成 true，依赖变了 → 自动重算成真值。
   */
  const landDataReady = useMapStore(s => s.landDataReady)

  const { sale, deal, back, talentBonus } = useMemo(
    () => {
      const st = useGameStore.getState()
      const d = selectBestDeal(st)
      return {
        sale: selectCargoSale(st),
        deal: d,
        back: selectReturnLeg(st),
        talentBonus: d ? selectDealTalentBonus(st, d) : null,
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portId, isSailing, gold, fame, marketStock, cargo, lastPortId, weather, landDataReady],
  )

  /*
   * 「N 天 · N 海里」这一段：几何没就绪时**整段不报**。
   *
   * 宁可少一个数字，也不显示少报 35% 的直线距离（详见 landDataReady 处的说明）。
   * 主屏常驻条与这里用的是同一条规则（见 hooks/useVoyageNext）。
   */
  const legDeal = landDataReady && deal ? `${deal.days} 天 · ${deal.nm} 海里` : ''
  const legBack = landDataReady && back ? `${back.days} 天 · ${back.nm} 海里` : ''

  if (isSailing || pendingVoyage || activePanel || gamePhase !== 'playing') return null

  /*
   * 兜底文案从「本港行情已平」改成「这里没有适合你的货」。
   *
   * 【为什么原来的说法在撒谎】selectBestDeal 返回 null 有**三种**完全不同的原因：
   *   ① 这一港确实没有能赚的货（加的斯在改价格表前就是：最好一条 2 金/天）
   *   ② 有货，但玩家买不起（金不够一件）
   *   ③ 有货，但装不下（舱满）
   * 原来三种情况都说"行情已平"，②③ 时它就是在编一个市场事实。
   * 玩家带着 500 金站在加的斯，屏幕写"本港行情已平"，而其实那里有一单军火生意
   * 只是他做不起 —— 这正是本项目最不能接受的那种"屏幕在骗人"。
   * 新文案只陈述"对你而言没有合适的"，不声称市场状态；副行仍然给下一步去哪。
   */
  // 优先级：把手里的货换成钱 → 接一单新的 → 什么都没得做就指条回程
  const mode: 'sell' | 'buy' | 'return' | null = sale ? 'sell' : deal ? 'buy' : back ? 'return' : null
  if (!mode) return null

  const key = mode === 'sell'
    ? `sell:${portId}:${sale!.qty}:${sale!.total}`
    : mode === 'buy'
      ? `buy:${portId}:${deal!.goodId}:${deal!.toPortId}:${talentBonus ?? 0}`
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
    'press pointer-events-auto flex items-center gap-1.5 rounded border border-gold-500/70 bg-gold-600/30 px-3 py-2 font-serif text-[13px] text-gold-100 hover:bg-gold-600/45'

  /*
   * 浮条整体不接点击，只有按钮接。
   *
   * 【为什么】这张卡是**压在海图上的 HUD**，不是页面本身。
   * 整张卡 pointer-events-auto 的时候，它盖住的地图区域就变成了死区——
   * 2026-11-07 实测：3D 视图里一件海上遗物正好投影到左下角，
   * 它的点击被掮客卡的标题行「掮客递来一单」吃掉，巡检报「被遮挡 1」。
   *
   * ��条卡自己的文字（标题、货名、金额）**点了没有任何反应**，
   * 让它吃掉点击只会挡住玩家真正想点的东西（地图上的实物）。
   * 所以规则与通知浮窗一致（见 components/ui/NotificationToast.tsx：
   * 「通知是纯展示，绝不能挡住玩家的点击」）：
   *   浮条 = pointer-events-none，**只有按钮** = pointer-events-auto。
   *
   * 代价：点浮条的文字会落到地图上（可能误触"选地点"）。
   * 换来的是：地图上任何被浮条盖住的东西都还点得到。
   */

  /*
   * 主操作与一行摘要。
   *
   * 抽出来是为了让折叠态和展开态**调同一个闭包**——
   * 如果折叠态自己再写一遍"买进并起航"，两处迟早分叉：
   * 一边点下去真的买了货、另一边只设了航向，而界面上长得一模一样。
   */
  const action = mode === 'sell'
    ? {
      label: '全部出手',
      icon: <PackageOpen size={14} aria-hidden="true" />,
      run: () => {
        const pid = portId!
        for (const it of sale!.items) sellGood(pid, it.goodId, it.qty)
      },
    }
    : mode === 'return'
      ? {
        label: '起航返程',
        icon: <Anchor size={14} aria-hidden="true" />,
        run: () => sailToWaypoint({
          latitude: back!.toLat,
          longitude: back!.toLng,
          portId: back!.toPortId,
          name: back!.toPortName,
        }),
      }
      : {
        label: '买进并起航',
        icon: <Anchor size={14} aria-hidden="true" />,
        run: () => {
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
        },
      }

  /*
   * 一行摘要拆成「可以截断的部分」和「绝不能截断的部分」。
   *
   * 第一版把整句塞进一个 truncate 里，实测 390px 宽时显示成
   * 「丝绸 85→174 · 1 天…」——**把 +445 金切掉了**。
   * 一张推荐卡的摘要里，被截掉的恰好是玩家唯一想看的那个数。
   * 现在货物名与航程可以缩，金额单独作为不收缩的一段。
   */
  const summaryMain = mode === 'sell'
    ? `${sale!.items[0].goodName} × ${sale!.qty}`
    : mode === 'buy'
      ? deal!.goodName
      : `回 ${back!.toPortName}`
  const summaryValue = mode === 'sell'
    ? `+${sale!.total} 金`
    : mode === 'buy'
      ? `+${deal!.totalProfit} 金`
      // 几何没就绪时天数算不准（会是大圆直线的天数），宁可空着
      : (landDataReady ? `${back!.days} 天` : '')

  if (compact) {
    return (
      <div className={`${wrapper} pointer-events-none`}>
        <div className="mx-auto rounded-lg overflow-hidden pointer-events-none" style={cardStyle} data-broker-compact="1">
          <div className="flex items-center gap-2 pl-3 pr-1 py-1.5">
            <span className="min-w-0 flex-1 flex items-baseline gap-1.5">
              <span className="font-serif text-[13px] text-gold-200 truncate">{summaryMain}</span>
              <span className={`shrink-0 font-mono text-[13px] tabular-nums ${mode === 'return' ? 'text-gold-400' : 'text-safe-300'}`}>
                {summaryValue}
              </span>
            </span>
            <button type="button" onClick={action.run} className={`${btnClass} shrink-0`}>
              {action.icon}
              {action.label}
            </button>
            <button
              type="button"
              aria-label="展开这一单的细节"
              onClick={() => setOpen(true)}
              className="press pointer-events-auto p-1.5 text-gold-500 hover:text-gold-300 shrink-0"
            >
              <ChevronDown size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="不必了"
              onClick={() => setDismissed(key)}
              className="press pointer-events-auto p-1.5 text-gold-600 hover:text-gold-300 shrink-0"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`${wrapper} pointer-events-none`}>
      <div className="mx-auto rounded-lg overflow-hidden pointer-events-none" style={cardStyle} data-broker-compact="0">
        <div className="flex items-center justify-between pl-3 pr-1.5 pt-1.5">
          <span className="font-serif text-[13px] tracking-wide text-gold-400">
            {mode === 'sell' ? '货已到港' : mode === 'buy' ? '掮客递来一单' : '这里没有适合你的货'}
          </span>
          <span className="flex items-center">
            {isMobile && (
              <button
                type="button"
                aria-label="收起这一单"
                onClick={() => setOpen(false)}
                className="press pointer-events-auto p-1.5 text-gold-500 hover:text-gold-300"
              >
                <ChevronUp size={15} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              aria-label="不必了"
              onClick={() => setDismissed(key)}
              className="press pointer-events-auto p-1.5 text-gold-600 hover:text-gold-300"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </span>
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
                {legBack ? `${legBack} · ` : ''}那里才有货可进
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
                {deal!.toPortName}{legDeal ? ` · ${legDeal}` : ''} · 买 {deal!.qty} 件
              </div>
              {/*
                天赋的痕迹。这一行是整个开局选择唯一的"兑现时刻"：
                商界血脉的 −5% 藏在动态价格里，玩家从 85→219 这种数字里
                永远看不出哪一部分是它带来的。这里用反事实算出确切金额。
              */}
              {talentBonus != null && (
                <div className="mt-1 font-serif text-[12px] ink-good">
                  商界血脉 · 这一单多赚 {talentBonus} 金
                </div>
              )}
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
