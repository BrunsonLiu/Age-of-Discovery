/**
 * 炮战敌舰：「对面是谁就画谁」。
 *
 * 【为什么要有这条】
 * 炮战原来只有一张敌舰图（皇家战舰 frigateWar），而**唯一**触发炮战的事件
 * 是 236「独眼玛格的仇人」—— 对手是海盗船长"红发"拉斐尔。也就是说：
 * 玩家在跟海盗开火，画面上却是一艘皇家战舰。素材表里 `pirate` 一直有，没人接。
 *
 * 这不属于"少一张图"，是"图用错了"。所以判据是**画面上的那张图**：
 *   · enemyShip: 'pirate' → 敌舰是 pirate.webp（黑帆骷髅）
 *   · 不声明（默认）      → 敌舰是 frigate_war.webp（白帆军徽）
 * 并且两张都要真的解码成功（只看 src 字符串不够：文件 404 时 src 照样在）。
 *
 * 跑法：先起 dev server，再 `node test/e2e/cannon-enemy.mjs`
 */
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default } catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) }
}

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
})

/**
 * 造一场炮战并读敌舰图。
 * `enemy` 传 undefined 表示"选项不声明 enemyShip"（走默认），
 * 这正是要验的两条分支之一。
 */
async function runCannon(enemy) {
  const page = await (await browser.createBrowserContext()).newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 120)))
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(2200)
  await page.evaluate(() => {
    window.__gameStore.setState({ gamePhase: 'playing', currentEvent: null })
    window.__mapStore.setState({ viewMode: 'chart' })
    window.__gameStore.getState().skipTutorial?.()
  })
  await sleep(1000)

  await page.evaluate((enemyShip) => {
    window.__gameStore.getState().setCurrentEvent({
      id: 99999, type: 'crew', sceneKey: 'pirate',
      title: '炮战敌舰探针', description: '只测敌舰图，不写档',
      choices: [{
        text: '开炮迎战',
        miniGame: 'cannon',
        ...(enemyShip ? { enemyShip } : {}),
        outcomes: [{
          probability: 1, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0,
          durabilityChange: 0, crewChange: 0, description: '探针结束。',
        }],
      }],
    })
  }, enemy)
  await sleep(1400)

  /* 选那个带炮战的选项 */
  const chose = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /开炮迎战/.test(x.textContent || ''))
    if (!b) return false
    b.click()
    return true
  })
  await sleep(1200)
  /* 小游戏有开场说明，点开始 */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /起帆|开始|迎风|Enter/i.test(x.textContent || ''))
    if (b) b.click()
  })
  await sleep(1600)

  const r = await page.evaluate(() => {
    const img = [...document.querySelectorAll('img')].find((i) => i.alt === '敌舰')
    return {
      found: !!img,
      file: img ? (img.getAttribute('src') || '').split('/').pop() : null,
      loaded: img ? img.complete && img.naturalWidth > 0 : false,
      px: img ? img.naturalWidth : 0,
      displayed: img ? Math.round(img.getBoundingClientRect().width) : 0,
    }
  })
  await page.close()
  return { ...r, chose, errors }
}

console.log('\n[炮战敌舰]')
{
  const pirate = await runCannon('pirate')
  check(pirate.chose, '进得了炮战（选项点得动）')
  check(pirate.found, '画面里有敌舰')
  check(pirate.file === 'pirate.webp', `声明 pirate → 画的是海盗船（实际 ${pirate.file}）`)
  check(pirate.loaded && pirate.px > 0, `敌舰图解码成功（${pirate.px}px 源，显示 ${pirate.displayed}px）`)
  check(pirate.errors.length === 0, `无页面错误${pirate.errors.length ? '：' + pirate.errors[0] : ''}`)
}
{
  const navy = await runCannon(undefined)
  check(navy.found, '不声明 enemyShip 时也有敌舰（默认分支）')
  check(navy.file === 'frigate_war.webp', `不声明 → 默认海军战舰（实际 ${navy.file}）`)
  check(navy.loaded, '默认敌舰图也解码成功')
}

await browser.close()
console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
if (fail > 0) process.exit(1)
