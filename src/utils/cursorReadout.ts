/**
 * 光标读数：把鼠标指着的那个点翻译成「度数 + 气候带」。**纯计算**，不碰 Leaflet。
 *
 * 【为什么需要它】
 * 经纬网把度数写在了四条边上，但那只能告诉你"这条线是多少度"。要读**任意一点**
 * 的坐标，玩家得在两行数字之间做比例插值 —— 墨卡托里这个插值还不是线性的
 * （按 sec φ 变），肉眼估出来的纬度能差半度。光标读数把这件事变成"指哪儿读哪儿"，
 * 与网格用的是同一个 `degreeLabel`，所以两边写出来的字不可能不一致。
 *
 * 【为什么顺带说气候带】
 * 上一轮画了回归线与极圈。那四条线如果只是"四条金线"，玩家看完就忘；
 * 读数里带上「热带 / 北温带 / 北寒带」，它们立刻变成**分界**：
 * 你把光标挪过 23°26′N，那一个词就从"热带"变成"北温带"。
 * 这就是用户要的"机制 / 地图实物"，不是再写一段说明文字。
 *
 * 【为什么气候带的分界**不重新写一遍数字**】用的是 `climateLines` 里的
 * `OBLIQUITY_DEG` / `POLAR_CIRCLE_DEG`。图上那条线的位置与这里判定的分界
 * 必须是同一个数 —— 各写一遍，图上画在 23.4 而读数是 23.5，没人会立刻发现。
 */

import { OBLIQUITY_DEG, POLAR_CIRCLE_DEG } from './climateLines'
import { degreeLabel } from './graticule'

export type ClimateZoneKey =
  | 'torrid' | 'north-temperate' | 'south-temperate' | 'north-frigid' | 'south-frigid'

export interface ClimateZone {
  key: ClimateZoneKey
  /** 读数里显示的两个字/三个字 */
  name: string
}

/**
 * 这个纬度属于哪个气候带。
 *
 * 边界归属：**分界线上算高一档**（23°26′N 正好在热带与北温带之间，
 * 判成北温带）。理由不是数学而是读图：线是"再往北就不再是热带"的意思，
 * 站在线上应该已经算过去了。极圈同理（66°34′ 判寒带）。
 */
export function climateZoneAt(lat: number): ClimateZone | null {
  if (!Number.isFinite(lat)) return null
  const a = Math.abs(lat)
  if (a < OBLIQUITY_DEG) return { key: 'torrid', name: '热带' }
  if (a < POLAR_CIRCLE_DEG) {
    return lat > 0
      ? { key: 'north-temperate', name: '北温带' }
      : { key: 'south-temperate', name: '南温带' }
  }
  return lat > 0
    ? { key: 'north-frigid', name: '北寒带' }
    : { key: 'south-frigid', name: '南寒带' }
}

/**
 * 一行读数：`35°24′N  12°06′W · 北温带`。
 *
 * 【为什么两位数之间是两个空格】度数是等宽数字，两个空格让「北纬」与「西经」
 * 分成两块，眼睛不会把 `N12°` 读成一个词。这也是海图上的写法。
 *
 * 【为什么保留到分】秒级精度在 1080 海里宽的世界图上没有意义（1 秒 ≈ 30 米），
 * 而分已经是玩家能用来报坐标的粒度（1′ ≈ 1 海里）。
 */
export function cursorLabel(lat: number, lng: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return ''
  const zone = climateZoneAt(lat)
  const coords = `${degreeLabel('lat', lat)}  ${degreeLabel('lng', lng)}`
  return zone ? `${coords} · ${zone.name}` : coords
}

/**
 * 读数框该往哪个方向摆（相对光标的像素偏移）。
 *
 * 【为什么需要翻边】光标走到画面右边缘时，往右下方摆的读数框会出画，
 * 只露出半行字 —— 那比没有读数更糟（玩家会以为坐标只有一半）。
 * 这里把"框放不下"的判断做成纯函数，组件只管执行：
 * 右边界放不下就摆到光标左侧，下边界放不下就摆到光标上方。
 *
 * @param px 光标在容器里的 x
 * @param py 光标在容器里的 y
 * @param w 读数框宽（像素）
 * @param h 读数框高
 * @param size 容器尺寸
 */
export function readoutPlacement(
  px: number,
  py: number,
  w: number,
  h: number,
  size: { x: number; y: number },
  gap = 14,
): { x: number; y: number; flippedX: boolean; flippedY: boolean } {
  const safe = (v: number) => (Number.isFinite(v) ? v : 0)
  const W = safe(size?.x)
  const H = safe(size?.y)
  let x = safe(px) + gap
  let y = safe(py) + gap + 2
  const flippedX = x + safe(w) > W - 6
  if (flippedX) x = safe(px) - gap - safe(w)
  const flippedY = y + safe(h) > H - 58
  if (flippedY) y = safe(py) - gap - 2 - safe(h)
  // 翻过之后仍可能贴边（框比空间还宽/高）：夹住，不许跑到画面外
  x = Math.max(4, Math.min(x, Math.max(4, W - safe(w) - 4)))
  y = Math.max(4, Math.min(y, Math.max(4, H - safe(h) - 4)))
  return { x, y, flippedX, flippedY }
}
