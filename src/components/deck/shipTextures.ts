import * as THREE from 'three'

/**
 * 船上视角用的程序化材质（船壳木板 / 甲板 / 帆布 / 帆的破洞 alpha）。
 *
 * 【为什么自己生成，不用现成贴图】它们的来源项目就是全程序化生成的：
 * 不引外部资源、体积为零、任意分辨率。我们沿用这条路线——顺带避免
 * 再给仓库塞几张 1MB 的贴图，也让"木纹的种子"可以被固定（同一艘船每次一样）。
 *
 * 【为什么这些函数都带 seed】船壳、甲板、帆各自要**不同的**木纹/织纹，
 * 但每一块木板又必须每次进入都一样（否则玩家会觉得船在变）。种子固定即可。
 */

/** 确定性随机数（线性同余，够用且不依赖 Math.random 的不可复现） */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

export function texFrom(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.RepeatWrapping
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  /*
   * 各向异性 8（原 4）：甲板是**贴着视线**的平面，纹理在屏幕上一个方向被压到
   * 几分之一像素、另一个方向还有几十像素。4 倍时 GPU 会掉到较粗的 mip，板缝
   * 被采样成"断续的台阶"（放大截图：整片甲板像砖砌），8 倍才能让一条缝连续。
   */
  t.anisotropy = 8
  return t
}

/**
 * 高度图 → 法线图（Sobel）。
 *
 * 【为什么自己算】three 的 examples 里有 `bumpMapToNormalMap`，但我们不引 jsm
 * （对方项目 file:// 直开也是这个理由）。Sobel 十行代码，且能控制强度。
 */
export function normalFromCanvas(src: HTMLCanvasElement, strength = 2): THREE.CanvasTexture {
  const w = src.width
  const h = src.height
  const g0 = src.getContext('2d')!
  const data = g0.getImageData(0, 0, w, h).data
  const [c, g] = canvas(w, h)
  const out = g.createImageData(w, h)
  const at = (x: number, y: number) => {
    const xx = (x + w) % w
    const yy = (y + h) % h
    return data[(yy * w + xx) * 4] / 255
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
      let nx = dx * strength
      let ny = dy * strength
      const nz = 1
      const l = Math.hypot(nx, ny, nz) || 1
      nx /= l
      ny /= l
      const i = (y * w + x) * 4
      out.data[i] = (nx * 0.5 + 0.5) * 255
      out.data[i + 1] = (ny * 0.5 + 0.5) * 255
      out.data[i + 2] = (nz / l * 0.5 + 0.5) * 255
      out.data[i + 3] = 255
    }
  }
  g.putImageData(out, 0, 0)
  return texFrom(c, false)
}

export interface PlankOptions {
  seed: number
  /** 板缝方向：'h' 横向铺（船壳）/ 'v' 纵向铺（甲板） */
  along?: 'h' | 'v'
  rows?: number
  /** 底色（木） */
  base?: [number, number, number]
  /** 板缝色 */
  seam?: string
  /** 缝的粗细（像素） */
  seamW?: number
  wear?: number
  /** 年轮（纹理线）的强度倍率，0 = 只留板缝与板色差（甲板用） */
  grain?: number
  /** 贴图边长（默认 512；甲板用 1024，板缝在掠射角下才不糊） */
  size?: number
  /** 每块板的端头接缝（brick 状），只在 along='v' 时有效 */
  buttJoints?: boolean
  /** 中央走道的磨损强度（0 = 不加），只在 along='v' 时有效 */
  traffic?: number
}

/**
 * 木板：每块板的色差 + 年轮 + 板缝 + 钉子。
 *
 * 【要点在"板与板不一样"】整张图用同一个底色画，看起来就是一块印刷木板；
 * 每块板抖动亮度/色相，再各画几道年轮，才有"拼起来的"感觉。
 */
export function plankCanvas(opts: PlankOptions): HTMLCanvasElement {
  const { seed, along = 'h', rows = 8, base = [92, 64, 40], seam = 'rgba(20,12,6,0.85)', seamW = 2, wear = 0.5, grain = 1, size = 512, buttJoints = false, traffic = 0 } = opts
  const S = size
  const [c, g] = canvas(S, S)
  const rnd = rng(seed)
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`
  g.fillRect(0, 0, S, S)

  const step = S / rows
  for (let i = 0; i < rows; i++) {
    const jitter = (rnd() - 0.5) * 26
    const r = Math.max(0, Math.min(255, base[0] + jitter))
    const gg = Math.max(0, Math.min(255, base[1] + jitter * 0.8))
    const b = Math.max(0, Math.min(255, base[2] + jitter * 0.6))
    g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`
    if (along === 'h') g.fillRect(0, i * step, S, step)
    else g.fillRect(i * step, 0, step, S)

    /*
     * 年轮：沿板长方向的几条深浅线。
     *
     * 【为什么抖动必须很小】原先每 32px 抖 ±4px（±2）。在**人眼高度**看甲板时，
     * 一张 512 的贴图被压到十几像素高，这点抖动经过各向异性过滤与法线贴图放大，
     * 读成一条条"闪电状折线"（实测截图：整片甲板像锯末迷宫）。木纹本来就是
     * 低频的，改成每 64px 抖 ±1.4px、透明度减半，它才回到"纹"而不是"纹的锯齿"。
     */
    const lines = Math.round((3 + Math.floor(rnd() * 3)) * grain)
    for (let k = 0; k < lines; k++) {
      g.strokeStyle = `rgba(${(r * 0.62) | 0},${(gg * 0.55) | 0},${(b * 0.5) | 0},${0.10 + rnd() * 0.14})`
      g.lineWidth = 0.6 + rnd() * 1.2
      g.beginPath()
      if (along === 'h') {
        const y = i * step + 3 + rnd() * (step - 6)
        g.moveTo(0, y)
        let j = 0
        for (let x = 0; x <= S; x += 64) { j += (rnd() - 0.5) * 2.8; g.lineTo(x, y + Math.max(-2.2, Math.min(2.2, j))) }
      } else {
        const x = i * step + 3 + rnd() * (step - 6)
        g.moveTo(x, 0)
        let j = 0
        for (let y = 0; y <= S; y += 64) { j += (rnd() - 0.5) * 2.8; g.lineTo(x + Math.max(-2.2, Math.min(2.2, j)), y) }
      }
      g.stroke()
    }

    // 板缝
    g.fillStyle = seam
    if (along === 'h') g.fillRect(0, i * step, S, seamW)
    else g.fillRect(i * step, 0, seamW, S)

    /*
     * 端头接缝：一块板不可能有 36 米长。每列（along='v'）在随机 y 处断一刀，
     * 错开成 brick 状 —— 这是"甲板"与"木地板"最直观的区别之一。
     */
    if (buttJoints && along === 'v') {
      const by = Math.floor(rnd() * S)
      g.fillStyle = seam
      g.fillRect(i * step, by, step, Math.max(1.6, seamW * 0.9))
    }

    // 钉子：靠缝、每隔一段一颗（近看才有信息量）
    if (wear > 0.2) {
      const nails = 3 + Math.floor(rnd() * 3)
      for (let k = 0; k < nails; k++) {
        const t = (k + 0.35 + rnd() * 0.3) / nails
        const nx = along === 'h' ? t * S : i * step + step * 0.5
        const ny = along === 'h' ? i * step + step * 0.5 : t * S
        g.fillStyle = `rgba(30,22,14,${0.5 + rnd() * 0.3})`
        g.beginPath()
        g.arc(nx, ny, 1.4, 0, Math.PI * 2)
        g.fill()
      }
    }
  }
  /*
   * ---- 中央走道：甲板被踩了几十年的地方 ----
   *
   * 【为什么必须是"横向剖面"】甲板的 uv 里 u 是横向（24 块板沿 u 排开）、v 是船长
   * 方向，且 repeat 只沿 v——所以一条按 u 的亮度剖面正好等于"沿船长的一条带"。
   *
   * 【为什么加的痕是这两样】真实的甲板磨损只有两种可见形态：
   *   ① 中间一条被鞋底和货箱磨白的带（木头表层磨掉，露出更浅的纤维）；
   *   ② 排水沟与舷边积着深色的垢（水往两边流、脏东西留在那）。
   * 两样都不是"随机斑点"：随机斑点在掠射角下读成脏点，反而更像没渲染干净。
   * 拖痕单独画：缆绳与货箱拖过留下的是**沿船长方向的长短线**，不是圆斑。
   */
  if (traffic > 0 && along === 'v') {
    const grad = g.createLinearGradient(0, 0, S, 0)
    /*
     * 剖面：两侧 0.50（水沟积垢）→ 0.26 处回升 → 中线 0.24 的**偏冷**提亮
     * （磨掉的木纤维是灰白的，不是加了一层黄光；先用暖白试过，甲板中心读作
     * "被灯照亮的台面"，实测截图）。
     */
    grad.addColorStop(0, 'rgba(22,13,7,0.58)')
    grad.addColorStop(0.22, 'rgba(22,13,7,0.20)')
    grad.addColorStop(0.4, 'rgba(228,224,214,0.10)')
    grad.addColorStop(0.5, 'rgba(234,231,222,0.30)')
    grad.addColorStop(0.6, 'rgba(228,224,214,0.10)')
    grad.addColorStop(0.78, 'rgba(22,13,7,0.20)')
    grad.addColorStop(1, 'rgba(22,13,7,0.58)')
    g.save()
    g.globalAlpha = Math.min(1, traffic)
    g.fillStyle = grad
    g.fillRect(0, 0, S, S)
    // 拖痕：十几道沿 v 的细擦痕，集中在中间 60% 的宽度里
    for (let k = 0; k < 16; k++) {
      const x = S * (0.2 + 0.6 * rnd())
      const y0 = rnd() * S
      const len = S * (0.08 + 0.22 * rnd())
      g.strokeStyle = rnd() < 0.5
        ? `rgba(255,240,214,${0.05 + 0.07 * rnd()})`
        : `rgba(30,20,12,${0.06 + 0.08 * rnd()})`
      g.lineWidth = 1 + rnd() * 2.4
      g.beginPath()
      g.moveTo(x, y0)
      // 擦痕略微歪斜：人手拖出来的不会完全平行于板缝
      g.lineTo(x + (rnd() - 0.5) * S * 0.02, y0 + len)
      g.stroke()
    }
    g.restore()
  }
  return c
}

/** 帆布：底布 + 织纹 + 补丁 + 拼缝（不含破洞，破洞在 alpha 里） */
export function sailCanvas(seed = 7): HTMLCanvasElement {
  const S = 512
  const [c, g] = canvas(S, S)
  const rnd = rng(seed)
  // 底色：老帆布偏灰米，不是纯白
  g.fillStyle = '#e6ddc4'
  g.fillRect(0, 0, S, S)

  /*
   * 织纹：两组正交细线（横/纵），模拟经纬。
   *
   * 【间距 3px → 5px】512 的贴图铺满一张 10 米宽的帆，3px 一格约合 6 厘米 ——
   * 站在 10 米外看，这个周期正好落进屏幕像素的混叠区：帆面上出现一层会随视角
   * 移动的**网格摩尔纹**（实测截图：整张帆像罩了一块纱窗）。5px（约 10 厘米）
   * 仍读作帆布，但落在奈奎斯特频率以外。透明度也从 0.16 收到 0.13。
   */
  g.globalAlpha = 0.13
  for (let i = 0; i < S; i += 5) {
    g.strokeStyle = i % 6 === 0 ? '#cdc2a4' : '#f1e9d2'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(0, i + 0.5)
    g.lineTo(S, i + 0.5)
    g.stroke()
    g.beginPath()
    g.moveTo(i + 0.5, 0)
    g.lineTo(i + 0.5, S)
    g.stroke()
  }
  g.globalAlpha = 1

  // 拼缝：帆是几幅布缝起来的，横竖各两三道
  g.strokeStyle = 'rgba(150,134,104,0.38)'
  g.lineWidth = 3
  for (let i = 1; i <= 3; i++) {
    const y = (S / 4) * i
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(S, y)
    g.stroke()
  }
  g.lineWidth = 2
  for (let i = 1; i <= 2; i++) {
    const x = (S / 3) * i
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, S)
    g.stroke()
  }

  // 补丁：2~4 块，颜色略深、边缘有缝线
  const patches = 2 + Math.floor(rnd() * 3)
  for (let i = 0; i < patches; i++) {
    const w = 40 + rnd() * 90
    const h = 30 + rnd() * 70
    const x = rnd() * (S - w)
    const y = rnd() * (S - h)
    g.fillStyle = `rgba(${190 + rnd() * 24 | 0},${178 + rnd() * 20 | 0},${146 + rnd() * 18 | 0},0.42)`
    g.fillRect(x, y, w, h)
    g.strokeStyle = 'rgba(96,82,60,0.65)'
    g.setLineDash([4, 3])
    g.lineWidth = 1.6
    g.strokeRect(x + 2, y + 2, w - 4, h - 4)
    g.setLineDash([])
  }

  // 污渍：几团低对比的暗斑，避免整片帆"太干净"
  for (let i = 0; i < 6; i++) {
    const x = rnd() * S
    const y = rnd() * S
    const r = 30 + rnd() * 80
    const grd = g.createRadialGradient(x, y, 0, x, y, r)
    grd.addColorStop(0, 'rgba(120,108,84,0.10)')
    grd.addColorStop(1, 'rgba(96,84,62,0)')
    g.fillStyle = grd
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

/**
 * 帆的 alpha：白 = 有布，黑 = 破洞。
 *
 * 【破口为什么开在"靠上、靠边"的位置】帆底边是绑在帆桁上的、左右是包边，
 * 那些地方破是不合理的。真实的破口来自上方撕裂与中部磨穿，所以洞集中在上 2/3。
 */
export function sailAlphaCanvas(seed = 11): HTMLCanvasElement {
  const S = 512
  const [c, g] = canvas(S, S)
  const rnd = rng(seed)
  g.fillStyle = '#fff'
  g.fillRect(0, 0, S, S)

  // 底部与两侧包边：稍微压暗（alphaMap 只取绿色，压暗=半透，这里保持 1）
  g.fillStyle = '#ffffff'
  g.fillRect(0, S * 0.9, S, S * 0.1)

  /*
   * 破洞：2~3 个**小**洞，靠近上缘与边缘。
   *
   * 【为什么从 4~7 个 8~42px 改成 2~3 个 5~14px】帆的材质是
   * `alphaTest: 0.32` —— 洞里的像素被**丢弃**，后面什么都没有，于是透出天空的
   * 蓝。一张 512px 的贴图铺到屏幕上约 200px 宽时，42px 的洞是 16px 的**蓝斑**，
   * 一张帆上有五六个，读作"贴图坏了"而不是"旧帆有个洞"（实测放大截图）。
   * 缩小之后它读作边缘磨破，那才是这个尺度上该有的细节。
   */
  const holes = 2 + Math.floor(rnd() * 2)
  for (let i = 0; i < holes; i++) {
    const cx = S * (0.15 + rnd() * 0.7)
    const cy = S * (0.08 + rnd() * 0.42)
    const r = 5 + rnd() * 9
    g.fillStyle = '#000'
    g.beginPath()
    const seg = 7 + Math.floor(rnd() * 4)
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2
      const rr = r * (0.55 + rnd() * 0.75)
      const x = cx + Math.cos(a) * rr
      const y = cy + Math.sin(a) * rr * 0.8
      if (k === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.closePath()
    g.fill()
  }

  /*
   * 上缘撕裂：沿顶边咬掉几口（同样收小：40px 宽、22px 深的口子在屏幕上
   * 是一道 15px 的蓝缺口，太抢眼）。真实帆的上缘多半是**包了绳的**，
   * 撕裂集中在一两处。
   */
  g.fillStyle = '#000'
  for (let i = 0; i < 3; i++) {
    const x = rnd() * S
    const w = 10 + rnd() * 18
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x + w, 0)
    g.lineTo(x + w * 0.5, 4 + rnd() * 10)
    g.closePath()
    g.fill()
  }
  return c
}

/**
 * 贴着船体的水沫带贴图（白，alpha 里断续）。
 *
 * u = 从船体到外侧（0 亮 1 淡）、v = 沿船长（0 船首 1 船尾）。
 *
 * 【为什么用像素级生成而不是 drawImage】要的是"絮"：一团团边缘毛糙的白沫，
 * 每团之间会断开。canvas 的椭圆 + 模糊出来的是糖霜，缺"被水搓开"的那种碎裂感。
 * 这里直接对每个像素算 alpha = 横向衰减 × 值噪声阈值 × 两端淡出，一次成型。
 */
export function foamStripCanvas(seed = 4417): HTMLCanvasElement {
  const W = 128
  const H = 512
  const [c, g] = canvas(W, H)
  const img = g.createImageData(W, H)
  const rnd = rng(seed)
  // 预生成 4 张哈希表（值噪声用）
  const T = 64
  const tbl: number[][] = Array.from({ length: 4 }, () => Array.from({ length: T * T }, () => rnd()))
  const hash = (k: number, ix: number, iy: number) => tbl[k][((iy % T) + T) % T * T + (((ix % T) + T) % T)]
  const noise = (k: number, x: number, y: number): number => {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const fx = x - ix
    const fy = y - iy
    const ux = fx * fx * (3 - 2 * fx)
    const uy = fy * fy * (3 - 2 * fy)
    const a = hash(k, ix, iy)
    const b = hash(k, ix + 1, iy)
    const cc = hash(k, ix, iy + 1)
    const d = hash(k, ix + 1, iy + 1)
    return (a + (b - a) * ux) * (1 - uy) + (cc + (d - cc) * ux) * uy
  }
  for (let y = 0; y < H; y++) {
    const v = y / H
    // 沿船长：船首略强、船尾渐弱、两端各留一点淡出（不要一条硬切边）
    const along = Math.min(1, v / 0.06) * Math.min(1, (1 - v) / 0.1) * (1.05 - 0.45 * v)
    // 细的与粗的两级噪声：粗的切段、细的做毛边
    const nCoarse = noise(0, v * 26, 0.5)
    const nFine = noise(1, v * 120, 1.5)
    const nEdge = noise(2, v * 46, 3.5)
    for (let x = 0; x < W; x++) {
      const u = x / W
      // 横向衰减：紧贴船体的一半最亮，外侧淡出
      const lateral = Math.pow(1 - u, 1.5) * (0.7 + 0.3 * nEdge)
      // 断续：粗噪声决定"这一段有没有沫"，细噪声把边缘啃碎
      const gate = Math.min(1, Math.max(0, (nCoarse * 0.72 + nFine * 0.28 - 0.26) / 0.3))
      let a = lateral * along * Math.pow(gate, 1.4)
      /*
       * 整体抬 1.55 倍：第一版乘 1.15 时，alpha 峰值只有 0.3 左右 —— 贴到海上
       * 叠加后就消失了（实测截图：船底一条白都没有，像悬空）。白沫在物理上本来就
       * 接近"不透明的白"，只是面积碎。
       */
      a = Math.min(1, a * 2.2)
      const i = (y * W + x) * 4
      img.data[i] = 255
      img.data[i + 1] = 255
      img.data[i + 2] = 255
      img.data[i + 3] = Math.round(a * 255)
    }
  }
  g.putImageData(img, 0, 0)
  return c
}
