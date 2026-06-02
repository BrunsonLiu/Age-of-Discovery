import { Scroll, Cloud, Skull, Heart, AlertTriangle, Compass } from 'lucide-react'
import type { ComponentType } from 'react'

interface IconProps {
  size?: number | string
  className?: string
}

export const EVENT_TYPE_ICONS: Record<string, ComponentType<IconProps>> = {
  storm: Cloud,
  pirate: Skull,
  disease: Heart,
  accident: AlertTriangle,
  discovery: Compass,
  historical: Scroll,
}

export const EVENT_TYPE_ICON_COLORS: Record<string, string> = {
  storm: 'text-blue-400',
  pirate: 'text-danger-400',
  disease: 'text-green-400',
  accident: 'text-yellow-400',
  discovery: 'text-cyan-400',
  historical: 'text-purple-400',
}

export const EVENT_TYPE_COLORS: Record<string, string> = {
  storm: 'border-l-blue-500/50',
  pirate: 'border-l-danger-500/50',
  disease: 'border-l-green-500/50',
  accident: 'border-l-yellow-500/50',
  discovery: 'border-l-cyan-500/50',
  historical: 'border-l-purple-500/50',
}

export const EVENT_TYPE_BG: Record<string, string> = {
  storm: 'from-blue-900/30 to-ocean-900/30',
  pirate: 'from-danger-900/30 to-ocean-900/30',
  disease: 'from-green-900/30 to-ocean-900/30',
  accident: 'from-yellow-900/30 to-ocean-900/30',
  discovery: 'from-cyan-900/30 to-ocean-900/30',
  historical: 'from-purple-900/30 to-ocean-900/30',
}

export function renderEventIcon(type: string, size: number = 14, fallbackColor: string = 'text-gold-400') {
  const Icon = EVENT_TYPE_ICONS[type]
  if (!Icon) return <Scroll size={size} className={fallbackColor} />
  return <Icon size={size} className={EVENT_TYPE_ICON_COLORS[type] ?? fallbackColor} />
}
