import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports } from '@/data/ports'

function createPortIcon(isCurrent: boolean, isDiscovered: boolean) {
  const size = isCurrent ? 32 : isDiscovered ? 26 : 18
  const color = isCurrent ? '#d4a838' : isDiscovered ? '#c9a96e' : '#555'
  const glow = isCurrent
    ? 'box-shadow: 0 0 10px rgba(212,168,56,0.7), 0 0 20px rgba(212,168,56,0.3);'
    : isDiscovered
      ? 'box-shadow: 0 0 5px rgba(201,169,110,0.3);'
      : ''
  const pulse = isCurrent
    ? 'animation: portPulse 2.5s ease-in-out infinite;'
    : ''

  const anchorSvg = isDiscovered ? `
    <svg width="${size * 0.5}" height="${size * 0.5}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="5" r="3"/>
      <line x1="12" y1="8" x2="12" y2="21"/>
      <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
    </svg>
  ` : `
    <svg width="${size * 0.4}" height="${size * 0.4}" viewBox="0 0 24 24" fill="${color}" stroke="none" opacity="0.5">
      <circle cx="12" cy="12" r="4"/>
    </svg>
  `

  const html = `
    <div style="
      width:${size}px;height:${size}px;
      background:radial-gradient(circle, ${isCurrent ? 'rgba(212,168,56,0.3)' : isDiscovered ? 'rgba(201,169,110,0.15)' : 'rgba(85,85,85,0.1)'} 30%, transparent 70%);
      border:2px solid ${color};border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      ${glow}${pulse}
      transition: all 0.3s ease;
    ">
      ${anchorSvg}
    </div>
  `
  return L.divIcon({
    html,
    className: 'port-marker-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

export function PortMarker() {
  const discoveredPorts = useGameStore((s) => s.discoveredPorts)
  const currentPortId = useGameStore((s) => s.fleet.currentPortId)
  const setSelectedPortId = useMapStore((s) => s.setSelectedPortId)
  const setActivePanel = useGameStore((s) => s.setActivePanel)
  const discoverPort = useGameStore((s) => s.discoverPort)

  return (
    <>
      {ports.map((port) => {
        const isCurrent = port.id === currentPortId
        const isDiscovered = discoveredPorts.includes(port.id)
        const icon = createPortIcon(isCurrent, isDiscovered)

        return (
          <Marker
            key={port.id}
            position={[port.latitude, port.longitude]}
            icon={icon}
            eventHandlers={{
              click: () => {
                setSelectedPortId(port.id)
                setActivePanel('port')
                discoverPort(port.id)
              },
            }}
          >
            <Tooltip
              direction="top"
              offset={[0, -16]}
              className="port-tooltip"
              permanent={true}
            >
              <span className="font-serif text-xs" style={{
                color: isCurrent ? '#d4a838' : isDiscovered ? '#c9a96e' : '#666',
                fontWeight: isCurrent ? 'bold' : 'normal',
                textShadow: isCurrent ? '0 0 6px rgba(212,168,56,0.5)' : 'none',
              }}>
                {isDiscovered ? port.nameCn : <span className="opacity-25">{port.nameCn}</span>}
              </span>
            </Tooltip>
          </Marker>
        )
      })}
      <style>{`
        .port-marker-icon {
          background: none !important;
          border: none !important;
        }
        .port-tooltip {
          background: rgba(10,18,25,0.85) !important;
          border: 1px solid rgba(201,169,110,0.3) !important;
          border-radius: 3px !important;
          color: #c9a96e !important;
          padding: 1px 6px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5) !important;
          font-size: 11px !important;
          white-space: nowrap !important;
        }
        .port-tooltip::before {
          border-top-color: rgba(201,169,110,0.3) !important;
        }
        @keyframes portPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 10px rgba(212,168,56,0.7), 0 0 20px rgba(212,168,56,0.3); }
          50% { transform: scale(1.1); box-shadow: 0 0 15px rgba(212,168,56,0.9), 0 0 30px rgba(212,168,56,0.4); }
        }
      `}</style>
    </>
  )
}
