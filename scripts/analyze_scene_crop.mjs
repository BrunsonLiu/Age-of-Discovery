// 场景图裁切分析：object-cover 到 400:140 容器时，主体是否落在可见带内
//
// 事实（由比例决定，与渲染尺寸无关）：
//   容器 400:140 = 2.857，图 1200:675 = 1.778
//   cover 缩放 = max(400/1200, 140/675) = 0.3333
//   可见源图区 = y [127.5, 547.5]，即原图竖向的 19% ~ 81%
//   上下各被裁掉 18.9%
//
// 结论：前两批 prompt 要求的"底部 1/4 压暗"只剩 41px 可见；
// 且 EventScene 自身已叠底部渐变遮罩，这项要求是无效功。
// 真正要紧的是：主体必须落在中间 19%~81% 这条带子里。
import fs from 'node:fs'
import zlib from 'node:zlib'

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

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b
const dir = 'public/assets/scenes'
const TOP = 127, BOT = 547 // 可见带（1200x675 坐标系）

console.log('图例：可见带 = 原图竖向 19%~81%（y 128~547），上下各裁掉 18.9%\n')
console.log('文件    细节集中带(按行方差峰值)  可见带内细节占比  主体是否落在可见带  上缘裁切损失')
console.log('─'.repeat(96))

const rows = []
for (const f of fs.readdirSync(dir).sort()) {
  const img = decodePNG(fs.readFileSync(`${dir}/${f}`))
  const { width, height, channels, data } = img
  // 每行亮度均值 + 行内方差：方差高 = 有细节（纹理/笔触），方差低 = 平坦天空/海
  const rowMean = [], rowVar = []
  for (let y = 0; y < height; y++) {
    let s = 0, s2 = 0, n = 0
    for (let x = 0; x < width; x += 4) {
      const i = (y * width + x) * channels
      const l = lum(data[i], data[i + 1], data[i + 2])
      s += l; s2 += l * l; n++
    }
    rowMean.push(s / n)
    rowVar.push(s2 / n - (s / n) ** 2)
  }
  const totalVar = rowVar.reduce((a, b) => a + b, 0)
  // 细节加权重心
  let wsum = 0, vsum = 0
  for (let y = 0; y < height; y++) { wsum += y * rowVar[y]; vsum += rowVar[y] }
  const centroid = vsum ? wsum / vsum : height / 2
  // 峰值行（细节最集中）
  let peak = 0
  for (let y = 1; y < height; y++) if (rowVar[y] > rowVar[peak]) peak = y
  // 可见带内细节占比
  let inVar = 0
  for (let y = TOP; y <= BOT; y++) inVar += rowVar[y]
  const inRatio = totalVar ? inVar / totalVar : 0
  // 上缘裁切损失：可见带上沿 vs 裁切掉的上带 的细节量对比
  let outVar = 0
  for (let y = 0; y < TOP; y++) outVar += rowVar[y]
  const topLoss = inVar > 0 ? outVar / inVar : 0
  // 主体带：细节累计 80% 的区间
  let cum = 0, y80 = 0
  for (let y = 0; y < height; y++) { cum += rowVar[y]; if (cum >= totalVar * 0.8) { y80 = y; break } }

  const inBand = centroid >= TOP && centroid <= BOT
  rows.push({ f, centroid, peak, inRatio, topLoss, y80 })
  console.log(
    `${f.padEnd(7)} ${String(peak).padStart(4)}px(${((peak / height) * 100).toFixed(0).padStart(3)}%)` +
    `  重心${String(Math.round(centroid)).padStart(4)}px(${((centroid / height) * 100).toFixed(0).padStart(3)}%)` +
    `   ${(inRatio * 100).toFixed(0).padStart(3)}%` +
    `         ${inBand ? '是' : '否 ←主体被裁'}` +
    `       ${(topLoss * 100).toFixed(0)}%`,
  )
}

console.log('\n说明：')
console.log('  细节集中带 = 行内亮度方差峰值所在行（纹理/笔触最密处，约等于视觉主体）')
console.log('  可见带内细节占比 = 主体细节有多少落在 y[128,547] 内')
console.log('  上缘裁切损失 = 被裁掉的上 18.9% 里有多少细节（>60% 说明上方还有半个场景被切掉）')
