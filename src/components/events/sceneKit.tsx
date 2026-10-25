import type { ReactElement, ReactNode } from 'react'

/**
 * 事件场景共享图元（sceneKit）。
 *
 * 所有事件插图都用同一套"古海图"视觉语言绘制：
 * - 400×140 viewBox，深海军蓝 + 羊皮纸金 + 哑光帆白
 * - 动画全部来自 index.css 里的 scene-* keyframes，不依赖 JS 定时器
 * - 伪随机用固定种子（seeded），保证每次渲染同一场景画面稳定
 */

/** 稳定伪随机：同一 uid 永远得到同一序列，避免重渲染时星位乱跳 */
function makeRandom(seed: number): () => number {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function hashStr(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

export interface SkyProps {
  uid: string
  from: string
  to: string
  /** 可选的第三段渐变色（中段） */
  mid?: string
}

/** 天空渐变底 */
export function Sky({ uid, from, mid, to }: SkyProps): ReactElement {
  const gid = `sky-${uid}`
  return (
    <>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          {mid && <stop offset="0.55" stopColor={mid} />}
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="400" height="140" fill={`url(#${gid})`} />
    </>
  )
}

/** 星空（确定性） */
export function Stars({ uid, count = 26, maxY = 66 }: { uid: string; count?: number; maxY?: number }): ReactElement {
  const rand = makeRandom(hashStr(uid))
  const stars = Array.from({ length: count }, () => ({
    cx: rand() * 400,
    cy: rand() * maxY,
    r: 0.4 + rand() * 1.1,
    delay: rand() * 2.6,
  }))
  return (
    <g>
      {stars.map((s, i) => (
        <circle
          key={i}
          cx={s.cx}
          cy={s.cy}
          r={s.r}
          fill="#f0e6c8"
          className="scene-twinkle"
          style={{ animationDelay: `${s.delay}s` }}
        />
      ))}
    </g>
  )
}

export interface WaveLayerProps {
  y: number
  fill: string
  opacity?: number
  speed?: 1 | 2 | 3
  amp?: number
}

/** 一层往复平缓滚动的浪（路径以 50 为周期，平移 -50 无缝循环） */
export function WaveLayer({ y, fill, opacity = 1, speed = 1, amp = 6 }: WaveLayerProps): ReactElement {
  const d = `M-60 ${y} Q-35 ${y - amp} -10 ${y} T40 ${y} T90 ${y} T140 ${y} T190 ${y} T240 ${y} T290 ${y} T340 ${y} T390 ${y} T440 ${y} L440 160 L-60 160 Z`
  return <path d={d} fill={fill} opacity={opacity} className={`scene-wave-${speed}`} />
}

export interface ShipProps {
  x?: number
  y?: number
  scale?: number
  rotate?: number
  flip?: boolean
  flagColor?: string
  sail?: 'full' | 'droop' | 'torn'
  /** 幽灵船：半透明 + 惨绿描边 */
  ghost?: boolean
  className?: string
  children?: ReactNode
}

/**
 * 通用帆船剪影：船体 + 前/主桅 + 四帆 + 旗。
 * 以 (x, y) 为水线中心，向上生长。
 */
export function Ship({
  x = 200,
  y = 100,
  scale = 1,
  rotate = 0,
  flip = false,
  flagColor = '#b8432e',
  sail = 'full',
  ghost = false,
  className = '',
  children,
}: ShipProps): ReactElement {
  const hullFill = ghost ? 'rgba(150,190,170,0.20)' : '#0a0f16'
  const mastStroke = ghost ? 'rgba(160,200,180,0.55)' : '#0a0f16'
  const sailFillA = ghost ? 'rgba(180,220,195,0.16)' : '#e6d9b8'
  const sailFillB = ghost ? 'rgba(180,220,195,0.12)' : '#cdbd92'

  // 帆布姿态：饱满 / 下垂 / 破损
  const sailGroup =
    sail === 'droop' ? (
      <g transform="translate(0 10) scale(1 0.55)">
        <path d="M-8 -22 Q-19 -14 -8 -6 Q3 -14 -8 -22 Z" fill={sailFillA} />
        <path d="M12 -36 Q-1 -25 12 -14 Q25 -25 12 -36 Z" fill={sailFillA} />
        <path d="M12 -12 Q4 -4 12 2 Q20 -4 12 -12 Z" fill={sailFillB} />
      </g>
    ) : sail === 'torn' ? (
      <g>
        <path d="M-8 -22 Q-19 -14 -8 -6 L-4 -12 L-2 -5 L1 -14 L3 -6 Q3 -14 -8 -22 Z" fill={sailFillA} />
        <path d="M12 -36 Q-1 -25 12 -14 L6 -20 L4 -13 L9 -22 L11 -15 Q25 -25 12 -36 Z" fill={sailFillA} />
        <path d="M12 -12 Q4 -4 12 2 Q20 -4 12 -12 Z" fill={sailFillB} />
      </g>
    ) : (
      <g>
        <path d="M-8 -22 Q-19 -14 -8 -6 Q3 -14 -8 -22 Z" fill={sailFillA} />
        <path d="M-8 -5 Q-15 0 -8 4 Q-1 0 -8 -5 Z" fill={sailFillB} />
        <path d="M12 -36 Q-1 -25 12 -14 Q25 -25 12 -36 Z" fill={sailFillA} />
        <path d="M12 -12 Q4 -4 12 2 Q20 -4 12 -12 Z" fill={sailFillB} />
      </g>
    )

  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${flip ? -scale : scale} ${scale})`} className={className}>
      {/* 船体 */}
      <path d="M-34 0 H34 L28 12 Q17 18 6 12 H-28 Z" fill={hullFill} stroke={ghost ? 'rgba(160,220,185,0.6)' : 'none'} strokeWidth="0.8" />
      <path d="M-30 2 H30" stroke={ghost ? 'rgba(160,220,185,0.4)' : '#c9a96e'} strokeWidth="0.7" opacity="0.7" />
      {/* 桅杆 */}
      <line x1={-8} y1={0} x2={-8} y2={-26} stroke={mastStroke} strokeWidth="2.2" />
      <line x1={12} y1={0} x2={12} y2={-40} stroke={mastStroke} strokeWidth="2.6" />
      {sailGroup}
      {/* 旗 */}
      <path d="M12 -40 L24 -36.5 L12 -33 Z" fill={ghost ? 'rgba(160,220,185,0.5)' : flagColor} className="scene-flag" />
      {children}
    </g>
  )
}

/** 一团云（椭圆群） */
export function Cloud({ x, y, scale = 1, fill = '#2a3a4e', opacity = 0.9 }: { x: number; y: number; scale?: number; fill?: string; opacity?: number }): ReactElement {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}>
      <ellipse cx="0" cy="0" rx="34" ry="11" fill={fill} />
      <ellipse cx="-18" cy="3" rx="20" ry="8" fill={fill} />
      <ellipse cx="16" cy="3" rx="22" ry="9" fill={fill} />
      <ellipse cx="2" cy="-7" rx="18" ry="8" fill={fill} />
    </g>
  )
}

/** 闪电（折线 + 分叉），配合 scene-flash 的强光背景使用 */
export function Lightning({ x, y, scale = 1 }: { x: number; y: number; scale?: number }): ReactElement {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="scene-flash">
      <polygon points="0,0 -10,26 2,26 -6,52 16,22 4,22 12,0" fill="#f5e9c8" />
      <polygon points="0,0 -10,26 2,26 -6,52 16,22 4,22 12,0" fill="#fffbe8" opacity="0.6" />
    </g>
  )
}

/** 骷髅旗（黑旗 + 白骨） */
export function SkullFlag({ x, y, scale = 1 }: { x: number; y: number; scale?: number }): ReactElement {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M0 0 H26 Q31 4 26 8 H0 Z" fill="#101418" />
      <circle cx="13" cy="4" r="3.4" fill="#e8e0c8" />
      <rect x="11.6" y="6" width="2.8" height="3" fill="#e8e0c8" />
      <circle cx="11.6" cy="3.4" r="0.7" fill="#101418" />
      <circle cx="14.4" cy="3.4" r="0.7" fill="#101418" />
    </g>
  )
}

/** 椰子树 */
export function PalmTree({ x, y, scale = 1, flip = false }: { x: number; y: number; scale?: number; flip?: boolean }): ReactElement {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale})`}>
      <path d="M0 0 Q-3 -14 1 -26" stroke="#5a4020" strokeWidth="2.6" fill="none" />
      <path d="M1 -26 Q-14 -32 -22 -24" stroke="#2e5a34" strokeWidth="2.4" fill="none" />
      <path d="M1 -26 Q14 -33 22 -25" stroke="#2e5a34" strokeWidth="2.4" fill="none" />
      <path d="M1 -26 Q-8 -38 -16 -38" stroke="#356840" strokeWidth="2.2" fill="none" />
      <path d="M1 -26 Q10 -39 18 -37" stroke="#356840" strokeWidth="2.2" fill="none" />
      <circle cx="1" cy="-24" r="1.6" fill="#6b4e1e" />
    </g>
  )
}

/** 简单人物剪影（船员） */
export function Figure({ x, y, scale = 1, fill = '#0a0f16', lean = 0, flip = false }: { x: number; y: number; scale?: number; fill?: string; lean?: number; flip?: boolean }): ReactElement {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -scale : scale} ${scale}) rotate(${lean})`}>
      <circle cx="0" cy="-13" r="3" fill={fill} />
      <path d="M-3.5 -9 Q0 -11 3.5 -9 L4.5 0 L-4.5 0 Z" fill={fill} />
      <path d="M-4.5 0 L-5 6 M4.5 0 L5 6" stroke={fill} strokeWidth="1.6" />
    </g>
  )
}

/** 太阳 / 落日 */
export function Sun({ x, y, r = 16, core = '#e8c86a', glow = 'rgba(232,200,106,0.35)' }: { x: number; y: number; r?: number; core?: string; glow?: string }): ReactElement {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r * 2.1} fill={glow} />
      <circle r={r} fill={core} />
    </g>
  )
}

/** 月亮 */
export function Moon({ x, y, r = 12 }: { x: number; y: number; r?: number }): ReactElement {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r * 2.4} fill="rgba(220,225,210,0.10)" />
      <circle r={r} fill="#e6e2cc" />
      <circle cx={r * 0.35} cy={-r * 0.2} r={r * 0.16} fill="rgba(120,120,110,0.35)" />
      <circle cx={-r * 0.3} cy={r * 0.3} r={r * 0.11} fill="rgba(120,120,110,0.3)" />
    </g>
  )
}

/** 海鸥 */
export function Seagull({ x, y, scale = 1 }: { x: number; y: number; scale?: number }): ReactElement {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="scene-bob">
      <path d="M-8 0 Q-4 -5 0 0 Q4 -5 8 0" stroke="#1a2430" strokeWidth="1.4" fill="none" />
    </g>
  )
}

/** 音符（飘动） */
export function Note({ x, y, scale = 1, delay = 0 }: { x: number; y: number; scale?: number; delay?: number | string }): ReactElement {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="scene-note" style={{ animationDelay: `${delay}s` }}>
      <circle cx="0" cy="0" r="2.6" fill="#e8c86a" />
      <rect x="2" y="-9" width="1.4" height="9.5" fill="#e8c86a" />
      <path d="M3.4 -9 Q7 -7.5 6 -4" stroke="#e8c86a" strokeWidth="1.3" fill="none" />
    </g>
  )
}

/** 木头纹理背景（船舱/酒馆内部） */
export function WoodBg({ tone = '#4a3420' }: { tone?: string }): ReactElement {
  return (
    <>
      <rect x="0" y="0" width="400" height="140" fill={tone} />
      {[14, 42, 70, 98, 126].map((y) => (
        <rect key={y} x="0" y={y} width="400" height="1" fill="rgba(0,0,0,0.25)" />
      ))}
      <rect x="0" y="0" width="400" height="140" fill="url(#wood-vig)" opacity="0.5" />
      <defs>
        <radialGradient id="wood-vig" cx="0.5" cy="0.42" r="0.9">
          <stop offset="0.55" stopColor="rgba(0,0,0,0)" />
          <stop offset="1" stopColor="rgba(0,0,0,0.55)" />
        </radialGradient>
      </defs>
    </>
  )
}

/** 默认场景：开阔海面 + 单船 + 罗盘玫瑰，供没有 sceneKey 的事件兜底 */
export function DefaultScene(): ReactElement {
  return (
    <>
      <Sky uid="default" from="#33506e" mid="#6e86a0" to="#d8c9a3" />
      <Sun x={330} y={30} r={13} />
      <WaveLayer y={92} fill="#123049" speed={1} />
      <WaveLayer y={104} fill="#0e2438" speed={2} />
      <WaveLayer y={118} fill="#0a1826" speed={3} />
      <Ship x={200} y={104} />
    </>
  )
}
