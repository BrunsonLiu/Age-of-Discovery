import { Marker } from 'react-leaflet'
import L from 'leaflet'
import { useMemo } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { DEBRIS_INFO, type DebrisKind } from '@/data/debris'

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

/**
 * 四种漂流物各画一个**闭合**剪影。
 *
 * 【为什么必须是闭合路径】第一版用的是"线描"写法（一条条 M/h 线段），
 * 放大 6 倍看就是四个发光的线框图标，浮在海面上像 UI 控件而不像物件。
 * 给它们加 `fill` 也没用 —— 开放的路径没有面积可填。
 * 现在主体一律是 rect / ellipse / 闭合 path，细节线单独用细描边画，
 * 于是它读起来是"一个泡在水里的东西"。
 */
function glyph(kind: DebrisKind): string {
  const base = 'fill="currentColor" fill-opacity="0.55" stroke="currentColor" stroke-width="1.5"'
  const detail = 'fill="none" stroke="currentColor" stroke-width="1.1" stroke-opacity="0.85"'
  switch (kind) {
    case 'barrel':
      return `<svg viewBox="0 0 24 24"><rect x="6" y="5" width="12" height="14" rx="4.5" ${base}/><path d="M6.4 10.5h11.2M6.4 13.5h11.2" ${detail}/></svg>`
    case 'crate':
      return `<svg viewBox="0 0 24 24"><rect x="4.5" y="6.5" width="15" height="11" rx="1" ${base}/><path d="M4.5 10.5h15M9.5 6.5v11" ${detail}/></svg>`
    case 'coins':
      return `<svg viewBox="0 0 24 24"><ellipse cx="12" cy="15" rx="7" ry="3.2" ${base}/><ellipse cx="12" cy="9.5" rx="7" ry="3.2" fill="currentColor" fill-opacity="0.75" stroke="currentColor" stroke-width="1.3"/></svg>`
    case 'bottle':
      return `<svg viewBox="0 0 24 24"><path d="M10 3.5h4v2.6l2 4.2v8.4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8.4l2-4.2z" ${base}/><path d="M9 14.5h6" ${detail}/></svg>`
  }
}

export default function SeaDebris() {
  const debris = useGameStore(s => s.debrisSpots)
  const collect = useGameStore(s => s.collectDebris)
  const isSailing = useGameStore(s => s.fleet.isSailing)

  // divIcon 每次渲染都重建会很贵（每个 marker 一个 DOM），按类型缓存
  const icons = useMemo(() => {
    const make = (kind: DebrisKind) => L.divIcon({
      className: 'debris-icon',
      html: `<div class="debris-ring"></div><div class="debris-wake"></div><div class="debris-glyph" style="color:#f0dfb4">${glyph(kind)}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
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
