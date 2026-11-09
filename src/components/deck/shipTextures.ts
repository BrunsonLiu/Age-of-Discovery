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
  t.anisotropy = 4
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
}

/**
 * 木板：每块板的色差 + 年轮 + 板缝 + 钉子。
 *
 * 【要点在"板与板不一样"】整张图用同一个底色画，看起来就是一块印刷木板；
 * 每块板抖动亮度/色相，再各画几道年轮，才有"拼起来的"感觉。
 */
export function plankCanvas(opts: PlankOptions): HTMLCanvasElement {
  const { seed, along = 'h', rows = 8, base = [92, 64, 40], seam = 'rgba(20,12,6,0.85)', seamW = 2, wear = 0.5 } = opts
  const S = 512
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

    // 年轮：沿板长方向的几条深浅线（端点带随机偏移，避免像条纹纸）
    const lines = 3 + Math.floor(rnd() * 3)
    for (let k = 0; k < lines; k++) {
      g.strokeStyle = `rgba(${(r * 0.62) | 0},${(gg * 0.55) | 0},${(b * 0.5) | 0},${0.18 + rnd() * 0.22})`
      g.lineWidth = 0.6 + rnd() * 1.6
      g.beginPath()
      if (along === 'h') {
        const y = i * step + 3 + rnd() * (step - 6)
        g.moveTo(0, y)
        for (let x = 0; x <= S; x += 32) g.lineTo(x, y + (rnd() - 0.5) * 4)
      } else {
        const x = i * step + 3 + rnd() * (step - 6)
        g.moveTo(x, 0)
        for (let y = 0; y <= S; y += 32) g.lineTo(x + (rnd() - 0.5) * 4, y)
      }
      g.stroke()
    }

    // 板缝
    g.fillStyle = seam
    if (along === 'h') g.fillRect(0, i * step, S, seamW)
    else g.fillRect(i * step, 0, seamW, S)

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

  // 织纹：两组正交细线（横/纵），模拟经纬
  g.globalAlpha = 0.16
  for (let i = 0; i < S; i += 3) {
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

  // 破洞：4~7 个不规则多边形
  const holes = 4 + Math.floor(rnd() * 4)
  for (let i = 0; i < holes; i++) {
    const cx = S * (0.15 + rnd() * 0.7)
    const cy = S * (0.08 + rnd() * 0.62)
    const r = 8 + rnd() * 34
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

  // 上缘撕裂：沿顶边咬掉几口
  g.fillStyle = '#000'
  for (let i = 0; i < 5; i++) {
    const x = rnd() * S
    const w = 12 + rnd() * 40
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x + w, 0)
    g.lineTo(x + w * 0.5, 6 + rnd() * 22)
    g.closePath()
    g.fill()
  }
  return c
}
