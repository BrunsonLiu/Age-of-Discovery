import { useGameStore } from '@/store/useGameStore'
import { historicalTimeline } from '@/data/historicalTimeline'
import { useState } from 'react'

export default function TimelineBar() {
  const day = useGameStore(s => s.fleet.day)
  const seenHistoricalEvents = useGameStore(s => s.seenHistoricalEvents)
  const [hoveredEvent, setHoveredEvent] = useState<number | null>(null)

  const currentYear = Math.round(1492 + (day - 1) * (1650 - 1492) / 150)
  const progress = Math.min(1, (day - 1) / 150)

  const currentEvent = historicalTimeline.find(e => e.day === day)
  const latestSeenEvent = historicalTimeline
    .filter(e => e.day <= day)
    .sort((a, b) => b.day - a.day)[0]

  return (
    <div className="absolute top-0 left-0 right-0 h-12 bg-ocean-800/80 backdrop-blur-sm border-b border-gold-700/20 flex items-center px-4 gap-4">
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
    </div>
  )
}
