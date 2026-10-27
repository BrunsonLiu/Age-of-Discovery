// 实测 dev server 上「绘制航海图...」占屏时长（本地网络，用作相对比较基准）
import puppeteer from 'puppeteer-core'

const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = process.argv[2] || 'http://127.0.0.1:5174/Age-of-Discovery/'

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 900 })

const reqs = []
page.on('response', async r => {
  if (!r.url().endsWith('.geojson')) return
  try { const b = await r.buffer(); reqs.push({ f: r.url().split('/').pop(), b: b.length }) } catch {}
})

const t0 = Date.now()
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
let ms = -1
for (let i = 0; i < 90; i++) {
  const stuck = await page.evaluate(() =>
    [...document.querySelectorAll('div')].some(d => (d.textContent || '').trim() === '绘制航海图...'))
  if (!stuck) { ms = Date.now() - t0; break }
  await new Promise(r => setTimeout(r, 200))
}
console.log('「绘制航海图」占屏:', ms === -1 ? '>18s' : (ms / 1000).toFixed(2) + 's')
console.log('geojson 请求:', reqs.map(r => `${r.f}=${(r.b / 1024).toFixed(0)}KB`).join(', ') || '(无)')
console.log('总计:', (reqs.reduce((s, r) => s + r.b, 0) / 1024).toFixed(0) + 'KB')
await browser.close()
