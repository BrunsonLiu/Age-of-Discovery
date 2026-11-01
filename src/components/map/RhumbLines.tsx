import { useMemo } from 'react'
import { Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { buildRhumbNetwork, RHUMB_CENTERS } from '@/utils/rhumbLines'

/**
 * 等角航线网。挂在自定义 rhumbPane(z=380)：
 * **低于** overlayPane(400) 的陆地填充，于是压到陆地上的那半截自动被盖住，
 * 只留海面上的部分——这比"逐条线判断有没有穿过陆地"简单得多，也不会漏。
 */
const RHUMB_PANE = 'rhumbPane'

/**
 * 三圈由近及远的透明度。
 *
 * 【为什么分圈、但档差必须很小】
 * 单条射线通篇同一透明度，末端就是一个硬切；分圈可以让远端淡下去。
 * 但第一版用了 0.10 / 0.07 / 0.04，档差太大：4 倍放大下每条射线的**圈界**
 * 都会露出一道亮度台阶，读起来像"线在中间折了一下"。几何其实完全共线
 * （实测偏离 1.8e-15），那个折角纯粹是透明度的硬跳变造成的错觉。
 * 现在三档只差 0.01~0.013，淡出还在，台阶看不出来了。
 *
 * 【为什么整体这么低】航线网是**底纹**，上面还压着海岸、港口、航路、船。
 */
const BAND_OPACITY = [0.125, 0.11, 0.092]

/**
 * 罗经玫瑰：航线网的**汇聚点**。
 *
 * 【为什么非要有它】没有玫瑰时，那一束射线在屏幕上只是几根斜线，
 * 看起来像划痕或者贴图噪点——因为看不出它们"从哪儿来"。加上玫瑰之后，
 * 眼睛会自动把线读成"从罗经点量出去的方位线"，整片海立刻成了海图。
 * 这是波托兰海图的构图逻辑：先有罗经点，才有线网。
 *
 * 用 divIcon + transform 居中：玫瑰必须骑在经纬点上，
 * 偏半个图标，那些"量出来的方位"在视觉上就不成立了。
 */
function roseIcon() {
  const S = 124
  const c = S / 2
  // 16 方位星：长短交替，长的到 r=44、短的到 r=30
  let star = ''
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 === 0 ? 58 : 40
    star += `${i === 0 ? 'M' : 'L'}${(c + Math.cos(a) * r).toFixed(2)},${(c + Math.sin(a) * r).toFixed(2)} `
  }
  star += 'Z'

  const html = `<div style="transform:translate(-50%,-50%)">
    <svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${c}" cy="${c}" r="60" fill="none" stroke="#a8c6dc" stroke-width="1" opacity="0.55" />
      <circle cx="${c}" cy="${c}" r="55" fill="none" stroke="#a8c6dc" stroke-width="0.6" opacity="0.32" />
      <path d="${star}" fill="#a8c6dc" fill-opacity="0.10" stroke="#a8c6dc" stroke-width="0.7" opacity="0.55" />
      <circle cx="${c}" cy="${c}" r="3.2" fill="none" stroke="#a8c6dc" stroke-width="0.9" opacity="0.7" />
    </svg>
  </div>`

  return L.divIcon({ html, className: 'rhumb-rose-icon', iconSize: [0, 0], iconAnchor: [0, 0] })
}

export default function RhumbLines() {
  const map = useMap()

  /*
   * 【必须在渲染期就把 pane 建好，不能放进 useEffect】
   * 第一版在 useEffect 里 createPane，结果整张地图崩在
   * `Cannot read properties of undefined (reading '_removePath')`：
   * 子组件的 Polyline 在**父组件渲染时**就创建了，那时 pane 还不存在，
   * Leaflet 拿不到这个 pane 的 renderer，等到卸载/重绘时就报 _removePath。
   * useMemo 在渲染期间同步执行、且早于子元素创建，正好卡在这个顺序上。
   * 阻塞点写在这里，免得以后有人"顺手把它挪回 effect 里更干净"。
   */
  const paneReady = useMemo(() => {
    if (!map.getPane(RHUMB_PANE)) {
      const pane = map.createPane(RHUMB_PANE)
      pane.style.zIndex = '380'
      // 装饰层不接指针事件，否则会挡住"点海面出航"
      pane.style.pointerEvents = 'none'
    }
    return !!map.getPane(RHUMB_PANE)
  }, [map])

  const rings = useMemo(() => RHUMB_CENTERS.map((c) => buildRhumbNetwork(c)), [])
  const icon = useMemo(() => roseIcon(), [])

  if (!paneReady) return null

  return (
    <>
      {rings.map((bandList, ci) =>
        bandList.map((ring, bi) => (
          <Polyline
            key={`rhumb-${ci}-${bi}`}
            positions={ring}
            pane={RHUMB_PANE}
            interactive={false}
            pathOptions={{
              color: '#9fc0d8',
              weight: 1,
              opacity: BAND_OPACITY[bi] ?? 0.072,
              // 长方形接头会在交叉点堆出深色小结，圆接头才像锉出来的刻线
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        )),
      )}
      {RHUMB_CENTERS.map((c, i) => (
        <Marker key={`rose-${i}`} position={c} icon={icon} interactive={false} />
      ))}
      <style>{`
        .rhumb-rose-icon { background: none !important; border: none !important; }
      `}</style>
    </>
  )
}
