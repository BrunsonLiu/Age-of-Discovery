// 王室特权：护送赏金 +25%、王室港修理/补给九折
//
// 【为什么要单开一套】faction-perks 那一套已经切过 3D 海图、开过舰队面板，
// 状态很杂；而这里要量的是"港口面板上写的数字 = 实际扣的金币" ——
// 必须是一张干净的海图 + 真的鼠标点击。混进那套里时实测面板根本没挂出来
// （renderMode 切回 2d 之后 Map3DView 仍在 DOM 里），读数全是 null。
//
// 判据只有一条主线：**屏幕上那个数字，就是点下去实际变化的数字**。
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'

let pass = 0
const fails = []
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) }
  else { fails.push(msg); console.log('  ✗ FAIL:', msg) }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 140)) })
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 30000 })
await page.evaluate(() => {
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false,
    dialogueSeen: ['opening_pilot'], activePanel: null,
    logbook: [], claimedVictories: [], collectedDebris: [],
  })
  const d = window.__dialogueStore
  for (let i = 0; i < 8 && d?.getState?.().scriptId; i++) d.getState().skip()
})
await sleep(600)

/* ───────── 修理：面板写的价 = 实际扣的钱 ───────── */
const crownId = await page.evaluate(async () => {
  const f = await import('/Age-of-Discovery/src/data/factions.ts').catch(() => import('/src/data/factions.ts'))
  const p = await import('/Age-of-Discovery/src/data/ports.ts').catch(() => import('/src/data/ports.ts'))
  return p.ports.find(x => f.portFaction(x.id) === 'crown' && x.services.includes('repair')).id
})
check(!!crownId, `找到一座能修船的王室港（#${crownId}）`)

const measureRepair = async (crownRep) => {
  await page.evaluate(({ id, rep }) => {
    const st = window.__gameStore.getState()
    window.__gameStore.setState({
      factionRep: { crown: rep, guild: 0, scholars: 0, brethren: 0 },
      activePanel: null,
      fleet: {
        ...st.fleet,
        currentPortId: id,
        isSailing: false,
        gold: 5000,
        ships: st.fleet.ships.map((sh, i) => i === 0 ? { ...sh, durability: sh.maxDurability - 10 } : sh),
      },
    })
  }, { id: crownId, rep: crownRep })
  await sleep(300)
  // 真入口：点侧栏「港口」（不是直接 setActivePanel）
  const btn = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label="港口"]')
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  check(!!btn, '侧栏有「港口」入口')
  if (btn) await page.mouse.click(btn.x, btn.y)
  // 等按钮上真的出现数字（面板是懒加载块）
  const ready = await page.waitForFunction(
    () => /\d/.test(document.querySelector('[data-service-anchor="repair"] button')?.textContent || ''),
    { timeout: 15000 },
  ).then(() => true).catch(() => false)
  check(ready, `修理面板挂出来并显示价格（声望 ${crownRep}）`)
  const shown = await page.evaluate(() => {
    const btn2 = document.querySelector('[data-service-anchor="repair"] button')
    const m = (btn2?.textContent || '').match(/(\d+)/)
    return m ? Number(m[1]) : null
  })
  const goldBefore = await page.evaluate(() => window.__gameStore.getState().fleet.gold)
  const hit = await page.evaluate(() => {
    const b = document.querySelector('[data-service-anchor="repair"] button')
    if (!b) return null
    /*
     * 面板是可滚动的一长条，修理区常落在视口外 —— 直接按 rect 点击会点到别的元素上，
     * 表现是"实扣 0 金"。先滚进视野再取坐标。
     */
    b.scrollIntoView({ block: 'center' })
    const r = b.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      self: top === b || b.contains(top),
      hit: top?.tagName + '.' + (top?.className || '').toString().slice(0, 24),
    }
  })
  check(hit?.self === true, `修理按钮中心点命中自己（${hit?.hit ?? '没找到按钮'}）`)
  if (hit) await page.mouse.click(hit.x, hit.y)
  await sleep(500)
  const goldAfter = await page.evaluate(() => window.__gameStore.getState().fleet.gold)
  await page.evaluate(() => window.__gameStore.getState().setActivePanel(null))
  await sleep(250)
  return { shown, paid: goldBefore - goldAfter }
}

const at60 = await measureRepair(60)
const at0 = await measureRepair(0)
check(at60.shown != null && at60.paid === at60.shown,
  `声望 60：面板写 ${at60.shown} 金，实扣 ${at60.paid} 金（同一个数）`)
check(at0.shown != null && at0.paid === at0.shown,
  `声望 0：面板写 ${at0.shown} 金，实扣 ${at0.paid} 金`)
check(at60.shown != null && at0.shown != null && at60.shown < at0.shown,
  `王室九折真的更便宜（${at0.shown} → ${at60.shown}）`)
check(at0.shown != null && at60.shown === Math.ceil(at0.shown * 0.9),
  `九折是精确的（${at0.shown} × 0.9 → ${at60.shown}）`)

/* ───────── 护送委托：任务页写的赏金 = 到账 ───────── */
const escort = await page.evaluate(async () => {
  const m = await import('/Age-of-Discovery/src/data/tasks.ts').catch(() => import('/src/data/tasks.ts'))
  const t = m.tasks.find(x => x.type === 'escort')
  const st = window.__gameStore.getState()
  window.__gameStore.setState({
    activeTasks: [{ ...t, status: 'active' }],
    completedTasks: [],
    crewRoster: [],                      // 没有商人在船：+25% 只能来自王室
    factionRep: { crown: 30, guild: 0, scholars: 0, brethren: 0 },
    fleet: { ...st.fleet, currentPortId: t.targetPortId ?? t.portId, isSailing: false, gold: 1000 },
  })
  window.__mapStore.getState().openLogbook('task')
  return { id: t.id, base: t.reward.gold, title: t.title }
})
await sleep(900)
const shownReward = await page.evaluate((title) => {
  /*
   * 只读**这条委托自己那一行**：页面上还有别的可接委托，
   * 而最外层容器里也含"N 金"——取最短的那一段才是这一行。
   */
  const rows = [...document.querySelectorAll('[data-testid="logbook-page-task"] div')]
    .filter(d => (d.textContent || '').includes(title) && /\d+ 金/.test(d.textContent || ''))
    .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)
  const m = (rows[0]?.textContent || '').match(/(\d+) 金/)
  return m ? Number(m[1]) : null
}, escort.title)
check(shownReward === Math.round(escort.base * 1.25),
  `王室 30：护送赏金显示 ${shownReward}（${escort.base} ×1.25 = ${Math.round(escort.base * 1.25)}）`)

const goldBefore = await page.evaluate(() => window.__gameStore.getState().fleet.gold)
const deliver = await page.evaluate(() => !!document.querySelector('[data-testid^="task-deliver-"]'))
check(deliver, '任务页出现「交付领赏」（到目标港了）')
await page.evaluate(() => {
  const b = document.querySelector('[data-testid^="task-deliver-"]')
  b?.click()
})
await sleep(500)
const goldAfter = await page.evaluate(() => window.__gameStore.getState().fleet.gold)
check(goldAfter - goldBefore === shownReward,
  `实际到账 ${goldAfter - goldBefore} = 屏幕上写的 ${shownReward}`)

/* 声望 29：没有 +25%（阈值是 30） */
const at29 = await page.evaluate(async () => {
  const m = await import('/Age-of-Discovery/src/data/tasks.ts').catch(() => import('/src/data/tasks.ts'))
  const t = m.tasks.find(x => x.type === 'escort')
  const st = window.__gameStore.getState()
  window.__gameStore.setState({
    activeTasks: [{ ...t, status: 'active' }],
    completedTasks: [],
    factionRep: { crown: 29, guild: 0, scholars: 0, brethren: 0 },
    fleet: { ...st.fleet, currentPortId: t.targetPortId ?? t.portId, isSailing: false, gold: 1000 },
  })
  return { base: t.reward.gold, title: t.title }
})
await sleep(600)
const shown29 = await page.evaluate((title) => {
  const rows = [...document.querySelectorAll('[data-testid="logbook-page-task"] div')]
    .filter(d => (d.textContent || '').includes(title) && /\d+ 金/.test(d.textContent || ''))
    .sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)
  const m = (rows[0]?.textContent || '').match(/(\d+) 金/)
  return m ? Number(m[1]) : null
}, at29.title)
check(shown29 === at29.base, `声望 29：赏金还是原价（${shown29} = ${at29.base}，不到档不给）`)

check(errors.length === 0, `无运行时错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n王室特权 e2e：${pass} 通过 / ${fails.length} 失败`)
await browser.close()
if (fails.length) { for (const f of fails) console.log('   ✗', f); process.exit(1) }
