import { useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { WEATHER_INFO, weatherForecast } from '@/utils/weather'
import { prevailingWindBearing } from '@/utils/navigation'
import { ports } from '@/data/ports'
import WeatherIcon from '@/components/ui/WeatherIcon'

/**
 * 天候徽章（常驻罗盘下方）：
 * - 图标 + 天候名 + 风速 + 航速影响（-% 一眼看到代价）
 * - 点击展开未来 3 天预报——出航前看一眼，是这条环境线的决策入口
 */
export default function WeatherBadge() {
  const weather = useGameStore(s => s.weather)
  const fleet = useGameStore(s => s.fleet)
  const shipPosition = useGameStore(s => s.shipPosition)
  const [open, setOpen] = useState(false)
  const info = WEATHER_INFO[weather.kind]

  // 预报基准位置：航行中用船位，港内用港口
  const lat = fleet.isSailing
    ? shipPosition?.[0]
    : ports.find(p => p.id === fleet.currentPortId)?.latitude
  const lng = fleet.isSailing
    ? shipPosition?.[1]
    : ports.find(p => p.id === fleet.currentPortId)?.longitude

  const forecast = lat != null && lng != null
    ? weatherForecast(weather, fleet.day, lat, lng, prevailingWindBearing(lat), 3)
    : []

  const speedPct = Math.round((info.sailMul - 1) * 100)
  // 风向箭头：风吹去的方位 → 旋转角（罗盘 0°=上）
  const windArrowRotation = weather.windDir

  return (
    <div data-testid="weather-badge" className="pointer-events-auto select-none">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-ocean-800/70 border border-gold-700/30 hover:border-gold-600/50 transition-colors shadow-lg"
        title={`${info.label}：${info.hint}（点击看预报）`}
        aria-label={`天候：${info.label}，点击展开预报`}
        aria-expanded={open}
      >
        <WeatherIcon kind={info.kind} size={16} className="text-gold-300" />
        <span className="text-gold-200 font-serif text-xs">{info.label}</span>
        <span className="text-gold-600 font-serif text-[10px] tabular-nums">{weather.windSpeed}节</span>
        {speedPct !== 0 && (
          <span className={`font-serif text-[10px] tabular-nums ${speedPct < 0 ? 'text-red-300/90' : 'text-emerald-300/90'}`}>
            航速{speedPct > 0 ? '+' : ''}{speedPct}%
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 24 24" style={{ transform: `rotate(${windArrowRotation}deg)` }} className="transition-transform duration-700">
          <path d="M12 2 L16 14 L12 11.5 L8 14 Z" fill="#d4a838" />
        </svg>
        <span className={`text-gold-700 text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="mt-1 w-56 rounded-md bg-ocean-800/90 border border-gold-700/30 shadow-xl p-2 space-y-1.5">
          <p className="text-gold-500 font-serif text-[10px]">{info.hint}</p>
          <div className="border-t border-gold-700/20 pt-1.5">
            <p className="text-gold-400 font-serif text-[10px] mb-1">未来三天</p>
            {forecast.map((w, i) => {
              const fi = WEATHER_INFO[w.kind]
              return (
                <div key={i} className="flex items-center gap-2 py-0.5">
                  <span className="text-gold-600 font-serif text-[10px] w-8 tabular-nums">第{fleet.day + i}天</span>
                  <span className="w-4 flex justify-center text-gold-300"><WeatherIcon kind={w.kind} size={12} /></span>
                  <span className="text-gold-200 font-serif text-[11px] flex-1">{fi.label}</span>
                  <span className="text-gold-600 font-serif text-[10px] tabular-nums">{w.windSpeed}节</span>
                  <span className={`font-serif text-[10px] tabular-nums w-10 text-right ${fi.sailMul < 1 ? 'text-red-300/80' : 'text-emerald-300/80'}`}>
                    {Math.round((fi.sailMul - 1) * 100)}%
                  </span>
                </div>
              )
            })}
          </div>
          <p className="text-gold-700 font-serif text-[9px] leading-relaxed">
            天气按海域生成、持续 1-3 天；赤道无风带多雾，中纬度多暴风雨。
          </p>
        </div>
      )}
    </div>
  )
}
