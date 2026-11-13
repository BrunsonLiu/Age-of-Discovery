// 航海日志 / 存档导出导入 / 结局不停机 —— 端到端
//
// 跑法：先起 dev server（npx vite --port 5174 --host 127.0.0.1），
//      再 `node test/e2e/logbook.mjs`
// 重点：真实鼠标点击、真实文件导入、真实 reload 读档；不看截图判断文字。

let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default
}

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'
mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)) })
await page.setViewport({ width: 1440, height: 900 })

let pass = 0, fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) }
  else { fail++; console.log('  ✗ FAIL:', msg) }
}
const text = () => page.evaluate(() => document.body.innerText)
// 第三个参数起会原样传给浏览器：waitForFunction 的回调是在页面里eval 的，
// 闭包捕获不到 Node 侧变量（第一版把 label 直接写进回调，报了 not defined）
const until = async (fn, ms = 6000, ...args) => {
  try { await page.waitForFunction(fn, { timeout: ms }, ...args); return true } catch { return false }
}
// 造状态可能把开局致辞重新拉起：它是 fixed inset-0 的全屏遮罩，会吃掉侧栏点击。
// 按玩家真实的做法按 Esc 跳过，不用内部钩子强关（这样测的才是可点的界面）。
const dismissDialogue = async () => {
  for (let i = 0; i < 3; i++) {
    const on = await page.evaluate(() => document.body.innerText.includes('Esc 跳过致辞'))
    if (!on) return
    await page.keyboard.press('Escape')
    await until(() => !document.body.innerText.includes('Esc 跳过致辞'), 3000)
  }
}

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })

// 跳过 Intro / 教学 / 开场对白：直接把 store 推到可玩状态
const hasHook = await until(() => !!window.__gameStore, 10000)
check(hasHook, 'dev 状态钩子可用（e2e 起点）')
await page.evaluate(() => {
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false,
    dialogueSeen: ['opening_pilot'],
    activePanel: null,
    logbook: [], claimedVictories: [], collectedDebris: [],
  })
})
await until(() => !document.body.innerText.includes('选择你的船长天赋'))

// ---- 1. 日志面板三页 ----
await page.click('button[aria-label="日志"]')
check(await until(() => document.body.innerText.includes('这本册子还是空的')), '打开日志 → 默认「见闻」页显示空状态')
check((await text()).includes('共 0 页') === false, '空册子不写"共 0 页"这种凑数句')
for (const label of ['见闻', '图鉴', '记事']) {
  check(await until(l => [...document.querySelectorAll('[role=tab]')].some(b => b.textContent.includes(l)), 6000, label),
    `tab「${label}」存在`)
}

await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(b => b.textContent.includes('图鉴'))?.click())
/*
 * 图鉴总格数**从数据层算**，不写死数字。
 *
 * 【为什么】写死 40 的那版，加一件海上遗物就假红——
 * 而数字本身没错，错的是断言。新增内容时图鉴格子数本来就该跟着变，
 * 写死等于把"内容变了"当成"布局坏了"。
 * 于是这里直接 import 应用自己的四个数据模块，自己算总数：
 * 港口 + 成就 + 漂流物 + 海上遗物。
 */
const atlasTotal = await page.evaluate(async () => {
  const imp = (p) => import(`/Age-of-Discovery/src/${p}`).catch(() => import(`/src/${p}`))
  const [portsMod, achMod, debrisMod, relicMod] = await Promise.all([
    imp('data/ports.ts'), imp('data/achievements.ts'), imp('data/debris.ts'), imp('data/relics.ts'),
  ])
  return portsMod.ports.length + achMod.achievements.length
    + Object.keys(debrisMod.DEBRIS_INFO).length + relicMod.RELICS.length
})
check(await until((n) => document.body.innerText.includes(`/ ${n} 格`), 6000, atlasTotal),
  `图鉴总格数 = 港口 + 成就 + 漂流物 + 海上遗物 = ${atlasTotal} 格（数字从数据层算，不写死）`)
// 海上遗物必须真的在图鉴里占一节（不是只算进总数）
check(await until(() => document.body.innerText.includes('海上遗物')), '图鉴里有一节「海上遗物」')
// 点一个未点亮的格子必须有回执（不能"点了没反应"）
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /还没见过/.test(x.getAttribute('aria-label') || ''))
  b?.click()
})
check(await until(() => document.body.innerText.includes('去了自然就点亮')), '未点亮格子点下去有详情回执')

await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(b => b.textContent.includes('记事'))?.click())
check(await until(() => document.body.innerText.includes('还没写下第一页')), '「记事」页保留原来的船长日记空态')

// ---- 2. 到港带回一页 + 侧栏未读小圆点 ----
await page.evaluate(() => {
  window.__gameStore.setState({ activePanel: null })
  window.__gameStore.getState().arriveAtPort(1)
})
check(await until(() => !!document.querySelector('[data-testid="logbook-unread-dot"]')), '靠岸后侧栏「日志」出现未读小圆点')
await page.click('button[aria-label="日志"]')
await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(b => b.textContent.includes('见闻'))?.click())
check(await until(() => document.body.innerText.includes('靠岸 · 哈瓦那')), '见闻页出现这一趟带回的那一页')
check((await text()).includes('不催'), '线索明说没有期限')
check(await until(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('在地图上看看'))),
  '线索给了一个可点的「在地图上看看」')
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('在地图上看看'))?.click())
check(await until(() => !document.body.innerText.includes('靠岸 · 哈瓦那')), '点线索只把地图移过去并收起面板（不替玩家出航）')

// ---- 2b. 线索应验：留了尾巴就得认账 ----
// 造一句「第 1 天在塞维利亚听人提起哈瓦那」的旧线索，然后真的开到哈瓦那。
// 修复前：旧页一个字不变、按钮仍把地图移向已经点亮的港、册子里没有下文。
await page.evaluate(() => {
  const clue = {
    id: 'arrival-1-6', kind: 'arrival', day: 1, portId: 6,
    title: '靠岸 · 塞维利亚', text: '西班牙内河港口。', aside: '',
    hint: '酒馆里有人提起哈瓦那——没说什么时候去，也不催。',
    targetPortId: 1, read: true,
  }
  const s = window.__gameStore.getState()
  window.__gameStore.setState({
    activePanel: null, logbook: [clue], discoveredPorts: [6],
    fleet: { ...s.fleet, day: 5, currentPortId: 6, isSailing: false },
  })
  window.__gameStore.getState().arriveAtPort(1)
})
const echoState = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return {
    pages: s.logbook.length,
    arrivals: s.logbook.filter(e => e.kind === 'arrival').length,
    echo: s.logbook.find(e => e.kind === 'echo') ?? null,
  }
})
check(echoState.pages === 3 && echoState.arrivals === 2,
  `首次靠上线索指向的港：见闻 + 应验共添两页（实得 ${echoState.pages} 页）`)
check(echoState.echo?.day === 5 && /第 1 天.*塞维利亚.*哈瓦那/.test(echoState.echo.text),
  '应验页写的是「哪天、在哪儿听说的、今天到了哪儿」，不是一句空话')

await dismissDialogue()
await page.click('button[aria-label="日志"]')
check(await until(() => window.__gameStore.getState().activePanel === 'event'), '日志面板真的打开了（没被致辞遮罩吃掉）')
await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(b => b.textContent.includes('见闻'))?.click())
check(await until(() => !!document.querySelector('[data-testid="echo-entry"]')), '见闻页出现应验的那一页')
check(await until(() => !!document.querySelector('[data-testid="clue-fulfilled"]')), '旧线索页补上「已应验」回执')
check((await text()).includes('这句已应验 · 第 5 天到的'), '回执里的天数是真到达日，不是今天现算的')

await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(b => b.textContent.includes('图鉴'))?.click())
const atlasEcho = await page.evaluate(() => {
  const el = [...document.querySelectorAll('span')].find(s => s.textContent === '应验的线索')
  return el?.parentElement?.innerText ?? ''
})
check(/应验的线索\s*1 句/.test(atlasEcho), '图鉴个人纪录从日志推导出「1 句」，不写死')

await page.evaluate(() => {
  window.__gameStore.setState({ activePanel: null })
  window.__mapStore.getState().setViewMode('harbor')
})
check(await until(() => !!document.querySelector('[data-testid="harbor-view"]')), '切到岸上视角')
const harborEcho = await page.evaluate(() => document.querySelector('[data-testid="harbor-clue-echo"]')?.innerText ?? '')
check(harborEcho.includes(echoState.echo.text), '岸上摆的是同一句应验文案（不再另拼一句）')
check(harborEcho.includes('第 5 天'), '岸上回响也标着真实到达日')
await page.screenshot({ path: `${SHOTS}/logbook-echo-harbor.png` })
await page.evaluate(() => window.__mapStore.getState().setViewMode('chart'))

await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...s.fleet, day: 6 } })
  window.__gameStore.getState().arriveAtPort(1)
})
check(await page.evaluate(() => window.__gameStore.getState().logbook.filter(e => e.kind === 'echo').length) === 1,
  '再回同一港不重复应验（一港只收一次尾）')
await dismissDialogue()

// ---- 3. 达标不停机 ----
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({
    gamePhase: 'playing', claimedVictories: [], victoryDay: null,
    pendingSegment: null, pendingHelm: null, segmentCount: 0, segmentIndex: 0,
    currentEvent: null,
    fleet: { ...s.fleet, gold: 21000, morale: 80, food: 100, water: 100, isSailing: true },
  })
  window.__gameStore.getState().advanceDay()
})
const won = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return { phase: s.gamePhase, claimed: s.claimedVictories, titles: s.logbook.filter(e => e.kind === 'title').length }
})
check(won.phase !== 'gameover', '攒够两万金币后游戏继续（没有停机结局）')
check(won.claimed.includes('rich'), '称号写进 claimedVictories')
check(won.titles >= 1, '称号真的写成了日志里的一页')
check(await until(() => !document.querySelector('.fixed.inset-0.bg-black\\/80')), '没有全屏结局遮罩挡住地图')

// ---- 4. 存档：导出 → 制造差异 → 导入 → reload 读回 ----
/*
 * 【先把上一步 advanceDay() 可能摇出来的事件收掉】达标验证里把 isSailing 设成
 * true 再 advanceDay()，主循环会按概率摇一个随机事件 → gamePhase='event'，
 * EventCard 挂在 MainMap 的 `absolute inset-0 flex items-center justify-center`
 * 全屏容器里。它是**modal，本来就该挡住背景按钮**（玩家得先处理事件），
 * 但脚本接着去点「帮助」就会被它吃掉：诊断里 elementFromPoint 命中的正是这个 div，
 * Esc 也关不掉事件卡，重试那一次同样失败，四条断言一起红并让 page.click 抛异常。
 * 事件不是本节的被测对象（本节测存档），所以在这里把前置状态复位到 playing。
 */
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  if (s.currentEvent || s.gamePhase === 'event') {
    window.__gameStore.setState({ currentEvent: null, gamePhase: 'playing' })
  }
})
await dismissDialogue()
// 全链里前面几个 3D 脚本（swiftshader 软渲染）会把 CPU 占满一段时间，
// 帮助面板在这种负载下偶尔要 2~3s 才渲染完，6s 默认等待会偶发超时
// （单独跑 41/0，全链里却红三条 —— 就是这个原因）。
// 先清掉可能残留的浮层，再给面板更长的等待。
await page.keyboard.press('Escape')
await page.waitForFunction(() => true, { timeout: 100 }).catch(() => null)
await new Promise(r => setTimeout(r, 400))

/*
 * 点「帮助」之后**先看状态**，不要只看文案。
 * 全链里跑到这里时，页面刚从岸上视角退回来、还压着几层动画/浮层；偶发一次
 * 「点了但 showHelp 还是 false」（单独跑 41/0，全链里红三条）——只等文案的话，
 * 12s 之后你只知道"没出现"，不知道是"点击没生效"还是"面板渲染坏了"。
 * 所以：读 store → 没开就记下点位命中的是谁 → 清一层浮层再点一次 → 最后才断言。
 */
const helpClicked = async () => {
  await page.click('button[aria-label="帮助"]')
  return page.evaluate(() => window.__gameStore.getState().showHelp === true)
}
let helpOpen = await helpClicked()
if (!helpOpen) {
  const diag = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === '帮助')
    const r = b?.getBoundingClientRect()
    const el = r ? document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) : null
    return {
      hit: el ? el.tagName + '.' + String(el.className).slice(0, 60) : 'null',
      panel: window.__gameStore.getState().activePanel,
      phase: window.__gameStore.getState().gamePhase,
      event: !!window.__gameStore.getState().currentEvent,
      viewMode: window.__mapStore.getState().viewMode,
      dialogue: window.__dialogueStore?.getState?.().scriptId ?? null,
    }
  })
  console.log('    （第一次点帮助没生效，诊断：' + JSON.stringify(diag) + '）')
  await page.keyboard.press('Escape')
  await new Promise(r => setTimeout(r, 300))
  helpOpen = await helpClicked()
}
check(helpOpen, '帮助面板真的打开了（showHelp === true，不是靠文案猜）')
check(await until(() => document.body.innerText.includes('把这本日志带走'), 12000), '帮助面板出现存档说明')
check(!!(await page.$('[data-testid="save-export"]')), '导出按钮存在')
check(!!(await page.$('[data-testid="save-import"]')), '导入按钮存在')
await page.click('[data-testid="save-export"]')
// 全链负载下这条回执出现得比默认 6s 慢（单独跑 41/0，全链里偶发红）——同样放宽
check(await until(() => document.body.innerText.includes('已导出一份存档文件'), 10000), '点导出给出明确回执')

const raw = await page.evaluate(() => localStorage.getItem('age-of-discovery-save'))
check(!!raw && raw.includes('logbook'), '导出源就是真实存档（含日志字段）')
const probePath = join(process.cwd(), SHOTS, 'save-probe.json')
const modified = JSON.parse(raw)
modified.state.fleet.gold = 7777
writeFileSync(probePath, JSON.stringify(modified))

const input = await page.$('[data-testid="save-import-input"]')
await input.uploadFile(probePath)
check(await until(() => !!document.querySelector('[data-testid="save-import-confirm"]')), '合法存档进入两阶段确认')
check((await text()).includes('确认后会覆盖当前进度'), '确认前把覆盖风险说清楚')

const nav = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => null)
await page.click('[data-testid="save-import-confirm"]')
await nav
await until(() => !!window.__gameStore, 15000)
const goldAfter = await page.evaluate(() => window.__gameStore.getState().fleet.gold)
check(goldAfter === 7777, `reload 后从导入的存档读回金币（实得 ${goldAfter}）`)
const logRestored = await page.evaluate(() => window.__gameStore.getState().logbook.length)
check(logRestored >= 2, `日志页跟着存档一起回来了（${logRestored} 页）`)

// ---- 5. 坏文件不能把页面搞崩 ----
await dismissDialogue()
await page.click('button[aria-label="帮助"]')
const badPath = join(process.cwd(), SHOTS, 'save-bad.json')
writeFileSync(badPath, 'not a save file')
const input2 = await page.$('[data-testid="save-import-input"]')
await input2.uploadFile(badPath)
check(await until(() => document.body.innerText.includes('这不是存档文件')), '坏文件给出中文错误，不静默吞掉')
check(!(await page.$('[data-testid="save-import-confirm"]')), '坏文件不会出现「确认覆盖」按钮')

// ---- 6. 图鉴的「传说」一轨 ----
/*
 * 国别传说在开局介绍里就说过（`rumor`），地图上也钉着标记。
 * 但在这一节做出来之前，它**只在地图上**：兑现一次之后 `legendPending` 返回 null，
 * 标记消失、册子里一个字都查不到 —— "我到底找到过什么"没有下落。
 *
 * 【判据只能读册子本身】海图上就印着「归墟」两个字（NationLegend 的标记），
 * 拿 `body.innerText.includes('归墟')` 判"册子里写了它"会永远为真。
 * 所以这里只认 `<h4>` 小节标题与格子的 aria-label。
 */
const legendCell = () => page.evaluate(() =>
  [...document.querySelectorAll('button[aria-label]')]
    .map((b) => b.getAttribute('aria-label'))
    .find((a) => (a || '').startsWith('归墟')) ?? null)

await dismissDialogue()
await page.evaluate(() => {
  window.__gameStore.setState({ nation: 'china', collectedLegends: [], storyDone: ['china-1'], activePanel: 'event' })
})
/* 先等面板真的挂出来（上一段刚做过存档导入 + reload，面板是关着的），
   再点 tab —— 顺序反了就成了"点了一个还不存在的按钮"。 */
check(await until(() => document.querySelectorAll('[role=tab]').length === 3, 8000), '日志面板重新打开')
await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].find(b => b.textContent.includes('图鉴'))?.click())
check(await until((l) => [...document.querySelectorAll('h4')].some((h) => h.textContent.trim() === l), 8000, '传说'),
  '图鉴里有「传说」一节')
check((await legendCell())?.startsWith('归墟') === true,
  '未应验的传说也写出名字（不是「？」——玩家开局就听说过它）')
check((await legendCell() || '').includes('还没到过那片海'), '未应验的格子写明"还没到过那片海"')

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button[aria-label]')].find((x) => (x.getAttribute('aria-label') || '').startsWith('归墟'))
  b?.click()
})
check(await until(() => [...document.querySelectorAll('p')].some((p) => /传说还在那片海上。离你 [\d,]+ 海里。/.test(p.textContent || ''))),
  '点未应验的传说 → 给出真实距离（不写"还要几天"，那要走 routeFacts）')
check(await page.evaluate(() => window.__gameStore.getState().activePanel) === 'event',
  '给距离时册子还开着（否则这句回执跟着面板一起没了）')
const movedTo = await page.evaluate(() => window.__mapStore.getState().center)
check(Math.abs(movedTo[0] - 29.5) < 0.8 && Math.abs(movedTo[1] - 128.5) < 0.8,
  `海图挪到了传说海域（${movedTo.map(n => n.toFixed(1)).join(', ')}）`)

/* 兑现之后：同一格改成「已应验」，点开说出当时那句话 */
await page.evaluate(() => window.__gameStore.setState({ collectedLegends: ['guixu'] }))
check(await until(() => document.querySelectorAll('h4').length > 0 && document.body.innerText.includes('已应验')), '兑现后同一格改成「已应验」')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button[aria-label]')].find((x) => (x.getAttribute('aria-label') || '') === '归墟')
  b?.click()
})
check(await until((t) => [...document.querySelectorAll('p')].some((p) => (p.textContent || '').includes(t)), 6000, '罗盘针慢下来'),
  '点已应验的传说 → 说出当时那句话')

/*
 * 传说**不并进**全局「已点亮 N / M 格」：那一行数的是可收集的格子
 * （港口/成就/漂流物/遗物），与「航路」同一套处理 —— 各自带自己的进度。
 * 判据复用上面从数据层算出来的 atlasTotal，不写死数字。
 */
check(await until((n) => document.body.innerText.includes(`/ ${n} 格`), 6000, atlasTotal),
  '传说不并进全局格数（与航路一致，各自带进度）')
// ---- 7. 传说兑现那一刻：册子里必须多一页（走真路径，不直接改状态） ----
/*
 * 上面那几条是把 `collectedLegends` 直接写成已兑现（验的是"同一格的两态"）。
 * 这里走**真实路径**：把船开到那片海、结算一天，看册子会不会自己多一页。
 * 之前只有一条通知 + 一条三秒就走的横幅 —— 玩家回头看"这趟带回了什么"，
 * 里面没有它。而传说恰恰是最该被记下来的事。
 */
await page.evaluate(() => {
  window.__gameStore.setState({ collectedLegends: [], logbook: [], activePanel: null })
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...s.fleet, isSailing: true } })
  // 归墟在 (29.5, 128.5)，开进 90 海里圈内
  window.__gameStore.getState().setShipPosition([29.6, 128.4])
})
await page.evaluate(() => window.__gameStore.getState().advanceDay())
check(await until(() => window.__gameStore.getState().collectedLegends.includes('guixu'), 6000),
  '开进传说海域、结算一天 → 传说兑现')
{
  const pages = await page.evaluate(() => window.__gameStore.getState().logbook
    .filter(e => e.kind === 'legend')
    .map(e => ({ id: e.id, title: e.title, portId: e.portId })))
  check(pages.length === 1, `册子里多了一页（${pages.length} 页 legend）`)
  check(pages[0]?.id === 'legend-guixu' && /传说 · 归墟/.test(pages[0]?.title ?? ''),
    '页题是「传说 · 归墟」')
  /* 传说不属于哪座港：塞一个"最近的港"会让页面写着别处的图 —— 所以 portId 必须是 null，
     这一页没有配图（判据在下面按 DOM 再验一次）。 */
  check(pages[0]?.portId === null, '这一页不挂港口（portId = null，不冒充某座港的见闻）')
}
await page.evaluate(() => window.__gameStore.getState().setActivePanel('event'))
check(await until(() => !!document.querySelector('[data-testid="legend-entry"]'), 8000), '「见闻」页里能看到这一页')
{
  const card = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="legend-entry"]')
    return {
      text: (el?.innerText || '').replace(/\n+/g, ' | '),
      art: el ? el.querySelectorAll('[data-testid="logbook-art"]').length : -1,
    }
  })
  check(/传说 · 归墟/.test(card.text) && /罗盘针慢下来/.test(card.text), '页上有那句原文（不是一句通用说明）')
  check(card.art === 0, '这一页不配图（没有港口就没有画，不拿别处的油画顶上去）')
}
/* 再结算一天：同一片海不会写第二页（id 稳定 + legendPending 兑完返回 null） */
await page.evaluate(() => window.__gameStore.getState().advanceDay())
check(await until(() => window.__gameStore.getState().logbook.filter(e => e.kind === 'legend').length === 1, 6000),
  '再结算一天也不重复写页（同一片海只兑现一次）')

check(errors.length === 0, `全程 0 运行时错误${errors.length ? '（' + errors.slice(0, 2).join(' | ') + '）' : ''}`)

console.log(`\n航海日志 e2e：${pass} 通过 / ${fail} 失败`)
await browser.close()
if (fail > 0) process.exit(1)
