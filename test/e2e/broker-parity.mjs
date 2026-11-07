// 掮客卡的「N 天 / N 海里」必须与出航计划面板逐字一致（端到端）
//
// 跑法：先起 dev server，再 `node test/e2e/broker-parity.mjs`
//   GAME_URL=...  EDGE_PATH=...  可覆盖默认路径
//
// 【守的是什么】
// 掮客卡是玩家看到的**第一个收益承诺**：「象牙 11→74 · 里斯本 · 17 天 · 2903 海里」。
// 点「买进并起航」就会打开出航计划面板，面板上写着「航程 2903 海里 · 约 17 天可达」。
//
// 第 33 轮实测抓到两处：
//   ① 口径不同——卡片用 calculateSailingDays（**不含天候倍率**），面板用「按部就班 × 天候」。
//      暴风雨里卡片写「13 天」、面板写「约 28 天可达」，差一倍多。
//   ② 掩码没到位时卡上挂的是**大圆直线**：埃尔米纳 → 里斯本 报 2157 海里
//      （横穿撒哈拉），掩码到位后绕开陆地才是 2903 海里，差 35%。
//      而且卡上的数字**不会自己纠正**——它一直挂着那个错的直线里程。
//
// 现在三处（掮客卡 / 交易面板 / 主屏常驻条）用同一条规则：
//   几何没就绪 → 一律不报里程与天数（宁可少一个数字，也不报错数字）；
//   几何就绪 → 报真值，且与出航计划面板逐字相等。
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
// 独立 context：避免同 browser 其它页面写过的 localStorage 让开局遮罩被跳过
const ctx = await browser.createBrowserContext()
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (/favicon|AudioContext|net::ERR_/.test(t)) return
  errors.push('CONSOLE: ' + t.slice(0, 160))
})
await page.setViewport({ width: 1440, height: 900 })

/*
 * 【为什么要拦请求】
 * 「掩码没到位」这个状态在正常加载下只存在一两秒，靠 sleep 赌它必然抓不住。
 * 这里直接把 sea-mask.bin 的请求掐掉——那一档就变成确定性可复现的。
 * 只掐掩码，不掐 land.geojson：geojson 是地图**渲染**要的，
 * 掐了地图会整块报错，掮客卡根本不出现，就测不到「卡在但不报数」这条规则了。
 */
let maskBlocked = false
await page.setRequestInterception(true)
page.on('request', req => {
  if (maskBlocked && /sea-mask\.bin/.test(req.url())) req.abort().catch(() => {})
  else req.continue().catch(() => {})
})

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log('  ✗', msg) } }

const reload = async () => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
  const ok = await page.waitForFunction(
    () => !!(window.__gameStore && window.__mapStore), { timeout: 30000, polling: 100 },
  ).then(() => true).catch(() => false)
  if (!ok) throw new Error('store 调试钩子没挂上（dev 编译失败或页面空白）')
}

/*
 * 【为什么挑埃尔米纳（第 9 港）】
 * 开局在塞维利亚时掮客推的是加的斯：54 海里 / 1 天。
 * 1 天的航程，暴风雨下 ceil(54 ÷ 172.8 ÷ 0.4675) 仍然是 1 天——
 * 新旧口径都报 1 天，**测不出任何东西**。
 * 埃尔米纳推的是里斯本：两千多海里、晴天十几��，差得开。
 */
const setup = (weatherKind) => page.evaluate((wk) => {
  const s = window.__gameStore.getState()
  s.initGame('merchant', 'captain')
  const st = window.__gameStore.getState()
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, gameMode: 'captain',
    dialogueSeen: ['opening_pilot'], currentEvent: null, activePanel: null,
    pendingVoyage: null, waypoint: null, currentRoute: null, routeProgress: 0,
    stance: 'steady', rand: () => 1,
    weather: { ...st.weather, kind: wk },
    fleet: {
      ...st.fleet, currentPortId: 9, isSailing: false,
      food: 100, water: 150, morale: 70,
    },
  })
  window.__mapStore.setState({ viewMode: 'chart', renderMode: '2d' })
}, weatherKind)

/** 读掮客卡：文本 + 「买进并起航」按钮的坐标 */
const readCard = () => page.evaluate(() => {
  const root = document.querySelector('[data-broker-compact="0"]')
  if (!root) return null
  const r = root.getBoundingClientRect()
  const btn = [...root.querySelectorAll('button')].find(b => /买进并起航/.test(b.textContent || ''))
  const br = btn?.getBoundingClientRect()
  return {
    text: (root.textContent || '').replace(/\s+/g, ' ').trim(),
    visible: getComputedStyle(root).display !== 'none' && r.width > 20 && r.height > 10,
    btnPoint: br ? [br.left + br.width / 2, br.top + br.height / 2] : null,
  }
})

/** 等掮客卡出现（可选：必须带里程，用来等几何就绪后的重算） */
const waitCard = (needNm) => page.waitForFunction((need) => {
  const root = document.querySelector('[data-broker-compact="0"]')
  if (!root) return false
  const r = root.getBoundingClientRect()
  if (r.width <= 20 || r.height <= 10) return false
  const t = root.textContent || ''
  if (need && !/海里/.test(t)) return false
  return true
}, { timeout: 20000, polling: 150 }, needNm).then(() => true).catch(() => false)

/** 真的点「买进并起航」，把出航计划面板打开，读它的航程与结论句 */
const clickAndReadPlan = async () => {
  const card = await readCard()
  if (!card?.btnPoint) return { card, plan: null }
  await page.mouse.click(card.btnPoint[0], card.btnPoint[1])
  const shown = await page.waitForFunction(
    () => !!document.querySelector('[data-testid="voyage-verdict-text"]'),
    { timeout: 12000, polling: 100 },
  ).then(() => true).catch(() => false)
  if (!shown) return { card, plan: null }
  const plan = await page.evaluate(() => {
    const verdict = (document.querySelector('[data-testid="voyage-verdict-text"]')?.textContent || '').replace(/\s+/g, ' ').trim()
    const distEl = document.querySelector('[data-testid="voyage-route-distance"]')
    const nm = (distEl?.textContent || '').match(/(\d+) 海里/)
    // 结论句两种形态：
    //   够： 「补给充足 · 约 17 天可达」
    //   不够：「粮食不够——按部就班只够 12 天，这趟要 17 天」
    const dy = verdict.match(/约 (\d+) 天/) || verdict.match(/这趟要 (\d+) 天/)
    return { verdict, nm: nm ? Number(nm[1]) : null, dy: dy ? Number(dy[1]) : null }
  })
  await page.evaluate(() => window.__gameStore.getState().cancelVoyage())
  await sleep(250)
  return { card, plan }
}

const parseCard = (text) => {
  const nm = text.match(/(\d+) 海里/)
  const dy = text.match(/(\d+) 天/)
  const to = text.match(/([\u4e00-\u9fff]{2,6}) · (\d+) 天/)
  return {
    nm: nm ? Number(nm[1]) : null,
    dy: dy ? Number(dy[1]) : null,
    toPort: to ? to[1] : null,
  }
}

/* 把两边的数字并排打出来：对账脚本的价值一半在"它能过"，
 * 一半在"你事后能看见它到底对的是哪两个数"。 */
const showLedger = (label, card, plan) => {
  console.log(
    `  ${label}：卡「${card.toPort ?? '?'} ${card.nm ?? '?'} 海里 / ${card.dy ?? '?'} 天」` +
    ` ↔ 面板「${plan?.nm ?? '?'} 海里 / ${plan?.dy ?? '?'} 天」`,
  )
}

console.log('=== 第 0 轮：掩码拿不到 → 掮客卡不许报里程与天数 ===')
{
  maskBlocked = true
  await reload()
  await setup('clear')
  const appeared = await waitCard(false)
  check(appeared, '掩码拿不到时掮客卡照样出现（利润承诺不该被数据加载拖住）')
  const card0 = await readCard()
  const t0 = card0?.text || ''
  check(!/海里/.test(t0), `掩码没到位时卡上不报里程（实测「${t0.slice(0, 60)}」）`)
  check(!/\d+\s*天/.test(t0), '掩码没到位时卡上不报天数（天数是从那条错的直线航程算出来的）')
  check(await page.evaluate(() => window.__mapStore.getState().landDataReady === false),
    '掩码失败时就绪标志保持 false（置位就等于允许报直线距离）')
}

console.log('=== 晴天：掮客卡 vs 出航计划面板 ===')
let clearDays = null
let clearNm = null
{
  maskBlocked = false
  await reload()
  await setup('clear')
  const geoReady = await page.waitForFunction(
    () => window.__mapStore.getState().landDataReady === true, { timeout: 25000, polling: 100 },
  ).then(() => true).catch(() => false)
  check(geoReady, '掩码到位后就绪标志翻成 true')
  // 等卡片按新几何重算（landDataReady 进依赖 → 自动刷新）
  const appeared = await waitCard(true)
  check(appeared, '几何就绪后掮客卡自己刷新出里程（不会一直挂着旧的直线数字）')

  const run = await clickAndReadPlan()
  const card = parseCard(run.card?.text || '')
  clearDays = card.dy
  clearNm = card.nm
  showLedger('晴天', card, run.plan)
  check(!!run.card && run.card.visible, '掮客卡可见')
  check(card.nm !== null && card.dy !== null,
    `卡上给出里程与天数（${card.nm} 海里 · ${card.dy} 天 → ${card.toPort}）`)
  check(!!run.plan, '点「买进并起航」真的打开了出航计划面板')
  check(!!run.plan && !!run.card && run.plan.nm === card.nm,
    `里程同源（卡 ${card.nm} / 计划 ${run.plan?.nm}）`)
  check(!!run.plan && !!run.card && run.plan.dy === card.dy,
    `天数同源（卡 ${card.dy} / 计划 ${run.plan?.dy}）`)
  check(!!run.plan && run.plan.nm !== null && run.plan.nm > 100,
    `这一趟确实是长途（${run.plan?.nm} 海里）——否则天候那一轮没有区分力`)
  // 反向检查：不能是"大圆直线"那套旧算法（掩码没到位时的退化路径）
  const gc = await page.evaluate(async (name) => {
    const m = await import('/Age-of-Discovery/src/data/ports.ts').catch(() => import('/src/data/ports.ts'))
    const nav = await import('/Age-of-Discovery/src/utils/navigation.ts').catch(() => import('/src/utils/navigation.ts'))
    const st = window.__gameStore.getState()
    const here = m.ports.find(p => p.id === st.fleet.currentPortId)
    const there = m.ports.find(p => p.nameCn === name)
    if (!here || !there) return null
    return Math.round(nav.haversineNm(here.latitude, here.longitude, there.latitude, there.longitude))
  }, card.toPort)
  check(!!gc && !!run.plan && run.plan.nm > gc,
    `报的不是大圆直线（${run.plan?.nm} > 大圆 ${gc}）——那是要横穿陆地的假航程`)
}

console.log('=== 暴风雨：天数必须变多，且仍与面板一致 ===')
{
  await setup('storm')
  const appeared = await waitCard(true)
  check(appeared, '暴风雨下掮客卡照样给出里程')

  const run = await clickAndReadPlan()
  const card = parseCard(run.card?.text || '')
  showLedger('暴风雨', card, run.plan)
  check(!!run.plan, '暴风雨下点「买进并起航」也能打开出航计划面板')
  check(!!card.dy && !!clearDays && card.dy > clearDays,
    `暴风雨里天数必须变多（晴天 ${clearDays} → 暴风雨 ${card.dy}）`)
  check(!!run.plan && run.plan.nm === clearNm,
    `暴风雨下还是同一条航线（${run.plan?.nm} 海里 = 晴天 ${clearNm}）——变的只有天数`)
  check(!!run.plan && run.plan.nm === card.nm,
    `暴风雨下里程仍同源（卡 ${card.nm} / 计划 ${run.plan?.nm}）`)
  check(!!run.plan && run.plan.dy === card.dy,
    `暴风雨下天数仍同源（卡 ${card.dy} / 计划 ${run.plan?.dy}）`)
}

console.log('=== 收尾 ===')
{
  await setup('clear')
  const tail = await readCard()
  check(!!tail, '取消出航后掮客卡回到常态（不是一次性的）')
}
check(errors.length === 0, `无运行时错误（${errors.length} 条：${errors.slice(0, 2).join(' | ')}）`)

console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
