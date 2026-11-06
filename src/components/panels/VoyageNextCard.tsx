import { Anchor, ChevronRight, MapPin } from 'lucide-react'
import { useMapStore } from '@/store/useMapStore'
import { voyageMilestones } from '@/data/voyageMilestones'
import { ports } from '@/data/ports'
import { useVoyageNext } from '@/hooks/useVoyageNext'

/**
 * 航路卡：回答"我下一步该往哪开"。
 *
 * 【为什么这一张卡比多加十个按钮有用】
 * 玩家原有的目标全是数量型（金币、发现数、交易数），界面从来不告诉他
 * "横渡大西洋是有意义的"。于是整局的实际行为是在最近两港之间倒货——
 * 不是因为那样最好玩，是因为只有那件事被界面确认过。
 *
 * 这张卡把"往哪走"变成一条可执行的信息：目标名、一个具体港口、还有多少海里。
 *
 * 【为什么点一下是"地图移过去"而不是"直接出航"】
 * 出航是不可逆的高代价动作（粮、水、耐久、可能全损），不该由一个
 * 展示信息的卡片来触发。这里只把视图移到那个港口——玩家看到位置、
 * 顺手在舰队面板里点两下出发。预览与实际动作分离。
 */
export default function VoyageNextCard() {
  const setCenter = useMapStore(s => s.setCenter)
  // 目标港、海里数、天数都从单一来源取（主屏常驻条用的是同一个 hook）
  const { target, suggest, days, doneCount } = useVoyageNext()

  if (!target) {
    // 全部走完：给一句结束语，而不是留一张空卡
    return (
      <div data-testid="voyage-next-card" className="rounded border border-gold-600/40 bg-gold-700/15 p-2 mb-2">
        <div className="flex items-center gap-1.5 text-gold-200 font-serif text-[13px]">
          <Anchor size={13} aria-hidden="true" />
          航路走完了
        </div>
        <p className="text-gold-400 text-[12px] font-serif mt-1 leading-relaxed">
          {voyageMilestones.length} 段航路都写进了你的日志——从直布罗陀到澳门，这条线上的每个港口都见过你的帆。
        </p>
      </div>
    )
  }

  // 天数口径（船速×风向×方针×天候×24）见 useVoyageNext，这里只负责展示。
  return (
    <div data-testid="voyage-next-card" className="rounded border border-gold-600/45 bg-gold-700/15 p-2 mb-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-gold-200 font-serif text-[13px]">
          <Anchor size={13} aria-hidden="true" />
          航路 · {target.title}
        </span>
        <span className="text-gold-500 text-xs font-serif">
          第 {Math.min(doneCount + 1, voyageMilestones.length)}/{voyageMilestones.length} 段
        </span>
      </div>
      <p className="text-gold-400 text-[12px] font-serif mt-1 leading-relaxed">
        {target.why}
      </p>
      {suggest && (
        <button
          type="button"
          onClick={() => {
            const p = ports.find(x => x.id === suggest.id)
            if (p) setCenter([p.latitude, p.longitude])
          }}
          className="mt-1.5 w-full flex items-center justify-between gap-2 rounded bg-black/25 px-2 py-1.5 press text-left"
          title="在地图上定位这个港口"
        >
          <span className="flex items-center gap-1 text-gold-100 font-serif text-[13px] min-w-0">
            <MapPin size={12} aria-hidden="true" className="shrink-0" />
            <span className="truncate">下一站：{suggest.nameCn}</span>
          </span>
          <span className="flex items-center gap-1 text-gold-400 font-serif text-[12px] shrink-0">
            {suggest.distanceNm > 0 ? `${suggest.distanceNm} 海里${days ? ` · 约 ${days} 天` : ''}` : '就在本港'}
            <ChevronRight size={12} aria-hidden="true" />
          </span>
        </button>
      )}
      <div className="mt-1 text-xs font-serif text-gold-500">
        完成奖励 +{target.reward.gold} 金 · +{target.reward.fame} 声望
      </div>
    </div>
  )
}
