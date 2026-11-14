/**
 * 拖海图 / 缩放时的帧时间 —— 地图游戏最常做的动作，也是最容易"卡"的地方。
 *
 * 【为什么单独量它】前面几轮量的都是"进入某个视角"和"冷启动"，
 * 但玩家 90% 的时间在**拖图、滚轮缩放**。Leaflet 底图是 SVG（1400 多个 path）
 * 叠一层 canvas 地形符号，每次拖动都要重算整屏投影并重绘 —— 这类卡顿
 * 不会出现在"冷启动"或"稳态空转"的数字里。
 *
 * 判据（可迁移，与机器算力无关的相对量先看，绝对值只做参考）：
 *   · 手势期间帧间隔 p50 / p95 / p99
 *   · 超过 50ms 的帧数（人眼可感的顿挫）
 *   · 手势结束后是否有长时间"尾巴"（重排/重绘延迟到抬手之后）
 *
 * 用法：
 *   node test/e2e/probe-pan.mjs --net=fast4g|none --throttle=4 [--view=2d|3d]
 * 需要先起 dev（5174）或 serve-gzip 指向生产产物（--port=）。
 */
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default } catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).split('=')[1]
const PORT = arg('port', '5203')
const BASE = process.env.GAME_URL ?? `http://127.0.0.1:${PORT}/Age-of-Discovery/`
const THROTTLE = Number(arg('throttle', '4'))
const VIEW = arg('view', '2d')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: true, protocolTimeout: 180000,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})
const page = await (await browser.createBrowserContext()).newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
const cdp = await page.createCDPSession()
if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 120000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 120000 })
await page.waitForFunction(() => !!window.__mapStore, { timeout: 60000 })
await page.evaluate(() => window.__gameStore.getState().initGame('ming'))
await page.waitForFunction(
  () => document.querySelectorAll('.leaflet-overlay-pane path').length > 100,
  { timeout: 60000 },
)
/* 进 3D 就切视图（同一个探针量两处） */
if (VIEW === '3d') {
  await page.evaluate(() => window.__mapStore.getState().setRenderMode('3d'))
  await page.waitForFunction(() => !!window.__map3d, { timeout: 90000 })
}
await sleep(3500)

/** 在页面里装一个帧间隔记录器；返回 stop() 取结果 */
const install = async () => {
  await page.evaluate(() => {
    const w = window
    w.__frames = []
    w.__rec = true
    let last = performance.now()
    const tick = () => {
      const now = performance.now()
      if (w.__rec) w.__frames.push(now - last)
      last = now
      w.__raf = requestAnimationFrame(tick)
    }
    w.__raf = requestAnimationFrame(tick)
  })
}
const collect = async (label) => {
  const r = await page.evaluate(() => {
    const w = window
    w.__rec = false
    cancelAnimationFrame(w.__raf)
    const f = w.__frames.slice(2)  // 丢掉头两帧（换帧器时的抖动）
    if (!f.length) return null
    const s = [...f].sort((a, b) => a - b)
    const q = (p) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
    return {
      n: f.length,
      p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1],
      over50: f.filter((x) => x > 50).length,
      over100: f.filter((x) => x > 100).length,
      span: f.reduce((a, b) => a + b, 0),
    }
  })
  if (!r) { console.log(`  ${label}: 没采到帧`); return null }
  console.log(
    `  ${label.padEnd(14)} 帧 ${String(r.n).padStart(3)}  ` +
    `p50 ${r.p50.toFixed(1)} / p95 ${r.p95.toFixed(1)} / p99 ${r.p99.toFixed(1)} / max ${r.max.toFixed(0)}ms  ` +
    `>50ms ${r.over50} 帧  >100ms ${r.over100} 帧`,
  )
  return r
}

console.log(`\n[${VIEW}] CPU 节流 ×${THROTTLE}  视口 1440×900`)

/* ① 基准：不动的时候 */
await install()
await sleep(2000)
await collect('静止 2s')

/* ② 拖图：分成 40 步横拖 700px，每步 16ms（≈真人在拖） */
await install()
await page.mouse.move(720, 450)
await page.mouse.down()
for (let i = 0; i < 40; i++) {
  await page.mouse.move(720 + i * 17, 450 + Math.round(Math.sin(i / 6) * 60))
  await sleep(16)
}
await page.mouse.up()
await collect('拖动中')
/* 抬手之后 1.2 秒：看有没有"延迟到抬手后才重绘"的尾巴 */
await install()
await sleep(1200)
await collect('抬手后 1.2s')

/* ③ 滚轮缩放：连滚 8 格（进），再 8 格（出） */
await install()
for (let i = 0; i < 8; i++) { await page.mouse.wheel({ deltaY: -120 }); await sleep(90) }
await collect('滚轮放大')
await install()
for (let i = 0; i < 8; i++) { await page.mouse.wheel({ deltaY: 120 }); await sleep(90) }
await collect('滚轮缩小')

/* ④ 缩到最深再拖：这时候 screen 上的 path 最密（小岛全部显形） */
await install()
for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: -120 }); await sleep(80) }
await sleep(600)
await page.mouse.move(720, 450)
await page.mouse.down()
for (let i = 0; i < 30; i++) { await page.mouse.move(720 - i * 20, 450); await sleep(16) }
await page.mouse.up()
await collect('最深缩放拖动')

await browser.close()
