import { Fragment, useMemo } from 'react'
import { Polyline, Marker } from 'react-leaflet'
import L from 'leaflet'
import { useGameStore } from '@/store/useGameStore'
import { ports } from '@/data/ports'
import { routes } from '@/data/routes'
import { calculateBearing } from '@/utils/navigation'

function getDangerColor(level: number): string {
  if (level <= 2) return '#2d8a27'
  if (level === 3) return '#c9a96e'
  return '#c44020'
}

function createArcPoints(
  from: [number, number],
  to: [number, number],
  segments: number = 20,
): [number, number][] {
  if (!isFinite(from[0]) || !isFinite(from[1]) || !isFinite(to[0]) || !isFinite(to[1])) {
    return []
  }
  const points: [number, number][] = []
  const midLat = (from[0] + to[0]) / 2
  const midLng = (from[1] + to[1]) / 2
  const dx = to[1] - from[1]
  const dy = to[0] - from[0]
  const dist = Math.sqrt(dx * dx + dy * dy)
  const offset = dist * 0.15
  const ctrlLat = midLat + (dx / dist) * offset
  const ctrlLng = midLng - (dy / dist) * offset

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const lat =
      (1 - t) * (1 - t) * from[0] + 2 * (1 - t) * t * ctrlLat + t * t * to[0]
    const lng =
      (1 - t) * (1 - t) * from[1] + 2 * (1 - t) * t * ctrlLng + t * t * to[1]
    points.push([lat, lng])
  }
  return points
}

function createArrowIcon(angle: number, color: string) {
  const html = `<div style="
    width:10px;height:10px;
    transform:rotate(${angle}deg);
    opacity:0.7;
  "><svg viewBox="0 0 10 10" fill="${color}" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 0 L10 8 L5 6 L0 8 Z"/>
  </svg></div>`
  return L.divIcon({
    html,
    className: 'route-arrow-icon',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  })
}

export function RouteLine() {
  const currentPortId = useGameStore((s) => s.fleet.currentPortId)
  const currentRoute = useGameStore((s) => s.currentRoute)
  const selectRoute = useGameStore((s) => s.selectRoute)
  const waypoint = useGameStore((s) => s.waypoint)
  const isSailing = useGameStore((s) => s.fleet.isSailing)
  const shipPosition = useGameStore((s) => s.shipPosition)

  const availableRoutes = useMemo(() => {
    if (!currentPortId) return []
    return routes.filter(
      (r) => r.fromPortId === currentPortId || r.toPortId === currentPortId,
    )
  }, [currentPortId])

  const portMap = useMemo(() => {
    const map = new Map(ports.map((p) => [p.id, p]))
    return map
  }, [])

  return (
    <>
      {availableRoutes.map((route) => {
        const fromPort = portMap.get(route.fromPortId)
        const toPort = portMap.get(route.toPortId)
        if (!fromPort || !toPort) return null

        const isSelected = currentRoute?.id === route.id
        const color = getDangerColor(route.dangerLevel)
        const points = createArcPoints(
          [fromPort.latitude, fromPort.longitude],
          [toPort.latitude, toPort.longitude],
        )

        if (points.length === 0) return null

        const arrowPositions = [0.25, 0.5, 0.75].map((frac) => {
          const idx = Math.round(frac * (points.length - 1))
          return { pos: points[idx], idx }
        })

        return (
          <Fragment key={route.id}>
            {isSelected && (
              <Polyline
                positions={points}
                pathOptions={{
                  color: '#f0d88a',
                  weight: 8,
                  opacity: 0.3,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            )}
            <Polyline
              positions={points}
              pathOptions={{
                color: isSelected ? '#f0d88a' : color,
                weight: isSelected ? 4 : 3,
                opacity: isSelected ? 0.9 : 0.6,
                dashArray: isSelected ? '12 8' : '8 6',
                lineCap: 'round',
                lineJoin: 'round',
                className: isSelected ? 'route-selected-animated' : '',
              }}
              eventHandlers={{
                click: () => selectRoute(route),
              }}
            />
            {arrowPositions.map(({ pos, idx }, ai) => {
              const nextIdx = Math.min(idx + 1, points.length - 1)
              const angle = calculateBearing(points[idx][0], points[idx][1], points[nextIdx][0], points[nextIdx][1])
              return (
                <Marker
                  key={`${route.id}-arrow-${ai}`}
                  position={pos}
                  icon={createArrowIcon(angle - 90, isSelected ? '#f0d88a' : color)}
                  interactive={false}
                />
              )
            })}
          </Fragment>
        )
      })}
      {waypoint && isSailing && (() => {
        if (!isFinite(waypoint.latitude) || !isFinite(waypoint.longitude)) return null

        const startPos: [number, number] | null =
          shipPosition && isFinite(shipPosition[0]) && isFinite(shipPosition[1])
            ? shipPosition
            : currentPortId
              ? (() => {
                  const p = portMap.get(currentPortId)
                  return p ? [p.latitude, p.longitude] as [number, number] : null
                })()
              : null

        if (!startPos) return null

        const points = createArcPoints(startPos, [waypoint.latitude, waypoint.longitude])

        if (points.length === 0) return null

        const destIcon = L.divIcon({
          html: `<div style="
            width:20px;height:20px;
            display:flex;align-items:center;justify-content:center;
            color:#d4a838;font-size:16px;font-weight:bold;
            text-shadow:0 0 6px rgba(212,168,56,0.8);
          ">✦</div>`,
          className: 'waypoint-dest-icon',
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        })

        return (
          <Fragment key="waypoint-route">
            <Polyline
              positions={points}
              pathOptions={{
                color: '#d4a838',
                weight: 4,
                opacity: 0.8,
                dashArray: '16 10',
                lineCap: 'round',
                lineJoin: 'round',
                className: 'waypoint-route-animated',
              }}
            />
            <Marker
              position={[waypoint.latitude, waypoint.longitude]}
              icon={destIcon}
              interactive={false}
            />
          </Fragment>
        )
      })()}
      <style>{`
        .route-arrow-icon {
          background: none !important;
          border: none !important;
        }
        .waypoint-dest-icon {
          background: none !important;
          border: none !important;
        }
        .route-selected-animated {
          animation: routeDash 1.5s linear infinite;
        }
        .waypoint-route-animated {
          animation: waypointDash 1.2s linear infinite;
        }
        @keyframes routeDash {
          to { stroke-dashoffset: -40; }
        }
        @keyframes waypointDash {
          to { stroke-dashoffset: -52; }
        }
      `}</style>
    </>
  )
}
