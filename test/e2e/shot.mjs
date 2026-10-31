// 截当前桌面画面，用于人眼判断排版与质感
// 跑法：`node test/e2e/shot.mjs [--vw=1440 --vh=900 --out=xx.png --clip=all|bottom|left|right]`
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default } catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default }
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const argOf = (k) => { const h = process.argv.find(a => a.startsWith(`--${k}=`)); return h ? h.split('=')[1] : undefined }
const VW = Number(argOf('vw') ?? 1440), VH = Number(argOf('vh') ?? 900)
const OUT = argOf('out') ?? '.workbuddy/shot.png'
const CLIP = argOf("clip") ?? "all"
const PANEL = argOf('panel')

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: VW, height: VH, deviceScaleFactor: Number(argOf("dsf") ?? 2) })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2500)
const clickIn = (ov, bt) => page.evaluate((o, b) => {
  const ovl = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')].find(x => new RegExp(o).test(x.textContent || ''))
  const btn = ovl && [...ovl.querySelectorAll('button')].find(x => new RegExp(b).test(x.textContent || ''))
  if (btn) btn.click()
}, ov, bt)
for (const [a, b] of [['翻开日志', '翻开日志'], ['塞维利亚港', '继续']]) { await clickIn(a, b); await sleep(450) }
await page.evaluate(() => document.querySelector('button[data-mode="captain"]')?.click()); await sleep(400)
await clickIn('你想怎么玩', '继续'); await sleep(700)
await page.evaluate(() => {
  const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /选择你的天赋/.test(x.textContent || ''))
  if (!o) return
  ;[...o.querySelectorAll('button')].filter(b => /商界血脉|铁壁舰长|魅力领袖|天生探险家|随船医生/.test(b.textContent || ''))[0]?.click()
}); await sleep(400)
await clickIn('扬帆起航', '扬帆起航'); await sleep(700)
await clickIn('第一次出航', '启航'); await sleep(1500)
await clickIn('跳过引导', '跳过引导'); await sleep(400)
await page.keyboard.press('Escape'); await sleep(400)
await page.keyboard.press('Escape'); await sleep(900)

// 可选：先打开某个侧板（--panel=port），用来截面板内部排版
if (PANEL) {
  await page.evaluate((t) => document.querySelector(`[data-tut="${t}"]`)?.click(), PANEL)
  await sleep(600)
}

const clipMap = {
  all: { x: 0, y: 0, width: VW, height: VH },
  bottom: { x: 0, y: VH - 70, width: VW, height: 70 },
  'bottom-left': { x: 0, y: VH - 70, width: 760, height: 70 },
  left: { x: 0, y: 60, width: 170, height: 520 },
  right: { x: VW - 460, y: 56, width: 460, height: 120 },
  top: { x: 0, y: 0, width: VW, height: 60 },
  year: { x: 0, y: 0, width: 180, height: 48 },
  res: { x: 560, y: VH - 48, width: 620, height: 48 },
  side: { x: 0, y: 330, width: 130, height: 250 },
  panelr: { x: VW - 400, y: 50, width: 400, height: VH - 110 },
  panell: { x: 0, y: 50, width: 420, height: VH - 110 },
}
await page.screenshot({ path: OUT, clip: clipMap[CLIP] ?? clipMap.all })
console.log('saved', OUT)
await browser.close()
