/*
 * 行情速报的**外观语义**：它是一条赚钱机会，不是一个警告。
 *
 * 【为什么单独量】
 * `useGameStore` 到港时生成一条通知（每个港一次，记在 seenMarketTips）。
 * 原来写的是 `type: 'warning'` —— 红框 + 三角警告图标 —— 而内容是
 * "某港正高价收购香料，运来此处出手最划算"。玩家看到红色警告会以为出事了。
 * 标题里还挂了 📜，可左边本来就有 18px 的线性图标，等于两套图标并排。
 *
 * 判据取向：不看 class 名（class 会变），看**实测颜色 + 图标形状 + 文本**。
 *   · 边框不能是红系（红 = 真坏消息，留给 warning）
 *   · 左侧图标必须是 Coins 那条路径（lucide 的 class 是 `lucide-coins`）
 *   · 标题里不许有 emoji 码点
 */
const BASE = process.env.GAME_URL || process.env.GAME_URL || process.env.AOD_BASE || 'http://127.0.0.1:5174/Age-of-Discovery/'
const puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log(`  ✓ ${msg}`) } else { fail++; console.log(`  ✗ FAIL: ${msg}`) } }

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 40000 })
await sleep(2000)

console.log('=== 到港一次，看它自己生成的那条 ===')
await page.evaluate(async () => {
  const g = window.__gameStore
  const d = window.__dialogueStore
  for (let i = 0; i < 25 && d?.getState?.().scriptId; i++) d.getState().skip()
  g.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false, activePanel: null,
    dialogueSeen: ['opening_pilot'],
    // 清空"看过的行情"，让到港必然生成一条；同时清掉可能残留的通知
    seenMarketTips: [],
    notifications: [],
  })
  /*
   * 行情速报在 `discoverPort` 里生成，**不是** arriveAtPort ——
   * 它是"第一次到这座港，发现这里缺什么"的资讯。
   * 所以先把它从 discoveredPorts 里摘掉，再"发现"一次。
   */
  g.setState({ discoveredPorts: [] })
  await new Promise(r => setTimeout(r, 200))
  g.getState().discoverPort(6)   // 塞维利亚：本港便宜、目标港有渴求，行情池一定非空
})
await sleep(1000)

const notif = await page.evaluate(() => {
  const st = window.__gameStore.getState()
  const m = (st.notifications || []).find(n => /行情速报/.test(n.title))
  if (!m) return { found: false, all: (st.notifications || []).map(n => `${n.type}:${n.title}`) }
  return { found: true, type: m.type, title: m.title, message: m.message }
})
check(notif.found, `到港真的生成了一条行情速报（${notif.found ? '' : '实际通知 ' + JSON.stringify(notif.all)}）`)
check(notif.type === 'market', `数据里 type 是 market（实际 ${notif.type}）`)

const emoji = (notif.title || '').match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)
check(!emoji, `标题里没有彩色 emoji（实际 ${notif.title}）`)

console.log('\n=== 画到屏幕上：边框色 / 图标 / 文本 ===')
// 通知 3 秒后自动收；这条刚生成，抓紧读
const skin = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('div')].filter(d =>
    /行情速报/.test(d.textContent || '') && d.querySelector('svg') && (d.className || '').toString().includes('border'))
  const card = cards.sort((a, b) => a.textContent.length - b.textContent.length)[0]
  if (!card) return null
  const cs = getComputedStyle(card)
  const svg = card.querySelector('svg')
  return {
    border: cs.borderTopColor,
    iconCls: (svg?.getAttribute('class') || ''),
    title: (card.querySelector('div div')?.textContent || '').trim(),
  }
})
check(!!skin, '通知卡在 DOM 里渲染出来了')
if (skin) {
  // 红系：danger/red 的 R 通道明显高于 G/B。实测 warning 是 rgb(248,113,113)
  const m = skin.border.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  const [r, g, b] = m ? [+m[1], +m[2], +m[3]] : [0, 0, 0]
  check(!(r > 180 && g < 140 && b < 140),
    `边框不是红系（${skin.border}）—— 行情是机会，不是警告`)
  check(/coins/i.test(skin.iconCls), `左侧图标是 Coins（class ${skin.iconCls.trim()}）`)
  check(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(skin.title), `卡片上的标题没有 emoji（${skin.title}）`)
}

// 留一张图给人工复核（通知 3 秒后自动收，这里截图时它还在）
await page.screenshot({ path: '.workbuddy/shots/market-toast.png' })

check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail ? 1 : 0)
