/*
 * 行情线索：那条「某港正缺某货」必须出现在**主屏**，而不只是躺在册子里。
 *
 * 【为什么单独一个套件】
 * `pickRumor` 的文案有两条出口：册子见闻页的 `hint`，以及主屏「刚带回」那行
 * （`useArrivalReceipt` 把 hint 在「——」处截断）。单测能证明文案是对的，
 * 但证明不了它**过得了截断、装得进那一行、点得开册子** ——
 * 这三件事只有真浏览器能回答。
 */
const BASE = process.env.GAME_URL || process.env.AOD_BASE || 'http://127.0.0.1:5174/Age-of-Discovery/'
const puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log(`  ✓ ${msg}`) } else { fail++; console.log(`  ✗ FAIL: ${msg}`) } }

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)) })
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 40000 })
await sleep(2000)

console.log('=== 布置：一页未读见闻 ===')
const seeded = await page.evaluate(async () => {
  const g = window.__gameStore
  const d = window.__dialogueStore
  for (let i = 0; i < 25 && d?.getState?.().scriptId; i++) d.getState().skip()
  g.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false, activePanel: null,
    dialogueSeen: ['opening_pilot'],
  })
  const s = g.getState()
  g.setState({
    fleet: { ...s.fleet, currentPortId: 1, isSailing: false, day: 12, gold: 3000 },
  })
  // 用生产同一个构造器（不是手写一页假数据）：这里要验的正是它产出的那一句
  const m = await import('/Age-of-Discovery/src/data/logbook.ts')
  const entry = m.makeArrivalEntry(1, 12, [1])
  if (!entry) return { ok: false, reason: 'makeArrivalEntry 返回 null' }
  g.setState({ logbook: [entry] })
  return { ok: true, text: entry.hint, target: entry.targetPortId, title: entry.title }
})
check(seeded.ok, `生成一页见闻（${seeded.title ?? seeded.reason}）`)
if (!seeded.ok) { await browser.close(); process.exit(1) }

check(/正缺/.test(seeded.text || ''),
  `见闻文案说的是"哪缺什么"（${seeded.text}）`)
check(/买得便宜/.test(seeded.text || ''), '并说明这边买得不贵')
check(!/\d/.test(seeded.text || ''), '文案里没有数字（不逼玩家算术）')

console.log('=== 主屏「刚带回」那一行 ===')
// 靠岸会自动弹出港口面板，它的遮罩（bg-black/45）盖住主屏回执 ——
// 那是"面板开着"的正常状态。要量的是**关掉面板之后**能不能点到。
await page.evaluate(() => {
  window.__gameStore.getState().setActivePanel(null)
  // 靠岸会再触发一次对白（它的遮罩 fixed inset-0、z=75，会吃掉主屏一切点击）
  window.__dialogueStore?.getState?.().skip?.()
})
await sleep(1400)
await page.evaluate(() => {
  window.__gameStore.getState().setActivePanel(null)
  window.__dialogueStore?.getState?.().skip?.()
})
await sleep(500)
const receipt = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="arrival-receipt"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    text: (el.textContent || '').trim(),
    unread: el.getAttribute('data-unread'),
    w: Math.round(r.width), h: Math.round(r.height),
    overflow: el.scrollWidth > el.clientWidth + 1,
    rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
    hitSelf: (() => {
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return !!hit && (hit === el || el.contains(hit) || hit.contains(el))
    })(),
    hitTag: (() => {
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return hit ? `${hit.tagName}.${(hit.className || '').toString().slice(0, 60)}` : null
    })(),
  }
})
check(!!receipt, '主屏出现「刚带回」回执')
if (receipt) {
  check(/正缺/.test(receipt.text),
    `回执那行就是行情线索（"${receipt.text}"）—— 截断点在「——」，前半句完整保留`)
  check(receipt.h === 28 || receipt.h <= 32,
    `行高 ${receipt.h}px（12px 字 + leading-tight，没被撑成两行）`)
  check(receipt.hitSelf,
    `回执中心点命中自己（rect ${receipt.rect} / 实际命中 ${receipt.hitTag}）`)
}

console.log('=== 点它 → 翻开册子 ===')
const opened = await page.evaluate(async () => {
  const el = document.querySelector('[data-testid="arrival-receipt"]')
  el?.click()
  await new Promise(r => setTimeout(r, 900))
  const m = window.__mapStore.getState()
  return { open: m.recordsOpen, tab: m.logTab }
})
check(opened.open === true, `点了回执就翻开航海志（recordsOpen=${opened.open}）`)
check(opened.tab === 'journal', `落在「见闻」页（logTab=${opened.tab}）`)

const inBook = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="logbook-screen"]')
  return (el?.textContent || '').replace(/\s+/g, ' ')
})
check(/正缺/.test(inBook), '册子里那一页写着同一条行情（不是只存了个 id）')
check(/买得便宜/.test(inBook), '册子里保留后半句（主屏截断、册子给全）')

check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
if (fail > 0) process.exit(1)
await browser.close()
