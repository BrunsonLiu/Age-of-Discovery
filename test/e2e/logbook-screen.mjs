// 航海志（整屏）：入口路由 / 关闭 / 交付领赏 / 移动端
//
// 这一套盯的是"整屏界面本身"，与 logbook.mjs（册子里的内容与线索流转）分工不同：
//   · 四个侧栏按钮是否真的把**对应那一页**翻出来（不是打开了一个默认页）
//   · 同一个按钮再点一次是否合上（整屏没有"点别处关闭"的手感）
//   · 合上之后主屏 UI 是否回来（不是一次性入口）
//   · 任务页的「交付领赏」是否真的结算（金币/货/完成数三样都要动）
//   · 移动端：页签横排能滚、关闭可点、正文不被挤没
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = 'http://localhost:5174/Age-of-Discovery/'
const SHOTS = '.workbuddy/shots'
mkdirSync(SHOTS, { recursive: true })

let pass = 0
const fails = []
const check = (ok, label) => {
  if (ok) { pass++; console.log('  ✓', label) }
  else { fails.push(label); console.log('  ✗ FAIL:', label) }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })

const boot = async (page) => {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => !!window.__gameStore && !!window.__mapStore, { timeout: 30000 })
  await page.evaluate(() => {
    window.__gameStore.setState({
      gamePhase: 'playing', tutorialStep: -1, showHelp: false,
      dialogueSeen: ['opening_pilot'], activePanel: null,
      logbook: [], claimedVictories: [], collectedDebris: [],
    })
    const s = window.__gameStore.getState()
    window.__gameStore.setState({
      fleet: { ...s.fleet, currentPortId: 6, isSailing: false, day: 20, gold: 1000, fame: 30 },
      discoveredPorts: [6, 1, 2],
    })
    window.__mapStore.getState().setViewMode('chart')
  })
  await sleep(700)
  // 开局致辞 / 大副立绘：用玩家自己的退路（Esc）收掉
  for (let i = 0; i < 3; i++) {
    const on = await page.evaluate(() => document.body.innerText.includes('Esc 跳过致辞'))
    if (!on) break
    await page.keyboard.press('Escape')
    await sleep(300)
  }
  await page.evaluate(() => {
    const d = window.__dialogueStore
    for (let i = 0; i < 8 && d?.getState?.().scriptId; i++) d.getState().skip()
  })
  await sleep(300)
}

const state = (page) => page.evaluate(() => ({
  records: window.__mapStore.getState().recordsOpen,
  tab: window.__mapStore.getState().logTab,
  view: window.__mapStore.getState().viewMode,
}))

/* ───────────────────── 桌面 1440×900 ───────────────────── */
console.log('=== 桌面：四个记录类入口 ===')
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
await boot(page)

/*
 * 四个按钮各翻到**对应那一页**。
 * 关闭不用"再点一次"：册子一开，侧栏整列就不在 DOM 里（整屏），
 * 那条路走不到 —— 关闭只认册子自己的「回海图」与 Esc。
 */
for (const [label, tab] of [['任务', 'task'], ['日志', 'journal'], ['成就', 'achievement'], ['船长', 'rival']]) {
  const box = await page.evaluate((l) => {
    const b = document.querySelector(`button[aria-label="${l}"]`)
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, label)
  if (!box) { check(false, `侧栏有「${label}」按钮`); continue }
  await page.mouse.click(box.x, box.y)
  await sleep(450)
  const s = await state(page)
  check(s.records && s.tab === tab, `点「${label}」→ 航海志翻到 ${tab} 页`)
  check(await page.evaluate(() => !document.querySelector('button[aria-label="舰队"]')),
    `打开 ${tab} 后侧栏收走（整屏不是"盖一层"）`)
  await page.keyboard.press('Escape')
  await sleep(400)
  check(!(await state(page)).records, `Esc 合上（${tab}）`)
}

/* 合上之后主屏 UI 必须回来 */
check(await page.evaluate(() => !!document.querySelector('button[aria-label="舰队"]')), '合上后侧栏回来（不是一次性入口）')
check(await page.evaluate(() => !!document.querySelector('[data-testid="compass"]') || !!document.querySelector('[data-testid="next-port-hint"]')),
  '合上后主屏浮层回来')

/* ───────────────── 整屏就是整屏：主屏 UI 全不在 DOM ───────────────── */
console.log('=== 整屏：主屏控件让位 ===')
await page.evaluate(() => window.__mapStore.getState().openLogbook('task'))
await sleep(450)
{
  const gone = await page.evaluate(() => ({
    sidebar: !document.querySelector('button[aria-label="舰队"]'),
    bottom: !document.querySelector('[data-testid="bottom-bar"]'),
    deck: !document.querySelector('[data-testid="deck-enter"]'),
    threeD: !document.querySelector('[data-testid="map3d-enter"]'),
    hint: !document.querySelector('[data-testid="next-port-hint"]'),
  }))
  check(gone.sidebar, '侧栏不挂（不是被盖住）')
  check(gone.bottom, '底栏不挂')
  check(gone.deck, '「船上」入口不挂（它 z-900，会浮在资料页头上）')
  check(gone.threeD, '「3D 海图」入口不挂')
  check(gone.hint, '「下一站」常驻条不挂')
  check(await page.evaluate(() => !!document.querySelector('[data-testid="logbook-screen"]')),
    '航海志自己挂出来了')
}

/* ───────────────────── 交付领赏：三样都要动 ───────────────────── */
console.log('=== 交付领赏 ===')
const deliver = await page.evaluate(async () => {
  const m = await import('/Age-of-Discovery/src/data/tasks.ts').catch(() => import('/src/data/tasks.ts'))
  const task = m.tasks.find(t => t.id === 4)   // 蔗糖订单：哈瓦那买 → 塞维利亚交，需 6 件蔗糖
  const s = window.__gameStore.getState()
  window.__gameStore.setState({
    activeTasks: [{ ...task, status: 'active' }],
    completedTasks: [],
    // 已经到目标港（塞维利亚 6），货也带够了
    fleet: { ...s.fleet, currentPortId: 6, isSailing: false, gold: 1000, cargo: [{ goodId: 5, quantity: 6 }] },
  })
  window.__mapStore.getState().openLogbook('task')
  return { goodId: task.requiredGoods[0].goodId, need: task.requiredGoods[0].quantity, reward: task.reward.gold }
})
await sleep(600)
check(await page.evaluate(() => !!document.querySelector('[data-testid="task-deliver-4"]')),
  '到了目标港、货也够 → 「交付领赏」出现')

const before = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return {
    gold: s.fleet.gold,
    done: s.completedTasks.length,
    cargo: s.fleet.cargo.find(c => c.goodId === 5)?.quantity ?? 0,
  }
})
await page.click('[data-testid="task-deliver-4"]')
await sleep(600)
const after = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return {
    gold: s.fleet.gold,
    done: s.completedTasks.length,
    cargo: s.fleet.cargo.find(c => c.goodId === 5)?.quantity ?? 0,
    doneIds: s.completedTasks,
    active: s.activeTasks.length,
    stillOpen: window.__mapStore.getState().recordsOpen,
  }
})
check(after.gold === before.gold + deliver.reward, `金币按赏金到账（${before.gold} → ${after.gold}，应 +${deliver.reward}）`)
check(after.done === before.done + 1 && after.doneIds.includes(4), '完成数 +1，且记在这次任务上')
check(after.cargo === before.cargo - deliver.need, `交货扣货（${before.cargo} 件 → ${after.cargo} 件）`)
check(after.active === 0, '任务从「手上这单」移走')
check(after.stillOpen, '交付后册子还开着（不是交完就被弹走）')
check(await page.evaluate(() => document.body.innerText.includes('已经交差')), '落到「已经交差」一节')

/* 不在目标港时不许交付 —— 按钮不该出现 */
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({
    activeTasks: [], completedTasks: [],
    fleet: { ...s.fleet, currentPortId: 1 },
  })
  window.__mapStore.getState().closeRecords()
})
await sleep(300)
{
  const s = await page.evaluate(async () => {
    const m = await import('/Age-of-Discovery/src/data/tasks.ts').catch(() => import('/src/data/tasks.ts'))
    const task = m.tasks.find(t => t.id === 4)
    const st = window.__gameStore.getState()
    window.__gameStore.setState({
      activeTasks: [{ ...task, status: 'active' }],
      fleet: { ...st.fleet, currentPortId: 1, cargo: [{ goodId: 5, quantity: 6 }] },
    })
    window.__mapStore.getState().openLogbook('task')
    return task.id
  })
  await sleep(500)
  check(!(await page.$(`[data-testid="task-deliver-${s}"]`)), '在别的港：不出现「交付领赏」')
  check(await page.evaluate(() => document.body.innerText.includes('到港')), '而是写清"到港再交付"')
}
await page.screenshot({ path: `${SHOTS}/logbook-screen-task.png` })

/* ───────────────── 每页都有内容（不是空壳） ───────────────── */
console.log('=== 五个页签都有内容 ===')
for (const [tab, marker] of [['task', '眼下能接'], ['journal', '记事'], ['atlas', '已点亮'], ['achievement', '已得'], ['rival', '你的座次']]) {
  await page.evaluate((t) => window.__mapStore.getState().setLogTab(t), tab)
  await sleep(350)
  const n = await page.evaluate(() => (document.querySelector('[data-testid^="logbook-page-"]')?.textContent || '').replace(/\s+/g, '').length)
  check(n > 20, `${tab} 页有内容（${n} 字）`)
  check(await page.evaluate((m) => document.body.innerText.includes(m), marker), `${tab} 页出现「${marker}」`)
}

/*
 * 关闭按钮：先清掉可能还在的**剧情对白**与横幅。
 * 对白层是 fixed inset-0 + 半黑遮罩（它会压住页头，这是对的：那一刻正在演台词），
 * 判"按钮可点"之前必须把场景收拾干净，否则测的是"被台词盖住"而不是按钮本身。
 */
await page.evaluate(() => {
  const d = window.__dialogueStore
  for (let i = 0; i < 8 && d?.getState?.().scriptId; i++) d.getState().skip()
})
await sleep(400)
await page.evaluate(() => {
  const s = window.__mapStore.getState()
  window.__mapStore.getState().setViewMode('chart')
  window.__gameStore.setState({ activeTasks: [] })
  s.openLogbook('atlas')
})
await sleep(500)
{
  const hit = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="logbook-close"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    const chain = []
    for (let n = top, k = 0; n && k < 5; n = n.parentElement, k++) {
      chain.push(`${n.tagName}.${(n.getAttribute('class') || '').slice(0, 34)}`)
    }
    return { self: top === el || el.contains(top), tid: top?.getAttribute?.('data-testid') ?? top?.tagName, chain }
  })
  check(hit?.self === true, `「回海图」按钮没被压住（命中 ${hit?.tid}）${hit?.self ? '' : ' ← ' + (hit?.chain || []).join(' < ')}`)
}
await page.click('[data-testid="logbook-close"]')
await sleep(450)
check(!(await state(page)).records, '右上「回海图」按钮能合上册子')
check((await state(page)).view === 'chart', '合上后回到原来的空间（这里是海图）')

await page.close()

/* ───────────────────── 移动端 390×844 ───────────────────── */
console.log('=== 移动端 ===')
const m = await browser.newPage()
await m.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
await boot(m)
await m.evaluate(() => window.__mapStore.getState().openLogbook('task'))
await sleep(700)
{
  const nav = await m.evaluate(() => {
    const tabs = [...document.querySelectorAll('[role=tab]')]
    const nav = tabs[0]?.closest('nav')
    const r = nav?.getBoundingClientRect()
    return {
      count: tabs.length,
      horizontal: nav ? getComputedStyle(nav).flexDirection === 'row' : false,
      width: r ? Math.round(r.width) : 0,
      overflow: nav ? nav.scrollWidth > nav.clientWidth + 1 : false,
    }
  })
  check(nav.count === 5, '移动端五个页签都在')
  check(nav.horizontal, '页签横排（竖排会把正文挤没）')
  check(nav.width >= 380, `页签栏铺满屏宽（${nav.width}px）`)
  check(nav.overflow, '放不下时可横滚（scrollWidth > clientWidth）')
}
{
  const body = await m.evaluate(() => {
    const el = document.querySelector('[data-testid^="logbook-page-"]')
    return el ? Math.round(el.getBoundingClientRect().width) : 0
  })
  check(body >= 300, `正文有可用宽度（${body}px）`)
}
check(!!(await m.$('[data-testid="logbook-close"]')), '移动端关闭按钮在')
await m.click('[data-testid="logbook-close"]')
await sleep(400)
check(!(await m.evaluate(() => window.__mapStore.getState().recordsOpen)), '移动端点关闭能合上')
check(await m.evaluate(() => !!document.querySelector('[data-testid="mobile-tab-bar"]')), '合上后底栏回来')
await m.screenshot({ path: `${SHOTS}/logbook-screen-mobile.png` })

/* 移动端：底栏「任务」进册子（真鼠标） */
{
  const box = await m.evaluate(() => {
    const b = [...document.querySelectorAll('[data-testid="mobile-tab-bar"] button')]
      .find(e => e.getAttribute('aria-label') === '任务')
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (box) {
    await m.touchscreen.tap(box.x, box.y)
    await sleep(600)
    const s = await m.evaluate(() => ({
      records: window.__mapStore.getState().recordsOpen,
      tab: window.__mapStore.getState().logTab,
    }))
    check(s.records && s.tab === 'task', '移动端底栏「任务」→ 航海志任务页')
  } else {
    check(false, '移动端底栏有「任务」入口')
  }
}

check(await m.evaluate(() => true), '无页面错误')
await m.close()
await browser.close()

console.log(`\n航海志整屏 e2e：${pass} 通过 / ${fails.length} 失败`)
if (fails.length) {
  for (const f of fails) console.log('   ✗', f)
  process.exitCode = 1
}
