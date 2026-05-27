import { Coins, Utensils, Droplets, Heart, Shield, Users, Scroll } from 'lucide-react'
import ActionButton from '@/components/ui/ActionButton'
import type { EventOutcome } from '@/types'

interface EventResultProps {
  outcome: EventOutcome
  onContinue: () => void
}

function ChangeIndicator({ value, icon, label }: { value: number; icon: React.ReactNode; label: string }) {
  if (value === 0) return null
  const isPositive = value > 0
  return (
    <div className={`flex items-center gap-1 text-xs font-serif ${isPositive ? 'text-safe-400' : 'text-danger-400'}`}>
      {icon}
      <span>{label}</span>
      <span className="font-mono">{isPositive ? '+' : ''}{value}</span>
    </div>
  )
}

export default function EventResult({ outcome, onContinue }: EventResultProps) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="pirate-title text-xl mb-2">结果</h3>
        <p className="text-gold-200 font-serif text-sm leading-relaxed">{outcome.description}</p>
      </div>

      <div className="bg-ocean-800/40 rounded-lg p-3 space-y-1.5">
        <h4 className="text-gold-400 font-serif text-xs mb-1">资源变化</h4>
        <ChangeIndicator value={outcome.goldChange} icon={<Coins size={12} />} label="金币" />
        <ChangeIndicator value={outcome.foodChange} icon={<Utensils size={12} />} label="食物" />
        <ChangeIndicator value={outcome.waterChange} icon={<Droplets size={12} />} label="淡水" />
        <ChangeIndicator value={outcome.moraleChange} icon={<Heart size={12} />} label="士气" />
        <ChangeIndicator value={outcome.durabilityChange} icon={<Shield size={12} />} label="耐久" />
        <ChangeIndicator value={outcome.crewChange} icon={<Users size={12} />} label="船员" />
        {outcome.goldChange === 0 && outcome.foodChange === 0 && outcome.waterChange === 0 &&
         outcome.moraleChange === 0 && outcome.durabilityChange === 0 && outcome.crewChange === 0 && (
          <p className="text-gold-600 text-xs font-serif">无资源变化</p>
        )}
      </div>

      {outcome.historicalNote && (
        <div className="scroll-parchment rounded-lg">
          <div className="flex items-start gap-2">
            <Scroll size={14} className="text-gold-400 mt-0.5 flex-shrink-0" />
            <p className="text-gold-300 text-xs font-serif leading-relaxed">{outcome.historicalNote}</p>
          </div>
        </div>
      )}

      <div className="text-center pt-2">
        <ActionButton onClick={onContinue} className="px-8">
          继续
        </ActionButton>
      </div>
    </div>
  )
}
