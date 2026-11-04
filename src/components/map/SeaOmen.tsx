import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { mapHandle } from '@/utils/mapHandle'
import { isOnLand } from '@/utils/landCheck'

/**
 * 海上异闻：海面上升起的一个剪影 + 一行字，几秒后自己消失。
 *
 * 【这一层存在的理由】
 * 试玩反馈是"任务感太重、弹窗太多"。所以这里刻意**什么都不做**：
 * 没有按钮、没有选项、没有奖励，甚至不需要玩家看见。
 * 玩家可以完全无视它继续开船——而世界因此还活着。
 *
 * 【为什么是 SVG 剪影而不是插图】
 * 现有事件插图是 1200×675 的油画，贴到海图上就是一个矩形，
 * 和手绘海图的语言打架。剪影是矢量：随船位缩放、边缘能融进海面，
 * 观感上像"海图边角上画的怪物"，而且零加载字节。
 *
 * 【时长】8 秒。短于 5 秒来不及看清那行字，长于 10 秒就变成挡在屏幕上的东西了。
 */
const SHOW_MS = 8000

/** 每种异闻怎么动（位置在运行时锚定船位，见组件） */
const LAYOUT: Record<string, { w: string; cls: string }> = {
  kraken: { w: 'w-[30%] max-w-[340px]', cls: 'omen-rise' },
  whale: { w: 'w-[26%] max-w-[300px]', cls: 'omen-drift' },
  ghost: { w: 'w-[22%] max-w-[260px]', cls: 'omen-drift-slow' },
  siren: { w: 'w-[18%] max-w-[210px]', cls: 'omen-rise' },
  meteor: { w: 'w-[24%] max-w-[280px]', cls: 'omen-fall' },
  lights: { w: 'w-[42%] max-w-[480px]', cls: 'omen-glow' },
}

function Silhouette({ kind }: { kind: string }) {
  // 统一用墨色：海图上画的东西本来就该是墨，不是彩色贴纸
  const ink = '#1a1207'
  const soft = 'rgba(26,18,7,0.55)'
  switch (kind) {
    case 'kraken':
      /*
       * 三条触手：由粗到细、末端收成尖，各自弯向不同方向。
       * 第一版画成了三个实心大三角，在 1440 宽的地图上读成"墨团"而不是触手——
       * 剪影的可辨识度全靠**轮廓的收窄**，不是靠面积。
       */
      return (
        <svg viewBox="0 0 300 170" className="w-full h-auto" aria-hidden="true">
          <path
            d="M46 170c-2-34 4-62 16-80 6-9 14-8 16 1 3 12-2 26 0 42 2 14 6 26 8 37z"
            fill={ink} opacity="0.92"
          />
          <path
            d="M124 170c-3-46 0-84 14-108 5-9 14-7 16 2 3 14-2 30-4 46-2 20 2 42 4 60z"
            fill={ink} opacity="0.96"
          />
          <path
            d="M214 170c3-28 8-50 18-64 6-8 14-4 14 4 0 12-6 24-8 38-2 10-2 16-2 22z"
            fill={ink} opacity="0.88"
          />
          {/* 水面扰动：一道很淡的弧，暗示水下还有东西 */}
          <ellipse cx="150" cy="166" rx="128" ry="7" fill={soft} />
        </svg>
      )
    case 'whale':
      return (
        <svg viewBox="0 0 300 120" className="w-full h-auto" aria-hidden="true">
          <path d="M10 96c40-34 96-44 150-36 26 4 48 14 62 26-18 6-34 4-52 0-30-6-58-2-84 10" fill={ink} opacity="0.9" />
          {/* 尾鳍 */}
          <path d="M232 84c12-14 26-18 40-10-8 8-16 16-22 26-6-4-12-10-18-16z" fill={ink} opacity="0.9" />
          {/* 水花 */}
          <path d="M120 96c6-14 16-20 28-18-6 12-14 18-24 22z" fill="rgba(240,236,220,0.5)" />
        </svg>
      )
    case 'ghost':
      return (
        <svg viewBox="0 0 220 220" className="w-full h-auto" aria-hidden="true">
          {/* 残帆 */}
          <path d="M96 30c22 8 34 30 32 62-14-10-24-16-36-18 6-16 6-30 4-44z" fill={ink} opacity="0.75" />
          <path d="M92 96c-18 6-28 18-30 34 14-6 24-10 34-10z" fill={ink} opacity="0.5" />
          {/* 船体 */}
          <path d="M44 150c26 10 70 10 100-2l-10 16c-26 8-58 8-82-2z" fill={ink} opacity="0.9" />
          <rect x="94" y="44" width="4" height="108" fill={ink} opacity="0.9" />
          {/* 甲板上的人影 */}
          {[62, 78, 112, 126].map((x, i) => (
            <rect key={i} x={x} y={138} width="4" height="12" fill={ink} opacity="0.8" />
          ))}
        </svg>
      )
    case 'siren':
      return (
        <svg viewBox="0 0 200 180" className="w-full h-auto" aria-hidden="true">
          {/* 礁石 */}
          <path d="M0 180c30-22 48-56 60-78 6-12 16-14 24-6 12 12 18 32 30 44 16 16 46 24 86 40z" fill={ink} opacity="0.95" />
          {/* 坐着的人影 */}
          <path d="M92 102c6-14 18-20 26-14 6 4 8 14 4 22-6 12-16 18-24 14-8-4-10-14-6-22z" fill={ink} />
          <circle cx="112" cy="78" r="8" fill={ink} />
        </svg>
      )
    case 'meteor':
      return (
        <svg viewBox="0 0 300 140" className="w-full h-auto" aria-hidden="true">
          <defs>
            <linearGradient id="omen-meteor" x1="1" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,226,150,0)" />
              <stop offset="70%" stopColor="rgba(255,214,130,0.55)" />
              <stop offset="100%" stopColor="rgba(255,246,210,0.95)" />
            </linearGradient>
          </defs>
          <path d="M8 4 L120 130 L96 132 L0 18 Z" fill="url(#omen-meteor)" />
          <circle cx="120" cy="130" r="3.5" fill="#fff6d2" />
        </svg>
      )
    case 'lights':
    default:
      return (
        <svg viewBox="0 0 320 90" className="w-full h-auto" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6].map(i => (
            <ellipse key={i} cx={24 + i * 44} cy={60 - (i % 3) * 8} rx={26} ry={5}
              fill="rgba(150,225,225,0.35)" />
          ))}
        </svg>
      )
  }
}

/**
 * 剪影该出现在哪：从船位出发，在附近找一个**确实是海面**的点。
 *
 * 【为什么不能只做像素偏移】第一版按"船右边 80% 船宽"偏移，
 * 实测幽灵船直接画在摩洛哥海岸上——地图一平移，"海面上的东西"就落到陆地。
 * 一艘船压在陆地上比不出现更破坏可信度。
 *
 * 做法：取船位经纬度，按 8 个方向 × 3 个距离试探，用 `isOnLand` 挑第一个海面点，
 * 再用 Leaflet 的 `latLngToContainerPoint` 换成像素。
 * 拿不到地图实例（还没挂载/3D 视图）时退回原来的像素偏移——总比不显示好。
 */
function omenAnchor(): { left: string; top: string } {
  const fallback = { left: '40%', top: '45%' }
  if (typeof document === 'undefined') return fallback
  const ship = document.querySelector('[data-tut="ship"]')
  const r = ship?.getBoundingClientRect()
  const pxFallback = r
    ? {
      left: `${Math.round(Math.min(Math.max(r.left + r.width * 0.7, 8), window.innerWidth * 0.7))}px`,
      top: `${Math.round(Math.min(Math.max(r.top + r.height * 0.55, window.innerHeight * 0.15), window.innerHeight * 0.62))}px`,
    }
    : fallback

  const map = mapHandle()
  const pos = useGameStore.getState().shipPosition
  if (!map || !pos) return pxFallback
  const [lat, lng] = pos
  // 由近到远、八个方向；先找近的，找不到再往外
  for (const deg of [1.6, 3.2, 5]) {
    for (const a of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const rad = (a * Math.PI) / 180
      const dLat = Math.cos(rad) * deg
      const dLng = Math.sin(rad) * deg
      const la = lat + dLat
      const ln = lng + dLng
      if (la > 84 || la < -84 || ln < -180 || ln > 180) continue
      if (isOnLand(la, ln)) continue
      const pt = map.latLngToContainerPoint([la, ln])
      if (pt.x < 40 || pt.y < 40 || pt.x > map.getSize().x - 40 || pt.y > map.getSize().y - 40) continue
      return { left: `${Math.round(pt.x)}px`, top: `${Math.round(pt.y)}px` }
    }
  }
  return pxFallback
}

export default function SeaOmen() {
  const omen = useGameStore(s => s.seaOmen)
  const panel = useGameStore(s => s.activePanel)
  const [shown, setShown] = useState<{ kind: string; text: string; day: number } | null>(null)
  const lastDayRef = useRef<number>(-1)

  useEffect(() => {
    if (!omen) return
    if (omen.day === lastDayRef.current) return
    lastDayRef.current = omen.day
    setShown(omen)
    const t = setTimeout(() => setShown(null), SHOW_MS)
    return () => clearTimeout(t)
  }, [omen])

  // 面板打开时不抢戏：玩家正在看数据，不需要海面同时讲故事
  if (!shown || panel) return null

  const layout = LAYOUT[shown.kind] ?? LAYOUT.lights

  /*
   * 锚定在船位旁边，而不是屏幕的固定角落。
   *
   * 【为什么】第一版用固定百分比（左下 14%），实测幽灵船直接画在了伊比利亚半岛上——
   * 地图一平移，"海面上的东西"就落到陆地上了。一艘船压在陆地上，
   * 比完全不出现更破坏可信度。
   * 船位每帧都在海上（搁浅会被判失败），以它为锚点，剪影永远漂在船附近的水面。
   * 拿不到船元素时退回 45% 屏幕处——总比画在岸上好。
   */
  const anchor = omenAnchor()

  return (
    <div
      data-sea-omen={shown.kind}
      className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 460 }}
      aria-hidden="true"
    >
      <div className={`absolute ${layout.w} ${layout.cls}`} style={{ left: anchor.left, top: anchor.top }}>
        <Silhouette kind={shown.kind} />
      </div>
      {/* 一行字压在剪影下方：这是整段体验唯一的"文本"，不再弹任何东西。
          位置抬到 17%：第一版放 6%，实测正好被底栏盖住，等于没写。 */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[17%] omen-caption">
        <span
          className="inline-block font-serif text-[13px] tracking-wide px-3 py-1 rounded"
          style={{
            color: 'rgba(244,232,206,0.94)',
            // 底衬：海面有时是深蓝、有时是浅羊皮纸，单靠字色压不住两种底色
            background: 'rgba(22,15,7,0.62)',
            border: '1px solid rgba(201,169,110,0.28)',
            textShadow: '0 1px 2px rgba(0,0,0,0.85)',
          }}
        >
          {shown.text}
        </span>
      </div>
    </div>
  )
}
