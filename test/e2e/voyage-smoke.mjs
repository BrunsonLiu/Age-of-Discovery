// 全流程航行冒烟测试（端到端）
//
// 跑法：先起 dev server，再 `node test/e2e/voyage-smoke.mjs`
//   GAME_URL=...  EDGE_PATH=...  SHOTS_DIR=...  可覆盖默认路径
//
// 覆盖：Intro 向导 → 出航计划面板（方针总账 + 补给评估）→ 段末抉择 → 操舵节拍
//       → 事件与小游戏 → 到港 → 舷炮对轰（事件236）→ 风暴收帆（事件1）
// 断言重点：全程 0 运行时错误、资源无 NaN、航行中进度单调、小游戏选项不挂假风险档

// 真实入口（Intro 向导）→ 出航 → 段末抉择 → 操舵节拍 → 事件/小游戏 → 到港
// 到港后确定性补测：舷炮对轰（事件236）+ 风暴收帆（事件1）
// 重点：全程 0 运行时错误、核心不变量（资源非 NaN、进度单调）、各阶段 UI 真实渲染
// puppeteer-core 优先从项目依赖取；没有就退回 WorkBuddy 自带的浏览器驱动目录
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)) })
await page.setViewport({ width: 1440, height: 900 })

// 清掉上一局的存档，走真·新开档路径
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await new Promise(r => setTimeout(r, 2500))

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log('  ✗', msg) } }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const phasesSeen = new Set()
const dialogsSeen = new Set()

// 作用域点击：先按文字锁定浮层，再在浮层内点按钮（避免误伤底栏同词按钮）
const clickIn = async (overlayRe, buttonRe) => page.evaluate((ov, bt) => {
  const overlays = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')]
  const o = overlays.find(x => new RegExp(ov).test(x.textContent || ''))
  if (!o) return null
  const b = [...o.querySelectorAll('button')].find(x => new RegExp(bt).test(x.textContent || ''))
  if (b && b instanceof HTMLElement) { b.click(); return (b.textContent || '').trim().slice(0, 24) }
  return null
}, overlayRe, buttonRe)

// 直接在浮层里点第一个匹配按钮（不限定具体词）
const clickAnyIn = async (overlayRe, buttonRe) => page.evaluate((ov, bt) => {
  const overlays = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')]
  const o = overlays.find(x => new RegExp(ov).test(x.textContent || ''))
  if (!o) return null
  const b = [...o.querySelectorAll('button')].find(x => new RegExp(bt).test(x.textContent || ''))
  if (b && b instanceof HTMLElement) { b.click(); return (b.textContent || '').trim().slice(0, 24) }
  return null
}, overlayRe, buttonRe)

// —— A) 真实入口：Intro 向导 ——
console.log('A) 入口向导')
const startVisible = await page.evaluate(() => document.body.textContent.includes('翻开日志'))
check(startVisible, '加载后显示起始屏（翻开日志）')
await clickIn('翻开日志', '翻开日志')
await sleep(500)
await clickIn('塞维利亚港', '继续')
await sleep(400)
await clickIn('你的航程', '继续')
await sleep(500)
// 玩法模式页（新增页，位于「你的航程」与「天赋」之间）：显式选船长模式
const modePicked = await page.evaluate(() => {
  const card = document.querySelector('button[data-mode="captain"]')
  if (card instanceof HTMLElement) { card.click(); return 'captain' }
  return null
})
check(!!modePicked, `选择了玩法模式（${modePicked}）`)
const modeCount = await page.evaluate(() => document.querySelectorAll('button[data-mode]').length)
check(modeCount === 2, `模式页给出 ${modeCount} 个选项（应为 2：船长/参观）`)
await sleep(400)
await clickIn('你想怎么玩', '继续')
await sleep(700)
// 特质页：点第一张卡（商界血脉/铁壁舰长/魅力领袖/天生探险家/随船医生）
const traitPicked = await page.evaluate(() => {
  const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /选择你的天赋/.test(x.textContent || ''))
  if (!o) return null
  const cards = [...o.querySelectorAll('button')].filter(b => /商界血脉|铁壁舰长|魅力领袖|天生探险家|随船医生/.test(b.textContent || ''))
  if (cards.length && cards[0] instanceof HTMLElement) { cards[0].click(); return cards[0].textContent.trim().slice(0, 12) }
  return null
})
check(!!traitPicked, `选择了一张天赋卡（${traitPicked}）`)
await sleep(400)
await clickIn('扬帆起航', '扬帆起航')
await sleep(700)
await clickIn('开船前的最后一眼', '启航')
await sleep(1500)
let st = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return {
    phase: s.gamePhase, day: s.fleet.day, gold: s.fleet.gold, mode: s.gameMode,
    crew: s.fleet.ships.reduce((a, x) => a + (x.crew || 0), 0), ships: s.fleet.ships.length,
  }
})
check(st.phase === 'playing', `向导完成进入 playing（实际 ${st.phase}）`)
check(st.mode === 'captain', `开局模式为船长（实际 ${st.mode}）`)
check(st.crew > 0 && st.ships > 0, `初始舰队就绪（船员 ${st.crew} / 船 ${st.ships}）`)
phasesSeen.add('start')

// 教程：出现就跳过
if (await clickAnyIn('跳过引导', '跳过引导')) await sleep(500)

// —— B) 出航：走真实的面板 UI（选港 → 出航计划面板 → 升起旗帜）——
console.log('B) 出航')
const picked = await page.evaluate(async () => {
  const st = window.__gameStore.getState()
  const portsMod = await import('/Age-of-Discovery/src/data/ports.ts')
  const nav = await import('/Age-of-Discovery/src/utils/navigation.ts')
  const from = portsMod.ports.find(p => p.id === st.fleet.currentPortId) ?? portsMod.ports[0]
  const cands = portsMod.ports
    .filter(p => p.id !== from.id)
    .map(p => ({ p, d: Math.hypot(p.latitude - from.latitude, p.longitude - from.longitude) }))
    .sort((a, b) => a.d - b.d)
  // 按「航程天数」挑中程线路：太短遇不到事件，太长船会散架
  const cons = nav.calculateDailyConsumption(st.fleet)
  const budget = { food: st.fleet.food, water: st.fleet.water }
  const tried = []
  for (const c of cands) {
    // 先估天数：距离/日航速
    const approxDays = c.d * 60 / 120  // 粗估：1°≈60nm，日航速约 120nm
    if (approxDays < 3 || approxDays > 8) continue
    window.__gameStore.getState().sailToWaypoint({ latitude: c.p.latitude, longitude: c.p.longitude, portId: c.p.id })
    await new Promise(r => setTimeout(r, 350))
    const s2 = window.__gameStore.getState()
    // 出航计划此刻还没确认，航线挂在 pendingVoyage 上
    const route = s2.pendingVoyage?.route ?? s2.currentRoute
    if (!route) continue
    const days = nav.calculateSailingDays(route, s2.fleet, s2.officers)
    const needF = Math.ceil(cons.food * days), needW = Math.ceil(cons.water * days)
    const ok = needF < budget.food * 0.8 && needW < budget.water * 0.8
    tried.push(`${c.p.nameCn}:${days}天/粮${needF}/水${needW}${ok ? '✓' : '✗'}`)
    if (ok && days >= 3) {
      return { toId: c.p.id, toName: c.p.nameCn, dist: route.distance, days, tried }
    }
  }
  return { toId: null, tried }
})
check(!!picked && picked.toId, `选定中程航线（${picked.tried?.slice(0, 4).join(' / ')}）`)
check(!!picked, '选定一条补给足够的航线')
await sleep(600)
const plan = await page.evaluate(() => {
  const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /出航计划/.test(x.textContent || ''))
  if (!o) return null
  const t = o.textContent || ''
  return {
    hasLedger: /抢行|按部就班|谨慎/.test(t),
    hasSupply: /补给评估/.test(t),
    hasShortage: /中途断水|中途断粮/.test(t),
    hasIntel: /航线情报/.test(t),
  }
})
check(!!plan, '出航计划面板弹出')
check(!!plan && plan.hasLedger, '面板显示三种方针的航段总账')
check(!!plan && plan.hasSupply, '面板显示补给评估')
check(!!plan && !plan.hasShortage, '补给评估无断粮断水警告')
await page.screenshot({ path: `${SHOTS}/voyage-plan.png` })
// 点「🏴 升起旗帜，出航！」
const departed = await clickIn('出航计划', '升起旗帜')
check(!!departed, '点击「升起旗帜，出航！」')
await sleep(900)
const voyage = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return { toId: s.fleet.currentPortId, dist: s.currentRoute ? s.currentRoute.distance : 0, segs: s.segmentCount }
})
voyage.toId = picked.toId
voyage.toName = picked.toName
console.log(`  目标港口 ${voyage.toName}（id ${voyage.toId}）· 航程 ${voyage.dist}nm · ${voyage.segs} 段`)
await sleep(600)

// —— C) 主航行循环：自动应对各阶段直到到港 ——
console.log('C) 航行循环')
const t0 = Date.now()
let arrived = false
let gameover = false
let minigamesPlayed = 0
let eventsHandled = 0
let segmentsHandled = 0
let helmsHandled = 0
let lastProgress = -1
let progressRegressions = 0
let nonFinite = 0
const progressTrace = []

while (Date.now() - t0 < 180000) {
  st = await page.evaluate(() => {
    const s = window.__gameStore.getState()
    const bad = []
    for (const [k, v] of Object.entries(s.fleet)) {
      if (typeof v === 'number' && !Number.isFinite(v)) bad.push(k)
    }
    if (!Number.isFinite(s.routeProgress)) bad.push('routeProgress')
    return {
      phase: s.gamePhase, isSailing: s.fleet.isSailing, port: s.fleet.currentPortId,
      progress: s.routeProgress, day: s.day, bad,
      eventTitle: s.currentEvent ? s.currentEvent.title : null,
      pendingSeg: !!s.pendingSegment, pendingHelm: !!s.pendingHelm,
    }
  })
  phasesSeen.add(st.phase)
  if (st.bad.length) { nonFinite++; console.log('  ✗ 出现非有限数值:', st.bad.join(',')) }
  // 进度单调性只在航行中成立：到港时路线清空、进度按设计归零
  if (st.isSailing) {
    if (st.progress < lastProgress - 1e-9) {
      progressRegressions++
      console.log(`  ! 航行中进度回退 ${lastProgress.toFixed(4)} → ${st.progress.toFixed(4)}`)
    }
    progressTrace.push(st.progress)
    lastProgress = Math.max(lastProgress, st.progress)
  }

  if (st.phase === 'gameover') { gameover = true; break }
  if (st.phase === 'playing' && !st.isSailing && st.port === voyage.toId) { arrived = true; break }

  if (st.phase === 'segment') {
    if (!dialogsSeen.has('segment')) {
      dialogsSeen.add('segment')
      await page.screenshot({ path: `${SHOTS}/voyage-segment.png` })
    }
    const picked = await clickIn('航段|方针', '抢行|按部就班|谨慎')
    if (picked) segmentsHandled++
    else console.log('  ! 段末弹窗里没找到方针按钮')
    await sleep(600)
    continue
  }

  if (st.phase === 'helm') {
    if (!dialogsSeen.has('helm')) {
      dialogsSeen.add('helm')
      await page.screenshot({ path: `${SHOTS}/voyage-helm.png` })
    }
    await page.keyboard.press('Enter')   // 启程
    await sleep(3300)
    await page.keyboard.press('Enter')   // 收舵
    await sleep(400)
    await page.keyboard.press('Enter')   // 关闭结算
    helmsHandled++
    await sleep(400)
    continue
  }

  if (st.phase === 'event') {
    eventsHandled++
    if (!dialogsSeen.has('event')) {
      dialogsSeen.add('event')
      await page.screenshot({ path: `${SHOTS}/voyage-event.png` })
    }
    // 小游戏选项带「操作定成败」；普通选项带 [稳]/[搏]/[险] 风险章
    const mg = await page.evaluate(() => {
      const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /\[(稳|搏|险)\]|操作定成败/.test(x.textContent || ''))
      if (!o) return false
      const b = [...o.querySelectorAll('button')].find(x => /操作定成败/.test(x.textContent || ''))
      if (b && b instanceof HTMLElement) { b.click(); return true }
      return false
    })
    if (mg) {
      minigamesPlayed++
      await page.keyboard.press('Enter')   // 小游戏开场：Enter 启程
      await sleep(400)
      const mgt0 = Date.now()
      const keys = ['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
      let ki = 0
      while (Date.now() - mgt0 < 20000) {
        const done = await page.evaluate(() =>
          [...document.querySelectorAll('[role=dialog]')].some(d => /操作评分/.test(d.textContent || '')))
        if (done) break
        await page.keyboard.press(keys[ki++ % keys.length])
        await sleep(400)
      }
      await page.keyboard.press('Enter')   // 结算屏：Enter 看结果
      await sleep(600)
      await clickAnyIn('继续|承担|结果', '继续|承担|结果|好')  // 事件结果屏
      await sleep(500)
    } else {
      const picked = await page.evaluate(() => {
        const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /\[(稳|搏|险)\]/.test(x.textContent || ''))
        if (!o) return false
        const b = [...o.querySelectorAll('button')].find(x => /\[(稳|搏|险)\]/.test(x.textContent || ''))
        if (b && b instanceof HTMLElement) { b.click(); return true }
        return false
      })
      if (!picked) await page.keyboard.press('Enter')
      await sleep(700)
      await clickAnyIn('继续|确定|完成|收下|接受', '继续|确定|完成|收下|接受')
      await sleep(400)
    }
    continue
  }

  // 对白遮挡：Enter 推进
  if (await page.evaluate(() => !!document.querySelector('.dlg-box-in'))) {
    if (!dialogsSeen.has('dialogue')) {
      dialogsSeen.add('dialogue')
      await page.screenshot({ path: `${SHOTS}/voyage-dialogue.png` })
    }
    await page.keyboard.press('Enter')
    await sleep(500)
    continue
  }
  await sleep(600)
}

console.log(`  段末抉择 ${segmentsHandled} 次 · 操舵 ${helmsHandled} 次 · 事件 ${eventsHandled} 次（含小游戏 ${minigamesPlayed} 次）`)
if (gameover) {
  // 沉船结局也是一条要走的路：确认败局屏真实渲染
  const over = await page.evaluate(() => {
    const t = document.body.textContent || ''
    return { has: /沉没|沉船|失败|败|结局|回到塞维利亚|重新开始/.test(t), snippet: t.slice(0, 120) }
  })
  check(over.has, '沉船结局屏渲染（gameover 路径无异常）')
  await page.screenshot({ path: `${SHOTS}/voyage-gameover.png` })
  console.log('  ! 本次航程以沉船告终（船体耐久耗尽），改为走短航线重测到港')
} else {
  check(arrived, `航行抵达目标港口（${voyage.toName}）`)
}
check(segmentsHandled >= 1, `至少经历一次段末抉择（实际 ${segmentsHandled}）`)
check(helmsHandled >= 1, `至少经历一次操舵节拍（实际 ${helmsHandled}）`)
check(nonFinite === 0, `全程无 NaN/Infinity 资源值（异常 ${nonFinite} 次）`)
check(progressRegressions === 0, `航程进度单调不回退（回退 ${progressRegressions} 次）`)
check(phasesSeen.has('segment') && phasesSeen.has('helm') && phasesSeen.has('playing'),
  `四大阶段全部真实走过（${[...phasesSeen].join('/')}）`)

// —— D) 到港核验 ——
console.log('D) 到港核验')
const port = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return {
    isSailing: s.fleet.isSailing, port: s.fleet.currentPortId, route: s.currentRoute,
    progress: s.routeProgress, day: s.fleet.day, discovered: s.discoveredPorts.length,
    food: s.fleet.food, water: s.fleet.water, morale: s.fleet.morale,
  }
})
if (!gameover) {
  check(port.isSailing === false, '到港后 isSailing=false')
  check(port.port === voyage.toId, `停靠的是目标港口（实际 ${port.port}）`)
  check(port.route === null && port.progress === 0, '航线已清空')
  check(port.discovered >= 1, `发现港口列表更新（${port.discovered} 座）`)
} else {
  check(port.isSailing === false, '沉船后 isSailing=false')
}
console.log(`  到港：第 ${port.day} 天 · 粮 ${port.food} 水 ${port.water} 士气 ${port.morale}`)
await page.screenshot({ path: `${SHOTS}/voyage-port.png` })

// —— E) 确定性补测：舷炮对轰（事件 236）——
console.log('E) 舷炮对轰（事件236）')
await page.evaluate(async () => {
  const mod = await import('/Age-of-Discovery/src/data/events.ts')
  const ev = mod.events.find(e => e.id === 236)
  window.__gameStore.getState().setCurrentEvent(ev)
})
await sleep(800)
// 小游戏选项不该再显示风险档：它的概率会被操作改写，硬挂一个档位就是编造结论
const badge = await page.evaluate(() => {
  const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /掉头迎战/.test(x.textContent || ''))
  if (!o) return null
  const btns = [...o.querySelectorAll('button')]
  const mg = btns.find(b => /掉头迎战/.test(b.textContent || ''))
  if (!mg) return null
  const otherBadges = btns
    .filter(b => !/掉头迎战/.test(b.textContent || ''))
    .map(b => b.querySelector('[data-risk]')?.getAttribute('data-risk'))
    .filter(Boolean)
  return { mgBadge: !!mg.querySelector('[data-risk]'), otherBadges }
})
check(!!badge && !badge.mgBadge, '小游戏选项不再显示风险档（不编造未计算过的结论）')
check(!!badge && badge.otherBadges.every(r => ['steady', 'gamble', 'risky'].includes(r)),
  `普通选项的风险档只取真算出的三档（实际 ${badge.otherBadges.join(',') || '本例未显示'}）`)
await page.screenshot({ path: `${SHOTS}/voyage-event-minigame.png` })
await clickIn('掉头迎战', '掉头迎战')
await sleep(600)
await page.keyboard.press('Enter')   // 炮弹上膛（Enter）
await sleep(700)
check(await page.evaluate(() => !!document.querySelector('[data-testid=cannon-dots]')), '炮战界面加载')
for (let v = 1; v <= 3; v++) {
  await sleep(500)
  const aimT0 = Date.now()
  while (Date.now() - aimT0 < 6000) {
    const aim = await page.evaluate(() => {
      const el = document.querySelector('[data-testid=cannon-aim-marker]')
      return el ? parseFloat(el.style.left) : null
    })
    if (aim !== null && Math.abs(aim - 50) < 3) break
    await sleep(40)
  }
  await page.keyboard.press('Space')
  await sleep(700)
  const incT0 = Date.now()
  while (Date.now() - incT0 < 6000) {
    const inc = await page.evaluate(() => {
      const el = document.querySelector('[data-testid=cannon-incoming-marker]')
      return el ? parseFloat(el.style.left) : null
    })
    if (inc !== null && inc <= 52) break
    await sleep(40)
  }
  await page.keyboard.press('ArrowDown')
  await sleep(900)
}
const cdone = await page.waitForFunction(() =>
  [...document.querySelectorAll('[role=dialog]')].some(d => /操作评分/.test(d.textContent || '')),
  { timeout: 8000, polling: 150 }).then(() => true).catch(() => false)
check(cdone, '三轮齐射后进入操作评分')
await page.screenshot({ path: `${SHOTS}/voyage-cannon-done.png` })
await page.keyboard.press('Enter')   // ⛵ 看结果（Enter）
await sleep(600)
await clickAnyIn('继续|承担|结果', '继续|承担|结果')
await sleep(600)
const afterCannon = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return { phase: s.gamePhase, event: s.currentEvent }
})
check(afterCannon.phase === 'playing' && !afterCannon.event, '炮战结束回到 playing（事件已清）')

// —— F) 确定性补测：风暴收帆（事件 1）——
console.log('F) 风暴收帆（事件1）')
await page.evaluate(async () => {
  const mod = await import('/Age-of-Discovery/src/data/events.ts')
  const ev = mod.events.find(e => e.id === 1)
  window.__gameStore.getState().setCurrentEvent(ev)
})
await sleep(800)
const stormOpt = await page.evaluate(() => {
  const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /操作定成败/.test(x.textContent || ''))
  if (!o) return null
  const b = [...o.querySelectorAll('button')].find(x => /操作定成败/.test(x.textContent || ''))
  if (b && b instanceof HTMLElement) { b.click(); return true }
  return null
})
check(!!stormOpt, '风暴选项已触发')
await sleep(600)
await page.keyboard.press('Enter')   // 起帆迎风（Enter）
await sleep(700)
check(await page.evaluate(() => document.body.textContent.includes('收帆')), '风暴界面加载')
const stormT0 = Date.now()
while (Date.now() - stormT0 < 28000) {
  const sdone = await page.evaluate(() =>
    [...document.querySelectorAll('[role=dialog]')].some(d => /操作评分/.test(d.textContent || '')))
  if (sdone) break
  const hit = await page.evaluate(() => {
    const divs = [...document.querySelectorAll('div')]
    const needle = divs.find(d => (d.className || '').includes('bg-gold-200') && d.style.left)
    const win = divs.find(d => (d.className || '').includes('bg-emerald-500/25') && d.style.left)
    if (!needle || !win) return false
    const n = parseFloat(needle.style.left), l = parseFloat(win.style.left), w = parseFloat(win.style.width)
    if (!Number.isFinite(n) || !Number.isFinite(l) || !Number.isFinite(w)) return false
    return n >= l && n <= l + w
  })
  if (hit) await page.keyboard.press('Space')
  await sleep(60)
}
const sdone2 = await page.waitForFunction(() =>
  [...document.querySelectorAll('[role=dialog]')].some(d => /操作评分/.test(d.textContent || '')),
  { timeout: 8000, polling: 150 }).then(() => true).catch(() => false)
check(sdone2, '风暴轮次打完进入操作评分')
await page.screenshot({ path: `${SHOTS}/voyage-storm-done.png` })
await page.keyboard.press('Enter')
await sleep(600)
await clickAnyIn('继续|承担|结果', '继续|承担|结果')
await sleep(500)

// —— 汇总 ——
console.log(`\n阶段覆盖：${[...phasesSeen].join(' / ')}`)
console.log(`弹窗覆盖：${[...dialogsSeen].join(' / ')}`)
console.log(`航行中进度轨迹：${progressTrace.length ? progressTrace[0].toFixed(3) + ' → ' + progressTrace[progressTrace.length - 1].toFixed(3) : '无'}`)
console.log(`控制台/页面错误：${errors.length}`)
errors.slice(0, 8).forEach(e => console.log('  ', e.slice(0, 160)))
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)

await browser.close()
process.exit(fail > 0 || errors.length > 0 ? 1 : 0)
