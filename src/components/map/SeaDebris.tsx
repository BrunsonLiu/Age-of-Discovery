import { Marker } from 'react-leaflet'
import L from 'leaflet'
import { useMemo } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { DEBRIS_INFO, type DebrisKind } from '@/data/debris'
import { debrisMarkerHtml } from '@/utils/debrisGlyph'

/**
 * 海面漂流物：地图上可以直接点的东西。
 *
 * 【为什么用 Marker + divIcon 而不是绝对定位】
 * 绝对定位要自己在每次 pan/zoom 时重算像素（海上异闻就是这么做的，因为它
 * 是全屏浮层、只在出现的那 8 秒里定位一次）。漂流物会**长期存在**，
 * 玩家随时可能拖动地图 —— 交给 Leaflet 的 Marker，位置天然跟着底图走，
 * 拖动时不会"漂移"。
 *
 * 【为什么要脉冲动画】海面本来就是一大片蓝，一个小木桶很容易被看漏。
 * 动的是"一小圈光"而不是整个物件，所以不吵。
 */

export default function SeaDebris() {
  const debris = useGameStore(s => s.debrisSpots)
  const collect = useGameStore(s => s.collectDebris)
  const isSailing = useGameStore(s => s.fleet.isSailing)

  // divIcon 每次渲染都重建会很贵（每个 marker 一个 DOM），按类型缓存
  const icons = useMemo(() => {
    const make = (kind: DebrisKind) => L.divIcon({
      className: 'debris-icon',
      html: debrisMarkerHtml(kind),
      /*
       * 容器 44×44 —— 图标本身仍然画 19px（视觉上就是个海面上的小物件），
       * 但**热区**按项目的手指点按下限来。
       * 30px 的热区在 390 宽的手机上要精确戳中才有效，玩家会点两三次才捞到，
       * 那正是"点了没反应"的手感来源。多出来的 14px 是透明的，不占视觉。
       */
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    })
    return {
      barrel: make('barrel'), crate: make('crate'),
      coins: make('coins'), bottle: make('bottle'),
    } as Record<DebrisKind, L.DivIcon>
  }, [])

  // 停泊时虽然不生成新的，但已有的仍可捞（不然玩家会对着屏幕上点不动的东西）
  if (!isSailing && debris.length === 0) return null

  return (
    <>
      {debris.map(d => (
        <Marker
          key={d.id}
          position={[d.lat, d.lng]}
          icon={icons[d.kind]}
          // 打捞是"主动伸手"，所以用 pointer 光标明确它是可点的
          interactive
          eventHandlers={{ click: () => collect(d.id) }}
          title={`打捞：${DEBRIS_INFO[d.kind].label}`}
          zIndexOffset={-100}
        />
      ))}
    </>
  )
}
