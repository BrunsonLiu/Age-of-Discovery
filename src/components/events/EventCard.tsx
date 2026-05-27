import { useState } from 'react'
import { Cloud, Skull, Heart, AlertTriangle, Compass, Scroll } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { selectOutcome } from '@/utils/eventEngine'
import EventChoiceComponent from './EventChoice'
import EventResult from './EventResult'
import type { EventOutcome } from '@/types'

const typeIcons: Record<string, React.ReactNode> = {
  storm: <Cloud size={40} className="text-blue-400" />,
  pirate: <Skull size={40} className="text-danger-400" />,
  disease: <Heart size={40} className="text-green-400" />,
  accident: <AlertTriangle size={40} className="text-yellow-400" />,
  discovery: <Compass size={40} className="text-cyan-400" />,
  historical: <Scroll size={40} className="text-purple-400" />,
}

const typeBgColors: Record<string, string> = {
  storm: 'from-blue-900/30 to-ocean-900/30',
  pirate: 'from-danger-900/30 to-ocean-900/30',
  disease: 'from-green-900/30 to-ocean-900/30',
  accident: 'from-yellow-900/30 to-ocean-900/30',
  discovery: 'from-cyan-900/30 to-ocean-900/30',
  historical: 'from-purple-900/30 to-ocean-900/30',
}

export default function EventCard() {
  const currentEvent = useGameStore(s => s.currentEvent)
  const fleet = useGameStore(s => s.fleet)
  const applyEventOutcome = useGameStore(s => s.applyEventOutcome)
  const addEventLog = useGameStore(s => s.addEventLog)
  const clearCurrentEvent = useGameStore(s => s.clearCurrentEvent)

  const [outcome, setOutcome] = useState<EventOutcome | null>(null)
  const [choiceIndex, setChoiceIndex] = useState<number | null>(null)

  if (!currentEvent) return null

  const handleSelectChoice = (index: number) => {
    const choice = currentEvent.choices[index]
    if (!choice) return
    const result = selectOutcome(choice.outcomes)
    setChoiceIndex(index)
    setOutcome(result)
  }

  const handleContinue = () => {
    if (!outcome || choiceIndex === null) return
    applyEventOutcome(outcome)
    addEventLog({
      event: currentEvent,
      choiceIndex,
      outcome,
      day: fleet.day,
    })
    setOutcome(null)
    setChoiceIndex(null)
    clearCurrentEvent()
  }

  const icon = typeIcons[currentEvent.type] || <Scroll size={40} className="text-gold-400" />
  const bgGradient = typeBgColors[currentEvent.type] || 'from-gold-900/30 to-ocean-900/30'

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      style={{ animation: 'fadeInScale 0.3s ease-out', zIndex: 80 }}
    >
      <div className={`w-96 max-w-[90vw] bg-gradient-to-b ${bgGradient} parchment-bg rounded-xl p-6`}
        style={{ animation: 'fadeInScale 0.4s ease-out' }}
      >
        {!outcome ? (
          <>
            <div className="flex flex-col items-center mb-4">
              <div className="mb-3 opacity-80">{icon}</div>
              <h2 className="pirate-title text-2xl text-center">{currentEvent.title}</h2>
            </div>
            <p className="text-gold-200 font-serif text-sm leading-relaxed text-center mb-6">
              {currentEvent.description}
            </p>
            <div className="space-y-2">
              {currentEvent.choices.map((choice, idx) => (
                <EventChoiceComponent
                  key={idx}
                  choice={choice}
                  index={idx}
                  onSelect={handleSelectChoice}
                />
              ))}
            </div>
          </>
        ) : (
          <EventResult outcome={outcome} onContinue={handleContinue} />
        )}
      </div>
    </div>
  )
}
