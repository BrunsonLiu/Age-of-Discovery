import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'

/**
 * 右上角小地图：全世界轮廓 + 当前视野框，点击可跳转。
 *
 * 【为什么自己画而不用插件】
 * leaflet-minimap 之类会再开一个 Leaflet 实例、再请求一遍瓦片/样式，
 * 而我们手上已经有 land.geojson 了。用一块 canvas 把轮廓画一次，
 * 之后每帧只重画一个视口矩形，代价极小。
 *
 * 【为什么用等距圆柱投影而不是 Mercator】
 * 小地图只是"我在世界哪里"的示意图，不需要和主图逐像素对齐。
 * 等距圆柱（经纬度线性映射）让南北极不被无限拉伸，轮廓也更像教科书地图。
 * 但**视口矩形**要按主图的 Mercator bounds 反算，否则高纬度会明显偏。
 *
 * 【为什么两层 canvas】
 * 陆地轮廓有 1420 个多边形，重画一次要几十毫秒；拖动地图时每秒要更新几十次，
 * 不能每次都重画轮廓。所以轮廓单独一层（只在数据到达时画一次），
 * 视口框叠在另一层，透明背景。
 */

const W = 168
const H = 104

/** 经纬度 → 小地图像素（等距圆柱） */
function project(lng: number, lat: number) {
  return {
    x: ((lng + 180) / 360) * W,
    y: ((90 - lat) / 180) * H,
  }
}

function drawLand(ctx: CanvasRenderingContext2D, geojson: GeoJSON.GeoJsonObject) {
  ctx.clearRect(0, 0, W, H)

  /*
   * 世界底：必须和主图**实测**的海色一致。
   *
   * 这里换过两次：先是 #26414a（青绿，主图转深蓝时漏改），后来又照着
   * "主图 rgb(50,70,90)" 改成 #32465a —— 但那个采样值是**小地图自己**的像素，
   * 拿它当主图颜色属于自证。直接从开局截图上采主图海面是 rgb(62,82,100)，
   * 也就是 #3e5264。差 12~16 个色阶，在小地图这么小的面积上足以读成"另一块料"。
   */
  ctx.fillStyle = '#3e5264'
  ctx.fillRect(0, 0, W, H)

  const polys: [number, number][][] = []
  const walk = (g: GeoJSON.GeoJsonObject | null | undefined) => {
    if (!g) return
    if (g.type === 'FeatureCollection') {
      (g as GeoJSON.FeatureCollection).features.forEach(f => walk(f.geometry ?? null))
    } else if (g.type === 'Feature') {
      walk((g as GeoJSON.Feature).geometry ?? null)
    } else if (g.type === 'Polygon') {
      const rings = (g as GeoJSON.Polygon).coordinates as [number, number][][]
      if (rings[0]) polys.push(rings[0])
    } else if (g.type === 'MultiPolygon') {
      for (const p of (g as GeoJSON.MultiPolygon).coordinates) {
        if (p[0]) polys.push(p[0] as [number, number][])
      }
    }
  }
  walk(geojson)

  ctx.fillStyle = '#d9c8a2'
  ctx.beginPath()
  for (const ring of polys) {
    /*
     * 抽稀：小地图只有 168px 宽，多边形几百个点全画既慢又看不出区别。
     *
     * 但**不能抽太狠**：原来固定留 60 个点，一条上万点的海岸线就变成 60 段折线，
     * 5 倍放大下整圈都是台阶锯齿（不是数据精度问题，是采样跨步太大）。
     * 现在按 120 个点，点数只多一倍、绘制时间可以忽略，折角减半。
     * 注意是"每隔 step 取一个点"而不是重采样，所以 step 越小越贴近原形状。
     */
    const step = Math.max(1, Math.floor(ring.length / 120))
    for (let i = 0; i < ring.length; i += step) {
      const [lng, lat] = ring[i]
      const { x, y } = project(lng, lat)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
  }
  ctx.fill()
}

export default function MiniMap({ land }: { land: GeoJSON.GeoJsonObject | null }) {
  const map = useMap()
  const landRef = useRef<HTMLCanvasElement>(null)
  const viewRef = useRef<HTMLCanvasElement>(null)

  // 底层：陆地轮廓，数据到达时画一次
  useEffect(() => {
    if (!land || !landRef.current) return
    const canvas = landRef.current
    const dpr = window.devicePixelRatio || 1
    // 【为什么要把 canvas 的位图尺寸乘 DPR】
    // canvas 的 width/height 是**位图**像素，style 的宽高才是 CSS 像素。
    // 只写 168×104 的话，在 2 倍屏上就是 168 像素的图被拉到 336 物理像素——
    // 糊到连金色视野框都看不出来。乘 DPR 再 scale 回去，坐标仍按 CSS 像素写。
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    drawLand(ctx, land)
  }, [land])

  // 上层：视口矩形，跟着地图移动/缩放重画
  useEffect(() => {
    const canvas = viewRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = W * dpr
    canvas.height = H * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const paint = () => {
      ctx.clearRect(0, 0, W, H)
      const b = map.getBounds()
      // Mercator 的 bounds 在高纬会跨出 ±180，先夹一下
      const west = Math.max(-180, b.getWest())
      const east = Math.min(180, b.getEast())
      const south = Math.max(-85, b.getSouth())
      const north = Math.min(85, b.getNorth())
      const p1 = project(west, north)
      const p2 = project(east, south)
      const w = Math.max(3, p2.x - p1.x)
      const h = Math.max(3, p2.y - p1.y)

      /*
       * 视野框：只用线，**不压暗也不点亮**。
       *
       * 走过两版都不行：
       * · 原版在框内盖 20% 暖黄 —— 把框内的陆地洗白一档，小地图本来就小，
       *   再一洗海陆分不清；
       * · 改成 evenodd 压暗框外 —— 无论 alpha 给多少都让外面的陆色偏离主图
       *   （0.15 就把 rgb(217,200,162) 压成 (186,172,141)，差 31 个色阶）。
       *   而小地图存在的意义就是"和主图同一套料"，压暗等于自毁前提。
       *
       * 所以只画线：2px 亮金 + 外侧 1px 暗边。亮线在深蓝海面和浅色陆地上
       * 都能立住，框内像素一点也不动。
       */
      ctx.strokeStyle = 'rgba(20, 14, 8, 0.55)'
      ctx.lineWidth = 3.5
      ctx.strokeRect(p1.x + 1.75, p1.y + 1.75, w - 3.5, h - 3.5)
      ctx.strokeStyle = '#f7e8b8'
      ctx.lineWidth = 2
      ctx.strokeRect(p1.x + 1, p1.y + 1, w - 2, h - 2)
    }

    // 首帧的 getBounds() 可能还是"整个世界"（地图尚未完成初始化），
    // 直接画会得到一个铺满小地图的大框。等 map ready 再画一次，并用 rAF 兜底。
    paint()
    requestAnimationFrame(paint)
    map.whenReady(paint)
    map.on('move zoom resize', paint)
    return () => {
      map.off('move zoom resize', paint)
    }
  }, [map])

  const jump = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    const lng = Math.max(-180, Math.min(180, px * 360 - 180))
    const lat = Math.max(-85, Math.min(85, 90 - py * 180))
    map.setView([lat, lng], map.getZoom(), { animate: true })
  }

  return (
    // 用 <button> 而不是加了 onClick 的 <div>：无障碍上它本来就是"可点击控件"，
    // 而且 e2e 的可点性巡检只遍历 button —— div 会漏在巡检之外。
    <button
      type="button"
      className="absolute right-3 hidden md:block p-0 rounded-sm overflow-hidden cursor-pointer"
      style={{
        top: 96, width: W, height: H, zIndex: 850,
        /* 与侧栏铭牌同一套材质逻辑：外框深铜 + 内侧一道受光金线 + 内投影。
           只有 1px 细边的话，这块 168px 的小图看起来像"贴在屏幕上的一张图"，
           而不是嵌在航海桌上的仪表。 */
        border: '2px solid #8b6f3e',
        boxShadow: 'inset 0 0 0 1px rgba(255,238,186,0.22), inset 0 2px 7px rgba(0,0,0,0.55), 0 4px 14px rgba(0,0,0,0.6)',
      }}
      onClick={jump}
      title="点击跳到该位置"
      aria-label="世界小地图，点击可跳转到该位置"
      data-testid="mini-map"
    >
      <canvas ref={landRef} width={W} height={H} style={{ width: W, height: H, display: 'block' }} />
      <canvas
        ref={viewRef}
        width={W}
        height={H}
        className="absolute inset-0 pointer-events-none"
        style={{ width: W, height: H }}
      />
      {/* 罗盘角标：小地图做得再准，玩家第一眼还是要知道"上北下南" */}
      <span className="absolute left-1 top-0.5 text-[10px] font-serif text-gold-200/90 pointer-events-none">N</span>
    </button>
  )
}
