// 地图视觉复核：出航后截主地图，采样海陆像素对比
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
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)) })

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(1500)
// 直接起一局：走真实的向导太脆（转场有动画），这里用 store 初始化，
// 但之后所有截图都是真·玩家视角的画面（同一套渲染路径）。
await page.evaluate(() => {
  window.__gameStore.getState().initGame('merchant')
})
await sleep(1200)
// 跳过教学与对白
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /跳过引导/.test(x.textContent || ''))
  if (b) b.click()
})
await sleep(800)
for (let i = 0; i < 6; i++) { await page.keyboard.press('Enter'); await sleep(420) }
await sleep(1500)
await page.screenshot({ path: '.workbuddy/shots/map-fixed.png' })
// 局部放大：港口标记 + 船标记是否被装饰层压暗
// 船标记的真实渲染尺寸
const shipBox = await page.evaluate(() => {
  const img = document.querySelector('.ship-marker-icon img')
  if (!img) return null
  const r = img.getBoundingClientRect()
  return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top), src: img.getAttribute('src') }
})
console.log('船标记渲染:', JSON.stringify(shipBox))
if (shipBox) {
  await page.screenshot({ path: '.workbuddy/shots/map-zoom-ship.png', clip: { x: Math.max(0, shipBox.left - 70), y: Math.max(0, shipBox.top - 50), width: 240, height: 200 } })
}

// 采样：找几个海面与陆地像素
const info = await page.evaluate(() => {
  const paths = [...document.querySelectorAll('.leaflet-overlay-pane path')]
  const land = paths.filter(p => (p.getAttribute('fill') || '').toLowerCase() === '#e7d5ab')
  const cont = paths.filter(p => (p.getAttribute('stroke') || '').toLowerCase() === '#3d2810')
  const c = document.querySelector('.leaflet-container')
  const cs = c ? getComputedStyle(c) : null
  return {
    landPaths: land.length,
    coastPaths: cont.length,
    bgImage: cs?.backgroundImage?.slice(0, 120),
    bgColor: cs?.backgroundColor,
  }
})
console.log('图层诊断:', JSON.stringify(info, null, 2))

const zinfo = await page.evaluate(() => {
  const pick = sel => {
    const el = document.querySelector(sel)
    if (!el) return null
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return { sel, z: cs.zIndex, pos: cs.position, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), left: Math.round(r.left), vis: cs.visibility, op: cs.opacity }
  }
  return [
    pick('.vintage-map-overlay'),
    pick('.vintage-paper'),
    pick('.leaflet-container'),
    pick('.leaflet-map-pane'),
    pick('.leaflet-overlay-pane'),
    pick('.leaflet-marker-pane'),
  ]
})
console.log('层叠诊断:'); zinfo.forEach(z => z && console.log('  ', JSON.stringify(z)))
// 复古装饰实际可见吗：取装饰元素中心点，看它上面盖着什么
const deco = await page.evaluate(() => {
  const el = document.querySelector('.vintage-map-overlay')
  if (!el) return 'no overlay'
  const r = el.getBoundingClientRect()
  const cx = Math.round(r.left + r.width * 0.06), cy = Math.round(r.top + r.height * 0.05)
  const stack = document.elementsFromPoint(cx, cy).slice(0, 4).map(e => e.className?.toString?.().slice(0, 40) || e.tagName)
  return { cx, cy, stack }
})
console.log('装饰层被谁盖住:', JSON.stringify(deco))
console.log('控制台错误:', errors.length)
errors.slice(0, 6).forEach(e => console.log('  ', e.slice(0, 160)))
await browser.close()
