import { Marker } from 'react-leaflet'
import L from 'leaflet'
import { useMemo } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { RELICS } from '@/data/relics'
import { relicMarkerHtml } from '@/utils/relicGlyph'

/**
 * 海上遗物：地图上可以直接拾起的历史/神话实物。
 *
 * 【为什么它和漂流物不一样】
 * 漂流物是"漂在水面上的日常物件"，会随天数漂走，三天就没了；
 * 遗物是**半埋在海里的旧物**——它一直在那儿，等着有人路过。
 * 所以：
 *   - 不随机生成（位置是固定的，见 data/relics.ts，每一件都在真实发生过事情的地方）；
 *   - 不漂走（拾走之后才从海图上消失，图鉴里替你记着）；
 *   - 视觉是静止的铜环，不是脉冲光晕（它不该看起来随时会被浪带走）。
 *
 * 【为什么放在 Marker 而不是绝对定位】
 * 与漂流物同理：遗物长期存在，玩家随时可能拖动地图，
 * 交给 Leaflet 的 Marker，位置天然跟着底图走。
 */
export default function SeaRelics() {
  const collected = useGameStore(s => s.collectedRelics)
  const collect = useGameStore(s => s.collectRelic)

  // divIcon 每次渲染都重建会很贵（每个 marker 一个 DOM），按 id 缓存
  const icons = useMemo(() => {
    const m = new Map<string, L.DivIcon>()
    for (const r of RELICS) {
      m.set(r.id, L.divIcon({
        className: 'relic-icon',
        html: relicMarkerHtml(r.kind, r.lore, r.id),
        /*
         * 容器 44×44 —— 图标本身 24px（视觉上就是半埋在海里的一件旧物），
         * 但**热区**按项目的手指点按下限来（与漂流物同一套规矩）：
         * 30px 的热区在 390 宽的手机上要精确戳中才有效。
         */
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      }))
    }
    return m
  }, [])

  const got = new Set(collected)

  return (
    <>
      {RELICS.filter(r => !got.has(r.id)).map(r => (
        <Marker
          key={r.id}
          position={[r.lat, r.lng]}
          icon={icons.get(r.id)!}
          // 拾取是"主动伸手"，所以用 pointer 光标明确它是可点的
          interactive
          eventHandlers={{ click: () => collect(r.id) }}
          title={`拾起：${r.name}`}
          // 压在玩家船（zIndexOffset=1000）之下，也压在漂流物之下：
          // 漂流物是"顺手捞的"，遗物是"专程去的"，后者不该被前者挤掉。
          zIndexOffset={-120}
        />
      ))}
    </>
  )
}
