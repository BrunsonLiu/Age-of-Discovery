/** 冷启动时玩家**第一眼看到什么、什么时候看到** —— FCP、开场卡出现时刻、当时屏幕内容 */
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default } catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5201/Age-of-Discovery/'
const NET = process.argv.includes('--fast') ? null : { latency: 300, download: 4e5, upload: 2e5 }
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] })
const p = await (await b.createBrowserContext()).newPage()
await p.setViewport({ width: 1440, height: 900 })
await p.setCacheEnabled(false)
const cdp = await p.createCDPSession()
await cdp.send('Network.enable')
if (NET) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: NET.latency, downloadThroughput: NET.download, uploadThroughput: NET.upload })
const t0 = Date.now()
await p.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 })
/* 轮询三件事：body 有没有内容、开场卡在不在、地图可看没 */
const marks = {}
for (let i = 0; i < 400; i++) {
  const s = await p.evaluate(() => ({
    children: document.getElementById('root')?.children.length ?? 0,
    text: (document.body.innerText || '').trim().slice(0, 24),
    intro: !!document.querySelector('[data-testid=intro-screen]'),
    map: document.querySelectorAll('.leaflet-overlay-pane path').length > 100,
    bg: getComputedStyle(document.body).backgroundColor,
  })).catch(() => null)
  if (s) {
    if (!marks.root && s.children > 0) marks.root = Date.now() - t0
    if (!marks.text && s.text) { marks.text = Date.now() - t0; marks.firstText = s.text }
    if (!marks.intro && s.intro) marks.intro = Date.now() - t0
    if (!marks.map && s.map) marks.map = Date.now() - t0
  }
  if (marks.map) break
  await sleep(50)
}
const perf = await p.evaluate(() => {
  const f = performance.getEntriesByName('first-contentful-paint')[0]
  const nav = performance.getEntriesByType('navigation')[0]
  return { fcp: f ? Math.round(f.startTime) : -1, domContentLoaded: Math.round(nav?.domContentLoadedEventEnd ?? -1) }
})
console.log(`FCP ${perf.fcp}ms   DOMContentLoaded ${perf.domContentLoaded}ms`)
console.log(`#root 有子节点 ${marks.root ?? '—'}ms   首段文字 ${marks.text ?? '—'}ms（"${marks.firstText ?? ''}"）`)
console.log(`开场卡 ${marks.intro ?? '—'}ms   地图可看 ${marks.map ?? '—'}ms`)
console.log(`body 背景色 ${await p.evaluate(() => getComputedStyle(document.body).backgroundColor)}`)
await b.close()
