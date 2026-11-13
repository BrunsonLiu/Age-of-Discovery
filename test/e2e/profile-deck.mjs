/**
 * 甲板视角的主线程 CPU 归因：跑 6 秒，按「函数自时间」排序。
 *
 * 【为什么不用 fps】无头 Edge 走 SwiftShader 软渲染，帧率绝对值没有意义。
 * 但**主线程 JS 的时间分布**是真实的：哪段代码吃了多少毫秒，和真机同构。
 * 这一步是为了回答"到底该改哪里"，避免凭感觉优化。
 *
 * 跑法：先起 dev server（5174），再 `node test/e2e/profile-deck.mjs`
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
const SECS = Number((process.argv.find((a) => a.startsWith('--sec=')) ?? '--sec=6').split('=')[1])
const VIEW = (process.argv.find((a) => a.startsWith('--view=')) ?? '--view=deck').split('=')[1]
const THROTTLE = Number((process.argv.find((a) => a.startsWith('--throttle=')) ?? '--throttle=1').split('=')[1])

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const ctx = await browser.createBrowserContext()
const page = await ctx.newPage()
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!window.__mapStore, { timeout: 30000 })
if (VIEW === 'deck') {
  await page.evaluate(() => window.__mapStore.setState({ viewMode: '3d' }))
  await sleep(2500)
  await page.evaluate(() => document.querySelector('[data-testid=deck-view-toggle]')?.click())
  await page.waitForFunction(() => !!window.__deckScene, { timeout: 60000 })
} else if (VIEW === '3d') {
  await page.evaluate(() => window.__mapStore.setState({ viewMode: '3d' }))
  await page.waitForFunction(() => !!window.__map3dScene, { timeout: 60000 })
} else {
  /*
   * 2D 羊皮纸海图：默认视图。**必须真让船开起来** —— 停着的时候帧循环几乎
   * 什么都不做（实测 66% 空闲），测出来的数字跟玩家实际体验无关。
   * 走 `sailToWaypoint`：与"点海图上的点"同一条链路。
   */
  await page.evaluate(() => {
    const g = window.__gameStore
    g.getState().initGame('ming')
    g.getState().sailToWaypoint?.({ latitude: 1.35, longitude: 103.8, name: '马六甲' })
    if (g.getState().pendingSegment) g.getState().confirmSegment?.('steady')
    return g.getState().fleet?.isSailing ?? false
  })
}
await sleep(2500)

const cdp = await page.createCDPSession()
/*
 * CPU 节流：无头机器比玩家手机/老笔记本快得多，不降频根本测不出"卡"。
 * 4x 大致相当于一台低压 i5 或两年前的中端手机。
 */
if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await cdp.send('Profiler.start')
await sleep(SECS * 1000)
const { profile } = await cdp.send('Profiler.stop')

// 自时间聚合：sample 落在哪个 node 就算哪个 node 的时间
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const self = new Map()
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i])
  if (!n) continue
  const f = n.callFrame
  const key = `${f.functionName || '(anonymous)'}`
  const url = (f.url || '').replace(/^https?:\/\/[^/]+/, '')
  const bucket = /three|node_modules/.test(url) ? `three:${key}` : key
  const dt = profile.timeDeltas?.[i] ?? 0
  const cur = self.get(bucket) ?? { ms: 0, url, hits: 0 }
  cur.ms += dt / 1000
  cur.hits++
  self.set(bucket, cur)
}

const total = [...self.values()].reduce((s, v) => s + v.ms, 0)
const rows = [...self.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 30)
console.log(`\n[${VIEW}] 节流×${THROTTLE} 主线程 ${SECS}s 采样：合计 ${total.toFixed(0)}ms（每帧均值看下一行）`)
console.log('按函数自时间：')
for (const [k, v] of rows) {
  const pct = (v.ms / total) * 100
  console.log(`  ${v.ms.toFixed(0).padStart(5)}ms ${pct.toFixed(1).padStart(5)}%  ${k}${v.url ? '   @' + v.url : ''}`)
}

// 帧间隔（rAF 回调间隔）只是相对参考：软渲染下不当作 fps 结论
const frames = await page.evaluate(
  () =>
    new Promise((res) => {
      const ts = []
      let last = 0
      const tick = (t) => {
        if (last) ts.push(t - last)
        last = t
        if (ts.length >= 90) return res(ts)
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }),
)
frames.sort((a, b) => a - b)
const q = (p) => frames[Math.min(frames.length - 1, Math.floor(frames.length * p))]
console.log(`\n帧间隔（软渲染，只作相对参考）：p50 ${q(0.5).toFixed(1)}  p95 ${q(0.95).toFixed(1)}  max ${frames[frames.length - 1].toFixed(1)}`)

await browser.close()
