import fs from 'fs'

let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = process.argv[2] || 'https://brunsonliu.github.io/Age-of-Discovery/'
const SHOTS = '.workbuddy/shots'
fs.mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 900 })

const failed = []
const errors = []
page.on('requestfailed', r => failed.push(`${r.url()} :: ${r.failure()?.errorText}`))
page.on('response', r => { if (r.status() >= 400) failed.push(`HTTP ${r.status()} ${r.url()}`) })
page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 200)))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)) })

console.log('打开:', URL)
// networkidle2 在这个页面上等不到（Leaflet 持续有网络活动），
// 改用 domcontentloaded + 显式等待首屏渲染完成。
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(
  () => document.body && document.body.innerText && document.body.innerText.length > 20,
  { timeout: 45000 },
).catch(() => {})
await new Promise(r => setTimeout(r, 8000))

const state = await page.evaluate(() => {
  const txt = document.body.innerText || ''
  const loadingEl = [...document.querySelectorAll('div')].find(d => (d.textContent || '').trim() === '绘制航海图...')
  const leaflet = !!document.querySelector('.leaflet-container')
  const svgs = document.querySelectorAll('.leaflet-overlay-pane svg').length
  const tiles = document.querySelectorAll('.leaflet-tile').length
  return {
    text: txt.slice(0, 300).replace(/\n+/g, ' | '),
    stuckLoading: !!loadingEl,
    leaflet,
    svgCount: svgs,
    tileCount: tiles,
  }
})
console.log('\n=== 页面状态 ===')
console.log(JSON.stringify(state, null, 2))
console.log('\n=== 失败请求 ===')
failed.forEach(f => console.log('  ' + f))
console.log('\n=== 错误 ===')
errors.forEach(e => console.log('  ' + e))

await page.screenshot({ path: `${SHOTS}/online-check.png` })
console.log('\n截图:', `${SHOTS}/online-check.png`)
await browser.close()
