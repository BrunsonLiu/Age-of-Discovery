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
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
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
/*
 * 海上取**密集网格的中位数**。
 *
 * 【为什么不是"60 个点取最暗一半的均值"】那样每 40px 才取一个点，风痕层
 * （40 条长度 12~34px、透明度 0.05~0.15 的淡线，随机分布且每帧在动）只要
 * 有一条压到采样点上，均值就动 0.15 —— 实测同一份代码三次跑出 29.9 / 30.0 / 30.1，
 * 判据 `> 30` 正好卡在这个抖动区间里，于是同一次改动有时绿有时红。
 * 那不是代码在变，是**采样太稀**。
 *
 * 改成 8px 网格（三千多个点），**仍取最暗的一半的均值**：
 *   · 密度上去 → 40 条随机淡线摊到三千个点上，影响从 ±0.15 降到 ±0.02；
 *   · 仍取最暗一半 → 采样区左上方压着引路人的对话框（羊皮纸亮面板，
 *     实测中位数会被它抬到 50.4，比海面本身亮 20 级），必须把亮的那半排除。
 * 阈值不动（仍然 > 30），只是让测量不再掷骰子。
 */
if (seaPts.length) {
  const dense = []
  for (let y = 200; y < 700; y += 8) for (let x = 120; x < 520; x += 8) dense.push(lum(...px(x, y)))
  dense.sort((a, b) => a - b)
  const half = Math.floor(dense.length * 0.5)
  seaLum = dense.slice(0, half).reduce((a, b) => a + b, 0) / half
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

/*
 * 停泊时，船不能把港口锚徽整个盖住。
 *
 * 船图标 90×90、中心对准港口坐标，而锚徽只有 40×40 —— 实测原本是 **40×40 完全重叠**，
 * 连「当前港口 +4px 放大 / 金色辉光 / 脉冲」那套高亮一起盖死。
 * 修法是停泊时把当前港口的徽章上抬 34px（PortMarker 的 DOCK_LIFT）。
 * 这里量的是**露出来的高度**，不是"看起来还行"：
 *   改前 0px（全盖）→ 改后约 9px（锚的横杆和圆环都露出来）。
 * 判据取 ≥6px：再小就只是一条金边，读不出"这是个港口"。
 */
const dock = await page.evaluate(() => {
  const ship = document.querySelector('[data-tut="ship"]')
  const icon = document.querySelector('.port-marker-icon')
  if (!ship || !icon) return null
  const badge = icon.querySelector('div > div')
  if (!badge) return null
  const a = ship.getBoundingClientRect(), b = badge.getBoundingClientRect()
  const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  return { exposed: Math.round(b.height - overlapY), badgeH: Math.round(b.height), shipH: Math.round(a.height) }
})
if (dock) {
  check(dock.exposed >= 6, `停泊时锚徽露出 ${dock.exposed}px（徽章 ${dock.badgeH}px / 船 ${dock.shipH}px）`)
} else {
  check(false, '找不到船或锚徽，无法判定遮挡')
}

console.log('\n控制台错误：', errors.length)
errors.slice(0, 6).forEach(e => console.log('  ', e.slice(0, 160)))
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail > 0 || errors.length > 0 ? 1 : 0)
