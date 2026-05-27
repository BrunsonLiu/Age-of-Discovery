import { ChevronRight } from 'lucide-react'
import type { EventChoice as EventChoiceType } from '@/types'

interface EventChoiceProps {
  choice: EventChoiceType
  index: number
  onSelect: (index: number) => void
}

export default function EventChoice({ choice, index, onSelect }: EventChoiceProps) {
  return (
    <button
      onClick={() => onSelect(index)}
      className="w-full group relative overflow-hidden rounded-lg border border-gold-700/40 bg-ocean-800/50 px-4 py-3 text-left transition-all hover:border-gold-500/60 hover:bg-ocean-700/50"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-gold-700/0 via-gold-700/5 to-gold-700/0 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative flex items-center justify-between">
        <span className="text-gold-200 font-serif text-sm">{choice.text}</span>
        <ChevronRight size={16} className="text-gold-600 group-hover:text-gold-400 transition-colors" />
      </div>
    </button>
  )
}
