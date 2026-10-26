// 事件插图全量巡检：把每个被用到的 sceneKey 都渲染一张，看真图 vs 手绘兜底的观感差异
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots/scenes'
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
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

// 统计每个 sceneKey 被多少事件用到
const usage = await page.evaluate(async () => {
  const mod = await import('/Age-of-Discovery/src/data/events.ts')
  const counts = {}
  for (const e of mod.events) {
    const k = e.sceneKey || '(none)'
    counts[k] = (counts[k] || 0) + 1
  }
  return counts
})
console.log('sceneKey 使用频次:', JSON.stringify(usage, null, 0))

// 真实插图映射表
const hasRealImg = await page.evaluate(async () => {
  const mod = await import('/Age-of-Discovery/src/data/sceneImages.ts')
  return Object.keys(mod.SCENE_IMAGES)
})
console.log('有真图的键:', hasRealImg.join(', '))

let realDone = false
// 挑一个事件渲染，看事件卡里的插图区域
const fallbackKeys = Object.keys(usage).filter(k => !hasRealImg.includes(k))
console.log('仍走手绘兜底的键（未配置映射）:', fallbackKeys.join(', ') || '（无）')

// 逐一渲染所有被用到的 sceneKey，判定「真实显示的是 img 还是 svg」
// 注意：不能只看映射表——映射存在但文件缺失时，<img> 加载失败会走 onError 回退 SVG，
// 那种情况在映射表上完全看不出来。
console.log('\n逐一渲染验证（判定依据是 DOM 里到底是 <img> 还是 <svg>）：')
const verdict = { realImg: [], svgFallback: [] }
for (const key of Object.keys(usage)) {
  if (key === '(none)') continue
  const ev = await page.evaluate(async (k) => {
    const mod = await import('/Age-of-Discovery/src/data/events.ts')
    const e = mod.events.find(x => x.sceneKey === k)
    if (!e) return null
    window.__gameStore.getState().setCurrentEvent(e)
    return { id: e.id, title: e.title }
  }, key)
  if (!ev) { console.log(`  ! 无事件用 ${key}`); continue }
  await sleep(600)
  const box = await page.evaluate(() => {
    const all = [...document.querySelectorAll('div')]
    const el = all.find(d => d.style && d.style.aspectRatio === '400 / 140')
    if (!el) return null
    const r = el.getBoundingClientRect()
    const img = el.querySelector('img')
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      isImg: !!img,
      loaded: !!img && img.complete && img.naturalWidth > 0,
    }
  })
  if (!box) { console.log(`  ! ${key}: 未找到场景容器`); continue }
  const isReal = box.isImg && box.loaded
  ;(isReal ? verdict.realImg : verdict.svgFallback).push(key)
  console.log(`  ${isReal ? '✓ 真图' : '✗ 手绘'}  ${key.padEnd(10)} (事件 ${ev.id} ${ev.title})`)
  if (!isReal) {
    await page.screenshot({ path: `${SHOTS}/fallback-${key}.png`, clip: { x: box.x, y: box.y, width: box.w, height: box.h } })
  }
  // 真图对照组
  const realKey = hasRealImg[0]
  await page.evaluate(async (k) => {
    const mod = await import('/Age-of-Discovery/src/data/events.ts')
    const e = mod.events.find(x => x.sceneKey === k)
    if (e) window.__gameStore.getState().setCurrentEvent(e)
  }, realKey)
  await sleep(700)
  const rbox = await page.evaluate(() => {
    const all = [...document.querySelectorAll('div')]
    const el = all.find(d => d.style && d.style.aspectRatio === '400 / 140')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  })
  if (rbox && !realDone) {
    await page.screenshot({ path: `${SHOTS}/real-${realKey}.png`, clip: { x: rbox.x, y: rbox.y, width: rbox.w, height: rbox.h } })
    realDone = true
  }
}

console.log(`\n真实显示真图的场景（${verdict.realImg.length}）：${verdict.realImg.join(', ') || '（无）'}`)
console.log(`实际走手绘兜底的场景（${verdict.svgFallback.length}）：${verdict.svgFallback.join(', ') || '（无）'}`)
if (verdict.svgFallback.length) {
  console.log('  ↑ 这些场景的映射已配置但图片未成功加载（文件缺失或解码失败）')
}
await browser.close()
