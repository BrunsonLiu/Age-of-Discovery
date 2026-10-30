import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports } from '@/data/ports'

function createPortIcon(isCurrent: boolean) {
  const size = isCurrent ? 34 : 28
  // 锚改用金色：徽章是深底，原来那个深褐锚在深底上等于没有。
  const color = isCurrent ? '#f0d88a' : '#d4b884'
  const glow = isCurrent
    ? 'box-shadow: 0 0 10px rgba(212,168,56,0.6), 0 2px 6px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,240,200,0.22);'
    : 'box-shadow: 0 1px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,240,200,0.16);'
  const pulse = isCurrent
    ? 'animation: portPulse 2.5s ease-in-out infinite;'
    : ''

  const anchorSvg = `
    <svg width="${size * 0.5}" height="${size * 0.5}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="5" r="3"/>
      <line x1="12" y1="8" x2="12" y2="21"/>
      <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
    </svg>
  `

  const html = `
    <div style="
      width:${size}px;height:${size}px;
      background:linear-gradient(180deg, #3a2a18 0%, #1c130a 100%);
      border:1.5px solid #c9a96e;border-radius:50%;
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
        const showDiscoveredMarker = isCurrent || isDiscovered

        // 未发现的港口不渲染任何标记——"未知海域"的位置应当保密，
        // 直到船的瞭望范围（SailingController 的 SIGHT_RANGE）真正看到它
        if (!showDiscoveredMarker) {
          return null
        }

        return (
          <Marker
            key={port.id}
            position={[port.latitude, port.longitude]}
            icon={createPortIcon(isCurrent)}
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
                color: isCurrent ? '#f5e2a8' : '#dcbe7c',
                fontWeight: isCurrent ? 'bold' : 'normal',
                letterSpacing: '0.02em',
              }}>
                {port.nameCn}
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
          background: linear-gradient(180deg, rgba(48, 36, 20, 0.96) 0%, rgba(22, 16, 8, 0.96) 100%) !important;
          border: 1px solid rgba(201, 169, 110, 0.5) !important;
          border-radius: 2px !important;
          color: #dcbe7c !important;
          padding: 1px 6px !important;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 238, 186, 0.16) !important;
          font-size: 11px !important;
          white-space: nowrap !important;
        }
        .port-tooltip::before {
          border-top-color: rgba(201, 169, 110, 0.5) !important;
        }
        @keyframes portPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 10px rgba(212,168,56,0.7), 0 0 20px rgba(212,168,56,0.3); }
          50% { transform: scale(1.1); box-shadow: 0 0 15px rgba(212,168,56,0.9), 0 0 30px rgba(212,168,56,0.4); }
        }
      `}</style>
    </>
  )
}
