/*
 * R5：新档第一页。
 *
 * 【守什么】实测过：不加这一页，新档册子是 **0 页**（journal 0 / 成就 0/17）——
 * 而"回来有东西等你"是本作唯一的留存承诺，第一天空着等于没承诺。
 * 四条：
 *   ① 开局 30 秒内 `logbook.length >= 1`（不是"能翻到"，是数据里就有）；
 *   ② 那页是「启程 · 母港」，不是编的通用文案；
 *   ③ 它带一条**下一站的尾巴**（targetPortId 指向别的港）——这正是留存钩子；
 *   ④ 册子页面里真的能看到它（不是只躺在 store 里）。
 */
const puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5176/Age-of-Discovery/'
const sleep = ms => new Promise(r => setTimeout(r, ms))
let pass = 0, fail = 0
const check = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
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
await page.keyboard.press('Escape'); await sleep(300); await page.keyboard.press('Escape'); await sleep(700)

const st = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  const first = s.logbook[0]
  return {
    n: s.logbook.length,
    title: first?.title ?? '',
    day: first?.day ?? null,
    portId: first?.portId ?? null,
    target: first?.targetPortId ?? null,
    home: s.fleet.currentPortId,
    hint: first?.hint ?? '',
  }
})
check(st.n >= 1, `① 开局册子里就有页（${st.n} 页）`)
check(/^启程 · /.test(st.title), `② 标题是「启程 · 母港」（实际「${st.title}」）`)
check(st.day === 1, `② 记在第 1 天（实际 ${st.day}）`)
check(st.portId === st.home, `② 页上的港 = 你所在的港（${st.portId} / ${st.home}）`)
check(!!st.target && st.target !== st.home, `③ 带一条下一站的尾巴（指向港 ${st.target}）`)
check(!!st.hint && st.hint.length > 8, `③ 尾巴是一句话，不是占位（「${st.hint.slice(0, 18)}…」）`)

await page.evaluate(() => window.__mapStore.getState().openLogbook('journal'))
await sleep(900)
const onPage = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="logbook-screen"]')
  return { text: (el?.innerText || '').replace(/\s+/g, ' '), pages: document.querySelectorAll('[data-testid="logbook-page-journal"]').length }
})
check(/启程/.test(onPage.text), '④ 册子的「日志」页里看得到这一页')
check(errs.length === 0, `无运行时错误（${errs.length}${errs.length ? '：' + errs[0] : ''}）`)
console.log(`\n第一页 e2e：${pass} 通过 / ${fail} 失败`)
await b.close()
process.exit(fail === 0 ? 0 : 1)
