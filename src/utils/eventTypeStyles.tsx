import { Scroll, Cloud, Skull, Heart, AlertTriangle, Compass, Waves, Ghost, PartyPopper, EyeOff, Music, Flame, CloudFog, Gem, Crown, Scale, Users } from 'lucide-react'
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
  kraken: Waves,
  ghost: Ghost,
  festival: PartyPopper,
  smuggle: EyeOff,
  siren: Music,
  volcano: Flame,
  fog: CloudFog,
  treasure: Gem,
  faction: Crown,
  crew: Users,
  reckoning: Scale,
}

export const EVENT_TYPE_ICON_COLORS: Record<string, string> = {
  storm: 'text-blue-400',
  pirate: 'text-danger-400',
  disease: 'text-green-400',
  accident: 'text-yellow-400',
  discovery: 'text-cyan-400',
  historical: 'text-purple-400',
  kraken: 'text-emerald-400',
  ghost: 'text-teal-300',
  festival: 'text-pink-400',
  smuggle: 'text-slate-400',
  siren: 'text-fuchsia-400',
  volcano: 'text-orange-500',
  fog: 'text-slate-300',
  treasure: 'text-amber-400',
  faction: 'text-yellow-300',
  crew: 'text-orange-300',
  reckoning: 'text-rose-300',
}

export const EVENT_TYPE_COLORS: Record<string, string> = {
  storm: 'border-l-blue-500/50',
  pirate: 'border-l-danger-500/50',
  disease: 'border-l-green-500/50',
  accident: 'border-l-yellow-500/50',
  discovery: 'border-l-cyan-500/50',
  historical: 'border-l-purple-500/50',
  kraken: 'border-l-emerald-500/50',
  ghost: 'border-l-teal-400/50',
  festival: 'border-l-pink-500/50',
  smuggle: 'border-l-slate-400/50',
  siren: 'border-l-fuchsia-500/50',
  volcano: 'border-l-orange-500/50',
  fog: 'border-l-slate-400/50',
  treasure: 'border-l-amber-500/50',
  faction: 'border-l-yellow-500/50',
  crew: 'border-l-orange-500/50',
  reckoning: 'border-l-rose-500/50',
}

/**
 * 事件卡背景渐变。
 * 不透明度必须足够高（85%）——否则底下的地图标签（"红海"、rival 传闻）
 * 会透过卡片显示成重影乱码，叠在选项文字上完全没法读。
 */
export const EVENT_TYPE_BG: Record<string, string> = {
  storm: 'from-blue-900/90 to-ocean-900/95',
  pirate: 'from-danger-900/90 to-ocean-900/95',
  disease: 'from-green-900/90 to-ocean-900/95',
  accident: 'from-yellow-900/90 to-ocean-900/95',
  discovery: 'from-cyan-900/90 to-ocean-900/95',
  historical: 'from-purple-900/90 to-ocean-900/95',
  kraken: 'from-emerald-900/90 to-ocean-900/95',
  ghost: 'from-teal-900/90 to-ocean-900/95',
  festival: 'from-pink-900/90 to-ocean-900/95',
  smuggle: 'from-slate-900/90 to-ocean-900/95',
  siren: 'from-fuchsia-900/90 to-ocean-900/95',
  volcano: 'from-orange-900/90 to-ocean-900/95',
  fog: 'from-slate-800/90 to-ocean-900/95',
  treasure: 'from-amber-900/90 to-ocean-900/95',
  faction: 'from-yellow-900/90 to-ocean-900/95',
  crew: 'from-orange-900/90 to-ocean-900/95',
  reckoning: 'from-rose-900/90 to-ocean-900/95',
}

/** 事件类型的中文名（日志与图鉴用） */
export const EVENT_TYPE_NAMES: Record<string, string> = {
  storm: '风暴',
  pirate: '海盗',
  disease: '疾病',
  accident: '事故',
  discovery: '发现',
  historical: '历史',
  kraken: '海怪',
  ghost: '灵异',
  festival: '庆典',
  smuggle: '走私',
  siren: '海妖',
  volcano: '天灾',
  fog: '迷雾',
  treasure: '宝藏',
  faction: '势力',
  crew: '船员',
  reckoning: '抉择',
}

export function renderEventIcon(type: string, size: number = 14, fallbackColor: string = 'text-gold-400') {
  const Icon = EVENT_TYPE_ICONS[type]
  if (!Icon) return <Scroll size={size} className={fallbackColor} />
  return <Icon size={size} className={EVENT_TYPE_ICON_COLORS[type] ?? fallbackColor} />
}
