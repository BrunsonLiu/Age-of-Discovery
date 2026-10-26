// 生成「玩家实际看到的样子」对比表：
// 把每张场景图按 object-cover 到 400:140 的实际裁切规则裁一遍，
// 再拼成一张 contact sheet，直观暴露"哪些图被裁坏了"。
import fs from 'node:fs'
import zlib from 'node:zlib'

// —— PNG 编码 ——
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
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function encodePNG(width, height, rgb) {
  const stride = width * 3
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// —— 复刻 map-legibility 的解码器 ——
function decodePNG(buf) {
  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  let rp = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++]
    const line = raw.subarray(rp, rp + stride); rp += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= channels ? prev[x - channels] : 0
      let v = line[x]
      switch (filter) {
        case 1: v += a; break
        case 2: v += b; break
        case 3: v += (a + b) >> 1; break
        case 4: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); break }
      }
      cur[x] = v & 0xff
    }
  }
  return { width, height, channels, data: out }
}

// —— 裁切：模拟 object-cover（scale 取 max，垂直居中）——
// scale 是「源图缩到目标」的倍数（>1 表示缩小），故目标像素 x 对应源像素 sx + x/scale。
const CW = 400, CH = 140
function cropCover(img) {
  const scale = Math.max(CW / img.width, CH / img.height)
  const sw = CW / scale, sh = CH / scale
  const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2
  const out = Buffer.alloc(CH * CW * 3)
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const srcX = Math.min(img.width - 1, Math.floor(sx + (x + 0.5) / scale))
      const srcY = Math.min(img.height - 1, Math.floor(sy + (y + 0.5) / scale))
      const si = (srcY * img.width + srcX) * img.channels
      const di = (y * CW + x) * 3
      out[di] = img.data[si]; out[di + 1] = img.data[si + 1]; out[di + 2] = img.data[si + 2]
    }
  }
  return out
}

// —— 拼 contact sheet：每行一张，右上角标裁切损失 ——
const dir = 'public/assets/scenes'
const files = fs.readdirSync(dir).sort()
const GAP = 8, LABEL = 16
const W = CW * 3 + GAP * 4
const H = (CH + LABEL + GAP) * Math.ceil(files.length / 3) + GAP
const sheet = Buffer.alloc(W * H * 3, 0x22)
for (let i = 0; i < W * H; i++) { sheet[i * 3] = 0x22; sheet[i * 3 + 1] = 0x22; sheet[i * 3 + 2] = 0x22 }

files.forEach((f, idx) => {
  const img = decodePNG(fs.readFileSync(`${dir}/${f}`))
  const cropped = cropCover(img)
  const col = idx % 3, row = Math.floor(idx / 3)
  const ox = GAP + col * (CW + GAP)
  const oy = GAP + row * (CH + LABEL + GAP)
  for (let y = 0; y < CH; y++) {
    cropped.copy(sheet, ((oy + y) * W + ox) * 3, y * CW * 3, (y + 1) * CW * 3)
  }
  // 边界标记：上/下裁切线（红=裁掉的区域边界）
  for (let x = 0; x < CW; x++) {
    let di = ((oy + 0) * W + ox + x) * 3; sheet[di] = 220; sheet[di + 1] = 60; sheet[di + 2] = 60
    di = ((oy + CH - 1) * W + ox + x) * 3; sheet[di] = 220; sheet[di + 1] = 60; sheet[di + 2] = 60
  }
})

fs.writeFileSync('.workbuddy/shots/scenes/contact-sheet-cropped.png', encodePNG(W, H, sheet))
console.log(`已生成 .workbuddy/shots/scenes/contact-sheet-cropped.png (${W}x${H})`)
console.log('每格 = 该场景在 400:140 容器里的真实呈现；红线 = 被裁掉的上下边界')
