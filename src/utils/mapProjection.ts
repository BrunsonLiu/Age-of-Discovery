/**
 * 2.5D 海图的投影换算。
 *
 * 【为什么用 Web Mercator 而不是等经纬度】
 * Leaflet 现在的底图是 EPSG:3857，2.5D 要和它对齐到同一个坐标口径，
 * 否则同一个港口在两个视图里会错开。Mercator 的归一化值
 * `mercNorm(lat)` 落在 0（北极）~1（南极）之间。
 *
 * 【Mercator 的关键坑】
 * Mercator 世界是**正方形**：归一化后的纵向像素数要乘**世界宽度**，不是世界高度。
 * 早期版本乘了图高，导致所有经纬度整体偏移，而数值看上去仍"大致合理"，
 * 测点却全错。（在 mercator 归一化里，y = mercNorm(lat) × W，不是 × H。）
 *
 * 世界坐标约定：
 *   x = 经度映射 → [0, WORLD_SIZE]，东为正
 *   z = 纬度映射 → [-WORLD_SIZE/2, +WORLD_SIZE/2]，**北为负（远）南为正（近）**
 *   y = 高度，0 是陆地顶面（海平面为负）
 */
export const MAP_WORLD_SIZE = 20

/** 纬度 → Mercator 归一化值（0=北极，1=南极） */
export function mercNorm(lat: number): number {
  return (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2
}

/** 经度 → 世界 X */
export function lonToWorldX(lon: number): number {
  return (lon + 180) / 360 * MAP_WORLD_SIZE
}

/** 纬度 → 世界 Z */
export function latToWorldZ(lat: number): number {
  return mercNorm(lat) * MAP_WORLD_SIZE - MAP_WORLD_SIZE / 2
}

/** 世界 X → 经度 */
export function worldXToLon(x: number): number {
  return x / MAP_WORLD_SIZE * 360 - 180
}

/** 世界 Z → 纬度 */
export function worldZToLat(z: number): number {
  const n = (z + MAP_WORLD_SIZE / 2) / MAP_WORLD_SIZE
  return (2 * Math.atan(Math.exp((1 - 2 * n) * Math.PI)) - Math.PI / 2) * 180 / Math.PI
}

/** 贴图 UV：与 painted-land.png / painted-sea.png 的像素布局一致（Web Mercator） */
export function lonLatToUV(lon: number, lat: number): [number, number] {
  return [(lon + 180) / 360, mercNorm(lat)]
}
