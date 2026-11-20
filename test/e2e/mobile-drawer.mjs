/*
 * 手机（390×844 真触屏）上面板的可达性。
 *
 * 【2026-11-17 口径重写】
 * 这里原来是「底部抽屉」的检查（`mobile-drawer`）。四块面板改成整屏之后
 * （与航海志同一种形态，见 components/ui/FullScreenPanel 的文件头），
 * 手机上**不再有抽屉**：点底部标签 → 面板以整屏出现 → 右上「回海图」退出。
 *
 * 所以判据从"抽屉能滚、把手能关"变成：
 *   ① 底部标签栏的入口全在视口内、都能点开对应面板；
 *   ② 整屏面板铺满视口（不是角落小窗），且正文限宽（390 下天然满宽）；
 *   ③ 面板里的按钮**全部真的能命中**（判据同 panel-clickable：
 *      rect ∩ 视口 ∩ 祖先滚动容器）；
 *   ④ 「回海图」真的关得掉（用真鼠标点，不是 el.click()）。
 *
 * 真触屏必须在 goto 之前设 isMobile + hasTouch —— 只改宽度的话
 * (pointer: coarse) 不命中，走的还是桌面分支（操舵那轮踩过）。
 */
const BASE = process.env.GAME_URL || process.env.GAME_URL || process.env.AOD_BASE || 'http://127.0.0.1:5174/Age-of-Discovery/'
const puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log(`  ✓ ${msg}`) } else { fail++; console.log(`  ✗ FAIL: ${msg}`) } }

const browser = await puppeteer.launch({
  executablePath: process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
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

console.log('=== 底部标签栏 ===')
await calmDown()
const tabs = await page.evaluate(() => {
  const bar = document.querySelector('[data-testid="mobile-tab-bar"]')
  if (!bar) return null
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
  const br = bar.getBoundingClientRect()
  return { count: items.length, items, barBottom: Math.round(br.bottom), vh: innerHeight }
})
check(!!tabs, '底部标签栏在（手机布局生效）')
check(!!tabs && tabs.count >= 9, `标签栏有 ${tabs?.count} 个入口`)
check(!!tabs && tabs.items.every(i => i.inView), `全部入口在视口内（越界：${tabs?.items.filter(i => !i.inView).map(i => i.label).join(',') || '无'}）`)
check(!!tabs && tabs.items.every(i => i.big), `每个入口热区够大（最小 ${Math.min(...(tabs?.items.map(i => Math.round(i.rect[2])) ?? [0]))}px 宽）`)
check(!!tabs && tabs.barBottom <= tabs.vh + 1, `标签栏没顶出屏幕（底边 ${tabs?.barBottom} / ${tabs?.vh}）`)

/** 扫一个整屏面板里的按钮 */
const scanPanel = async (name, testId) => {
  const r = await page.evaluate((tid) => {
    const root = document.querySelector(`[data-testid="${tid}"]`)
    if (!root) return { noRoot: true }
    const rr = root.getBoundingClientRect()
    const out = { total: 0, blocked: [], skipped: 0, disabled: 0, w: Math.round(rr.width), h: Math.round(rr.height), vw: innerWidth, vh: innerHeight }
    for (const b of root.querySelectorAll('button')) {
      const rect = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      if (rect.width < 4 || rect.height < 4) continue
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue
      if (b.disabled) { out.disabled++; continue }
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
  }, testId)
  if (r.noRoot) { check(false, `${name}：面板没打开（找不到 ${testId}）`); return r }
  check(r.w >= r.vw - 2 && r.h >= r.vh - 2, `${name}：整屏铺满（${r.w}×${r.h} / 视口 ${r.vw}×${r.vh}）`)
  check(r.blocked.length === 0,
    `${name}：${r.total} 个可点按钮全部命中（禁用 ${r.disabled}，滚出视口 ${r.skipped}）`)
  for (const b of r.blocked.slice(0, 3)) console.log(`      · 被挡「${b.label}」rect=${b.rect} 命中=${b.hit}`)
  return r
}

console.log('\n=== 点标签 → 整屏面板 ===')
const PANELS = [
  ['港口', 'port-panel'],
  ['贸易', 'trade-panel'],
  ['造船', 'shipyard-panel'],
  ['舰队', 'fleet-panel'],
]
for (const [label, tid] of PANELS) {
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
  await scanPanel(label, tid)

  // 「回海图」必须真的关得掉（真鼠标点，不是 el.click()）
  const closeInfo = await page.evaluate((t) => {
    const b = document.querySelector(`[data-testid="${t}-close"]`)
    if (!b) return null
    const r = b.getBoundingClientRect()
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return {
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      inView: r.top >= 0 && r.bottom <= innerHeight,
      hitSelf: !!(el && (el === b || b.contains(el))),
      x: r.x + r.width / 2, y: r.y + r.height / 2,
    }
  }, tid)
  check(!!closeInfo && closeInfo.inView, `「${label}」的回海图在视口内（${closeInfo?.rect}）`)
  check(!!closeInfo && closeInfo.hitSelf, `「${label}」的回海图中心命中自己`)
  if (closeInfo?.hitSelf) {
    await page.mouse.click(closeInfo.x, closeInfo.y)
    await sleep(600)
    const closed = await page.evaluate((t) => ({
      gone: !document.querySelector(`[data-testid="${t}"]`),
      panel: window.__gameStore.getState().activePanel,
    }), tid)
    check(closed.gone && !closed.panel, `「${label}」点回海图真的关掉了（panel=${closed.panel}）`)
  }
}

console.log('\n=== 整屏面板里没有横向溢出 ===')
await calmDown()
const overflow = await page.evaluate(() => {
  const bar = document.querySelector('[data-testid="mobile-tab-bar"]')
  const btn = [...(bar?.querySelectorAll('button') || [])].find(b => (b.getAttribute('aria-label') || '') === '贸易')
  btn?.click()
  return new Promise(res => setTimeout(() => {
    const root = document.querySelector('[data-testid="trade-panel"]')
    res({ scrollW: root?.scrollWidth ?? 0, clientW: root?.clientWidth ?? 0, bodyScrollW: document.body.scrollWidth })
  }, 700))
})
check(overflow.clientW > 0 && overflow.scrollW <= overflow.clientW + 2,
  `贸易面板无横向溢出（${overflow.scrollW} ≤ ${overflow.clientW}）`)
check(overflow.bodyScrollW <= 391, `整页无横向溢出（${overflow.bodyScrollW}）`)

await page.screenshot({ path: '.workbuddy/shots/mobile-panel-full.png' })
check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail ? 1 : 0)
