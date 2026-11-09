import * as THREE from 'three'
import { isLandAt, isSeaMaskLoaded } from '@/utils/seaRoute'
import { compositeShore } from '@/utils/shoreBand'

/**
 * 3D 岸外的两圈颜色：贴岸的白沫（碎浪）+ 向深海淡出的浅水带。
 *
 * 【为什么需要它】
 * 3D 的陆地是一块厚板：顶面米黄、侧壁深褐、海岸上压一条墨线。
 * 中景看过去，陆地与海之间**没有任何过渡**，像切开的蛋糕。
 * 真海图不是这么画的——岸外先是一条白浪线，再一圈浅水，然后才是蓝。
 *
 * 【为什么生成一张贴图，而不是给海岸线加宽】
 * 试过宽线条：LineMaterial 没有软边，加宽就是一条硬边带，读作"沿岸贴了条胶带"。
 * 贴图版可以做到软边 + 沿距离渐变，且只需要一次绘制、一次 draw call。
 *
 * 【数据从哪来】`public/data/sea-mask.bin`（0.1°/格、1bit/格）——它本来就在内存里，
 * 是同一份用来算 A* 避陆与「船会不会上岸」的掩码。**不引入新素材**，
 * 也不假装知道真实水深：这里画的只是"离岸多近"，命名与注释都不说"水深"。
 *
 * 【分辨率与成本】0.35°/格（1024×512）。距离场实测 512→19.5ms、
 * 1024→30.4ms（`.workbuddy/probe-shallow-cost.mjs`）。512 时碎浪只有一像素，
 * 放大三倍也看不出白线；多花 11ms 换一条看得见的岸线，值。
 *
 * 【两条曲线在 utils/shoreBand，单位是度】距离场返回的是"格"，格的大小随
 * 分辨率变。按格写死的系数改分辨率后会**静默**变成另一条带宽（1.3 格
 * 从 55 海里变 16 海里），屏幕上只是"浅水带不见了"，没有任何报错。
 */
const TEX_W = 1024
const TEX_H = 512
/** 一格多少度（经度；纬度同值，因为等距圆柱这里 360/1024 = 180/512） */
const DEG_PER_CELL = 360 / TEX_W

/** 浅水色：海色的提亮版（不换色相，只提亮——2D 那条规矩同样适用） */
const SHALLOW_RGB: [number, number, number] = [176, 216, 224]

/** 碎浪色：略微偏冷的白（暖白会读成沙滩，冷白才像浪） */
const FOAM_RGB: [number, number, number] = [238, 247, 250]

/**
 * 沿海的"哪一段起浪"噪声。
 *
 * 【为什么必须有】均匀的白线不是浪，是描边。真实海岸只有部分段落起浪
 * （迎风的、有礁的、坡度陡的），而且是几十到几百公里一段的斑块。
 * 这里用一张**粗网格的哈希值 + 双线性插值**做低频斑块：
 * 网格边长 74 格（≈26°，约 2900 公里）刻意与 180/360 不整除，避免与经纬网共振。
 *
 * 【为什么用哈希而不是预生成随机场】贴图每次启动必须一样（截图巡检要可复现），
 * 而这里只需要"同一个格子永远同一个值"，哈希天然满足，且不用存表。
 */
const PATCH_CELLS = 74
function hash01(ix: number, iy: number): number {

  let h = (ix * 374761393 + iy * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) % 100000) / 100000
}
/** 0..1 的低频斑块场（双线性） */
function patchAt(x: number, y: number): number {
  const gx = x / PATCH_CELLS, gy = y / PATCH_CELLS
  const ix = Math.floor(gx), iy = Math.floor(gy)
  const fx = gx - ix, fy = gy - iy
  // 平滑插值：线性会让斑块边界读成方块
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash01(ix, iy), b = hash01(ix + 1, iy)
  const c = hash01(ix, iy + 1), d = hash01(ix + 1, iy + 1)
  return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy
}

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
    const x = i % TEX_W
    const y = (i / TEX_W) | 0
    /** 离岸距离换算成度：分辨率只影响锐度，不影响带宽（见 utils/shoreBand） */
    const dDeg = dist[i] * DEG_PER_CELL
    /*
     * 两层（浅水 + 碎浪）的曲线在 utils/shoreBand 里，度制、纯函数、有单测。
     * 这里只负责"把结果画进贴图"。
     */
    const { alpha: a, foamMix } = compositeShore(dDeg, patchAt(x, y))
    if (a <= 0.002) { img.data[o + 3] = 0; continue }
    const mix = (c1: number, c2: number) => Math.round(c1 + (c2 - c1) * foamMix)
    img.data[o] = mix(SHALLOW_RGB[0], FOAM_RGB[0])
    img.data[o + 1] = mix(SHALLOW_RGB[1], FOAM_RGB[1])
    img.data[o + 2] = mix(SHALLOW_RGB[2], FOAM_RGB[2])
    img.data[o + 3] = Math.round(255 * a)
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
