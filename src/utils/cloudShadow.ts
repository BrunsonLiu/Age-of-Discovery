/**
 * 云影（3D 海图上的"云从海面掠过"）。
 *
 * 【为什么要画在地面上，而不是天上】云影是**投影**，它应该贴在地表随地形走；
 * 在天上放一块半透明板，斜视时会露出板的边缘、低仰角时还会糊住半个天空
 * （这块图是 90×90 世界单位，比海图本身还大）。放在地表上方 0.012 处，
 * 得到的透视是对的，而且永远不会挡住别的东西。
 *
 * 【为什么贴图必须可平铺】这层用 `map.offset` 缓慢平移来做"云在走"。
 * 非平铺的图一平移，边缘就会露出一块空板，于是只能靠"淡出再淡入"掩盖——
 * 那会变成周期性的明暗脉搏。环面生成的斑块 + RepeatWrapping 才是无缝的。
 */

/** 一块云影斑：位置/半径都以贴图边长为单位（0~1），可跨边界 */
export interface CloudBlob {
  x: number
  y: number
  r: number
  /** 中心浓度（0~1） */
  a: number
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 生成一组云影斑（确定性：同一个 seed 每次得到同一片云）。
 *
 * 半径分两档：大块（0.10~0.20）给"云团"，小块（0.03~0.07）补碎絮。
 * 只有大块的话，整片云会齐刷刷地一起飘，像一张在动的墙纸。
 */
export function cloudBlobs(seed = 0x2f6e2b1, count = 26): CloudBlob[] {
  const rand = mulberry32(seed)
  const out: CloudBlob[] = []
  for (let i = 0; i < count; i++) {
    const big = i < count * 0.55
    out.push({
      x: rand(),
      y: rand(),
      r: big ? 0.10 + rand() * 0.10 : 0.03 + rand() * 0.04,
      a: big ? 0.55 + rand() * 0.35 : 0.3 + rand() * 0.35,
    })
  }
  return out
}

/** 画进 canvas（3D 用）；无 document 时返回 null */
export function buildCloudShadowCanvas(
  blobs: CloudBlob[],
  size = 512,
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  if (!g) return null
  g.clearRect(0, 0, size, size)
  for (const b of blobs) {
    const R = b.r * size
    // 环面上一个斑要在四周重复 8 次，才能"跨过边界还能接上"
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cx = b.x * size + dx * size
        const cy = b.y * size + dy * size
        if (cx + R < 0 || cy + R < 0 || cx - R > size || cy - R > size) continue
        const grd = g.createRadialGradient(cx, cy, 0, cx, cy, R)
        grd.addColorStop(0, `rgba(255,255,255,${b.a})`)
        grd.addColorStop(0.55, `rgba(255,255,255,${b.a * 0.55})`)
        grd.addColorStop(1, 'rgba(255,255,255,0)')
        g.fillStyle = grd
        g.beginPath()
        g.arc(cx, cy, R, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  return c
}
