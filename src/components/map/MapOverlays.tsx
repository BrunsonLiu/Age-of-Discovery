import { useMemo } from 'react'
import { Polyline, Marker } from 'react-leaflet'
import L from 'leaflet'
import { useMapStore } from '@/store/useMapStore'
import { prevailingWindBearing } from '@/utils/navigation'

/**
 * 地图图层组：风向 / 洋流 / 海盗区域。
 * 风向使用真实风带模型（低纬信风向东、中纬西风带向西），
 * 与航行速度计算同源——玩家看到的箭头方向就是顺风方向。
 */

const WIND_GRID_STEP = 15

function createWindArrowIcon(angleDeg: number) {
  // SVG 箭头默认朝上（北 = 0° 罗盘方位），rotate(bearing) 即指向该方位
  const html = `<div style="
    width:22px;height:22px;
    transform:rotate(${angleDeg}deg);
    opacity:0.7;
    filter:drop-shadow(0 0 3px rgba(74,122,140,0.5));
  "><svg viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
    <line x1="11" y1="18" x2="11" y2="7" stroke="#3a6b7c" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M11 3 L15.5 9.5 L11 7.6 L6.5 9.5 Z" fill="#3a6b7c"/>
  </svg></div>`
  return L.divIcon({ html, className: 'wind-arrow-icon', iconSize: [22, 22], iconAnchor: [11, 11] })
}

/** 主要洋流（史实简化）：暖流红色、寒流蓝色 */
const OCEAN_CURRENTS: { name: string; points: [number, number][]; warm: boolean }[] = [
  { name: '湾流', warm: true, points: [[24, -80], [30, -75], [37, -65], [43, -50], [48, -35]] },
  { name: '北赤道流', warm: true, points: [[12, -60], [15, -45], [18, -30], [20, -18]] },
  { name: '加那利寒流', warm: false, points: [[45, -20], [35, -14], [25, -12], [14, -16]] },
  { name: '本格拉寒流', warm: false, points: [[-30, 12], [-22, 10], [-12, 8], [-2, 6]] },
  { name: '阿古拉斯暖流', warm: true, points: [[-36, 20], [-28, 26], [-20, 32], [-12, 40]] },
  { name: '南赤道流', warm: true, points: [[-8, 30], [-10, 55], [-12, 75], [-14, 90]] },
  { name: '季风漂流', warm: true, points: [[8, 60], [10, 72], [13, 82], [15, 92]] },
]

/** 海盗威胁区域（史实据点周边海域） */
const PIRATE_ZONES: { name: string; center: [number, number]; radiusDeg: number }[] = [
  { name: '加勒比海盗水域', center: [18, -74], radiusDeg: 7 },
  { name: '马六甲海峡', center: [3, 101], radiusDeg: 5 },
  { name: '几内亚湾', center: [2, 4], radiusDeg: 5 },
]

function WindLayer() {
  const arrows = useMemo(() => {
    const list: { lat: number; lng: number; bearing: number }[] = []
    for (let lat = -60; lat <= 60; lat += WIND_GRID_STEP) {
      for (let lng = -100; lng <= 120; lng += WIND_GRID_STEP) {
        list.push({ lat, lng, bearing: prevailingWindBearing(lat) })
      }
    }
    return list
  }, [])

  return (
    <>
      {arrows.map(({ lat, lng, bearing }, i) => (
        <Marker
          key={`wind-${i}`}
          position={[lat, lng]}
          icon={createWindArrowIcon(bearing)}
          interactive={false}
          zIndexOffset={-50}
        />
      ))}
      <WindBands />
      <style>{`
        .wind-arrow-icon { background: none !important; border: none !important; }
      `}</style>
    </>
  )
}

/** 风带分界虚线（30° 纬线） */
function WindBands() {
  return (
    <>
      {[30, -30].map(lat => (
        <Polyline
          key={`band-${lat}`}
          positions={[[lat, -120], [lat, -60], [lat, 0], [lat, 60], [lat, 120]]}
          pathOptions={{ color: '#3a6b7c', weight: 1, opacity: 0.45, dashArray: '2 8' }}
          interactive={false}
        />
      ))}
    </>
  )
}

function CurrentLayer() {
  return (
    <>
      {OCEAN_CURRENTS.map((current, i) => (
        <Polyline
          key={`current-${i}`}
          positions={current.points}
          pathOptions={{
            color: current.warm ? '#d4784a' : '#5a8ab5',
            weight: 3,
            opacity: 0.55,
            dashArray: '1 10',
            lineCap: 'round',
          }}
          interactive={false}
        />
      ))}
    </>
  )
}

function PirateLayer() {
  return (
    <>
      {PIRATE_ZONES.map((zone, i) => {
        const points: [number, number][] = []
        for (let a = 0; a <= 360; a += 20) {
          const rad = a * Math.PI / 180
          const dLat = Math.sin(rad) * zone.radiusDeg
          const dLng = (Math.cos(rad) * zone.radiusDeg) / Math.max(0.3, Math.cos(zone.center[0] * Math.PI / 180))
          points.push([zone.center[0] + dLat, zone.center[1] + dLng])
        }
        points.push(points[0])
        return (
          <Polyline
            key={`pirate-${i}`}
            positions={points}
            pathOptions={{ color: '#a03030', weight: 2, opacity: 0.6, dashArray: '8 6', fill: true, fillColor: '#a03030', fillOpacity: 0.08 }}
            interactive={false}
          />
        )
      })}
    </>
  )
}

export function MapOverlays() {
  const showWindOverlay = useMapStore(s => s.showWindOverlay)
  const showCurrentOverlay = useMapStore(s => s.showCurrentOverlay)
  const showPirateZones = useMapStore(s => s.showPirateZones)

  return (
    <>
      {showPirateZones && <PirateLayer />}
      {showCurrentOverlay && <CurrentLayer />}
      {showWindOverlay && <WindLayer />}
    </>
  )
}
