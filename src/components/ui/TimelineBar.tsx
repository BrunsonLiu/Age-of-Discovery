import { useGameStore } from '@/store/useGameStore'
import { historicalTimeline } from '@/data/historicalTimeline'
import { useEffect, useRef, useState } from 'react'
import { Award } from 'lucide-react'
import { useFxStore as useFx } from '@/store/useFxStore'

/**
 * 历史时间轴的刻度跨度（天）。三条口径必须共用同一个数：年份换算、进度条、刻度位置。
 *
 * 【为什么必须过滤掉超过它的节点】historicalTimeline 里还有一条 day=200 的
 * 「四海皆知你的名号」——那是**玩家自己的成就**，不是 1492~1650 的历史事件。
 * 旧代码把它的刻度按 (200-1)/150 = 132.67% 定位，画到轨道外、屏幕外：
 * 1440 视口下实测那根 2px 刻线的 rect 是 [1546,1548]，正好把
 * documentElement.scrollWidth 从 1440 撑到 **1548**（触屏上会多出一条横向拖动）。
 * 而那根刻线玩家永远看不见，等于既溢出又没用。
 * 成就本身照常兑现：advanceDay 会发通知（年份+正文），顶栏也会显示它的标题。
 */
const TIMELINE_LAST_DAY = 150
const HISTORY_TICKS = historicalTimeline.filter(e => e.day <= TIMELINE_LAST_DAY)

export default function TimelineBar() {
  const day = useGameStore(s => s.fleet.day)
  const gameMode = useGameStore(s => s.gameMode)
  const setShowHelp = useGameStore(s => s.setShowHelp)
  const fame = useGameStore(s => s.fleet.fame)
  const seenHistoricalEvents = useGameStore(s => s.seenHistoricalEvents)
  const [hoveredEvent, setHoveredEvent] = useState<number | null>(null)

  // 历史节点触发时，由时间轴自己上报为「年代」事件——
  // 主循环已经降速（advanceDay 里改），这里兑现成一声钟响，让 10 年的分量落下来。
  const lastHistoricalCount = useRef(seenHistoricalEvents.length)
  useEffect(() => {
    if (seenHistoricalEvents.length > lastHistoricalCount.current) {
      useFx.getState().cue('era')
    }
    lastHistoricalCount.current = seenHistoricalEvents.length
  }, [seenHistoricalEvents.length])

  const currentYear = Math.round(1492 + (day - 1) * (1650 - 1492) / TIMELINE_LAST_DAY)
  const progress = Math.min(1, (day - 1) / TIMELINE_LAST_DAY)

  const currentEvent = historicalTimeline.find(e => e.day === day)
  const latestSeenEvent = historicalTimeline
    .filter(e => e.day <= day)
    .sort((a, b) => b.day - a.day)[0]

  return (
    <div
      className="wood-beam absolute top-0 left-0 right-0 h-12 flex items-center px-4 gap-4"
      // 手机上事件名那格让位给了「参观」徽标（见下方），
      // 于是把"当前处在哪个历史节点"挂到整条木梁的 title 上，长按/悬停仍能看到。
      title={currentEvent?.title ?? latestSeenEvent?.title ?? undefined}
      style={{
        /* 材质与底栏共用 .wood-beam（原本两处各写一份内联渐变）。
           边框与投影留在这里：顶栏是"压在屏幕上的一块木头"，
           只有下棱描边 + 整条外投影才能和 48px 下方的海图分开。 */
        borderBottom: '2px solid rgba(150, 117, 47, 0.65)',
        boxShadow: 'inset 0 1px 0 rgba(255, 238, 186, 0.16), 0 2px 10px rgba(0, 0, 0, 0.55)',
      }}
    >
      {/* 这里原本是 text-sm font-bold。中文只有 400 字重，font-bold 会让「年」变成
              浏览器合成的假粗体（横向涂抹），而「1492」是 Crimson Text 的真 700——
              同一个词里两种粗细，放大 4 倍看非常明显。中文靠字号与字距立足，不靠字重。 */}
      <div className="text-gold-300 font-serif text-[15px] tracking-wide min-w-[56px]">
        {currentYear}年
      </div>

      {/*
        【参观模式的身份标识】
        选了「我只是来逛逛」之后，主界面和船长模式长得一模一样——任务、贸易、造船、
        成就全在，只是没有教程、不扣粮水、不会翻船（这三条已实测：同条件下船长模式
        第 2 天翻船，参观模式推到第 11 天还活着，船体耐久从 0 被抬回下限 1）。
        差别全在"看不见的地方"，玩家不看帮助就不知道自己是什么模式。
        这块小标是唯一常驻的交代，点一下直接打开帮助里的模式说明（那里能换玩法）。

        为什么手机端藏起来：390px 宽的顶栏已经装了 年份(56) + 事件名(130) + 声望(74)
        + 两处 gap + padding ≈ 340px，再塞 56px 会把时间轴轨道压成 0。移动端玩家
        目前只能在「帮助」里看到当前模式——这是已知局限，不是漏做。
      */}
      {gameMode === 'visitor' && (
        <button
          onClick={() => setShowHelp(true)}
          data-testid="visitor-badge"
          title="参观模式：不会被逼着做任何事。点这里看说明或换个玩法"
          className="inline-flex items-center shrink-0 rounded border border-gold-600/55
            px-1.5 py-0.5 text-gold-200 font-serif text-[12px] leading-none
            hover:bg-gold-700/30 press transition-colors"
        >
          参观
        </button>
      )}

      <div className="flex-1 relative h-6 flex items-center">
        {/*
          轨道：从"画在木梁上的一条线"改成"刻进木梁的一道凹槽"。

          【为什么要改】原来是 `h-[2px] bg-gold-900/50` 一条平涂细线——放在实色
          木纹上，观感就是网页里的一根 border。木梁本身已经做出三段渐变 + 顶棱
          受光 + 底棱背光（见上面的容器样式），而轨道却是个没有厚度的色块，
          两者不在同一个材质体系里。
          凹槽的读法靠三样：内投影压深（刻下去了）、下方 1px 高光（切口的下棱
          受光）、高度加到 4px（有宽度才看得出是槽，2px 只能算线）。
          轨道里的进度条则是**嵌进槽里的黄铜丝**：细、亮、带一点辉光。
        */}
        <div
          className="absolute left-0 right-0 h-[4px] rounded-[2px]"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.34) 55%, rgba(0,0,0,0.5) 100%)',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.75), 0 1px 0 rgba(255,238,186,0.16)',
          }}
        />
        <div
          className="absolute left-0 h-[2px] bg-gold-400 rounded-full transition-all duration-500"
          style={{
            width: `${progress * 100}%`,
            top: 'calc(50% - 1px)',
            boxShadow: '0 0 6px 1px rgba(212,175,55,0.5), inset 0 1px 0 rgba(255,246,210,0.55)',
          }}
        />

        {HISTORY_TICKS.map((event) => {
          // clamp 是防御：以后往数据里再加更靠后的节点，也不会再把刻度画到屏幕外
          const eventProgress = Math.min(1, (event.day - 1) / TIMELINE_LAST_DAY)
          const isPast = event.day <= day
          const isCurrent = event.day === day
          const isSeen = seenHistoricalEvents.includes(event.day)

          return (
            <div
              key={event.day}
              className="absolute"
              style={{ left: `${eventProgress * 100}%`, transform: 'translateX(-50%)' }}
              onMouseEnter={() => setHoveredEvent(event.day)}
              onMouseLeave={() => setHoveredEvent(null)}
            >
              {/*
                历史节点：从圆点改成竖刻线（像海图上的经度刻度）。
                【为什么换】原来是 10px 的深蓝实心圆（bg-ocean-700 + 暗金边），
                压在实色木梁上几乎看不见——15 个蓝点是顶栏唯一不属于金棕材质
                的元素，也是整条时间轴显得"网页控件"而非"航海仪器"的主因。
                刻线还带来一个好处：已过/未到只靠**高度与亮度**区分，
                不需要读懂颜色语义。
              */}
              <div
                className={`w-[2px] h-[11px] rounded-[1px] transition-all duration-300 ${
                  isCurrent
                    ? '!w-[3px] !h-[15px] bg-gold-200 shadow-[0_0_9px_2px_rgba(212,175,55,0.7)]'
                    : isPast
                      ? isSeen
                        ? 'bg-gold-600'
                        : 'bg-gold-300 shadow-[0_0_5px_1px_rgba(212,175,55,0.45)]'
                      : 'bg-gold-700/85'
                }`}
              />

              {hoveredEvent === event.day && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap z-50">
                  <div className="bg-ocean-900/95 backdrop-blur-sm border border-gold-700/30 rounded-lg px-3 py-2 shadow-xl">
                    <div className="text-gold-300 font-serif text-[13px] tabular-nums">{event.year}年</div>
                    <div className="text-gold-100 text-[13px] mt-0.5">{event.title}</div>
                    {isPast && (
                      <div className="text-gold-500 text-xs mt-1 max-w-[210px] whitespace-normal leading-relaxed">{event.description}</div>
                    )}
                  </div>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-ocean-900/95" />
                </div>
              )}
            </div>
          )
        })}

        <div
          className="absolute z-10"
          style={{ left: `${progress * 100}%`, transform: 'translateX(-50%)' }}
        >
          <div className="w-3 h-3 rotate-45 bg-gold-300 shadow-[0_0_10px_2px_rgba(212,175,55,0.5)]" />
        </div>
      </div>

      <div className="hidden sm:block text-gold-400 font-serif text-[13px] min-w-[130px] text-right truncate">
        {currentEvent ? currentEvent.title : latestSeenEvent ? latestSeenEvent.title : '启航'}
      </div>

      {/* 声望：天然的进度指标，此前只在结局画面出现，玩家全程看不到自己在往上走 */}
      <div
        className="flex items-center gap-1.5 text-gold-300 font-serif text-[13px] min-w-[74px] justify-end"
        title="声望：发现新港口与完成冒险都会累积"
      >
        <Award size={15} className="text-gold-400" />
        <span className="font-mono">{fame}</span>
      </div>
    </div>
  )
}
