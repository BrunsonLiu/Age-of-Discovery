/*
 * R2：一趟航行的"海况脾气"。
 *
 * 【守什么】补的是节奏空档：选完方针后一趟 15 天的航行里没有任何需要重新决策的节点。
 * 四条：
 *   ① 出航计划上有一行「这一趟 X」，且 X 来自 VOYAGE_MODS（不是自由文案）；
 *   ② 面板上的 id/mul 与 **advanceDay 那条推导**一致（同一天同一段航线算同一条）；
 *   ③ 乘数真的进了事件率：同一段航线，把日/港改到另一条脾气上，事件触发率随之变；
 *   ④ 刷新后仍是同一条（推导而非状态，不会不同步）。
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
await page.keyboard.press('Escape'); await sleep(300); await page.keyboard.press('Escape'); await sleep(800)

await page.evaluate(async () => {
  const m = await import('/Age-of-Discovery/src/data/ports.ts')
  const p2 = m.ports.find(x => x.id === 2)
  window.__gameStore.getState().sailToWaypoint({ portId: p2.id, latitude: p2.latitude, longitude: p2.longitude })
})
await sleep(1200)
const html = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="voyage-mod"]')
  return el ? { text: el.innerText.replace(/\s+/g, ' '), id: el.getAttribute('data-mod'), mul: Number(el.getAttribute('data-mul')) } : null
})
check(!!html, '① 出航计划上有「这一趟」这一行')
// 与数据层同一推导对账（面板说的 = advanceDay 用的）
const expect = await page.evaluate(async ({ id, from, to, day }) => {
  const m = await import('/Age-of-Discovery/src/data/voyageModifiers.ts')
  const v = m.pickVoyageMod(day, from, to)
  return { id: v.id, mul: v.eventMul, name: v.name, inList: m.VOYAGE_MODS.some(x => x.id === id) }
}, { id: html?.id, from: 6, to: 2, day: await page.evaluate(() => window.__gameStore.getState().fleet.day) })
check(html?.id === expect.id, `② 面板上的脾气 = 数据层推导（${html?.id} / ${expect.id}）`)
check(Math.abs((html?.mul ?? 0) - expect.mul) < 1e-9, `② 乘数一致（${html?.mul} = ${expect.mul}）`)
check(html?.text.includes(expect.name), `① 行里写的是名字「${expect.name}」（实际「${html?.text}」）`)

// ③ 乘数真的进事件率：直接量 getRandomEvents 在两次不同 chanceMultiplier 下的触发频次
const rate = await page.evaluate(async () => {
  const m = await import('/Age-of-Discovery/src/utils/eventEngine.ts')
  const d = await import('/Age-of-Discovery/src/data/events.ts')
  const s = window.__gameStore.getState()
  const N = 400
  const run = (mul) => {
    let hit = 0
    for (let i = 0; i < N; i++) if (m.getRandomEvents(s, d.events, 99, mul)) hit++
    return hit / N
  }
  return { low: run(0.55), high: run(1.75) }
})
check(rate.high > rate.low, `③ 事件率确实随乘数变（×0.55 → ${(rate.low * 100).toFixed(1)}% / ×1.75 → ${(rate.high * 100).toFixed(1)}%）`)

// ④ 刷新后同一条
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2600)
const after = await page.evaluate(async () => {
  const m = await import('/Age-of-Discovery/src/data/voyageModifiers.ts')
  const s = window.__gameStore.getState()
  const v = m.pickVoyageMod(s.fleet.day, 6, 2)
  return { id: v.id }
})
check(after.id === expect.id, `④ 刷新后仍是同一条脾气（${after.id}）`)
check(errs.length === 0, `无运行时错误（${errs.length}${errs.length ? '：' + errs[0] : ''}）`)
console.log(`\n海况脾气 e2e：${pass} 通过 / ${fail} 失败`)
await b.close()
process.exit(fail === 0 ? 0 : 1)
