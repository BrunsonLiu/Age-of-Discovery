// 航海志整屏：逐页截图，看版式是不是"一个界面"而不是窄条
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = 'http://localhost:5174/Age-of-Discovery/'
const SHOTS = '.workbuddy/shots'
mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 30000 })
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false,
    dialogueSeen: ['opening_pilot'], activePanel: null,
    logbook: [], claimedVictories: [], collectedDebris: [],
    discoveredPorts: [21, 12, 18, 11, 10, 6, 1, 2, 3],
    achievements: ['first_trade', 'merchant_1000', 'explorer_5', 'sailor_50'],
    factionRep: { crown: 95, guild: 55, scholars: 10, brethren: 35 },
    stats: { daysSailed: 42, trades: 38, eventsSurvived: 9, pirateWins: 2, bestDeal: 860, historySeen: 3 },
    eventLog: [
      { event: { id: 1, title: '海峡里的灯', type: 'discovery', choices: [{ text: '靠过去看看' }] }, choiceIndex: 0, outcome: { description: '你把灯记进了海图。', historicalNote: '灯塔在 18 世纪才普及，此前靠的是岸边篝火。' }, day: 4 },
      { event: { id: 2, title: '独眼玛格的仇人', type: 'crew', choices: [{ text: '拦下他' }, { text: '不管' }] }, choiceIndex: 1, outcome: { description: '玛格盯着罗盘一言不发。' }, day: 7 },
      { event: { id: 3, title: '季风转向', type: 'weather', choices: [{ text: '顺风走' }] }, choiceIndex: 0, outcome: { description: '帆鼓了一整天。' }, day: 7 },
    ],
    rivals: [
      { id: 'maria', name: '银币玛丽亚', title: '走私女王', style: 'aggressive', gold: 3200, fame: 64, portsFound: 9, lastAction: '她把一船胡椒卖进了里斯本' },
      { id: 'diego', name: '星眼迭戈', title: '航海家', style: 'explorer', gold: 2100, fame: 88, portsFound: 14, lastAction: '据说他看见了南边的海岸' },
      { id: 'blackjack', name: '老汤姆', title: '稳健船长', style: 'steady', gold: 1500, fame: 31, portsFound: 6, lastAction: '他在马六甲修船' },
    ],
    rivalNews: [
      { id: 1, rivalId: 'maria', day: 6, text: '玛丽亚在皇家港出手了一批火药，价钱高得离谱。' },
      { id: 2, rivalId: 'diego', day: 9, text: '迭戈的船在佛得角外抛锚了三天。' },
    ],
    activeTasks: [
      { id: 1, title: '驶向新世界', type: 'main', status: 'active', reward: { gold: 200, fame: 10 }, portId: 6, targetPortId: 1 },
      { id: 9, title: '送一船生丝去满剌加', type: 'trade', status: 'active', reward: { gold: 420, fame: 15 }, portId: 21, targetPortId: 21, requiredGoods: [{ goodId: 1, quantity: 5 }] },
    ],
    fleet: { ...s.fleet, currentPortId: 21, isSailing: false, day: 12, gold: 1500, fame: 42 },
  })
  window.__mapStore.getState().openLogbook('task')
})
await new Promise(r => setTimeout(r, 800))
// 关掉剧情对白层（大副立绘会整屏盖住，截图全是它）
await page.evaluate(() => {
  const d = window.__dialogueStore
  for (let i = 0; i < 8 && d?.getState?.().scriptId; i++) d.getState().skip()
})
await new Promise(r => setTimeout(r, 700))

for (const tab of ['task', 'journal', 'atlas', 'achievement', 'rival']) {
  await page.evaluate((t) => window.__mapStore.getState().setLogTab(t), tab)
  await new Promise(r => setTimeout(r, 450))
  await page.screenshot({ path: `${SHOTS}/logbook-${tab}.png` })
  const info = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="logbook-screen"]')
    const page = document.querySelector('[data-testid^="logbook-page-"]')
    return {
      screen: !!el,
      w: el ? Math.round(el.getBoundingClientRect().width) : 0,
      h: el ? Math.round(el.getBoundingClientRect().height) : 0,
      page: page?.getAttribute('data-testid'),
      chars: page ? (page.textContent || '').replace(/\s+/g, '').length : 0,
    }
  })
  console.log(tab.padEnd(12), `${info.w}x${info.h}`, info.page, `${info.chars} 字`)
}
await browser.close()
