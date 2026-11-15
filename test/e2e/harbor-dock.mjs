// 岸上的「码头门牌带」：桌面把六家铺子压在自己画的石砌码头上，油画主体留空。
//
// 【为什么单独一套】这一轮把服务从右上角那块 370×260 的不透明深棕板
// （PLATE_STYLE 的 alpha 是 0.95~0.97）挪到了底部的门牌带。改的是**版面**，
// 而版面最容易坏在"看着还行、实际压错层"上：
//   · 带子要落在前景码头（harbor-quay）之内，不能骑在油画的拱廊上
//   · 带子要在底栏之上，不能盖住金币/日期
//   · 列数要跟着本港真有几家铺子走（写死 6 列时 5 家港右边会空一整格）
//   · 见闻板要收窄，否则"留白"只是从右边换到左边
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.AOD_BASE || 'http://localhost:5174/Age-of-Discovery/'
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
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

const boot = async () => {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => !!window.__gameStore && !!window.__mapStore, { timeout: 30000 })
  await page.evaluate(() => {
    window.__gameStore.setState({
      gamePhase: 'playing', tutorialStep: -1, showHelp: false,
      dialogueSeen: ['opening_pilot'], activePanel: null,
      logbook: [], claimedVictories: [], collectedDebris: [], collectedRelics: [], collectedLegends: [],
      discoveredPorts: [6],
    })
    const s = window.__gameStore.getState()
    // 塞维利亚：trade / supply / shipyard / repair / recruit 五样齐全
    window.__gameStore.setState({ fleet: { ...s.fleet, currentPortId: 6, isSailing: false, day: 40 } })
    const d = window.__dialogueStore
    for (let i = 0; i < 12 && d?.getState?.().scriptId; i++) d.getState().skip()
    window.__gameStore.setState({ showHelp: false, activePanel: null })
    window.__mapStore.getState().setViewMode('harbor')
  })
  await sleep(1400)
  /*
   * 上岸之后大副还会再说一句（模态 z=75、盖满全屏）。
   * 不把它收掉，elementFromPoint 命中的就是那张米色对话框，
   * 门牌永远报「被挡住」—— 那是探针自己的问题，不是版面问题。
   */
  await page.evaluate(() => {
    const d = window.__dialogueStore
    for (let i = 0; i < 12 && d?.getState?.().scriptId; i++) d.getState().skip()
    window.__gameStore.setState({ showHelp: false, activePanel: null })
  })
  await sleep(700)
}

/* ── 桌面 1440×900 ── */
console.log('=== 桌面：门牌带的几何 ===')
await boot()
const geo = await page.evaluate(() => {
  const vh = innerHeight
  const bar = document.querySelector('[data-testid="harbor-services"]')
  const quay = document.querySelector('[data-testid="harbor-quay"]')
  const plate = document.querySelector('[data-testid="harbor-arrival-plate"]')
  const tiles = [...document.querySelectorAll('[data-testid^="harbor-service-"]')]
  const floor = document.querySelector('[data-testid^="harbor-back"]')
  const r = (el) => el ? el.getBoundingClientRect() : null
  const br = r(bar), qr = r(quay), pr = r(plate)
  return {
    vh,
    barCount: document.querySelectorAll('[data-testid="harbor-services"]').length,
    tiles: tiles.length,
    tileW: tiles.map(t => Math.round(t.getBoundingClientRect().width)),
    barTop: br ? Math.round(br.top) : null,
    barBottom: br ? Math.round(br.bottom) : null,
    barRight: br ? Math.round(br.right) : null,
    quayTop: qr ? Math.round(qr.top) : null,
    plateRight: pr ? Math.round(pr.right) : null,
    plateBottom: pr ? Math.round(pr.bottom) : null,
    plateW: pr ? Math.round(pr.width) : null,
    backTop: r(floor)?.top ?? null,
    contentRight: Math.round(document.querySelector('[data-testid="harbor-view"]').getBoundingClientRect().right),
  }
})
check(geo.barCount === 1, `桌面上只有一块 harbor-services（实际 ${geo.barCount}）`)
check(geo.tiles >= 4, `门牌至少 4 块（塞维利亚 ${geo.tiles} 块）`)
check(new Set(geo.tileW).size === 1, `每块门牌等宽（${geo.tileW.join('/')}）`)
check(geo.tiles < 6 || geo.tileW.every(w => w > 120),
  `6 块时每块仍 >120px（实际 ${geo.tileW.join('/')}）`)

check(geo.barTop >= geo.quayTop, `门牌带落在前景码头里（带 ${geo.barTop} ≥ 码头 ${geo.quayTop}）`)
check(geo.barTop > geo.vh * 0.72, `门牌带压在画面下部（顶边 ${geo.barTop} > ${Math.round(geo.vh * 0.72)}）—— 油画主体露出来`)
check(geo.barBottom <= geo.vh - 40, `门牌带不盖底栏（底边 ${geo.barBottom} ≤ ${geo.vh - 40}）`)
check(geo.barRight >= geo.contentRight - 130,
  `门牌带铺到内容区右边（${geo.barRight} vs ${geo.contentRight}）—— 不留一整格空`)

/* 见闻板与门牌带不许相交（否则等于又叠回去了） */
const overlap = await page.evaluate(() => {
  const a = document.querySelector('[data-testid="harbor-arrival-plate"]').getBoundingClientRect()
  const b = document.querySelector('[data-testid="harbor-services"]').getBoundingClientRect()
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
  return { x, y }
})
check(overlap.x === 0 || overlap.y === 0, `见闻板与门牌带不相交（重叠 ${overlap.x}×${overlap.y}）`)
check(geo.plateW <= 520, `见闻板收窄到 ≤520px（${geo.plateW}）`)

/* ── 点门牌真的能进 ── */
const clicked = await page.evaluate(() => {
  const b = document.querySelector('[data-testid="harbor-service-trade"]')
  if (!b) return null
  const r = b.getBoundingClientRect()
  // 命中测试：中心点最上层元素必须是它自己（或它的子节点）
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  return { hit: !!top && (top === b || b.contains(top)), w: Math.round(r.width), h: Math.round(r.height) }
})
check(!!clicked && clicked.hit, '门牌中心的命中体是它自己（没被前景码头或底栏挡住）')
check(!!clicked && clicked.h >= 34, `门牌高 ${clicked?.h}px（够点）`)
await page.evaluate(() => document.querySelector('[data-testid="harbor-service-trade"]').click())
await sleep(700)
const opened = await page.evaluate(() => ({
  view: window.__mapStore.getState().viewMode,
  panel: window.__gameStore.getState().activePanel,
}))
check(opened.view === 'harbor', '点门牌之后还站在岸上（不是被踢回海图）')
check(opened.panel === 'trade', `打开的是贸易面板（${opened.panel}）`)
// 关掉面板继续
await page.evaluate(() => window.__gameStore.getState().setActivePanel(null))
await sleep(400)
await page.screenshot({ path: `${SHOTS}/harbor-dock-1440.png` })

/* ── 移动端 390×844 ── */
console.log('=== 移动端：仍是竖板 ===')
await page.setViewport({ width: 390, height: 844 })
await boot()
const mob = await page.evaluate(() => {
  const bar = document.querySelector('[data-testid="harbor-services"]')
  const tiles = [...document.querySelectorAll('[data-testid^="harbor-service-"]')]
  const r = bar?.getBoundingClientRect()
  return {
    count: document.querySelectorAll('[data-testid="harbor-services"]').length,
    barW: r ? Math.round(r.width) : null,
    barH: r ? Math.round(r.height) : null,
    tileW: tiles.map(t => Math.round(t.getBoundingClientRect().width)),
    quay: !!document.querySelector('[data-testid="harbor-quay"]'),
  }
})
check(mob.count === 1, `手机上也只有一块 harbor-services（${mob.count}）`)
check(mob.barH > 150, `手机上是竖板而不是门牌带（高 ${mob.barH}px）`)
check(mob.tileW.every(w => w > 120), `手机上门牌每块 >120px（${mob.tileW.join('/')}）`)
check(!mob.quay, '手机不渲染前景码头（会被多行底栏吃掉）')
await page.screenshot({ path: `${SHOTS}/harbor-dock-390.png` })

check(errs.length === 0, `无 pageerror（${errs.slice(0, 2).join(' | ')}）`)

console.log(`\n${pass} 通过 / ${fails.length} 失败`)
if (fails.length) { console.log('失败项：'); fails.forEach(f => console.log('  -', f)) }
await browser.close()
process.exit(fails.length ? 1 : 0)
