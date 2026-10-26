import { useEffect, useState, useCallback, Component } from 'react'
import { MapContainer, GeoJSON, useMap } from 'react-leaflet'
import { useMapStore } from '@/store/useMapStore'
import { useGameStore } from '@/store/useGameStore'
import { PortMarker } from './PortMarker'
import { RouteLine } from './RouteLine'
import { ShipAnimation } from './ShipAnimation'
import { MapOverlays } from './MapOverlays'
import MapClickHandler from './MapClickHandler'
import OceanLabels from './OceanLabels'
import VintageMapOverlay from './VintageMapOverlay'
import { loadLandData } from '@/utils/landCheck'
import 'leaflet/dist/leaflet.css'

class MapErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('[MapErrorBoundary]', error.message, info.componentStack)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-ocean-900 text-gold-400 font-serif">
          <div className="text-center">
            <div className="text-4xl mb-3">🗺️</div>
            <p>地图加载失败</p>
            <p className="text-xs text-gold-700 mt-1">{this.state.error}</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function MapController() {
  const map = useMap()
  const center = useMapStore((s) => s.center)
  const zoom = useMapStore((s) => s.zoom)

  useEffect(() => {
    if (!isFinite(center[0]) || !isFinite(center[1]) || !isFinite(zoom)) return
    const cur = map.getCenter()
    if (Math.abs(cur.lat - center[0]) > 0.0001 || Math.abs(cur.lng - center[1]) > 0.0001) {
      map.setView(center, zoom, { animate: true })
    } else if (map.getZoom() !== zoom) {
      map.setZoom(zoom)
    }
  }, [center, zoom, map])

  useEffect(() => {
    let cancelled = false
    const onMoveEnd = () => {
      if (cancelled) return
      const c = map.getCenter()
      const cur = useMapStore.getState().center
      if (Math.abs(c.lat - cur[0]) > 0.01 || Math.abs(c.lng - cur[1]) > 0.01) {
        useMapStore.getState().setCenter([c.lat, c.lng])
      }
    }
    const onZoomEnd = () => {
      if (cancelled) return
      const z = map.getZoom()
      if (z !== useMapStore.getState().zoom) {
        useMapStore.getState().setZoom(z)
      }
    }
    map.on('moveend', onMoveEnd)
    map.on('zoomend', onZoomEnd)
    return () => {
      cancelled = true
      map.off('moveend', onMoveEnd)
      map.off('zoomend', onZoomEnd)
    }
  }, [map])

  return null
}

/**
 * 海陆配色：靠"冷色海面 vs 暖色陆地"承担，玩家一眼就能分辨能不能开船。
 *
 * 【为什么陆地要近乎不透明】
 * 底图是手绘海浪（sea-tile.png），深蓝绿。如果陆地还半透明，
 * 羊皮纸色压在海浪上会变成浑浊的中间色——海陆又糊成一片。
 * 所以陆地是接近不透明的羊皮纸，海岸线再压一道深褐描边定边界。
 */
const landStyle = { fillColor: '#e7d5ab', fillOpacity: 0.94, color: '#8a6a38', weight: 0.6, opacity: 0.55 }
const coastlineStyle = { fillColor: 'transparent', fillOpacity: 0, color: '#3d2810', weight: 1.3, opacity: 0.9 }
const bordersStyle = { fillColor: 'transparent', fillOpacity: 0, color: '#7a5a30', weight: 0.6, opacity: 0.4, dashArray: '3 2' }

export default function MapView() {
  const mapCenter = useMapStore(s => s.center)
  const mapZoom = useMapStore(s => s.zoom)
  // 海面纹理：暴风雨天换更暗的版本——底图也参与天候叙事
  const weatherKind = useGameStore(s => s.weather.kind)
  const seaTile = weatherKind === 'storm' ? 'sea-tile-storm.png' : 'sea-tile.png'
  const seaBg = `${import.meta.env.BASE_URL}assets/sea/${seaTile}`
  const [geoData, setGeoData] = useState<{
    land: GeoJSON.GeoJsonObject | null
    coastline: GeoJSON.GeoJsonObject | null
    borders: GeoJSON.GeoJsonObject | null
  }>({ land: null, coastline: null, borders: null })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const base = import.meta.env.BASE_URL
      // 注意：这里不再加载 ocean.geojson。
      // 那份文件在仓库里就是截断的（354112B，JSON 解析直接失败），
      // 而它原本只给海洋区叠一层 18% 的绿色微调——海面的表达已由
      // 手绘海浪纹理（sea-tile.png）承担，这层微调只会把海洗浑。
      // 一个永远加载失败的图层，除了白占 350KB 带宽没有任何价值。
      const results = await Promise.allSettled([
        fetch(`${base}data/land.geojson`).then(r => r.ok ? r.json() : Promise.reject('land load fail')),
        fetch(`${base}data/coastline.geojson`).then(r => r.ok ? r.json() : Promise.reject('coastline load fail')),
        fetch(`${base}data/borders.geojson`).then(r => r.ok ? r.json() : Promise.reject('borders load fail')),
      ])

      const [land, coastline, borders] = results
      setGeoData({
        land: land.status === 'fulfilled' ? land.value : null,
        coastline: coastline.status === 'fulfilled' ? coastline.value : null,
        borders: borders.status === 'fulfilled' ? borders.value : null,
      })

      if (land.status === 'rejected' && coastline.status === 'rejected') {
        setLoadError(true)
      }
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    loadLandData()
  }, [loadData])

  return (
    <div className="relative" style={{ width: '100%', height: '100%' }}>
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-[#5a3e1a] font-serif" style={{ fontSize: 18, letterSpacing: 3, background: 'linear-gradient(180deg, #e8d4a8 0%, #d4b884 50%, #e8d4a8 100%)' }}>
          <div className="text-center">
            <div className="text-4xl mb-4" style={{ animation: 'loadPulse 1.5s ease-in-out infinite' }}>⛵</div>
            <div>绘制航海图...</div>
          </div>
        </div>
      )}

      {loadError && (
        <div className="absolute bottom-4 left-4 z-10 bg-red-900/80 text-red-200 px-3 py-1.5 rounded text-xs font-serif">
          GeoJSON 数据加载失败，地图将以简化模式显示
        </div>
      )}

      <MapErrorBoundary>
        {/*
          海面单独成层，不放在 MapContainer 的 background 上。
          理由：滤镜要分开给。
          - 海面：手绘海浪原图偏"现代油画"的高饱和蓝，压成古海图的青灰
          - 陆地：羊皮纸填充，本就该是暖色，不能被同一层滤镜染冷
          以前两者共用一个容器背景 + 容器级 sepia，结果海浪被洗成土黄、
          陆地被染灰，海陆糊成一片。现在海是冷、海岸线是深褐、陆地是暖黄，
          玩家的第一判断是"哪里能开船"。
        */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundColor: '#3d5a5e',
            backgroundImage: `url(${seaBg})`,
            backgroundRepeat: 'repeat',
            backgroundSize: '512px 512px',
          }}
          aria-hidden="true"
        />
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{
            width: '100%',
            height: '100%',
            backgroundColor: 'transparent',
          }}
          zoomControl={true}
          minZoom={2}
          maxZoom={10}
          attributionControl={false}
        >
          {geoData.land && (
            <GeoJSON key="land" data={geoData.land} style={landStyle} interactive={false} />
          )}

          {geoData.coastline && (
            <GeoJSON key="coastline" data={geoData.coastline} style={coastlineStyle} interactive={false} />
          )}

          {geoData.borders && (
            <GeoJSON key="borders" data={geoData.borders} style={bordersStyle} interactive={false} />
          )}

          <MapController />
          <MapOverlays />
          <MapClickHandler />
          <OceanLabels />
          <RouteLine />
          <PortMarker />
          <ShipAnimation />
        </MapContainer>
      </MapErrorBoundary>

      <VintageMapOverlay />
    </div>
  )
}