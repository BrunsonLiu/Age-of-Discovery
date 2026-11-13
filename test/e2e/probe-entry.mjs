/**
 * 「进入一个视角的那一下卡不卡」——长任务（>50ms 的主线程阻塞）测量。
 *
 * 【为什么要单独量】稳态帧率已经在 60fps（甲板两个 DPR 下都是 p50 16.7ms），
 * 玩家说的"很卡"更可能是**切换瞬间**：进 3D 要编译几十个着色器程序、上传贴图、
 * 建几何；进甲板要建一整艘船。这些是几十到几百毫秒的阻塞，期间画面完全不动。
 * 稳态再快也救不了这一下。
 *
 * 跑法：起 dev server 后 `node test/e2e/probe-entry.mjs`
 * 生产对照：`npm run build:clean && npx vite preview --port 5180` 再
 *          `GAME_URL=http://127.0.0.1:5180/Age-of-Discovery/ node test/e2e/probe-entry.mjs`
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

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const ctx = await browser.createBrowserContext()
const page = await ctx.newPage()
await page.setViewport({ width: 1440, height: 900 })

const t0 = Date.now()
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => !!window.__mapStore, { timeout: 60000 })
const bootMs = Date.now() - t0

// 从这一刻开始记长任务 + 帧间隔
await page.evaluate(() => {
  window.__long = []
  window.__frames = []
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__long.push(Math.round(e.duration))
  }).observe({ entryTypes: ['longtask'] })
  let last = 0
  const tick = (t) => {
    if (last) window.__frames.push(Math.round(t - last))
    last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

const mark = async (label, action, done) => {
  const a = await page.evaluate(() => ({ long: window.__long.length, frames: window.__frames.length }))
  await page.evaluate(action)
  const t = Date.now()
  /*
   * 条件满足就早退；不满足也不许把探针挂死 —— 探针的价值在"量到数"，
   * 一个猜错的状态谓词不该让整轮白跑（之前的写法在这里 TimeoutError 了两次）。
   */
  let until = -1
  await page.waitForFunction(done, { timeout: 30000 }).then(
    () => { until = Date.now() - t },
    () => { until = -1 },
  )
  // 再等 2.5 秒让后续几帧（上传、首帧渲染）落进样本
  await sleep(2500)
  const b = await page.evaluate(() => ({ long: window.__long.slice(), frames: window.__frames.slice() }))
  const longs = b.long.slice(a.long)
  const frames = b.frames.slice(a.frames)
  const worst = longs.length ? Math.max(...longs) : 0
  const frozen = frames.filter((v) => v > 100)
  console.log(
    `  ${label.padEnd(16)} 最长阻塞 ${String(worst).padStart(4)}ms` +
      `  长任务 ${String(longs.length).padStart(2)} 个（合计 ${longs.reduce((s, v) => s + v, 0)}ms）` +
      `  >100ms 的帧 ${frozen.length} 个  场景就绪 ${until < 0 ? '超时未就绪' : until + 'ms'}`,
  )
}

console.log(`\n冷启动到可交互 ${bootMs}ms`)
await mark('新游戏 → 2D', () => { window.__gameStore.getState().initGame('ming') }, () => !!window.__gameStore.getState().fleet)
await mark('2D → 3D 板', () => window.__mapStore.setState({ viewMode: '3d' }), () => !!window.__map3dScene)
await mark('3D 板 → 甲板', () => document.querySelector('[data-testid=deck-view-toggle]')?.click(), () => !!window.__deckScene)
await mark('甲板 → 3D 板', () => document.querySelector('[data-testid=deck-view-toggle]')?.click(), () => !window.__deckScene)

const all = await page.evaluate(() => window.__long.slice().sort((a, b) => b - a).slice(0, 10))
console.log(`\n全程最长的 10 个长任务（ms）：${all.join(', ')}`)

await browser.close()
