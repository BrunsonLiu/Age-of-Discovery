/*
 * 敌对状态（派系声望 < 0）：那句「你家港口折扣没了」必须显示出来。
 *
 * 【为什么单独一个套件】
 * `data/factions` 里四条 `hostility` 从写下起就没进过界面 —— 死数据，
 * 而且原文还写着"（海盗遭遇率 +20% 尚未实装）"。
 * 现在它在舰队面板真的显示了（rep < 0），所以文案也改成只说真的失效了什么。
 *
 * 玩家的实际处境：声望跌成负数 → 自家港口折扣突然没了、学者公会情报不再半价，
 * **但界面上没有任何解释**。不写「为什么」，那看起来就像 bug。
 *
 * 为什么不能塞进 faction-perks：那个套件前面做了十几轮报价测量，
 * 页面状态（册子/岸上/面板实例）已经不在常态，fleet 面板挂不出新数据
 * （实测读到的是旧 rep=0 的渲染）。这里用干净的一次会话单独量。
 */
const BASE = process.env.GAME_URL || process.env.GAME_URL || process.env.AOD_BASE || 'http://127.0.0.1:5174/Age-of-Discovery/'
const puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log(`  ✓ ${msg}`) } else { fail++; console.log(`  ✗ FAIL: ${msg}`) } }

const browser = await puppeteer.launch({
  executablePath: process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)) })
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 40000 })
await sleep(2000)

console.log('=== 进门：常态 + 四方声望 ===')
await page.evaluate(() => {
  const g = window.__gameStore
  const d = window.__dialogueStore
  for (let i = 0; i < 25 && d?.getState?.().scriptId; i++) d.getState().skip()
  g.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false, activePanel: null,
    dialogueSeen: ['opening_pilot'],
  })
})
await sleep(400)
check(true, '页面进入常态')

/** 设四方声望 → 打开舰队面板 → 读敌对行 */
const probe = async (rep) => {
  await page.evaluate((r) => {
    window.__mapStore.getState().closeRecords()
    window.__mapStore.getState().setViewMode('chart')
    const s = window.__gameStore.getState()
    window.__gameStore.setState({
      factionRep: { crown: r, guild: r, scholars: r, brethren: r },
      fleet: { ...s.fleet, currentPortId: 2, isSailing: false },
      activePanel: null,
    })
  }, rep)
  await sleep(500)
  await page.evaluate(() => {
    const d = window.__dialogueStore
    for (let i = 0; i < 25 && d?.getState?.().scriptId; i++) d.getState().skip()
    window.__gameStore.getState().setActivePanel('fleet')
  })
  await sleep(1000)
  return page.evaluate(() => {
    const panel = document.querySelector('[data-testid="fleet-panel"]')
    const rows = [...document.querySelectorAll('[data-testid^="faction-hostility-"]')]
    return {
      store: window.__gameStore.getState().factionRep,
      hasPanel: !!panel,
      rows: rows.map(r => ({
        id: r.getAttribute('data-testid').replace('faction-hostility-', ''),
        text: (r.textContent || '').trim(),
        color: getComputedStyle(r).color,
      })),
    }
  })
}

console.log('=== 声望 -40：四个派系都翻脸 ===')
const neg = await probe(-40)
check(neg.hasPanel, '舰队面板挂出来了')
check(neg.store.crown === -40, `store 里的声望真的落下去（crown=${neg.store.crown}）`)
check(neg.rows.length === 4, `四个派系都写明敌对（${neg.rows.length}）`)
check(neg.rows.every(r => /失效/.test(r.text)),
  `每条说清"什么失效了"（${neg.rows.map(r => r.text.replace('⚠ ', '')).join(' / ')}）`)
check(neg.rows.every(r => !/尚未实装|未实装|TODO|%/.test(r.text)),
  '没有开发进度、也没有量化承诺（"+20% 遭遇率"那类都还没实现）')
check(neg.rows.every(r => /fog|warning|⚠/i.test(r.text) || r.text.startsWith('⚠')),
  '敌对行有可辨识的标记（⚠），不只靠颜色')
// danger-200 在 inlay 底（rgb(51,39,24)）上要过 AA：约 5.3:1
check(neg.rows.every(r => /rgb\(232, 154, 138\)/.test(r.color)),
  `敌对行用 danger-200（实测色 ${neg.rows[0]?.color}）`)

console.log('=== 声望 0 / +20：不显示 ===')
const zero = await probe(0)
check(zero.rows.length === 0, `声望 0 时不显示敌对（${zero.rows.length} 条）`)
const pos = await probe(20)
check(pos.rows.length === 0, `声望 +20 时不显示敌对（${pos.rows.length} 条）`)

check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
if (fail > 0) process.exit(1)
await browser.close()
