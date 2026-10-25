import { useMemo, useEffect, useRef } from 'react'
import { Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useGameStore } from '@/store/useGameStore'
import { ports } from '@/data/ports'
import { calculateBearing } from '@/utils/navigation'
import { shipSprite } from '@/data/shipSprites'
import { FX_ASSETS } from '@/data/envAssets'

const ICON_BOX = 90 // 图标盒尺寸（精灵纵向上溢出盒体，视觉更挺拔）

/**
 * 精灵图里船首指向的方位角（度）。
 *
 * 素材是"正北朝上（俯视，船首指向图像上方）"，而方位角 0° = 正北、
 * 顺时针增大（正东 90°）。CSS rotate() 同样是顺时针为正，
 * 所以船首朝上的图只需要 rotate(bearing)，**不能再减 90**。
 *
 * 之前写的是 bearing - 90（那是"船首朝右"的图才需要的补偿），
 * 结果船永远朝目标方向偏 90°：向正东航行的船看起来在往北走。
 * 参见 src/data/shipSprites.ts 顶部注释"船艏朝上（正北）"。
 */
const SPRITE_HEADING_DEG = 0

function createShipIcon(sailing: boolean, bearing: number, shipType: string) {
  const rotation = sailing ? bearing - SPRITE_HEADING_DEG : 0
  const sprite = shipSprite(shipType)

  /**
   * 旋转必须放在**外层容器**上，摇摆动画放在**内层 img** 上。
   *
   * 原来两者都在 img 的 transform 里，而 @keyframes shipSway 里的 transform
   * 会**整体覆盖**内联 transform —— 航行中船不但不转向，
   * 连 translate(-50%,-50%) 的居中也没了（图标整个偏移）。
   * 拆成两层后：外层负责"朝哪转"，内层负责"怎么晃"，互不干扰。
   */
  const shipImg = `
    <img src="${sprite}" alt="" draggable="false"
      style="position:relative;display:block;height:84px;width:auto;${sailing ? 'animation:shipSway 3s ease-in-out infinite;' : ''}filter:drop-shadow(0 2px 6px rgba(0,0,0,0.55));"
      onerror="this.style.display='none'"/>
  `

  /**
   * 船尾浪：贴图精灵（第 4 批 fx_bow_wave.png）。
   *
   * 原来这里是 4 个 rgba(100,180,255) 的 CSS 圆点 —— 一眼假，
   * 且圆点是"横排一行"，与船首分波的物理形态完全不符。
   *
   * 贴图对齐的三个关键点：
   * 1) **V 尖朝上**：素材的 V 口在图像顶部（bbox 顶部 8.8% 处是浪尖），
   *    所以 top 取负值，让浪尖落在船首略上方 —— 水是被船艏"推开"的，
   *    浪尖必须出现在艏柱位置，不能出现在船尾。
   * 2) **画在船下面**：浪 img 在 DOM 里位于 shipImg 之前且用 absolute，
   *    船是 relative，按绘制顺序船身压在浪上 —— 否则白色浪花会糊住船体。
   * 3) **随船一起转**：浪在旋转容器内部，船转向时浪花跟着转
   *    （这正是上一轮修"船东走浪花还朝下"的同一处）。
   *
   * 尺寸：118px 宽 ≈ 船身长（84px）的 1.4 倍，V 张开度约 76px，
   * 与船长比例接近真实 wake（艉流宽度通常略大于船长）。
   */
  const wakeHtml = sailing ? `
    <img src="${FX_ASSETS.bowWave}" alt="" draggable="false"
      style="position:absolute;left:50%;top:-16px;transform:translateX(-50%);
             width:118px;height:auto;opacity:0.92;pointer-events:none;
             animation:wakeDrift 2.6s ease-in-out infinite;"
      onerror="this.style.display='none'"/>
  ` : ''

  const pulseRings = sailing ? `
    <div style="position:absolute;width:90px;height:90px;left:0px;top:0px;border-radius:50%;border:2px solid rgba(212,168,56,0.4);animation:shipPulse 2.5s ease-in-out infinite;"></div>
    <div style="position:absolute;width:110px;height:110px;left:-10px;top:-10px;border-radius:50%;border:1.5px solid rgba(212,168,56,0.2);animation:shipPulse 2.5s ease-in-out infinite 0.6s;"></div>
  ` : `
    <div style="position:absolute;width:84px;height:84px;left:3px;top:3px;border-radius:50%;border:1.5px solid rgba(212,168,56,0.25);"></div>
  `

  const html = `
    <div style="position:relative;width:${ICON_BOX}px;height:${ICON_BOX}px;">
      ${pulseRings}
      <div data-tut="ship" style="position:absolute;inset:0;">
        <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) rotate(${rotation}deg);transform-origin:center;width:84px;display:flex;flex-direction:column;align-items:center;">
          ${wakeHtml}
          ${shipImg}
        </div>
      </div>
    </div>
  `

  return L.divIcon({ html, className: 'ship-marker-icon', iconSize: [ICON_BOX, ICON_BOX], iconAnchor: [ICON_BOX / 2, ICON_BOX / 2] })
}

function ShipCameraFollow({ position }: { position: [number, number] | null }) {
  const map = useMap()
  const isSailing = useGameStore(s => s.fleet.isSailing)
  const prevSailingRef = useRef(false)

  useEffect(() => {
    // 地图初始化早期 map.getZoom() 可能为 NaN，或地图尚未就绪，
    // 直接 flyTo 会抛 "Invalid LatLng object" 白屏，因此必须逐项校验。
    if (!position || !isFinite(position[0]) || !isFinite(position[1])) return
    if (prevSailingRef.current || !isSailing) {
      prevSailingRef.current = isSailing
      return
    }
    const zoom = map.getZoom()
    // zoom 无效说明地图还没就绪：保持 ref 未置位，等下一次 effect 重试
    if (!isFinite(zoom)) return
    try {
      map.flyTo(position, zoom, { duration: 1.5 })
      prevSailingRef.current = true
    } catch {
      // 地图尚未就绪时忽略，等待下一次 effect 重试
    }
  }, [isSailing, map, position])

  return null
}

export function ShipAnimation() {
  const fleet = useGameStore(s => s.fleet)
  const shipPosition = useGameStore(s => s.shipPosition)
  const waypoint = useGameStore(s => s.waypoint)

  const portMap = useMemo(() => new Map(ports.map(p => [p.id, p])), [])

  const position = useMemo((): [number, number] | null => {
    if (shipPosition && isFinite(shipPosition[0]) && isFinite(shipPosition[1])) {
      return shipPosition
    }
    if (fleet.currentPortId) {
      const port = portMap.get(fleet.currentPortId)
      if (port) return [port.latitude, port.longitude]
    }
    const fallback = portMap.get(6)
    if (fallback) return [fallback.latitude, fallback.longitude]
    return null
  }, [shipPosition, fleet.currentPortId, portMap])

  const bearing = useMemo(() => {
    if (fleet.isSailing && position && waypoint) {
      return calculateBearing(position[0], position[1], waypoint.latitude, waypoint.longitude)
    }
    return 0
  }, [fleet.isSailing, position, waypoint])

  // 地图上显示旗舰的精绘精灵（按船型选图）
  const shipType = useMemo(() => {
    const flagship = fleet.ships.find(s => s.id === fleet.flagshipId) || fleet.ships[0]
    return flagship?.type || 'galleon'
  }, [fleet.ships, fleet.flagshipId])

  if (!position || !isFinite(position[0]) || !isFinite(position[1])) return null

  // dev 调试钩子：让无头浏览器实测能读到地图上的实际船头朝向
  // 生产构建会被 tree-shake 掉（import.meta.env.DEV 为 false）
  if (import.meta.env?.DEV) {
    ;(window as unknown as { __ship?: unknown }).__ship = {
      bearing,
      rotation: fleet.isSailing ? bearing - SPRITE_HEADING_DEG : 0,
      position,
      sailing: fleet.isSailing,
    }
  }

  return (
    <>
      <ShipCameraFollow position={position} />
      <Marker position={position} icon={createShipIcon(fleet.isSailing, bearing, shipType)} zIndexOffset={1000} />
      <style>{`
        .ship-marker-icon { background: none !important; border: none !important; }
        @keyframes shipPulse { 0%, 100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.3); opacity: 0.1; } }
        @keyframes shipSway { 0%, 100% { transform: rotate(0deg) translateY(0px); } 25% { transform: rotate(0.5deg) translateY(-2px); } 75% { transform: rotate(-0.5deg) translateY(1px); } }
        @keyframes wakeDrift { 0%, 100% { opacity: 0.78; transform: translateX(-50%) scale(1); } 50% { opacity: 1; transform: translateX(-50%) scale(1.03); } }
      `}</style>
    </>
  )
}
