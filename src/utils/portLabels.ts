/**
 * 港口名该写在图标的哪一侧。
 *
 * 【为什么需要】
 * 港口会挨得很近：塞维利亚（37.39N, 5.98W）与加的斯（36.53N, 6.29W）只差 0.86°，
 * zoom 4 下相距约 20px，而标签宽 40~70px。全部朝上就等于叠在一起
 * （实测「塞维利亚 × 加的斯」重叠 41×8px）。
 *
 * 先试过按 id 取模轮换「上右下左」，能解决那一对，但冲突会转移到别的对上
 * （实测变成「伦敦 × 阿姆斯特丹」重叠 27×4px）——因为轮换是**与几何无关**的。
 *
 * 现在按几何来：每个港口找**最近的那个港口**，把标签写到背离它的那一侧。
 * 这样成对挨着的港口天然一左一右 / 一上一下，不需要碰撞消解迭代。
 *
 * 约束：
 * · 只从四个方向里选（Leaflet tooltip 的 direction）——八个方向会让偏移量和
 *   文字对齐都变复杂，而四个方向已经够分开所有实际冲突；
 * · 完全确定性：只看坐标，不看索引、不看随机数。缩放平移时标签不会换边跳动。
 */

export type LabelSide = 'top' | 'right' | 'bottom' | 'left'

export interface PortPoint {
  id: number
  latitude: number
  longitude: number
}

/** 超过这个经度/纬度差就认为"附近没有别的港口"，默认写在上方 */
const NEIGHBOR_DEG = 12

/**
 * 给每个港口选一侧。返回 id → 方位。
 *
 * 判据用**绝对值更大的那个分量**：邻居更"横向"就左右分，更"纵向"就上下分。
 * 只看一个分量会在斜向时选错（比如伦敦与阿姆斯特丹经度差 5°、纬度差 0.9°，
 * 若按纬度判会变成"邻居在北 → 写下面"，而真正该分开的是东西向）。
 */
export function chooseLabelSides(ports: PortPoint[]): Record<number, LabelSide> {
  const out: Record<number, LabelSide> = {}
  for (const p of ports) {
    let bestId: number | null = null
    let bestD = Infinity
    for (const q of ports) {
      if (q.id === p.id) continue
      const dLng = Math.abs(q.longitude - p.longitude)
      const dLat = Math.abs(q.latitude - p.latitude)
      // 墨卡托下同样的经度差在高纬更"短"，这里按 cos(lat) 折算，避免高纬误判横向
      const d = Math.hypot(dLng * Math.cos((p.latitude * Math.PI) / 180), dLat)
      if (d < bestD) { bestD = d; bestId = q.id }
    }
    if (bestId === null || bestD > NEIGHBOR_DEG) {
      out[p.id] = 'top'
      continue
    }
    const nb = ports.find((q) => q.id === bestId)!
    const dLng = nb.longitude - p.longitude
    const dLat = nb.latitude - p.latitude
    // 横向分量占优 → 左右分；否则上下分。都写背离邻居的方向。
    if (Math.abs(dLng * Math.cos((p.latitude * Math.PI) / 180)) >= Math.abs(dLat)) {
      out[p.id] = dLng > 0 ? 'left' : 'right'
    } else {
      out[p.id] = dLat > 0 ? 'bottom' : 'top'
    }
  }
  return out
}
