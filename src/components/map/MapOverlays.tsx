import { useMemo } from 'react'
import { useMap } from 'react-leaflet'
import { Polyline, Marker } from 'react-leaflet'
import L from 'leaflet'
import { useMapStore } from '@/store/useMapStore'
import { useGameStore } from '@/store/useGameStore'
import {
  OCEAN_CURRENTS, currentFlowPoints, PIRATE_ZONES, WIND_BAND_LATS,
  pirateZonePolygon, windArrowSites,
} from '@/data/mapLayers'
import { isOnLand } from '@/utils/landCheck'
import { filterSeaPoints, splitAtLand } from '@/utils/seaClip'

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
  // 风向随航季变（印度洋半年掉头）：day 变了箭头必须重算
  const day = useGameStore(s => s.fleet.day)
  /*
   * 【为什么要按陆地过滤】`windArrowSites` 是按 15° 网格撒点的（lat -60..60 ×
   * lng -100..120），它不知道陆地长什么样 —— 实测 135 个落点里有 **48 个在陆地
   * 上**（撒哈拉、巴西高原、南非内陆、西伯利亚），于是"沙漠里刮着信风"。
   * 过滤后网格会出现空洞，那正是**正确**的空洞：陆地上本来不该有风箭头。
   */
  const arrows = useMemo(() => filterSeaPoints(windArrowSites(day), isOnLand), [day])

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

/**
 * 风带分界虚线（±30° 纬线）。
 *
 * 【为什么要挂在陆地之下】它原来和箭头一样挂在 overlayPane（陆地填充也在这一层，
 * 且更早渲染），于是一条青色虚线**横穿撒哈拉**、压在山符号上面 —— 截图里看着
 * 像一道划痕。经纬网已经按"压在陆地之下、只留海面部分"处理，这里口径一致：
 * 自建 `windband` pane（z=330），落进陆地的半截被陆地填色盖住。
 */
const BAND_PANE = 'windband'

function WindBands() {
  const map = useMap()
  // pane 必须在渲染期建（放进 effect 会重演等角线网那次 _removePath 崩溃）
  useMemo(() => {
    if (!map.getPane(BAND_PANE)) {
      const pane = map.createPane(BAND_PANE)
      pane.style.zIndex = '330'
      pane.style.pointerEvents = 'none'
    }
    return true
  }, [map])
  return (
    <>
      {WIND_BAND_LATS.map(lat => (
        <Polyline
          key={`band-${lat}`}
          positions={[[lat, -120], [lat, -60], [lat, 0], [lat, 60], [lat, 120]]}
          pane={BAND_PANE}
          pathOptions={{ color: '#3a6b7c', weight: 1, opacity: 0.45, dashArray: '2 8' }}
          interactive={false}
        />
      ))}
    </>
  )
}

function CurrentLayer() {
  /*
   * 季风漂流半年掉头：2D 画的是折线，点序不显示方向，
   * 但**换个说法**——这条线在东北季风期是往西南走的，
   * 3D 那边虚线会跟着倒流。这里保持一致的数据口径，
   * 免得两个视图对"水流向哪儿"各说一套。
   */
  const gameDay = useGameStore(s => s.fleet.day)
  /*
   * 【为什么每条洋流可能画成好几段】折线只按经纬度摆节点，一条边可能跨 25°
   * （南赤道流原来末段 (-10,55)→(-8,30) 就横穿马达加斯加与坦桑尼亚）。
   * 这里用 `splitAtLand` 按陆地掩码把折线切成"全在水里"的段 —— 数据已经修成
   * 离岸（见 `data/mapLayers` 的注释），这一层是**护栏**：以后再有人往
   * 内陆摆节点，画面最多是"这条流短了"，而不是"穿过了一个国家"。
   */
  const segments = useMemo(
    () => OCEAN_CURRENTS.flatMap((current, ci) =>
      splitAtLand(currentFlowPoints(current, gameDay), isOnLand).map((points, si) => ({
        key: `current-${ci}-${si}`,
        points,
        color: current.warm ? '#d4784a' : '#5a8ab5',
      })),
    ),
    [gameDay],
  )
  return (
    <>
      {segments.map((seg) => (
        <Polyline
          key={seg.key}
          positions={seg.points}
          pathOptions={{
            color: seg.color,
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
