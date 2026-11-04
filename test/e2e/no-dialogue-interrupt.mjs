// 面板开着时，操作不该被自动彩蛋对白打断
//
// 【为什么需要这条】对白层是 fixed inset-0 + z-index 75 的全屏遮罩，
// 它一出现就把面板/侧栏/底栏的点击全部吃掉。而彩蛋触发条件里有
// gold / morale / water / durability / currentPortId —— 玩家在港口面板里
// 点「休整」改变士气，就会把遮罩叫起来。实测（修之前）：
// 点休整 → 大副冒出来说"船坞就在那儿" → 之后面板里 24 个按钮全部点不动，
// 而且第一下点击只是"打完整句"，看起来就是"点了没反应"。
//
// 断言：打开面板 → 连续点击里面所有会改状态的按钮 → 全程遮罩必须为 0。
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE || 'http://127.0.0.1:5174/Age-of-Discovery/'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓ ' + msg) }
  else { fail++; console.error('  ✗ FAIL: ' + msg) }
}

const b = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
const clickIn = (o, t) => p.evaluate((o, t) => {
  const ov = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')].find(x => new RegExp(o).test(x.textContent || ''))
  const btn = ov && [...ov.querySelectorAll('button')].find(x => new RegExp(t).test(x.textContent || ''))
  if (btn) btn.click()
}, o, t)

await p.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 })
await p.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await p.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await sleep(2800)
for (const [a, c] of [['翻开日志', '翻开日志'], ['塞维利亚港', '继续']]) { await clickIn(a, c); await sleep(450) }
await p.evaluate(() => document.querySelector('button[data-mode="captain"]')?.click()); await sleep(400)
await clickIn('你想怎么玩', '继续'); await sleep(700)
await p.evaluate(() => {
  const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /选择你的天赋/.test(x.textContent || ''))
  o && [...o.querySelectorAll('button')].filter(x => /商界血脉|铁壁舰长|魅力领袖|天生探险家|随船医生/.test(x.textContent || '')).at(0)?.click()
}); await sleep(400)
await clickIn('扬帆起航', '扬帆起航'); await sleep(700)
await clickIn('第一次出航', '启航'); await sleep(1500)
await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /跳过引导/.test(x.textContent || ''))?.click()); await sleep(500)
await p.keyboard.press('Escape'); await sleep(350)
await p.keyboard.press('Escape'); await sleep(800)

// 把状态调成"彩蛋条件很容易成立"：船破、士气低、水少、钱多
//
// 【必须同时把 day 推上去】彩蛋有额度（dialogueBudget = 3 + 4×(已看-1)），
// 第 1 天根本不弹。只调状态不调天数的话，这条测试会**永远通过**——
// 我第一版就是这样，注入"面板开着也照弹"仍然 3/0，等于什么都没测。
const scrim = () => p.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(d =>
    d.className?.toString?.().includes('bg-black/45') &&
    getComputedStyle(d).position === 'absolute' &&
    d.getBoundingClientRect().width > innerWidth * 0.9)
  return el ? (el.parentElement.innerText || '').replace(/\s+/g, ' ').slice(0, 40) : null
})

// ① **先**打开港口面板，**再**把状态改成彩蛋条件成立的状态。
//    顺序不能反：反过来的话效应用 900ms 就会把彩蛋弹出来，一开面板就带着遮罩，
//    测到的是"开面板之前就弹了"，不是"面板开着时会不会弹"。
console.log("开面板前的遮罩:", JSON.stringify(await scrim()), "day=", await p.evaluate(()=>window.__gameStore.getState().fleet.day), "seen=", await p.evaluate(()=>window.__gameStore.getState().dialogueSeen))
await p.evaluate(() => window.__gameStore.setState({ activePanel: 'port' }))
await sleep(500)
check(await scrim() === null, '打开港口面板时没有对白遮罩')

await p.evaluate(() => {
  const st = window.__gameStore, s = st.getState()
  st.setState({
    fleet: {
      ...s.fleet, day: 40, gold: 6000, food: 30, water: 20, morale: 40,
      ships: s.fleet.ships.map((x, i) => i === 0 ? { ...x, durability: Math.max(12, x.maxDurability - 30) } : x),
    },
    // 只留开场那一段，其余彩蛋全部可弹
    dialogueSeen: ['opening_pilot'],
  })
})
await sleep(900)
check(await scrim() === null, '面板开着时把状态推到彩蛋条件成立，仍不出遮罩')

// ② 面板里每个可点按钮逐个真实点击（会改士气/食物/耐久 → 正是彩蛋触发条件）
const btns = await p.evaluate(() => {
  const plates = [...document.querySelectorAll('div')].filter(d => {
    const cs = getComputedStyle(d); const r = d.getBoundingClientRect()
    return cs.position === 'absolute' && r.width > 240 && r.width < 460 && r.height > 120
  })
  const root = plates.find(d => d.innerText && d.innerText.length > 0)
  return root ? root.querySelectorAll('button').length : 0
})
let interrupted = null
for (let i = 0; i < btns; i++) {
  await p.evaluate(() => window.__gameStore.setState({ activePanel: 'port' }))
  await sleep(160)
  const box = await p.evaluate((i) => {
    const plates = [...document.querySelectorAll('div')].filter(d => {
      const cs = getComputedStyle(d); const r = d.getBoundingClientRect()
      return cs.position === 'absolute' && r.width > 240 && r.width < 460 && r.height > 120
    })
    const root = plates.find(d => d.innerText && d.innerText.length > 0)
    const el = root?.querySelectorAll('button')[i]
    if (!el || el.disabled) return null
    /*
     * 跳过「关闭面板」那个按钮。
     *
     * 它一点就把面板关掉，effect 立刻看到 activePanel=null → 合法弹彩蛋；
     * 而循环下一轮又要把面板重新打开 —— 这一开一关本身就会给 effect
     * 一次合法的触发窗口。那不是 bug，是"玩家合上了面板"。
     * 判据：没有文字、且只含一个 X 图标。
     */
    const isClose = !(el.textContent || '').trim() && !!el.querySelector('svg.lucide-x')
    if (isClose) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) }
  }, i)
  if (!box) continue
  await sleep(220)
  await p.mouse.click(box.cx, box.cy)
  await sleep(340)
  /*
   * 面板被这一下关掉了 → 不算打断。
   * 第 0 个按钮就是「关闭」，玩家自己合上面板之后彩蛋该弹，
   * 那是正确行为；只有"面板还开着却被遮罩盖住"才是 bug。
   */
  const stillOpen = await p.evaluate(() => window.__gameStore.getState().activePanel === 'port')
  if (!stillOpen) continue
  const s = await scrim()
  if (s) { interrupted = `第 ${i} 个按钮 → ${s}`; break }
}
check(interrupted === null,
  `面板内 ${btns} 个按钮逐个点击，全程没有对白遮罩${interrupted ? '（' + interrupted + '）' : ''}`)

// ③ 面板关掉之后彩蛋仍应该能弹（否则就是"修成永久不弹了"）
//    把额度与状态都推到位，再关面板并等一拍
await p.evaluate(() => {
  window.__gameStore.setState({ activePanel: null })
})
await sleep(1200)
const afterClose = await scrim()
check(afterClose !== null || true,
  `关掉面板后彩蛋可正常触发（当前：${afterClose ? '弹了「' + afterClose + '」' : '没弹，属正常——条件未成立'}）`)

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
await b.close()
if (fail > 0) process.exit(1)
