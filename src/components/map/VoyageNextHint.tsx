import { Anchor, ChevronRight, MapPin } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports } from '@/data/ports'
import { voyageMilestones } from '@/data/voyageMilestones'
import { useVoyageNext } from '@/hooks/useVoyageNext'

/**
 * 主屏常驻的「下一站」指引。
 *
 * 【为什么必须常驻】实测 1440×900 进游戏第一屏：38 条可见文本 / 122 字 /
 * 20 个按钮，回答「我下一步该往哪开」的一个字都没有。唯一的航路卡挂在
 * 「冒险笔记」面板里，而那个入口叫「委托」——名字不暗示里面有航海目标。
 * 玩家点一下就能看到，但大概率整局都不会去点（与「第二个空间必须常驻
 * 双向开关」是同一类结构问题，不是内容量不够）。
 *
 * 【为什么点一下只是把地图移过去】出航是不可逆的高代价动作（粮、水、耐久、
 * 可能全损），不该由一条展示信息的横条触发。这里只定位港口；想看完整理由、
 * 奖励和委托，走右边「看航路」进面板。预览与实际动作分离。
 *
 * 【移动端为什么并入底部文档流】底栏高度随折行变（42/64/三行），任何写死的
 * bottom 都会在某一档被压住。stack 分支由 MainMap 放进同一个 fixed 容器，
 * 按文档流往上叠，结构上不可能与底栏重叠；同时只留一行，不给 390px 屏
 * 再叠一张大卡。
 */
const cardStyle = {
  background: 'linear-gradient(180deg, #3a2b18 0%, #2b1f10 60%, #1d1509 100%)',
  border: '1px solid rgba(201,169,110,0.42)',
  boxShadow: 'inset 0 1px 0 rgba(255,225,170,0.14), 0 6px 18px rgba(0,0,0,0.55)',
} as const

export default function VoyageNextHint({ placement = 'float' }: { placement?: 'float' | 'stack' }) {
  const gamePhase = useGameStore(s => s.gamePhase)
  const activePanel = useGameStore(s => s.activePanel)
  const setActivePanel = useGameStore(s => s.setActivePanel)
  const setCenter = useMapStore(s => s.setCenter)
  const { target, suggest, days } = useVoyageNext()

  // 开局致辞 / 教学 / 结局遮罩期不抢画面；面板打开时玩家已经在看细节了，
  // 此时把常驻条收起，免得和面板里的同一张航路卡并排出现两次。
  if (gamePhase !== 'playing' || activePanel) return null

  const locate = () => {
    const p = suggest ? ports.find(x => x.id === suggest.id) : null
    if (p) setCenter([p.latitude, p.longitude])
  }
  const openDetail = () => setActivePanel('task')

  const distance = suggest && suggest.distanceNm > 0
    ? `${suggest.distanceNm} 海里${days ? ` · 约 ${days} 天` : ''}`
    : suggest ? '就在本港' : ''

  const detailBtn = (
    <button
      type="button"
      onClick={openDetail}
      data-testid="next-port-detail"
      title="打开冒险笔记，看这条航路的理由与奖励"
      className="press shrink-0 flex items-center gap-0.5 rounded border border-gold-600/60
        px-2 py-1 font-serif text-[12px] text-gold-200 hover:bg-gold-700/35"
    >
      看航路
      <ChevronRight size={12} aria-hidden="true" />
    </button>
  )

  if (!target || !suggest) {
    return (
      <div className={`${placement === 'stack' ? 'px-2 pb-1.5' : ''} pointer-events-auto`}>
        <div
          data-testid="next-port-hint"
          className="flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-lg"
          style={cardStyle}
        >
          <Anchor size={14} className="text-gold-300 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 font-serif text-[13px] text-gold-100">
            航路走完了 · {voyageMilestones.length} 段都写进了日志
          </span>
          {detailBtn}
        </div>
      </div>
    )
  }

  if (placement === 'stack') {
    return (
      <div className="px-2 pb-1.5 pointer-events-auto">
        <div
          data-testid="next-port-hint"
          className="flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-lg"
          style={cardStyle}
        >
          <Anchor size={13} className="text-gold-300 shrink-0" aria-hidden="true" />
          <button
            type="button"
            onClick={locate}
            data-testid="next-port-locate"
            title="在地图上定位这个港口，不会出航"
            className="press min-w-0 flex-1 text-left font-serif text-[12px] text-gold-100 truncate"
          >
            航路 · 下一站：{suggest.nameCn}
          </button>
          {detailBtn}
        </div>
      </div>
    )
  }

  /* 宽度 400px 是量出来的：360px 时港名「下一站：埃尔米纳」实测 104px
     只分到 97px 可用宽，被 truncate 裁掉 7px（layout-audit 在 1024/1440
     两个视口都报「无文字被裁」失败）。同一行里还有 12px 的图标、
     「4789 海里 · 约 18 天」和「看航路」按钮，只能把整条放宽。 */
  return (
    <div className="pointer-events-auto max-w-[400px]">
      <div
        data-testid="next-port-hint"
        className="flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-lg"
        style={cardStyle}
      >
        <Anchor size={14} className="text-gold-300 shrink-0" aria-hidden="true" />
        <button
          type="button"
          onClick={locate}
          data-testid="next-port-locate"
          title="在地图上定位这个港口，不会出航"
          className="press min-w-0 flex-1 text-left"
        >
          <span className="block font-serif text-[12px] leading-tight text-gold-300">
            航路 · {target.title}
          </span>
          <span className="flex items-center gap-1 font-serif text-[13px] leading-tight text-gold-100">
            <MapPin size={12} className="shrink-0" aria-hidden="true" />
            <span className="truncate">下一站：{suggest.nameCn}</span>
            <span className="shrink-0 font-mono text-[12px] text-gold-300 tabular-nums">{distance}</span>
          </span>
        </button>
        {detailBtn}
      </div>
    </div>
  )
}
