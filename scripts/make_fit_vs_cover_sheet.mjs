// 对比：object-cover 居中裁切  vs  fit_scene.py 内容感知裁切
// 上排 = 浏览器现在的做法（居中，上下各裁 18.9%）
// 下排 = fit_scene.py 的做法（按细节能量选窗口，输出正好 1200×420）
import fs from 'node:fs'
import zlib from 'node:zlib'

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c }
  return t
})()
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePNG(width, height, rgb) {
  const stride = width * 3
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride) }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}
function decodePNG(buf) {
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels, out = Buffer.alloc(height * stride)
  let rp = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++], line = raw.subarray(rp, rp + stride); rp += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0, b = prev ? prev[x] : 0, c = prev && x >= channels ? prev[x - channels] : 0
      let v = line[x]
      switch (filter) {
        case 1: v += a; break; case 2: v += b; break; case 3: v += (a + b) >> 1; break
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); break }
      }
      cur[x] = v & 0xff
    }
  }
  return { width, height, channels, data: out }
}

const CW = 400, CH = 140
function cropCover(img) {
  const scale = Math.max(CW / img.width, CH / img.height)
  const sw = CW / scale, sh = CH / scale
  const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2
  const out = Buffer.alloc(CH * CW * 3)
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    const srcX = Math.min(img.width - 1, Math.floor(sx + (x + 0.5) / scale))
    const srcY = Math.min(img.height - 1, Math.floor(sy + (y + 0.5) / scale))
    const si = (srcY * img.width + srcX) * img.channels, di = (y * CW + x) * 3
    out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2]
  }
  return out
}
function resizeTo(img, tw, th) {
  const out = Buffer.alloc(tw * th * 3)
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
    const srcX = Math.min(img.width - 1, Math.floor((x + 0.5) * img.width / tw))
    const srcY = Math.min(img.height - 1, Math.floor((y + 0.5) * img.height / th))
    const si = (srcY * img.width + srcX) * img.channels, di = (y * tw + x) * 3
    out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2]
  }
  return out
}

const SRC = 'public/assets/scenes'
const FIT = '.workbuddy/fit_test'
const pairs = []
for (const f of fs.readdirSync(SRC).sort()) pairs.push([f, f])
const FITN = ['d01', 'd02', 'd03', 'd04', 'd05', 'd06', 'd07', 'd08', 'd09', 'd10', 'd11']

const GAP = 6, ROWLBL = 18
const COLS = 3
const ROWS = Math.ceil(FITN.length / COLS)
const W = CW * COLS + GAP * (COLS + 1)
const H = (CH * 2 + ROWLBL + GAP) * ROWS + GAP * (ROWS + 1)
const sheet = Buffer.alloc(W * H * 3, 0x1a)
for (let i = 0; i < W * H; i++) { sheet[i * 3] = 26; sheet[i * 3 + 1] = 26; sheet[i * 3 + 2] = 26 }

FITN.forEach((name, idx) => {
  const col = idx % COLS, row = Math.floor(idx / COLS)
  const ox = GAP + col * (CW + GAP)
  const oy = GAP + row * (CH * 2 + ROWLBL + GAP)
  const src = decodePNG(fs.readFileSync(`${SRC}/${name}.png`))
  const top = cropCover(src)                        // 浏览器居中裁切
  const fitImg = decodePNG(fs.readFileSync(`${FIT}/d${15 + idx}.png`))  // fit_scene 输出
  const bot = resizeTo(fitImg, CW, CH)             // fit_scene 结果缩到容器大小
  // 必须逐行拷贝：sheet 的行距是 W(1224)，不是 CW(400)，整块 copy 会把行涂抹
  for (let y = 0; y < CH; y++) {
    top.copy(sheet, ((oy + 4 + y) * W + ox) * 3, y * CW * 3, (y + 1) * CW * 3)
    bot.copy(sheet, ((oy + 4 + CH + 4 + y) * W + ox) * 3, y * CW * 3, (y + 1) * CW * 3)
  }
  // 上排下边画红线：居中裁切的可见下界
  for (let x = 0; x < CW; x++) { const di = ((oy + 4 + CH - 1) * W + ox + x) * 3; sheet[di] = 210; sheet[di + 1] = 70; sheet[di + 2] = 70 }
})

fs.writeFileSync('.workbuddy/shots/scenes/fit-vs-cover.png', encodePNG(W, H, sheet))
console.log(`已生成 .workbuddy/shots/scenes/fit-vs-cover.png (${W}x${H})`)
console.log('每组：上 = 浏览器居中裁切（现状），下 = fit_scene.py 内容感知裁切')
