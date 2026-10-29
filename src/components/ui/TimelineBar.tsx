import { useGameStore } from '@/store/useGameStore'
import { historicalTimeline } from '@/data/historicalTimeline'
import { useEffect, useRef, useState } from 'react'
import { Award } from 'lucide-react'
import { useFxStore as useFx } from '@/store/useFxStore'

export default function TimelineBar() {
  const day = useGameStore(s => s.fleet.day)
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

  const currentYear = Math.round(1492 + (day - 1) * (1650 - 1492) / 150)
  const progress = Math.min(1, (day - 1) / 150)

  const currentEvent = historicalTimeline.find(e => e.day === day)
  const latestSeenEvent = historicalTimeline
    .filter(e => e.day <= day)
    .sort((a, b) => b.day - a.day)[0]

  return (
    <div
      className="absolute top-0 left-0 right-0 h-12 flex items-center px-4 gap-4"
      style={{
        /* 木梁横条：与侧栏铜牌（.side-plate）同一套材质语言。
           原来是 bg-ocean-800/80 + 1px 金边——半透明深蓝压在深色海图上，
           读起来就是"网页状态栏"，而它上方紧挨着的是手绘立绘和羊皮纸地图。
           改实色渐变后才有"一块木头钉在屏幕顶上"的分量。 */
        background: 'linear-gradient(180deg, #2e2212 0%, #1d1409 62%, #150f07 100%)',
        borderBottom: '2px solid rgba(150, 117, 47, 0.65)',
        boxShadow: 'inset 0 1px 0 rgba(255, 238, 186, 0.16), 0 2px 10px rgba(0, 0, 0, 0.55)',
      }}
    >
      <div className="text-gold-300 font-serif text-sm font-bold min-w-[52px]">
        {currentYear}年
      </div>

      <div className="flex-1 relative h-6 flex items-center">
        <div className="absolute left-0 right-0 h-[2px] bg-gold-900/50 rounded-full" />
        <div
          className="absolute left-0 h-[2px] bg-gold-500 rounded-full transition-all duration-500"
          style={{ width: `${progress * 100}%` }}
        />

        {historicalTimeline.map((event) => {
          const eventProgress = (event.day - 1) / 150
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
              <div
                className={`w-2.5 h-2.5 rounded-full border transition-all duration-300 ${
                  isCurrent
                    ? 'bg-gold-300 border-gold-300 shadow-[0_0_8px_2px_rgba(212,175,55,0.6)] animate-pulse'
                    : isPast
                      ? isSeen
                        ? 'bg-gold-500 border-gold-500'
                        : 'bg-gold-400 border-gold-400 shadow-[0_0_6px_1px_rgba(212,175,55,0.4)]'
                      : 'bg-ocean-700 border-gold-700/40'
                }`}
              />

              {hoveredEvent === event.day && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap z-50">
                  <div className="bg-ocean-900/95 backdrop-blur-sm border border-gold-700/30 rounded-lg px-3 py-2 shadow-xl">
                    <div className="text-gold-300 font-serif text-xs font-bold">{event.year}年</div>
                    <div className="text-gold-100 text-xs mt-0.5">{event.title}</div>
                    {isPast && (
                      <div className="text-gold-500 text-[10px] mt-1 max-w-[200px] whitespace-normal">{event.description}</div>
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

      <div className="text-gold-400 font-serif text-xs min-w-[120px] text-right truncate">
        {currentEvent ? currentEvent.title : latestSeenEvent ? latestSeenEvent.title : '启航'}
      </div>

      {/* 声望：天然的进度指标，此前只在结局画面出现，玩家全程看不到自己在往上走 */}
      <div
        className="flex items-center gap-1 text-gold-300 font-serif text-xs min-w-[68px] justify-end"
        title="声望：发现新港口与完成冒险都会累积"
      >
        <Award size={13} className="text-gold-400" />
        <span className="font-mono">{fame}</span>
      </div>
    </div>
  )
}
