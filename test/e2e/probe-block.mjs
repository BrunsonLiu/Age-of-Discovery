/**
 * 「如果这个资源不存在，地图会早多少秒出现」—— 逐项拦截做归因。
 *
 * 【为什么要这么量】总传输 2040KB ÷ 391KB/s ≈ 5.2 秒，看起来"谁大谁最贵"，
 * 但实际上**只有和地图抢同一条管子、且在地图之前被请求**的那些字节才付得起钱。
 * 逐个 abort 掉一个 URL，量"陆地画出来"的提前量，才知道该砍谁 ——
 * 这比看体积排行可靠得多（387KB 的 elev-map 可能一分钱都不欠，161KB 的
 * 标题背景可能欠 0.4 秒）。
 *
 * 用法：
 *   node test/e2e/probe-block.mjs [--net=slow4g] [--port=5193]
 * 需要先起 test/e2e/serve-gzip.mjs 指向生产构建。
 */
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default } catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? `http://127.0.0.1:${(process.argv.find((a) => a.startsWith('--port=')) ?? '--port=5193').split('=')[1]}/Age-of-Discovery/`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const NET = (process.argv.find((a) => a.startsWith('--net=')) ?? '--net=slow4g').split('=')[1]
const PROFILES = {
  none: null,
  fast4g: { latency: 100, download: 1.5e6, upload: 7.5e5 },
  slow4g: { latency: 300, download: 4e5, upload: 2e5 },
}

/** 要试的拦截目标：匹配 URL 里的子串 */
const TARGETS = [
  { id: '(基线：什么都不拦)', match: null },
  { id: 'bg_title', match: 'assets/bg/bg_title' },
  { id: 'ui_compass_rose', match: 'ui_compass_rose' },
  { id: 'caravel 精灵', match: 'assets/ships/caravel' },
  { id: 'noto 中文字体', match: 'noto-serif-sc-subset' },
  { id: 'land.geojson', match: 'data/land.geojson' },
  { id: 'borders.geojson', match: 'data/borders.geojson' },
  { id: 'sea-mask.bin', match: 'data/sea-mask.bin' },
  { id: 'elev-map', match: 'data/elev-map' },
  { id: 'sea-tile', match: 'assets/sea/sea-tile' },
  { id: 'MapView chunk', match: 'assets/MapView-' },
]

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  protocolTimeout: 180000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})

const results = []
for (const t of TARGETS) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.setCacheEnabled(false)
  const cdp = await page.createCDPSession()
  await cdp.send('Network.enable')
  const prof = PROFILES[NET]
  if (prof) {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: prof.latency,
      downloadThroughput: prof.download, uploadThroughput: prof.upload,
    })
  }
  let blocked = 0
  if (t.match) {
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      if (req.url().includes(t.match)) { blocked++; req.abort() }
      else req.continue()
    })
  }
  const t0 = Date.now()
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 })
  let readyMs = -1
  try {
    await page.waitForFunction(() => !!document.querySelector('.leaflet-container'), { timeout: 60000 })
    await page.waitForFunction(
      () => document.querySelectorAll('.leaflet-overlay-pane path').length > 100,
      { timeout: 60000 },
    )
    readyMs = Date.now() - t0
  } catch {
    readyMs = -1
  }
  /* 顺带记一下传输总量：拦截省下多少字节 */
  const bytes = await page.evaluate(() => {
    try {
      return performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), 0)
    } catch { return 0 }
  })
  results.push({ id: t.id, readyMs, blocked, kb: Math.round(bytes / 1024) })
  console.log(`${t.id.padEnd(22)} 地图可看 ${String(readyMs).padStart(6)}ms   拦掉 ${blocked} 个请求   传输 ${Math.round(bytes / 1024)}KB`)
  await ctx.close()
}
await browser.close()

const base = results[0]
console.log(`\n各项对「地图可看」的**贡献**（相对基线 ${base.readyMs}ms，负数 = 拦掉它能早这么多）：`)
const deltas = results
  .slice(1)
  .map((r) => ({ id: r.id, d: r.readyMs < 0 ? null : r.readyMs - base.readyMs, kb: base.kb - r.kb }))
  .sort((a, b) => (a.d ?? 9999) - (b.d ?? 9999))
for (const r of deltas) {
  console.log(`  ${r.id.padEnd(22)} ${r.d === null ? '  超时' : String(r.d).padStart(6) + 'ms'}   省 ${String(r.kb).padStart(4)}KB`)
}
