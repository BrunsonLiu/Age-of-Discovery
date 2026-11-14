/**
 * 线上真实加载耗时（生产部署，真 CDN + 真 gzip）。
 *
 * 【这个工具之前是坏的】它等的是「绘制航海图...」这段文案消失 —— 而那段文案
 * 现在已经不存在了，于是"消失"瞬间成立，它报出 1.6s，同时最终状态是
 * `leaflet:false / landPaths:0`（地图根本没挂上）。**给出误导数字的工具比没有更糟**。
 *
 * 现在改成和本地探针同一套判据：
 *   · FCP           —— 启动屏算不算首屏内容（见 index.html 的 #boot-splash）
 *   · 开场卡出现    —— `[data-testid=intro-screen]`
 *   · 地图可看      —— `.leaflet-overlay-pane path > 100`（陆地多边形真的画出来）
 * 中间要点掉开场卡（线上没有调试钩子，只能点按钮）。
 *
 * 跑法：
 *   node test/e2e/online-load-time.mjs                        # 打线上
 *   node test/e2e/online-load-time.mjs http://127.0.0.1:5203/Age-of-Discovery/
 */
import puppeteer from 'puppeteer-core'

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
/* 第一个**非 --开头**的参数当 URL：回归跑器会顺手塞 --port=…，
   直接取 argv[2] 会拿到 '--port=5174' 然后 navigate 到非法地址。 */
const URL = process.argv.slice(2).find((a) => !a.startsWith('--'))
  || 'https://brunsonliu.github.io/Age-of-Discovery/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await (await browser.createBrowserContext()).newPage()
await page.setViewport({ width: 1600, height: 900 })
/* 关缓存：要量的是"第一次来的人"。开着缓存会量到浏览器里的旧副本。 */
await page.setCacheEnabled(false)

const reqs = []
page.on('response', async (r) => {
  const url = r.url()
  if (!url.includes('/data/') && !url.includes('/assets/')) return
  const len = Number(r.headers()['content-length'] ?? 0)
  reqs.push({ url: url.split('/').pop(), status: r.status(), bytes: len })
})

const t0 = Date.now()
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })

/** 轮询到某个条件成立，返回耗时（毫秒）；超时返回 -1 */
const until = async (fn, limitMs = 60000, stepMs = 100, label = '') => {
  for (let t = 0; t < limitMs; t += stepMs) {
    if (await page.evaluate(fn).catch(() => false)) return Date.now() - t0
    await sleep(stepMs)
  }
  if (label) console.log(`  ! ${label} 在 ${limitMs / 1000}s 内没等到`)
  return -1
}

const introMs = await until(() => !!document.querySelector('[data-testid=intro-screen]'), 60000, 100, '开场卡')
/* 点掉开场卡：线上没有调试钩子可用，只能点。文案可能变，所以按"卡片里最像主按钮的那个"找 */
const clicked = await page.evaluate(() => {
  const card = document.querySelector('[data-testid=intro-screen]')
  if (!card) return false
  const btn = [...card.querySelectorAll('button')].find((b) => /翻开|启航|开始|出发/.test(b.textContent || ''))
  if (!btn) return false
  btn.click()
  return true
})
const mapMs = await until(
  () => document.querySelectorAll('.leaflet-overlay-pane path').length > 100,
  60000, 200, '地图可看',
)
await sleep(1500)

const perf = await page.evaluate(() => {
  const f = performance.getEntriesByName('first-contentful-paint')[0]
  const nav = performance.getEntriesByType('navigation')[0]
  return {
    fcp: f ? Math.round(f.startTime) : -1,
    dcl: Math.round(nav?.domContentLoadedEventEnd ?? -1),
    load: Math.round(nav?.loadEventEnd ?? -1),
    transferKB: Math.round(
      performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), 0) / 1024,
    ),
    landPaths: document.querySelectorAll('.leaflet-overlay-pane path').length,
    ports: document.querySelectorAll('.leaflet-marker-icon').length,
    splashGone: !document.querySelector('#boot-splash'),
  }
})

const s = (ms) => (ms < 0 ? '超时' : (ms / 1000).toFixed(2) + 's')
console.log(`\n=== 线上加载（${URL}）===`)
console.log(`  FCP            ${s(perf.fcp)}`)
console.log(`  DOMContentLoaded ${s(perf.dcl)}`)
console.log(`  开场卡出现      ${s(introMs)}${clicked ? '（已点掉）' : '（没找到主按钮！）'}`)
console.log(`  地图可看        ${s(mapMs)}`)
console.log(`  传输合计        ${perf.transferKB}KB`)
console.log(`  陆地多边形 ${perf.landPaths} 条 / 港口标记 ${perf.ports} 个 / 启动屏已移除 ${perf.splashGone}`)

console.log('\n=== 最大的 8 个资源（按 Content-Length）===')
for (const r of [...reqs].sort((a, b) => b.bytes - a.bytes).slice(0, 8)) {
  console.log(`  ${String(Math.round(r.bytes / 1024)).padStart(4)}KB  ${r.status}  ${r.url}`)
}

/* 结论只报一件事：地图到底挂上没有。这条挂了，上面所有数字都没有意义 */
const ok = perf.landPaths > 100 && perf.splashGone
console.log(ok ? '\n结论：地图正常挂载' : '\n结论：**地图没挂上** —— 上面的数字不可用')
await page.screenshot({ path: '.workbuddy/shots/online-load-final.png' })
await browser.close()
if (!ok) process.exitCode = 1
