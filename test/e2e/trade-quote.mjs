// 贸易报价一致性（端到端）：面板上写的价，必须等于真正结算的钱
//
// 跑法：先起 dev server，再 `node test/e2e/trade-quote.mjs`
//   GAME_URL=...  EDGE_PATH=...  SHOTS_DIR=...  可覆盖默认路径
//
// 走的是真实玩家路径：在塞维利亚港（1 号港）买入 → 换港 → 折价卖出，
// 每一步都读屏幕上的数字，再核对钱包实际变化。
// 这条测试守的是项目最核心的规矩：**屏幕上显示的数字 = 实际发生的变化**。
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

// 直接进地图：给一支停在塞维利亚港（1 号港）的舰队，钱带够
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  const ship = {
    id: 1, name: '测试船', type: 'caravel', speed: 5, durability: 50,
    maxDurability: 100, capacity: 500, usedCapacity: 0, crew: 30, maxCrew: 40,
  }
  window.__gameStore.setState({
    gamePhase: 'playing',
    tutorialStep: -1,
    fleet: {
      ...s.fleet,
      gold: 100000,
      // 声望拉满：价格系数（声望/特质）此时不为 1，
      // 「显示价 ≠ 结算价」这类分叉才测得出来。系数为 1 时两者必然相等，
      // 那样的测试是永远通过的假测试。
      fame: 100,
      currentPortId: 1,
      isSailing: false,
      day: 1,
      ships: [ship],
      cargo: [],
      trait: null,
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
const panelOpen = await page.evaluate(() => !!document.querySelector('[data-testid="trade-panel"]'))
check(panelOpen, '贸易面板已打开')

// —— A) 买入：屏幕写的价 == 实际扣掉的金币 ——
// 雪茄（goodId 8）只在 1 号港经营，正好用来验证「本港不收」的折价路径
const buyResult = await page.evaluate(() => {
  const row = document.querySelector('[data-testid="trade-buy-row"][data-good-id="8"]')
  if (!row) return null
  const shown = Number(row.querySelector('[data-price]')?.getAttribute('data-price'))
  const btn = [...row.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '+1')
  const before = window.__gameStore.getState().fleet.gold
  if (btn) btn.click()
  const after = window.__gameStore.getState().fleet.gold
  return { shown, spent: before - after, qty: window.__gameStore.getState().fleet.cargo.find(c => c.goodId === 8)?.quantity ?? 0 }
})
check(!!buyResult, '买入列表里有雪茄')
if (buyResult) {
  check(buyResult.spent === buyResult.shown,
    `买入：屏幕写 ${buyResult.shown}，实际扣 ${buyResult.spent}`)
  check(buyResult.qty === 1, `买入 1 件后货舱里有 1 份（实际 ${buyResult.qty}）`)
}
await sleep(400)

// 再买 1 件（此时库存变了，报价也应随之变化——显示价要跟着变）
const buy2 = await page.evaluate(() => {
  const row = document.querySelector('[data-testid="trade-buy-row"][data-good-id="8"]')
  if (!row) return null
  const shown = Number(row.querySelector('[data-price]')?.getAttribute('data-price'))
  const btn = [...row.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '+1')
  const before = window.__gameStore.getState().fleet.gold
  if (btn) btn.click()
  const after = window.__gameStore.getState().fleet.gold
  return { shown, spent: before - after }
})
check(!!buy2, '第二次买入仍能定位到雪茄行')
if (buy2) {
  check(buy2.spent === buy2.shown, `再次买入：屏幕写 ${buy2.shown}，实际扣 ${buy2.spent}`)
}
await sleep(300)
// 关掉右上角的成就横幅——它们会盖住贸易面板，截图和点击都要让开
await page.evaluate(() => {
  document.querySelectorAll('button[aria-label="关闭通知"]').forEach(b => b.click())
})
await sleep(300)
await page.screenshot({ path: `${SHOTS}/trade-buy.png` })

// —— B) 换到不收雪茄的港口，走「本港不收 → 折价出清」路径 ——
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...s.fleet, currentPortId: 2 } })
})
await sleep(600)

// 关掉右上角的成就横幅——它们会盖住贸易面板，截图和点击都要让开
await page.evaluate(() => {
  document.querySelectorAll('button[aria-label="关闭通知"]').forEach(b => b.click())
})
await sleep(300)

// 切到出售页
await page.evaluate(() => {
  const panel = document.querySelector('[data-testid="trade-panel"]')
  const btn = panel && [...panel.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '出售')
  if (btn) btn.click()
})
await sleep(600)

const sellRow = await page.evaluate(() => {
  const row = document.querySelector('[data-testid="trade-sell-row"][data-good-id="8"]')
  if (!row) return null
  return {
    shown: Number(row.querySelector('[data-price]')?.getAttribute('data-price')),
    text: (row.textContent || '').replace(/\s+/g, ' ').trim(),
    hasOfferTag: (row.textContent || '').includes('本港不收'),
  }
})
check(!!sellRow, '出售列表里有雪茄')
if (sellRow) {
  check(sellRow.hasOfferTag, '本港不经营的商品标出「本港不收」')
  await page.screenshot({ path: `${SHOTS}/trade-sell-offer.png` })

  const sellResult = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="trade-sell-row"][data-good-id="8"]')
    if (!row) return null
    const shown = Number(row.querySelector('[data-price]')?.getAttribute('data-price'))
    const btn = [...row.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '-1')
    const before = window.__gameStore.getState().fleet.gold
    if (btn) btn.click()
    const st = window.__gameStore.getState()
    return {
      shown,
      earned: st.fleet.gold - before,
      left: st.fleet.cargo.find(c => c.goodId === 8)?.quantity ?? 0,
    }
  })
  check(!!sellResult, '折价行的卖出按钮可点')
  if (sellResult) {
    check(sellResult.earned === sellResult.shown,
      `折价卖出：屏幕写 ${sellResult.shown}，实际到手 ${sellResult.earned}`)
    check(sellResult.left === 1, `卖出 1 件后货舱剩 1 份（实际 ${sellResult.left}）`)
  }
}

// —— C) 旧 bug 的对照：面板价与实际结算价曾差到 67 金 ——
// 这里再核一遍所有买入行，确保没有一行是「显示一个价、扣另一个价」
const allRows = await page.evaluate(() => {
  const panel = document.querySelector('[data-testid="trade-panel"]')
  if (!panel) return []
  const tab = [...panel.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '购买')
  if (tab) tab.click()
  return []
})
await sleep(500)
const sweep = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-testid="trade-buy-row"]')]
  const out = []
  for (const row of rows) {
    const goodId = Number(row.getAttribute('data-good-id'))
    const shown = Number(row.querySelector('[data-price]')?.getAttribute('data-price'))
    const btn = [...row.querySelectorAll('button')].find(b => (b.textContent || '').trim() === '+1')
    const before = window.__gameStore.getState().fleet.gold
    if (!btn || btn.disabled) { out.push({ goodId, shown, spent: null }); continue }
    btn.click()
    const spent = before - window.__gameStore.getState().fleet.gold
    out.push({ goodId, shown, spent })
  }
  return out
})
const mismatched = sweep.filter(r => r.spent !== null && r.spent !== r.shown)
check(sweep.length >= 5, `逐行核对覆盖了足够多的商品（${sweep.length} 行）`)
check(mismatched.length === 0,
  `逐行核对：显示价 = 实扣金（不一致 ${mismatched.length} 行${mismatched.length ? '：' + JSON.stringify(mismatched.slice(0, 3)) : ''}）`)

await page.screenshot({ path: `${SHOTS}/trade-quote-final.png` })

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (errors.length) {
  console.log('\n运行时错误：')
  errors.forEach(e => console.log('  ', e))
  fail += errors.length
}
await browser.close()
process.exit(fail > 0 ? 1 : 0)
