import type { RelicKind } from '@/data/relics'

/**
 * 遗物的视觉：2D 平面海图与 2.5D 立体海图**共用这一份**。
 *
 * 【为什么抽出来】同一件遗物在两个视图里必须长得一样——
 * 否则玩家切一次视图会以为"这是另一种东西"，更糟的是以后改了 2D 忘了改 3D。
 * 这正是项目里「价格/天数/预览」反复踩过的"两个来源说不同的话"。
 *
 * 【与漂流物的区别】漂流物是"漂在水面上的日常物件"（木桶、货箱），
 * 遗物是"半埋在海里的旧物"（断桅、铁锚、舵轮）。
 * 所以遗物多一圈**静止的铜环**（不是脉冲光晕）——它不该看起来随时会被浪带走。
 * 颜色也分两族：史实用旧铜色 `#c9a25e`，神话用冷银白 `#cfd8e6`。
 */
export function relicGlyph(kind: RelicKind): string {
  const base = 'fill="currentColor" fill-opacity="0.5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"'
  const detail = 'fill="none" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.9" stroke-linecap="round"'
  const solid = 'fill="currentColor" fill-opacity="0.8" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"'
  switch (kind) {
    case 'mast':
      // 折断的桅杆：斜插的一根 + 折口的横桁 + 一截断缆
      return `<svg viewBox="0 0 24 24"><path d="M8.4 20.5 L14.2 4.2 L16.6 4.9 L10.9 20.8 Z" ${base}/>` +
        `<path d="M10.2 12.6 L17.4 10.2 L17.8 12 L10.6 14.4 Z" ${base}/>` +
        `<path d="M16.6 4.9 Q19.6 6.4 19 9.6" ${detail}/></svg>`
    case 'anchor':
      // 四爪铁锚：环 + 锚杆 + 两爪
      return `<svg viewBox="0 0 24 24"><circle cx="12" cy="4.4" r="2.2" ${base}/>` +
        `<path d="M10.6 6.2 L13.4 6.2 L13.4 17.6 L10.6 17.6 Z" ${base}/>` +
        `<path d="M4.6 13.4 Q12 21.6 19.4 13.4 L19.4 16.2 Q12 24 4.6 16.2 Z" ${base}/>` +
        `<path d="M9.6 9.4 L14.4 9.4" ${detail}/></svg>`
    case 'wheel':
      // 舵轮：外圈 + 辐条
      return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2" ${base}/><circle cx="12" cy="12" r="5.4" ${detail}/>` +
        `<path d="M12 3.8 L12 20.2 M3.8 12 L20.2 12 M6.2 6.2 L17.8 17.8 M17.8 6.2 L6.2 17.8" ${detail}/>` +
        `<circle cx="12" cy="12" r="1.6" ${solid}/></svg>`
    case 'compass':
      // 罗盘：盒 + 指针
      return `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.2" ${base}/>` +
        `<path d="M12 5.2 L14.8 12 L12 18.8 L9.2 12 Z" ${solid}/>` +
        `<path d="M4.4 9.4 L19.6 14.6" ${detail}/></svg>`
    case 'bone':
      // 白骨：长肋 + 顶端的一节
      return `<svg viewBox="0 0 24 24"><path d="M5.6 21 Q13.4 16.4 16.4 5.4 L18.6 6.2 Q15.6 17.6 7.4 22.2 Z" ${base}/>` +
        `<circle cx="18.4" cy="4.6" r="2.6" ${base}/>` +
        `<path d="M8.6 17.4 Q12.6 15.4 14.4 11.2" ${detail}/></svg>`
    case 'lyre':
      // 七弦琴：U 形框 + 弦
      return `<svg viewBox="0 0 24 24"><path d="M6.6 4.4 L9.4 4.4 Q9.8 15.4 12 17.6 Q14.2 15.4 14.6 4.4 L17.4 4.4 Q16.6 17.4 12 20.4 Q7.4 17.4 6.6 4.4 Z" ${base}/>` +
        `<path d="M9.8 6 L10.4 15.4 M12 5.4 L12 16.4 M14.2 6 L13.6 15.4" ${detail}/></svg>`
  }
}

/** 遗物在海图上的颜色：史实旧铜 / 神话冷银 */
export function relicColor(lore: 'history' | 'myth'): string {
  return lore === 'history' ? '#e0b76a' : '#d7e0ee'
}

/**
 * 铜环 + 剪影的完整结构（2D 塞进 Leaflet 的 divIcon，3D 塞进投影层）。
 *
 * 与漂流物的 `debris-ring`（脉冲光圈）不同：遗物的环是**静止**的，
 * 而且比光环更实——它是"嵌在海里的铜环"，不是"水面的反光"。
 */
export function relicMarkerHtml(kind: RelicKind, lore: 'history' | 'myth', id: string): string {
  const color = relicColor(lore)
  // data-relic-id：2D 与 3D 用同一个稳定锚点（e2e 按它找那一件）
  return `<div class="relic-ring" style="color:${color}"></div>` +
    `<div class="relic-glyph" style="color:${color}" data-relic-id="${id}">${relicGlyph(kind)}</div>`
}
