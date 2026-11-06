// 中文小字巡检：18 个界面状态下，屏幕上不许再有 <12px 的中文
//
// 跑法：先起 dev server，再 `node test/e2e/small-text-audit.mjs`
//
// 【为什么不能只读源码】
// `test/e2e/typography-audit.mjs` 只巡检「在地图上、没有浮层」的常态；
// 而小字全藏在事件卡、出航计划、航段决策、对手面板这些浮层里，
// 那一版的报告显示常态「<12px 中文 0 条」，实际全项目有 68 条。
// 所以这里逐场景造状态，只读 getComputedStyle 的真实字号。
//
// 【防假绿】每个关键场景都带一句「必须出现」的特征文案，否则场景没进去时
// 断言照样全绿。踩过两次：① activePanel 名字写错，面板没开却报 0 条小字；
// ② EventCard 的 outcome/miniGame 是组件内部 state，换 currentEvent 不卸载组件，
//    第二、三次"开事件"其实还停在上一张结算页。必须先清空再重开。
//
// 纯符号角标（MiniMap 的 N、WeatherBadge 的 ▾）不含中文，天然不在判据里。

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
const until = async (fn, ms = 8000, ...args) => {
  try { await page.waitForFunction(fn, { timeout: ms }, ...args); return true } catch { return false }
}
const dismiss = async () => {
  for (let i = 0; i < 3; i++) {
    const on = await page.evaluate(() => document.body.textContent.includes('Esc 跳过致辞'))
    if (!on) return
    await page.keyboard.press('Escape')
    await sleep(250)
  }
}
const bodyText = () => page.evaluate(() => document.body.textContent)

// 页面内采集：只取自身有直接文本节点的叶子，避免容器重复计数。
// 中文判据用 CJK 统一表意文字区段；数字读数同样受 12px 下限约束。
const COLLECT = () => {
  const visible = el => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return null
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return null
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return null
    return r
  }
  const leaf = el => {
    let t = ''
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent
    return t.trim()
  }
  const small = [], clipped = []
  let cnTotal = 0
  for (const el of document.querySelectorAll('body *')) {
    const txt = leaf(el)
    if (!txt) continue
    const r = visible(el)
    if (!r) continue
    const px = parseFloat(getComputedStyle(el).fontSize)
    const hasCn = /[\u3400-\u9fff]/.test(txt)
    if (!hasCn) continue
    cnTotal++
    if (px < 12) small.push({ txt: txt.slice(0, 24), px })
    if (el.scrollWidth > el.clientWidth + 1) clipped.push(txt.slice(0, 24))
  }
  return { cnTotal, small, clipped }
}

const grab = async (name, marker) => {
  await dismiss()
  await sleep(320)
  const r = await page.evaluate(COLLECT)
  if (marker) check((await bodyText()).includes(marker), `${name}：场景确实进入了（出现「${marker}」）`)
  check(r.cnTotal > 20, `${name}：采到 ${r.cnTotal} 条可见中文（不是空页面）`)
  check(r.small.length === 0,
    `${name}：<12px 中文 ${r.small.length} 条${r.small.length ? ' → ' + r.small.slice(0, 3).map(x => `${x.px}px「${x.txt}」`).join(' ') : ''}`)
  check(r.clipped.length === 0,
    `${name}：中文被截断 ${r.clipped.length} 条${r.clipped.length ? ' → ' + r.clipped.slice(0, 3).join(' / ') : ''}`)
  return r
}

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
check(await until(() => !!window.__gameStore), 'dev 状态钩子可用')

const importDev = async (p) => page.evaluate(async path => {
  for (const u of [`/Age-of-Discovery/${path}`, `/${path}`]) {
    try { return await import(u) } catch { /* 换下一个前缀 */ }
  }
  return null
}, p)

await page.evaluate(() => window.__gameStore.setState({
  gamePhase: 'playing', tutorialStep: -1, showHelp: false,
  dialogueSeen: ['opening_pilot'], activePanel: null, currentEvent: null,
  pendingVoyage: null, pendingSegment: null, pendingHelm: null, gameMode: 'captain',
}))

// ---- 1. 常态与 8 个侧栏面板 ----
await grab('常态主界面', '点击地图出航')
// 面板名必须与 MainMap 的 LEFT_PANELS / RIGHT_PANELS 一致，写错就是假绿。
// 特征文案也必须是**面板内独有**的：第一版用「舰队/任务/声望」当标记，
// 那些恰好是侧栏按钮文字，面板根本没开时断言照样通过。
for (const [p, marker] of [
  ['fleet', '总货舱'], ['task', '冒险进度'], ['event', '记事'], ['achievement', '最大单笔'],
  ['rival', '你的座次'], ['port', '甲板盛宴'], ['trade', '商品交易'], ['shipyard', '造船厂才有售'],
]) {
  await page.evaluate(v => window.__gameStore.setState({ activePanel: v }), p)
  await grab(`面板:${p}`, marker)
}
await page.evaluate(() => window.__gameStore.setState({ activePanel: null, showHelp: true }))
await grab('帮助', '导出存档')
await page.evaluate(() => window.__gameStore.setState({ showHelp: false }))
await page.evaluate(() => window.__mapStore.setState({ viewMode: 'harbor' }))
await grab('岸上', '已靠岸')
await page.evaluate(() => window.__mapStore.setState({ viewMode: 'chart' }))

// ---- 2. 事件卡 / 结算 / 小游戏（必须卸载再重开，见文件头） ----
await page.evaluate(async () => {
  const m = await import('/Age-of-Discovery/src/data/events.ts').catch(() => import('/src/data/events.ts'))
  window.__probeEvent = m.events.find(x => x.choices.some(c => c.miniGame)) ?? m.events[0]
})
const openEvent = async () => {
  await page.evaluate(() => window.__gameStore.setState({ currentEvent: null, gamePhase: 'playing' }))
  await sleep(320)
  await page.evaluate(() => window.__gameStore.setState({
    currentEvent: window.__probeEvent, gamePhase: 'event', activePanel: null,
  }))
  await sleep(320)
}
await openEvent()
await grab('事件卡', '加勒比飓风')
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('改变航向'))?.click())
await sleep(500)
await grab('事件结算', '资源变化')

await openEvent()
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('降帆收桅'))?.click())
await sleep(550)
await grab('小游戏说明', '起帆迎风')
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('起帆迎风'))?.click())
await sleep(800)
await grab('小游戏进行中', '指针进入绿区时按空格')
await page.evaluate(() => window.__gameStore.setState({ currentEvent: null, gamePhase: 'playing' }))

// ---- 3. 出航计划 / 航段决策 / 操舵 ----
// 走真实 store 动作生成航线：手搓的假 route 会让组件读 undefined.toFixed
const plan = await page.evaluate(async () => {
  const P = (await import('/Age-of-Discovery/src/data/ports.ts').catch(() => import('/src/data/ports.ts'))).ports
  const st = window.__gameStore.getState()
  const from = P.find(p => p.id === st.fleet.currentPortId) ?? P[0]
  const cands = P.filter(p => p.id !== from.id)
    .map(p => ({ p, d: Math.hypot(p.latitude - from.latitude, p.longitude - from.longitude) }))
    .sort((a, b) => a.d - b.d)
  const to = cands[Math.min(6, cands.length - 1)].p
  window.__gameStore.setState({ gamePhase: 'playing', pendingVoyage: null, activePanel: null })
  window.__gameStore.getState().sailToWaypoint({ latitude: to.latitude, longitude: to.longitude, portId: to.id, name: to.nameCn })
  return { to: to.nameCn, hasPlan: !!window.__gameStore.getState().pendingVoyage }
})
check(plan.hasPlan, `出航计划已由真实 store 动作生成（目的港 ${plan.to}）`)
await grab('出航计划', '三种方针能差多少')
await page.evaluate(() => window.__gameStore.getState().confirmDeparture())
await grab('航段决策', '按 1 / 2 / 3 选择')
await page.evaluate(() => window.__gameStore.setState({
  gamePhase: 'helm', pendingHelm: { segmentIndex: 0 }, gameMode: 'captain', pendingSegment: null,
  fleet: { ...window.__gameStore.getState().fleet, isSailing: true },
}))
await grab('操舵', '交给水手')
await page.evaluate(() => window.__gameStore.setState({ gamePhase: 'playing', pendingHelm: null }))

// ---- 4. 运行时错误 ----
check(errors.length === 0, `全程运行时错误 0 条${errors.length ? ' → ' + errors.slice(0, 2).join(' | ') : ''}`)

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
if (fail) process.exit(1)
