import { Scroll, Calendar } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { EVENT_TYPE_COLORS, renderEventIcon } from '@/utils/eventTypeStyles'
import ParchmentCard from '@/components/ui/ParchmentCard'

export default function EventLog() {
  const eventLog = useGameStore(s => s.eventLog)
  const setActivePanel = useGameStore(s => s.setActivePanel)

  return (
    <div className="w-80 animate-slide-in-left">
      <ParchmentCard title="航海日志" onClose={() => setActivePanel(null)}>
        {eventLog.length === 0 ? (
          <div className="text-center py-6">
            <Scroll size={32} className="mx-auto text-gold-700/50 mb-2" />
            <p className="text-gold-600 text-xs font-serif">尚无事件记录</p>
            <p className="text-gold-700 text-xs font-serif mt-1">出海航行，书写你的传奇</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin">
            {eventLog.slice().reverse().map((entry) => (
              <div
                key={`${entry.day}-${entry.event.id}-${entry.choiceIndex}`}
                className={`bg-ocean-800/30 rounded p-2 border-l-2 ${EVENT_TYPE_COLORS[entry.event.type] || 'border-l-gold-500/50'}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {renderEventIcon(entry.event.type, 14)}
                  <span className="text-gold-300 text-xs font-serif font-semibold">{entry.event.title}</span>
                  <span className="text-gold-600 text-xs ml-auto flex items-center gap-0.5">
                    <Calendar size={10} /> 第{entry.day}天
                  </span>
                </div>
                <p className="text-gold-200 text-xs font-serif mb-1">
                  选择: {entry.event.choices[entry.choiceIndex]?.text}
                </p>
                <p className="text-gold-400 text-xs font-serif">{entry.outcome.description}</p>
                {entry.outcome.historicalNote && (
                  <div className="scroll-parchment mt-1.5 text-xs text-gold-300 font-serif rounded">
                    📜 {entry.outcome.historicalNote}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ParchmentCard>
    </div>
  )
}
