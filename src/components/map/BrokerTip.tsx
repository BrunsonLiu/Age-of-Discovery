import { useMemo, useState } from 'react'
import { Coins, X, Anchor } from 'lucide-react'
import { useGameStore, selectBestDeal } from '@/store/useGameStore'

/**
 * 「掮客推荐」：港口里总有人凑上来递一单生意。
 *
 * 【为什么需要它】
 * 量化过新玩家的第一分钟：到地图后 12 秒内被 7 个全屏层打断，而 75 秒里
 * 一分钱没进账、飘字 0 次。4399 那一类游戏的手感相反——手上一直在动、
 * 结果立刻回来，而且**从不让新手自己找"该干什么"**：第一关永远是送上门的一次成功。
 *
 * 这张卡就是那次成功：买什么、卖到哪、几天到、赚多少，四件事一次说完，
 * 点一下直接设航向。数字全部来自 selectBestDeal（与买卖结算同源），
 * 所以卡片说赚 670 就一定到账 670（有单测锁死）。
 *
 * 【为什么不用 useGameStore(selectBestDeal) 直接订阅】
 * 选择器里有一次真实航线寻路（绕陆地），而 store 每天数变化都会触发订阅回调。
 * 挂在那里等于每秒几次寻路。改成 useMemo + 少量显式依赖，只在这些东西变了才重算。
 *
 * 【移动端为什么不用绝对定位】
 * 第一版手机上是 `bottom-[8.5rem]` 的浮动卡，实测**整条按钮被底栏盖住**
 * （卡片底边 709px，底栏顶边 ~700px），「就这一趟」既看不见也点不到。
 * 底栏高度随折行变化（42 / 64 / 三行），任何写死的 bottom 值都会在某档算错。
 * 现在移动端直接**并入底栏那个 fixed 容器往上叠**，由文档流决定位置，
 * 不存在算错的可能（结构级适配，而非样式级微调）。
 */
export default function BrokerTip({ placement = 'float' }: { placement?: 'float' | 'stack' }) {
  const portId = useGameStore(s => s.fleet.currentPortId)
  const isSailing = useGameStore(s => s.fleet.isSailing)
  const gold = useGameStore(s => s.fleet.gold)
  const fame = useGameStore(s => s.fleet.fame)
  const marketStock = useGameStore(s => s.marketStock)
  const pendingVoyage = useGameStore(s => s.pendingVoyage)
  const activePanel = useGameStore(s => s.activePanel)
  const gamePhase = useGameStore(s => s.gamePhase)
  const sailToWaypoint = useGameStore(s => s.sailToWaypoint)

  const [dismissed, setDismissed] = useState<string | null>(null)

  const deal = useMemo(
    () => selectBestDeal(useGameStore.getState()),
    // 只在这几样东西变化时重算：港口、金币、库存、声望（影响价格系数）、是否在航行
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portId, isSailing, gold, fame, marketStock],
  )

  if (!deal || isSailing || pendingVoyage || activePanel || gamePhase !== 'playing') return null

  // 关掉的状态按「港口 + 这一单」记：换港或行情变了会重新出现，
  // 免得玩家关一次就再也见不到推荐。
  const key = `${portId}:${deal.goodId}:${deal.toPortId}`
  if (dismissed === key) return null

  const wrapper =
    placement === 'stack'
      ? 'px-2 pb-1.5'
      : 'absolute left-3 bottom-16 z-20'

  return (
    <div className={`${wrapper} pointer-events-auto`}>
      <div
        className="mx-auto rounded-lg overflow-hidden"
        style={{
          maxWidth: 300,
          // 不透明三段渐变做出厚度（半透明底放什么纹理都像贴纸）
          background: 'linear-gradient(180deg, #3d2d18 0%, #2b1f10 55%, #1d1509 100%)',
          border: '1px solid rgba(201,169,110,0.42)',
          boxShadow: 'inset 0 1px 0 rgba(255,225,170,0.14), 0 8px 22px rgba(0,0,0,0.6)',
        }}
      >
        <div className="flex items-center justify-between pl-3 pr-1.5 pt-1.5">
          <span className="font-serif text-xs tracking-wide text-gold-500">掮客递来一单</span>
          <button
            type="button"
            aria-label="不必了"
            onClick={() => setDismissed(key)}
            className="press p-1.5 text-gold-600 hover:text-gold-300"
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>

        <div className="px-3 pb-2.5">
          <div className="flex items-baseline gap-2 font-serif leading-tight">
            <span className="text-gold-100 text-base">{deal.goodName}</span>
            <span className="font-mono text-sm text-gold-400 tabular-nums">{deal.buy}</span>
            <span className="text-gold-700 text-xs">→</span>
            <span className="font-mono text-sm text-safe-300 tabular-nums">{deal.sell}</span>
          </div>

          <div className="mt-1 font-serif text-xs text-gold-500">
            {deal.toPortName} · {deal.days} 天 · {deal.nm} 海里 · 带 {deal.qty} 件
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            {/* 利润是这张卡的"钩子"，字号最大、用金色实心 */}
            <span className="flex items-baseline gap-1 font-serif text-gold-200">
              <Coins size={13} className="translate-y-[1px]" aria-hidden="true" />
              <span className="font-mono text-lg tabular-nums">+{deal.totalProfit}</span>
              <span className="text-[11px] text-gold-500">金</span>
            </span>
            <button
              type="button"
              onClick={() =>
                sailToWaypoint({
                  latitude: deal.toLat,
                  longitude: deal.toLng,
                  portId: deal.toPortId,
                  name: deal.toPortName,
                })
              }
              className="press flex items-center gap-1 rounded border border-gold-500/70 bg-gold-600/30 px-2.5 py-1.5 font-serif text-xs text-gold-100 hover:bg-gold-600/45"
            >
              <Anchor size={12} aria-hidden="true" />
              就这一趟
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
