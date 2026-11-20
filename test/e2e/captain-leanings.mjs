/*
 * 册子「船长」页的取向五轴：改累积值，卡片真的跟着变。
 *
 * 【为什么是活性测试】五张卡的文案是数据表里抄来的，写死也能通过
 * "五张卡都在"这种断言。真正要证的是：`notoriety` 一变，
 * 点阵格数、已成的金框、右上那句「正在成为」都跟着变。
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

/** 设一组取向值并把册子翻到船长页 */
const openWith = async (notoriety) => {
  await page.evaluate((n) => {
    const g = window.__gameStore
    const d = window.__dialogueStore
    for (let i = 0; i < 25 && d?.getState?.().scriptId; i++) d.getState().skip()
    g.setState({
      gamePhase: 'playing', tutorialStep: -1, showHelp: false, activePanel: null,
      dialogueSeen: ['opening_pilot'], notoriety: n,
    })
    window.__mapStore.getState().openLogbook('rival')
  }, notoriety)
  await sleep(900)
  // 册子是全屏浮层，对白（z=75）会盖住它 —— 收掉再量
  await page.evaluate(() => {
    const d = window.__dialogueStore
    for (let i = 0; i < 25 && d?.getState?.().scriptId; i++) d.getState().skip()
  })
  await sleep(500)
}

const read = async () => page.evaluate(() => {
  const root = document.querySelector('[data-testid="captain-leanings"]')
  if (!root) return null
  const cards = [...root.querySelectorAll('[data-testid^="leaning-"]')]
  return {
    hasRoot: true,
    // 只取右上那一个 span：整块 textContent 会把五张卡的文字一起吸进来
    lead: (root.querySelector('.ml-auto')?.textContent || '').trim(),
    cards: cards.map(c => {
      const r = c.getBoundingClientRect()
      const dots = [...c.querySelectorAll('span[aria-hidden="true"] span, .rounded-full')]
      return {
        axis: c.getAttribute('data-testid').replace('leaning-', ''),
        done: c.getAttribute('data-done') === '1',
        lead: c.getAttribute('data-lead') === '1',
        value: Number(c.getAttribute('data-value')),
        h: Math.round(r.height),
        filled: [...c.querySelectorAll('span')].filter(s => /bg-gold-(300|500)/.test(s.className || '')).length,
        text: (c.textContent || '').replace(/\s+/g, ' ').trim(),
        dots: dots.length,
      }
    }),
  }
})

console.log('=== 一格都没走 ===')
await openWith({ cruel: 0, mercy: 0, greed: 0, bold: 0, secret: 0 })
const zero = await read()
check(!!zero?.hasRoot, '船长页出现「你会被记成哪种船长」区块')
check(zero.cards.length === 5, `五条取向都渲染（${zero.cards?.length}）`)
check(zero.cards.every(c => !c.done && !c.lead), '一格都没走：没有已成的，也没有「正在成为」')
check(/还没定/.test(zero.lead), `右上明说还没定（"${zero.lead}"）`)
check(zero.cards.every(c => c.filled === 0), '点阵全暗（没有假装走了一格）')
check(new Set(zero.cards.map(c => c.h)).size === 1,
  `五张卡等高（${[...new Set(zero.cards.map(c => c.h))].join('/')}px）`)

console.log('=== 仁慈 3：刚好授衔 ===')
await openWith({ cruel: 1, mercy: 3, greed: 0, bold: 2, secret: 1 })
const some = await read()
const mercy = some.cards.find(c => c.axis === 'mercy')
check(!!mercy && mercy.done && mercy.lead,
  `慈悲心已成且是主导（done=${mercy?.done} lead=${mercy?.lead}）`)
check(!!mercy && mercy.filled === 3, `慈悲心点阵满 3 格（实际 ${mercy?.filled}）`)
check(/正在成为 · 慈悲心/.test(some.lead), `右上写「正在成为 · 慈悲心」（"${some.lead}"）`)
check(some.cards.filter(c => c.done).length === 1, '只有一条已成（别的都没到阈值）')
const bold = some.cards.find(c => c.axis === 'bold')
check(!!bold && bold.filled === 2 && !bold.done,
  `海上赌徒点亮 2 格但未成（${bold?.filled}/3）`)

console.log('=== 冷酷 5：越过阈值后仍是的「已成」 ===')
await openWith({ cruel: 5, mercy: 2, greed: 0, bold: 0, secret: 0 })
const over = await read()
const cruel = over.cards.find(c => c.axis === 'cruel')
check(!!cruel && cruel.done && cruel.lead, '铁腕者已成且为当前主导')
check(!!cruel && cruel.filled === 3, `点阵封顶 3 格（实际累积 5，不画出 5 格）`)
check(/正在成为 · 铁腕者/.test(over.lead), `右上跟着换（"${over.lead}"）`)
check(!over.cards.some(c => c.axis === 'greed' && c.done), '贪婪者仍是 0/3')

console.log('=== 界面语言 ===')
check(!over.cards.some(c => /实装|占位|TODO/.test(c.text)),
  '卡片文案里没有开发者词（"实装/占位"这类曾经真的印在卡上）')
check(over.cards.every(c => !/undefined|NaN/.test(c.text)), '没有 undefined/NaN')

check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
if (fail > 0) process.exit(1)
await browser.close()
