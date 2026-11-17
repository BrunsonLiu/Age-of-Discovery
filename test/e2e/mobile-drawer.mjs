/*
 * 手机（390×844 真触屏）上的面板可点性。
 *
 * 【为什么必须单独一套】
 * 桌面的面板是右侧一列（`Z.PANEL=30`，320/416 宽）；
 * 手机上是**全屏底部抽屉**（`Z.DRAWER=65`，`max-h-[82dvh]` 自带滚动）。
 * 这是两条完全不同的渲染路径，`panel-clickable`（1440）一条也覆盖不到手机这边：
 * 抽屉里按钮被裁、把手点不到、底部标签栏排不下，全都不会红。
 *
 * 【判据取向】
 * 1. **真实路径打开**：点底部标签栏上那个入口，不是 `setActivePanel` ——
 *    "手机上怎么打开它"本身就是被测对象（标签栏十个入口排不排得下）。
 * 2. 可见矩形 = 按钮 rect ∩ 视口 ∩ **抽屉滚动容器**。
 *    只跟视口求交会把"要滚才看得到"的行判成被遮挡（panel-clickable 踩过这个坑）。
 * 3. 指纹区 ≥44×44：手指比鼠标粗，这是通用下限。
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
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 40000 })
await sleep(2200)

/** 收起对白 / 册子 / 岸上，回到能看标签栏的常态 */
const calmDown = async () => {
  await page.evaluate(() => {
    const d = window.__dialogueStore
    for (let i = 0; i < 25 && d?.getState?.().scriptId; i++) d.getState().skip()
    window.__mapStore.getState().closeRecords?.()
    window.__mapStore.getState().setViewMode('chart')
    window.__gameStore.setState({ gamePhase: 'playing', tutorialStep: -1, showHelp: false, activePanel: null })
  })
  await sleep(500)
}

console.log('=== 底部标签栏：十个入口排得下吗 ===')
await calmDown()
const tabs = await page.evaluate(() => {
  const bar = document.querySelector('[data-testid="mobile-tab-bar"]')
  if (!bar) return null
  const br = bar.getBoundingClientRect()
  const items = [...bar.querySelectorAll('button')].map(b => {
    const r = b.getBoundingClientRect()
    return {
      label: (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 8),
      disabled: b.disabled,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      inView: r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      big: r.width >= 30 && r.height >= 30,
    }
  })
  return { count: items.length, items, barH: Math.round(br.height), barBottom: Math.round(br.bottom), vh: innerHeight }
})
check(!!tabs, '底部标签栏在 DOM 里（手机布局生效）')
check(!!tabs && tabs.count >= 9, `标签栏有 ${tabs?.count} 个入口（>=9：港口/贸易/造船/舰队/任务/日志/图鉴/成就/船长 + 视图）`)
check(!!tabs && tabs.items.every(i => i.inView),
  `全部入口都在视口内，不用横向滚（${tabs?.items.filter(i => !i.inView).map(i => i.label).join(',') || '全部在内'}）`)
check(!!tabs && tabs.items.every(i => i.big),
  `每个入口热区够大（最小 ${Math.min(...(tabs?.items.map(i => Math.round(i.rect[2])) ?? [0]))}px 宽）`)
check(!!tabs && tabs.barBottom <= tabs.vh + 1, `标签栏没顶出屏幕（底边 ${tabs?.barBottom} / 视口 ${tabs?.vh}）`)

/** 扫抽屉里的按钮 */
const scanDrawer = async (name) => {
  const r = await page.evaluate(() => {
    const drawer = document.querySelector('[data-testid="mobile-drawer"]')
    if (!drawer) return { noDrawer: true }
    const scroller = drawer.querySelector('.drawer-panel')
    const out = { total: 0, blocked: [], skipped: 0, disabled: 0, drawerH: 0 }
    if (scroller) out.drawerH = Math.round(scroller.getBoundingClientRect().height)
    for (const b of drawer.querySelectorAll('button')) {
      const rect = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      if (rect.width < 4 || rect.height < 4) continue
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue
      if (b.disabled) { out.disabled++; continue }
      // 可见矩形 = rect ∩ 视口 ∩ 祖先滚动容器
      let cl = 0, ct = 0, cr = innerWidth, cb = innerHeight
      for (let p = b.parentElement; p; p = p.parentElement) {
        const pcs = getComputedStyle(p)
        if (pcs.overflowY !== 'visible' || pcs.overflowX !== 'visible') {
          const pr = p.getBoundingClientRect()
          cl = Math.max(cl, pr.left); ct = Math.max(ct, pr.top)
          cr = Math.min(cr, pr.right); cb = Math.min(cb, pr.bottom)
        }
      }
      const left = Math.max(rect.left, cl), top = Math.max(rect.top, ct)
      const right = Math.min(rect.right, cr), bottom = Math.min(rect.bottom, cb)
      const visW = right - left, visH = bottom - top
      if (visH < Math.min(rect.height * 0.55, 14) || visW < Math.min(rect.width * 0.55, 14)) { out.skipped++; continue }
      out.total++
      const label = (b.getAttribute('aria-label') || b.getAttribute('data-testid') || b.textContent || '')
        .replace(/\s+/g, ' ').trim().slice(0, 20)
      const el = document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
      const ok = el && (b === el || b.contains(el) || el.contains(b))
      if (!ok) out.blocked.push({ label, rect: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)], hit: el ? el.tagName : null })
    }
    return out
  })
  if (r.noDrawer) { check(false, `${name}：抽屉没打开`); return r }
  check(r.blocked.length === 0,
    `${name}：${r.total} 个可点按钮全部命中（抽屉高 ${r.drawerH}，禁用 ${r.disabled}，滚出视口 ${r.skipped}）`)
  for (const b of r.blocked.slice(0, 3)) console.log(`      · 被挡「${b.label}」rect=${b.rect} 命中=${b.hit}`)
  return r
}

console.log('\n=== 逐个入口：点标签 → 抽屉 → 扫按钮 ===')
// 只测面板类入口（任务/日志/图鉴/成就/船长走的是整屏册子，另一套）
const PANEL_TABS = ['港口', '贸易', '造船', '舰队']
for (const label of PANEL_TABS) {
  await calmDown()
  const opened = await page.evaluate((lb) => {
    const bar = document.querySelector('[data-testid="mobile-tab-bar"]')
    const btn = [...(bar?.querySelectorAll('button') || [])].find(b => (b.getAttribute('aria-label') || '') === lb)
    if (!btn || btn.disabled) return { ok: false, reason: btn ? 'disabled' : 'not-found' }
    btn.click()
    return { ok: true }
  }, label)
  await sleep(800)
  if (!opened.ok) { check(false, `「${label}」入口不可点（${opened.reason}）`); continue }
  const hasDrawer = await page.evaluate(() => !!document.querySelector('[data-testid="mobile-drawer"]'))
  check(hasDrawer, `点「${label}」真的打开了抽屉（不是空点）`)
  if (hasDrawer) await scanDrawer(label)

  // 把手条能关
  const closedByHandle = await page.evaluate(async () => {
    const h = document.querySelector('[data-testid="mobile-drawer-handle"]')
    if (!h) return null
    const r = h.getBoundingClientRect()
    return { inView: r.top >= -1 && r.bottom <= innerHeight + 1, h: Math.round(r.height), w: Math.round(r.width) }
  })
  check(!!closedByHandle && closedByHandle.inView,
    `「${label}」抽屉的把手条在视口内可点（${closedByHandle?.w}×${closedByHandle?.h}）`)
}

console.log('\n=== 把手条真的能关，遮罩也真的能关 ===')
await calmDown()
await page.evaluate(() => {
  const bar = document.querySelector('[data-testid="mobile-tab-bar"]')
  const btn = [...(bar?.querySelectorAll('button') || [])].find(b => (b.getAttribute('aria-label') || '') === '港口')
  btn?.click()
})
await sleep(700)
// 用真鼠标点把手中心（不是 el.click()，那会绕过遮挡判断）
const handleRect = await page.evaluate(() => {
  const h = document.querySelector('[data-testid="mobile-drawer-handle"]')
  const r = h.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await page.mouse.click(handleRect.x, handleRect.y)
await sleep(600)
const afterHandle = await page.evaluate(() => ({
  drawer: !!document.querySelector('[data-testid="mobile-drawer"]'),
  panel: window.__gameStore.getState().activePanel,
}))
check(!afterHandle.drawer && !afterHandle.panel,
  `点把手关掉抽屉（drawer=${afterHandle.drawer} panel=${afterHandle.panel}）`)

await page.evaluate(() => {
  const bar = document.querySelector('[data-testid="mobile-tab-bar"]')
  const btn = [...(bar?.querySelectorAll('button') || [])].find(b => (b.getAttribute('aria-label') || '') === '贸易')
  btn?.click()
})
await sleep(700)
const backdrop = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="mobile-drawer-backdrop"]')
  if (!el) return null
  // 遮罩上半部肯定在抽屉外面
  return { x: innerWidth / 2, y: 40 }
})
if (backdrop) {
  await page.mouse.click(backdrop.x, backdrop.y)
  await sleep(600)
}
const afterBackdrop = await page.evaluate(() => ({
  drawer: !!document.querySelector('[data-testid="mobile-drawer"]'),
  panel: window.__gameStore.getState().activePanel,
}))
check(!afterBackdrop.drawer && !afterBackdrop.panel,
  `点遮罩也关得掉（drawer=${afterBackdrop.drawer} panel=${afterBackdrop.panel}）`)

await page.screenshot({ path: '.workbuddy/shots/mobile-drawer.png' })
check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail ? 1 : 0)
