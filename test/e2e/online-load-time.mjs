import fs from 'fs'
import puppeteer from 'puppeteer-core'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = process.argv[2] || 'https://brunsonliu.github.io/Age-of-Discovery/'

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 900 })

// 记录每个请求的时间
const reqs = []
page.on('response', async r => {
  const url = r.url()
  if (!url.includes('/data/') && !url.includes('/assets/')) return
  try {
    const buf = await r.buffer()
    reqs.push({ url: url.split('/').pop(), status: r.status(), bytes: buf.length })
  } catch { /* ignore */ }
})

const t0 = Date.now()
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })

// 轮询：等「绘制航海图...」消失
let loadedMs = -1
for (let i = 0; i < 120; i++) {
  const stuck = await page.evaluate(() =>
    [...document.querySelectorAll('div')].some(d => (d.textContent || '').trim() === '绘制航海图...'))
  if (!stuck) { loadedMs = Date.now() - t0; break }
  await new Promise(r => setTimeout(r, 1000))
}

console.log('=== 端到端加载 ===')
console.log('「绘制航海图」消失耗时:', loadedMs === -1 ? '>120s（未完成）' : (loadedMs / 1000).toFixed(1) + 's')

console.log('\n=== 关键资源（按大小）===')
reqs.filter(r => r.url.endsWith('.geojson')).sort((a, b) => b.bytes - a.bytes).forEach(r => {
  console.log(`  ${r.url}: ${r.status}, ${(r.bytes / 1024).toFixed(0)}KB`)
})
const js = reqs.filter(r => r.url.endsWith('.js'))
js.forEach(r => console.log(`  ${r.url}: ${r.status}, ${(r.bytes / 1024).toFixed(0)}KB`))

// 地图最终是否可用
const final = await page.evaluate(() => ({
  stuck: [...document.querySelectorAll('div')].some(d => (d.textContent || '').trim() === '绘制航海图...'),
  leaflet: !!document.querySelector('.leaflet-container'),
  landPaths: document.querySelectorAll('.leaflet-overlay-pane path').length,
  ports: document.querySelectorAll('.leaflet-marker-icon').length,
  errorToast: (document.body.innerText || '').includes('GeoJSON 数据加载失败'),
}))
console.log('\n=== 最终状态 ===')
console.log(JSON.stringify(final, null, 2))

await page.screenshot({ path: '.workbuddy/shots/online-load-final.png' })
await browser.close()
