import type { ReactNode } from 'react'

interface ResourceBarProps {
  value: number
  maxValue: number
  label: string
  color: string
  icon?: ReactNode
}

function getStatusColor(value: number, maxValue: number): string {
  const pct = (value / maxValue) * 100
  if (pct > 60) return 'bg-safe-400'
  if (pct > 30) return 'bg-gold-400'
  return 'bg-danger-400'
}

export default function ResourceBar({ value, maxValue, label, color, icon }: ResourceBarProps) {
  const pct = Math.min(100, Math.max(0, (value / maxValue) * 100))
  const statusColor = getStatusColor(value, maxValue)

  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      {icon && <span className="text-gold-400 flex-shrink-0">{icon}</span>}
      <div className="flex-1">
        <div className="flex justify-between items-baseline mb-0.5">
          <span className="text-xs text-gold-300 font-serif">{label}</span>
          <span className="text-xs text-gold-400 font-mono">
            {value}/{maxValue}
          </span>
        </div>
        <div className="h-1.5 bg-ocean-700 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${statusColor}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  )
}
