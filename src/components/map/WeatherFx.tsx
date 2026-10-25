import { useGameStore } from '@/store/useGameStore'
import { WEATHER_INFO } from '@/utils/weather'
import { FX_ASSETS } from '@/data/envAssets'
import type { WeatherKind } from '@/types'

/**
 * 天候氛围层：把"环境"这条线直接画在屏幕上。
 * 由 store 里的真实天气状态驱动（不再是航线危险度的静态替代品）：
 * - 晴：只留极淡的暖色晕
 * - 阴：冷灰压暗
 * - 雨：压暗 + 慢雨丝 + 薄雾
 * - 暴风雨：重压暗 + 快雨 + 双闪电 + 浓雾翻滚
 * - 浓雾：白障 + 三条横向漂移雾带 + 阵风扫影
 * 阵风层的角度跟随 weather.windDir——风从哪边来，看得见。
 * 只做氛围，不遮挡交互（pointer-events-none）。
 */
export default function WeatherFx() {
  const weather = useGameStore(s => s.weather)
  const isSailing = useGameStore(s => s.fleet.isSailing)
  const kind: WeatherKind = weather.kind
  const info = WEATHER_INFO[kind]

  // 港内有屋檐：只在海上（或世界地图可见时）渲染天气
  if (!isSailing || kind === 'clear') return null

  const isStorm = kind === 'storm'
  const isFog = kind === 'fog'
  const isRain = kind === 'rain'
  // 阵风角度：风吹去的方位 → CSS 线性渐变角度（罗盘 0°=北=上，CSS 90deg=右→需 +90 映射到"从左往右下"）
  const gustAngle = (weather.windDir + 90) % 360

  return (
    // 层级 450：高于 Leaflet 图块/覆盖层（200/400），低于标记（600）与控件（1000）
    <div className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 450 }} aria-hidden="true">
      {/* 整体压暗：按天候分级 */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          background: isStorm
            ? 'linear-gradient(180deg, rgba(8,14,24,0.6) 0%, rgba(10,18,30,0.42) 45%, rgba(8,14,24,0.55) 100%)'
            : isFog
              ? 'linear-gradient(180deg, rgba(168,178,188,0.4) 0%, rgba(150,162,174,0.3) 50%, rgba(160,170,182,0.42) 100%)'
              : isRain
                ? 'linear-gradient(180deg, rgba(14,22,36,0.4) 0%, rgba(16,26,40,0.26) 50%, rgba(14,22,36,0.38) 100%)'
                : 'linear-gradient(180deg, rgba(22,30,44,0.24) 0%, rgba(24,32,46,0.14) 50%, rgba(22,30,44,0.22) 100%)',
        }}
      />

      {/* 云层（B3 真实云图）：阴/雨/暴风雨的天空，缓慢西移 */}
      {(kind === 'cloudy' || isRain || isStorm) && (
        <div
          className="absolute inset-0 wx-cloud-drift"
          style={{
            backgroundImage: `url(${FX_ASSETS.clouds})`,
            backgroundRepeat: 'repeat',
            backgroundSize: '900px 900px',
            opacity: isStorm ? 0.5 : isRain ? 0.34 : 0.22,
          }}
        />
      )}

      {/* 雨层：落雨慢丝 / 暴风雨快而密 */}
      {(isRain || isStorm) && (
        <div className={`absolute inset-0 ${isStorm ? 'wx-rain wx-rain-fast' : 'wx-rain-slow'}`} />
      )}

      {/* 真雨丝纹理（G1）：叠在 CSS 雨上增加密度与方向感 */}
      {(isRain || isStorm) && (
        <div
          className="absolute inset-0 wx-rain-tex"
          style={{
            backgroundImage: `url(${FX_ASSETS.rain})`,
            backgroundRepeat: 'repeat',
            backgroundSize: '640px 640px',
            animationDuration: isStorm ? '0.7s' : '2.2s',
            opacity: isStorm ? 0.5 : 0.34,
          }}
        />
      )}

      {/* 真雾团纹理（G2）：浓雾时横向漂移的雾块，叠在 CSS 雾带之下增加厚度 */}
      {isFog && (
        <div
          className="absolute inset-0 wx-fog-tex"
          style={{
            backgroundImage: `url(${FX_ASSETS.fog})`,
            backgroundRepeat: 'repeat',
            backgroundSize: '1200px 1200px',
            opacity: 0.5,
          }}
        />
      )}

      {/* 阵风扫影：所有非晴朗天气都能看到风的走向 */}
      <div className="absolute inset-0 wx-gust" style={{ '--wx-gust-angle': `${gustAngle}deg` } as React.CSSProperties} />

      {/* 薄雾/浓雾：暴风雨是低滚的雾，浓雾是贴海的厚障 */}
      <div className="absolute inset-0 wx-mist" style={{ opacity: isStorm ? 0.55 : isFog ? 0.9 : 0.45 }}>
        <div className="absolute left-0 right-0 top-[18%] h-16"
          style={{ background: 'radial-gradient(ellipse at center, rgba(190,205,215,0.16) 0%, transparent 70%)' }} />
        <div className="absolute left-0 right-0 top-[46%] h-20"
          style={{ background: 'radial-gradient(ellipse at center, rgba(190,205,215,0.12) 0%, transparent 70%)' }} />
      </div>

      {/* 浓雾专属：三条不同速度的横向雾带，制造"看不见"的厚度 */}
      {isFog && (
        <>
          <div className="absolute left-0 right-0 top-[10%] h-24 wx-fog-band"
            style={{ background: 'radial-gradient(ellipse at 30% 50%, rgba(205,214,222,0.34) 0%, transparent 72%)' }} />
          <div className="absolute left-0 right-0 top-[38%] h-28 wx-fog-band wx-fog-band-2"
            style={{ background: 'radial-gradient(ellipse at 65% 50%, rgba(198,208,218,0.3) 0%, transparent 70%)' }} />
          <div className="absolute left-0 right-0 top-[64%] h-24 wx-fog-band wx-fog-band-3"
            style={{ background: 'radial-gradient(ellipse at 45% 50%, rgba(210,218,226,0.26) 0%, transparent 68%)' }} />
        </>
      )}

      {/* 暴风雨：双位闪电 */}
      {isStorm && (
        <>
          <div className="absolute inset-0 wx-lightning" style={{ background: 'radial-gradient(ellipse at 70% 20%, rgba(230,240,255,0.9) 0%, transparent 55%)' }} />
          <div className="absolute inset-0 wx-lightning" style={{ background: 'radial-gradient(ellipse at 25% 30%, rgba(230,240,255,0.8) 0%, transparent 50%)', animationDelay: '-3.2s' }} />
        </>
      )}

      {/* 浪花飞沫（G3）：暴风雨贴海面翻卷的白沫 */}
      {isStorm && (
        <div
          className="absolute inset-x-0 bottom-0 h-1/3 wx-spray-tex"
          style={{
            backgroundImage: `url(${FX_ASSETS.spray})`,
            backgroundRepeat: 'repeat-x',
            backgroundSize: 'auto 100%',
          }}
        />
      )}

      {/* 纹理层的关键帧：雨向下滚、雾与云横向漂、飞沫呼吸 */}
      <style>{`
        @keyframes wxRainScroll { from { background-position: 0 0; } to { background-position: -80px 640px; } }
        @keyframes wxFogDrift { from { background-position: 0 0; } to { background-position: 1200px 0; } }
        @keyframes wxCloudDrift { from { background-position: 0 0; } to { background-position: -900px 0; } }
        @keyframes wxSprayBreath { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.62; } }
        .wx-rain-tex { animation: wxRainScroll linear infinite; }
        .wx-fog-tex { animation: wxFogDrift 26s linear infinite; }
        .wx-cloud-drift { animation: wxCloudDrift 90s linear infinite; }
        .wx-spray-tex { animation: wxSprayBreath 3.6s ease-in-out infinite; }
      `}</style>

      {/* 天候名签：让玩家知道屏幕上这场雨叫什么 */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded bg-ocean-900/50 border border-gold-700/25">
        <span className="text-sm">{info.icon}</span>
        <span className="text-gold-200 font-serif text-xs">{info.label}</span>
        <span className="text-gold-600 font-serif text-[10px]">{weather.windSpeed}节</span>
      </div>
    </div>
  )
}
