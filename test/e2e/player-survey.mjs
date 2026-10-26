// 玩家视角体验巡检：把玩家真正会看到的每个界面都截一张图
// 跑法：先起 dev server，再 `node test/e2e/player-survey.mjs`
// 目的：不是测功能对不对，而是看"玩家看到的画面"好不好
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots/player'

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)) })
await page.setViewport({ width: 1440, height: 900 })

const sleep = ms => new Promise(r => setTimeout(r, ms))
const shot = async name => { await page.screenshot({ path: `${SHOTS}/${name}.png` }); console.log('  📸', name) }

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2500)

console.log('① 标题页')
await shot('01-title')

// 开局向导
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /翻开日志/.test(x.textContent || ''))
  if (b) b.click()
})
await sleep(700)
await shot('02-intro-page1')

await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /继续/.test(x.textContent || ''))
  if (b) b.click()
})
await sleep(600)
await shot('03-intro-page2')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /继续/.test(x.textContent || ''))
  if (b) b.click()
})
await sleep(700)
await shot('04-trait-pick')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /商界血脉|铁壁舰长/.test(x.textContent || ''))
  if (b) b.click()
})
await sleep(500)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /扬帆起航/.test(x.textContent || ''))
  if (b) b.click()
})
await sleep(900)
await shot('05-intro-guide')
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /启航/.test(x.textContent || ''))
  if (b) b.click()
})
await sleep(1400)
await shot('06-tutorial')

// 关掉引导
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /跳过引导/.test(x.textContent || ''))
  if (b) b.click()
})
await sleep(900)
await shot('06-dialogue-opening')

// 推进对白
for (let i = 0; i < 5; i++) { await page.keyboard.press('Enter'); await sleep(500) }
await shot('07-map-main')

// 港口面板
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('title') || x.getAttribute('aria-label') || '') === '港口')
  if (b) b.click()
})
await sleep(900)
await shot('08-port-panel')
// 面板与侧栏是否重叠
const overlap = await page.evaluate(() => {
  const side = [...document.querySelectorAll('button')].find(b => (b.getAttribute('title')||'') === '港口')
  const panel = document.querySelector('.parchment-bg-dark, [class*=w-80]')
  const sb = side?.getBoundingClientRect()
  const pb = panel?.getBoundingClientRect()
  return { side: sb ? { l: Math.round(sb.left), r: Math.round(sb.right) } : null,
           panel: pb ? { l: Math.round(pb.left), r: Math.round(pb.right) } : null }
})
console.log('  侧栏/面板:', JSON.stringify(overlap))
await page.keyboard.press('Escape')
await sleep(500)

// 贸易面板
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('title') || x.getAttribute('aria-label') || '') === '交易')
  if (b) b.click()
})
await sleep(900)
await shot('09-trade-panel')
await page.keyboard.press('Escape')
await sleep(500)

// 舰队面板
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /舰队/.test(x.textContent || ''))
  if (b) b.click()
})
await sleep(900)
await shot('10-fleet-panel')
await page.keyboard.press('Escape')
await sleep(500)

// 任务面板
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('title') || x.getAttribute('aria-label') || '') === '任务')
  if (b) b.click()
})
await sleep(900)
await shot('11-task-panel')
await page.keyboard.press('Escape')
await sleep(500)

// 成就面板
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('title') || x.getAttribute('aria-label') || '') === '成就')
  if (b) b.click()
})
await sleep(900)
await shot('12-achievement-panel')
await page.keyboard.press('Escape')
await sleep(500)

// 对手面板
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /对手|竞争|航海家/.test(x.textContent || ''))
  if (b) b.click()
})
await sleep(900)
await shot('13-rival-panel')
await page.keyboard.press('Escape')
await sleep(500)

// 船厂
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /船坞|造船|船厂/.test(x.textContent || ''))
  if (b) b.click()
})
await sleep(900)
await shot('14-shipyard-panel')
await page.keyboard.press('Escape')
await sleep(500)

// 帮助
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /帮助|说明|手册/.test(x.textContent || ''))
  if (b) b.click()
})
await sleep(900)
await shot('15-help-panel')
await page.keyboard.press('Escape')
await sleep(500)

// 事件卡（用一个有真图的事件 + 一个 SVG 兜底事件）
for (const [id, tag] of [[236, '16-event-pirate-realimg'], [1, '17-event-storm-realimg']]) {
  await page.evaluate(async (eid) => {
    const mod = await import('/Age-of-Discovery/src/data/events.ts')
    const ev = mod.events.find(e => e.id === eid)
    window.__gameStore.getState().setCurrentEvent(ev)
  }, id)
  await sleep(900)
  await shot(tag)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /继续|确定|完成/.test(x.textContent || ''))
    if (b) b.click()
  })
  await sleep(600)
  await page.keyboard.press('Escape')
  await sleep(500)
}

// SVG 兜底场景（dolphin 有真图吗？看 SCENE_IMAGES：没有 dolphin）
for (const [id, tag] of [[21, '18-event-svg-fallback']]) {
  const found = await page.evaluate(async (eid) => {
    const mod = await import('/Age-of-Discovery/src/data/events.ts')
    const ev = mod.events.find(e => e.id === eid)
    if (!ev) return null
    window.__gameStore.getState().setCurrentEvent(ev)
    return ev.title
  }, id)
  if (found) {
    await sleep(900)
    await shot(tag)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /继续|确定|完成/.test(x.textContent || ''))
      if (b) b.click()
    })
    await sleep(500)
    await page.keyboard.press('Escape')
    await sleep(500)
  }
}

console.log('\n控制台错误：', errors.length)
errors.slice(0, 10).forEach(e => console.log('  ', e.slice(0, 160)))
await browser.close()
