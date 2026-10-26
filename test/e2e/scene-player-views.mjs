/**
 * 玩家视角对比：同一个事件卡容器里，新旧两批素材的实际观感。
 * 不做理论推演——直接把 25 个场景按真实容器尺寸渲染出来拼成一张大图。
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const ROOT = path.resolve('.')
const SHOTS = path.join(ROOT, '.workbuddy', 'shots', 'scenes')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'

const events = fs.readFileSync(path.join(ROOT, 'src/data/events.ts'), 'utf8')
const pairs = [...events.matchAll(/sceneKey:\s*'([^']+)'[\s\S]{0,120}?title:\s*'([^']+)'/g)].map(m => ({ key: m[1], title: m[2] }))
const seen = new Set()
const uniq = pairs.filter(p => !seen.has(p.key) && seen.add(p.key))

fs.mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', e => errors.push(String(e)))

await page.goto('http://127.0.0.1:5174/Age-of-Discovery/', { waitUntil: 'networkidle2' })
await page.evaluate(() => window.__gameStore.getState().initGame('merchant'))
await new Promise(r => setTimeout(r, 1500))

// 逐个场景渲染事件卡，只截事件卡里的插图区域
const results = []
for (const { key, title } of uniq) {
  const ok = await page.evaluate(async (k) => {
    const mod = await import('/Age-of-Discovery/src/data/events.ts')
    const e = mod.events.find(x => x.sceneKey === k)
    if (!e) return false
    window.__gameStore.getState().setCurrentEvent(e)
    return true
  }, key)
  if (!ok) continue
  await new Promise(r => setTimeout(r, 450))
  const box = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(d => d.style && d.style.aspectRatio === '400 / 140')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
  })
  if (!box) continue
  const file = `pv-${key}.png`
  await page.screenshot({ path: path.join(SHOTS, file), clip: box })
  results.push({ key, title, file })
  console.log(`  ✓ ${key.padEnd(10)} ${title}`)
}

console.log(`\n渲染 ${results.length} 个场景，控制台错误 ${errors.length} 条`)
if (errors.length) console.log(errors.slice(0, 5).join('\n'))

fs.writeFileSync(path.join(SHOTS, 'player-views.json'), JSON.stringify(results, null, 2))
await browser.close()
