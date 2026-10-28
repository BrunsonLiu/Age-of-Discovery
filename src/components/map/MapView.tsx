import { useEffect, useState, useCallback, Component, useMemo, lazy, Suspense } from 'react'
import { MapContainer, GeoJSON, useMap } from 'react-leaflet'
import { useMapStore } from '@/store/useMapStore'
import { useGameStore } from '@/store/useGameStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { ports } from '@/data/ports'
import { PortMarker } from './PortMarker'
import { RouteLine } from './RouteLine'
import { ShipAnimation } from './ShipAnimation'
import { MapOverlays } from './MapOverlays'
import MapClickHandler from './MapClickHandler'
import OceanLabels from './OceanLabels'
import VintageMapOverlay from './VintageMapOverlay'
import { loadLandData, fetchLandGeojsonForRender } from '@/utils/landCheck'
import { fetchBordersGeojson } from '@/utils/mapGeoJson'
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

/**
 * 地图写死的初始视野：大西洋中部。
 *
 * 这个值在 1440px 的桌面上能容下塞维利亚（实测标记落在 x=497，还在屏内），
 * 但 390px 的手机上只剩约 17° 经度 → 塞维利亚被推到屏幕右侧外面，
 * **屏幕上一个港口标记都没有**。而出航的唯一入口就是点地图上的港口，
 * 于是手机上打开游戏看到的是一片空海，不知道该点哪儿。
 *
 * 所以窄屏时不直接用这个值，而是换成玩家自己的位置（见 MapController）。
 */
const DEFAULT_CENTER: [number, number] = [25, -20]

/** 2.5D 立体海图：懒加载，three.js 单独成 chunk，不进主包 */
const Map3DView = lazy(() => import('@/components/map3d/Map3DView'))

function MapController() {
  const map = useMap()
  const storeCenter = useMapStore((s) => s.center)
  const zoom = useMapStore((s) => s.zoom)
  const isMobile = useIsMobile()
  const shipPosition = useGameStore((s) => s.shipPosition)
  const currentPortId = useGameStore((s) => s.fleet.currentPortId)

  /** 玩家此刻在哪：港内是所在港口，航行中是船位 */
  const here = useMemo<[number, number] | null>(() => {
    if (shipPosition && isFinite(shipPosition[0]) && isFinite(shipPosition[1])) {
      return [shipPosition[0], shipPosition[1]]
    }
    const p = ports.find(p => p.id === currentPortId)
    return p ? [p.latitude, p.longitude] : null
  }, [shipPosition, currentPortId])

  /**
   * 实际要显示的中心。
   *
   * 【为什么不"事后"把地图挪过去】
   * 先试过在挂载后调 map.fitBounds 把视野拉到玩家位置——视野被拉回去了：
   * center effect 用的是**上一次渲染的闭包**（那个写死的默认中心），
   * StrictMode 的双调用让它在 fitBounds 之后又跑一次，把地图拽回大西洋中部。
   *
   * 现在改成**不做事后修正**：窄屏且地图还停在写死的默认视野时，
   * 直接把"要显示的中心"换成玩家位置——center effect 本来就要把地图
   * 设到这个中心，于是两者天然一致，不用抢方向盘。
   *
   * `isDefaultView` 的含义是"玩家还没拖过地图"（拖过就持久化成别的值了）。
   */
  const isDefaultView = storeCenter[0] === DEFAULT_CENTER[0] && storeCenter[1] === DEFAULT_CENTER[1]
  const center = (isMobile && isDefaultView && here) ? here : storeCenter
  // 拆成标量再进依赖数组：center 是数组，每次渲染都是新引用
  const centerLat = center[0]
  const centerLng = center[1]

  useEffect(() => {
    if (!isFinite(centerLat) || !isFinite(centerLng) || !isFinite(zoom)) return
    const cur = map.getCenter()
    if (Math.abs(cur.lat - centerLat) > 0.0001 || Math.abs(cur.lng - centerLng) > 0.0001) {
      map.setView([centerLat, centerLng], zoom, { animate: true })
    } else if (map.getZoom() !== zoom) {
      map.setZoom(zoom)
    }
  }, [centerLat, centerLng, zoom, map])

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
 *
 * 【为什么海岸线由 land 自己描，而不是单独一层 coastline】
 * 原来有 land.geojson + coastline.geojson 两个文件，1.6MB + 1.6MB。
 * 实测两者的坐标 99.5% 重复（1429 条线里 1428 条完全落在 land 的坐标内），
 * 本质是同一份海岸线的两种表达：一份填色多边形、一份描边线。
 * 线上一共 4MB 地图数据，在真实网络下单个文件要下载 60 秒，
 * 玩家盯着「绘制航海图...」37 秒。
 *
 * 删掉 coastline.geojson，让 land 多边形自己带深褐粗描边：
 * 逐像素比对渲染结果，差异仅 0.99%~2.7%（且集中在描边处），填充色完全一致，
 * 海陆分界的清晰度不变。地图数据从 4MB 降到 1.9MB。
 */
const landStyle = { fillColor: '#e7d5ab', fillOpacity: 0.94, color: '#3d2810', weight: 1.3, opacity: 0.9 }
const bordersStyle = { fillColor: 'transparent', fillOpacity: 0, color: '#7a5a30', weight: 0.6, opacity: 0.4, dashArray: '3 2' }

export default function MapView() {
  const mapCenter = useMapStore(s => s.center)
  const mapZoom = useMapStore(s => s.zoom)
  // 2D（Leaflet 矢量图）/ 3D（three.js 立体海图）两种视图，默认 2D
  const renderMode = useMapStore(s => s.renderMode)
  const setRenderMode = useMapStore(s => s.setRenderMode)
  // 海面纹理：暴风雨天换更暗的版本——底图也参与天候叙事
  const weatherKind = useGameStore(s => s.weather.kind)
  const seaTile = weatherKind === 'storm' ? 'sea-tile-storm.png' : 'sea-tile.png'
  const seaBg = `${import.meta.env.BASE_URL}assets/sea/${seaTile}`
  const [geoData, setGeoData] = useState<{
    land: GeoJSON.GeoJsonObject | null
    borders: GeoJSON.GeoJsonObject | null
  }>({ land: null, borders: null })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      // 注意：这里不再加载 ocean.geojson。
      // 那份文件在仓库里就是截断的（354112B，JSON 解析直接失败），
      // 而它原本只给海洋区叠一层 18% 的绿色微调——海面的表达已由
      // 手绘海浪纹理（sea-tile.png）承担，这层微调只会把海洗浑。
      // 一个永远加载失败的图层，除了白占 350KB 带宽没有任何价值。
      //
      // 同样不再加载 coastline.geojson：它的坐标 99.5% 与 land 重复，
      // 海岸线改由 land 多边形自己描边（见 landStyle 注释）。
      // 地图数据因此从 4MB 降到 1.9MB，「绘制航海图...」的等待从 37 秒降到个位数。
      const results = await Promise.allSettled([
        fetchLandGeojsonForRender(),
        fetchBordersGeojson(),
      ])

      const [land, borders] = results
      setGeoData({
        land: land.status === 'fulfilled' ? land.value : null,
        borders: borders.status === 'fulfilled' ? borders.value : null,
      })

      if (land.status === 'rejected') {
        setLoadError(true)
      }
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // 碰撞检测要的数据在两种视图下都得要（航线避让靠它）
    loadLandData()
    // 渲染数据只有 2D 视图需要；3D 视图自己取（且与碰撞检测共用同一个 Promise）
    if (renderMode === '2d') loadData()
  }, [loadData, renderMode])

  return (
    <div className="relative" style={{ width: '100%', height: '100%' }}>
      {/* 视图切换：2D 矢量海图 / 3D 立体海图 */}
      <button
        type="button"
        onClick={() => setRenderMode(renderMode === '3d' ? '2d' : '3d')}
        className="absolute top-3 right-3 z-[700] px-2.5 py-1 rounded text-[11px] font-serif
                   bg-[#1b1408]/75 border border-[#8b6f3e]/60 text-[#e8d4a8]
                   hover:bg-[#2a1f0c]/85 active:scale-95 transition-colors"
        title={renderMode === '3d' ? '切回 2D 平面海图' : '切换到 3D 立体海图'}
        data-testid="map-mode-toggle"
      >
        {renderMode === '3d' ? '🗺️ 2D 海图' : '🧭 3D 海图'}
      </button>

      {renderMode === '3d' ? (
        // 懒加载：three.js 有 500KB，静态 import 会把它拖进主包、
        // 让首屏下载量涨一大截。2.5D 是可选视图，不该为此买单。
        <Suspense fallback={(
          <div className="absolute inset-0 z-10 flex items-center justify-center text-[#e8d4a8] font-serif"
               style={{ letterSpacing: 3, background: 'linear-gradient(180deg,#16212e 0%,#0d1620 100%)' }}>
            装配立体海图...
          </div>
        )}>
          <Map3DView />
        </Suspense>
      ) : (
        <>
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
        </>
      )}

      <VintageMapOverlay dimmed={renderMode === '3d'} />
    </div>
  )
}