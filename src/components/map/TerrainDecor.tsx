import { useEffect, useMemo, useState } from 'react'
import { Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { buildTerrainSymbols, type TerrainSymbol } from '@/utils/terrainDecor'

/**
 * 地形装饰层：把 terrainDecor 生成的山丘 / 树丛画到地图上。
 *
 * 【为什么用 divIcon 而不是 L.polygon】
 * 用地理坐标画三角形，缩到 zoom 2 会退化成一条线、放到 zoom 8 又会撑满屏幕。
 * 固定像素的符号在整条缩放范围里都稳定可读。
 *
 * 【为什么单独建一个 pane】
 * 默认 markerPane(z=600) 是港口标记住的。地形如果挤进同一层，就得靠 DOM 顺序
 * 决定谁在上面，缩放时容易翻车。自定义 terrainPane 放在 overlayPane(400) 与
 * markerPane(600) 之间：地形压着陆地、又被港口压着——正是想要的层次。
 *
 * 【为什么 interactive: false】
 * 这层是纯装饰。不关掉的话，几百个透明 marker 会接住本应落到地图上的点击，
 * 玩家点旁边的海面出航时会被挡住。
 */

const TERRAIN_PANE = 'terrainPane'

/** 山：三角形 + 右半暗面 + 雪顶，模仿古地图的笔触 */
function peakSvg() {
  return `<svg width="26" height="19" viewBox="0 0 26 19" aria-hidden="true">
    <path d="M2 18 L13 1 L24 18 Z" fill="#8a6a3e" fill-opacity="0.72"
          stroke="#3f2c14" stroke-opacity="0.75" stroke-width="1" stroke-linejoin="round"/>
    <path d="M13 1 L24 18 L15 18 Z" fill="#3f2c14" fill-opacity="0.34"/>
    <path d="M9.2 7.6 L13 1 L16.8 7.6 Z" fill="#f7f0d8" fill-opacity="0.75"/>
  </svg>`
}

/** 树：小圆锥 + 树干 */
function treeSvg() {
  return `<svg width="14" height="19" viewBox="0 0 14 19" aria-hidden="true">
    <path d="M7 1 L13 15 L1 15 Z" fill="#5b6b36" fill-opacity="0.62"
          stroke="#33401c" stroke-opacity="0.7" stroke-width="0.9" stroke-linejoin="round"/>
    <path d="M7 1 L13 15 L8.2 15 Z" fill="#33401c" fill-opacity="0.3"/>
    <rect x="5.9" y="14.4" width="2.2" height="3.4" fill="#3f2c14" fill-opacity="0.65"/>
  </svg>`
}

function iconFor(s: TerrainSymbol) {
  const w = s.kind === 'peak' ? 26 : 14
  const h = 19
  return L.divIcon({
    html: `<div style="transform:scale(${s.scale.toFixed(2)});transform-origin:center bottom">${
      s.kind === 'peak' ? peakSvg() : treeSvg()
    }</div>`,
    className: 'terrain-symbol',
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
  })
}

export default function TerrainDecor({ geojson }: { geojson: GeoJSON.GeoJsonObject }) {
  const map = useMap()
  /**
   * 【为什么必须先 ready 再渲染 Marker】
   * Marker 的 pane 是构造时写死的，Leaflet 挂载时会直接去 map._panes[pane]
   * 里 appendChild。如果 pane 还没建出来，就是
   * `Cannot read properties of undefined (reading 'appendChild')`，整张地图
   * 被 ErrorBoundary 接住变成"地图加载失败"。
   * effect 一定在首次渲染之后才跑，所以中间必须隔一个 state。
   */
  const [paneReady, setPaneReady] = useState(false)

  useEffect(() => {
    if (!map.getPane(TERRAIN_PANE)) {
      const pane = map.createPane(TERRAIN_PANE)
      pane.style.zIndex = '450'
      // 纯装饰层不接收指针事件（marker 本身的 interactive 也关了，双保险）
      pane.style.pointerEvents = 'none'
    }
    setPaneReady(true)
  }, [map])

  const symbols = useMemo(() => buildTerrainSymbols(geojson), [geojson])

  if (!paneReady) return null

  return (
    <>
      {symbols.map((s, i) => (
        <Marker
          key={`${i}-${s.lat.toFixed(3)}-${s.lng.toFixed(3)}`}
          position={[s.lat, s.lng]}
          icon={iconFor(s)}
          pane={TERRAIN_PANE}
          interactive={false}
          keyboard={false}
        />
      ))}
    </>
  )
}
