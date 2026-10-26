// 场景插图接入核对：25 个 sceneKey 是否全部命中真图、尺寸是否合规
//
// 为什么要有这个脚本
// ------------------
// 事件插图容器是 400:140（2.857:1）。
//   D1-D14 = 1200×675（1.778:1）→ 浏览器 object-cover 裁掉上下各 18.9%
//   D15-D25 = 1200×420（2.857:1）→ 零裁切
// 光看"文件在不在"抓不到"尺寸不对导致主体被切"这类问题，所以这里
// 对每张图做像素级取证：
//   1) 尺寸与比例
//   2) 可见带内细节占比（主体有没有落在可见区）
//   3) 上/下缘裁切损失（画面上下是不是还有整块内容被切掉）
//
// 跑法：node scripts/verify_scene_images.mjs [--strict]
//   --strict：缺图即退出码 1（CI 用）；默认缺图只警告
import fs from 'node:fs'
import zlib from 'node:zlib'
import path from 'node:path'

const SCENES_DIR = 'public/assets/scenes'

/** sceneKey → 文件名（与 src/data/sceneImages.ts 保持一致） */
const EXPECTED = {
  storm: 'd01.png', pirate: 'd02.png', kraken: 'd03.png', ghostship: 'd04.png',
  volcano: 'd05.png', fog: 'd06.png', festival: 'd07.png', treasure: 'd08.png',
  siren: 'd09.png', smuggle: 'd10.png', chart: 'd11.png', navy: 'd12.png',
  island: 'd13.png', tavern: 'd14.png',
  fairwind: 'd15.png', dolphin: 'd16.png', school: 'd17.png', market: 'd18.png',
  whale: 'd19.png', meteor: 'd20.png', disease: 'd21.png', reef: 'd22.png',
  doldrums: 'd23.png', cape: 'd24.png', mutiny: 'd25.png',
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
  if (bitDepth !== 8) throw new Error('bitDepth ' + bitDepth)
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (!channels) throw new Error('colorType ' + colorType)
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

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/** 可见带分析：object-cover 到 2.857:1 时源图露出的竖向区间 */
function analyze(img) {
  const { width: W, height: H, channels, data } = img
  const scale = Math.max(1, Math.max(W / (W * 0 + 400 * H / 675), 1))
  // 直接按比例算：目标比例 400/140
  const TARGET_AR = 400 / 140
  const srcAR = W / H
  let top = 0, bottom = H
  if (srcAR < TARGET_AR) {
    const winH = Math.round(W / TARGET_AR)
    const visH = Math.min(H, winH)
    // 居中可见带（浏览器行为）
    top = Math.round((H - visH) / 2)
    bottom = top + visH
  }
  // 行方差
  const rowVar = new Array(H).fill(0)
  for (let y = 0; y < H; y++) {
    let s = 0, s2 = 0, n = 0
    for (let x = 0; x < W; x += 4) {
      const i = (y * W + x) * channels
      const l = lum(data[i], data[i + 1], data[i + 2])
      s += l; s2 += l * l; n++
    }
    const m = s / n
    rowVar[y] = s2 / n - m * m
  }
  const total = rowVar.reduce((a, b) => a + b, 0) || 1
  let inVar = 0
  for (let y = top; y < bottom; y++) inVar += rowVar[y]
  let outTop = 0, outBot = 0
  for (let y = 0; y < top; y++) outTop += rowVar[y]
  for (let y = bottom; y < H; y++) outBot += rowVar[y]
  return {
    ratio: srcAR,
    topLoss: outTop / inVar,
    botLoss: outBot / inVar,
    inRatio: inVar / total,
  }
}

const strict = process.argv.includes('--strict')
let missing = 0, badSize = 0, warn = 0

const pad = (s, n) => String(s).padEnd(n)
const padL = (s, n) => String(s).padStart(n)

console.log('① 文件与尺寸')
console.log('─'.repeat(92))
console.log(pad('sceneKey', 12) + pad('文件', 14) + pad('尺寸', 14) + pad('比例', 9) + pad('可见带内细节', 14) + '备注')
console.log('─'.repeat(92))

for (const [key, file] of Object.entries(EXPECTED)) {
  const fp = path.join(SCENES_DIR, file)
  if (!fs.existsSync(fp)) {
    missing++
    console.log(pad(key, 12) + pad(file, 14) + pad('—', 14) + pad('—', 9) + pad('—', 14) + '缺图（会回退手绘 SVG，不白屏）')
    continue
  }
  let img
  try { img = decodePNG(fs.readFileSync(fp)) } catch (e) {
    badSize++
    console.log(pad(key, 12) + pad(file, 14) + '解码失败：' + e.message)
    continue
  }
  const a = analyze(img)
  const notes = []
  const expectAR = 1200 / 420
  const arOK = Math.abs(a.ratio - expectAR) < 0.02 || Math.abs(a.ratio - 1200 / 675) < 0.02
  if (!arOK) { badSize++; notes.push('⚠ 比例 ' + a.ratio.toFixed(3) + ' 不在 2.857/1.778 之内') }
  // 上下缘裁切损失 > 60% 说明画面上下还有整块内容被切
  if (a.topLoss > 0.6) { warn++; notes.push('上缘损失 ' + (a.topLoss * 100).toFixed(0) + '%') }
  if (a.botLoss > 0.6) { warn++; notes.push('下缘损失 ' + (a.botLoss * 100).toFixed(0) + '%') }
  console.log(
    pad(key, 12) + pad(file, 14) + pad(img.width + '×' + img.height, 14) +
    pad(a.ratio.toFixed(3), 9) + pad(padL((a.inRatio * 100).toFixed(0) + '%', 4) + '     ', 14) + notes.join(' '),
  )
}

console.log('─'.repeat(92))
console.log(`总计 ${Object.keys(EXPECTED).length} 个 sceneKey｜缺图 ${missing}｜尺寸异常 ${badSize}｜裁切告警 ${warn}`)

if (missing) {
  console.log('\n缺图清单（第三批素材尚未交付，属预期）：')
  console.log('  ' + Object.entries(EXPECTED).filter(([, f]) => !fs.existsSync(path.join(SCENES_DIR, f))).map(([k, f]) => `${k}→${f}`).join('  '))
  console.log('  接入方式见《视觉资产Prompt清单_第三批.md》第 0.6 节：')
  console.log('    python scripts/fit_scene.py <交付文件夹> --out public/assets/scenes')
}
console.log('\n像素级取证口径：')
console.log('  可见带内细节 = 落在 object-cover 可见竖向区间内的行方差占比，越高主体越完整')
console.log('  上/下缘损失 = 被裁掉的上下部分相对可见区的细节量，>60% 说明那里还有整块内容被切')

process.exit(strict && (missing > 0 || badSize > 0) ? 1 : 0)
