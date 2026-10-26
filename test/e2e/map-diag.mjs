// 地图视觉诊断：采样海陆像素、量对比度、查图层与缩放
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const sleep = ms => new Promise(r => setTimeout(r, ms))
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(1500)
// 直接跳到游戏（跳过向导），用 store 初始化
await page.evaluate(async () => {
  const store = await import('/Age-of-Discovery/src/store/useGameStore.ts')
  store.useGameStore.getState().initGame('merchant')
})
await sleep(2500)

const info = await page.evaluate(() => {
  const container = document.querySelector('.leaflet-container')
  const cs = container ? getComputedStyle(container) : null
  const paths = [...document.querySelectorAll('.leaflet-overlay-pane path')]
  const oceanPaths = paths.filter(p => (p.getAttribute('fill') || '').toLowerCase() === '#7d9a82')
  const landPaths = paths.filter(p => (p.getAttribute('fill') || '').toLowerCase() === '#d4b884')
  const r = container?.getBoundingClientRect()
  return {
    containerBg: cs?.backgroundColor,
    containerBgImage: cs?.backgroundImage?.slice(0, 90),
    bgColor: cs?.backgroundColor,
    rect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
    totalPaths: paths.length,
    oceanPathCount: oceanPaths.length,
    landPathCount: landPaths.length,
    oceanFillOpacity: oceanPaths[0]?.getAttribute('fill-opacity'),
    landFillOpacity: landPaths[0]?.getAttribute('fill-opacity'),
    mapZoom: window.__gameStore ? null : null,
  }
})
console.log('容器/图层诊断：', JSON.stringify(info, null, 2))

// 采样像素：找一个海面点和一个陆地点
const shot = await page.screenshot({ encoding: 'binary', clip: { x: 0, y: 0, width: 1440, height: 900 } })
const fs = await import('node:fs')
fs.writeFileSync('.workbuddy/shots/map-diag.png', shot)

// 用 canvas 采样：先找 leaflet 容器里的 SVG 覆盖层位置
const pixels = await page.evaluate(() => {
  const c = document.querySelector('.leaflet-overlay-pane svg')
  if (!c) return null
  const r = c.getBoundingClientRect()
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
})
console.log('SVG 覆盖层 rect:', JSON.stringify(pixels))
await browser.close()
