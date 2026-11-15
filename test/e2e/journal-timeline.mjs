// 日志页：时间轴 + 展开当天的场景插图。
//
// 【为什么要单独一套】日志页这一轮改了三件容易坏的事：
//   ① 日期挪到左边成一列、中间一条竖线 —— 圆点必须真的落在线上（差 1~2px 就看得出歪）
//   ② 展开那天顶部配场景图（来自 event.sceneKey，25 张里的哪一张）
//   ③ 没有见闻时不再留一根 420px 的空柱（记事要占满整宽）
// 单测只能查源码字符串，量不到"点是不是在线上""记事到底多宽"。
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.AOD_BASE || 'http://localhost:5174/Age-of-Discovery/'
const SHOTS = '.workbuddy/shots'
mkdirSync(SHOTS, { recursive: true })

let pass = 0
const fails = []
const check = (ok, label) => {
  if (ok) { pass++; console.log('  ✓', label) }
  else { fails.push(label); console.log('  ✗ FAIL:', label) }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!window.__gameStore && !!window.__mapStore, { timeout: 30000 })
await sleep(900)

/**
 * 造日志数据并打开日志页。
 * withSightings=true 时再塞两条 logbook（见闻），用来验两栏排法与单栏排法。
 */
const openJournal = async ({ withSightings }) => {
  await page.evaluate((withSight) => {
    const mk = (day, type, title, choice, desc, note, vals, sceneKey) => ({
      day, choiceIndex: 0,
      event: { id: day, type, title, description: '', choices: [{ text: choice }], sceneKey },
      outcome: { description: desc, historicalNote: note, ...vals },
    })
    const log = [
      mk(63, 'discovery', '没画在图上的岸', '沿岸走一段', '岸线比图上画的往南缩了一截。', '', { moraleChange: 2 }, 'island'),
      mk(62, 'storm', '风暴前夜', '收帆硬扛', '帆撕了一道口子，桅杆还立着。', '', { durabilityChange: -4 }, 'storm'),
      mk(60, 'pirate', '桅杆上的旗', '迎上去', '打退了，还留下两箱货。', '', { durabilityChange: -2, crewChange: -1, goldChange: 180 }, 'pirate'),
      mk(55, 'historical', '一四九二年的秋天', '记下了', '这一年，世道变了。', '格拉纳达陷落的消息传到港口时，已经晚了两个月。', {}, 'navy'),
      mk(41, 'treasure', '沙里埋着东西', '挖开看', '半截铁箱，里面是些旧银器。', '', { goldChange: 320 }, 'treasure'),
    ]
    const sightings = withSight ? [
      {
        id: 'a-21-1', kind: 'arrival', day: 63, portId: 21,
        title: '广州 · 市舶司', text: '码头上的味道是湿木头和香料。', aside: '有人认得这面旗。',
        hint: null, targetPortId: null, read: true,
      },
      {
        id: 'a-12-2', kind: 'arrival', day: 60, portId: 12,
        title: '满剌加 · 河口', text: '潮水退下去一截，露出木桩。', aside: '他们管这叫「水退的时候」。',
        hint: null, targetPortId: null, read: true,
      },
    ] : []
    window.__gameStore.setState({
      gamePhase: 'playing', tutorialStep: -1, showHelp: false,
      dialogueSeen: ['opening_pilot'], activePanel: null,
      claimedVictories: [], collectedDebris: [], collectedRelics: [], collectedLegends: [],
      eventLog: log, logbook: sightings,
    })
    const s = window.__gameStore.getState()
    window.__gameStore.setState({
      fleet: { ...s.fleet, day: 63, currentPortId: null, isSailing: true },
      discoveredPorts: [21, 12],
    })
    const d = window.__dialogueStore
    for (let i = 0; i < 12 && d?.getState?.().scriptId; i++) d.getState().skip()
    window.__gameStore.setState({ showHelp: false, activePanel: null })
    window.__mapStore.getState().openLogbook('journal')
  }, withSightings)
  await sleep(1100)
}

/* ── 一、时间轴 ── */
console.log('=== 时间轴 ===')
await openJournal({ withSightings: false })
const axis = await page.evaluate(() => {
  const days = [...document.querySelectorAll('[data-testid^="journal-day-"]')]
  const first = days[0]
  if (!first) return null
  const wrap = first.closest('.relative')
  // 竖线挂在自己的 testid 上（它不在行的 .relative 里，closest 会找到行自己）
  const line = document.querySelector('[data-testid="journal-axis"]')
  const dot = [...wrap.querySelectorAll('span[aria-hidden="true"]')]
    .find(s => (s.className || '').includes('rounded-full'))
  const dateSpan = wrap.querySelector('span.absolute.left-0')
  const card = first.parentElement
  const r = (el) => el.getBoundingClientRect()
  return {
    count: days.length,
    lineX: line ? r(line).left + r(line).width / 2 : null,
    dotX: dot ? r(dot).left + r(dot).width / 2 : null,
    dateRight: dateSpan ? r(dateSpan).right : null,
    cardLeft: r(card).left,
    lineVisible: line ? getComputedStyle(line).display !== 'none' : false,
    dotColor: dot ? getComputedStyle(dot).backgroundColor : null,
  }
})
check(!!axis, '时间轴上能读到第一天的行')
check(axis.count === 5, `5 天各一行（实际 ${axis.count}）`)
check(axis.lineVisible, '竖线在（不是被 display:none 藏掉）')
check(Math.abs(axis.lineX - axis.dotX) <= 2,
  `圆点落在竖线上（线 ${axis.lineX?.toFixed(1)} vs 点 ${axis.dotX?.toFixed(1)}）`)
check(axis.dateRight <= axis.cardLeft - 8,
  `日期列不压卡片（日期右边 ${axis.dateRight?.toFixed(0)} < 卡片左边 ${axis.cardLeft?.toFixed(0)}）`)

/* ── 二、展开那天有场景图 ── */
const scene0 = await page.evaluate(async () => {
  const im = document.querySelector('[data-testid^="journal-scene-"]')
  if (!im) return null
  if (!im.complete) await new Promise(r => { im.onload = r; im.onerror = r })
  return { nw: im.naturalWidth, nh: im.naturalHeight, src: im.getAttribute('src'), day: im.getAttribute('data-testid') }
})
check(!!scene0, '展开的那天顶部有场景图')
check(!!scene0 && scene0.nw > 0, `场景图真的加载出来了（${scene0?.nw}×${scene0?.nh}）`)
check(!!scene0 && /\/assets\/scenes\/d\d+\.webp$/.test(scene0.src || ''), `图来自 scenes/（${scene0?.src?.split('/').pop()}）`)
check(!!scene0 && scene0.day === 'journal-scene-63', `挂的是最新一天（${scene0?.day}）`)

/* ── 三、收起后图就没了（不是留在 DOM 里白占内存） ── */
await page.evaluate(() => {
  const b = document.querySelector('[data-testid="journal-day-63"]')
  b.click()
})
await sleep(400)
const afterCollapse = await page.evaluate(() => ({
  scene: !!document.querySelector('[data-testid^="journal-scene-"]'),
  expanded: document.querySelector('[data-testid="journal-day-63"]').getAttribute('aria-expanded'),
}))
check(afterCollapse.expanded === 'false', '点一下收起了')
check(!afterCollapse.scene, '收起后场景图不在 DOM 里')

// 再展开另一天（62 天，storm），图应换成 d01
await page.evaluate(() => {
  document.querySelector('[data-testid="journal-day-62"]').click()
})
await sleep(500)
const scene62 = await page.evaluate(async () => {
  const im = document.querySelector('[data-testid="journal-scene-62"]')
  if (!im) return null
  if (!im.complete) await new Promise(r => { im.onload = r; im.onerror = r })
  return { nw: im.naturalWidth, src: im.getAttribute('src') }
})
check(!!scene62 && scene62.nw > 0, `展开第 62 天也出图（${scene62?.src?.split('/').pop()}）`)
check(!!scene62 && scene62.src !== scene0.src, `不同日子用不同的图（63→${scene0?.src?.split('/').pop()} / 62→${scene62?.src?.split('/').pop()}）`)
await page.screenshot({ path: `${SHOTS}/journal-timeline.png` })

/* ── 四、没有见闻时记事占满整宽 ── */
const wide = await page.evaluate(() => {
  const page1 = document.querySelector('[data-testid="logbook-page-journal"]')
  const btn = document.querySelector('[data-testid^="journal-day-"]')
  const card = btn?.parentElement
  return {
    pageW: Math.round(page1?.getBoundingClientRect().width || 0),
    cardW: Math.round(card?.getBoundingClientRect().width || 0),
  }
})
check(wide.cardW > wide.pageW * 0.7,
  `没有见闻时记事占满整宽（卡 ${wide.cardW} / 页 ${wide.pageW}）`)

/* ── 五、有见闻时回到两栏 ── */
console.log('=== 有见闻 → 两栏 ===')
await openJournal({ withSightings: true })
const two = await page.evaluate(() => {
  const page1 = document.querySelector('[data-testid="logbook-page-journal"]')
  const btn = document.querySelector('[data-testid^="journal-day-"]')
  const card = btn?.parentElement
  const grid = page1?.firstElementChild
  return {
    pageW: Math.round(page1?.getBoundingClientRect().width || 0),
    cardW: Math.round(card?.getBoundingClientRect().width || 0),
    cols: grid ? getComputedStyle(grid).gridTemplateColumns : '',
  }
})
check(two.cardW < wide.cardW - 100,
  `有见闻时记事让出一栏（${two.cardW} < 单栏时的 ${wide.cardW}）`)
check(/420px/.test(two.cols), `左栏真的是 420px（${two.cols.split(' ').map(v => Math.round(parseFloat(v))).join('+')}）`)
await page.screenshot({ path: `${SHOTS}/journal-two-cols.png` })

/* ── 六、窄屏 ── */
await page.setViewport({ width: 1024, height: 768 })
await sleep(500)
const narrow = await page.evaluate(() => {
  const btn = document.querySelector('[data-testid^="journal-day-"]')
  const card = btn?.parentElement
  const page1 = document.querySelector('[data-testid="logbook-page-journal"]')
  return {
    cardRight: Math.round(card?.getBoundingClientRect().right || 0),
    pageRight: Math.round(page1?.getBoundingClientRect().right || 0),
  }
})
check(narrow.cardRight <= narrow.pageRight + 1, `1024 下卡片不越界（${narrow.cardRight} ≤ ${narrow.pageRight}）`)

check(errs.length === 0, `无 pageerror（${errs.slice(0, 2).join(' | ')}）`)

console.log(`\n${pass} 通过 / ${fails.length} 失败`)
if (fails.length) { console.log('失败项：'); fails.forEach(f => console.log('  -', f)) }
await browser.close()
process.exit(fails.length ? 1 : 0)
