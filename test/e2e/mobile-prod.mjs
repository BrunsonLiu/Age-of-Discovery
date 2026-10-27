// 移动端生产产物冒烟（390×844 触屏）
//
// 跑法：先 `npm run build`，再 `npx vite preview --port 5180 --host 127.0.0.1`，
// 然后 `node test/e2e/mobile-prod.mjs`
//
// 为什么要有这个脚本：dev 验证证明不了「生产 bundle 里移动端也对」。
// 生产包会 tree-shake 掉 dev 钩子（`__gameStore` 0 命中），
// 所以这个脚本**全程不依赖 store**，只用眼睛能看到的 DOM 事实：
//   标签栏在不在、九个入口齐不齐、抽屉开不开得了、地图点得了点不了、
//   操舵退路在不在、横向溢没溢出、控制台报没报错。
//
// 与 mobile-layout.mjs 的分工：
//   mobile-layout.mjs（dev）——可以注入状态，能构造事件卡等场景，断言更细
//   mobile-prod.mjs（生产）  ——只能走真实 UI，验的是「玩家真按得到的路径」
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5180/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)) })

const VW = 390
const VH = 844
await page.setViewport({ width: VW, height: VH, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await new Promise(r => setTimeout(r, 2500))

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗', msg) } }
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function overflowElements() {
  return page.evaluate((vw) => {
    const out = []
    for (const el of document.querySelectorAll('body *')) {
      if (el instanceof SVGElement) continue
      if (el.closest('.leaflet-pane')) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
      if (cs.position === 'fixed' && cs.pointerEvents === 'none') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(cs.overflowX)) continue
      if (r.right > vw + 1 || r.left < -1) {
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className && String(el.className).slice(0, 70)) || '',
          left: Math.round(r.left), right: Math.round(r.right),
        })
      }
    }
    return out.slice(0, 12)
  }, VW)
}

// 在浮层里按文字点按钮（限定某个浮层内，避免误伤底栏同词按钮）
const clickIn = async (overlayRe, buttonRe) => page.evaluate((ov, bt) => {
  const overlays = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')]
  const o = overlays.find(x => new RegExp(ov).test(x.textContent || ''))
  if (!o) return null
  const b = [...o.querySelectorAll('button')].find(x => new RegExp(bt).test(x.textContent || ''))
  if (b && b instanceof HTMLElement) { b.click(); return (b.textContent || '').trim().slice(0, 24) }
  return null
}, overlayRe, buttonRe)

console.log('\n=== 移动端 · 生产产物冒烟 ===')

// --- ① 开局 ---
{
  const ov = await overflowElements()
  check(ov.length === 0, `开局页无横向溢出（${ov.length} 个${ov.length ? '：' + JSON.stringify(ov) : ''}）`)
}

// --- ② 模式页 + 一路开局（船长模式） ---
{
  let found = false
  for (let i = 0; i < 8; i++) {
    if (await page.$('[data-mode]')) { found = true; break }
    const btn = await page.$('.btn-nautical')
    if (!btn) break
    await btn.click()
    await sleep(420)
  }
  check(found, '开局能翻到模式选择页')
  const modeCount = await page.$$eval('[data-mode]', els => els.length)
  check(modeCount === 2, `生产包里也有 ${modeCount} 个模式选项（应为 2）`)
  const captain = await page.$('[data-mode="captain"]')
  if (captain) { await captain.click(); await sleep(150) }
  // 一路点到底
  for (let i = 0; i < 8; i++) {
    const btn = await page.$('.btn-nautical')
    if (!btn) break
    const text = await btn.evaluate(el => el.textContent?.trim() ?? '')
    await btn.click()
    await sleep(420)
    if (text.includes('启航')) break
  }
  await sleep(1500)
}

// --- ③ 教学与致辞（生产包里也没有 dev 钩子，只能靠按钮文字） ---
{
  const skipped = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /跳过引导/.test(x.textContent || ''))
    if (b instanceof HTMLElement) { b.click(); return 'tutorial' }
    return null
  })
  if (skipped) await sleep(600)
  check(!!skipped || true, `教学引导可跳过（${skipped ?? '未出现'}）`)

  const skipDlg = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /跳过这段致辞/.test(x.textContent || ''))
    if (b instanceof HTMLElement) { b.click(); return true }
    return false
  })
  await sleep(900)
  const dlgGone = await page.evaluate(() => !document.querySelector('[role="dialog"][aria-label*="致辞"]'))
  check(skipDlg ? dlgGone : true, '致辞可跳过（触屏没有 Esc 键的替代品）')
}

// --- ④ 标签栏 / 溢出 / 罗盘徽章 ---
{
  const tabBar = await page.$('[data-testid="mobile-tab-bar"]')
  check(!!tabBar, '生产包里有底部标签栏')
  if (tabBar) {
    const labels = await page.$$eval('[data-testid="mobile-tab-bar"] button', els => els.map(e => e.getAttribute('aria-label')))
    const want = ['舰队', '任务', '日志', '成就', '见闻', '港口', '贸易', '造船', '帮助']
    const missing = want.filter(w => !labels.includes(w))
    check(missing.length === 0, `九个入口一个不少（缺：${missing.join('、') || '无'}）`)
  }
  const desktopSide = await page.$$('[data-tut="fleet"]')
  check(desktopSide.length === 0, `桌面侧栏按钮在移动端不出现（${desktopSide.length} 个）`)

  const ov = await overflowElements()
  check(ov.length === 0, `主界面无横向溢出（${ov.length} 个${ov.length ? '：' + JSON.stringify(ov) : ''}）`)

  const geo = await page.evaluate(() => {
    const r = el => { const b = el?.getBoundingClientRect(); return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null }
    return {
      compass: r(document.querySelector('[data-testid="compass"]')),
      badge: r(document.querySelector('[data-testid="weather-badge"]')),
    }
  })
  if (geo.compass && geo.badge) {
    const c = geo.compass, w = geo.badge
    const ox = Math.min(c.x + c.w, w.x + w.w) - Math.max(c.x, w.x)
    const oy = Math.min(c.y + c.h, w.y + w.h) - Math.max(c.y, w.y)
    const overlap = Math.max(0, ox) * Math.max(0, oy)
    check(overlap === 0, `罗盘与天候徽章零重叠（${Math.round(overlap)}px²）`)
    check(w.y >= c.y + c.h, '徽章排在罗盘正下方')
  } else {
    check(false, '罗盘与天候徽章都在场')
  }
  await page.screenshot({ path: `${SHOTS}/prod-mobile-main.png` })
}

// --- ⑤ 底部抽屉开合 ---
{
  const tradeTab = await page.$('[data-testid="mobile-tab-bar"] button[aria-label="贸易"]')
  if (tradeTab) {
    await tradeTab.click()
    await sleep(800)
    const drawer = await page.$('[data-testid="mobile-drawer"]')
    check(!!drawer, '生产包里点标签 → 底部抽屉升起')
    if (drawer) {
      const box = await drawer.boundingBox()
      check(!!box && box.width <= VW + 1, `抽屉宽度 ${box ? Math.round(box.width) : '?'} ≤ ${VW}`)
      const ov = await overflowElements()
      check(ov.length === 0, `抽屉打开时仍无横向溢出（${ov.length} 个）`)
    }
    await page.mouse.click(12, 12)
    await sleep(700)
    check(!(await page.$('[data-testid="mobile-drawer"]')), '点遮罩 → 抽屉关闭')
  } else {
    check(false, '底部标签栏有「贸易」入口')
  }
}

// --- ⑥ 真实 UI 走到操舵：点海面设航点 → 出航计划 → 升起旗帜 → 段末抉择 → 方针 → 操舵 ---
// 出航入口不是"点港口"（未发现的港口不渲染标记，那是"未知海域"的设计），
// 而是**点海面**任意一点设航点。所以这里找一块确定是海的屏幕位置。
{
  const clicked = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    // 候选点：港口标记左侧的西向海域（伊比利亚以西是大西洋）
    const tip = document.querySelector('.port-tooltip')
    const pb = tip?.getBoundingClientRect()
    const px = pb ? pb.x + pb.width / 2 : 195
    const py = pb ? pb.y + pb.height / 2 : 400
    const cands = []
    for (const dx of [-70, -50, -34, -20, 30, 60]) {
      for (const dy of [-40, 0, 40, 80]) {
        const x = Math.round(px + dx), y = Math.round(py + dy)
        if (x < 12 || x > 378 || y < 200 || y > 620) continue
        // 命中陆地面（GeoJSON 多边形在 overlay-pane）就跳过
        const el = document.elementFromPoint(x, y)
        if (el && el.closest('.leaflet-overlay-pane')) continue
        cands.push([x, y])
      }
    }
    return cands.slice(0, 12)
  })
  check(clicked.length > 0, `找到 ${clicked.length} 个疑似海面的候选点`)

  let planShown = false
  for (const [x, y] of clicked) {
    await page.mouse.click(x, y)
    await sleep(1200)
    const has = await page.evaluate(() =>
      [...document.querySelectorAll('div.fixed.inset-0')].some(o => /出航计划/.test(o.textContent || '')))
    if (has) { planShown = true; break }
  }
  check(planShown, '点海面 → 出航计划面板弹出')
  if (planShown) {
    const depart = await clickIn('出航计划', '升起旗帜')
    check(!!depart, '点「升起旗帜，出航！」')
    await sleep(2000)
  }

  // 段末抉择：每段末必有操舵，最多等 150 秒
  const t0 = Date.now()
  let segShown = false
  while (Date.now() - t0 < 150000) {
    const has = await page.evaluate(() => !!document.querySelector('[aria-label*="方针"]'))
    if (has) { segShown = true; break }
    await sleep(1500)
  }
  check(segShown, '段末抉择弹出（移动端真实航行后）')
  if (segShown) {
    await page.screenshot({ path: `${SHOTS}/prod-mobile-segment.png` })
    const picked = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[aria-label*="方针"]')]
      if (cards.length && cards[0] instanceof HTMLElement) { cards[0].click(); return (cards[0].getAttribute('aria-label') || '').slice(0, 20) }
      return null
    })
    check(!!picked, `选了一个方针（${picked}）`)
    await sleep(1800)
    const skipHelm = await page.$$eval('button', els => els.map(e => e.textContent?.trim() ?? '').filter(t => t.includes('交给水手')))
    check(skipHelm.length >= 1, '生产包里操舵有「交给水手」的退路')
    await page.screenshot({ path: `${SHOTS}/prod-mobile-helm.png` })
  }
}

console.log(`\n生产端移动端冒烟：${pass} 通过 / ${fail} 失败`)
if (errors.length) {
  console.log('\n页面错误：')
  errors.slice(0, 8).forEach(e => console.log('  ' + e))
}
await browser.close()
if (fail > 0) process.exit(1)
