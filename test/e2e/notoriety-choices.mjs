/*
 * R3：取向改变"能选什么"。
 *
 * 守三件事：
 *   ① 隐秘 < 3 时，王室密函只有 3 个选项；≥ 3 时多出「以惯犯的口吻谈价」；
 *   ② 胆识同理（巨妖事件 3 → 4）；
 *   ③ 多出来的选项**真的能点、真的结算**（不是只多一行字）。
 * 判据用「选项按钮数」与「屏上文本是否含该句」，不用 index（顺序会变）。
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
await page.keyboard.press('Escape'); await sleep(300); await page.keyboard.press('Escape'); await sleep(900)

// 找出这两个事件（用数据层拿 id，不写死）
const ids = await page.evaluate(async () => {
  const m = await import('/Age-of-Discovery/src/data/events.ts')
  const find = (needle) => m.events.find(e => (e.choices || []).some(c => (c.text || '').includes(needle)))
  return {
    letter: find('私拆密函')?.id ?? null,
    kraken: find('熄灯静默')?.id ?? null,
  }
})
check(!!ids.letter && !!ids.kraken, `① 找到两个带门槛的事件（${ids.letter} / ${ids.kraken}）`)

const openEvent = async (id, notoriety) => {
  await page.evaluate(({ id, n }) => {
    window.__gameStore.setState({ notoriety: n, currentEvent: null, gamePhase: 'playing' })
  }, { id, n: notoriety })
  await sleep(250)
  await page.evaluate(async (id) => {
    const m = await import('/Age-of-Discovery/src/data/events.ts')
    const ev = m.events.find(e => e.id === id)
    window.__gameStore.setState({ currentEvent: ev, gamePhase: 'event', activePanel: null })
  }, id)
  await page.waitForFunction(() => !!document.querySelector('[data-testid^="event-choice"]') || [...document.querySelectorAll('button')].some(b => /私拆密函|熄灯静默/.test(b.textContent || '')), { timeout: 8000 }).catch(() => {})
  await sleep(400)
  return page.evaluate(() => {
    const txt = document.body.innerText
    const btns = [...document.querySelectorAll('button')].filter(b => {
      const t = b.textContent || ''
      return t.length > 4 && !/继续|跳过|关闭|再想想/.test(t)
    })
    return { hasSecret: txt.includes('以惯犯的口吻谈价'), hasBold: txt.includes('擂鼓放歌'), n: btns.length }
  })
}

const zero = { cruel: 0, mercy: 0, greed: 0, bold: 0, secret: 0 }
const high = { cruel: 0, mercy: 0, greed: 0, bold: 5, secret: 5 }

const a0 = await openEvent(ids.letter, zero)
check(!a0.hasSecret, '① 隐秘 0：看不到那条"以惯犯的口吻谈价"')
const a3 = await openEvent(ids.letter, high)
check(a3.hasSecret, '① 隐秘 5：它出现了')
check(a3.n > a0.n, `① 选项数确实变多（${a0.n} → ${a3.n}）`)

const k0 = await openEvent(ids.kraken, zero)
check(!k0.hasBold, '② 胆识 0：看不到"擂鼓放歌"')
const k3 = await openEvent(ids.kraken, high)
check(k3.hasBold, '② 胆识 5：它出现了')

// 真的能点、真的结算
await openEvent(ids.kraken, high)
const clicked = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /擂鼓放歌/.test(b.textContent || ''))
  if (!btn) return false
  btn.click(); return true
})
check(clicked, '③ 多出来的选项可以点')
await page.waitForFunction(() => /资源变化|没有变化|航海日志|继续/.test(document.body.innerText), { timeout: 8000 }).catch(() => {})
await sleep(600)
const resolved = await page.evaluate(() => document.body.innerText.includes('资源变化') || document.body.innerText.includes('无资源变化'))
check(resolved, '③ 点完真的进入结算（不是点了没反应）')
/*
 * ④ 门槛要**被玩家看见**（R3 的下半句）。
 * 机制做完了不等于玩家会知道：一条"只有你才看得见"的选项，如果没有任何标记，
 * 玩家只会当成随机多出来的一条。所以两处要说话：
 *   · 选项上有角标「守秘 3」，悬停写明"只有…才看得见这一条"；
 *   · 这一次 +1 **第一次**跨过门槛时，结算屏说一句，之后不再说。
 * 判据只看"跨过那一次"：把 notoriety 设成 2，点下**同事件里始终可见**的「私拆密函」
 * （它也 +1 守秘），结算后正好是 3 —— 于是这条说明必须出现。
 * 注意不能点 gated 选项来测：secret=2 时它自己还是隐身的（鸡生蛋）。
 */
await openEvent(ids.letter, { cruel: 0, mercy: 0, greed: 0, bold: 0, secret: 5 })
const chip = await page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find(b => /以惯犯的口吻谈价/.test(b.textContent || ''))
  const tag = el?.querySelector('[data-axis="secret"]')
  return tag ? { text: (tag.textContent || '').trim(), title: tag.getAttribute('title') } : null
})
check(!!chip, '④ 带门槛的选项有角标')
check(!!chip && /守秘\s*3/.test(chip.text), `④ 角标写明是哪一项、到几分（「${chip?.text}」）`)
check(!!chip && /只有守秘累积到 3/.test(chip.title || ''), `④ 悬停说明写清了门槛（「${chip?.title}」）`)

/*
 * 固定骰子：这个选项的两个结局是 0.5 / 0.5，而**只有第一个**带 `secret: 1`。
 * 不固定的话有一半概率掷到"没加守秘"的那一支，于是"跨过门槛"根本不发生 ——
 * 那不是产品问题，是测试自己在掷硬币。把 Math.random 钉在 0.05（落在第一支）即可。
 */
await page.evaluate(() => { window.__rndSaved = Math.random; Math.random = () => 0.05 })
await page.evaluate(() => {
  window.__gameStore.setState({ notoriety: { cruel: 0, mercy: 0, greed: 0, bold: 0, secret: 2 }, currentEvent: null })
})
await page.evaluate(async (id) => {
  const m = await import('/Age-of-Discovery/src/data/events.ts')
  window.__gameStore.setState({ currentEvent: m.events.find(e => e.id === id), gamePhase: 'event', activePanel: null })
}, ids.letter)
await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /私拆密函/.test(b.textContent || '')), { timeout: 8000 }).catch(() => {})
await sleep(400)
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => /私拆密函/.test(b.textContent || ''))?.click()
})
await page.waitForFunction(() => !!document.querySelector('[data-testid="notoriety-unlock"]'), { timeout: 8000 }).catch(() => {})
await sleep(300)
const unlock = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="notoriety-unlock"]')
  const st = window.__gameStore.getState()
  return el ? { text: (el.textContent || '').trim(), axis: el.getAttribute('data-axis'), secret: st.notoriety.secret } : { secret: st.notoriety.secret }
})
check(unlock.axis === 'secret', `④ 跨过门槛时结算屏说明了（守秘=${unlock.secret}）`)
check(/守秘到了 3/.test(unlock.text || ''), `④ 说明里写了到几分（「${unlock.text}」）`)
check(/只有你才看得见/.test(unlock.text || ''), '④ 说明的是"专属选项"这件真事（不是泛泛的漂亮话）')

/* ⑤ 只报第一次：4→5 不该再说一遍 */
await page.evaluate(() => {
  window.__gameStore.setState({ notoriety: { cruel: 0, mercy: 0, greed: 0, bold: 0, secret: 4 }, currentEvent: null })
})
await page.evaluate(async (id) => {
  const m = await import('/Age-of-Discovery/src/data/events.ts')
  window.__gameStore.setState({ currentEvent: m.events.find(e => e.id === id), gamePhase: 'event', activePanel: null })
}, ids.letter)
await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => /私拆密函/.test(b.textContent || '')), { timeout: 8000 }).catch(() => {})
await sleep(400)
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(b => /私拆密函/.test(b.textContent || ''))?.click()
})
await sleep(900)
const again = await page.evaluate(() => !!document.querySelector('[data-testid="notoriety-unlock"]'))
check(!again, '⑤ 4→5 不再重复说（每屏都说就变噪声）')

await page.evaluate(() => { if (window.__rndSaved) Math.random = window.__rndSaved })
check(errs.length === 0, `无运行时错误（${errs.length}${errs.length ? '：' + errs[0] : ''}）`)
console.log(`\n取向改选项 e2e：${pass} 通过 / ${fail} 失败`)
await b.close()
process.exit(fail === 0 ? 0 : 1)
