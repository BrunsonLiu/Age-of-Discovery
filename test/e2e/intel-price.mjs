// 航线情报价：**按钮上印的数字必须等于实际扣掉的金币**
//
// 跑法：先起 dev server，再 `node test/e2e/intel-price.mjs`
//
// 【为什么单独一个套件】
// 原来 store 里写 `hasScholar ? INTEL_COST/2 : INTEL_COST`，
// 而 VoyagePlanModal 的按钮直接印 `GAME_BALANCE.INTEL_COST`：
//   · 学者伊莲在船时，按钮写「80 金」，点下去只扣 40；
//   · 金币在 40~79 之间还会被 `disabled` 挡住 —— 明明买得起。
// 这不是排版问题，是**屏幕上的数字与实际发生的变化分叉**，
// 是本作最不能接受的一类 bug，所以要有自己的判据盯着。
//
// 四组：无学者 / 随船学者 / 学者公会 30 / 两者都有（不叠加）。
// 每组都做同一件事：读按钮上的数字 → 用真鼠标点 → 量金币差额 → 比。

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'
mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 140)) })
await page.setViewport({ width: 1440, height: 900 })

let pass = 0, fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) }
  else { fail++; console.log('  ✗ FAIL:', msg) }
}
const until = async (fn, ms = 8000, ...args) => {
  try { await page.waitForFunction(fn, { timeout: ms }, ...args); return true } catch { return false }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
check(await until(() => !!window.__gameStore), 'dev 状态钩子可用')
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false,
    dialogueSeen: ['opening_pilot'], activePanel: null,
    logbook: [], claimedVictories: [], collectedDebris: [],
    fleet: { ...s.fleet, currentPortId: 21, isSailing: false, day: 6, gold: 500 },
  })
})
await until(() => !document.body.innerText.includes('选择你的船长天赋'), 20000)
await page.evaluate(() => {
  const d = window.__dialogueStore
  for (let i = 0; i < 8 && d?.getState?.().scriptId; i++) d.getState().skip()
})

/** 打开出航计划：选一个中程港，sailToWaypoint 会把航线挂到 pendingVoyage */
const openPlan = async () => {
  await page.evaluate(() => {
    const g = window.__gameStore.getState()
    // 清掉已买的情报，否则按钮变成"已掌握"
    window.__gameStore.setState({ routeIntel: {}, pendingVoyage: null })
    const target = [
      { id: 18, latitude: 22.1987, longitude: 113.5439 }, // 澳门，很近
      { id: 12, latitude: 2.1896, longitude: 102.2501 },  // 马六甲
    ].find(p => p.id !== g.fleet.currentPortId)
    g.sailToWaypoint({ latitude: target.latitude, longitude: target.longitude, portId: target.id })
  })
  const ok = await until(() => /出航计划/.test(document.body.innerText), 12000)
  await sleep(500)
  return ok
}

/** 读出按钮上的价格，并用真鼠标点它；返回 { label, before, after } */
const buyIntel = async () => {
  const info = await page.evaluate(() => {
    const modal = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /出航计划/.test(x.textContent || ''))
    if (!modal) return null
    const btn = [...modal.querySelectorAll('button')].find(b => /买通老船长/.test(b.textContent || ''))
    if (!btn) return null
    const m = /(\d+)\s*金/.exec(btn.textContent || '')
    const r = btn.getBoundingClientRect()
    return {
      label: btn.textContent.trim(),
      price: m ? Number(m[1]) : null,
      disabled: btn.disabled,
      rect: { x: r.x + r.width / 2, y: r.y + r.height / 2 },
    }
  })
  if (!info) return null
  const before = await page.evaluate(() => window.__gameStore.getState().fleet.gold)
  if (!info.disabled) {
    await page.mouse.move(info.rect.x, info.rect.y)
    await page.mouse.click(info.rect.x, info.rect.y)
    await sleep(450)
  }
  const after = await page.evaluate(() => window.__gameStore.getState().fleet.gold)
  const bought = await page.evaluate(() => Object.keys(window.__gameStore.getState().routeIntel).length > 0)
  return { ...info, before, after, spent: before - after, bought }
}

const caseOf = async (name, crew, rep) => {
  await page.evaluate(({ crew, rep }) => {
    const s = window.__gameStore.getState()
    window.__gameStore.setState({
      crewRoster: crew.includes('scholar')
        ? [{ id: 'scholar', loyalty: 80, hiredDay: 1 }]
        : [],
      factionRep: { crown: 0, guild: 0, scholars: 0, brethren: 0, ...(rep ? { scholars: rep } : {}) },
      fleet: { ...s.fleet, gold: 500, currentPortId: 21, isSailing: false },
    })
  }, { crew, rep })
  check(await openPlan(), `[${name}] 出航计划弹出`)
  const r = await buyIntel()
  if (!r) { check(false, `[${name}] 找得到「买通老船长」按钮`); return }
  if (name === '无学者') await page.screenshot({ path: `${SHOTS}/intel-price-${'base'}.png` })
  check(r.price !== null, `[${name}] 按钮上写着价钱（「${r.label}」）`)
  check(r.bought, `[${name}] 真的买成了（routeIntel 有记录）`)
  check(r.spent === r.price,
    `[${name}] 屏上 ${r.price} 金 = 实扣 ${r.spent} 金`)
  return r
}

console.log('\n【航线情报价：显示 = 结算】')
const base = await caseOf('无学者', [], 0)
const withScholar = await caseOf('随船学者', ['scholar'], 0)
const withRep = await caseOf('学者公会30', [], 30)
const withBoth = await caseOf('两者都有', ['scholar'], 90)

// 具体金额也钉死：万一有人把 INTEL_COST 改成 100，半价应当是 50 而不是别的
check(base && base.price > 0, `原价 ${base?.price} 金`)
check(withScholar && base && withScholar.price === Math.round(base.price / 2),
  `随船学者 = 半价（${withScholar?.price} = ${base?.price}/2）`)
check(withRep && base && withRep.price === Math.round(base.price / 2),
  `学者公会 30 = 半价（${withRep?.price}）`)
check(withBoth && base && withBoth.price === Math.round(base.price / 2),
  `两个半价不叠加（${withBoth?.price}，不是 ${Math.round(base?.price / 4)}）`)

// 金币刚好够半价时按钮必须可点（原来会被原价 disabled 挡住）
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({
    crewRoster: [{ id: 'scholar', loyalty: 80, hiredDay: 1 }],
    fleet: { ...s.fleet, gold: 40, currentPortId: 21, isSailing: false },
    routeIntel: {}, pendingVoyage: null,
  })
  const g = window.__gameStore.getState()
  g.sailToWaypoint({ latitude: 22.1987, longitude: 113.5439, portId: 18 })
})
await until(() => /出航计划/.test(document.body.innerText), 12000)
await sleep(400)
const edge = await page.evaluate(() => {
  const modal = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /出航计划/.test(x.textContent || ''))
  const btn = modal && [...modal.querySelectorAll('button')].find(b => /买通老船长/.test(b.textContent || ''))
  return btn ? { disabled: btn.disabled, text: btn.textContent.trim() } : null
})
check(!!edge && !edge.disabled,
  `金币 40、学者在船：按钮可点（「${edge?.text ?? '找不到'}」，原实现按 80 判会置灰）`)

check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail ? 1 : 0)
