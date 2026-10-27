import { useMemo, useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { ports } from '@/data/ports'
import { calculateBearing } from '@/utils/navigation'
import { UI_ASSETS } from '@/data/uiAssets'

interface CompassProps {
  /** 当前风带风向（风吹去的罗盘方位角）；传入时在罗盘角上显示风向标 */
  windBearing?: number | null
  /**
   * 表盘尺寸（Tailwind 类）。默认 96px；移动端传 64px——
   * 手机竖屏上 96px 的罗盘加上天候徽章会吃掉左上角一大块地图视野，
   * 而且徽章必须排在罗盘正下方，缩小罗盘才能让两者不互相遮挡。
   */
  size?: string
}

export default function Compass({ windBearing = null, size = 'w-24 h-24' }: CompassProps) {
  const fleet = useGameStore(s => s.fleet)
  const currentRoute = useGameStore(s => s.currentRoute)
  const waypoint = useGameStore(s => s.waypoint)

  const angleRef = useRef(0)
  const velocityRef = useRef(0)
  const targetRef = useRef(0)
  const isSailingRef = useRef(false)
  const bearingRef = useRef<number | null>(null)
  const rafRef = useRef<number>(0)
  const divRef = useRef<SVGGElement>(null)
  const [roseFailed, setRoseFailed] = useState(false)

  const bearing = useMemo(() => {
    if (!fleet.isSailing || !currentRoute) return null

    const fromPort = ports.find(p => p.id === currentRoute.fromPortId)
    if (!fromPort) return null

    let toLat: number, toLng: number
    if (currentRoute.toPortId > 0) {
      const toPort = ports.find(p => p.id === currentRoute.toPortId)
      if (!toPort) return null
      toLat = toPort.latitude
      toLng = toPort.longitude
    } else if (waypoint) {
      toLat = waypoint.latitude
      toLng = waypoint.longitude
    } else return null

    return calculateBearing(fromPort.latitude, fromPort.longitude, toLat, toLng)
  }, [fleet.isSailing, currentRoute, waypoint])

  useEffect(() => {
    isSailingRef.current = fleet.isSailing
  }, [fleet.isSailing])

  useEffect(() => {
    bearingRef.current = bearing
    if (bearing !== null) {
      targetRef.current = bearing
    }
  }, [bearing])

  useEffect(() => {
    const animate = () => {
      let current = angleRef.current
      const target = targetRef.current
      const isSailing = isSailingRef.current
      const activeBearing = bearingRef.current

      if (isSailing && activeBearing !== null) {
        let diff = target - current
        if (diff > 180) diff -= 360
        if (diff < -180) diff += 360

        const spring = diff * 0.06
        const damping = 0.82
        velocityRef.current = velocityRef.current * damping + spring
        current += velocityRef.current
      } else {
        const time = Date.now() / 1000
        const wobble = Math.sin(time * 0.4) * 18
          + Math.sin(time * 1.1) * 10
          + Math.sin(time * 2.3) * 4
          + Math.sin(time * 3.7) * 2
        const drift = (wobble - (current - target)) * 0.03
        velocityRef.current = velocityRef.current * 0.95 + drift
        current += velocityRef.current
      }

      current = ((current % 360) + 360) % 360
      angleRef.current = current

      if (divRef.current) {
        divRef.current.style.transform = `rotate(${current}deg)`
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  return (
    <div data-testid="compass" className={`relative ${size} pointer-events-none select-none`}>
      {/* 真罗盘玫瑰（F3）作表盘：自带星芒与鸢尾花北向标；加载失败则由 SVG 深盘兜底 */}
      {!roseFailed && (
        <img
          src={UI_ASSETS.compassRose}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-contain drop-shadow-xl"
          onError={() => setRoseFailed(true)}
        />
      )}
      <svg viewBox="0 0 200 200" className="relative w-full h-full drop-shadow-xl">
        <defs>
          <radialGradient id="compassBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(25,40,55,0.95)" />
            <stop offset="80%" stopColor="rgba(15,25,38,0.98)" />
            <stop offset="100%" stopColor="rgba(10,18,25,1)" />
          </radialGradient>
          <filter id="needleGlow">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        {/* 外圈金属框 */}
        <circle cx="100" cy="100" r="95" fill="none" stroke="#6b4e1e" strokeWidth="3" />
        {/* 表盘底：有真玫瑰时只留一层淡釉（玻璃感）；无图时退回不透明深盘 */}
        <circle cx="100" cy="100" r="88" fill="url(#compassBg)" opacity={roseFailed ? 0.98 : 0.32} />
        <circle cx="100" cy="100" r="90" fill="none" stroke="#c9a96e" strokeWidth="1" opacity="0.5" />

        {/* 真玫瑰无 NSEW 字母，字母由 SVG 叠在表盘外圈上 */}
        <text x="100" y="24" textAnchor="middle" fill="#d4a838" fontSize="16" fontFamily="'Pirata One', cursive" fontWeight="bold">N</text>
        <text x="100" y="186" textAnchor="middle" fill="#8a6c2a" fontSize="13" fontFamily="'Crimson Text', serif">S</text>
        <text x="16" y="105" textAnchor="middle" fill="#8a6c2a" fontSize="13" fontFamily="'Crimson Text', serif">W</text>
        <text x="184" y="105" textAnchor="middle" fill="#8a6c2a" fontSize="13" fontFamily="'Crimson Text', serif">E</text>

        <g ref={divRef} style={{ transformOrigin: '100px 100px' }}>
          <polygon points="100,28 93,90 107,90" fill="#d4a838" opacity="0.95" filter="url(#needleGlow)" />
          <polygon points="100,28 95,85 105,85" fill="#e8c050" opacity="0.7" />
          <polygon points="100,172 93,110 107,110" fill="#4d3518" opacity="0.8" />
          <polygon points="100,172 95,115 105,115" fill="#3a2510" opacity="0.6" />

          <polygon points="100,50 108,100 100,95 92,100" fill="#c9a96e" opacity="0.3" />
          <polygon points="100,150 108,100 100,105 92,100" fill="#8a6c2a" opacity="0.2" />
        </g>

        <circle cx="100" cy="100" r="8" fill="#d4a838" stroke="#8a6c2a" strokeWidth="1" />
        <circle cx="100" cy="100" r="4" fill="#0a1219" stroke="#6b4e1e" strokeWidth="0.5" />
        <circle cx="100" cy="100" r="2" fill="#c9a96e" opacity="0.5" />

        <circle cx="100" cy="96" r="1.5" fill="#d4a838" opacity="0.6" />
      </svg>

      {/* 风向标：罗盘角上的小徽标，箭头指向风吹去的方位 */}
      {windBearing != null && Number.isFinite(windBearing) && (
        <div
          className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-ocean-900/85 border border-gold-700/30 flex items-center justify-center shadow-lg"
          title={`风向 ${Math.round(windBearing)}°`}
          aria-label={`风向 ${Math.round(windBearing)} 度`}
        >
          <svg viewBox="0 0 40 40" className="w-7 h-7">
            <g style={{ transform: `rotate(${windBearing}deg)`, transformOrigin: '20px 20px' }}>
              <polygon points="20,5 25,26 20,22 15,26" fill="#9fc5e8" opacity="0.95" />
              <line x1="20" y1="22" x2="20" y2="33" stroke="#9fc5e8" strokeWidth="1.4" opacity="0.6" />
            </g>
            <circle cx="20" cy="20" r="2" fill="#c9a96e" opacity="0.7" />
          </svg>
        </div>
      )}
    </div>
  )
}
