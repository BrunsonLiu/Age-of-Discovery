// 开局选国（回归）
//
// 【守什么】用户 2026-11-12 提的方向："开局选国家，不同国家在大航海这段期间有
// 不同的故事，可以适当编造，结合神话和传说"。这一层最容易做成"只换开场那几行字"。
// 所以这个脚本守的是**换旗之后世界真的变了**：
//  ① 四张国别卡都在，默认选中西班牙（老版本的开局）；
//  ② 点一张卡，下面那三行故事**当场换**（国史 / 你是谁 / 座船与传说）；
//  ③ 开局之后：母港、船名、士气、名号、起手声望全按国别走；
//  ④ 刷新之后国别还在（存档白名单）；
//  ⑤ 海图上真的立着那个传说标记（金色小圈 + 名字），开到附近就消失。
//
// 跑法：先起 dev server（5174），再 `node test/e2e/nation-start.mjs`
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const page = await (await browser.createBrowserContext()).newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (/favicon|AudioContext|net::ERR_/.test(t)) return
  errors.push('CONSOLE: ' + t.slice(0, 160))
})
await page.setViewport({ width: 1440, height: 900 })

let pass = 0
let fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) }
}

/** 点开局那一串按钮（翻开日志 / 继续 / 启航！） */
const clickNext = async () => page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /^(翻开日志|继续|启航！)$/.test((x.textContent || '').trim()))
  if (!b) return false
  b.click()
  return true
})

const introState = () => page.evaluate(() => {
  const panel = document.querySelector('[data-testid=intro-screen]')
  const box = panel?.querySelector('.parchment-bg-dark')?.getBoundingClientRect()
  const story = [...(panel?.querySelectorAll('.bg-ocean-900\\/30 p') ?? [])].map(p => (p.textContent || '').trim())
  const cards = [...document.querySelectorAll('[data-nation]')].map(c => ({
    id: c.dataset.nation,
    pressed: c.getAttribute('aria-pressed') === 'true',
    text: (c.textContent || '').replace(/\s+/g, ' ').trim(),
    w: c.getBoundingClientRect().width,
    h: c.getBoundingClientRect().height,
  }))
  return {
    cards,
    story,
    dots: panel?.querySelectorAll('.w-2.h-2, .w-2').length ?? 0,
    box: box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null,
    vw: innerWidth, vh: innerHeight,
  }
})

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2200)

// ---- ① 打开到选国那一屏 ----
await clickNext()
await sleep(900)
const s0 = await introState()
check(s0.cards.length === 4, `开局有四张国别卡（${s0.cards.map(c => c.id).join(' / ')}）`)
check(s0.cards.filter(c => c.pressed).length === 1 && s0.cards.find(c => c.pressed)?.id === 'spain',
  `默认选中西班牙（${s0.cards.find(c => c.pressed)?.id}）—— 与老版本的开局一致`)
check(s0.cards.every(c => c.w > 120 && c.h > 60), `四张卡都渲染出了尺寸（${Math.round(s0.cards[0].w)}×${Math.round(s0.cards[0].h)}）`)
check(s0.cards.every(c => /葡|西|英|荷/.test(c.text) && /声望|船员|名号|士気|士气/.test(c.text)),
  '每张卡都写了国别、母港与一句机制（不是只有名字）')
check(s0.story.length >= 3, `故事栏有三行（${s0.story.length} 行）`)
check(s0.box !== null && s0.box.y >= 0 && s0.box.y + s0.box.h <= s0.vh + 1,
  `开局面板整块在视口里（${Math.round(s0.box?.y)} → ${Math.round((s0.box?.y ?? 0) + (s0.box?.h ?? 0))} / 视口 ${s0.vh}）`)
check(s0.dots === 4, `开局仍是 4 屏（圆点 ${s0.dots} 个）—— 每多一屏就多一次点击`)

// ---- ② 点葡萄牙：故事当场换 ----
await page.evaluate(() => document.querySelector('[data-nation=portugal]')?.click())
await sleep(350)
const s1 = await introState()
check(s1.cards.filter(c => c.pressed).length === 1 && s1.cards.find(c => c.pressed)?.id === 'portugal',
  '点一张卡只有它被选中（其余取消）')
check(s1.story.join(' ').includes('里斯本'), `故事当场换成里斯本（${s1.story[0]?.slice(0, 18)}…）`)
check(s1.story.join(' ').includes('圣加布里埃尔号'), '座船名跟着换（圣加布里埃尔号）')
check(s1.story.join(' ').includes('圣布伦丹岛'), '传说钩子跟着换（圣布伦丹岛）')
check(!s1.story.join(' ').includes('塞维利亚'), '换了国旗之后不再残留别国的港口名')

// ---- ③ 走完开局：世界真的按国别落地 ----
for (let i = 0; i < 5; i++) { await clickNext(); await sleep(800) }
await sleep(1200)
const st = () => page.evaluate(() => {
  const s = window.__gameStore.getState()
  return {
    phase: s.gamePhase, nation: s.nation, port: s.fleet.currentPortId,
    ship: s.fleet.ships[0]?.name, crew: s.fleet.ships[0]?.crew,
    morale: s.fleet.morale, fame: s.fleet.fame, crown: s.factionRep.crown,
    gold: s.fleet.gold, disc: s.discoveredPorts,
  }
})
const a = await st()
check(a.phase === 'playing', `进到 playing（${a.phase}）`)
check(a.nation === 'portugal', `国别写进 store（${a.nation}）`)
check(a.port === 7 && a.disc.length === 1 && a.disc[0] === 7,
  `母港是里斯本且已发现（port=${a.port} disc=${JSON.stringify(a.disc)}）`)
check(a.ship === '圣加布里埃尔号', `座船按国别改名（${a.ship}）`)
check(a.morale === 78, `士气 70+8=${a.morale}`)
check(a.crown === 14, `王室起手声望 ${a.crown}`)
check(a.gold === 500, `金币没变（${a.gold}）—— 国别不改钱`)

// 关掉开场致辞，看得见海图
for (let i = 0; i < 12; i++) {
  const open = await page.evaluate(() => !!window.__dialogueStore?.getState?.().scriptId)
  if (!open) break
  await page.evaluate(() => window.__dialogueStore?.getState?.().advance?.())
  await sleep(350)
}
await sleep(900)

// ---- ④ 海图上的传说标记 ----
const mark = await page.evaluate(() => {
  const m = document.querySelector('.legend-mark-icon')
  if (!m) return null
  const b = m.getBoundingClientRect()
  const name = m.querySelector('.legend-mark-name')
  return {
    x: b.x, y: b.y, w: b.width, h: b.height,
    name: (name?.textContent || '').trim(),
    pe: getComputedStyle(m).pointerEvents,
    fs: name ? parseFloat(getComputedStyle(name).fontSize) : 0,
    inView: b.x > -40 && b.x < innerWidth + 40 && b.y > -40 && b.y < innerHeight + 40,
  }
})
check(!!mark, `海图上立着传说标记（${mark?.name ?? '没有'}）`)
check(mark?.name === '圣布伦丹岛', `标记写着传说名（${mark?.name}）`)
check(mark?.pe === 'none', `标记不吃点击（pointer-events=${mark?.pe}）`)
check((mark?.fs ?? 0) >= 12, `标记名字 ${mark?.fs}px ≥ 12`)

// ---- ⑤ 刷新之后国别还在（存档白名单） ----
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2600)
const b2 = await st()
check(b2.nation === 'portugal' && b2.port === 7,
  `刷新后仍是葡萄牙/里斯本（${b2.nation} / ${b2.port}）—— 国别进了存档`)
check(b2.phase !== 'start', `刷新后不再要求重选国别（phase=${b2.phase}）`)

// ---- ⑥ 开进传说圈：标记消失、名号到账 ----
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({
    fleet: { ...s.fleet, day: s.fleet.day + 1 },
    shipPosition: [28.5, -38.0],
    gamePhase: 'playing',
  })
  window.__gameStore.getState().advanceDay()
})
await sleep(900)
const after = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return {
    collected: s.collectedLegends, fame: s.fleet.fame,
    mark: !!document.querySelector('.legend-mark-icon'),
    notice: (s.notifications || []).some(n => /圣布伦丹岛/.test(n.title + n.message)),
  }
})
check(after.collected.includes('sao-brandao'), `开进圈里就记账（${JSON.stringify(after.collected)}）`)
check(after.fame === 20, `名号 +20（实测 ${after.fame}）`)
check(!after.mark, '兑现之后海图上的标记消失（一次性）')
check(after.notice, '弹了一条回执（不是悄悄加数值）')

console.log(`\n报错：${errors.length ? errors.join(' | ') : '无'}`)
check(errors.length === 0, '无页面报错')
console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
