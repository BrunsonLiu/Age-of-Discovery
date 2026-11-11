// 2D 海图「航程圈」（回归）
//
// 【守什么】航程圈是"够不够得着"的测量工具。三件事必须真：
//  ① 默认是关的（开局不糊海图），点底栏开关才出现，再点消失；
//  ② 圈的**天数跟着缩放挑**（固定 5/10 天时，默认缩放下 10 天圈整圈在画面外，
//     标签一个字都看不见 —— 这是改自适应之前实测到的）；
//  ③ 两圈的标签都落在画面内，且内圈天数明显小于外圈（否则读成双线）。
//
// 跑法：先起 dev server，再 `node test/e2e/map-rings.mjs`
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const page = await (await browser.createBrowserContext()).newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (/favicon|AudioContext|net::ERR_/.test(t)) return
  errors.push('CONSOLE: ' + t.slice(0, 160))
})
await page.setViewport({ width: 1440, height: 900 })

let pass = 0
let fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) }
}

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2400)
await page.evaluate(() => {
  window.__gameStore.setState({ gamePhase: 'playing', currentEvent: null })
  window.__mapStore.setState({ viewMode: 'chart' })
})
await sleep(1200)
await page.evaluate(() => {
  document.querySelectorAll('div.fixed.inset-0').forEach((d) => {
    if (/跳过致辞/.test(d.textContent || '')) d.style.display = 'none'
  })
  document.querySelectorAll('[role=dialog]').forEach((d) => { d.style.display = 'none' })
})
await sleep(1800)

const state = () => page.evaluate(() => {
  const wrap = document.querySelector('[data-testid=voyage-rings]')
  const btn = document.querySelector('[data-testid=toggle-voyage-rings]')
  const map = document.querySelector('.leaflet-container')
  const mr = map ? map.getBoundingClientRect() : null
  const labels = [...document.querySelectorAll('.voyage-ring-icon')].map((el) => {
    const r = el.getBoundingClientRect()
    const m = (el.textContent || '').match(/(\d+)\s*天/)
    return {
      text: (el.textContent || '').trim(),
      days: m ? Number(m[1]) : null,
      x: Math.round(r.x), y: Math.round(r.y),
      inside: !!(mr && r.x >= mr.x && r.y >= mr.y && r.right <= mr.right && r.bottom <= mr.bottom),
    }
  })
  return { has: !!wrap, pressed: btn?.getAttribute('aria-pressed'), labels, mapRect: mr ? { w: Math.round(mr.width), h: Math.round(mr.height) } : null }
})

const s0 = await state()
check(!!s0.mapRect, '2D 海图已挂载（leaflet-container 存在）')
check(s0.has === false, '航程圈默认是关的（开局不糊海图）')
check(s0.pressed === 'false', `底栏开关的 aria-pressed=false（实测 ${s0.pressed}）`)

await page.evaluate(() => document.querySelector('[data-testid=toggle-voyage-rings]')?.click())
await sleep(1500)
const s1 = await state()
check(s1.has === true, '点开关后航程圈出现')
check(s1.pressed === 'true', `开关 aria-pressed=true（实测 ${s1.pressed}）`)
check(s1.labels.length >= 1 && s1.labels.length <= 2, `画了 ${s1.labels.length} 圈（最多两圈）`)
check(s1.labels.every((l) => Number.isFinite(l.days)), `每圈都有天数标签（${s1.labels.map((l) => l.text).join(' / ')}）`)
check(s1.labels.every((l) => l.inside), '所有标签都落在海图范围内（不是画到画面外）')
if (s1.labels.length === 2) {
  const [a, b] = s1.labels
  check(a.days < b.days, `内圈 ${a.days} 天 < 外圈 ${b.days} 天`)
  check(a.days <= b.days * 0.55 + 1e-9, `两圈拉开距离（${a.days} vs ${b.days}），不会读成双线`)
}

// 再点一次：收起来
await page.evaluate(() => document.querySelector('[data-testid=toggle-voyage-rings]')?.click())
await sleep(900)
const s2 = await state()
check(s2.has === false, '再点一次航程圈消失')

check(errors.length === 0, `无运行时错误（${errors.length} 条：${errors.slice(0, 2).join(' | ')}）`)
console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
