import type { Map as LeafletMap } from 'leaflet'
import { haversineNm } from './navigation'

/**
 * 当前投影下「1 海里 = 多少像素」。比例尺与航程圈共用这一份。
 *
 * 【为什么沿经线量 1 度】1 度纬度在任何纬度都是 60 海里，像素长只随缩放与纬度变 ——
 * 正是屏幕上"竖直方向"的比例。墨卡托里横向被 1/cos φ 拉伸，用横向去量会在高纬度
 * 差一倍（60° 处差 2 倍）。
 *
 * 【为什么放在 utils 而不是各自写在组件里】比例尺与航程圈都要这个数。各写一遍，
 * 迟早会出现"比例尺说 100 海里、航程圈按另一个比例画"的场面 —— 而两者都是
 * 玩家拿来量距离的，不一致比没有更糟。
 */
export function pxPerNmAt(map: LeafletMap): number {
  const c = map.getCenter()
  const lat1 = Math.max(-85, c.lat - 0.5)
  const lat2 = Math.min(85, c.lat + 0.5)
  const a = map.latLngToContainerPoint([lat1, c.lng])
  const b = map.latLngToContainerPoint([lat2, c.lng])
  const px = a.distanceTo(b)
  const nm = haversineNm(lat1, c.lng, lat2, c.lng)
  return nm > 0 && Number.isFinite(px) ? px / nm : 0
}
