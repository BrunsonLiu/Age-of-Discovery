import { useMemo } from 'react'
import { Marker } from 'react-leaflet'
import L from 'leaflet'
import { useGameStore } from '@/store/useGameStore'
import { nextChapter } from '@/data/nations'
import { ports } from '@/data/ports'

/**
 * 国别航路：**下一段要去哪个港**，直接标在海图上。
 *
 * 【为什么这个故事线要画在图上，而不是写进面板】
 * 用户 2026-11-12 的第二次要求："每个国家在这段历史有不同的故事线和航线……
 * 但还是不要只用文字堆砌"。一段航路如果只写在面板里，它就退化成任务列表；
 * 画在图上，玩家抬眼就能看见"我这条航路的下一站是满剌加"，而**中间的路要自己走**
 * （距离、风向、补给都是真的）。走完一段，这个标记跳到下一个港。
 *
 * 【为什么用菱形而不是传说那个圆环】两者在图上会同时存在：
 *   · 传说（圆环）= 一片海，开进 90 海里自动兑现，不可点；
 *   · 航路（菱形）= 一个港，必须停靠才算过，同样不可点。
 * 形状不同、位置不同（一个在海上、一个在港口旁边），才不会互相误认。
 *
 * 【为什么不吃点击】压在海图上的浮层不许吃指针（项目硬规矩，踩过四次）。
 * 目的地是港口，玩家点港口本身就能开出航计划——标记只是告诉你去哪。
 */
export default function NationStory() {
  const nation = useGameStore(s => s.nation)
  const done = useGameStore(s => s.storyDone)
  const chapter = nextChapter(nation, done ?? [])

  const target = chapter ? ports.find(p => p.id === chapter.portId) : null

  const icon = useMemo(() => {
    if (!chapter) return null
    // 第几段：`xx-1` → 1
    const n = Number(chapter.id.split('-').pop()) || 1
    const html = `<div class="story-mark">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <path d="M11 2 L20 11 L11 20 L2 11 Z" fill="none" stroke="#e6cd93" stroke-width="1.2" opacity="0.9" />
        <path d="M11 6.5 L15.5 11 L11 15.5 L6.5 11 Z" fill="#e6cd93" opacity="0.22" />
      </svg>
      <span class="story-mark-step">${n}</span>
      <span class="story-mark-name">${chapter.name}</span>
    </div>`
    return L.divIcon({
      html,
      className: 'story-mark-icon',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    })
  }, [chapter])

  if (!chapter || !target || !icon) return null

  return (
    <>
      <Marker
        position={[target.latitude, target.longitude]}
        icon={icon}
        interactive={false}
        keyboard={false}
        // 与港口标记（600）同层之下：它属于港口，不该盖住港口名
        zIndexOffset={-150}
      />
      <style>{`
        .story-mark-icon { background: none !important; border: none !important; }
        .story-mark { position: relative; width: 22px; height: 22px; }
        /* 段号写在菱形正中：1/2/3 是"这条航路的第几步"，不是港口编号 */
        .story-mark-step {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          font-family: var(--font-serif, Georgia, serif); font-size: 11px; line-height: 1;
          color: #f3e3bb; text-shadow: 0 1px 2px rgba(4,12,18,0.95);
        }
        .story-mark-name {
          position: absolute; left: 50%; top: 20px; transform: translateX(-50%);
          white-space: nowrap; font-family: var(--font-serif, Georgia, serif);
          font-size: 12px; letter-spacing: 0.08em; color: #f0dcae;
          text-shadow: 0 0 3px rgba(6,18,26,0.95), 0 1px 2px rgba(6,18,26,0.9);
        }
        .story-mark-icon, .story-mark-icon * { pointer-events: none !important; }
      `}</style>
    </>
  )
}
