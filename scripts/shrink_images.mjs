/**
 * 图片瘦身：把 public/assets 下「分辨率远超显示尺寸」的图重编码。
 *
 * 【为什么需要这个脚本】
 * 本机没有 PIL / sharp / cwebp。Chromium 自带 `canvas.toDataURL('image/webp')`，
 * 能出带 alpha 的 lossy WebP —— 用它当编码器，零依赖。
 *
 * 【判据：按**显示尺寸**定源尺寸，不是按原图】
 * 一张图该多大，只看它在屏幕上最大出现多少 CSS 像素 × 最高 DPR。
 * 实测（slow4g，400KB/s + 300ms RTT）冷启动的资源排行里，好几张图的
 * 源分辨率是显示尺寸的 4~5 倍：
 *   · ships/*.png    512² → 最大显示 96px（HelmModal h-24）    190KB → 20KB
 *   · ui_compass_rose 512² → 最大显示 112px（首屏 w-28）        67KB → 十几KB
 * 这些字节不是"画质"，是白等。
 *
 * 【为什么是 320 而不是正好 192】
 * 96px × 3 倍屏 = 288。取 320 留余量，也给将来面板放大留空间。
 *
 * 【怎么加新条目】往 MANIFEST 里加一行 { src, out, size, q, note }；
 * `size` 是**最长边**（保持比例）。
 *
 * 用法：
 *   node scripts/shrink_images.mjs --only=ships
 *   node scripts/shrink_images.mjs --only=ui --q=0.9
 *   node scripts/shrink_images.mjs --all --dry      # 只看压缩比，不写盘
 */
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'

let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (
    await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')
  ).default
}

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1]
const ONLY = arg('only', '')
const Q_OVERRIDE = process.argv.find((a) => a.startsWith('--q='))
const DRY = process.argv.includes('--dry')

const A = 'public/assets'

/**
 * 清单。`size` 是**最长边**的像素数，`q` 是 WebP 质量。
 * 【每条都要能说出"屏幕上最大显示多少"】说不出来的就不要放进来 ——
 * 那说明还没量清楚，改成盲压就是在赌。
 */
const MANIFEST = [
  /* 舰船精灵：最大显示 96px（HelmModal 的 h-24），地图上 84/NPC 46/卡面 40 */
  ...['caravel', 'frigate', 'frigate_line', 'frigate_war', 'galleon', 'galleon_royal',
    'galleon_war', 'ghost', 'pirate', 'sloop'].map((n) => ({
    key: 'ships',
    src: `${A}/ships/${n}.png`,
    out: `${A}/ships/${n}.webp`,
    size: 320,
    q: 0.86,
    note: '显示 ≤96px（地图 84 / NPC 46 / 卡面 40）',
  })),
  /* 罗盘玫瑰：首屏 w-28 = 112px，地图 Compass 默认 w-24 = 96px */
  {
    key: 'ui',
    src: `${A}/ui/ui_compass_rose.webp`,
    out: `${A}/ui/ui_compass_rose.webp`,
    size: 256,
    q: 0.9,
    note: '显示 ≤112px（首屏 w-28 / 地图 w-24）',
  },
]

const targets = MANIFEST.filter((m) => !ONLY || ONLY === 'all' || m.key === ONLY)
if (!targets.length) {
  console.error(`没有匹配 --only=${ONLY} 的条目（可选：ships / ui / all）`)
  process.exit(1)
}

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--no-sandbox'],
})
const page = await browser.newPage()

let sumBefore = 0
let sumAfter = 0
let done = 0
const skipped = []

for (const m of targets) {
  if (!existsSync(m.src)) {
    skipped.push(`${m.src}（源不存在）`)
    continue
  }
  /* 原地覆盖时（out === src）先把原始字节读出来，避免读到自己刚写的 */
  const before = statSync(m.src).size
  const b64 = readFileSync(m.src).toString('base64')
  const isPng = m.src.endsWith('.png')
  const q = Q_OVERRIDE ? Number(Q_OVERRIDE.split('=')[1]) : m.q
  const dataUrl = `data:image/${isPng ? 'png' : 'webp'};base64,${b64}`

  const out = await page.evaluate(
    async (url, size, quality) => {
      const img = new Image()
      await new Promise((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej(new Error('decode failed'))
        img.src = url
      })
      const scale = Math.min(1, size / Math.max(img.naturalWidth, img.naturalHeight))
      const w = Math.round(img.naturalWidth * scale)
      const h = Math.round(img.naturalHeight * scale)
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const g = c.getContext('2d')
      g.imageSmoothingEnabled = true
      g.imageSmoothingQuality = 'high'
      g.drawImage(img, 0, 0, w, h)
      /* 非透明像素占比：确认 alpha 真的带过去了（否则会露方底） */
      const d = g.getImageData(0, 0, w, h).data
      let opaque = 0
      for (let i = 3; i < d.length; i += 4) if (d[i] > 8) opaque++
      return {
        url: c.toDataURL('image/webp', quality),
        w, h,
        opaquePct: (opaque / (w * h)) * 100,
        srcW: img.naturalWidth,
        srcH: img.naturalHeight,
      }
    },
    dataUrl,
    m.size,
    q,
  )

  const buf = Buffer.from(out.url.split(',')[1], 'base64')
  sumBefore += before
  sumAfter += buf.length
  done++
  const ratio = ((1 - buf.length / before) * 100).toFixed(0)
  console.log(
    `${basename(m.src).padEnd(24)} ${out.srcW}x${out.srcH} ${(before / 1024).toFixed(0).padStart(4)}KB` +
      ` → ${out.w}x${out.h} ${(buf.length / 1024).toFixed(1).padStart(5)}KB  (${ratio}% 更小, q=${q})`,
  )
  if (!DRY) writeFileSync(m.out, buf)
}

await browser.close()
if (skipped.length) {
  console.log(`\n跳过 ${skipped.length} 项：\n  ${skipped.join('\n  ')}`)
}
if (done) {
  console.log(
    `\n合计 ${(sumBefore / 1024).toFixed(0)}KB → ${(sumAfter / 1024).toFixed(0)}KB` +
      `（省 ${((1 - sumAfter / sumBefore) * 100).toFixed(0)}%）${DRY ? '  [--dry 未写盘]' : ''}`,
  )
}
