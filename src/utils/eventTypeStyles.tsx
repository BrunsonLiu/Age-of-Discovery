/* eslint-disable react-refresh/only-export-components -- 这个文件就是事件类型的样式表：既有常量表也有 renderEventIcon（返回 JSX），拆开反而要多建一个文件只为通过规则。 */
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

/**
 * 事件类型的配色：17 个类型归成 5 个「情绪族」。
 *
 * 【为什么不再一类一色】
 * 原先是 17 个类型各配一套 Tailwind 原生色（blue-400 / cyan-400 / fuchsia-400
 * / pink-400 / emerald-400 …），两张表 34 个手写值。结果是色相铺满整圈，
 * 红橙黄绿青蓝紫粉品红全在，和铜木金边不是一个世界。
 *（原先还有第三张表 EVENT_TYPE_BG 让**卡片底色**也跟着类型变——风暴卡纯深蓝、
 * 庆典卡深粉，一张纸牌换一种底色，翻两页就像换了三个游戏。已整个删除，
 * 卡片底色现在固定在 EventCard 里。）
 *
 * 【为什么归成 5 族而不是全部统一成金色】
 * 类型色是有信息价值的： glimpse 一眼就知道是"要打"还是"要赚"。
 * 全部压成金色等于丢掉这层信息。归族之后仍然分得清方向，
 * 而族内靠图标形状区分（骷髅 / 章鱼 / 海妖是三个不同轮廓）——
 * 形状比颜色更可靠，色弱玩家也能读。
 *
 * 【5 族的取色】
 * 全部落在项目已有色板（danger / ocean / gold / parchment）内，
 * 只有「隐秘」用 slate 这唯一一个中性外来色——灰蓝不抢戏。
 */
type EventFamily = 'danger' | 'weather' | 'fortune' | 'human' | 'shadow'

const EVENT_FAMILIES: Record<EventFamily, { icon: string; border: string }> = {
  /** 会伤船伤人的：红铜 */
  danger: { icon: 'text-danger-300', border: 'border-l-danger-500/50' },
  /** 天与海本身：深海蓝（项目自有的 ocean，不是 Tailwind blue） */
  weather: { icon: 'text-ocean-200', border: 'border-l-ocean-400/50' },
  /** 能拿到东西的：金 */
  fortune: { icon: 'text-gold-300', border: 'border-l-gold-500/50' },
  /** 人与人的：羊皮纸暖褐 */
  human: { icon: 'text-parchment-300', border: 'border-l-parchment-500/50' },
  /** 暗处来的：中性灰蓝 */
  shadow: { icon: 'text-slate-300', border: 'border-l-slate-500/50' },
}

const TYPE_FAMILY: Record<string, EventFamily> = {
  pirate: 'danger',
  kraken: 'danger',
  siren: 'danger',
  volcano: 'danger',
  disease: 'danger',
  storm: 'weather',
  fog: 'weather',
  accident: 'weather',
  discovery: 'fortune',
  treasure: 'fortune',
  historical: 'fortune',
  festival: 'human',
  faction: 'human',
  crew: 'human',
  reckoning: 'human',
  ghost: 'shadow',
  smuggle: 'shadow',
}

/** 按族取色；类型没见过时给中性金，别让界面掉成无色 */
function familyOf(type: string) {
  return EVENT_FAMILIES[TYPE_FAMILY[type]] ?? EVENT_FAMILIES.fortune
}

/** 从「类型 → 族 → 属性」派生一张表，避免三张表各手写 17 条后互相抄错 */
function derive(pick: (f: (typeof EVENT_FAMILIES)[EventFamily]) => string): Record<string, string> {
  return Object.fromEntries(Object.keys(TYPE_FAMILY).map(t => [t, pick(familyOf(t))]))
}

export const EVENT_TYPE_ICON_COLORS: Record<string, string> = derive(f => f.icon)

export const EVENT_TYPE_COLORS: Record<string, string> = derive(f => f.border)

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
