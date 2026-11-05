import type { DebrisKind } from '@/data/debris'

/**
 * 漂流物的视觉，2D 平面海图与 2.5D 立体海图**共用这一份**。
 *
 * 【为什么要抽出来】同一个木桶在两个视图里必须长得一样。否则玩家切一次视图
 * 会以为"这是另一种东西"，更糟的是以后改了 2D 忘了改 3D —— 那正是项目里
 * 「价格/天数/预览」反复踩过的"两个来源说不同的话"。
 *
 * 【为什么必须是闭合路径】第一版用的是线描写法（一条条 M/h 线段），
 * 放大 6 倍看就是四个发光的线框图标，浮在海面上像 UI 控件而不像物件。
 * 给它们加 `fill` 也没用 —— 开放的路径没有面积可填。
 * 现在主体一律是 rect / ellipse / 闭合 path，细节线单独用细描边画，
 * 于是它读起来是"一个泡在水里的东西"。
 */
export function debrisGlyph(kind: DebrisKind): string {
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

/**
 * 光环 + 水线 + 剪影的完整结构。
 * 2D 把它塞进 Leaflet 的 divIcon，3D 把它塞进投影层的 button —— 同一段 HTML。
 *
 * 动的是"光"不是物件：物件自己晃会像活物，而木桶不会游。
 */
export function debrisMarkerHtml(kind: DebrisKind): string {
  return `<div class="debris-ring"></div><div class="debris-wake"></div>` +
    `<div class="debris-glyph" style="color:#f0dfb4">${debrisGlyph(kind)}</div>`
}
