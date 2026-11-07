import * as THREE from 'three'

/**
 * 由高程图生成**法线贴图**，给 3D 的陆地顶面用。
 *
 * 【为什么需要它】
 * 陆地在 3D 里是一块**完全平的**板子（顶面 y=0，没有内部顶点，
 * 只有海岸线上的顶点——所以没法靠位移做出内陆的山）。
 * 一块平板配一盏方向光，得到的是一整片均匀亮度：实测截图里
 * 南美、非洲、西伯利亚的地面颜色几乎一样，"融化塑料"就是这么来的。
 *
 * 山的形状其实**已经画在 painted-land 贴图里了**，但它只是颜色，
 * 不参与光照。补一张法线图之后，同一盏光会在山脊的迎光面提亮、
 * 背光面压暗——地面立刻从"平涂"变成"有坡"。
 *
 * 【为什么是 normalMap 而不是再塞一张 bumpMap】
 * 陆地已经有一张 bumpMap 在干"纸纹颗粒"这件事（`buildGrainCanvas`，
 * repeat 22×，近景 1:1 像素）。bumpMap 一个材质只能有一张，换掉就是
 * 拿颗粒换地形——两头都不对。normalMap 是另一个槽位，两张可以共存：
 * 颗粒管笔触，法线管地势。
 *
 * 【为什么从高程图算，而不是直接用 painted-land 的亮度】
 * painted-land 的明暗里混着植被、纸色、海岸晕染，不是纯粹的高度；
 * 拿它当高度会把"撒哈拉深处的深色"读成山。elev-map 是单一含义的数据。
 *
 * 【投影】elev-map.png 是 2048×1024 的 Web Mercator，而陆地顶面的 uv0
 * 恰好就是 `((lon+180)/360, mercNorm(lat))`（见 landGeometry 的 pushTri）
 * —— 同一套坐标，直接贴上就对齐，不需要重算 UV。
 */

/** 缓存的 Promise：2D/3D 与重复切视图都只算一次 */
const cache = new Map<string, Promise<THREE.Texture | null>>()

export interface ReliefOptions {
  /**
   * 高度放大倍数。
   *
   * 【为什么需要手调】高程图是 0~1 的归一化相对高度，2048 宽摊在
   * 360° 经度上 ≈ 0.176°/px。梯度本身很小，不放大就几乎看不出坡。
   * 但放太大又会把纸纹都抬成"搓衣板"——实测取 6 附近能读出安第斯、
   * 喜马拉雅、阿尔卑斯的脊线，同时平原保持平整。
   */
  strength?: number
}

export function loadReliefNormalMap(
  url: string,
  opts: ReliefOptions = {},
): Promise<THREE.Texture | null> {
  const key = `${url}|${opts.strength ?? 6}`
  const hit = cache.get(key)
  if (hit) return hit
  const p = build(url, opts.strength ?? 6)
  cache.set(key, p)
  p.then((t) => { if (!t) cache.delete(key) })  // 失败不缓存，下次还能再试
  return p
}

async function build(url: string, strength: number): Promise<THREE.Texture | null> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image()
      im.crossOrigin = 'anonymous'
      im.onload = () => resolve(im)
      im.onerror = () => reject(new Error('elev 图加载失败'))
      im.src = url
    })

    const W = img.naturalWidth
    const H = img.naturalHeight
    const src = document.createElement('canvas')
    src.width = W
    src.height = H
    const sctx = src.getContext('2d', { willReadFrequently: true })!
    sctx.drawImage(img, 0, 0)
    const h = sctx.getImageData(0, 0, W, H).data

    const out = document.createElement('canvas')
    out.width = W
    out.height = H
    const octx = out.getContext('2d')!
    const dst = octx.createImageData(W, H)
    const d = dst.data

    // 高度取 R 通道（elev-map 是灰度图，三通道相同）
    const at = (x: number, y: number) => {
      const xx = x < 0 ? 0 : x >= W ? W - 1 : x
      const yy = y < 0 ? 0 : y >= H ? H - 1 : y
      return h[(yy * W + xx) * 4] / 255
    }

    /*
     * 【法线朝向】贴图空间里 +u 是向东、+v 是向南（v=0 在北）。
     * 高度沿 +u 增大 → 坡面朝西 → 法线 x 分量为负。所以取 -dx。
     * 若整个地形读作"山谷"而不是"山"，就是这里的符号反了。
     */
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength
        // n = normalize(-dx, -dy, 1)
        let nx = -dx, ny = -dy, nz = 1
        const inv = 1 / Math.hypot(nx, ny, nz)
        nx *= inv; ny *= inv; nz *= inv
        const i = (y * W + x) * 4
        d[i] = Math.round((nx * 0.5 + 0.5) * 255)
        d[i + 1] = Math.round((ny * 0.5 + 0.5) * 255)
        d[i + 2] = Math.round((nz * 0.5 + 0.5) * 255)
        d[i + 3] = 255
      }
    }
    octx.putImageData(dst, 0, 0)

    const tex = new THREE.CanvasTexture(out)
    // 法线图是**数据**不是颜色，绝不能走 sRGB 转换
    tex.colorSpace = THREE.NoColorSpace
    // 与 painted-land 一致：第 0 行是北极（v=0）
    tex.flipY = false
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    tex.anisotropy = 4
    tex.needsUpdate = true
    return tex
  } catch {
    return null
  }
}
