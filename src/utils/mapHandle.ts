/**
 * 地图实例的共享句柄。
 *
 * 【为什么需要】海上异闻要保证剪影落在水里，就得做两件只有 Leaflet 能做的事：
 * ① 把经纬度换算成屏幕像素；② 反查某个屏幕点是不是陆地。
 * 而 SeaOmen 是 MapContainer 的**兄弟节点**（浮在地图之上的覆盖层），
 * 拿不到 `useMap()`。与其为了这一个需求把它塞进 MapContainer 里
 * （那会改变它的定位坐标系，连带影响层叠与点击），不如让地图自己登记一份句柄。
 *
 * 这是本仓库里唯一一处"全局单例"式的逃生口，所以写明用途：
 * **只读**——只用来投影与反查，绝不在这里改地图状态。
 */
import type { Map as LeafletMap } from 'leaflet'

let handle: LeafletMap | null = null

export function setMapHandle(map: LeafletMap | null): void {
  handle = map
}

export function mapHandle(): LeafletMap | null {
  return handle
}
