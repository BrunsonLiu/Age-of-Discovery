/**
 * 羊皮纸纹理：程序化生成的**无缝**纸纹。
 *
 * 【为什么要自己生成，不用美工给的那张图】
 * 陆地在默认视角下占屏约 40%，是屏幕上面积最大的一块材质。原来用一张位图铺
 * SVG pattern 来表现羊皮纸，但那张图本身不可平铺：
 *
 *   · `preserveAspectRatio="xMidYMid slice"` 把 360px 的图裁成中心 240px，
 *     左右边缘来自原图的不同位置 → 每 240px 一道硬边。
 *     实测 `land-texture.mjs`：列接缝落在 **x=960、行接缝 y=480 —— 正好是
 *     240 的整数倍**（不是巧合，就是 pattern 单元边界），7 倍放大下是一条能看见的矩形轮廓。
 *   · 图比目标陆色亮一截，所以上面又盖了一层 0.42 的平色把它压回去，
 *     纹理跟着被压平：横向采样只有 ±3/255 的波动，等于**加了但看不见**。
 *     （和木纹那次是同一个坑：alpha 必须采样定，不能凭感觉。）
 *
 * 现在改成在 canvas 上画：所有元素都按**环面**绘制（同一笔画在 3×3 的九个偏移上
 * 各画一遍，跨过边界的部分从对面接回来），所以任意一条边都能对折拼接；
 * 逐像素纤维噪点本身就不需要连续性，天然可平铺。
 * 尺寸精确等于 pattern 单元，不再有 slice、不再有接缝。
 *
 * 【层次】纸的质感不是单一频率的噪声：
 *   · 大斑驳（~110px）——纸浆厚薄不均，造成大块的深浅起伏；
 *   · 中斑点（~34px）——纤维团；
 *   · 细纤维（逐像素）——真正的"纸纹"，也是近距离唯一看得出的一种。
 * 三层都是低幅度叠起来，才像纸；只有一层高频噪点会像电视雪花。
 */

/**
 * pattern 单元边长（CSS px，不随地图缩放变化——纸纹不该跟着缩放）。
 *
 * 【为什么是 384 而不是更小】单元越小越省内存，但**大斑驳会周期性重复**：
 * 256 时一块陆地横向只放得下两格，同一团暗斑会在几百像素后再次出现，
 * 眼睛能认出来。逐像素的纤维噪点倒是无所谓（人记不住 6 万个随机数），
 * 所以真正决定单元尺寸的是大斑驳。384 下一屏大约只重复一次。
 */
export const PAPER_TILE = 384

/** 目标陆色。纹理围绕它起伏，均值必须等于它，否则整块陆地会整体偏色 */
const BASE: [number, number, number] = [219, 197, 157]

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

let cached: string | null = null

/**
 * pattern 的 SVG 标记。
 *
 * 单独抽出来是为了**可被单测断言**：这条「图片绘制尺寸必须精确等于单元尺寸、
 * 且不能用 slice」的约束在截图上测不出来（见下方注释），只能在这一层锁死。
 */
export function landPaperPatternMarkup(sprite: string): string {
  return `<pattern id="landPaper" patternUnits="userSpaceOnUse" width="${PAPER_TILE}" height="${PAPER_TILE}">`
    + `<image href="${sprite}" x="0" y="0" width="${PAPER_TILE}" height="${PAPER_TILE}" preserveAspectRatio="none" />`
    + `</pattern>`
}

/** 生成（并缓存）纸纹的 dataURL。SSR/无 document 时返回空串。 */
export function buildPaperSprite(): string {
  if (cached !== null) return cached
  if (typeof document === 'undefined') return ''

  const T = PAPER_TILE
  const c = document.createElement('canvas')
  c.width = T
  c.height = T
  const g = c.getContext('2d')
  if (!g) return ''
  g.fillStyle = `rgb(${BASE[0]},${BASE[1]},${BASE[2]})`
  g.fillRect(0, 0, T, T)

  const rand = mulberry32(0x9e3779b9)

  /**
   * 在环面上画一个软斑。
   * 9 次偏移看起来浪费，但这是**唯一**能保证边缘无缝又不留对称轴的办法：
   * 只画中心一次，跨过边界的斑会被硬切；用镜像平铺则会留下可见的镜面对称。
   */
  const blob = (x: number, y: number, r: number, alpha: number, dark: boolean) => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cx = x + dx * T
        const cy = y + dy * T
        if (cx + r < 0 || cx - r > T || cy + r < 0 || cy - r > T) continue
        const rg = g.createRadialGradient(cx, cy, 0, cx, cy, r)
        const col = dark ? '0,0,0' : '255,255,255'
        rg.addColorStop(0, `rgba(${col},${alpha})`)
        rg.addColorStop(0.55, `rgba(${col},${alpha * 0.55})`)
        rg.addColorStop(1, `rgba(${col},0)`)
        g.fillStyle = rg
        g.beginPath()
        g.arc(cx, cy, r, 0, Math.PI * 2)
        g.fill()
      }
    }
  }

  // 大斑驳：纸浆厚薄。暗多亮少——羊皮纸整体偏"沉"，不是发光的白纸
  for (let i = 0; i < 26; i++) {
    blob(rand() * T, rand() * T, 60 + rand() * 60, 0.032 + rand() * 0.024, rand() < 0.62)
  }
  // 中斑点：纤维团
  for (let i = 0; i < 70; i++) {
    blob(rand() * T, rand() * T, 14 + rand() * 22, 0.026 + rand() * 0.020, rand() < 0.55)
  }

  // 细纤维：逐像素。三角分布半宽 15 → std ≈ 15/√6 ≈ 6.1。
  // 实测（land-texture.mjs）要 grain ≥ 6 才看得见：第一版半宽 6 只有 4.41，
  // 屏幕上仍是"有纹理但看不出"。三层叠加后目标 8~10。
  const img = g.getImageData(0, 0, T, T)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    // 两个均匀分布相加近似三角分布，比单一均匀噪声更像纤维（少了"电子噪点"感）
    const n = ((rand() + rand()) - 1) * 15
    const v = Math.round(n)
    d[i] = Math.max(0, Math.min(255, d[i] + v))
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + v))
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + v))
  }
  g.putImageData(img, 0, 0)

  cached = c.toDataURL('image/png')
  return cached
}
