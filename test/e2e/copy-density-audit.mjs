// 决策浮层文案密度 + 信息守恒巡检
//
// 跑法：先起 dev server，再 `node test/e2e/copy-density-audit.mjs`
//
// 【为什么既要量「少」又要量「没丢」】
// 帮助面板改前 19 节全摊开，容器内 2762 字（首屏 557 字、要滚四屏）；
// 小游戏开场把轮数、秒数、加成百分比全压在开始按钮之上。
// 两者都改成「默认只给结论 / 细账折叠」。但只断言「字变少」是危险的：
// 把说明删掉也能让数字变漂亮。所以这里逐节点开，累加读回的正文，
// 必须 ≈ 改前正文的量；小游戏展开后三条细则与船况说明也必须逐条还在。
//
// 【口径】只量容器 data-testid 内的可见叶子文本，不把被遮罩盖住的底图、
// 常驻 HUD 算进来（否则改前改后都掺着 87 字基线，看不出差异）。
// `cn` 是容器内全部文本（主判据）；`cnScreen` 只按视口 y 范围粗筛，
// 滚动区里被 overflow 裁掉的节标题仍会算进去，所以它是**偏大**的估计，
// 只用来做「首屏没有再堆长文」的保守上界，不当作精确可读字数引用。

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 160)) })
await page.setViewport({ width: 1440, height: 900 })

let pass = 0, fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) }
  else { fail++; console.log('  ✗ FAIL:', msg) }
}
const bodyText = () => page.evaluate(() => document.body.textContent)
const dismiss = async () => {
  for (let i = 0; i < 3; i++) {
    if (!(await page.evaluate(() => document.body.textContent.includes('Esc 跳过致辞')))) return
    await page.keyboard.press('Escape'); await sleep(220)
  }
}

const MEASURE = (testid) => {
  const root = document.querySelector(`[data-testid="${testid}"]`)
  if (!root) return { error: 'NO_ROOT ' + testid }
  const leaf = el => {
    let t = ''
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent
    return t.trim()
  }
  const rows = []
  for (const el of root.querySelectorAll('*')) {
    const txt = leaf(el)
    if (!txt) continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue
    const cn = (txt.match(/[\u3400-\u9fff]/g) || []).length
    const nums = (txt.match(/\d+(?:\.\d+)?/g) || []).length
    if (cn || nums) rows.push({ txt, cn, nums, onScreen: r.bottom >= 0 && r.top <= innerHeight })
  }
  const sum = (k, arr) => arr.reduce((a, r) => a + r[k], 0)
  const shown = rows.filter(r => r.onScreen)
  return {
    cn: sum('cn', rows), nums: sum('nums', rows), blocks: rows.length,
    cnScreen: sum('cn', shown), numsScreen: sum('nums', shown),
    all: rows.map(r => r.txt),
  }
}
const measure = id => page.evaluate(MEASURE, id)
/** 懒加载块冷启动首次编译会超过写死的 sleep：一律轮询等 DOM 真出现，
 *  否则「还没渲染」会被后面的 page.click 升级成整脚本崩溃。 */
const waitForDom = async (fn, tries = 80) => {
  for (let i = 0; i < tries; i++) {
    if (await page.evaluate(fn)) return true
    await sleep(150)
  }
  return false
}

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 20000 })
await page.evaluate(() => window.__gameStore.setState({
  gamePhase: 'playing', tutorialStep: -1, showHelp: false,
  dialogueSeen: ['opening_pilot'], activePanel: null, currentEvent: null,
  pendingVoyage: null, pendingSegment: null, pendingHelm: null, gameMode: 'captain',
}))
await dismiss()

// ---------------- 1. 帮助面板：目录态 ----------------
await page.evaluate(() => window.__gameStore.setState({ showHelp: true, activePanel: null }))
await sleep(400)
check((await bodyText()).includes('导出存档'), '帮助面板确实打开了（出现「导出存档」）')
const helpClosed = await measure('help-panel')
check(helpClosed.error == null, '帮助面板容器锚点存在（不是空页面假绿）')
check(helpClosed.cn <= 220, `帮助目录态 ≤220 字（实测 ${helpClosed.cn} 字，改前全量 2762 字）`)
check(helpClosed.cnScreen <= 200, `帮助首屏 ≤200 字（实测 ${helpClosed.cnScreen} 字，改前 557 字）`)
check(helpClosed.nums === 0, `帮助目录态没有数字读数（实测 ${helpClosed.nums} 个，改前全量 70 个）`)

const heads = await page.$$eval('[data-testid^="help-section-"]', els => els.map(e => e.getAttribute('data-testid')))
check(heads.length === 19, `19 节目录都在（实测 ${heads.length} 节）`)

// 存档区是「不管翻到哪一节都得能点到」的操作入口。
// 只看 textContent 会假绿：改前它被两层嵌套滚动裁在面板外面（按钮 y=863，
// 面板底边 y=673），文字照样读得到、玩家却看不见。所以这里量真实 rect + 命中。
const layout = await page.evaluate(() => {
  const panel = document.querySelector('[data-testid="help-panel"]')
  const btn = document.querySelector('[data-testid="save-export"]')
  const pr = panel.getBoundingClientRect(), br = btn.getBoundingClientRect()
  const hit = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2)
  return {
    scrollers: panel.querySelectorAll('.scroll-parchment').length,
    inside: br.top >= pr.top && br.bottom <= pr.bottom,
    onScreen: br.top >= 0 && br.bottom <= innerHeight,
    hit: !!(hit && (hit === btn || btn.contains(hit))),
    btnTop: Math.round(br.top),
  }
})
check(layout.scrollers === 1, `帮助面板只有一层滚动区（实测 ${layout.scrollers} 层）`)
check(layout.inside && layout.onScreen, '导出按钮在面板内且不出屏（不再被 overflow 裁掉）')
check(layout.hit, '导出按钮中心点真能命中（不是被别的层盖住）')
await page.evaluate(() => {
  const s = document.querySelector('[data-testid="help-panel"] .scroll-parchment')
  if (s) s.scrollTop = s.scrollHeight
})
await sleep(140)
const btnTopAfter = await page.evaluate(() =>
  Math.round(document.querySelector('[data-testid="save-export"]').getBoundingClientRect().top))
check(Math.abs(btnTopAfter - layout.btnTop) <= 1,
  `正文滚到底，导出按钮位置不变（${layout.btnTop} → ${btnTopAfter}，页脚常驻）`)

// ---------------- 2. 帮助面板：信息守恒 ----------------
// 一次只开一节，所以每次「展开态 - 目录态」正好是那一节的正文。
let readBack = 0, emptySections = 0
for (const t of heads) {
  await page.click(`[data-testid="${t}"]`)
  await sleep(45)
  const m = await measure('help-panel')
  const delta = m.cn - helpClosed.cn
  if (delta < 20) emptySections++
  readBack += delta
}
check(emptySections === 0, `每节点开都有正文（空白节 ${emptySections} 个）`)
check(readBack >= 2500 && readBack <= 2700,
  `逐节点开共读回 ${readBack} 字，与改前正文约 2593 字相当（信息没被删）`)
const openBodies = await page.$$eval('[data-testid="help-section-body"]', els => els.length)
check(openBodies === 1, `一次只展开一节（当前 ${openBodies} 节）`)
check((await bodyText()).includes('把这本日志带走'), '存档区仍在面板固定位置，折叠没把它挤掉')

// 点开的那节要顶到滚动区开头：目录自己就有半屏高，否则正文挤在下面只露一行半。
await page.click('[data-testid="help-section-基本操作"]')
await sleep(260)
const reveal = await page.evaluate(() => {
  const head = document.querySelector('[data-testid="help-section-基本操作"]')
  const body = document.querySelector('[data-testid="help-section-body"]')
  const scroller = head.closest('.scroll-parchment')
  const sr = scroller.getBoundingClientRect()
  return {
    headOffset: Math.round(head.getBoundingClientRect().top - sr.top),
    visibleBody: Math.round(Math.min(body.getBoundingClientRect().bottom, sr.bottom) - body.getBoundingClientRect().top),
    lines: body.children.length,
  }
})
check(Math.abs(reveal.headOffset) <= 12, `展开的节顶到滚动区开头（偏移 ${reveal.headOffset}px）`)
check(reveal.visibleBody >= 90,
  `展开后正文有 ${reveal.visibleBody}px 可见（${reveal.lines} 条，不是只露一行半）`)

await page.evaluate(() => window.__gameStore.setState({ showHelp: false }))

// ---------------- 3. 小游戏开场：目录态 ----------------
await page.evaluate(async () => {
  const m = await import('/Age-of-Discovery/src/data/events.ts').catch(() => import('/src/data/events.ts'))
  window.__probeEvent = m.events.find(x => x.choices.some(c => c.miniGame)) ?? m.events[0]
})
await page.evaluate(() => window.__gameStore.setState({ currentEvent: null, gamePhase: 'playing' }))
await page.evaluate(() => window.__gameStore.setState({
  currentEvent: window.__probeEvent, gamePhase: 'event', activePanel: null,
}))
const choiceReady = await waitForDom(() => [...document.querySelectorAll('button')]
  .some(b => (b.textContent || '').includes('降帆收桅')))
check(choiceReady, '事件选项渲染出来了（懒加载 chunk 冷启动要等编译）')
await page.evaluate(() => [...document.querySelectorAll('button')]
  .find(b => (b.textContent || '').includes('降帆收桅'))?.click())
const mgReady = await waitForDom(() => !!document.querySelector('[data-testid="minigame-panel"]'))
check(mgReady, '小游戏开场确实进入了（容器锚点出现）')
check((await bodyText()).includes('起帆迎风'), '小游戏开场文案「起帆迎风」在屏幕上')
const mgClosed = await measure('minigame-panel')
check(mgClosed.error == null, '小游戏容器锚点存在')
check(mgClosed.cn <= 70, `开场默认 ≤70 字（实测 ${mgClosed.cn} 字，改前 128 字）`)
check(mgClosed.nums === 0, `开场默认没有数字读数（实测 ${mgClosed.nums} 个，改前 5 个）`)
check(mgClosed.blocks <= 8, `开场默认 ≤8 个文本块（实测 ${mgClosed.blocks} 块，改前 13 块）`)

// ---------------- 4. 小游戏：展开守恒 + 收起 + 键盘直通 ----------------
const toggleReady = await waitForDom(() => !!document.querySelector('[data-testid="minigame-fine-print-toggle"]'))
check(toggleReady, '细则折叠按钮真的出现在屏幕上')
if (toggleReady) await page.click('[data-testid="minigame-fine-print-toggle"]')
await sleep(160)
const mgOpen = await measure('minigame-panel')
check(mgOpen.cn >= 115, `展开后 ≥115 字（实测 ${mgOpen.cn} 字，改前 128 字，差值只是折叠按钮文案）`)
check(mgOpen.nums >= 4, `展开后数字细则都还在（实测 ${mgOpen.nums} 个）`)
const fineText = (await page.evaluate(() => document.querySelector('[data-testid="minigame-fine-print"]')?.textContent)) ?? ''
check(fineText.includes('一共 5 轮') && fineText.includes('4.5 秒') && fineText.includes('评分越高'),
  '三条玩法细则原文都还在')
check(fineText.includes('你的船况'), '船况加成段还在')
check(fineText.includes('这一段的操作会决定结局概率往哪边偏'), '操作与结局的说明段还在')
if (toggleReady) await page.click('[data-testid="minigame-fine-print-toggle"]')
await sleep(160)
check((await measure('minigame-panel')).cn === mgClosed.cn, '再点一次能收起，回到同一份简短开场')

await page.keyboard.press('Enter')
await sleep(500)
check((await bodyText()).includes('指针进入绿区时按空格'),
  '折叠没挡住 Enter 直接开始（进入实时操作态）')

// ---------------- 5. 事件正文：巡检要覆盖「玩家真正要读的叙事」 ----------------
// 帮助与小游戏都量过了，事件卡的描述段一直没进任何密度巡检。这里不能只断言
// 「字变少」——把剧情删空也能让数字好看，所以主判据是**逐字等于数据源**，
// 另加一条内容下界与「可见、没被裁切」。
// 上一节按了 Enter 进实时操作态，小游戏状态是组件本地的；换个干净页面，
// 免得「事件卡没出现」其实是旧浮层还占着屏幕。
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 20000 })
await page.evaluate(() => window.__gameStore.setState({
  gamePhase: 'playing', tutorialStep: -1, showHelp: false,
  dialogueSeen: ['opening_pilot'], activePanel: null, currentEvent: null,
  pendingVoyage: null, pendingSegment: null, pendingHelm: null, gameMode: 'captain',
}))
await dismiss()
await page.evaluate(async () => {
  const mod = await import('/Age-of-Discovery/src/data/events.ts')
  const ev = mod.events.find(e => e.id === 236) ?? mod.events[0]
  window.__gameStore.getState().setCurrentEvent(ev)
})
// EventCard 是 lazy chunk：dev 冷启动首次编译会超过写死的 sleep，轮询等它真的出现
let descReady = false
for (let i = 0; i < 60; i++) {
  descReady = await page.evaluate(() => !!document.querySelector('[data-testid="event-description"]'))
  if (descReady) break
  await sleep(150)
}
check(descReady, '事件卡正文渲染出来了（懒加载 chunk 冷启动要等编译）')
const evDesc = await page.evaluate(() => {
  const root = document.querySelector('[data-testid="event-description"]')
  if (!root) return null
  const text = (root.textContent || '').trim()
  const r = root.getBoundingClientRect()
  const cs = getComputedStyle(root)
  return {
    text,
    cn: (text.match(/[\u3400-\u9fff]/g) || []).length,
    source: (window.__gameStore.getState().currentEvent?.description ?? '').trim(),
    visible: cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) >= 0.05,
    clipped: root.scrollWidth > root.clientWidth + 1 || root.scrollHeight > root.clientHeight + 1,
    onScreen: r.top >= 0 && r.bottom <= innerHeight && r.width > 1 && r.height > 1,
  }
})
check(evDesc != null && evDesc.text === evDesc.source,
  '事件正文与数据源逐字相同（信息守恒：不是靠删剧情让字数好看）')
check(evDesc != null && evDesc.cn >= 20,
  `事件正文有实质内容（实测 ${evDesc?.cn ?? 0} 字，下界 20 字）`)
check(evDesc != null && evDesc.visible && !evDesc.clipped && evDesc.onScreen,
  '事件正文可见、没被容器裁掉、完整落在视口内')
await page.evaluate(() => window.__gameStore.setState({ currentEvent: null }))

// ---------------- 6. 移动端：抽屉里的页脚同样要看得见、点得到 ----------------
// 常驻 footer 是新结构，桌面没问题不代表 390×844 的底部抽屉装得下。
const mob = await browser.newPage()
mob.on('pageerror', e => errors.push('MOBILE PAGEERROR: ' + e.message))
await mob.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
await mob.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await mob.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await mob.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await mob.waitForFunction(() => !!window.__gameStore, { timeout: 20000 })
await mob.evaluate(() => window.__gameStore.setState({
  gamePhase: 'playing', tutorialStep: -1, showHelp: true,
  dialogueSeen: ['opening_pilot'], activePanel: null, gameMode: 'captain',
}))
await sleep(650)
const mm = await mob.evaluate(() => {
  const panel = document.querySelector('[data-testid="help-panel"]')
  if (!panel) return { error: 'NO_PANEL' }
  const btn = document.querySelector('[data-testid="save-export"]')
  const imp = document.querySelector('[data-testid="save-import"]')
  const br = btn.getBoundingClientRect(), ir = imp.getBoundingClientRect()
  const hit = el => {
    const r = el.getBoundingClientRect()
    const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return !!(h && (h === el || el.contains(h)))
  }
  return {
    panelBottom: Math.round(panel.getBoundingClientRect().bottom),
    vh: innerHeight,
    scrollers: panel.querySelectorAll('.scroll-parchment').length,
    heads: document.querySelectorAll('[data-testid^="help-section-"]').length,
    exportOnScreen: br.top >= 0 && br.bottom <= innerHeight,
    importOnScreen: ir.top >= 0 && ir.bottom <= innerHeight,
    exportHit: hit(btn), importHit: hit(imp),
    bodyScrollW: document.body.scrollWidth,
  }
})
check(mm.error == null, '移动端帮助抽屉确实渲染了（不是空页面假绿）')
check(mm.panelBottom <= mm.vh, `抽屉完整在屏内（底边 ${mm.panelBottom} ≤ ${mm.vh}）`)
check(mm.scrollers === 1 && mm.heads === 19, `移动端同样单层滚动、19 节目录齐全（${mm.scrollers} 层 / ${mm.heads} 节）`)
check(mm.exportOnScreen && mm.importOnScreen && mm.exportHit && mm.importHit,
  '移动端导出/导入按钮都在屏内且真能命中')
check(mm.bodyScrollW <= 390, `移动端无横向溢出（scrollWidth ${mm.bodyScrollW} ≤ 390）`)
await mob.close()

check(errors.length === 0, `全程运行时错误 0 条${errors.length ? ' → ' + errors.slice(0, 2).join(' | ') : ''}`)

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
if (fail) process.exit(1)
