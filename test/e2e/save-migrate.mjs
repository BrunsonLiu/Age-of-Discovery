// 老存档升级：v20 的档读进 v21 之后，不许丢数据、不许崩
//
// 跑法：先起 dev server，再 `node test/e2e/save-migrate.mjs`
//
// 【为什么单独守】V21 加了 `recentEvents`（事件防重复滑动窗口）。
// migrate 里给它补空数组 —— 但"补字段"这件事平时没有任何 e2e 碰得到：
// 单测只测纯函数，而迁移跑在 persist 的 rehydrate 里。
// 真要出错，表现是"老玩家一进游戏就白屏"，那是最贵的一种 bug。
//
// 这个套件做三件事：
//   1. 存一局 → 手动把存档降级成 v20（删掉 recentEvents、version 写 20）→ 刷新
//   2. 断言：recentEvents 补成了空数组、进度（天数/金币/已发现港口）没丢
//   3. 再存一次 → 断言 recentEvents 正常往返

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const SAVE_KEY = 'age-of-discovery-save'

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
const until = async (fn, ms = 15000) => {
  try { await page.waitForFunction(fn, { timeout: ms }); return true } catch { return false }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
check(await until(() => !!window.__gameStore), 'dev 状态钩子可用')

/* ---- 造一局有进度的存档 ---- */
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false,
    dialogueSeen: ['opening_pilot'], activePanel: null,
    logbook: [], claimedVictories: [], collectedDebris: [],
    discoveredPorts: [21, 12, 18],
    recentEvents: [204, 207, 236],
    fleet: { ...s.fleet, currentPortId: 12, isSailing: false, day: 42, gold: 1234 },
  })
})
await sleep(1200)  // 等 persist 落盘

const saved = await page.evaluate((k) => {
  const raw = localStorage.getItem(k)
  return raw ? JSON.parse(raw) : null
}, SAVE_KEY)
check(!!saved, '存档已写入 localStorage')
check(saved?.version >= 21, `存档版本 ${saved?.version}（≥21）`)
check(Array.isArray(saved?.state?.recentEvents) && saved.state.recentEvents.length === 3,
  `recentEvents 进了存档（${saved?.state?.recentEvents?.join(',') || '无'}）`)

/* ---- 手动降级成 v20：删掉 recentEvents、版本写回 20 ---- */
await page.evaluate((k) => {
  const raw = JSON.parse(localStorage.getItem(k))
  raw.version = 20
  delete raw.state.recentEvents
  localStorage.setItem(k, JSON.stringify(raw))
}, SAVE_KEY)
const downgraded = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY)
check(downgraded.version === 20 && downgraded.state.recentEvents === undefined, '已降级成 v20 存档（无 recentEvents）')

await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
check(await until(() => !!window.__gameStore), '刷新后 store 起来了（没白屏）')
await sleep(900)

const after = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return {
    recentEvents: s.recentEvents,
    day: s.fleet.day,
    gold: s.fleet.gold,
    port: s.fleet.currentPortId,
    discovered: s.discoveredPorts.length,
    phase: s.gamePhase,
  }
})
check(Array.isArray(after.recentEvents), `recentEvents 补成了数组（现 ${JSON.stringify(after.recentEvents)}）`)
check(after.recentEvents?.length === 0, '老存档没有事件记账 → 补空数组（不凭空编 id）')
check(after.day === 42, `天数没丢（${after.day}）`)
check(after.gold === 1234, `金币没丢（${after.gold}）`)
check(after.port === 12, `停靠港没丢（${after.port}）`)
check(after.discovered === 3, `已发现港口没丢（${after.discovered}）`)
check(after.phase === 'playing', `游戏阶段正常（${after.phase}）`)

/* ---- 迁移后再存一次：recentEvents 正常往返 ---- */
await page.evaluate(() => {
  window.__gameStore.setState(s => ({
    recentEvents: [101, 102],
    fleet: { ...s.fleet, day: 43 },
  }))
})
await sleep(1200)
const again = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), SAVE_KEY)
check(again?.state?.recentEvents?.join(',') === '101,102',
  `升级后的存档能正常写入（${again?.state?.recentEvents?.join(',') ?? '无'}）`)
check(again?.version >= 21, `存档版本升到 ${again?.version}`)
check(again?.state?.fleet?.day === 43, '升级后继续玩的数据一致')

check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail ? 1 : 0)
