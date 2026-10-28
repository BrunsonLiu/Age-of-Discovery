import { useMemo } from 'react'
import { Polyline, Marker } from 'react-leaflet'
import L from 'leaflet'
import { useMapStore } from '@/store/useMapStore'
import {
  OCEAN_CURRENTS, PIRATE_ZONES, WIND_BAND_LATS,
  pirateZonePolygon, windArrowSites,
} from '@/data/mapLayers'

/**
 * 地图图层组：风向 / 洋流 / 海盗区域。
 * 风向使用真实风带模型（低纬信风向东、中纬西风带向西），
 * 与航行速度计算同源——玩家看到的箭头方向就是顺风方向。
 *
 * 【数据来源】
 * 洋流 / 海盗区 / 风带网格的定义在 `@/data/mapLayers`，
 * 因为 2.5D 立体海图要显示**同样**的这三个图层——
 * 底栏的图层开关在 3D 模式下照样可见可点，
 * 数据各写一份就会变成"按了没反应"。
 */


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

function WindLayer() {
  const arrows = useMemo(() => windArrowSites(), [])

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
      {WIND_BAND_LATS.map(lat => (
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
      {PIRATE_ZONES.map((zone, i) => (
        <Polyline
          key={`pirate-${i}`}
          positions={pirateZonePolygon(zone)}
          pathOptions={{ color: '#a03030', weight: 2, opacity: 0.6, dashArray: '8 6', fill: true, fillColor: '#a03030', fillOpacity: 0.08 }}
          interactive={false}
        />
      ))}
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
