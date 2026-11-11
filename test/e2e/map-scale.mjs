// 2D 海图比例尺（回归）
//
// 【守什么】比例尺是玩家用来"量"航线的工具，它必须**跟着投影变**：
//  ① 尺子上写的是整数海里（1-2-5 系列），条长落在可读区间；
//  ② 放大之后，同样长的一条尺子代表的里程必须变小 —— 写死长度的实现会在这里露馅；
//  ③ 它不吃点击（压在海图上的浮层不许整张吃点击，这条踩过四次）。
//
// 跑法：先起 dev server，再 `node test/e2e/map-scale.mjs`
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
// 直接置状态进入海图（开场致辞会盖住整屏，按 Enter 走完太慢且不稳）
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

const readBar = () => page.evaluate(() => {
  const el = document.querySelector('[data-testid=map-scale]')
  if (!el) return null
  const txt = (el.textContent || '').replace(/\s+/g, ' ').trim()
  const m = txt.match(/(\d+)\s*海里/)
  const barEl = el.querySelector('[data-scale-px]')
  const rect = barEl ? barEl.getBoundingClientRect() : null
  const style = window.getComputedStyle(el)
  return {
    nm: m ? Number(m[1]) : null,
    px: rect ? Math.round(rect.width) : null,
    dataPx: barEl ? Number(barEl.getAttribute('data-scale-px')) : null,
    hint: /公里/.test(txt),
    pointerEvents: style.pointerEvents,
    rect: el.getBoundingClientRect().toJSON(),
    txt,
  }
})

const b1 = await readBar()
check(!!b1, '2D 海图右下角有比例尺（map-scale）')
check(!!b1 && Number.isFinite(b1.nm), `比例尺写的是整数海里（${b1?.txt}）`)
check(!!b1 && [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].includes(b1.nm),
  `档位来自 1-2-5 系列（${b1?.nm} 海里）`)
check(!!b1 && b1.px >= 60 && b1.px <= 200, `尺子长度 ${b1?.px}px 在可读区间`)
check(!!b1 && Math.abs(b1.px - b1.dataPx) <= 1, `渲染宽度与算出来的像素一致（${b1?.px} vs ${b1?.dataPx}）`)
check(!!b1 && b1.hint, '同时给了公里换算（玩家不用查海里）')
check(!!b1 && b1.pointerEvents === 'none', '比例尺不吃点击（pointer-events: none）')

// 放大三级：同样一条屏幕长度代表的里程必须变小
await page.mouse.move(720, 420)
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel({ deltaY: -260 })
  await sleep(450)
}
await sleep(1200)
const b2 = await readBar()
check(!!b2, '放大之后比例尺还在')
check(!!b2 && b2.nm !== null && b1.nm !== null && b2.nm < b1.nm,
  `放大后档位变小（${b1?.nm} → ${b2?.nm} 海里）—— 写死长度的实现会在这里露馅`)
check(!!b2 && b2.px >= 60 && b2.px <= 200, `放大后长度仍在可读区间（${b2?.px}px）`)

// 缩回去，别让后面的用例停在放大状态
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel({ deltaY: 260 })
  await sleep(400)
}
await sleep(900)
const b3 = await readBar()
/*
 * 【为什么不判"缩回原级别就该是 200"】滚轮的每一格对应几级缩放由 Leaflet 决定，
 * 来回同样格数**不保证**回到同一级（实测 200 → 5 → 2000，格数对称但级别不对称）。
 * 判据只守方向：缩小时档位必须变大。
 */
check(!!b3 && b2 && b3.nm !== null && b2.nm !== null && b3.nm > b2.nm,
  `缩小后档位变大（${b2?.nm} → ${b3?.nm} 海里）`)

check(errors.length === 0, `无运行时错误（${errors.length} 条：${errors.slice(0, 2).join(' | ')}）`)
console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
