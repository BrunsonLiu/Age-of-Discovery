// 移动端布局与"自由世界"实测（端到端）
//
// 跑法：先起 dev server，再 `node test/e2e/mobile-layout.mjs`
//
// 为什么要有这个脚本：移动端的问题**单测一个都测不出来**。
// 组件都能渲染、类型都对，但：
//   · 320px 宽的面板塞进 390px 屏 → 横向溢出，右侧被切掉
//   · 底栏三组控件挤在一行 → 挤成一条缝
//   · 侧栏竖排在窄屏上 → 把地图挤没了
//   · 面板的横向滑入动画放进底部抽屉 → 从屏幕左边横着飞进来
// 这些只有拿真浏览器量 DOM 才知道。
//
// 这里验七件事：
//   ① 390×844 视口下**没有任何元素横向溢出**
//   ② 底部标签栏存在、可见、九个入口一个不少
//   ③ 桌面侧栏按钮在移动端不出现（不能两套并存）
//   ④ 点标签 → 底部抽屉升起，宽度不超屏；点遮罩 → 关闭
//   ⑤ 抽屉里的面板内容不横向溢出（面板自带宽度会顶破抽屉）
//   ⑥ 开局可选「参观模式」；参观模式开局的**没有教学遮罩**
//   ⑦ 参观模式的事件卡有「站在一边看」的退路；操舵有「交给水手」的退路
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

// iPhone 14 的逻辑分辨率
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

/**
 * 找出所有横向溢出视口的元素。
 *
 * 【为什么要排除 SVG】
 * Leaflet 把整张 GeoJSON 画进一个超大尺寸的 <svg>（世界地图的尺寸），
 * 再由地图容器裁掉。里面的 <g>/<path> 的几何包围盒当然超出视口，
 * 但**屏幕上什么也看不到**——它们被裁掉了。
 * 这类"几何溢出但视觉被裁"的元素一律不算布局问题，
 * 否则这个检查会天天误报，久了就没人看它了。
 */
async function overflowElements() {
  return page.evaluate((vw) => {
    const out = []
    for (const el of document.querySelectorAll('body *')) {
      // SVG 内部元素：几何包围盒 ≠ 可见区域
      if (el instanceof SVGElement) continue
      if (el.closest('.leaflet-pane')) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue
      if (cs.position === 'fixed' && cs.pointerEvents === 'none') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      // 横向滚动的容器（内部可以更宽）不算溢出
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

console.log('\n=== 移动端布局（390×844）===')

// --- ① 开局页：无横向溢出 ---
{
  const ov = await overflowElements()
  check(ov.length === 0, `开局页无元素横向溢出（溢出 ${ov.length} 个${ov.length ? '：' + JSON.stringify(ov) : ''}）`)
  const docW = await page.evaluate(() => document.documentElement.scrollWidth)
  check(docW <= VW + 1, `文档宽度 ${docW} ≤ 视口 ${VW}`)
}

// --- ⑥ 开局模式选择 ---
// 开局有 6 页，模式选择在第 4 页——先一路翻到它出现为止。
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
  const modeBtns = await page.$$('[data-mode]')
  check(modeBtns.length === 2, `开局有 ${modeBtns.length} 个模式选项（应为 2：船长 / 参观）`)
  const visitor = await page.$('[data-mode="visitor"]')
  check(!!visitor, '存在「参观模式」选项')
  if (visitor) {
    await visitor.click()
    await sleep(150)
    const pressed = await page.$eval('[data-mode="visitor"]', el => el.getAttribute('aria-pressed'))
    check(pressed === 'true', '点一下即选中参观模式')
  }
  await page.screenshot({ path: `${SHOTS}/mobile-intro-mode.png` })
}

// 一路点到底：参观模式开局
{
  for (let i = 0; i < 8; i++) {
    const btn = await page.$('.btn-nautical')
    if (!btn) break
    const text = await btn.evaluate(el => el.textContent?.trim() ?? '')
    await btn.click()
    await sleep(420)
    if (text.includes('启航')) break
  }
  await sleep(1200)
  const phase = await page.evaluate(() => window.__gameStore.getState().gamePhase)
  check(phase === 'playing', `已进入游戏（gamePhase=${phase}）`)
  const mode = await page.evaluate(() => window.__gameStore.getState().gameMode)
  check(mode === 'visitor', `模式为参观模式（${mode}）`)
  const tutStep = await page.evaluate(() => window.__gameStore.getState().tutorialStep)
  check(tutStep === -1, `参观模式不弹教学（tutorialStep=${tutStep}）`)
  const tutMask = await page.$('[data-tut-tip]')
  check(!tutMask, '屏幕上没有教学提示框')

  // 开场致辞是一层全屏模态，会盖住底部标签栏。
  // 触屏没有 Esc 键，所以必须有能点的「跳过」——否则玩家被挡在门外。
  const skipHandle = await page.evaluateHandle(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('跳过这段致辞'))
    return btn ?? null
  })
  const skipEl = skipHandle.asElement()
  check(!!skipEl, '触屏对话有「跳过这段致辞」按钮（没有 Esc 键的替代品）')
  if (skipEl) {
    await skipEl.click()
    await sleep(700)
    const dlg = await page.evaluate(() =>
      !!document.querySelector('[role="dialog"][aria-label*="致辞"]'))
    check(!dlg, '跳过之后对话层消失')
  }
}

// --- ②③ 底部标签栏 ---
{
  const tabBar = await page.$('[data-testid="mobile-tab-bar"]')
  check(!!tabBar, '底部标签栏存在')
  if (tabBar) {
    const box = await tabBar.boundingBox()
    check(!!box && box.y + box.height <= VH + 2, `标签栏完整落在屏幕内（底边 ${box ? Math.round(box.y + box.height) : '?'} ≤ ${VH}）`)
    check(!!box && box.y > VH * 0.7, `标签栏贴在屏幕下沿（顶边 ${box ? Math.round(box.y) : '?'}）`)
    const labels = await page.$$eval('[data-testid="mobile-tab-bar"] button', els => els.map(e => e.getAttribute('aria-label')))
    const want = ['舰队', '任务', '日志', '成就', '见闻', '港口', '贸易', '造船', '帮助']
    const missing = want.filter(w => !labels.includes(w))
    check(missing.length === 0, `九个入口一个不少（缺：${missing.join('、') || '无'}）`)
  }
  // 桌面侧栏按钮不能与移动端并存
  const desktopSide = await page.$$('[data-tut="fleet"]')
  check(desktopSide.length === 0, `桌面侧栏按钮在移动端不出现（找到 ${desktopSide.length} 个）`)
}

// --- ① 主界面无横向溢出 ---
{
  const ov = await overflowElements()
  check(ov.length === 0, `主界面无元素横向溢出（溢出 ${ov.length} 个${ov.length ? '：' + JSON.stringify(ov) : ''}）`)
  const docW = await page.evaluate(() => document.documentElement.scrollWidth)
  check(docW <= VW + 1, `主界面文档宽度 ${docW} ≤ ${VW}`)
  await page.screenshot({ path: `${SHOTS}/mobile-main.png` })
}

// --- 罗盘与天候徽章不能叠在一起 ---
// 桌面端两者是上下排列（罗盘 96px 在 top-14，徽章在 156px）。
// 照搬到手机窄屏就会把徽章压在罗盘盘面上，指针和方位字母全被盖住——
// 只能靠"缩小罗盘 + 徽章排在正下方"来避免。所以这里把关系锁死。
{
  const geo = await page.evaluate(() => {
    const r = el => { const b = el?.getBoundingClientRect(); return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null }
    return {
      compass: r(document.querySelector('[data-testid="compass"]')),
      badge: r(document.querySelector('[data-testid="weather-badge"]')),
    }
  })
  check(!!geo.compass && !!geo.badge, '罗盘与天候徽章都在场')
  if (geo.compass && geo.badge) {
    const c = geo.compass, w = geo.badge
    const overlapX = Math.min(c.x + c.w, w.x + w.w) - Math.max(c.x, w.x)
    const overlapY = Math.min(c.y + c.h, w.y + w.h) - Math.max(c.y, w.y)
    const overlap = Math.max(0, overlapX) * Math.max(0, overlapY)
    check(overlap === 0, `罗盘与徽章零重叠（重叠面积 ${Math.round(overlap)}px²）`)
    check(w.y >= c.y + c.h, `徽章排在罗盘正下方（罗盘底 ${Math.round(c.y + c.h)} → 徽章顶 ${Math.round(w.y)}）`)
    check(c.x >= 0 && c.y >= 0 && c.x + c.w <= VW && c.y + c.h <= VH, '罗盘完整落在视口内')
    check(w.x >= 0 && w.x + w.w <= VW, `天候徽章完整落在视口内（右缘 ${Math.round(w.x + w.w)} ≤ ${VW}）`)
  }
  await page.screenshot({ path: `${SHOTS}/mobile-topleft.png`, clip: { x: 0, y: 30, width: 240, height: 180 } })
}

// --- ④⑤ 底部抽屉 ---
{
  const tradeTab = await page.$('[data-testid="mobile-tab-bar"] button[aria-label="贸易"]')
  check(!!tradeTab, '标签栏里有「贸易」入口')
  if (tradeTab) {
    await tradeTab.click()
    await sleep(600)
    const drawer = await page.$('[data-testid="mobile-drawer"]')
    check(!!drawer, '点标签 → 底部抽屉升起')
    if (drawer) {
      const box = await drawer.boundingBox()
      check(!!box && box.width <= VW + 1, `抽屉宽度 ${box ? Math.round(box.width) : '?'} ≤ 视口 ${VW}`)
      check(!!box && box.y + box.height <= VH + 2, '抽屉完整落在屏幕内')
      const ov = await overflowElements()
      check(ov.length === 0, `抽屉打开时仍无横向溢出（${ov.length} 个${ov.length ? '：' + JSON.stringify(ov) : ''}）`)
      // 面板自身的宽度不能顶破抽屉
      const panelW = await page.evaluate(() => {
        const card = document.querySelector('[data-testid="trade-panel"]')
        return card ? Math.round(card.getBoundingClientRect().width) : -1
      })
      check(panelW > 0 && panelW <= VW, `面板宽度 ${panelW} ≤ 视口 ${VW}`)
      await page.screenshot({ path: `${SHOTS}/mobile-drawer-trade.png` })
    }
    // 关闭：两条路都要通
    // ① 点顶部露出的遮罩（抽屉最高 82dvh，顶部一定留有一条可点的暗区）
    const backdrop = await page.$('[data-testid="mobile-drawer-backdrop"]')
    check(!!backdrop, '抽屉有遮罩')
    if (backdrop) {
      await page.mouse.click(12, 12)
      await sleep(500)
      let still = await page.$('[data-testid="mobile-drawer"]')
      check(!still, '点遮罩 → 抽屉关闭')
    }
    // ② 点把手条（不划屏幕的人也得有路可走）
    if (await page.$('[data-testid="mobile-drawer"]')) {
      const handle = await page.$('[data-testid="mobile-drawer-handle"]')
      check(!!handle, '抽屉有把手条')
      if (handle) {
        await handle.click()
        await sleep(400)
        const still = await page.$('[data-testid="mobile-drawer"]')
        check(!still, '点把手条 → 抽屉关闭')
      }
    }
  }
}

// --- ⑦ 参观模式的事件退路 + 操舵退路 ---
{
  await page.evaluate(() => {
    const s = window.__gameStore.getState()
    const ev = {
      id: 999, type: 'pirate', title: '测试事件', description: '一条商船挡住了去路。',
      sceneKey: 'pirate', choices: [
        { text: '抢过去', outcomes: [{ goldChange: -10, moraleChange: -5, foodChange: 0, waterChange: 0, durabilityChange: -5, crewChange: 0, weight: 1 }] },
        { text: '绕开', outcomes: [{ goldChange: 0, moraleChange: 0, foodChange: 0, waterChange: 0, durabilityChange: 0, crewChange: 0, weight: 1 }] },
      ],
      triggerCondition: { minDay: 1 },
    }
    window.__gameStore.setState({ currentEvent: ev, gamePhase: 'event' })
    void s
  })
  await sleep(700)
  const observe = await page.$$eval('button', els => els.map(e => e.textContent?.trim() ?? '').filter(t => t.includes('站在一边看')))
  check(observe.length === 1, '参观模式的事件卡有「站在一边看」的退路')
  await page.screenshot({ path: `${SHOTS}/mobile-event.png` })

  // 操舵：船长模式才弹；这里直接注入待操舵状态验证退路按钮存在
  await page.evaluate(() => {
    window.__gameStore.setState({
      currentEvent: null,
      gamePhase: 'helm',
      pendingHelm: { segmentIndex: 0 },
      gameMode: 'captain',
      fleet: { ...window.__gameStore.getState().fleet, isSailing: true },
    })
  })
  await sleep(700)
  const skipBtns = await page.$$eval('button', els => els.map(e => e.textContent?.trim() ?? '').filter(t => t.includes('交给水手')))
  check(skipBtns.length >= 1, '操舵界面有「交给水手」的退路')
  await page.screenshot({ path: `${SHOTS}/mobile-helm.png` })
}

console.log(`\n移动端实测：${pass} 通过 / ${fail} 失败`)
if (errors.length) {
  console.log('\n页面错误：')
  errors.slice(0, 8).forEach(e => console.log('  ' + e))
}
await browser.close()
if (fail > 0) process.exit(1)
