import { useEffect, useMemo, useRef } from 'react'
import { Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { ports } from '@/data/ports'
import { routes } from '@/data/routes'
import { shipSprite } from '@/data/shipSprites'
import { getRouteGeometry } from '@/utils/routePath'
import { NPC_LEGS, NPC_SPEED_NM, npcLegAt, npcPose, type NpcShipKind } from '@/utils/npcShips'
import { wakeNmForScreen, wakePolyline } from '@/utils/shipWake'
import { pxPerNmAt } from '@/utils/mapScale'

/**
 * 2D 海图上的 NPC 商船（与 2.5D 用的是**同一个公式**）。
 *
 * 【为什么位置是"时刻的函数"而不是本地状态】两个视图各持一份里程状态，
 * 就会出现"同一条商船在两个视图里不在同一个地方"，切视图时船会跳过去。
 * `npcLegAt(total, speed, phase, nowMs)` 只依赖时刻，两边天然一致。
 *
 * 【为什么用 useEffect 逐帧改，而不是让 React 渲染】位置每帧都在变，
 * 走 state 会让整棵树 60fps 重渲染。这里只调 Leaflet 的 setLatLng 与
 * 一个内层 div 的 rotate —— 不进入 React 的渲染流程。
 *
 * 【为什么船头朝向要在内层 div 上转】Leaflet 自己用外层元素的
 * `transform: translate3d(...)` 定位 marker，我们再去改外层就会把定位打掉。
 */
/** 商船比玩家的船小：座舰必须一眼认出来 */
const NPC_SIZE = 46

export default function NpcShips2D() {
  const map = useMap()
  const markerRefs = useRef<(L.Marker | null)[]>([])
  const wakeRefs = useRef<(L.Polyline | null)[]>([])
  /**
   * 上次重画尾迹时，这艘船在屏幕上的位置（像素）。
   *
   * 【为什么必须节流】逐帧 `setLatLngs` 会让 SVG 每帧重绘路径 ——
   * 实测（无头 Edge，软件渲染）世界缩放下 **60.3 → 27.4 fps**（把尾迹
   * `display:none` 立刻回 60.3）。而商船在 world zoom 时每秒只移动 **1.7px**，
   * 60fps 里 58 帧都是白画。
   * 改成"屏幕上真的移动了 2px 以上才重画"：world zoom 约 1 次/秒，
   * 近岸 zoom 5 约 5 次/秒 —— 都够顺，代价降到可以忽略。
   */
  const lastPx = useRef<{ x: number; y: number }[]>([])

  /**
   * 每条腿的几何与初始相位，只算一次（航线几何是 A*，别每帧算）
   *
   * 【为什么挂载时算就一定是真值】
   * 航线弧长靠 A* 在海陆掩码上搜；掩码没到位时算出来的是**横穿陆地的大圆直线**。
   * 这里能放心「只算一次」，是因为 MapView 保证了
   * **地图内容在几何有结论之后才挂载**（见 MapView 的 mapReady 注释）。
   * 掩码到位前的那条直线几何根本不会进入这个组件——
   * 它一挂载就已经是避陆后的真值（实测 439 → 781 海里，第一条差 78%）。
   */
  const legs = useMemo(() => {
    const out: { geom: ReturnType<typeof getRouteGeometry>; phase0: number; kind: NpcShipKind }[] = []
    for (let i = 0; i < NPC_LEGS.length; i++) {
      const r = routes.find(x => x.id === NPC_LEGS[i].routeId)
      if (!r) continue
      const a = ports.find(p => p.id === r.fromPortId)
      const b = ports.find(p => p.id === r.toPortId)
      if (!a || !b) continue
      const geom = getRouteGeometry([a.latitude, a.longitude], [b.latitude, b.longitude])
      if (!(geom.totalNm > 0)) continue
      out.push({ geom, phase0: NPC_LEGS[i].phase0, kind: NPC_LEGS[i].kind })
    }
    return out
  }, [])

  /** 图标只建一次（每个商船一份，因为要各自旋转） */
  const icons = useMemo(
    () => legs.map((leg) => L.divIcon({
      className: 'npc-ship-icon',
      html: `<div class="npc-ship-rot" style="transform-origin:50% 50%"`
        // 把这条腿的**实际航程**挂在 DOM 上：e2e 要能读出
        // 「屏幕上这艘船走的是不是避陆后的那条路」。
        // 退化直线与大圆直线的里程差得很远（439 vs 781 海里），
        // 所以这个数字一变，就说明有人把航线几何换回了直线。
        + `" data-leg-nm="${Math.round(leg.geom.totalNm)}">`
        + `<img src="${shipSprite(leg.kind)}" alt="" draggable="false" `
        + `style="display:block;height:${NPC_SIZE}px;width:auto;opacity:0.92;`
        + `filter:drop-shadow(0 1px 3px rgba(0,0,0,0.45))" onerror="this.style.display='none'"/>`
        + `</div>`,
      iconSize: [NPC_SIZE, NPC_SIZE],
      iconAnchor: [NPC_SIZE / 2, NPC_SIZE / 2],
    })),
    [legs],
  )

  useEffect(() => {
    if (!legs.length) return
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const now = performance.now()
      for (let i = 0; i < legs.length; i++) {
        const m = markerRefs.current[i]
        if (!m) continue
        // npcLegAt 给"沿几何的里程 + 方向"，npcPose 把它翻成经纬度与罗盘方位 ——
        // 尾迹要用前者（posNm/sign），船图标用后者，所以两个都留着
        const st = npcLegAt(legs[i].geom.totalNm, NPC_SPEED_NM, legs[i].phase0, now)
        const pose = npcPose(legs[i].geom, st)
        m.setLatLng([pose.lat, pose.lng])
        // 船首朝上的素材 → CSS 顺时针正角 = 方位角，不减 90
        const rot = m.getElement()?.firstElementChild as HTMLElement | null
        if (rot) rot.style.transform = `rotate(${pose.bearing.toFixed(1)}deg)`
        /*
         * 尾迹：沿它**真正走过的折线**取身后 60 海里。
         * 位置与船位同源（同一个 positionAtNm），所以尾迹永远贴着航迹，
         * 转弯时也跟着折 —— 这正是贴图做不到的（见 utils/shipWake 的注释）。
         * 逐帧调 setLatLngs 而不是走 React state：3 艘船 × 60fps 重渲染整棵树不值得。
         */
        const w = wakeRefs.current[i]
        if (w) {
          const pt = map.latLngToContainerPoint([pose.lat, pose.lng])
          const prev = lastPx.current[i]
          if (!prev || Math.hypot(pt.x - prev.x, pt.y - prev.y) >= 2) {
            lastPx.current[i] = { x: pt.x, y: pt.y }
            w.setLatLngs(wakePolyline(legs[i].geom, st.posNm, st.sign, wakeNmForScreen(pxPerNmAt(map))))
          }
        }
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [legs, map])

  const initialWakes = useMemo(
    () => legs.map((leg) => {
      const st = npcLegAt(leg.geom.totalNm, NPC_SPEED_NM, leg.phase0, 0)
      return wakePolyline(leg.geom, st.posNm, st.sign)
    }),
    [legs],
  )

  if (!legs.length) return null
  return (
    <>
      {/* 尾迹画在商船**下面**（先后顺序 = 绘制顺序）：船要压在尾巴上 */}
      {legs.map((leg, i) => (
        <Polyline
          key={`npc-wake-${i}`}
          positions={initialWakes[i]}
          pathOptions={{ color: '#eaf5fb', weight: 2.4, opacity: 0.32, lineCap: 'round', lineJoin: 'round' }}
          interactive={false}
          ref={(l) => { wakeRefs.current[i] = l }}
        />
      ))}
      {legs.map((leg, i) => (
        <Marker
          key={`npc-${i}`}
          position={[leg.geom.from[0], leg.geom.from[1]]}
          icon={icons[i]}
          // 压在玩家船之下（玩家船 zIndexOffset=1000）：同屏时玩家要能一眼认出自己
          zIndexOffset={600}
          interactive={false}
          ref={(m) => { markerRefs.current[i] = m }}
        />
      ))}
      <style>{`.npc-ship-icon { background: none !important; border: none !important; }`}</style>
    </>
  )
}
