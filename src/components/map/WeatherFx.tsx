import { useGameStore } from '@/store/useGameStore'
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
      {/*
        云影：阴/雨/暴风雨时压在海面上的暗色云团，缓慢横向滚动。

        【为什么不再用 weather_clouds.png 平铺】
        那张图是 1024 的位图，放大到 1800px 平铺后**必然露缝**：
        1440 宽的屏上能看到一条硬竖线，横向还有一条分带——实测截图里非常明显，
        像两张图拼接。位图平铺在任何"非整数倍"的尺寸上都会这样，除非做真正的无缝贴图。
        改用 4 个大半径 radial-gradient 叠出的不规则云团，尺寸按百分比给：
        天生无缝，且可以任意缩放、任意漂移都不露边。
        另外云用**暗色**而不是白云——原先的白云贴图会把整个画面提亮，
        雨天实测比晴天还亮 2.3 个亮度，方向是反的（见下方调色层的注释）。
      */}
      {(kind === 'cloudy' || isRain || isStorm) && (
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="wx-cloud-roll absolute"
            style={{
              left: '-25%',
              top: '-25%',
              width: '150%',
              height: '150%',
              opacity: isStorm ? 0.95 : isRain ? 0.62 : 0.34,
              background: [
                'radial-gradient(ellipse 26% 20% at 20% 32%, rgba(8,13,22,0.62), transparent 70%)',
                'radial-gradient(ellipse 32% 24% at 58% 20%, rgba(8,13,22,0.56), transparent 72%)',
                'radial-gradient(ellipse 28% 22% at 80% 60%, rgba(8,13,22,0.5), transparent 70%)',
                'radial-gradient(ellipse 38% 28% at 36% 74%, rgba(8,13,22,0.44), transparent 74%)',
              ].join(','),
            }}
          />
        </div>
      )}

      {/*
        天候调色层：**必须在云/雨/雾纹理之上**。

        【为什么不能放在最底下】原先它在第一层（纹理之下），实测的净效果是反的：
          晴天 81.1 亮度 → 阴天 83.9（+2.8）、雨 83.4（+2.3）
        阴雨天比晴天还亮。原因是压暗层被上方的云图盖住——云图是亮的（白云），
        opacity 0.22~0.34 的叠加把压暗整个吃掉了，还倒赚。
        而"天空变暗"本来就是天气最主要的视觉线索，方向反了等于没做。

        现在它压在纹理之上，等于给整个画面套一层天候滤镜：
          阴天 −8 / 雨 −12 / 暴风雨 −38（亮度，基线 81）
          浓雾反过来提亮 +40（雾是灰白色的）
        各值都是按"叠加后海面平均亮度"反算的，不是随手给的 alpha。
      */}
      <div
        className="absolute inset-0 transition-opacity duration-1000"
        style={{
          background: isStorm
            ? 'linear-gradient(180deg, rgba(6,10,20,0.80) 0%, rgba(8,14,26,0.70) 45%, rgba(6,10,20,0.76) 100%)'
            : isFog
              ? 'linear-gradient(180deg, rgba(170,180,190,0.44) 0%, rgba(152,164,176,0.34) 50%, rgba(162,172,184,0.46) 100%)'
              : isRain
                ? 'linear-gradient(180deg, rgba(14,22,36,0.50) 0%, rgba(16,26,40,0.42) 50%, rgba(14,22,36,0.48) 100%)'
                : 'linear-gradient(180deg, rgba(22,30,44,0.38) 0%, rgba(24,32,46,0.30) 50%, rgba(22,30,44,0.36) 100%)',
        }}
      />

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
            backgroundSize: '1100px 1100px',
            animationDuration: isStorm ? '0.7s' : '2.2s',
            opacity: isStorm ? 0.5 : 0.4,
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

      {/*
        浪花飞沫层已删除。

        【为什么删】它是 fx_spray.png 用 `repeat-x` + `backgroundSize: auto 100%`
        平铺出来的：1440 宽的屏上能看到 5 段一模一样的白色水柱，段与段之间是
        齐平的硬边——不是"浪在翻"，是"同一张图盖章了五次"。这是整屏最扎眼的
        贴图接缝（截图里像五道白色瀑布并排）。
        更要紧的是它在空间上讲不通：这是**俯视海图**，屏幕底边并不对应任何真实
        位置，没有"脚下的海面"可以翻白沫。第一人称视角的浪花放在俯视图里，
        无论画得多好都只是屏幕装饰。暴风雨的强度已经由调色层（−34.6 亮度）
        + 密集雨丝 + 闪电三样表达，不缺这一层。
      */}

      {/* 纹理层的关键帧：雨向下滚、雾横向漂、云团缓滚 */}
      <style>{`
        @keyframes wxRainScroll { from { background-position: 0 0; } to { background-position: -80px 640px; } }
        @keyframes wxFogDrift { from { background-position: 0 0; } to { background-position: 1200px 0; } }
        @keyframes wxCloudRoll {
          from { transform: translate3d(-3.5%, 0, 0) scale(1); }
          to   { transform: translate3d(3.5%, 1.5%, 0) scale(1.06); }
        }
        .wx-rain-tex { animation: wxRainScroll linear infinite; }
        .wx-fog-tex { animation: wxFogDrift 26s linear infinite; }
        .wx-cloud-roll { animation: wxCloudRoll 46s ease-in-out infinite alternate; will-change: transform; }
      `}</style>

      {/* 天候名签已删除。
          它原来固定在 top-3 居中，而顶栏 h-12（48px）且在更上层：
          实测元素矩形 y=12~38 完全落在顶栏里，elementFromPoint 命中的是顶栏内部
          —— 也就是说这块牌子**从加进来到现在一次都没被看见过**，是纯死代码。
          而且它和左上角的天候徽章（WeatherBadge：天候名 + 风速 + 航速影响，可点开
          三日预报）信息完全重复。天气本来就有两处显示，删掉看不见的那处。 */}
    </div>
  )
}
