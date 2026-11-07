// 参观模式：模式页承诺「没有教学、不会输、可以什么都不做」，这三条是不是真的。
//
// 跑法：先起 dev server，再 `node test/e2e/visitor-mode.mjs`
//
// 【为什么单独一个脚本】参观模式的差别全在"看不见的地方"：
//   · 没有教程（tutorialStep 直接 -1）
//   · 不扣粮水、船体耐久下限 1、不判 gameover
//   · 不进航段方针环节（pendingSegment = null，直接 playing）
// 这些都没法靠"看着对"验证。而模式选择页上是**明写着**"不会输：断粮沉船都与你无关"，
// 破了就是界面在撒谎——所以要用"把局面推到必死"的方式实测，并拿船长模式当对照组，
// 证明这组条件确实有区分力（否则测试可能只是测了个寂寞）。
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
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 160)) })
await page.setViewport({ width: 1440, height: 900 })

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) } }
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** 走真实开局：翻日志 → 叙事页继续 → 选模式 → 模式页继续 → 选天赋 → 启航 */
async function boot(mode) {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(700)
  const clickText = async (txt) => page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim().includes(t))
    if (!b) return false
    const r = b.getBoundingClientRect()
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    if (!el || (el !== b && !b.contains(el))) return false
    b.click()
    return true
  }, txt)
  await clickText('翻开日志'); await sleep(520)
  await clickText('继续'); await sleep(520)
  await page.evaluate(m => document.querySelector(`button[data-mode="${m}"]`)?.click(), mode)
  await sleep(350)
  await clickText('继续'); await sleep(620)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /商界血脉|铁壁舰长/.test(x.textContent || ''))
    if (b) b.click()
  })
  await sleep(350)
  await clickText('启航'); await sleep(1500)
  // 开场致辞在两种模式下都会播（教学之前），点完才自由
  for (let i = 0; i < 12; i++) {
    if (!(await page.evaluate(() => window.__dialogueStore?.getState?.().scriptId ?? null))) break
    await page.mouse.click(720, 760)
    await sleep(380)
  }
  await sleep(400)
}

// ---------------- 1. 参观模式：没有教学，但界面完全可用 ----------------
console.log('\n1) 参观模式进游戏')
await boot('visitor')
const s1 = await page.evaluate(() => {
  const st = window.__gameStore.getState()
  const btns = [...document.querySelectorAll('button')].filter(b => {
    const r = b.getBoundingClientRect()
    const cs = getComputedStyle(b)
    return r.width > 8 && r.height > 8 && cs.display !== 'none' && cs.visibility !== 'hidden'
  })
  const clickable = btns.filter(b => {
    const r = b.getBoundingClientRect()
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return el && (el === b || b.contains(el))
  })
  return {
    mode: st.gameMode, phase: st.gamePhase, tutorial: st.tutorialStep,
    visible: btns.length, clickable: clickable.length,
    hasTutorial: document.body.innerText.includes('下一步'),
    hasBroker: /掮客|买进并起航/.test(document.body.innerText),
    badge: (() => {
      const b = document.querySelector('[data-testid="visitor-badge"]')
      if (!b) return null
      const r = b.getBoundingClientRect()
      return {
        text: (b.textContent || '').trim(),
        w: Math.round(r.width), h: Math.round(r.height),
        cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2),
      }
    })(),
  }
})
check(s1.mode === 'visitor', `模式确实是参观（${s1.mode}）`)
check(s1.tutorial === -1 || s1.tutorial == null, `没有教程（tutorialStep=${s1.tutorial}）`)
check(!s1.hasTutorial, '屏幕上没有「下一步」这种教学遮罩')
check(s1.clickable >= s1.visible * 0.9, `界面几乎全部可点（${s1.clickable}/${s1.visible}），没有全屏遮罩挡着`)
check(s1.hasBroker, '有掮客卡——"下一步做什么"不用自己猜')
check(!!s1.badge, `顶栏有「${s1.badge?.text}」标识（模式身份看得见）`)
await page.screenshot({ path: `${SHOTS}/visitor-mode.png` })

// ---------------- 2. 徽标点开就是模式说明 ----------------
console.log('\n2) 「参观」徽标 → 帮助里的模式说明')
if (s1.badge) {
  const before = await page.evaluate(() => window.__gameStore.getState().showHelp)
  await page.mouse.click(s1.badge.cx, s1.badge.cy)
  await sleep(700)
  const after = await page.evaluate(() => ({
    help: window.__gameStore.getState().showHelp,
    hasSwitch: /换个玩法|重置/.test(document.body.innerText),
    saysVisitor: /参观模式/.test(document.body.innerText),
  }))
  check(before === false && after.help === true, '点徽标真的打开了帮助（不是装饰）')
  check(after.saysVisitor, '帮助里写明当前是参观模式')
  check(after.hasSwitch, '帮助里给出了"换个玩法"的入口（选错能改）')
  await page.keyboard.press('Escape'); await sleep(400)
} else {
  check(false, '没有徽标，跳过点击验证')
}

// ---------------- 3. 承诺：不会输 ----------------
console.log('\n3) 「不会输」实测：断粮断水士气0 推 10 天')
const wreck = (mode) => page.evaluate((mode) => {
  const g = window.__gameStore
  const st = g.getState()
  g.setState({
    gameMode: mode,
    gamePhase: 'playing',
    tutorialStep: -1,
    activePanel: null,
    showHelp: false,
    dialogueSeen: ['opening_pilot'],
    fleet: {
      ...st.fleet,
      day: 1, food: 0, water: 0, morale: 0, isSailing: true,
      ships: st.fleet.ships.map((s, i) => ({ ...s, durability: i === 0 ? 0 : s.durability })),
    },
  })
}, mode)
const advance = async (days) => {
  for (let i = 0; i < days * 2; i++) {
    const phase = await page.evaluate(() => window.__gameStore.getState().gamePhase)
    if (phase === 'gameover') return
    // 事件卡会暂停推进（phase='event'）——这是正常状态，不是翻船。
    // 真实玩家会选一个，这里点第一个可点的选项继续。
    if (phase === 'event') {
      const picked = await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button')].filter(b => {
          const r = b.getBoundingClientRect()
          return r.width > 40 && r.height > 20
        })
        const b = btns.find(x => /继续|迎上去|稳妥|绕开|拼|撤/.test(x.textContent || ''))
        if (b) { b.click(); return true }
        return false
      })
      await sleep(380)
      if (!picked) return
      continue
    }
    await page.evaluate(() => window.__gameStore.getState().advanceDay?.())
    await sleep(110)
  }
}
const snap = () => page.evaluate(() => {
  const s = window.__gameStore.getState()
  return {
    phase: s.gamePhase, day: s.fleet.day, food: s.fleet.food, water: s.fleet.water,
    morale: s.fleet.morale, alive: s.fleet.ships.filter(x => x.durability > 0).length,
    minDur: Math.min(...s.fleet.ships.map(x => x.durability)),
  }
})

await wreck('visitor'); await sleep(350)
const v0 = await snap()
await advance(10)
const v1 = await snap()
check(v1.phase !== 'gameover', `参观模式没翻船（phase=${v1.phase}，推到第 ${v1.day} 天）`)
check(v1.day > v0.day, `天数真的推进了（${v0.day} → ${v1.day}）——不是"没跑起来"的假绿`)
check(v1.alive >= 1, `至少一条船还在（${v1.alive} 条，最低耐久 ${v1.minDur}，下限 1 生效）`)

// 对照组：同样的烂摊子，船长模式必须翻船
await wreck('captain'); await sleep(350)
await advance(10)
const c1 = await snap()
check(c1.phase === 'gameover',
  `船长模式同样条件下翻船（phase=${c1.phase}）—— 证明这组条件有区分力，不是空测`)

// ---------------- 4. 手机上也要看得见「参观」，且不许把时间轴挤没 ----------------
console.log('\n4) 390 宽手机顶栏')
await page.setViewport({ width: 390, height: 844 })
await page.evaluate(() => {
  window.__gameStore.setState({ activePanel: null, showHelp: false, gameMode: 'visitor', tutorialStep: -1, gamePhase: 'playing' })
  window.__dialogueStore?.getState?.().skip?.()
})
await sleep(900)
const phone = await page.evaluate(() => {
  const badge = document.querySelector('[data-testid="visitor-badge"]')
  const bar = document.querySelector('.wood-beam')
  const track = bar?.querySelector('.flex-1')
  const nameEl = bar ? [...bar.children].find(el => /text-gold-400 font-serif/.test(String(el.className))) : null
  const r = badge?.getBoundingClientRect()
  return {
    badgeW: r ? Math.round(r.width) : 0,
    badgeVisible: !!r && r.width > 8 && getComputedStyle(badge).display !== 'none',
    badgeInBar: !!badge && !!bar && bar.contains(badge),
    trackW: track ? Math.round(track.getBoundingClientRect().width) : 0,
    nameDisplay: nameEl ? getComputedStyle(nameEl).display : null,
    barOverflow: bar ? Math.round(bar.getBoundingClientRect().right - window.innerWidth) : 0,
  }
})
check(phone.badgeVisible && phone.badgeInBar, `手机上「参观」徽标可见（${phone.badgeW}px 宽，在顶栏内）`)
// 改前实测轨道只有 50px：15 个历史刻线挤成一团，等于装饰
check(phone.trackW >= 100, `时间轴轨道 ≥100px（实测 ${phone.trackW}px；让位前只有 50px）`)
check(phone.nameDisplay === 'none', '手机收起了「事件名」那格（130px 让给轨道与徽标）')
check(phone.barOverflow <= 0, `顶栏没有横向溢出（右边缘超出 ${phone.barOverflow}px）`)
// 手机上的徽标也得真能点开帮助
const phBadge = await page.evaluate(() => {
  const b = document.querySelector('[data-testid="visitor-badge"]')
  if (!b) return null
  const r = b.getBoundingClientRect()
  return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) }
})
if (phBadge) {
  await page.mouse.click(phBadge.cx, phBadge.cy)
  await sleep(700)
  const opened = await page.evaluate(() => window.__gameStore.getState().showHelp)
  check(opened === true, '手机点徽标也能打开帮助')
  await page.keyboard.press('Escape'); await sleep(300)
}

check(errors.length === 0, `全程运行时错误 0 条${errors.length ? ' → ' + errors.slice(0, 2).join(' | ') : ''}`)
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
if (fail > 0) process.exit(1)
