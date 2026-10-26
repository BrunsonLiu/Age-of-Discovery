// 回归测试：EventScene 的「插图加载失败」状态是否会跨场景残留
//
// 风险场景：EventScene 没有 key，React 会复用同一个组件实例。
// 若玩家先遇到「缺图」场景，随后切到「有图」场景时，失败标记若是个全局布尔值
// 就会一直挂着 true → 本来正常的真图场景也被迫退化成手绘 SVG。
//
// 这个 bug 在第三批 11 张图交付前一直隐形（那时所有图都存在）。
//
// ── 缺图场景怎么构造 ──────────────────────────────────────────────
// 早期版本用「运行时 import() 后改写 SCENE_IMAGES.storm 的路径」来造缺图。
// 那种做法在 Vite dev 下不可靠：页面里动态 import() 拿到的模块实例，
// 和 App 运行时真正使用的那份不一定是同一个（HMR 会给模块加时间戳 query，
// 于是变成两份独立的模块对象），改写对运行中的 App 没有任何效果——
// 测试会「通过」，但测的根本不是玩家会遇到的路径。
//
// 现在改用浏览器层的请求拦截（CDP Fetch/Network）：直接把指定图片的
// HTTP 请求 abort 掉。这正是「图加载不出来」在真实环境下的样子
// （404 / 断网 / CDN 故障），既不碰文件系统，也不依赖模块实例，
// 测到的就是玩家真实会走的那条代码路径。
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

/** 被拦截的素材：storm 场景的 D1 风暴之夜（d01.png）。 */
const BLOCKED_ASSET = '/assets/scenes/d01.png'
const BLOCKED_URL_MARK = 'd01.png'

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })

const errors = []
/** 被我们主动拦掉的图片请求——它们本来就会报错，不算回归 */
const expectedFailures = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => {
  if (m.type() !== 'error') return
  const text = m.text()
  // Chrome 为失败的 <img> 打一条 "Failed to load resource: net::ERR_FAILED"，
  // 文本里不带文件名，得从消息的来源 URL 上认。
  const from = m.location?.()?.url ?? ''
  if (from.includes(BLOCKED_URL_MARK) || text.includes(BLOCKED_URL_MARK)) {
    expectedFailures.push(text.slice(0, 120))
    return
  }
  errors.push('CONSOLE: ' + text.slice(0, 160))
})

/** 当前是否拦截 d01.png；测试中途切换 */
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

/** 触发某个 sceneKey 对应的事件，并读回插图容器的真实渲染结果 */
const probe = async (sceneKey) => {
  await page.evaluate(async (k) => {
    const mod = await import('/Age-of-Discovery/src/data/events.ts')
    const e = mod.events.find(x => x.sceneKey === k)
    window.__gameStore.getState().setCurrentEvent(e)
  }, sceneKey)
  await sleep(1000)
  return page.evaluate(() => {
    const all = [...document.querySelectorAll('div')]
    const el = all.find(d => d.style && d.style.aspectRatio === '400 / 140')
    if (!el) return null
    const img = el.querySelector('img')
    return {
      hasImg: !!img,
      hasSvg: !!el.querySelector('svg'),
      src: img?.getAttribute('src') ?? null,
      naturalW: img?.naturalWidth ?? null,
    }
  })
}

/** 关掉当前事件卡（EventCard 返回 null → 整棵子树卸载） */
const closeEvent = async () => {
  await page.evaluate(() => { window.__gameStore.getState().clearCurrentEvent() })
  await sleep(500)
}

let pass = 0, fail = 0
const check = (ok, msg, extra = '') => {
  if (ok) { pass++; console.log('  ✓', msg) }
  else { fail++; console.log('  ✗', msg, extra) }
}

console.log('① 拦截 d01.png，渲染缺图场景 storm')
const a = await probe('storm')
console.log('   ', JSON.stringify(a))
check(a && !a.hasImg && a.hasSvg, '缺图场景已回退手绘 SVG（不白屏、不显示破图标）',
  a && a.hasImg ? `← 仍渲染了 <img>（src=${a.src}）` : '← 场景容器未找到')

console.log('② 同一实例切到有图场景 chart（d11.png 未被拦截）')
const b = await probe('chart')
console.log('   ', JSON.stringify(b))
check(!!b && b.hasImg && !b.hasSvg && (b.naturalW ?? 0) > 0,
  '有图场景仍显示真图（失败状态未跨场景残留）',
  b && !b.hasImg ? `← 被误伤，实际渲染了 ${b.hasSvg ? 'SVG' : '空'}` : '')

console.log('③ 解除拦截，关闭事件卡后重新打开 storm（组件重挂载）')
blocking = false
await closeEvent()
const c = await probe('storm')
console.log('   ', JSON.stringify(c))
check(!!c && c.hasImg && !c.hasSvg && (c.naturalW ?? 0) > 0,
  '素材恢复后重新进入场景能显示真图',
  c && !c.hasImg ? `← 仍被失败状态卡住（实际渲染了 ${c.hasSvg ? 'SVG' : '空'}）` : '')

console.log('④ 再切一个有图场景 chart，确认状态机没有互相污染')
const d = await probe('chart')
console.log('   ', JSON.stringify(d))
check(!!d && d.hasImg && !d.hasSvg, '后续有图场景正常')

if (a) {
  await page.screenshot({ path: `${SHOTS}/imgfailed-reset-final.png` })
}

console.log('\n预期内的素材拦截报错：', expectedFailures.length)
expectedFailures.slice(0, 3).forEach(e => console.log('  ', e))
console.log('非预期页面/控制台错误：', errors.length)
errors.slice(0, 5).forEach(e => console.log('  ', e.slice(0, 160)))
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail > 0 || errors.length > 0 ? 1 : 0)
