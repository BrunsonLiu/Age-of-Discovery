import { useMemo, useEffect, useRef } from 'react'
import { Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useGameStore } from '@/store/useGameStore'
import { ports } from '@/data/ports'
import { calculateBearing } from '@/utils/navigation'

function createShipIcon(sailing: boolean, bearing: number) {
  const rotation = sailing ? bearing - 90 : 0

  const shipSvg = `
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="70" height="70">
      <defs>
        <linearGradient id="hullGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#8B4513;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#5C2E0A;stop-opacity:1" />
        </linearGradient>
        <linearGradient id="sailGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#F5E6C8;stop-opacity:0.95" />
          <stop offset="100%" style="stop-color:#D4B896;stop-opacity:0.85" />
        </linearGradient>
        <linearGradient id="sailGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#E8D5B0;stop-opacity:0.9" />
          <stop offset="100%" style="stop-color:#C4A878;stop-opacity:0.8" />
        </linearGradient>
      </defs>
      <path d="M20,62 Q25,72 50,75 Q75,72 80,62 L75,58 Q50,62 25,58 Z" fill="url(#hullGrad)" stroke="#3A1A05" stroke-width="1"/>
      <path d="M25,58 Q50,62 75,58 L73,55 Q50,59 27,55 Z" fill="#6B3410"/>
      <line x1="50" y1="55" x2="50" y2="12" stroke="#5C2E0A" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="35" y1="55" x2="35" y2="25" stroke="#5C2E0A" stroke-width="2" stroke-linecap="round"/>
      <line x1="65" y1="55" x2="65" y2="28" stroke="#5C2E0A" stroke-width="2" stroke-linecap="round"/>
      <path d="M52,14 Q78,30 52,52 L50,52 L50,14 Z" fill="url(#sailGrad)" stroke="#A08050" stroke-width="0.5"/>
      <path d="M37,27 Q52,38 37,52 L35,52 L35,27 Z" fill="url(#sailGrad2)" stroke="#A08050" stroke-width="0.5"/>
      <path d="M67,30 Q78,40 67,52 L65,52 L65,30 Z" fill="url(#sailGrad2)" stroke="#A08050" stroke-width="0.5"/>
      <path d="M20,60 L48,60 L48,56 L20,56 Z" fill="#D4A838" opacity="0.6"/>
      <path d="M52,60 L80,60 L80,56 L52,56 Z" fill="#D4A838" opacity="0.6"/>
      <path d="M48,8 L50,4 L52,8 Z" fill="#D4A838" stroke="#8B6914" stroke-width="0.5"/>
      <circle cx="50" cy="3" r="1.5" fill="#D4A838"/>
      ${sailing ? `
      <path d="M30,70 Q35,78 50,80 Q65,78 70,70" fill="none" stroke="rgba(100,180,255,0.4)" stroke-width="1.5">
        <animate attributeName="d" values="M30,70 Q35,78 50,80 Q65,78 70,70;M30,72 Q35,80 50,82 Q65,80 70,72;M30,70 Q35,78 50,80 Q65,78 70,70" dur="2s" repeatCount="indefinite"/>
      </path>
      ` : `
      <g transform="translate(42, 78)">
        <circle cx="8" cy="3" r="2.5" stroke="#D4A838" stroke-width="1" fill="none"/>
        <line x1="8" y1="5.5" x2="8" y2="14" stroke="#D4A838" stroke-width="1"/>
        <path d="M4,12 Q8,16 12,12" stroke="#D4A838" stroke-width="1" fill="none"/>
      </g>
      `}
    </svg>
  `

  const pulseRings = sailing ? `
    <div style="position:absolute;width:90px;height:90px;left:-10px;top:-10px;border-radius:50%;border:2px solid rgba(212,168,56,0.4);animation:shipPulse 2.5s ease-in-out infinite;"></div>
    <div style="position:absolute;width:110px;height:110px;left:-20px;top:-20px;border-radius:50%;border:1.5px solid rgba(212,168,56,0.2);animation:shipPulse 2.5s ease-in-out infinite 0.6s;"></div>
  ` : `
    <div style="position:absolute;width:84px;height:84px;left:-7px;top:-7px;border-radius:50%;border:1.5px solid rgba(212,168,56,0.25);"></div>
  `

  const wakeHtml = sailing ? `
    <div style="position:absolute;width:80px;height:16px;left:-5px;top:55px;display:flex;align-items:center;justify-content:center;gap:5px;">
      ${[0, 1, 2, 3].map(i => `<div style="width:${7 - i}px;height:${7 - i}px;border-radius:50%;background:rgba(100,180,255,${0.5 - i * 0.12});animation:wakeFade ${0.8 + i * 0.2}s ease-out infinite;animation-delay:${i * 0.15}s;"></div>`).join('')}
    </div>
  ` : ''

  const html = `
    <div style="position:relative;width:70px;height:70px;">
      ${pulseRings}
      <div style="position:absolute;width:70px;height:70px;filter:drop-shadow(0 0 12px rgba(212,168,56,0.6));transform:rotate(${rotation}deg);transform-origin:35px 35px;${sailing ? 'animation:shipSway 3s ease-in-out infinite;' : ''}">
        ${shipSvg}
      </div>
      ${wakeHtml}
    </div>
  `

  return L.divIcon({ html, className: 'ship-marker-icon', iconSize: [70, 70], iconAnchor: [35, 35] })
}

function ShipCameraFollow({ position }: { position: [number, number] | null }) {
  const map = useMap()
  const isSailing = useGameStore(s => s.fleet.isSailing)
  const prevSailingRef = useRef(false)

  useEffect(() => {
    if (position && !prevSailingRef.current && isSailing) {
      map.flyTo(position, map.getZoom(), { duration: 1.5 })
    }
    prevSailingRef.current = isSailing
  }, [isSailing, map, position])

  return null
}

export function ShipAnimation() {
  const fleet = useGameStore(s => s.fleet)
  const shipPosition = useGameStore(s => s.shipPosition)
  const waypoint = useGameStore(s => s.waypoint)

  const portMap = useMemo(() => new Map(ports.map(p => [p.id, p])), [])

  const position = useMemo((): [number, number] | null => {
    if (shipPosition) return shipPosition
    if (fleet.currentPortId) {
      const port = portMap.get(fleet.currentPortId)
      if (port) return [port.latitude, port.longitude]
    }
    return null
  }, [shipPosition, fleet.currentPortId, portMap])

  const bearing = useMemo(() => {
    if (fleet.isSailing && position && waypoint) {
      return calculateBearing(position[0], position[1], waypoint.latitude, waypoint.longitude)
    }
    return 0
  }, [fleet.isSailing, position, waypoint])

  if (!position || !isFinite(position[0]) || !isFinite(position[1])) return null

  return (
    <>
      <ShipCameraFollow position={position} />
      <Marker position={position} icon={createShipIcon(fleet.isSailing, bearing)} zIndexOffset={1000} />
      <style>{`
        .ship-marker-icon { background: none !important; border: none !important; }
        @keyframes shipPulse { 0%, 100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.3); opacity: 0.1; } }
        @keyframes shipSway { 0%, 100% { transform: rotate(0deg) translateY(0px); } 25% { transform: rotate(0.5deg) translateY(-2px); } 75% { transform: rotate(-0.5deg) translateY(1px); } }
        @keyframes wakeFade { 0% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(0.2); } }
      `}</style>
    </>
  )
}
