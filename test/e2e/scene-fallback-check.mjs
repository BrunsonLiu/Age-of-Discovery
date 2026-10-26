// 缺图回退验证：插图加载不出来时，事件卡是否正常显示手绘 SVG
// （而不是白屏 / 破图标），以及控制台是否被无关报错污染。
//
// ── 缺图场景怎么构造 ──────────────────────────────────────────────
// 不能依赖「某个素材恰好不存在」——第三批 d15~d25 交付后这个前提就不成立了，
// 脚本会变成测一个不存在的假设。
// 这里用浏览器层的请求拦截（把指定图片的 HTTP 请求 abort 掉）来构造，
// 模拟的就是真实环境里的加载失败（404 / 断网 / CDN 故障），
// 不碰文件系统，也不依赖模块实例。
//
// 拦截对象的选取原则：必须是**当前真实存在**的素材。
// 若拿一个本来就不存在的地址去测，测到的是「文件不存在」，
// 而不是「文件存在但加载失败」——后者才是线上会遇到的故障。
import fs from 'node:fs'

let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots/scenes'

/** 被拦截的素材：第三批 D15 顺风而行（d15.png，真实存在于仓库中）。 */
const BLOCKED_URL_MARK = 'd15.png'

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errors = []
const failedReqs = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => {
  if (m.type() !== 'error') return
  const from = m.location?.()?.url ?? ''
  const text = m.text()
  // 被我们主动拦掉的图片请求引起的报错属于预期噪音
  if (from.includes(BLOCKED_URL_MARK) || text.includes(BLOCKED_URL_MARK)) return
  errors.push('CONSOLE: ' + text.slice(0, 160))
})
page.on('requestfailed', r => failedReqs.push(r.url().split('/').pop() + ' :: ' + r.failure()?.errorText))

let blocking = true
await page.setRequestInterception(true)
page.on('request', req => {
  if (blocking && req.url().includes(BLOCKED_URL_MARK)) {
    req.abort('failed').catch(() => {})
    return
  }
  req.continue().catch(() => {})
})

const sleep = ms => new Promise(r => setTimeout(r, ms))
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(1500)
await page.evaluate(() => { window.__gameStore.getState().initGame('merchant') })
await sleep(1200)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /跳过引导/.test(x.textContent || ''))
  if (b) b.click()
})
await sleep(600)
for (let i = 0; i < 6; i++) { await page.keyboard.press('Enter'); await sleep(350) }
await sleep(800)

// 渲染第三批场景 fairwind，它的插图 d15.png 被拦截 → 加载失败
const res = await page.evaluate(async () => {
  const mod = await import('/Age-of-Discovery/src/data/events.ts')
  const e = mod.events.find(x => x.sceneKey === 'fairwind')
  window.__gameStore.getState().setCurrentEvent(e)
  return { id: e.id, title: e.title }
})
await sleep(1200)

const box = await page.evaluate(() => {
  const all = [...document.querySelectorAll('div')]
  const el = all.find(d => d.style && d.style.aspectRatio === '400 / 140')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    hasImg: !!el.querySelector('img'),
    hasSvg: !!el.querySelector('svg'),
    imgSrc: el.querySelector('img')?.getAttribute('src') ?? null,
    imgComplete: el.querySelector('img')?.complete ?? null,
    imgNaturalW: el.querySelector('img')?.naturalWidth ?? null,
  }
})

console.log('事件', res.id, res.title)
console.log('容器:', JSON.stringify(box, null, 0))

if (box) {
  await page.screenshot({ path: `${SHOTS}/fallback-fairwind-after-map.png`, clip: { x: box.x, y: box.y, width: box.w, height: box.h } })
}

console.log('\n失败请求：', failedReqs.length)
failedReqs.slice(0, 8).forEach(r => console.log('  ', r))
console.log('控制台错误（已排除预期噪音）：', errors.length)
errors.slice(0, 8).forEach(e => console.log('  ', e))

const ok = box && box.hasSvg && !box.hasImg
console.log(`\n结果：${ok ? '✓ 缺图时已回退手绘 SVG（未白屏）' : '✗ 回退异常'}`)

await browser.close()
process.exit(ok && errors.length === 0 ? 0 : 1)
