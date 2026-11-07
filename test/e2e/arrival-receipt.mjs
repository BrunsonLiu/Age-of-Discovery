// 主屏「这趟带回了什么」回执（端到端）
//
// 跑法：先起 dev server，再 `node test/e2e/arrival-receipt.mjs`
//   GAME_URL=...  EDGE_PATH=...  可覆盖默认路径
//
// 【守的是什么】
// 第 29 轮实测 1440×900 连跑 10 趟到港：主屏可见文本里「靠岸 ·」「酒馆里有人
// 提起」「应验 ·」一次都没出现，唯一提示是侧栏「日志」按钮上一个 8px 红点 +
// 屏幕上看不见的 aria-label；那本册子其实做得很完整（见闻标题、风土注、线索、
// 应验页、三页签、在地图上看看都在），只是没有常驻出口。这条巡检守四件事：
//   ① 到港后不用点开任何面板，主屏就出现那句「没讲完的尾巴」，且与 logbook
//      最新未读页同源（不是另写一套文案）；
//   ② 副行「下一站：X · N 海里」一个字都不被替换 —— 回来的理由与下一趟的
//      方向要同时在场（上一轮刚把「下一站」做成常驻，不能又弄丢）；
//   ③ 点主行真的翻开航海日志并标记已读，翻过后回执自动收起，不留消不掉的
//      横条；下一趟又会带来新的一句；
//   ④ 移动端保持一行「航路 · 下一站」，底栏「日志」标签自带未读徽标，不叠内容。
// 另外覆盖：主行不被 truncate 裁字、真实鼠标点得到（不被靠岸邀请条遮挡）、
// 点回执不出航、无运行时错误。
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
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
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log('  ✗', msg) } }

const setup = () => page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, gameMode: 'captain',
    dialogueSeen: ['opening_pilot'], currentEvent: null, activePanel: null,
    pendingVoyage: null, waypoint: null, currentRoute: null, routeProgress: 0,
    stance: 'steady', rand: () => 1,
    discoveredPorts: [1], logbook: [],
    fleet: {
      ...s.fleet, gold: 1200, day: 1, fame: 0, currentPortId: 1,
      isSailing: false, food: 100, water: 150, morale: 70,
    },
  })
  window.__mapStore.setState({ viewMode: 'chart', renderMode: '2d', center: [34, -9] })
  window.__dialogueStore?.getState?.().skip()
})

const ready = await page.waitForFunction(
  () => !!(window.__gameStore && window.__mapStore), { timeout: 30000, polling: 100 },
).then(() => true).catch(() => false)
if (!ready) {
  check(false, '页面未就绪：store 调试钩子 30s 内没挂上（dev 编译失败或页面空白）')
  console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
  await browser.close()
  process.exit(1)
}
await setup()

// 拿真实港口 id，不写死
const portIds = await page.evaluate(async () => {
  const m = await import('/Age-of-Discovery/src/data/ports.ts')
  return m.ports.slice(0, 4).map(p => p.id)
})

/** 制造一趟真实到港：先置 sailing 再调 arriveAtPort，随后清掉可能弹出的彩蛋致辞 */
const arrive = async (day, portId) => {
  await page.evaluate(({ d, pid }) => {
    const st = window.__gameStore.getState()
    window.__gameStore.setState({
      activePanel: null, currentEvent: null,
      fleet: { ...st.fleet, day: d, isSailing: true },
    })
    window.__gameStore.getState().arriveAtPort(pid)
  }, { d: day, pid: portId })
  // 剧情触发点② 会在到港弹彩蛋致辞（全屏遮罩），dev 钩子直接 skip，
  // 别让它吃掉后面真实鼠标的点击
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'), { timeout: 8000, polling: 80 })
    .catch(() => {})
  await page.evaluate(() => window.__dialogueStore?.getState?.().skip())
  await sleep(220)
}

/** 读回执条：文本 / 未读数 / 裁切 / 真实命中 / 完整原文 */
const readReceipt = () => page.evaluate(() => {
  const el = document.querySelector('[data-testid="arrival-receipt"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  const log = window.__gameStore.getState().logbook
  const latest = log.find(e => !e.read) ?? null
  return {
    text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
    unreadAttr: Number(el.getAttribute('data-unread')),
    realUnread: log.filter(e => !e.read).length,
    latestHint: latest?.hint ?? '',
    latestText: latest?.text ?? '',
    latestTitle: latest?.title ?? '',
    latestId: latest?.id ?? null,
    latestDay: latest?.day ?? null,
    targetPortId: latest?.targetPortId ?? null,
    fullTitleAttr: el.getAttribute('title') || '',
    clipped: el.scrollWidth > el.clientWidth + 1,
    visible: r.width > 40 && r.height > 8 && getComputedStyle(el).display !== 'none',
    hitSelf: !!hit && (hit === el || el.contains(hit)),
    point: [r.left + r.width / 2, r.top + r.height / 2],
    hintText: (document.querySelector('[data-testid="next-port-hint"]')?.textContent || '').replace(/\s+/g, ' ').trim(),
  }
})

console.log('=== 开局 · 还没带回任何东西 ===')
await page.waitForFunction(() => !!document.querySelector('[data-testid="next-port-hint"]'), { timeout: 15000, polling: 100 })
const atStart = await readReceipt()
check(atStart === null, '开局没有未读回执时不硬塞一条「刚带回」')
const startHint = await page.evaluate(() =>
  (document.querySelector('[data-testid="next-port-hint"]')?.textContent || '').replace(/\s+/g, ' ').trim())
check(/航路 ·/.test(startHint), `开局主行仍是「航路 · 目标」（${startHint.slice(0, 40)}）`)

console.log('=== 第 1 趟到港 · 回来的理由出现在主屏 ===')
await arrive(4, portIds[1])
const r1 = await readReceipt()
check(!!r1 && r1.visible, '到港后主屏出现回执条（不依赖点开任何面板）')
check(!!r1 && /刚带回 ·/.test(r1.text), `主行写「刚带回 · …」（${r1?.text.slice(0, 40) ?? '无'}）`)
check(!!r1 && r1.unreadAttr === r1.realUnread && r1.realUnread > 0,
  `未读数与 logbook 实际未读页一致（显示 ${r1?.unreadAttr} / 实际 ${r1?.realUnread}）`)
// 同源：主屏这句必须来自册子最新一页的 hint，不是另写一套文案
const rumorName = r1 ? (r1.latestHint.match(/酒馆里有人提起([^—]+)/) || [])[1] : ''
check(!!rumorName && !!r1 && r1.text.includes(rumorName),
  `主屏港名与册子线索同源（册子「${rumorName || '无'}」/ 屏幕「${r1?.text ?? ''}」）`)
const realPortName = await page.evaluate(async (pid) => {
  if (pid == null) return null
  const m = await import('/Age-of-Discovery/src/data/ports.ts')
  return m.ports.find(p => p.id === pid)?.nameCn ?? null
}, r1?.targetPortId ?? null)
check(!!realPortName && !!r1 && r1.text.includes(realPortName),
  `线索指向的港真实存在且写在主屏（${realPortName ?? '无'}）`)
check(!!r1 && !r1.clipped, '主行没有被 truncate 裁字（12px 一行完整放得下）')
check(!!r1 && r1.fullTitleAttr.includes(r1.latestText), 'hover 提示给的是册子里的完整原文')
check(!!r1 && r1.hitSelf, '回执条中心点真实命中自己（未被靠岸邀请条/致词层遮挡）')
check(!!r1 && /下一站：/.test(r1.hintText) && /海里/.test(r1.hintText),
  '副行「下一站：X · N 海里」仍在，回执没有把方向换掉')

console.log('=== 点回执 · 翻开日志并自动收起 ===')
const beforeClick = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return { sailing: s.fleet.isSailing, route: s.currentRoute }
})
/*
 * 点回执：**每次点之前重新量坐标**，点完轮询「面板真的开了」。
 *
 * 原来用 readReceipt() 里算好的 r1.point 直接点，中间还夹着几次 await
 * （动态 import 港名、读 state）；回执条会因为未读数/回执内容变化而重渲染，
 * 坐标过期就点空——实测偶发红 4 条（同日第二次跑又全绿）。
 * 注入旧写法（回执不渲染）时这里返回 false，下面的断言照样明确报红。
 */
async function clickReceipt(attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    const pt = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="arrival-receipt"]')
      if (!el) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      if (r.width < 10 || r.height < 8 || +cs.opacity < 0.5) return null
      return [r.x + r.width / 2, r.y + r.height / 2]
    })
    if (!pt) return false
    await page.mouse.click(pt[0], pt[1])
    for (let w = 0; w < 1500; w += 150) {
      const open = await page.evaluate(() => window.__gameStore.getState().activePanel === 'event')
      if (open) return true
      await sleep(150)
    }
  }
  return false
}

const clicked = await clickReceipt()
void clicked
/*
 * 面板是 React.lazy：点开瞬间 activePanel 立刻变成 'event'，但里面先挂
 * Suspense 占位，dev 冷启动要现编 chunk。原来只 sleep(250) 就读文字，
 * 于是偶发「未见闻页 + 未读仍为 1」（同一天还绿过两次），误判成功能坏了。
 * 这里等到「见闻页真的挂上」为止：未读归零或正文出现标题，最多 6s。
 * 真挂不上 → 超时 → 后面的断言照样红。
 */
let viewReady = false
for (let waited = 0; waited < 6000; waited += 150) {
  viewReady = await page.evaluate(() => {
    const s = window.__gameStore.getState()
    const unread = s.logbook.filter(e => !e.read).length
    const txt = document.body.innerText || ''
    return unread === 0 || /新的一页在最上面|靠岸 ·/.test(txt)
  })
  if (viewReady) break
  await sleep(150)
}
if (!viewReady) console.log('  ⚠ 6s 内见闻页没挂上（下面判红）')
const afterClick = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return {
    panel: s.activePanel,
    unread: s.logbook.filter(e => !e.read).length,
    sailing: s.fleet.isSailing, route: s.currentRoute,
    panelText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400),
  }
})
check(afterClick.panel === 'event', `点回执打开的是航海日志面板（activePanel=${afterClick.panel}）`)
check(/新的一页在最上面|靠岸 ·/.test(afterClick.panelText), '日志的见闻页真的显示了这一页')
check(afterClick.unread === 0, `翻开后未读归零（${afterClick.unread}）`)
check(afterClick.sailing === beforeClick.sailing && afterClick.route === null,
  '点回执只翻册子，没有把船开出去')

await page.evaluate(() => window.__gameStore.getState().setActivePanel(null))
await sleep(250)
const afterClose = await readReceipt()
check(afterClose === null, '翻过后回执自动收起，不留一条消不掉的横条')
const restored = await page.evaluate(() =>
  (document.querySelector('[data-testid="next-port-hint"]')?.textContent || '').replace(/\s+/g, ' ').trim())
check(/航路 ·/.test(restored), `关掉面板后主行恢复「航路 · 目标」（${restored.slice(0, 40)}）`)

console.log('=== 第 2 趟 · 每趟都真的多一页 ===')
await arrive(7, portIds[2])
const r2 = await readReceipt()
check(!!r2 && r2.visible, '下一趟又带回一条回执（不是一次性提示）')
/*
 * 【别写成「两趟文本必须不同」】pickRumor 用 (day*31 + portId*17) % pool.length
 * 确定性取模选线索港，连着两趟指向同一个港是合法结果（实测这两趟都指向
 * 桑给巴尔）。那是既有数据行为、本轮不改。这里守的是「确实写了新的一页」
 * 和「主屏仍与第二趟自己那页同源」—— 注入写死一句话时后者必红。
 */
check(!!r1 && !!r2 && r2.latestId !== r1.latestId && r2.latestDay > r1.latestDay,
  `第二趟确实写了新的一页（${r1?.latestId} → ${r2?.latestId}）`)
const rumorName2 = r2 ? (r2.latestHint.match(/酒馆里有人提起([^—]+)/) || [])[1] : ''
check(!!rumorName2 && !!r2 && r2.text.includes(rumorName2) && r2.latestHint.includes(rumorName2),
  `第二趟主屏仍与自己那页线索同源，不是写死一句话（${rumorName2 || '无'}）`)
check(!!r2 && r2.unreadAttr === r2.realUnread, `第 2 趟未读数仍与实际一致（${r2?.unreadAttr}/${r2?.realUnread}）`)
console.log(`  · 注：两趟线索都指向「${rumorName2}」，是 pickRumor 确定性取模的既有行为`)

console.log('=== 移动端 390×844 · 保持一行，不叠内容 ===')
await page.setViewport({ width: 390, height: 844 })
await sleep(350)
const mob = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="next-port-hint"]')
  const bar = [...document.querySelectorAll('.wood-beam--foot')]
    .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0]
  const r = el?.getBoundingClientRect()
  return {
    hasReceipt: !!document.querySelector('[data-testid="arrival-receipt"]'),
    text: (el?.textContent || '').replace(/\s+/g, ' ').trim(),
    height: r?.height ?? 0,
    barTop: bar?.getBoundingClientRect().top ?? null,
    bottom: r?.bottom ?? null,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }
})
check(!mob.hasReceipt, '移动端不叠第二块内容（底栏「日志」标签已有未读徽标）')
check(/航路 · 下一站：/.test(mob.text), `移动端仍是「航路 · 下一站」（${mob.text.slice(0, 40)}）`)
check(mob.height <= 40, `移动端仍只占一行（${mob.height.toFixed(0)}px）`)
check(mob.barTop === null || mob.bottom <= mob.barTop + 1, '移动端没有压住底栏')
check(mob.scrollWidth === mob.clientWidth, `移动端无横向溢出（${mob.scrollWidth}/${mob.clientWidth}）`)

console.log('=== 运行时错误 ===')
check(errors.length === 0, `无运行时错误（${errors.length} 条：${errors.slice(0, 2).join(' | ')}）`)

console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
if (fail > 0) process.exit(1)
