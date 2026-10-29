import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSun, Sun } from 'lucide-react'
import { WEATHER_INFO, type WeatherKind } from '@/utils/weather'

/**
 * 天气图标（统一来源）。
 *
 * 【为什么要有这个组件】
 * 天气原先靠 `WEATHER_INFO[kind].icon` 里的 emoji（☀️ ⛅ 🌧️ ⛈️ 🌫️）表示，
 * 在 Windows 上由 Segoe UI Emoji 渲染成彩色——五个天气各是一种亮色，
 * 摆在铜木金边的面板里格外扎眼，而且和其余全部使用描边图标的界面
 * 完全不是一套视觉语言。
 *
 * 【为什么映射在渲染层而不是数据层】
 * `utils/weather.ts` 是纯逻辑层，被单测直接 import，不该引入 React 组件。
 * 所以数据层只描述"是什么天气"（kind），映射成哪个图标由渲染层决定。
 */
const GLYPH: Record<WeatherKind, typeof Sun> = {
  clear: Sun,
  cloudy: CloudSun,
  rain: CloudRain,
  storm: CloudLightning,
  fog: CloudFog,
}

export default function WeatherIcon({
  kind, size = 14, className, strokeWidth = 1.6,
}: {
  kind: WeatherKind
  size?: number
  className?: string
  strokeWidth?: number
}) {
  // kind 来自存档，跨版本可能有未知值：兜底给一朵云，别让界面崩
  const Glyph = GLYPH[kind] ?? Cloud
  const label = WEATHER_INFO[kind]?.label ?? '天气'
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-label={label}
      role="img"
    />
  )
}
