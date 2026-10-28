/**
 * 生成 2.5D 海图的羊皮纸画风贴图。
 *
 *   node scripts/gen_map_paint.mjs
 *
 * 输入（都在仓库里，可复现）：
 *   public/data/land.geojson   海岸线多边形（ne_50m_land）
 *   public/data/elev-map.png   8bit 高程图（Web Mercator，0..255 → -200..9000m）
 *                               由 AWS terrarium 瓦片生成，见 README 备注
 *
 * 输出：
 *   public/data/painted-land.png   陆地贴图（羊皮纸底 + 森林簇 + 高地 + 雪线 + 海岸沙带）
 *   public/data/painted-sea.png    海面贴图（深青 + 波纹 + 近岸浅滩）
 *
 * 为什么不用 PIL/numpy：本机没有，且离线可复现比依赖科学计算栈更重要。
 * 全部手写 PNG 编解码 + 扫描线光栅化 + 值噪声 fbm。
 */
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA = path.join(ROOT, 'public', 'data')

/** 内部计算分辨率（距离场与噪声都在这一层做，最后降采样） */
const CW = 2048, CH = 1024
/** 输出分辨率 */
const OUT_W = 1024, OUT_H = 512

// ---------------------------------------------------------------- PNG
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function writePNG(file, w, h, rgb) {
  const src = Buffer.from(rgb.buffer, rgb.byteOffset, rgb.length)
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    src.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]))
}
/** 读 8bit 灰度或 RGB 的 PNG（通道数由 colorType 决定） */
function readPNG(file) {
  const d = fs.readFileSync(file)
  let i = 8, idat = [], w = 0, h = 0, ct = 0
  while (i < d.length) {
    const len = d.readUInt32BE(i), typ = d.toString('ascii', i + 4, i + 8)
    if (typ === 'IHDR') { w = d.readUInt32BE(i + 8); h = d.readUInt32BE(i + 12); ct = d[i + 17] }
    else if (typ === 'IDAT') idat.push(d.subarray(i + 8, i + 8 + len))
    i += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const nch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct], stride = w * nch
  const out = Buffer.alloc(w * h * nch); let prev = Buffer.alloc(stride), pos = 0
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let y = 0; y < h; y++) {
    const ft = raw[pos++]
    const line = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride
    if (ft === 1) for (let x = nch; x < stride; x++) line[x] = (line[x] + line[x - nch]) & 255
    else if (ft === 2) for (let x = 0; x < stride; x++) line[x] = (line[x] + prev[x]) & 255
    else if (ft === 3) for (let x = 0; x < stride; x++) { const a = x >= nch ? line[x - nch] : 0; line[x] = (line[x] + ((a + prev[x]) >> 1)) & 255 }
    else if (ft === 4) for (let x = 0; x < stride; x++) { const a = x >= nch ? line[x - nch] : 0, c = x >= nch ? prev[x - nch] : 0; line[x] = (line[x] + paeth(a, prev[x], c)) & 255 }
    line.copy(out, y * stride); prev = line
  }
  return { w, h, nch, data: out }
}

// ---------------------------------------------------------------- 陆地遮罩（扫描线填充）
/**
 * 把 land.geojson 的多边形光栅成 1=陆 / 0=海的位图。
 * 逐点做点在多边形内判定是 O(像素×边) —— 2048×1024 要跑几分钟；
 * 扫描线填充是 O(边 + 交点)，秒级。
 */
function rasterizeLand(geojson, W, H) {
  const mask = new Uint8Array(W * H)
  // 按 y 方向把边分桶，减少无效比较
  const edges = []
  for (const f of geojson.features) {
    const g = f.geometry
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
    for (const poly of polys) {
      for (const ring of poly) {
        for (let i = 0; i + 1 < ring.length; i++) {
          const [x0, y0] = ring[i], [x1, y1] = ring[i + 1]
          if (y0 === y1) continue
          edges.push([x0, y0, x1, y1])
        }
      }
    }
  }
  const mercY = (lat) => (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * H
  const mercX = (lon) => (lon + 180) / 360 * W

  // 每条边的 y 落在哪几行 → 桶
  const buckets = Array.from({ length: H }, () => [])
  for (const e of edges) {
    const ay = mercY(e[1]), by = mercY(e[3])
    const y0 = Math.max(0, Math.min(H - 1, Math.floor(Math.min(ay, by))))
    const y1 = Math.max(0, Math.min(H - 1, Math.ceil(Math.max(ay, by))))
    const ax = mercX(e[0]), bx = mercX(e[2])
    for (let row = y0; row <= y1; row++) buckets[row].push(ax, ay, bx, by)
  }
  for (let row = 0; row < H; row++) {
    const b = buckets[row]
    if (!b.length) continue
    const xs = []
    for (let i = 0; i < b.length; i += 4) {
      const ax = b[i], ay = b[i + 1], bx = b[i + 2], by = b[i + 3]
      if ((ay <= row && by > row) || (by <= row && ay > row)) {
        xs.push(ax + ((row - ay) / (by - ay)) * (bx - ax))
      }
    }
    if (!xs.length) continue
    xs.sort((p, q) => p - q)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k])), xb = Math.min(W - 1, Math.floor(xs[k + 1]))
      for (let x = xa; x <= xb; x++) mask[row * W + x] = 1
    }
  }
  return mask
}

// ---------------------------------------------------------------- 距离场（chamfer 5-7-11）
function distanceField(mask, W, H) {
  const D = new Float32Array(W * H)
  const BIG = 1e9
  for (let i = 0; i < W * H; i++) {
    if (!mask[i]) { D[i] = 0; continue }
    const x = i % W, y = (i / W) | 0
    let coast = false
    for (let dy = -1; dy <= 1 && !coast; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) { coast = true; break }
        if (!mask[yy * W + xx]) { coast = true; break }
      }
    }
    D[i] = coast ? 1 : BIG
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x; let v = D[i]
      if (y > 0) {
        if (x > 0) v = Math.min(v, D[i - W - 1] + 5)
        v = Math.min(v, D[i - W] + 7)
        if (x < W - 1) v = Math.min(v, D[i - W + 1] + 5)
      }
      if (x > 0) v = Math.min(v, D[i - 1] + 7)
      D[i] = v
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; let v = D[i]
      if (y < H - 1) {
        if (x < W - 1) v = Math.min(v, D[i + W + 1] + 5)
        v = Math.min(v, D[i + W] + 7)
        if (x > 0) v = Math.min(v, D[i + W - 1] + 5)
      }
      if (x < W - 1) v = Math.min(v, D[i + 1] + 7)
      D[i] = v
    }
  }
  return D
}

/**
 * 海侧距离场：每个**海像素**到最近陆地的距离（chamfer 5-7-11，单位像素）。
 *
 * 【为什么要单独一份，不能复用 distanceField】
 * distanceField() 对非掩罩像素直接写 0。对陆地掩罩而言，
 * 非掩码 = 海 → 陆地的「到岸距离」正常；海像素拿到 0。
 * 于是海面分支里的条件 `d > 0 && d < 5` **永远不成立** —— 浅滩带写了但没生效。
 * 这里单独算一份海侧距离。
 *
 * 【边界不当作海岸】
 * distanceField() 把图像边界视作海岸（越界即 coast）。
 * 对陆地来说这几乎无害（地图上下边缘基本没陆地）；
 * 但对海来说，越界 = 离岸极近 → 地图最上/最下的空白海域会被染成一整条亮边。
 * 所以这里越界**不算**海岸，只认真正的陆地像素。
 */
function seaDistanceField(mask, W, H) {
  const D = new Float32Array(W * H)
  const BIG = 1e9
  for (let i = 0; i < W * H; i++) {
    if (mask[i]) { D[i] = BIG; continue }   // 陆地不当源、也不参与传递
    const x = i % W, y = (i / W) | 0
    let coast = false
    for (let dy = -1; dy <= 1 && !coast; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy
        if (xx < 0 || xx >= W || yy < 0 || yy >= H) continue   // 越界不算海岸
        if (mask[yy * W + xx]) { coast = true; break }
      }
    }
    D[i] = coast ? 1 : BIG
  }
  // 两遍 chamfer。陆地像素的值会被邻接海像素抬高（BIG→有限值），
  // 但它永远 ≥ 该海像素自身的值 + 7，不会污染海侧结果，故不必额外排除。
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x; let v = D[i]
      if (y > 0) {
        if (x > 0) v = Math.min(v, D[i - W - 1] + 5)
        v = Math.min(v, D[i - W] + 7)
        if (x < W - 1) v = Math.min(v, D[i - W + 1] + 5)
      }
      if (x > 0) v = Math.min(v, D[i - 1] + 7)
      D[i] = v
    }
  }
  for (let y = H - 1; y >= 0; y--) {
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; let v = D[i]
      if (y < H - 1) {
        if (x < W - 1) v = Math.min(v, D[i + W + 1] + 5)
        v = Math.min(v, D[i + W] + 7)
        if (x > 0) v = Math.min(v, D[i + W - 1] + 5)
      }
      if (x < W - 1) v = Math.min(v, D[i + 1] + 7)
      D[i] = v
    }
  }
  return D
}

// ---------------------------------------------------------------- 噪声
function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}
function fbm(x, y, oct) {
  let s = 0, amp = 1, norm = 0, fx = x, fy = y
  for (let o = 0; o < oct; o++) { s += vnoise(fx, fy) * amp; norm += amp; amp *= 0.5; fx *= 2; fy *= 2 }
  return s / norm
}

// ---------------------------------------------------------------- 主流程
const mix = (a, b, t) => a + (b - a) * t
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

console.log('读取 land.geojson …')
const geo = JSON.parse(fs.readFileSync(path.join(DATA, 'land.geojson'), 'utf8'))
console.log('光栅化陆地遮罩 …')
const mask = rasterizeLand(geo, CW, CH)
let landPx = 0
for (let i = 0; i < mask.length; i++) if (mask[i]) landPx++
console.log(`  ${CW}×${CH} 陆地占比 ${(landPx / mask.length * 100).toFixed(1)}%`)

console.log('读取高程图 …')
const elev = readPNG(path.join(DATA, 'elev-map.png'))
if (elev.w !== CW || elev.h !== CH) throw new Error(`elev-map.png 尺寸应为 ${CW}×${CH}，实际 ${elev.w}×${elev.h}`)

console.log('计算海岸距离场 …')
const dist = distanceField(mask, CW, CH)
const seaDist = seaDistanceField(mask, CW, CH)

console.log('绘制 …')
const landRGB = new Uint8Array(CW * CH * 3)
const seaRGB = new Uint8Array(CW * CH * 3)
for (let y = 0; y < CH; y++) {
  for (let x = 0; x < CW; x++) {
    const i = y * CW + x
    const isLand = mask[i] === 1
    const e = elev.data[i] * 9200 / 255 - 200
    const d = dist[i] / 7
    const nForest = fbm(x / 46, y / 46, 4)
    const nDetail = fbm(x / 11, y / 11, 3)
    const nStretch = fbm(x / 90, y / 22, 3)

    if (isLand) {
      let r, g, b
      if (e < 150) { r = 0.66; g = 0.58; b = 0.36 }
      else if (e < 500) { r = 0.63; g = 0.55; b = 0.32 }
      else if (e < 1100) { r = 0.60; g = 0.50; b = 0.28 }
      else if (e < 2000) { r = 0.57; g = 0.45; b = 0.26 }
      else if (e < 3200) { r = 0.55; g = 0.44; b = 0.30 }
      else { r = 0.60; g = 0.55; b = 0.46 }
      // 森林簇
      const fTh = 0.54 - clamp(e / 6000, 0, 0.16)
      const forest = clamp((nForest - fTh) / 0.10, 0, 1) * clamp((e + 100) / 400, 0, 1) * clamp((3200 - e) / 900, 0, 1)
      if (forest > 0) {
        const fr = 0.26 + nDetail * 0.10, fg = 0.31 + nDetail * 0.12, fb = 0.16 + nDetail * 0.06
        r = mix(r, fr, forest * 0.85); g = mix(g, fg, forest * 0.85); b = mix(b, fb, forest * 0.85)
      }
      const det = (nDetail - 0.5) * 0.09
      r += det; g += det * 0.9; b += det * 0.7
      if (e > 3800) { const s = clamp((e - 3800) / 900, 0, 1) * 0.85; r = mix(r, 0.86, s); g = mix(g, 0.83, s); b = mix(b, 0.76, s) }
      // 海岸沙带 + 一线深色描边
      if (d < 7) { const s = clamp(1 - d / 7, 0, 1); const k = s * s * 0.8; r = mix(r, 0.83, k); g = mix(g, 0.75, k); b = mix(b, 0.54, k) }
      if (d < 1.6) { const k = (1 - d / 1.6) * 0.45; r *= 1 - k; g *= 1 - k; b *= 1 - k }
      landRGB[i * 3] = clamp(r, 0, 1) * 255
      landRGB[i * 3 + 1] = clamp(g, 0, 1) * 255
      landRGB[i * 3 + 2] = clamp(b, 0, 1) * 255
    }

    // ---- 海：深青 + 横向波纹 + 近岸浅滩 ----
    {
      // 【为什么海面贴图在陆地像素上也要写一遍】
      // 陆地板块的几何来自 land.geojson（精确多边形），
      // 而这里的遮罩是 2048×1024 光栅化再降采样到 1024×512 的，
      // 两者在海岸线处必然有最多约 1 个纹素（≈0.35°）的错位。
      // 陆地板块在海面之上（y=0 vs y=-0.089），正常情况下会盖住那片黑；
      // 但错位处会露出一圈黑边（实测海岸线有黑描边就是这么来的）。
      // 所以下面不区分 isLand，统一写一遍海色：
      //   - 真的是海的像素 → 深青 + 波纹 + 近岸浅滩
      //   - 落在陆地掩罩里的像素 → 藏在板块底下那片原本是纯黑 0,0,0，
      //     填成同样的深海色后，错位处露出的就是和周围一样的海水，看不见接缝。
      const deep = fbm(x / 140, y / 140, 3)
      let r = 0.095 + deep * 0.045, g = 0.245 + deep * 0.075, b = 0.295 + deep * 0.085
      const streak = clamp((nStretch - 0.52) / 0.22, 0, 1)
      r += streak * 0.055; g += streak * 0.090; b += streak * 0.100
      // 近岸浅滩。
      //
      // 【单位坑】chamfer 距离的权重是 5(对角) / 7(正交)，
      // 所以 D 值不是像素数，像素距离 ≈ D / 7。
      // 这里要的是「距岸 18 个内部纹素」（输出 1024 宽上约 9 纹素 ≈ 3.2° 经度）。
      // 早先直接写 `sd < 9` 相当于只有 1.3 个内部纹素 —— 浅滩细得看不见。
      //
      // 【必须用 seaDist，不能用 dist】
      // dist 是「陆地掩码内」的到岸距离，海像素恒为 0，
      // 早先写成 `d > 0 && d < 5` 的条件永远不成立 —— 浅滩带其实从未生效。
      const sd = seaDist[i] / 7
      if (sd < 18) { const t = clamp(1 - sd / 18, 0, 1); const k = t * t * 0.62; r = mix(r, 0.27, k); g = mix(g, 0.45, k); b = mix(b, 0.46, k) }
      seaRGB[i * 3] = clamp(r, 0, 1) * 255
      seaRGB[i * 3 + 1] = clamp(g, 0, 1) * 255
      seaRGB[i * 3 + 2] = clamp(b, 0, 1) * 255
    }
  }
}

// 陆地贴图的**海洋区**也填上同一份海色。
//
// 【为什么必须填】
// 陆地板块顶面的 UV 是按经纬度写进全球贴图的，顶面本身只覆盖陆地多边形，
// 正常不会采样到海洋像素；但两处会漏：
//   ① 双线性插值在海岸线处溢出约 1 纹素；
//   ② mipmap 缩小采样时，海区像素会被混进陆地边缘。
// 原来这里留的是未写入的纯黑 0,0,0 —— 混进来就是一圈黑边。
// 直接拷贝 seaRGB 的像素值，保证两张贴图的海洋区**像素级完全一致**，
// 任何泄漏都看不出接缝。
for (let i = 0; i < CW * CH; i++) {
  if (mask[i]) continue
  landRGB[i * 3] = seaRGB[i * 3]
  landRGB[i * 3 + 1] = seaRGB[i * 3 + 1]
  landRGB[i * 3 + 2] = seaRGB[i * 3 + 2]
}

// 降采样到输出分辨率（2×2 盒式）
function downsample(src, W, H, ow, oh) {
  const out = new Uint8Array(ow * oh * 3)
  const fx = W / ow, fy = H / oh
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      for (let c = 0; c < 3; c++) {
        let s = 0, n = 0
        for (let dy = 0; dy < fy; dy++) {
          const sy = Math.min(H - 1, Math.floor(y * fy) + dy)
          for (let dx = 0; dx < fx; dx++) {
            const sx = Math.min(W - 1, Math.floor(x * fx) + dx)
            s += src[(sy * W + sx) * 3 + c]; n++
          }
        }
        out[(y * ow + x) * 3 + c] = s / n
      }
    }
  }
  return out
}

console.log(`降采样到 ${OUT_W}×${OUT_H} …`)
const landOut = downsample(landRGB, CW, CH, OUT_W, OUT_H)
const seaOut = downsample(seaRGB, CW, CH, OUT_W, OUT_H)
writePNG(path.join(DATA, 'painted-land.png'), OUT_W, OUT_H, landOut)
writePNG(path.join(DATA, 'painted-sea.png'), OUT_W, OUT_H, seaOut)
console.log('完成：public/data/painted-land.png、painted-sea.png')
