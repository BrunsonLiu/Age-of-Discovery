import { Anchor, ChevronRight, MapPin, ScrollText } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports } from '@/data/ports'
import { voyageMilestones } from '@/data/voyageMilestones'
import { useVoyageNext } from '@/hooks/useVoyageNext'
import { useArrivalReceipt } from '@/hooks/useArrivalReceipt'

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
  // 「这趟带回了什么」与「往哪开」共用同一条常驻位，不另起一张浮卡
  const receipt = useArrivalReceipt()

  // 开局致辞 / 教学 / 结局遮罩期不抢画面；面板打开时玩家已经在看细节了，
  // 此时把常驻条收起，免得和面板里的同一张航路卡并排出现两次。
  if (gamePhase !== 'playing' || activePanel) return null

  const locate = () => {
    const p = suggest ? ports.find(x => x.id === suggest.id) : null
    if (p) setCenter([p.latitude, p.longitude])
  }
  const openDetail = () => setActivePanel('task')
  const openLogbook = () => setActivePanel('event')

  /*
   * 有未读回执时，把 12px 主行换成册子里那句「没讲完的尾巴」并做成按钮。
   * 副行「下一站：X · N 海里」一个字都不动 —— 实测连跑 10 趟，主屏从没
   * 出现过「酒馆里有人提起…」，而「往哪开」上一轮才刚做成常驻，不能为了
   * 补回执又把它换掉。两行合起来正好是「回来的理由 + 下一趟的方向」。
   * 打开日志（默认见闻页）会 markLogbookRead，已读归零后主行自动恢复
   * 「航路 · 目标」，不会留一条消不掉的横条。
   */
  const receiptHead = receipt.latest ? (
    <button
      type="button"
      onClick={openLogbook}
      data-testid="arrival-receipt"
      data-unread={receipt.unread}
      title={`${receipt.latest.title}：${receipt.latest.text}（翻开航海日志）`}
      className="press block w-full truncate text-left font-serif text-[12px] leading-tight
        text-gold-300 hover:text-gold-100"
    >
      刚带回 · {receipt.gist}
    </button>
  ) : null
  const headIcon = receipt.latest
    ? <ScrollText size={14} className="text-gold-300 shrink-0" aria-hidden="true" />
    : <Anchor size={14} className="text-gold-300 shrink-0" aria-hidden="true" />
  /*
   * 移动端刻意保持原样：底栏「日志」标签自带未读数徽标（badge: unreadLogbook），
   * 比桌面那个 8px 红点明显得多，桌面才是这次要补的缺口。stack 分支继续
   * 只占一行「航路 · 下一站」，不给 390px 屏再叠内容，也不动上一轮的巡检判据。
   */
  const showReceipt = placement === 'stack' ? null : receiptHead

  const distance = suggest && suggest.distanceNm == null
    ? ''
    : suggest && suggest.distanceNm > 0
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
          {placement === 'stack'
            ? <Anchor size={14} className="text-gold-300 shrink-0" aria-hidden="true" />
            : headIcon}
          <div className="min-w-0 flex-1">
            {showReceipt ?? (
              <span className="font-serif text-[13px] text-gold-100">
                航路走完了 · {voyageMilestones.length} 段都写进了日志
              </span>
            )}
          </div>
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
  /*
   * 【里程为空是正常状态】海陆掩码异步到位前算不出真实弧长（见 useVoyageNext），
   * 这时只显示港名。宁可少一个数字，也不显示少报 49% 的直线距离。
   */
  return (
    <div className="pointer-events-auto max-w-[400px]">
      <div
        data-testid="next-port-hint"
        className="flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-lg"
        style={cardStyle}
      >
        {headIcon}
        <div className="min-w-0 flex-1">
          {receiptHead ?? (
            <span className="block font-serif text-[12px] leading-tight text-gold-300">
              航路 · {target.title}
            </span>
          )}
          <button
            type="button"
            onClick={locate}
            data-testid="next-port-locate"
            title="在地图上定位这个港口，不会出航"
            className="press flex w-full items-center gap-1 text-left font-serif text-[13px] leading-tight text-gold-100"
          >
            <MapPin size={12} className="shrink-0" aria-hidden="true" />
            <span className="truncate">下一站：{suggest.nameCn}</span>
            <span
              className="shrink-0 font-mono text-[12px] text-gold-300 tabular-nums"
              title="里程与天数按「按部就班」算，与出航计划面板同一口径"
            >{distance}</span>
          </button>
        </div>
        {detailBtn}
      </div>
    </div>
  )
}
