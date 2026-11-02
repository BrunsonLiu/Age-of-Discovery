import { useEffect, useMemo, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { buildTerrainSymbols, hasSnow, rankMaxForZoom, type TerrainSymbol } from '@/utils/terrainDecor'
import { loadElevationSampler, type ElevationSampler } from '@/utils/elevation'

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

/**
 * 位置哈希 → 0~1。用于让"这座山有没有肩峰、在左还是在右"只取决于它自己的经纬度，
 * 而不消耗全局随机序列（团簇那次踩过：随机数消耗顺序一变，后面所有点整体错位）。
 */
function hash01(lat: number, lng: number): number {
  const v = Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453
  return v - Math.floor(v)
}

/** 画一座山。snow=true 才画雪顶——不是每座山都该有雪 */
function drawPeakAt(
  ctx: CanvasRenderingContext2D,
  paths: ReturnType<typeof makePaths>,
  x: number,
  y: number,
  scale: number,
  snow: boolean,
  faded = false,
) {
  // 锚点在底边中心：把局部坐标 (13,18) 对齐到 (x,y)
  ctx.save()
  ctx.translate(x - 13 * scale, y - 18 * scale)
  ctx.scale(scale, scale)

  // 肩峰整体后退一档：更淡、描边更细，读作"后面那座矮一点的山"
  ctx.fillStyle = faded ? 'rgba(146,116,72,0.66)' : 'rgba(138,106,62,0.72)'
  ctx.strokeStyle = faded ? 'rgba(63,44,20,0.60)' : 'rgba(63,44,20,0.75)'
  ctx.lineWidth = faded ? 0.8 : 1
  ctx.lineJoin = 'round'
  ctx.fill(paths.peakBody)
  ctx.stroke(paths.peakBody)

  ctx.fillStyle = faded ? 'rgba(63,44,20,0.24)' : 'rgba(63,44,20,0.34)'
  ctx.fill(paths.peakShade)

  if (snow) {
    ctx.fillStyle = 'rgba(247,240,216,0.75)'
    ctx.fill(paths.peakSnow)
  }

  ctx.restore()
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
    /*
     * 雪线：只有高纬（|lat| ≥ 48）才有雪顶。
     *
     * 【原来每座山都戴雪帽】`ctx.fill(paths.peakSnow)` 是**无条件**执行的，
     * 于是撒哈拉、阿拉伯半岛、印度的山尖上全是一撮白——5 倍放大下一眼就能看见，
     * 而且它是"事实错误"而不只是不好看：热带石灰岩山不该有永久积雪。
     * 雪线取 48°：阿尔卑斯（46~48）刚好在边缘、斯堪的纳维亚与北美北部有雪，
     * 地中海沿岸以南一律没有。
     */
    const snow = hasSnow(s.lat)

    /*
     * 肩峰：让山成"脉"而不是一堆孤立三角。
     *
     * 原来每座山都是一个等大的三角形，撒满整块陆地之后像图钉。
     * 手绘古地图上的山脉是**一组高低错落的三角**挤在一条脊线上。
     * 偏移必须够大：主峰底边 22 宽（半宽 11），肩峰缩到 0.62 后半宽只有 6.8——
     * 中心偏移小于 11 的话，肩峰会整块躲进主峰的范围里，
     * 只剩一条 5px 的边露在外面（第一版给 8.6，等于没画）。现在给 14.5。
     * 这里按位置哈希决定是否在大山旁边补 1~2 座小峰：小的先画（在后面）、
     * 偏一点底边、更淡更细，于是成组的山读作"一道山脊"。
     * 用 hash01 而不是随机数：符号的绘制顺序会随 zoom 变（rank 阈值筛掉一部分），
     * 一旦在这里消耗全局随机，同一个位置的山在不同缩放下会长得不一样。
     */
    const h = hash01(s.lat, s.lng)
    const shoulders = h > 0.78 ? 2 : h > 0.40 ? 1 : 0
    const side = hash01(s.lng, s.lat) > 0.5 ? 1 : -1
    for (let i = 0; i < shoulders; i++) {
      const dir = i === 0 ? side : -side
      const mag = i === 0 ? 1 : 0.78
      drawPeakAt(
        ctx,
        paths,
        x + dir * 14.5 * scale * mag,
        y + 2.2 * scale,
        scale * (i === 0 ? 0.62 : 0.52),
        snow,
        true,
      )
    }

    drawPeakAt(ctx, paths, x, y, scale, snow)
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

  /*
   * 高程采样器：决定"山画在哪里"。
   *
   * 【为什么要等它】符号一旦生成就是固定的世界坐标，先按随机画一遍、等高程到了
   * 再重画一遍，屏幕上会看到整片山"跳"一次。高程图只有 394KB，等它比看它跳好。
   * 加载失败（离线/资源 404）就退回不看高程的旧行为——不能让地形整层消失。
   */
  const [elev, setElev] = useState<{ ready: boolean; fn: ElevationSampler | null }>({ ready: false, fn: null })
  useEffect(() => {
    let alive = true
    loadElevationSampler(`${import.meta.env.BASE_URL}data/elev-map.png`).then((fn) => {
      if (alive) setElev({ ready: true, fn })
    })
    return () => { alive = false }
  }, [])

  const symbols = useMemo(
    () => (elev.ready ? buildTerrainSymbols(geojson, { elevationAt: elev.fn ?? undefined }) : []),
    [geojson, elev],
  )
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

      // zoom 分级：拉远只画 rank 小的那一部分，拉近逐层放出来。
      // 阈值表挪到 utils（`rankMaxForZoom`）—— 它是纯逻辑，可以单测
      // "必须随缩放单调不减"和"放大后确实更密"，比埋在这里的魔法数字可靠。
      const rankMax = rankMaxForZoom(map.getZoom())

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
