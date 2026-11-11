import { useEffect, useMemo, useState } from 'react'
import { Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { degreeLabel, graticuleValues, pickGraticuleStep } from '@/utils/graticule'

/**
 * 2D 海图的经纬网 + 边缘度数。
 *
 * 【图层顺序】网线挂在自建的 `graticulePane(z=340)`：**低于**等角线网(380)与
 * 陆地填充(400)，所以压在陆地上的那半截自动被盖住，只留海面部分 ——
 * 与等角线网同一套做法，比"逐条判断有没有穿过陆地"简单也不会漏。
 *
 * 【标签为什么要单独一个 pane】度数得压在所有东西上面（包括陆地与浅滩），
 * 但它又不能盖住港口标记（z=600）。所以给它 `graticuleLabelPane(z=520)`，
 * 正好夹在陆地与港口之间。两个 pane 都在渲染期用 useMemo 建好 ——
 * 放进 useEffect 会重演等角线网那次 `Cannot read properties of undefined
 * (reading '_removePath')`（子组件的 Polyline 在父组件渲染时就已创建）。
 */
/*
 * 【pane 名故意不带 "Pane" 字样】Leaflet 建 pane 时执行
 * `'leaflet-' + name.replace('Pane','') + '-pane'` —— 名字里只要有 "Pane"
 * 就会被切掉，得到 `leaflet-graticule-pane` 这类对不上号的类名。
 * 第一版叫 `graticuleLabelPane`，实际类名是 `leaflet-graticuleLabel-pane`，
 * 探针按 `.leaflet-graticule-label-pane` 找 pane 一直找不到（量了个寂寞）。
 */
const GRID_PANE = 'graticule'
const LABEL_PANE = 'graticuleLabels'

/**
 * 边缘标签的落点（像素，容器坐标）。单位是「离容器左上角多远」。
 *
 * 【这些数是量出来的，不是猜的】1440×900 实测（`.workbuddy` 探针）：
 *   · 顶部木梁       y 0..48      → 标签不能落在里面
 *   · 底栏           y 849..900
 *   · 左侧按钮列     x 0..92（按钮本体在 10..90）
 *   · 右侧按钮列     x 1320..1440
 *   · 迷你海图       x 1260..1428 / y 96..200
 *   · 比例尺         x 1294..1428 / y 747..808
 *   · 顶部航线提示   x 105..480   / y 42..93（含「看航路」按钮）
 *
 * 所以：
 *  · **纬度标签贴左边**，x=100 —— 按钮列右缘之外；
 *  · **经度标签贴下边**，y = 底栏上沿再上 20px —— 整条底部横带是空的
 *    （顶带被航线提示与 3D 按钮占着，塞不下）。
 *
 * 【已知遮挡（如实记录）】左下角的「掮客送来一单」卡片是 `absolute left-3 bottom-16`，
 * 在 900px 高的画面上占 y 700..880，会把落在那一带的纬度标签**盖住**（卡片不透明，
 * 不是半个字露在外面）。那张卡是临时行动提示、可点掉，为它把整列标签右移会让
 * 度数跑到海图中央，所以不挪。
 *
 * 试过又撤掉的做法：用 `document.elementFromPoint` 判"这一格被界面挡住就不画"。
 * 地图只在 moveend/zoomend 重算网格，而卡片出现/消失**不触发地图事件** ——
 * 结果标签会一直缺到玩家拖动地图为止（e2e 里因此剩 0 个纬度标签）。
 * 要做对得订阅卡片状态或加 MutationObserver，收益不值这个复杂度。
 */
const LAT_LABEL_X = 100
/* 底栏高 52px，经度标签再往上让 20px ⇒ 距容器底 72px */
const LNG_LABEL_BOTTOM_INSET = 72
/* 纬度标签避开顶部木梁（48）与底栏（52）：上下各让出一点，字不压在木头下 */
const LABEL_EDGE_TOP = 56
const LABEL_EDGE_BOTTOM = 62

interface GridLine {
  /** 纬度线还是经度线：决定标签往哪个方向对齐 */
  kind: 'lat' | 'lng'
  /** 标签文字 */
  label: string
  /** 折线端点（[lat, lng]） */
  points: [number, number][]
  /** 标签锚点（容器坐标 → 已转成经纬度） */
  at: L.LatLng
  /** 赤道：线粗一点、字亮一点 */
  major: boolean
}

function labelIcon(kind: 'lat' | 'lng', text: string, major: boolean) {
  /*
   * 用 divIcon + transform 对齐：lat 的标签要在**竖直方向居中**于线上
   * （translateY(-50%)），lng 的要**水平居中**（translateX(-50%)）。
   * 不用 iconAnchor 是因为 iconSize 给的是 [0,0]，锚点在图标左上角，
   * 想让文字骑在线中间只能靠 transform。
   */
  const shift = kind === 'lat' ? 'translateY(-50%)' : 'translateX(-50%)'
  const html = `<span style="display:inline-block;transform:${shift};
    font-family:var(--font-serif, Georgia, serif);font-size:12px;line-height:1;
    letter-spacing:0.08em;white-space:nowrap;
    color:${major ? '#e8dcc0' : '#c3d7e4'};opacity:${major ? 0.95 : 0.8};
    text-shadow:0 0 3px rgba(6,18,26,0.9),0 1px 2px rgba(6,18,26,0.8);
    padding:2px 3px;">${text}</span>`
  return L.divIcon({ html, className: 'grat-label', iconSize: [0, 0], iconAnchor: [0, 0] })
}

/** 算一次网格：步长、每条线的端点、每个标签的锚点 */
function buildGrid(map: L.Map): GridLine[] {
  const size = map.getSize()
  if (size.x < 40 || size.y < 40) return []
  const c = map.getCenter()
  const b0 = map.getBounds()
  /*
   * 【步长要按"离赤道最近的那条边"量，不是按中心量】
   *
   * 我第一版写的是"墨卡托里纬度每 1 度的像素恒定，量中心就够"—— **这是错的**。
   * 墨卡托正是为了把经线拉成平行线才按 sec φ 纵向拉伸：1 度纬度的像素随 |φ|
   * 增大。实测（1440×900，zoom 5）45°N→40°N 是 **30.8px/度**，而 20°N→25°N
   * 只有 **24.6px/度**（比值 1.25 ≈ sec45/sec22），同一屏里的间距能差两成。
   *
   * 于是取中心量会把步长选得偏细：靠赤道那一半的字会挤在一起。
   * 正确的取法是量**全屏最密的那一处**，也就是纬度绝对值最小的那条边 ——
   * 那里的 px/度 最小，按它挑步长，整屏都不会挤。
   */
  const sEdge = Math.max(-84, b0.getSouth())
  const nEdge = Math.min(84, b0.getNorth())
  const nearEq = Math.abs(sEdge) <= Math.abs(nEdge) ? sEdge : nEdge
  const y0 = map.latLngToContainerPoint([nearEq, c.lng]).y
  const y1 = map.latLngToContainerPoint([nearEq + 1, c.lng]).y
  const pxPerDeg = Math.abs(y0 - y1)
  const step = pickGraticuleStep(pxPerDeg)
  if (step <= 0) return []

  const b = map.getBounds()
  // 端点各外扩 6°：线不要正好停在画面边上（会露出一个"线头"）
  const west = Math.max(-180, b.getWest() - 6)
  const east = Math.min(180, b.getEast() + 6)
  const south = Math.max(-85, b.getSouth() - 6)
  const north = Math.min(85, b.getNorth() + 6)
  if (!(east > west) || !(north > south)) return []

  const out: GridLine[] = []
  const lngLabelY = size.y - LNG_LABEL_BOTTOM_INSET

  for (const lat of graticuleValues(south, north, step)) {
    const y = map.latLngToContainerPoint([lat, c.lng]).y
    // 被木梁盖住的（画面最上/最下）不放字
    if (y < LABEL_EDGE_TOP || y > size.y - LABEL_EDGE_BOTTOM) continue
    const major = lat === 0
    out.push({
      kind: 'lat',
      label: major ? '赤道' : degreeLabel('lat', lat),
      points: [[lat, west], [lat, east]],
      at: map.containerPointToLatLng(L.point(LAT_LABEL_X, y)),
      major,
    })
  }

  for (const lng of graticuleValues(west, east, step)) {
    const x = map.latLngToContainerPoint([c.lat, lng]).x
    /*
     * 线画到画面外没关系（外扩 6°），但**标签不画**：
     *  · 出画面的会被容器裁掉（首轮实测 45°W 落在 x=-99、25°E 落在 x=1494）；
     *  · 左侧按钮列占 x 0..92，贴边放字既挤又容易被压住。
     * 所以两端各让 96px —— 与纬度标签的 x 对齐，一排字有共同的起点。
     */
    if (x < 96 || x > size.x - 96) continue
    const major = lng === 0
    out.push({
      kind: 'lng',
      label: degreeLabel('lng', lng),
      points: [[south, lng], [north, lng]],
      at: map.containerPointToLatLng(L.point(x, lngLabelY)),
      major,
    })
  }
  return out
}

export function Graticule() {
  const map = useMap()
  const [tick, setTick] = useState(0)

  const panesReady = useMemo(() => {
    if (!map.getPane(GRID_PANE)) {
      const pane = map.createPane(GRID_PANE)
      pane.style.zIndex = '340'
      // 装饰层不接指针事件；否则"点海面出航"会被一张网挡住
      pane.style.pointerEvents = 'none'
    }
    if (!map.getPane(LABEL_PANE)) {
      const pane = map.createPane(LABEL_PANE)
      pane.style.zIndex = '520'
      pane.style.pointerEvents = 'none'
    }
    return true
  }, [map])

  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    map.on('moveend', bump)
    map.on('zoomend', bump)
    map.on('resize', bump)
    bump()
    return () => {
      map.off('moveend', bump)
      map.off('zoomend', bump)
      map.off('resize', bump)
    }
  }, [map])

  /*
   * `tick` 是**重算触发器**（moveend/zoomend 时 +1），不是被读的值 ——
   * 地图对象自己的状态变了不会让 React 重渲染，必须靠这个计数把
   * useMemo 顶开。所以 eslint 的「多余依赖」在这里是误报。
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick 是重算触发器
  const grid = useMemo(() => (panesReady ? buildGrid(map) : []), [map, panesReady, tick])

  if (!panesReady || grid.length === 0) return null

  return (
    <>
      {grid.map((g) => (
        <Polyline
          key={`grat-${g.label}-${g.points[0][0]}-${g.points[0][1]}`}
          positions={g.points}
          pane={GRID_PANE}
          pathOptions={{
            /*
             * 颜色/透明度是**量出来的**，不是调出来的：
             *
             * 第一版用虚线 0.17：沿 40°N 在开阔海面取 14 个点，比上下各 3px 的
             * 背景亮/暗多少 —— 三通道合计平均只差 **9.5 级**（≈3/通道），而海面
             * 纹理自己的起伏就有 ±10 级。也就是说线一直在画，却完全读不出来，
             * 只剩左边一排"指向虚空的数字"（截图确认）。
             *
             * 改成实线 0.28：虚线在这里还有个坏处 —— 画面上已经有四种虚线
             * （风带、洋流、海盗区、候选航线），再来一种就只是"又一条虚线"；
             * 实线才是"网格"这个语义。
             */
            color: g.major ? '#b6d4e6' : '#9dc2d8',
            weight: g.major ? 1.5 : 1,
            opacity: g.major ? 0.46 : 0.28,
            interactive: false,
          }}
        />
      ))}
      {grid.map((g) => (
        <Marker
          key={`grat-lbl-${g.label}-${g.at.lat.toFixed(3)}-${g.at.lng.toFixed(3)}`}
          position={g.at}
          icon={labelIcon(g.kind, g.label, g.major)}
          pane={LABEL_PANE}
          interactive={false}
          keyboard={false}
          zIndexOffset={0}
        />
      ))}
      <style>{`
        .grat-label { background: none !important; border: none !important; }
        /* 标签不吃点击（pane 已经关掉了，这里再兜一层：有些浏览器对 pane 的
           pointerEvents 继承处理不一致） */
        .grat-label, .grat-label * { pointer-events: none !important; }
      `}</style>
    </>
  )
}

export default Graticule
