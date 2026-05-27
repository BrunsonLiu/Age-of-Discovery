import { Scroll, Calendar, Cloud, Skull, Heart, AlertTriangle, Compass } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import ParchmentCard from '@/components/ui/ParchmentCard'

const typeIcons: Record<string, React.ReactNode> = {
  storm: <Cloud size={14} className="text-blue-400" />,
  pirate: <Skull size={14} className="text-danger-400" />,
  disease: <Heart size={14} className="text-green-400" />,
  accident: <AlertTriangle size={14} className="text-yellow-400" />,
  discovery: <Compass size={14} className="text-cyan-400" />,
  historical: <Scroll size={14} className="text-purple-400" />,
}

const typeColors: Record<string, string> = {
  storm: 'border-l-blue-500/50',
  pirate: 'border-l-danger-500/50',
  disease: 'border-l-green-500/50',
  accident: 'border-l-yellow-500/50',
  discovery: 'border-l-cyan-500/50',
  historical: 'border-l-purple-500/50',
}

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
            {[...eventLog].reverse().map((entry, idx) => (
              <div
                key={`${entry.day}-${entry.event.id}-${entry.choiceIndex}`}
                className={`bg-ocean-800/30 rounded p-2 border-l-2 ${typeColors[entry.event.type] || 'border-l-gold-500/50'}`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {typeIcons[entry.event.type] || <Scroll size={14} className="text-gold-400" />}
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
