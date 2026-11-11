import { useMemo } from 'react'
import { Marker } from 'react-leaflet'
import L from 'leaflet'
import { useGameStore } from '@/store/useGameStore'
import { legendPending } from '@/data/nations'

/**
 * 传说海域：开局国别对应的那一个神话坐标（见 `data/nations` 的 legend）。
 *
 * 【为什么必须画在海图上】用户的方向很明确：神话要靠**机制 / 地图实物**落地，
 * 不许堆文字。只在开场说一句"听说西边有个岛"，那仍然是文案；
 * 图上要有东西——一个金色的小圈，标着名字，你敢朝它开过去。
 *
 * 【为什么不能点】它不是遗物，不需要"够得着才结算"这一层：
 * 传说是**一片海**，不是一件东西。判定在日结算里做（开进 90 海里就兑现），
 * 所以这里 `interactive: false` —— 压在图上不吃点击（项目硬规矩）。
 *
 * 【为什么只在你自己的国别下出现】`legendPending` 读 `state.nation`：
 * 英格兰船长在好望角不会遇见飞行的荷兰人——那是荷兰人的海。
 * 兑现之后（进 `collectedLegends`）这个点就从图上消失：传说只发生一次。
 */
export default function NationLegend() {
  const nation = useGameStore(s => s.nation)
  const collected = useGameStore(s => s.collectedLegends)
  const legend = legendPending(nation, collected ?? [])

  const icon = useMemo(() => {
    if (!legend) return null
    const html = `<div class="legend-mark">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <circle cx="13" cy="13" r="10" fill="none" stroke="#e0c489" stroke-width="1"
          stroke-dasharray="3 3" opacity="0.75" />
        <circle cx="13" cy="13" r="3.2" fill="none" stroke="#e0c489" stroke-width="1" opacity="0.9" />
        <path d="M13 1.5 V5 M13 21 V24.5" stroke="#e0c489" stroke-width="0.9" opacity="0.6" />
      </svg>
      <span class="legend-mark-name">${legend.name}</span>
    </div>`
    return L.divIcon({
      html,
      className: 'legend-mark-icon',
      // 26px 的圈 + 下面一行名字；锚点在圈心，名字挂在下方
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    })
  }, [legend])

  if (!legend || !icon) return null

  return (
    <>
      <Marker
        position={[legend.lat, legend.lng]}
        icon={icon}
        interactive={false}
        keyboard={false}
        zIndexOffset={-200}
      />
      <style>{`
        .legend-mark-icon { background: none !important; border: none !important; }
        .legend-mark { position: relative; width: 26px; height: 26px; }
        /* 名字挂在圈的正下方：与图上的港口名（600 层）不同层，
           这里只是"这儿有个说法"，不是可去的港 */
        .legend-mark-name {
          position: absolute; left: 50%; top: 26px; transform: translateX(-50%);
          white-space: nowrap; font-family: var(--font-serif, Georgia, serif);
          font-size: 12px; letter-spacing: 0.08em; color: #ecd9ab; opacity: 0.92;
          text-shadow: 0 0 3px rgba(6,18,26,0.95), 0 1px 2px rgba(6,18,26,0.9);
        }
        .legend-mark-icon, .legend-mark-icon * { pointer-events: none !important; }
      `}</style>
    </>
  )
}
