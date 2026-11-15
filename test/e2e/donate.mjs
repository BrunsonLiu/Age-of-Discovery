// 学者 60 档「报呈发现物」：在学者港把已拾到的遗物报呈公会，换名号（60 档翻倍）
//
// 【这套要证明的四件事】
//   ① 只在学者港出现（里斯本/广州），别的港连这块都没有；
//   ② 屏上写的名号 = 实际加的名号（+6 / +12），而且**金币一分不动**
//      —— 这一作不扩展金钱玩法，报酬是名，不是钱；
//   ③ 同样的东西不能报呈两次（账在状态里，不靠册子数页数）；
//   ④ 报呈之后册子里真的多一页「公会档案」（叙事回执，不是只有一条会消失的横幅）。
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'

let pass = 0
const fails = []
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) }
  else { fails.push(msg); console.log('  ✗ FAIL:', msg) }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const until = async (fn, timeout = 10000, ...args) => {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (await page.evaluate(fn, ...args).catch(() => false)) return true
    await sleep(80)
  }
  return false
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 140)) })
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 30000 })
await page.evaluate(() => {
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false,
    dialogueSeen: ['opening_pilot'], activePanel: null,
    logbook: [], claimedVictories: [], collectedDebris: [],
  })
  const d = window.__dialogueStore
  for (let i = 0; i < 8 && d?.getState?.().scriptId; i++) d.getState().skip()
})
await sleep(600)

/** 找一座学者港 / 一座非学者港（归属只认 portFaction，不写死 id） */
const portsInfo = await page.evaluate(async () => {
  const f = await import('/Age-of-Discovery/src/data/factions.ts').catch(() => import('/src/data/factions.ts'))
  const p = await import('/Age-of-Discovery/src/data/ports.ts').catch(() => import('/src/data/ports.ts'))
  const r = await import('/Age-of-Discovery/src/data/relics.ts').catch(() => import('/src/data/relics.ts'))
  return {
    scholar: p.ports.filter(x => f.portFaction(x.id) === 'scholars').map(x => ({ id: x.id, name: x.nameCn })),
    other: p.ports.filter(x => f.portFaction(x.id) !== 'scholars').slice(0, 3).map(x => ({ id: x.id, name: x.nameCn })),
    relics: r.RELICS.slice(0, 2).map(x => ({ id: x.id, name: x.name })),
  }
})
check(portsInfo.scholar.length >= 1, `有学者港（${portsInfo.scholar.map(p => p.name).join('、')}）`)
const HP = portsInfo.scholar[0]

/** 摆状态：停在某港、有多少遗物、报呈过哪些、声望多少 */
const setup = (o) => page.evaluate(async (opt) => {
  const st = window.__gameStore.getState()
  window.__gameStore.setState({
    collectedRelics: opt.collected,
    donatedRelics: opt.donated ?? [],
    logbook: [],
    factionRep: { crown: 0, guild: 0, scholars: opt.rep, brethren: 0 },
    activePanel: null,
    fleet: { ...st.fleet, currentPortId: opt.portId, isSailing: false, fame: 100, gold: 500 },
  })
  // 真入口：右侧栏「港口」按钮
  await new Promise(r => setTimeout(r, 50))
  window.__gameStore.getState().setActivePanel('port')
  return true
}, o)

/** 读报呈那一块：行文字、按钮位置与命中情况 */
const readBlock = () => page.evaluate(() => {
  const box = document.querySelector('[data-service-anchor="donate"]')
  if (!box) return null
  const btn = box.querySelector('[data-testid="donate-submit"]')
  let hit = null
  if (btn) {
    const r = btn.getBoundingClientRect()
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    hit = {
      x: r.left + r.width / 2, y: r.top + r.height / 2,
      self: !!top && (top === btn || btn.contains(top)),
      under: top ? `${top.tagName}.${String(top.className).slice(0, 20)}` : 'null',
    }
  }
  return {
    text: (box.textContent || '').replace(/\s+/g, ' ').trim(),
    hasBtn: !!btn,
    hit,
  }
})

/* ───────── 1. 只在学者港出现 ───────── */
console.log('=== 只在学者港 ===')
await setup({ portId: portsInfo.other[0].id, collected: portsInfo.relics.map(r => r.id), rep: 0 })
await until(() => !!document.querySelector('[data-service-anchor="port-main"]') || !!document.body.innerText.includes('在城里'), 10000)
await sleep(500)
check((await readBlock()) === null,
  `非学者港（${portsInfo.other[0].name}）没有「公会登记」这一块`)

/* ───────── 2. 屏上的名号 = 实加的，且金币不动 ───────── */
console.log('=== 未到 60 档：+6 ===')
await setup({ portId: HP.id, collected: portsInfo.relics.map(r => r.id), rep: 0 })
check(await until(() => !!document.querySelector('[data-testid="donate-submit"]'), 10000),
  `学者港（${HP.name}）出现「公会登记」，并且有报呈按钮`)
{
  const b = await readBlock()
  check(!!b && /公报登记|公会登记/.test(b.text), '标题是「公会登记」')
  check(!!b && /可报呈 2 件/.test(b.text), `写出可报呈几件（${b?.text.slice(0, 40)}…）`)
  check(!!b && /名号 \+6/.test(b.text), '屏上写的是 +6（声望 0）')
  check(!!b && /声望到 60 后名号翻倍/.test(b.text), '没到档时明说"到 60 后翻倍"')
  /*
   * 命中测试必须在**滚进视野之后**做：港口面板是一长条，
   * 报呈区常常落在视口下方，`elementFromPoint` 那时返回 null（不是被遮挡，是不在屏幕上）。
   * 第一版先测后滚，报了一条"命中 null"的假红。
   */
  await page.evaluate(() => document.querySelector('[data-testid="donate-submit"]')?.scrollIntoView({ block: 'center' }))
  await sleep(300)
  const b2 = await readBlock()
  check(b2?.hit?.self === true, `滚进视野后，按钮中心命中自己（${b2?.hit?.under}）`)
  const goldBefore = await page.evaluate(() => window.__gameStore.getState().fleet.gold)
  if (b2?.hit) await page.mouse.click(b2.hit.x, b2.hit.y)
  await sleep(600)
  const st = await page.evaluate(() => {
    const g = window.__gameStore.getState()
    return { fame: g.fleet.fame, gold: g.fleet.gold, donated: g.donatedRelics, log: g.logbook.map(e => e.id) }
  })
  check(st.fame === 106, `名号 100 → ${st.fame}（屏上写 +6）`)
  check(st.gold === goldBefore, `金币没动（${goldBefore} → ${st.gold}）`)
  check(st.donated.length === 1, `账上记了 1 件（${st.donated.join(',')}）`)
  check(st.log.includes(`donate-${portsInfo.relics[0].id}`),
    `册子里多了一页「公会档案」（${st.log.filter(x => x.startsWith('donate-')).join(',')}）`)
}

/* ───────── 3. 同一件不能报呈两次 ───────── */
console.log('=== 不可重复 ===')
{
  const b = await readBlock()
  check(!!b && /可报呈 1 件/.test(b.text), `报呈一件之后只剩 1 件可报（${b?.text.slice(0, 30)}…）`)
  check(!!b && /已登记 1\/2/.test(b.text), '写出"已登记 1/2"')
  await page.evaluate(() => document.querySelector('[data-testid="donate-submit"]')?.scrollIntoView({ block: 'center' }))
  await sleep(250)
  const b2 = await readBlock()
  if (b2?.hit) await page.mouse.click(b2.hit.x, b2.hit.y)
  await sleep(600)
  const st = await page.evaluate(() => {
    const g = window.__gameStore.getState()
    return { fame: g.fleet.fame, donated: g.donatedRelics }
  })
  check(st.donated.length === 2 && st.fame === 112, `第二件也报呈了（名号 ${st.fame}）`)
  check(st.donated[0] !== st.donated[1], `两件不是同一件（${st.donated.join(' / ')}）`)
  const b3 = await readBlock()
  check(!!b3 && /都已经登记过了/.test(b3.text), `两件都报完了 → 面板改口（${b3?.text.slice(0, 30)}…）`)
  check(b3?.hasBtn === false, '没有可报呈的时候按钮不再出现（不留一个按了没反应的钮）')
}

/* ───────── 4. 60 档：+12 ───────── */
console.log('=== 60 档翻倍 ===')
await setup({ portId: HP.id, collected: portsInfo.relics.map(r => r.id), rep: 60 })
check(await until(() => !!document.querySelector('[data-testid="donate-submit"]'), 10000), '声望 60 时按钮还在')
{
  const b = await readBlock()
  check(!!b && /名号 \+12/.test(b.text), `屏上写 +12（${b?.text.slice(0, 60)}…）`)
  check(!!b && /名号翻倍（\+6 → \+12）/.test(b.text), '明说这是 60 档的翻倍')
  await page.evaluate(() => document.querySelector('[data-testid="donate-submit"]')?.scrollIntoView({ block: 'center' }))
  await sleep(250)
  const b2 = await readBlock()
  if (b2?.hit) await page.mouse.click(b2.hit.x, b2.hit.y)
  await sleep(600)
  const fame = await page.evaluate(() => window.__gameStore.getState().fleet.fame)
  check(fame === 112, `名号 100 → ${fame}（+12）`)
}

/* ───────── 5. 没拾到东西：写清"捞起来才算数" ───────── */
console.log('=== 手上没有发现物 ===')
await setup({ portId: HP.id, collected: [], rep: 60 })
await sleep(600)
{
  const b = await readBlock()
  check(!!b && /捞起来才算数/.test(b.text), `没有可报呈时写的是"捞起来才算数"（${b?.text.slice(0, 40)}…）`)
  check(b?.hasBtn === false, '这种情况下不挂按钮')
}

check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)

console.log(`\n最终结果：${pass} 通过 / ${fails.length} 失败`)
if (fails.length) { console.log('失败项：'); fails.forEach(f => console.log('  ·', f)) }
await browser.close()
process.exit(fails.length ? 1 : 0)
