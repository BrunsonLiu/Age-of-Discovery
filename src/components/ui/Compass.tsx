import { useMemo, useEffect, useRef } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { ports } from '@/data/ports'

export default function Compass() {
  const fleet = useGameStore(s => s.fleet)
  const currentRoute = useGameStore(s => s.currentRoute)
  const waypoint = useGameStore(s => s.waypoint)

  const angleRef = useRef(0)
  const velocityRef = useRef(0)
  const targetRef = useRef(0)
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

    const dLng = (toLng - fromPort.longitude) * Math.PI / 180
    const lat1 = fromPort.latitude * Math.PI / 180
    const lat2 = toLat * Math.PI / 180
    const y = Math.sin(dLng) * Math.cos(lat2)
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
  }, [fleet.isSailing, currentRoute, waypoint])

  useEffect(() => {
    if (bearing !== null) {
      targetRef.current = bearing
    }
  }, [bearing])

  useEffect(() => {
    const animate = () => {
      let current = angleRef.current
      const target = targetRef.current

      if (fleet.isSailing && bearing !== null) {
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
  }, [fleet.isSailing, bearing])

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

        {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150, 155, 160, 165, 170, 175, 180, 185, 190, 195, 200, 205, 210, 215, 220, 225, 230, 235, 240, 245, 250, 255, 260, 265, 270, 275, 280, 285, 290, 295, 300, 305, 310, 315, 320, 325, 330, 335, 340, 345, 350, 355].map(deg => {
          const rad = deg * Math.PI / 180
          let inner: number, sw: number, op: number
          if (deg % 90 === 0) { inner = 60; sw = 1.5; op = 0.8 }
          else if (deg % 30 === 0) { inner = 68; sw = 1; op = 0.5 }
          else if (deg % 10 === 0) { inner = 74; sw = 0.7; op = 0.35 }
          else { inner = 78; sw = 0.4; op = 0.2 }
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
