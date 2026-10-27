// 通知横幅不得妨碍玩家操作（端到端）
//
// 跑法：先起 dev server，再 `node test/e2e/notification-overlap.mjs`
//
// 背景：成就/发现通知固定在右上角，而右侧面板（贸易/港口/船厂）也在右上角。
// 早期版本一次渲染全部通知——一次交易同时解锁 4 个成就时，4 条通知叠起来
// 把整个面板盖住，玩家 3.5 秒内什么都点不了（货不减、钱不加，看着像游戏卡了）。
//
// 这里验三件事：
//   ① 同时可见的通知不超过 2 条，其余折叠成「还有 N 条」
//   ② 面板打开时通知自动让位（滑到面板左边）
//   ③ 通知压着面板时，**面板按钮仍然点得动**（真实鼠标点击，不是调 DOM 方法）
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)) })
await page.setViewport({ width: 1440, height: 900 })

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await new Promise(r => setTimeout(r, 2000))

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log('  ✗', msg) } }
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 一支停在塞维利亚港的舰队，钱带够——一次买入能同时触发多个成就
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  const ship = {
    id: 1, name: '测试船', type: 'caravel', speed: 5, durability: 50,
    maxDurability: 100, capacity: 500, usedCapacity: 0, crew: 30, maxCrew: 40,
  }
  window.__gameStore.setState({
    gamePhase: 'playing',
    tutorialStep: -1,
    // 开场对话期间 DialogueOverlay 会铺一层 bg-black/45 的暗化遮罩锁住地图，
    // 面板点不到是**正常设计**（对话中不该能操作地图）。要测通知遮挡，
    // 先把开场对话标记为已播，避开这层锁。
    dialogueSeen: ['opening_pilot'],
    fleet: {
      ...s.fleet, gold: 100000, fame: 0, currentPortId: 1, isSailing: false,
      day: 1, ships: [ship], cargo: [], trait: null,
    },
    marketStock: {},
  })
})
await sleep(900)

// 打开贸易面板
await page.evaluate(() => {
  const b = document.querySelector('[data-tut="trade"]')
  if (b) b.click()
})
await sleep(700)
check(await page.evaluate(() => !!document.querySelector('[data-testid="trade-panel"]')), '贸易面板已打开')

// 买一笔——这会一次性解锁多个成就，通知随之堆叠
await page.evaluate(() => {
  const row = document.querySelector('[data-testid="trade-buy-row"][data-good-id="1"]')
  const btn = row && [...row.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '+1')
  if (btn) btn.click()
})
await sleep(700)

const toastState = await page.evaluate(() => {
  // 从「关闭通知」按钮往上找容器——不依赖容器的类名/实现细节
  const closeBtn = document.querySelector('button[aria-label="关闭通知"]')
  if (!closeBtn) return null
  const container = closeBtn.parentElement?.parentElement
  if (!container) return null
  const cards = [...container.children].filter(c => c.querySelector('button[aria-label="关闭通知"]'))
  const overflow = [...container.children].find(c =>
    !c.querySelector('button[aria-label="关闭通知"]') && (c.textContent || '').includes('还有'))
  const style = getComputedStyle(container)
  return {
    cardCount: cards.length,
    overflowText: overflow ? (overflow.textContent || '').trim() : null,
    transform: style.transform,
    pointerEvents: style.pointerEvents,
  }
})
check(!!toastState, '通知容器存在')
if (toastState) {
  check(toastState.cardCount <= 2, `同时可见通知不超过 2 条（实际 ${toastState.cardCount}）`)
  check(toastState.cardCount > 0, '买完有成就通知弹出')
  check(toastState.pointerEvents === 'none', `通知容器不拦截点击（pointer-events: ${toastState.pointerEvents}）`)
  const shifted = toastState.transform !== 'none' && toastState.transform.includes('-')
  check(shifted, `面板打开时通知已让位（transform: ${toastState.transform}）`)
  console.log(`  通知状态：${toastState.cardCount} 条可见，溢出提示「${toastState.overflowText ?? '无'}」`)
}

// 关键：通知压着面板时，面板按钮**用真实鼠标点击**能不能点到
const tabBefore = await page.evaluate(() => {
  const panel = document.querySelector('[data-testid="trade-panel"]')
  const btn = panel && [...panel.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '出售')
  if (!btn) return null
  const r = btn.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
check(!!tabBefore, '面板上有「出售」标签可点')

if (tabBefore) {
  // 诊断：那个坐标上真正能点到的元素是谁
  const hit = await page.evaluate((p) => {
    const el = document.elementFromPoint(p.x, p.y)
    if (!el) return 'null'
    const desc = el.tagName + (el.className ? '.' + String(el.className).slice(0, 60) : '')
    const panel = document.querySelector('[data-testid="trade-panel"]')
    const btn = panel && [...panel.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '出售')
    return { desc, inPanel: btn ? panel.contains(el) : false, btnRect: btn ? btn.getBoundingClientRect().toJSON() : null }
  }, tabBefore)
  console.log('  诊断：坐标上命中', JSON.stringify(hit))

  // 真实鼠标事件：若通知拦截了命中测试，点击就会落在通知上，面板纹丝不动
  await page.mouse.click(tabBefore.x, tabBefore.y)
  await sleep(600)
  const onSellTab = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="trade-panel"]')
    if (!panel) return false
    return !!panel.querySelector('[data-testid="trade-sell-row"]')
  })
  check(onSellTab, '通知压着面板时，「出售」按钮依然点得动（真实鼠标点击）')
}

await page.screenshot({ path: `${SHOTS}/notification-overlap.png` })

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (errors.length) {
  console.log('\n运行时错误：')
  errors.forEach(e => console.log('  ', e))
  fail += errors.length
}
await browser.close()
process.exit(fail > 0 ? 1 : 0)
