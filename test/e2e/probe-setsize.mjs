/**
 * 三件事一次量清：
 * ① `renderer.setSize` 每秒被调几次（每次都会重建绘图缓冲，是"一直卡"的典型元凶）；
 * ② DPR 2 下（真实笔记本/高分屏）的画布像素数与帧间隔；
 * ③ 进甲板那一刻有没有单帧超长（编译/上传）。
 *
 * 跑法：先起 dev server（5174），再 `node test/e2e/probe-setsize.mjs`
 */
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const dpr = Number((process.argv.find((a) => a.startsWith('--dpr=')) ?? '--dpr=1').split('=')[1])

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const ctx = await browser.createBrowserContext()
const page = await ctx.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: dpr })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!window.__mapStore, { timeout: 30000 })
await page.evaluate(() => window.__mapStore.setState({ viewMode: '3d' }))
await sleep(2500)

// 进甲板前就开始记「单帧超长」
await page.evaluate(() => {
  window.__frames = []
  let last = performance.now()
  const tick = (t) => {
    window.__frames.push(t - last)
    last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

await page.evaluate(() => document.querySelector('[data-testid=deck-view-toggle]')?.click())
await page.waitForFunction(() => !!window.__deckScene, { timeout: 60000 })
await sleep(3000)

// hook setSize 计数
const sizeInfo = await page.evaluate(() => {
  const r = window.__deckRenderer
  const orig = r.setSize.bind(r)
  window.__setSizeN = 0
  window.__setSizeArgs = []
  r.setSize = (...a) => {
    window.__setSizeN++
    if (window.__setSizeArgs.length < 6) window.__setSizeArgs.push(a.slice(0, 2).join('x'))
    return orig(...a)
  }
  return {
    dpr: window.devicePixelRatio,
    pixelRatio: r.getPixelRatio(),
    canvasW: r.domElement.width,
    canvasH: r.domElement.height,
    pixels: r.domElement.width * r.domElement.height,
    resizeObserver: !!window.__resizeObserver,
  }
})
await sleep(4000)
const n = await page.evaluate(() => ({ n: window.__setSizeN, args: window.__setSizeArgs }))
const frames = await page.evaluate(() => window.__frames.slice(10))
frames.sort((a, b) => a - b)
const q = (p) => frames[Math.min(frames.length - 1, Math.floor(frames.length * p))]

console.log(`\nDPR=${sizeInfo.dpr}  像素比=${sizeInfo.pixelRatio}  画布=${sizeInfo.canvasW}×${sizeInfo.canvasH}  像素=${(sizeInfo.pixels / 1e6).toFixed(2)}M`)
console.log(`4 秒内 setSize 被调用 ${n.n} 次 ${n.args.length ? '：' + n.args.join(', ') : ''}`)
console.log(`帧间隔 p50 ${q(0.5).toFixed(1)}  p95 ${q(0.95).toFixed(1)}  p99 ${q(0.99).toFixed(1)}  max ${frames[frames.length - 1].toFixed(1)}`)
const long = frames.filter((v) => v > 50).length
console.log(`>50ms 的帧：${long} / ${frames.length}`)

await browser.close()
