import { useEffect, useState, useCallback, Component } from 'react'
import { MapContainer, GeoJSON, useMap } from 'react-leaflet'
import { useMapStore } from '@/store/useMapStore'
import { PortMarker } from './PortMarker'
import { RouteLine } from './RouteLine'
import { ShipAnimation } from './ShipAnimation'
import MapClickHandler from './MapClickHandler'
import OceanLabels from './OceanLabels'
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

const landStyle = { fillColor: '#3d5a3a', fillOpacity: 0.7, color: '#5a7a50', weight: 0.8, opacity: 0.6 }
const coastlineStyle = { fillColor: 'transparent', fillOpacity: 0, color: '#a89060', weight: 1.5, opacity: 0.8 }
const bordersStyle = { fillColor: 'transparent', fillOpacity: 0, color: '#7a6a4a', weight: 0.6, opacity: 0.3, dashArray: '4 3' }
const oceanStyle = { fillColor: '#1a3a5a', fillOpacity: 0.15, color: '#2a5a8a', weight: 0.5, opacity: 0.3 }

export default function MapView() {
  const mapCenter = useMapStore(s => s.center)
  const mapZoom = useMapStore(s => s.zoom)
  const [geoData, setGeoData] = useState<{
    land: GeoJSON.GeoJsonObject | null
    coastline: GeoJSON.GeoJsonObject | null
    borders: GeoJSON.GeoJsonObject | null
    ocean: GeoJSON.GeoJsonObject | null
  }>({ land: null, coastline: null, borders: null, ocean: null })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    try {
      const results = await Promise.allSettled([
        fetch('/data/land.geojson').then(r => r.ok ? r.json() : Promise.reject('land load fail')),
        fetch('/data/coastline.geojson').then(r => r.ok ? r.json() : Promise.reject('coastline load fail')),
        fetch('/data/borders.geojson').then(r => r.ok ? r.json() : Promise.reject('borders load fail')),
        fetch('/data/ocean.geojson').then(r => r.ok ? r.json() : Promise.reject('ocean load fail')),
      ])

      const [land, coastline, borders, ocean] = results
      setGeoData({
        land: land.status === 'fulfilled' ? land.value : null,
        coastline: coastline.status === 'fulfilled' ? coastline.value : null,
        borders: borders.status === 'fulfilled' ? borders.value : null,
        ocean: ocean.status === 'fulfilled' ? ocean.value : null,
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
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-ocean-900 text-gold-400 font-serif" style={{ fontSize: 18, letterSpacing: 3 }}>
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
        <MapContainer
          center={mapCenter}
          zoom={mapZoom}
          style={{ width: '100%', height: '100%' }}
          zoomControl={true}
          minZoom={2}
          maxZoom={10}
          attributionControl={false}
        >
          {geoData.ocean && (
            <GeoJSON key="ocean" data={geoData.ocean} style={oceanStyle} interactive={false} />
          )}

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
          <MapClickHandler />
          <OceanLabels />
          <RouteLine />
          <PortMarker />
          <ShipAnimation />
        </MapContainer>
      </MapErrorBoundary>

      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(9,15,25,0.5) 100%)' }} />
    </div>
  )
}