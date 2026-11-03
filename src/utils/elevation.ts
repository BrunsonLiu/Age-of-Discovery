import { mercNorm } from './mapProjection'

/**
 * 高程采样器：给一个经纬度，返回归一到 0~1 的相对高度。
 *
 * 数据来自 `public/data/elev-map.png`（2048×1024，Web Mercator）。
 * 这张图之前一直躺在 public/data 里没人引用——它本来是给 3D 用的备用素材。
 *
 * 【为什么是 Mercator 而不是等经纬度】
 * 把 land.geojson 按两种投影分别栅格化，再量"陆地点下的平均高程 vs 海点下的"：
 *   Mercator   陆地 44.5 / 海 0.8   （差 43.7）
 *   等经纬度   陆地 28.3 / 海 12.2  （差 16.1）
 * 所以这张图是 Web Mercator，纵向必须用 mercNorm(lat)，否则整张图的纬度会错开
 * ——而"大致看着还行"正是这类错误最难发现的地方。
 */
export type ElevationSampler = (lat: number, lng: number) => number

/** 采样不到（图片还没加载好）时返回 -1，调用方据此退回旧行为 */
export const NO_ELEVATION = -1

/**
 * 把高程图读进 canvas，返回采样器。
 *
 * 只读一次、常驻内存：2048×1024 的 ImageData 是 8MB，换来的是上万个符号生成时
 * 不用反复解码。加载失败返回 null（调用方退回"不看高程"的旧行为，不能让地图空白）。
 */
/**
 * 已加载过的采样器（按 url 缓存 Promise）。
 *
 * 【为什么必须缓存】2D 的 TerrainDecor 与 2.5D 的地形符号都要用它。
 * 不缓存就是**解码两次 2048×1024 的 PNG、常驻两份 8MB ImageData**，
 * 而且两次解码都在主线程上（`getImageData` + 逐点采样），
 * 切视图时会各卡一下。缓存的是 Promise 而不是结果：
 * 两个视图几乎同时请求，只有这样才能合并成一次加载。
 */
const samplerCache = new Map<string, Promise<ElevationSampler | null>>()

export function loadElevationSampler(url: string): Promise<ElevationSampler | null> {
  const hit = samplerCache.get(url)
  if (hit) return hit
  const p = loadElevationSamplerUncached(url)
  samplerCache.set(url, p)
  // 失败不缓存：网络一时抽风之后再想加载还有机会（缓存了 null 就永远没有高程）
  p.then((fn) => { if (!fn) samplerCache.delete(url) })
  return p
}

async function loadElevationSamplerUncached(url: string): Promise<ElevationSampler | null> {
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const W = img.naturalWidth
    const H = img.naturalHeight
    if (!W || !H) return null
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    const data = ctx.getImageData(0, 0, W, H).data

    const at = (x: number, y: number) => {
      const i = (y * W + x) * 4
      return (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
    }

    /*
     * 取格内**最大值**，不是格心单点。
     *
     * 【为什么】地形符号的网格是 1.1°，而这张图一个 texel 只有 0.176°。
     * 山脉是**细长的一条脊**，格心那一点绝大多数时候落在山谷——实测按单点采样时，
     * 法国全境 0.039、阿尔卑斯一带 0.28 都算"低"，整个欧洲一个山峰符号都没有，
     * 而喜马拉雅 0.66。取 ±3 texel（±0.5°）邻域的最大值之后，山脊只要擦过这一格
     * 就算数：阿尔卑斯 0.28 / 安第斯 0.57 / 喜马拉雅 0.66，撒哈拉腹地 0.157。
     */
    const R = 3
    return (lat: number, lng: number) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NO_ELEVATION
      const x = Math.round(((lng + 180) / 360) * (W - 1))
      const y = Math.round(mercNorm(lat) * (H - 1))
      if (x < 0 || x >= W || y < 0 || y >= H) return NO_ELEVATION
      let max = 0
      for (let dy = -R; dy <= R; dy++) {
        const yy = Math.min(H - 1, Math.max(0, y + dy))
        for (let dx = -R; dx <= R; dx++) {
          const xx = Math.min(W - 1, Math.max(0, x + dx))
          const v = at(xx, yy)
          if (v > max) max = v
        }
      }
      return max
    }
  } catch {
    return null
  }
}
