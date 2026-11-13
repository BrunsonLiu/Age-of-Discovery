// 事件结算屏：数字是这一屏唯一要读的东西
//
// 跑法：先起 dev server，再 `node test/e2e/event-result.mjs`
//
// 【为什么值得一条 e2e】结算屏是玩家唯一会认真看"我付出了什么"的地方。
// 原来每一行都是 12px 的等宽数字 —— 全场最重要的数字用了全屏最小的字号，
// 读起来像收据。这条守三件事：数值够大、行按变化量从大到小、中文名只有一个来源。

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 160)) })
await page.setViewport({ width: 1440, height: 900 })

let pass = 0, fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) }
  else { fail++; console.log('  ✗ FAIL:', msg) }
}
const until = async (fn, ms = 8000, ...args) => {
  try { await page.waitForFunction(fn, { timeout: ms }, ...args); return true } catch { return false }
}

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
check(await until(() => !!window.__gameStore, 20000), 'dev 状态钩子可用')
await page.evaluate(() => {
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false,
    dialogueSeen: ['opening_pilot'], activePanel: null,
  })
  window.__dialogueStore?.getState().skip()
})

// 用一个"一定会掉好几项"的事件：加勒比飓风
await page.evaluate(async () => {
  const imp = (p) => import(`/Age-of-Discovery/src/${p}`).catch(() => import(`/src/${p}`))
  const m = await imp('data/events.ts')
  const ev = m.events.find(x => x.id === 1) ?? m.events[0]
  window.__gameStore.setState({ currentEvent: ev, gamePhase: 'event' })
})
/* 等**选项按钮**真的挂出来（只看 button 数量会早于卡片渲染，点到侧栏上去） */
check(await until(() => [...document.querySelectorAll('button')]
  .some(b => b.getBoundingClientRect().width > 200 && b.innerText.includes('~'))), '事件卡与选项都出现')

/*
 * 选一个**不含小游戏**的选项：小游戏选项会先弹操舵界面（那条路径另有 e2e）。
 * 判据用按钮宽度 >200 且带 `~` 前缀（预览数字），这样不会点到关闭/侧栏上的钮。
 */
const picked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
    .filter(b => b.getBoundingClientRect().width > 200 && b.innerText.includes('~'))
  const b = btns[btns.length - 1] ?? btns[0]
  b?.click()
  return b ? b.innerText.replace(/\s+/g, ' ').slice(0, 24) : null
})
check(!!picked, `点到选项（${picked ?? '无'}）`)
check(await until(() => !!document.querySelector('[data-testid="event-delta"]')), '结算屏出现「资源变化」的行')

const rows = await page.evaluate(() => [...document.querySelectorAll('[data-testid="event-delta"]')].map(d => ({
  key: d.getAttribute('data-key'),
  value: Number(d.getAttribute('data-value')),
  size: parseFloat(getComputedStyle(d.lastElementChild).fontSize),
  label: d.firstElementChild.textContent.trim(),
})))
/* 每条判据都带 rows.length 前置：rows 为空时 every() 恒真，会让整段假绿 */
check(rows.length > 0 && rows.every(r => r.value !== 0),
  `列出 ${rows.length} 项变化，且没有 ±0 的行（结算屏不是报表）`)
check(rows.length > 0 && rows.every(r => r.size >= 16),
  `数值字号 ≥16px（最小 ${rows.length ? Math.min(...rows.map(r => r.size)) : '-'}px；原来是 12px）`)
{
  const abs = rows.map(r => Math.abs(r.value))
  const sorted = abs.length > 1 && abs.every((v, i) => i === 0 || abs[i - 1] >= v)
  check(sorted, `按变化量从大到小排（${abs.join(' / ') || '空'}）`)
}
check(rows.some(r => r.label === '耐久') && rows.some(r => r.label === '食物'),
  `中文名来自 RESOURCE_LABEL（看到 ${rows.map(r => r.label).join('、') || '空'}）`)

/* 继续 → 结算屏收起，事件关闭（不能留在"结果"上不动） */
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === '继续')
  b?.click()
})
check(await until(() => !document.querySelector('[data-testid="event-delta"]'), 8000), '点「继续」后结算屏收起')

check(errors.length === 0, `无页面错误${errors.length ? `（${errors.slice(0, 2).join(' | ')}）` : ''}`)
console.log(`\n事件结算屏 e2e：${pass} 通过 / ${fail} 失败`)
await browser.close()
if (fail > 0) process.exit(1)
