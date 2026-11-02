/**
 * 陆地的高频颗粒层（给 2.5D 的陆地贴图补"1:1 像素尺度"的细节）。
 *
 * 【为什么需要】painted-land.png 是 1024×512，铺满 20×20 世界单位 ——
 * 近景下 1 世界单位只有 ~51 texel，屏幕上却占 200+ px。
 * 于是陆地放大后是一整片**低频渐变**：颜色对，但没有任何东西落在像素尺度上，
 * 读起来像喷绘软泥，而不是手绘海图。
 * 2D 视图的陆地有这个（羊皮纸 pattern，实测 grain = 7.1）——
 * 切到 2.5D 就没了，两个视图的材质说服力差一截。
 *
 * 【为什么用乘数而不是"再叠一层图"】乘数（均值 1.0，±10%）只改高频，
 * 不动色相与明度均值：即使以后决定给陆地表调色（见陆地材质处的讨论），
 * 这层也照样成立。
 *
 * 【为什么噪声必须是环面的】贴图会在世界空间平铺二十多次，
 * 接缝落在任意位置。非环面噪声每格都会露出一道直线（一轮教训：
 * 位图 pattern + slice 平铺必露缝）。这里所有 octave 都用**周期格点**
 * 采样，横竖两个方向的取模天然闭合。
 */

/** 周期格点（n×n，值域 0..1） */
function lattice(n: number, rand: () => number): Float32Array {
  const a = new Float32Array(n * n)
  for (let i = 0; i < a.length; i++) a[i] = rand()
  return a
}

/** 双线性采样周期格点；x/y 以格为单位（自动取模，所以无限平铺无缝） */
function sampleLattice(l: Float32Array, n: number, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = x - x0, fy = y - y0
  const i0 = ((x0 % n) + n) % n, j0 = ((y0 % n) + n) % n
  const i1 = (i0 + 1) % n, j1 = (j0 + 1) % n
  // smoothstep 插值：双线性的对角线折痕在放大后会成"网格"，这里柔化掉
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = l[j0 * n + i0], b = l[j0 * n + i1]
  const c = l[j1 * n + i0], d = l[j1 * n + i1]
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy
}

/** 固定种子 → 每次生成的颗粒完全一致（截图对比才有意义） */
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
 * 颗粒强度：贴图值落在 255 ± GRAIN_AMP。
 * 参照 2D 的实测 grain 7.1（陆地均值约 120 → 约 ±6%）；
 * 这里给 ±10%，再在材质里乘 0.85 → 有效 ±8.5%，两端一致。
 */
export const GRAIN_AMP = 26
/** 颗粒层在材质里的权重（1 = 全用颗粒，0 = 关掉） */
export const GRAIN_WEIGHT = 0.85

/**
 * 生成中性颗粒（均值 0.5 的噪声 → 255 ± GRAIN_AMP 的灰度）。
 *
 * 返回纯数据而不是 canvas：这样单测可以直接断言均值 / 值域 / 环面无缝，
 * 不需要 DOM。
 */
export function grainValues(size = 256, seed = 0x51ed270b): Float32Array {
  const rand = mulberry32(seed)
  /*
   * 三个 octave：8 格（大斑驳）、32 格（中频）、128 格（细砂）。
   * 权重和为 1 → 均值仍是 0.5，不会整体偏亮/偏暗。
   */
  /*
   * 【为什么必须混一层逐像素白噪声，而不只是格点噪声】
   * 第一版全是格点噪声（8/32/128 格），SD 0.125、**相邻像素差只有 0.031**
   * ——换算到屏幕上约 1 个亮度级，等于没有（实测陆地 HF 能量 0.56 → 0.61，
   * 肉眼和"没有颗粒"完全一样）。人眼认的"纸纹"是靠 1:1 像素尺度上的抖动，
   * 而最细的 128 格 octave 在 256px 上也是 2px 一格，太滑了。
   *
   * 加 24% 的逐像素白噪声后，相邻差约 0.10（≈ 4~5 个亮度级），
   * 正好是"有纤维但不噪"的区间；格点部分保留大斑驳，两者叠加才像纸不像电视雪花。
   */
  const WHITE_W = 0.24
  const octaves: { n: number; w: number; l: Float32Array }[] = [
    { n: 8, w: 0.38, l: new Float32Array(0) },
    { n: 32, w: 0.23, l: new Float32Array(0) },
    { n: 128, w: 0.15, l: new Float32Array(0) },
  ]
  for (const o of octaves) o.l = lattice(o.n, rand)

  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = WHITE_W * rand()
      for (const o of octaves) {
        v += o.w * sampleLattice(o.l, o.n, (x / size) * o.n, (y / size) * o.n)
      }
      out[y * size + x] = v
    }
  }
  return out
}

/** 把颗粒画进 canvas（3D 用）；SSR / 无 document 时返回 null */
export function buildGrainCanvas(size = 256): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const vals = grainValues(size)
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  if (!g) return null
  const img = g.createImageData(size, size)
  for (let i = 0; i < vals.length; i++) {
    // 均值 0.5 → 255；±0.5 → 255 ∓ GRAIN_AMP
    const q = Math.max(0, Math.min(255, Math.round(255 + (vals[i] - 0.5) * 2 * GRAIN_AMP)))
    const o = i * 4
    img.data[o] = q
    img.data[o + 1] = q
    img.data[o + 2] = q
    img.data[o + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c
}
