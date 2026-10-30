// 地图可辨性回归测试（玩家视角）
//
// 背景：这个测试守的是一次真实事故——
//   1) CSS 的 `.leaflet-container { background: ... !important }` 盖掉了内联的
//      sea-tile.png，海面纹理从未显示；
//   2) public/data/ocean.geojson 在仓库里就是截断的，JSON 解析失败；
//   3) 陆地填充与背景同为米黄。
// 三者叠加的结果：整张地图一片米黄，玩家分不清哪里是海、哪里是陆。
//
// 这里从**渲染结果**取证，而不是查代码：取真实截图，采样像素，
// 断言海与陆的明度差足够大——这是玩家能不能"一眼看出能不能开船"的量化口径。
//
// 跑法：先起 dev server，再 `node test/e2e/map-legibility.mjs`
import fs from 'node:fs'
import zlib from 'node:zlib'

let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'

let pass = 0, fail = 0
const check = (ok, msg, extra = '') => {
  if (ok) { pass++; console.log('  ✓', msg) }
  else { fail++; console.log('  ✗', msg, extra) }
}

/**
 * 解 PNG 到 RGBA 像素数组（纯 Node 实现，免装依赖）。
 * 只处理 8-bit RGB/RGBA、非隔行——Puppeteer 截图就是这个格式。
 */
function decodePNG(buf) {
  let pos = 8
  let width = 0, height = 0, bitDepth = 0, colorType = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') break
    pos += 12 + len
  }
  if (bitDepth !== 8) throw new Error('unsupported bit depth ' + bitDepth)
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (!channels) throw new Error('unsupported color type ' + colorType)

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
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
          break
        }
      }
      cur[x] = v & 0xff
    }
  }
  return { width, height, channels, data: out }
}

const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)) })
await page.setViewport({ width: 1440, height: 900 })
const sleep = ms => new Promise(r => setTimeout(r, ms))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(1500)
await page.evaluate(() => { window.__gameStore.getState().initGame('merchant') })
await sleep(1500)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /跳过引导/.test(x.textContent || ''))
  if (b) b.click()
})
await sleep(700)
for (let i = 0; i < 6; i++) { await page.keyboard.press('Enter'); await sleep(400) }
await sleep(1200)

// —— 1) 图层与数据 ——
console.log('① 图层与数据')
const layers = await page.evaluate(() => {
  const paths = [...document.querySelectorAll('.leaflet-overlay-pane path')]
  const fills = new Set(paths.map(p => (p.getAttribute('fill') || '').toLowerCase()).filter(Boolean))
  const container = document.querySelector('.leaflet-container')
  const cs = container ? getComputedStyle(container) : null
  // 复古装饰层必须在矢量图层之上（否则罗盘/海怪/暗角永远看不见）
  const overlay = document.querySelector('.vintage-map-overlay')
  const markerPane = document.querySelector('.leaflet-marker-pane')
  return {
    landFill: fills.has('url(#landpaper)') || fills.has('#e7d5ab'),
    landCount: paths.filter(p => (p.getAttribute('fill') || '').toLowerCase().includes('landpaper')).length,
    coastCount: paths.filter(p => (p.getAttribute('stroke') || '').toLowerCase() === '#3d2810').length,
    containerBg: cs?.backgroundColor,
    vintageZ: overlay ? getComputedStyle(overlay).zIndex : null,
    markerZ: markerPane ? getComputedStyle(markerPane).zIndex : null,
  }
})
check(layers.landCount > 100, `陆地多边形已渲染（${layers.landCount} 个）`)
check(layers.coastCount > 100, `海岸线已渲染（${layers.coastCount} 条）`)
check(layers.vintageZ !== null && Number(layers.vintageZ) > 600,
  `复古装饰层在矢量图层之上（z-index ${layers.vintageZ}）`)
check(layers.markerZ !== null && Number(layers.markerZ) >= Number(layers.vintageZ),
  `标记层不低于装饰层（marker ${layers.markerZ} vs 装饰 ${layers.vintageZ}）`)

// —— 2) 像素取证：海 vs 陆 的明度差 ——
console.log('② 海陆可辨性（像素取证）')
const shot = await page.screenshot({ path: `${SHOTS}/map-legibility.png` })
const img = decodePNG(shot)
const px = (x, y) => {
  const i = (y * img.width + x) * img.channels
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}

// 用 SVG 图层的实际几何取样点，避免"猜坐标"式的脆弱断言：
// 取一个离岸较远的海上点与一个内陆点。
const samples = await page.evaluate(() => {
  const paths = [...document.querySelectorAll('.leaflet-overlay-pane path')]
    .filter(p => (p.getAttribute('fill') || '').toLowerCase().includes('landpaper'))
  // 找一个面积够大的陆地多边形（内陆），用其 path 的屏幕包围盒中心
  let best = null, bestArea = 0
  for (const p of paths) {
    const len = (p.getAttribute('d') || '').length
    if (len > bestArea) { bestArea = len; best = p }
  }
  const r = best?.getBoundingClientRect()
  const vb = best?.getBoundingClientRect()
  return {
    land: vb ? { x: Math.round(vb.left + vb.width / 2), y: Math.round(vb.top + vb.height / 2) } : null,
    container: (() => { const c = document.querySelector('.leaflet-container'); const b = c.getBoundingClientRect(); return { w: b.width, h: b.height } })(),
    pathCount: paths.length,
  }
})
check(!!samples.land, '取到内陆采样点')

// 海上点：屏幕左侧 1/4 处、垂直中线附近（初始视野是大西洋，左侧无陆地）
const seaPts = []
for (let y = 200; y < 700; y += 40) {
  for (let x = 120; x < 520; x += 40) seaPts.push([x, y])
}
let seaLum = null, landLum = null
if (samples.land) {
  const [lx, ly] = [samples.land.x, samples.land.y]
  landLum = lum(...px(lx, ly))
}
// 海上取"最暗的一批点"的均值：海面有刻线明暗波动，取均值更稳
if (seaPts.length) {
  const ls = seaPts.map(([x, y]) => lum(...px(x, y))).sort((a, b) => a - b)
  seaLum = ls.slice(0, Math.floor(ls.length * 0.5)).reduce((a, b) => a + b, 0) / Math.floor(ls.length * 0.5)
}
if (seaLum !== null && landLum !== null) {
  const diff = landLum - seaLum
  console.log(`  海面亮度 ${seaLum.toFixed(1)} / 陆地亮度 ${landLum.toFixed(1)} / 差 ${diff.toFixed(1)}`)
  // 口径：陆地必须明显亮于海面。差 30 以上玩家才不会把两者看成同一片。
  check(diff > 30, `海陆明度差足够（${diff.toFixed(1)} > 30）`)
  // 反向也要防：不能亮得刺眼（陆地不是白纸）
  check(landLum < 235, `陆地没有过曝成白纸（${landLum.toFixed(1)} < 235）`)
} else {
  check(false, '海陆采样失败，无法判定可辨性')
}

console.log('\n控制台错误：', errors.length)
errors.slice(0, 6).forEach(e => console.log('  ', e.slice(0, 160)))
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail > 0 || errors.length > 0 ? 1 : 0)
