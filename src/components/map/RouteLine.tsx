import { Fragment, useMemo } from 'react'
import { Polyline, Marker } from 'react-leaflet'
import L from 'leaflet'
import { useGameStore } from '@/store/useGameStore'
import { ports } from '@/data/ports'
import { routes } from '@/data/routes'
import { calculateBearing } from '@/utils/navigation'
import { getRouteGeometry, toLatLngList } from '@/utils/routePath'

function getDangerColor(level: number): string {
  if (level <= 2) return '#6b4a2a'
  if (level === 3) return '#8b5a2a'
  return '#7a2810'
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
  const routeOrigin = useGameStore((s) => s.routeOrigin)

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

  /**
   * 港口间的候选航线几何。
   *
   * 与船实际行走用的是**同一个** buildRouteGeometry，
   * 所以玩家在图上看到的虚线，就是船要走的那条路。
   */
  const routeGeometries = useMemo(() => {
    const map = new Map<number, [number, number][]>()
    for (const route of availableRoutes) {
      const fromPort = portMap.get(route.fromPortId)
      const toPort = portMap.get(route.toPortId)
      if (!fromPort || !toPort) continue
      const geom = getRouteGeometry(
        [fromPort.latitude, fromPort.longitude],
        [toPort.latitude, toPort.longitude],
      )
      map.set(route.id, toLatLngList(geom))
    }
    return map
  }, [availableRoutes, portMap])

  return (
    <>
      {availableRoutes.map((route) => {
        const fromPort = portMap.get(route.fromPortId)
        const toPort = portMap.get(route.toPortId)
        if (!fromPort || !toPort) return null

        const isSelected = currentRoute?.id === route.id
        const color = getDangerColor(route.dangerLevel)
        const points = routeGeometries.get(route.id) ?? []

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
                  color: '#3d2810',
                  weight: 9,
                  opacity: 0.18,
                  lineCap: 'round',
                  lineJoin: 'round',
                }}
              />
            )}
            <Polyline
              positions={points}
              pathOptions={{
                color: isSelected ? '#3d2810' : color,
                weight: isSelected ? 3.5 : 2.5,
                opacity: isSelected ? 0.95 : 0.7,
                dashArray: isSelected ? '10 6' : '6 5',
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

        // 航线起点 = 出航时的位置（不是当前船位）。
        // 用当前船位画线的话，线每帧都在变，玩家看到的不是船真正在走的那条路——
        // 这就是「船和路线没对齐」的根源。
        const startPos: [number, number] | null =
          routeOrigin && isFinite(routeOrigin[0]) && isFinite(routeOrigin[1])
            ? routeOrigin
            : shipPosition && isFinite(shipPosition[0]) && isFinite(shipPosition[1])
              ? shipPosition
              : currentPortId
                ? (() => {
                    const p = portMap.get(currentPortId)
                    return p ? [p.latitude, p.longitude] as [number, number] : null
                  })()
                : null

        if (!startPos) return null

        // 与 SailingController 用**同一个**记忆化几何对象——
        // 图上画的线就是船走的线，一模一样。
        const geom = getRouteGeometry(startPos, [waypoint.latitude, waypoint.longitude])
        const points = toLatLngList(geom)

        if (points.length === 0) return null

        const destIcon = L.divIcon({
          html: `<div style="
            width:20px;height:20px;
            display:flex;align-items:center;justify-content:center;
            color:#3d2810;font-size:18px;font-weight:bold;
            text-shadow:0 0 4px rgba(244,228,193,0.6);
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
                color: '#3d2810',
                weight: 3.5,
                opacity: 0.85,
                dashArray: '12 8',
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
