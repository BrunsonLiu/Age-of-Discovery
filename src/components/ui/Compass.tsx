import { useMemo, useEffect, useRef } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { ports } from '@/data/ports'
import { calculateBearing } from '@/utils/navigation'

const TICK_DEGREES = Array.from({ length: 72 }, (_, i) => i * 5)

interface TickStyle {
  inner: number
  sw: number
  op: number
}

const TICK_STYLES: TickStyle[] = TICK_DEGREES.map((deg) => {
  if (deg % 90 === 0) return { inner: 60, sw: 1.5, op: 0.8 }
  if (deg % 30 === 0) return { inner: 68, sw: 1, op: 0.5 }
  if (deg % 10 === 0) return { inner: 74, sw: 0.7, op: 0.35 }
  return { inner: 78, sw: 0.4, op: 0.2 }
})

export default function Compass() {
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
    <div className="w-24 h-24 pointer-events-none select-none">
      <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-xl">
        <defs>
          <radialGradient id="compassBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(25,40,55,0.95)" />
            <stop offset="80%" stopColor="rgba(15,25,38,0.98)" />
            <stop offset="100%" stopColor="rgba(10,18,25,1)" />
          </radialGradient>
          <radialGradient id="compassInner" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(201,169,110,0.08)" />
            <stop offset="100%" stopColor="rgba(201,169,110,0)" />
          </radialGradient>
          <filter id="needleGlow">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>

        <circle cx="100" cy="100" r="96" fill="url(#compassBg)" stroke="#6b4e1e" strokeWidth="3" />
        <circle cx="100" cy="100" r="92" fill="none" stroke="#c9a96e" strokeWidth="1" opacity="0.5" />
        <circle cx="100" cy="100" r="88" fill="url(#compassInner)" stroke="#c9a96e" strokeWidth="0.5" opacity="0.3" />

        <circle cx="100" cy="100" r="78" fill="none" stroke="#c9a96e" strokeWidth="0.3" opacity="0.2" />
        <circle cx="100" cy="100" r="68" fill="none" stroke="#c9a96e" strokeWidth="0.3" opacity="0.15" />

        {TICK_DEGREES.map((deg, i) => {
          const rad = deg * Math.PI / 180
          const { inner, sw, op } = TICK_STYLES[i]
          const x1 = 100 + Math.sin(rad) * inner
          const y1 = 100 - Math.cos(rad) * inner
          const x2 = 100 + Math.sin(rad) * 86
          const y2 = 100 - Math.cos(rad) * 86
          return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c9a96e" strokeWidth={sw} opacity={op} />
        })}

        <text x="100" y="24" textAnchor="middle" fill="#d4a838" fontSize="16" fontFamily="'Pirata One', cursive" fontWeight="bold">N</text>
        <text x="100" y="186" textAnchor="middle" fill="#8a6c2a" fontSize="13" fontFamily="'Crimson Text', serif">S</text>
        <text x="16" y="105" textAnchor="middle" fill="#8a6c2a" fontSize="13" fontFamily="'Crimson Text', serif">W</text>
        <text x="184" y="105" textAnchor="middle" fill="#8a6c2a" fontSize="13" fontFamily="'Crimson Text', serif">E</text>

        <text x="100" y="48" textAnchor="middle" fill="#6b4e1e" fontSize="8" fontFamily="'Crimson Text', serif" opacity="0.5">NE</text>
        <text x="152" y="105" textAnchor="middle" fill="#6b4e1e" fontSize="8" fontFamily="'Crimson Text', serif" opacity="0.5">SE</text>
        <text x="100" y="162" textAnchor="middle" fill="#6b4e1e" fontSize="8" fontFamily="'Crimson Text', serif" opacity="0.5">SW</text>
        <text x="48" y="105" textAnchor="middle" fill="#6b4e1e" fontSize="8" fontFamily="'Crimson Text', serif" opacity="0.5">NW</text>

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
    </div>
  )
}
