import { useEffect, useMemo, useRef } from 'react'
import { Marker } from 'react-leaflet'
import L from 'leaflet'
import { ports } from '@/data/ports'
import { routes } from '@/data/routes'
import { shipSprite } from '@/data/shipSprites'
import { getRouteGeometry } from '@/utils/routePath'
import { NPC_LEGS, NPC_SPEED_NM, npcLegAt, npcPose } from '@/utils/npcShips'

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
  const markerRefs = useRef<(L.Marker | null)[]>([])

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
    const out: { geom: ReturnType<typeof getRouteGeometry>; phase0: number }[] = []
    for (let i = 0; i < NPC_LEGS.length; i++) {
      const r = routes.find(x => x.id === NPC_LEGS[i].routeId)
      if (!r) continue
      const a = ports.find(p => p.id === r.fromPortId)
      const b = ports.find(p => p.id === r.toPortId)
      if (!a || !b) continue
      const geom = getRouteGeometry([a.latitude, a.longitude], [b.latitude, b.longitude])
      if (!(geom.totalNm > 0)) continue
      out.push({ geom, phase0: NPC_LEGS[i].phase0 })
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
        + `<img src="${shipSprite('caravel')}" alt="" draggable="false" `
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
        const pose = npcPose(legs[i].geom, npcLegAt(legs[i].geom.totalNm, NPC_SPEED_NM, legs[i].phase0, now))
        m.setLatLng([pose.lat, pose.lng])
        // 船首朝上的素材 → CSS 顺时针正角 = 方位角，不减 90
        const rot = m.getElement()?.firstElementChild as HTMLElement | null
        if (rot) rot.style.transform = `rotate(${pose.bearing.toFixed(1)}deg)`
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [legs])

  if (!legs.length) return null
  return (
    <>
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
