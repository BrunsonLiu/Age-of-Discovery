import { useEffect, useState, useCallback, Component, useMemo, lazy, Suspense } from 'react'
import { MapContainer, GeoJSON, useMap } from 'react-leaflet'
import { useMapStore } from '@/store/useMapStore'
import { useGameStore } from '@/store/useGameStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { ports } from '@/data/ports'
import { PortMarker } from './PortMarker'
import TerrainDecor from './TerrainDecor'
import MiniMap from './MiniMap'
import { buildMajorLand, featureArea } from '@/utils/terrainDecor'
import { RouteLine } from './RouteLine'
import { ShipAnimation } from './ShipAnimation'
import { MapOverlays } from './MapOverlays'
import MapClickHandler from './MapClickHandler'
import OceanLabels from './OceanLabels'
import VintageMapOverlay from './VintageMapOverlay'
import { loadLandData, fetchLandGeojsonForRender } from '@/utils/landCheck'
import { UI_ASSETS } from '@/data/uiAssets'
import { fetchBordersGeojson } from '@/utils/mapGeoJson'
import 'leaflet/dist/leaflet.css'
import { Compass, Map as MapIcon, Sailboat } from 'lucide-react'

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
            <MapIcon size={36} className="mx-auto mb-3 text-gold-600" strokeWidth={1.2} aria-hidden="true" />
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

/**
 * 给陆地铺一层羊皮纸纹理。
 *
 * 【为什么要在 SVG 里注入 pattern】
 * Leaflet 的 GeoJSON 只能填纯色（fill 属性），而参考图里的陆地是有纸纹和
 * 颗粒的——一整块米黄平涂是"网页色块"和"游戏地图"之间最明显的那条分界。
 * SVG 的 <pattern> 可以引用图片，把 landStyle.fillColor 写成 url(#landPaper)
 * 就行，不用改数据、不用换渲染库。
 *
 * 【为什么图案放大 1.5 倍再平移】
 * ui_parchment.png 四周有暗角（vignette），直接 240×240 平铺会看到一格一格
 * 的边。所以把 360×360 的图往左上偏移 60px，只露出它的中心区。
 *
 * 【为什么挂在 zoomend 上】
 * Leaflet 在视图重建时会换掉 svg 节点，defs 跟着丢；每次缩放结束补一次，
 * 幂等（已有 #landPaper 就跳过）。
 */
function LandPaperPattern() {
  const map = useMap()
  useEffect(() => {
    const ensure = () => {
      const svg = map.getPanes().overlayPane?.querySelector('svg')
      if (!svg || svg.querySelector('#landPaper')) return
      const NS = 'http://www.w3.org/2000/svg'
      const defs = document.createElementNS(NS, 'defs')
      defs.innerHTML = `<pattern id="landPaper" patternUnits="userSpaceOnUse" width="240" height="240">`
        + `<image href="${UI_ASSETS.parchment}" x="-60" y="-60" width="360" height="360" preserveAspectRatio="xMidYMid slice" />`
        // 羊皮原图比陆地色亮一截，直接铺会把大陆洗成浅黄。叠一层原来的暖色把它压回来，
        // 纹理仍在（颗粒是乘出来的），明度回到 #e7d5ab 附近。
        + `<rect width="240" height="240" fill="#d8c39a" opacity="0.42" />`
        + `</pattern>`
      svg.insertBefore(defs, svg.firstChild)
    }
    ensure()
    map.on('zoomend', ensure)
    return () => { map.off('zoomend', ensure) }
  }, [map])
  return null
}

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
// fillColor 用 SVG pattern（见 LandPaperPattern）。fillOpacity 保持 1，
// 因为纹理本身已经是"米黄纸"，再压透明会让海面透上来发绿。
const LAND_BASE = { fillColor: 'url(#landPaper)', fillOpacity: 1, color: '#3d2810', weight: 1.3, opacity: 0.9 }

/**
 * 陆地样式按**面积分档**：大陆粗细描边，小岛只留一层淡边。
 *
 * 【为什么不能一律 1.3px】
 * land.geojson 有 1420 块陆地，其中 858 块（60%）的 bbox 面积 < 0.1 度²
 * ——约 12km×12km。在 zoom 3 的世界视图里它们只有 2~3 个像素，
 * 却被 1.3px 的深褐描边包一圈，于是整片海域漂着一层褐色杂点，
 * 看起来既像渲染噪点、又抢走大陆的轮廓感。
 *
 * 但**不能删**：那些岛是真实存在的（希腊群岛、挪威峡湾、印尼），
 * 而且陆地碰撞检测用的是同一份数据——画面上看不见、船却撞上去，
 * 比噪点更糟。所以只降描边权重，几何一点不动。
 *
 * 分档阈值 0.3 度²：p75 是 0.24、p90 是 1.33，取在两者之间，
 * 正好把"群岛碎块"和"真正的岛"分开。
 */
function landStyleFor(feature?: GeoJSON.Feature) {
  if (!feature) return LAND_BASE
  return featureArea(feature) < 0.3
    ? { ...LAND_BASE, weight: 0.45, opacity: 0.55 }
    : LAND_BASE
}
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
  // 只取面积最大的十几块陆地来画浅滩光晕（见 buildMajorLand 注释）
  const majorLand = useMemo(
    () => (geoData.land ? buildMajorLand(geoData.land, 14) : null),
    [geoData.land],
  )
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
      {/* 视图切换：2D 矢量海图 / 3D 立体海图

          【为什么是 top-14 而不是 top-3】顶栏 TimelineBar 是 top-0/h-12（48px）
          且压在更上层。这个按钮原先放 top-3（12px）、高 30px，整个落进顶栏
          覆盖范围里——玩家根本看不见、点不到，反馈"我还是没看到 3D"。
          之前的 e2e 之所以全绿，是因为脚本直接调 btn.click() 绕过了命中测试。
          现在躲到 56px（顶栏下方），右侧侧栏按钮是垂直居中排布，不会撞上。 */}
      <button
        type="button"
        onClick={() => setRenderMode(renderMode === '3d' ? '2d' : '3d')}
        className="absolute top-14 right-3 z-[900] px-3 py-1.5 rounded text-xs font-serif
                   bg-[#1b1408]/95 border border-[#8b6f3e]/70 text-[#e8d4a8]
                   shadow-[0_2px_8px_rgba(0,0,0,0.55)]
                   hover:bg-[#2a1f0c] active:scale-95 transition-colors"
        title={renderMode === '3d' ? '切回 2D 平面海图' : '切换到 3D 立体海图'}
        data-testid="map-mode-toggle"
      >
        <span className="inline-flex items-center gap-1.5">
          {renderMode === '3d'
            ? <><MapIcon size={14} aria-hidden="true" />2D 海图</>
            : <><Compass size={14} aria-hidden="true" />3D 海图</>}
        </span>
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
                <Sailboat size={36} className="mx-auto mb-4 text-gold-600" strokeWidth={1.2} style={{ animation: 'loadPulse 1.5s ease-in-out infinite' }} aria-hidden="true" />
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
              - 海面：见下方 luminosity 混合（纹理只贡献明暗，色相可控）
              - 陆地：羊皮纸填充，本就该是暖色，不能被同一层滤镜染冷
              以前两者共用一个容器背景 + 容器级 sepia，结果海浪被洗成土黄、
              陆地被染灰，海陆糊成一片。现在海是深蓝、海岸线是深褐、陆地是暖黄，
              玩家的第一判断是"哪里能开船"。
            */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundColor: '#2f4d70',
                // 再压一档：luminosity 只换色相、不改明度，纹理的 Y 约 83 偏亮，
                // 直接用会得到"晴朗天空蓝"。降明度 + 轻微去饱和，
                // 才落到参考图那种沉静的古海图深蓝。
                filter: 'saturate(0.82) brightness(0.86)',
                backgroundImage: `url(${seaBg})`,
                backgroundRepeat: 'repeat',
                backgroundSize: '512px 512px',
                /*
                 * 【为什么用 background-blend-mode: luminosity】
                 * sea-tile.png 是几乎不透明的青灰纹理，实测渲染像素 rgb(64,88,91)
                 * 与底色常量 #3d5a5e=(61,90,94) 几乎一致——说明改 backgroundColor
                 * 对画面**没有任何影响**，纹理自己把颜色定死了。
                 *
                 * 而那张纹理的色相是"青绿"（R 最低、G≈B），参考图的海是"深蓝"
                 * （B 明显高于 G）。这不是深浅问题，是通道顺序不对，靠调暗调亮都改不出来。
                 *
                 * luminosity 模式：色相与饱和度全部取自 backgroundColor，明度取自纹理。
                 * 于是纹理的手绘笔触、浪花、斑驳一点不丢，颜色却完全可控——
                 * 想换海色只改这一个常量，连素材都不用动。
                 */
                backgroundBlendMode: 'luminosity',
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
                <>
                  {/* 浅滩光晕：在陆地**下面**叠三层由粗到细的浅青描边，
                      陆地的填充会盖住内侧，只留海岸外侧那一圈——模拟近岸浅水。
                      三层而不是一层，是因为单层只有一条硬边，叠起来才有"由浅到深"的过渡。 */}
                  {majorLand && [34, 22, 12].map((w, i) => (
                    <GeoJSON
                      key={`shallows-${w}`}
                      data={majorLand}
                      style={{
                        fillColor: 'transparent', fillOpacity: 0,
                        color: '#9fd3c6', weight: w, opacity: [0.10, 0.15, 0.22][i],
                        lineJoin: 'round', lineCap: 'round',
                      }}
                      interactive={false}
                    />
                  ))}
                  <GeoJSON key="land" data={geoData.land} style={landStyleFor} interactive={false} />
                  {/* 地形符号：山丘/树丛。挂在自定义 terrainPane(z=450)，
                      压在陆地之上、港口标记(z=600)之下 */}
                  <TerrainDecor geojson={geoData.land} />
                </>
              )}

              {geoData.borders && (
                <GeoJSON key="borders" data={geoData.borders} style={bordersStyle} interactive={false} />
              )}

              <LandPaperPattern />
              <MapController />
              <MapOverlays />
              {/* 右上角小地图：全世界轮廓 + 当前视野框，点击跳转 */}
              <MiniMap land={geoData.land} />
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