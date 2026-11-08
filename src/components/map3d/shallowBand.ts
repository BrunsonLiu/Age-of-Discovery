import * as THREE from 'three'
import { isLandAt, isSeaMaskLoaded } from '@/utils/seaRoute'

/**
 * 3D 岸外的浅水带：贴着海岸的一圈淡青，向深海淡出。
 *
 * 【为什么需要它】
 * 3D 的陆地是一块厚板：顶面米黄、侧壁深褐、海岸上压一条墨线。
 * 中景看过去，陆地与海之间**没有任何过渡**，像切开的蛋糕。
 * 真海图不是这么画的——岸外先是一圈浅水（沙洲、滩涂、浪线），
 * 再过渡到蓝；那圈浅色正是"这是海，但不深"的唯一提示。
 *
 * 【为什么生成一张贴图，而不是给海岸线加宽】
 * 试过宽线条：LineMaterial 没有软边，加宽就是一条硬边带，读作"沿岸贴了条胶带"。
 * 贴图版可以做到软边 + 沿距离渐变，且只需要一次绘制、一次 draw call。
 *
 * 【数据从哪来】`public/data/sea-mask.bin`（0.1°/格、1bit/格）——它本来就在内存里，
 * 是同一份用来算 A* 避陆与「船会不会上岸」的掩码。**不引入新素材**，
 * 也不假装知道真实水深：这里画的只是"离岸多近"，命名与注释都不说"水深"。
 *
 * 【为什么用 512×256 的小图】浅水带是一条 100 海里量级的过渡，
 * 远比高程图需要粗的网格；而且这是启动时同步算的（131k 像素），
 * 用 2048 宽会让首屏多花上百毫秒，换不来任何可见的差别。
 */

/** 贴图分辨率：0.7°/格 ≈ 42 海里，够画出岸外一圈 */
const TEX_W = 512
const TEX_H = 256

/**
 * 距离场以「格」为单位，超过这个格数就完全看不见。
 *
 * 1.3 格 ≈ 55 海里。第一版取 2.5 格（105 海里）：地中海整体只有 300 海里宽，
 * 实测被这圈浅水填成一片淡青，读作"海变浅了"而不是"岸外有浅滩"。
 * 收到 55 海里之后它才是一条**贴着岸的窄带**。
 * 注释与 UI 都不称它为水深——这里只有离岸距离，没有测深数据。
 */
const FALLOFF_CELLS = 1.3

/** 满强度（贴岸第一格）不透明度 */
const MAX_ALPHA = 0.42

/** 浅水色：海色的提亮版（不换色相，只提亮——2D 那条规矩同样适用） */
const SHALLOW_RGB: [number, number, number] = [176, 216, 224]

/**
 * 两遍 chamfer 距离变换（3/4 权重）。
 *
 * 【为什么要自己写】只需要"离最近的陆地几个格"，不需要精确欧氏距离；
 * chamfer 两遍扫描在这个规模上比泛洪快一个量级，误差 <6% 完全够用。
 */
function distanceField(land: Uint8Array, w: number, h: number): Float32Array {
  const INF = 999
  const d = new Float32Array(w * h)
  for (let i = 0; i < d.length; i++) d[i] = land[i] ? 0 : INF

  const relax = (i: number, j: number, cost: number) => {
    if (j < 0 || j >= d.length) return
    const v = d[j] + cost
    if (v < d[i]) d[i] = v
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (d[i] === 0) continue
      relax(i, x > 0 ? i - 1 : -1, 1)
      relax(i, y > 0 ? i - w : -1, 1)
      relax(i, x > 0 && y > 0 ? i - w - 1 : -1, 1.414)
      relax(i, x < w - 1 && y > 0 ? i - w + 1 : -1, 1.414)
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (d[i] === 0) continue
      relax(i, x < w - 1 ? i + 1 : -1, 1)
      relax(i, y < h - 1 ? i + w : -1, 1)
      relax(i, x < w - 1 && y < h - 1 ? i + w + 1 : -1, 1.414)
      relax(i, x > 0 && y < h - 1 ? i + w - 1 : -1, 1.414)
    }
  }
  return d
}

/**
 * 生成浅水带贴图。
 *
 * 朝向：**图的第 0 行是北极**、第 0 列是西经 180°，即标准等距圆柱。
 * 海面几何的 uv 已经翻转过（`v=0` 在北），所以这里把 `flipY` 关掉即可对齐，
 * 不需要再翻一次——翻两次就会得到南北颠倒的一圈浅水（会在印度洋北岸出现、
 * 在南非外海消失），肉眼很容易看出来。
 */
function buildShallowTexture(): THREE.Texture | null {
  if (!isSeaMaskLoaded()) return null

  const land = new Uint8Array(TEX_W * TEX_H)
  for (let y = 0; y < TEX_H; y++) {
    const lat = 90 - ((y + 0.5) / TEX_H) * 180
    for (let x = 0; x < TEX_W; x++) {
      const lng = -180 + ((x + 0.5) / TEX_W) * 360
      land[y * TEX_W + x] = isLandAt(lat, lng) ? 1 : 0
    }
  }
  const dist = distanceField(land, TEX_W, TEX_H)

  const canvas = document.createElement('canvas')
  canvas.width = TEX_W; canvas.height = TEX_H
  const g = canvas.getContext('2d')!
  const img = g.createImageData(TEX_W, TEX_H)
  for (let i = 0; i < dist.length; i++) {
    const o = i * 4
    if (land[i]) { img.data[o + 3] = 0; continue }
    const t = Math.min(1, dist[i] / FALLOFF_CELLS)
    // 离岸越近越亮；用 1.6 次方让边缘散得快一点，免得整片海泛白
    const a = Math.round(255 * MAX_ALPHA * Math.pow(1 - t, 1.6))
    img.data[o] = SHALLOW_RGB[0]
    img.data[o + 1] = SHALLOW_RGB[1]
    img.data[o + 2] = SHALLOW_RGB[2]
    img.data[o + 3] = a
  }
  g.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.flipY = false
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  // 远景缩小后仍然平滑：不给 mip 会在远处闪一圈噪点
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

export interface ShallowBand {
  mesh: THREE.Mesh
  dispose(): void
}

/**
 * @param worldSize 海图的世界边长（与海面 PlaneGeometry 同一个值）
 * @param y         贴在海面上方一点点（要低于所有叠加线，否则会盖住洋流）
 */
export function createShallowBand(worldSize: number, y: number): ShallowBand | null {
  const tex = buildShallowTexture()
  if (!tex) return null

  const geo = new THREE.PlaneGeometry(worldSize, worldSize)
  geo.rotateX(-Math.PI / 2)
  // 与海面**逐位相同**的 uv 翻转（见 Map3DView 的海面构建）：
  // 两边只要有一个不翻，浅水带就会南北颠倒
  {
    const uv = geo.attributes.uv.array as Float32Array
    for (let i = 1; i < uv.length; i += 2) uv[i] = 1 - uv[i]
    geo.attributes.uv.needsUpdate = true
  }

  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    // 它属于海面的一部分：随天气/昼夜一起变暗才不会在夜里发光
    toneMapped: false,
  })

  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = 'shallow-band'
  mesh.position.set(worldSize / 2, y, 0)
  mesh.renderOrder = 1
  return {
    mesh,
    dispose() {
      geo.dispose()
      tex.dispose()
      mat.dispose()
    },
  }
}
