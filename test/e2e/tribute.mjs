/**
 * 朝贡闭环 e2e（大明 · 广州）。
 *
 * 【为什么单独一条】"交勘合"是这个项目里**历史靠机制落地**的那一只手：
 * 香料得从满剌加一带运回来、20 天冷却、三次给名号。
 * 但它原来有个承诺没兑现 —— 面板写着「市舶司收下香料，**记下你的船名**」，
 * 而 store 只在**该给名号那一次**才写册子：前两次、以及所有没到门槛的朝贡，
 * 屏幕上只有一条会消失的横幅。文案说了"记下"，册子里查不到，
 * 这跟"数字对不上"是同一类错。这条 e2e 钉的就是"话说出去就要留痕"。
 *
 * 判据全部走真实路径：给船上放香料 → 真鼠标点按钮 → 读 store 与 DOM。
 */
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5181/Age-of-Discovery/'
const SHOTS = '.workbuddy/shots'

let pass = 0
let fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log(`  ✓ ${msg}`) } else { fail++; console.log(`  ✗ FAIL: ${msg}`) }
}
/** 等页面里的条件成立（表达式是**页面**里的 JS，不是 Node 里的） */
const until = async (expr, timeout = 8000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(`!!(${expr})`)) return true
    await new Promise(r => setTimeout(r, 120))
  }
  return false
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)) })
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => localStorage.clear())
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 30000 })
await page.evaluate(() => {
  window.__gameStore.setState({ gamePhase: 'playing', tutorialStep: -1, showHelp: false, dialogueSeen: ['opening_pilot'], activePanel: null })
  window.__dialogueStore?.getState().skip()
})

// ---- 1. 大明 · 广州 · 船上有香料 ----
await page.evaluate(() => {
  const st = window.__gameStore
  st.setState({ nation: 'china', tributes: 0, lastTributeDay: -99, logbook: [] })
  const s = st.getState()
  st.setState({
    fleet: { ...s.fleet, isSailing: false, currentPortId: 21, gold: 4000, cargo: [{ goodId: 9, quantity: 8 }] },
  })
  st.getState().setActivePanel('port')
})
check(await until('document.querySelector(\'[data-service-anchor="tribute"]\')', 12000), '广州港务面板里有「交勘合」入口')

const entry = await page.evaluate(() => {
  const el = document.querySelector('[data-service-anchor="tribute"]')
  const btn = [...el.querySelectorAll('button')].pop()
  return { text: (el.innerText || '').replace(/\n+/g, ' | '), disabled: btn ? btn.disabled : null }
})
check(/香料 ×6（船上 8）/.test(entry.text), `入口报得出"要什么、船上有多少"（${entry.text.slice(0, 40)}…）`)
check(entry.disabled === false, '货够、没在冷却里 → 按钮可点')
check(/回赐：名号\+26 · 士气\+8/.test(entry.text), '按钮上方先写清回赐（不是点完才知道）')

// ---- 2. 真鼠标点一下 ----
const before = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return { fame: s.fleet.fame, morale: s.fleet.morale, spice: s.fleet.cargo.find(c => c.goodId === 9)?.quantity ?? 0 }
})
/* page.click 会先把按钮滚进视口再点（面板是可滚动的，算中心点手点会点空） */
await page.click('[data-testid="tribute-submit"]')
await new Promise(r => setTimeout(r, 600))

const after = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return {
    fame: s.fleet.fame, morale: s.fleet.morale,
    spice: s.fleet.cargo.find(c => c.goodId === 9)?.quantity ?? 0,
    tributes: s.tributes, lastDay: s.lastTributeDay,
    pages: s.logbook.map(e => ({ kind: e.kind, title: e.title, portId: e.portId, id: e.id })),
  }
})
check(after.spice === before.spice - 6, `扣的是 6 担香料（${before.spice} → ${after.spice}）`)
check(after.fame === before.fame + 26, `声望 +26（${before.fame} → ${after.fame}）`)
check(after.morale === before.morale + 8, `士气 +8（${before.morale} → ${after.morale}）`)
check(after.tributes === 1 && after.lastDay === 1, '记了次数与冷却起点（tributes=1 / 第 1 天）')

// ---- 3. 册子里必须多一页（这一轮的修复点）----
check(after.pages.length === 1 && after.pages[0].kind === 'tribute',
  `见闻里多了一页（${after.pages.map(p => p.kind).join(',') || '空'}）`)
check(/交勘合 · 第 1 次/.test(after.pages[0]?.title ?? ''), `页题带次数（${after.pages[0]?.title}）`)
check(after.pages[0]?.portId === 21, '这一页挂广州（朝贡真的发生在市舶司，配得上那张画）')

await page.evaluate(() => window.__gameStore.getState().setActivePanel('event'))
check(await until("document.querySelectorAll('[role=tab]').length === 3"), '日志面板打开')
await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(t => t.textContent.includes('见闻'))?.click())
check(await until('document.querySelector(\'[data-testid="tribute-entry"]\')'), '「见闻」里能看到这一页')
{
  const dom = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="tribute-entry"]')
    return {
      text: (el.innerText || '').replace(/\n+/g, ' | '),
      art: el.querySelectorAll('[data-testid="logbook-art"]').length,
    }
  })
  check(/市舶司收下六担香料/.test(dom.text), '页上是那句原文（不是一句通用说明）')
  check(/船名记在市舶司的簿子上/.test(dom.text), '页边小注兑现了"记下你的船名"')
  check(dom.art === 1, '有港口的页照样配图（与"传说页不配图"的规则相反，因为这次真的在港里）')
}
await page.screenshot({ path: `${SHOTS}/tribute-e2e.png` })

// ---- 4. 冷却：按钮改成"20 天后再来"，再点也不成交 ----
await page.evaluate(() => window.__gameStore.getState().setActivePanel('port'))
await new Promise(r => setTimeout(r, 500))
{
  const c = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="tribute-submit"]')
    return { text: b.textContent.trim(), disabled: b.disabled }
  })
  check(/20 天后再来/.test(c.text) && c.disabled, `冷却里按钮写明天数与原因（${c.text}，禁用 ${c.disabled}）`)
}
const after2 = await page.evaluate(() => {
  document.querySelector('[data-testid="tribute-submit"]').click()
  const s = window.__gameStore.getState()
  return { tributes: s.tributes, pages: s.logbook.length }
})
check(after2.tributes === 1 && after2.pages === 1, '冷却里再点也不成交、也不写第二页')

check(errors.length === 0, `全程 0 运行时错误${errors.length ? '（' + errors.slice(0, 2).join(' | ') + '）' : ''}`)

await browser.close()
console.log(`\n朝贡闭环 e2e：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
