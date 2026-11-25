/*
 * 金盆洗手（主动退休）：R1。
 *
 * 【为什么要这一套】原来一局只有两种走法 —— 翻船，或者永远开下去。
 * 玩家没有"我赚够了，想看看这一辈子怎么样"的出口。
 * 这套守四件事，每件都直接对应一个可能出错的地方：
 *   ① 入口在港口服务里，且**两步确认**（一次点击就结束一局，误触代价太大）；
 *   ② 点「再想想」真的回到未确认状态（不能一按就锁死）；
 *   ③ 退休屏与翻船屏用**同一本账**（统计/座次都在），但结论不同（金盆洗手 ≠ 航行终结）；
 *   ④ 退休后能换船长重开，且**图鉴/见闻不被清掉**（这是"体面收手"的意义）。
 */
const puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5176/Age-of-Discovery/'
const sleep = ms => new Promise(r => setTimeout(r, ms))
let pass = 0, fail = 0
const check = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const until = async (p, fn, ms = 8000) => { try { await p.waitForFunction(fn, { timeout: ms }); return true } catch { return false } }

const b = await puppeteer.launch({ executablePath: process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] })
const page = await b.newPage()
const errs = []
page.on('pageerror', e => errs.push(String(e)))
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2600)
const clickIn = (ov, t) => page.evaluate((o, x) => {
  const ovl = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')].find(y => new RegExp(o).test(y.textContent || ''))
  const btn = ovl && [...ovl.querySelectorAll('button')].find(y => new RegExp(x).test(y.textContent || ''))
  if (btn) btn.click()
}, ov, t)
for (const [a, c] of [['翻开日志', '翻开日志'], ['塞维利亚港', '继续']]) { await clickIn(a, c); await sleep(450) }
await page.evaluate(() => document.querySelector('button[data-mode="captain"]')?.click()); await sleep(400)
await clickIn('你想怎么玩', '继续'); await sleep(700)
await page.evaluate(() => {
  const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /选择你的天赋/.test(x.textContent || ''))
  if (!o) return
  ;[...o.querySelectorAll('button')].filter(x => /商界血脉|铁壁舰长|魅力领袖|天生探险家|随船医生/.test(x.textContent || ''))[0]?.click()
}); await sleep(400)
await clickIn('选择你的天赋', '启航'); await sleep(1500)
await clickIn('跳过引导', '跳过引导'); await sleep(400)
await page.keyboard.press('Escape'); await sleep(300); await page.keyboard.press('Escape'); await sleep(900)

// 先在港口里记下"图鉴已有几港"，退休后要比
await page.evaluate(() => window.__gameStore.getState().setActivePanel('port'))
await sleep(900)
const before = await page.evaluate(() => ({
  ports: window.__gameStore.getState().discoveredPorts.length,
  pages: window.__gameStore.getState().logbook.length,
  gold: window.__gameStore.getState().fleet.gold,
}))
check(!!(await page.$('[data-testid="retire-open"]')), '① 港口服务里有「金盆洗手」入口')
await page.evaluate(() => document.querySelector('[data-testid="retire-open"]').click())
await sleep(300)
check(!!(await page.$('[data-testid="retire-confirm"]')) && !!(await page.$('[data-testid="retire-cancel"]')),
  '① 第一次点击只展开确认，不结束这一局')
await page.evaluate(() => document.querySelector('[data-testid="retire-cancel"]').click())
await sleep(250)
check(!(await page.$('[data-testid="retire-confirm"]')), '② 「再想想」回到未确认状态')
await page.evaluate(() => document.querySelector('[data-testid="retire-open"]').click())
await sleep(250)
await page.evaluate(() => document.querySelector('[data-testid="retire-confirm"]').click())
await sleep(900)
const screen = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="gameover-screen"]')
  return el ? { text: el.innerText.replace(/\s+/g, ' ') } : null
})
check(!!screen, '③ 退休后出现终局屏')
check(!!screen && /金盆洗手/.test(screen.text), '③ 结论是「金盆洗手」而不是「航行终结」')
check(!!screen && !/走向了终结/.test(screen.text), '③ 不套用翻船的文案')
check(!!screen && /航海生涯总结/.test(screen.text) && /按金币排/.test(screen.text),
  '③ 用的是同一本账（生涯总结 + 座次表都在）')
check(!!screen && new RegExp(`积累财富: ${before.gold} 金`).test(screen.text),
  `③ 屏上的金币 = 退休那一刻的真实值（${before.gold}）`)
const after = await page.evaluate(() => ({
  ports: window.__gameStore.getState().discoveredPorts.length,
  pages: window.__gameStore.getState().logbook.length,
  phase: window.__gameStore.getState().gamePhase,
}))
check(after.phase === 'retired', `③ 相位是 retired（实际 ${after.phase}）`)
check(after.ports === before.ports && after.pages === before.pages,
  `④ 退休不清图鉴与见闻（${before.ports} 港 / ${before.pages} 页 → ${after.ports} / ${after.pages}）`)
/*
 * 【诚实标注】新档的见闻页数是 0，所以"页数没变"这条是 0 = 0 —— 判别力只在港口那一半
 * （1 港 → 1 港）。要真正验"见闻不被清"，得先攒一页再退休。这里不假装它验到了。
 */
if (before.pages === 0) console.log('  · 注：新档 0 页，见闻那半条只验到"没变"，判别力靠港口那半条')
await page.evaluate(() => document.querySelector('[data-testid="restart-game"]').click())
await sleep(1200)
const restarted = await page.evaluate(() => window.__gameStore.getState().gamePhase)
check(restarted === 'start' || restarted === 'playing', `④ 「以新船长再来一局」回到开局（实际 ${restarted}）`)
check(errs.length === 0, `无运行时错误（${errs.length}${errs.length ? '：' + errs[0] : ''}）`)
console.log(`\n金盆洗手 e2e：${pass} 通过 / ${fail} 失败`)
await b.close()
process.exit(fail === 0 ? 0 : 1)
