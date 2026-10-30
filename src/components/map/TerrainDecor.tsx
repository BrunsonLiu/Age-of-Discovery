import { useEffect, useMemo, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { buildTerrainSymbols, type TerrainSymbol } from '@/utils/terrainDecor'

/**
 * 地形装饰层：把 terrainDecor 生成的山丘 / 树丛画到地图上。
 *
 * 【为什么从 divIcon 改成一块 canvas】
 * 第一版是每颗符号一个 `L.marker(divIcon)` —— 1260 个符号就是 1260 个 DOM 节点，
 * 每个还内联一段 `<svg>`。实测代价：把密度提一倍（2800 个）后，
 * 缩放时的帧间隔中位从 20.1ms 涨到 37.9ms（近翻倍），几乎线性。
 * 因为 Leaflet 在 pan/zoom 时要逐个 `_setPos` 重算每个 marker 的位置。
 *
 * 改成一块 canvas 之后：DOM 只有 1 个节点，重画成本与**视口内**的符号数相关
 * （视口裁剪后通常几百个），与总数无关。于是密度可以从 1260 提到 4400，
 * 而 pan/zoom 反而更轻。
 *
 * 【为什么符号仍是固定像素尺寸】
 * 用地理坐标画三角形，缩到 zoom 2 会退化成一条线、放到 zoom 8 又撑满屏幕。
 * canvas 每次重画都按「当前 zoom 下的屏幕像素」绘制，尺寸天然恒定；
 * 只有位置随投影变。这比 SVG 图层（符号会随缩放变形）更合适。
 *
 * 【为什么单独建一个 pane】
 * 默认 markerPane(z=600) 是港口标记住的。地形挤进同一层就得靠 DOM 顺序
 * 决定谁在上面。自定义 terrainPane(z=450) 夹在 overlayPane(400) 与
 * markerPane(600) 之间：地形压着陆地、被港口压着——正是想要的层次。
 *
 * 【为什么 canvas 要抵消 mapPane 的平移】
 * pane 会随地图拖动被 transform 平移。canvas 若留在原地（left:0），
 * 拖一下就会跑到屏幕外。Leaflet 自己的 SVG overlay 也是靠
 * `left = -mapPanePos` 把图层钉在屏幕上，这里照做。
 */

const TERRAIN_PANE = 'terrainPane'

/** 山：三角形 + 右半暗面 + 雪顶，模仿古地图的笔触（26×19，锚点在底边中心） */
const PEAK = {
  body: 'M2 18 L13 1 L24 18 Z',
  shade: 'M13 1 L24 18 L15 18 Z',
  snow: 'M9.2 7.6 L13 1 L16.8 7.6 Z',
}

/** 树：小圆锥 + 树干（14×19，锚点在底边中心） */
const TREE = {
  body: 'M7 1 L13 15 L1 15 Z',
  shade: 'M7 1 L13 15 L8.2 15 Z',
  trunk: { x: 5.9, y: 14.4, w: 2.2, h: 3.4 },
}

/** Path2D 只建一次。SVG path 字符串可以直接喂给 Path2D 构造函数。 */
function makePaths() {
  return {
    peakBody: new Path2D(PEAK.body),
    peakShade: new Path2D(PEAK.shade),
    peakSnow: new Path2D(PEAK.snow),
    treeBody: new Path2D(TREE.body),
    treeShade: new Path2D(TREE.shade),
  }
}

function drawSymbol(
  ctx: CanvasRenderingContext2D,
  paths: ReturnType<typeof makePaths>,
  s: TerrainSymbol,
  x: number,
  y: number,
) {
  const scale = s.scale

  if (s.kind === 'peak') {
    // 锚点在底边中心：把局部坐标 (13,18) 对齐到 (x,y)
    ctx.save()
    ctx.translate(x - 13 * scale, y - 18 * scale)
    ctx.scale(scale, scale)

    ctx.fillStyle = 'rgba(138,106,62,0.72)'
    ctx.strokeStyle = 'rgba(63,44,20,0.75)'
    ctx.lineWidth = 1
    ctx.lineJoin = 'round'
    ctx.fill(paths.peakBody)
    ctx.stroke(paths.peakBody)

    ctx.fillStyle = 'rgba(63,44,20,0.34)'
    ctx.fill(paths.peakShade)

    ctx.fillStyle = 'rgba(247,240,216,0.75)'
    ctx.fill(paths.peakSnow)

    ctx.restore()
    return
  }

  ctx.save()
  ctx.translate(x - 7 * scale, y - 18 * scale)
  ctx.scale(scale, scale)

  ctx.fillStyle = 'rgba(91,107,54,0.62)'
  ctx.strokeStyle = 'rgba(51,64,28,0.70)'
  ctx.lineWidth = 0.9
  ctx.lineJoin = 'round'
  ctx.fill(paths.treeBody)
  ctx.stroke(paths.treeBody)

  ctx.fillStyle = 'rgba(51,64,28,0.30)'
  ctx.fill(paths.treeShade)

  ctx.fillStyle = 'rgba(63,44,20,0.65)'
  ctx.fillRect(TREE.trunk.x, TREE.trunk.y, TREE.trunk.w, TREE.trunk.h)

  ctx.restore()
}

export default function TerrainDecor({ geojson }: { geojson: GeoJSON.GeoJsonObject }) {
  const map = useMap()
  const symbols = useMemo(() => buildTerrainSymbols(geojson), [geojson])
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!map.getPane(TERRAIN_PANE)) {
      const pane = map.createPane(TERRAIN_PANE)
      pane.style.zIndex = '450'
      // 纯装饰层不接收指针事件：否则整块 canvas 会接住本该落到地图上的点击，
      // 玩家点海面出航就点不动了。
      pane.style.pointerEvents = 'none'
    }
    const pane = map.getPane(TERRAIN_PANE)
    if (!pane) return
    const paths = makePaths()

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;transition:opacity .12s linear;'
    canvas.setAttribute('aria-hidden', 'true')
    pane.appendChild(canvas)

    const draw = () => {
      rafRef.current = null
      const size = map.getSize()
      if (size.x === 0 || size.y === 0) return
      const dpr = window.devicePixelRatio || 1

      // 位图尺寸按 DPR 放大、CSS 尺寸按视口：否则 2 倍屏上符号发糊
      const bw = Math.round(size.x * dpr)
      const bh = Math.round(size.y * dpr)
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw
        canvas.height = bh
        canvas.style.width = `${size.x}px`
        canvas.style.height = `${size.y}px`
      }

      // 抵消 mapPane 的平移，把 canvas 钉在屏幕上（同 Leaflet 的 SVG overlay）
      const pos = L.DomUtil.getPosition(map.getPanes().mapPane as HTMLElement)
      canvas.style.left = `${-(pos?.x ?? 0)}px`
      canvas.style.top = `${-(pos?.y ?? 0)}px`

      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size.x, size.y)

      // zoom 分级：拉远只画 rank 小的那一部分。
      // 符号的世界坐标是 2.2 度一格，拉远时一屏能装下好几千个格子，
      // 全画会糊成一片色块；拉近时格子间距被拉开，才有必要全画。
      // 因为按 rank 过滤（而不是按数量截断），高低缩放下的符号是**嵌套**的：
      // 拉近后原地那些符号还在，只是周围多了新的，不会"山跟着跳"。
      const z = map.getZoom()
      const rankMax = z <= 2 ? 0.18 : z === 3 ? 0.3 : z === 4 ? 0.48 : z === 5 ? 0.68 : 1

      // 视口裁剪：数据里上万颗符号，一屏通常只有几百颗，
      // 剩下的连投影都不必算。
      const b = map.getBounds().pad(0.05)
      const south = b.getSouth()
      const north = b.getNorth()
      const west = b.getWest()
      const east = b.getEast()
      for (const s of symbols) {
        if (s.rank > rankMax) continue
        if (s.lat < south || s.lat > north) continue
        if (s.lng < west || s.lng > east) continue
        const p = map.latLngToContainerPoint([s.lat, s.lng])
        drawSymbol(ctx, paths, s, p.x, p.y)
      }
    }

    // move 在拖动过程中每帧触发一次，用 rAF 合并（一帧只画一次）
    const schedule = () => {
      if (rafRef.current != null) return
      rafRef.current = requestAnimationFrame(draw)
    }

    // zoom 动画期间 Leaflet 会对整个 mapPane 做 scale，canvas 作为子元素
    // 会被一起拉伸成一团糊。隐藏 250ms 比看糊图好（Leaflet 自己也隐藏 svg 层）。
    const hide = () => { canvas.style.opacity = '0' }
    const show = () => { canvas.style.opacity = '1'; schedule() }

    draw()
    map.on('move', schedule)
    map.on('moveend zoomend resize', schedule)
    map.on('zoomstart', hide)
    map.on('zoomend', show)

    return () => {
      map.off('move', schedule)
      map.off('moveend zoomend resize', schedule)
      map.off('zoomstart', hide)
      map.off('zoomend', show)
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      canvas.remove()
    }
  }, [map, symbols])

  return null
}
