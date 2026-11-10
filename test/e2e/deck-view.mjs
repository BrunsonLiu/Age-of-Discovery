// 船上视角（第三空间）：能不能进、能不能站到甲板上走、甲板上的东西点不点得开
// （端到端）
//
// 跑法：先起 dev server，再 `node test/e2e/deck-view.mjs`
//   GAME_URL=...  EDGE_PATH=...  可覆盖默认路径
//
// 【守的是什么】船上视角是一整个空间（独立的 three 场景），单测只能守纯函数。
// 这一轮真正出过的事故全在"只有站上去才看得见"的那一层：
//   ① 船壳放样差一位 → 三角形斜着切过甲板（远看像船、站上去满地横带）；
//   ② 船的吃水太浅 → 浪峰盖住甲板，"脚下一大块淡蓝色的板"其实是海水；
//   ③ 舱口/舵轮的面板里自己算账 → 与出航计划对不上。
// 这里用真实鼠标走一遍：进视角 → 上甲板 → 往前走 → 点舱口 → 点舵轮，
// 并把面板上的数字与 store 对账。
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const ctx = await browser.createBrowserContext()
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (/favicon|AudioContext|net::ERR_/.test(t)) return
  errors.push('CONSOLE: ' + t.slice(0, 160))
})
await page.setViewport({ width: 1440, height: 900 })

let pass = 0
let fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) }
}

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2200)

// ---- 开场：点掉致辞与引导，直接进游戏（与其它 e2e 同一套剥遮罩流程）----
const clickText = async (re) => page.evaluate((src) => {
  const rx = new RegExp(src)
  const b = [...document.querySelectorAll('button')].filter((x) => x.getClientRects().length)
    .find((x) => rx.test((x.textContent || '').replace(/\s+/g, '')))
  if (!b) return false
  b.click()
  return true
}, re.source)
await clickText(/翻开日志/)
await sleep(400)
await clickText(/^继续$/)
await sleep(400)
await clickText(/^继续$/)
await sleep(500)
await page.evaluate(() => {
  const o = [...document.querySelectorAll('div.fixed.inset-0')].find((x) => /选择你的天赋/.test(x.textContent || ''))
  o && [...o.querySelectorAll('button')].filter((b) => /商界血脉|铁壁舰长|魅力领袖|天生探险家|随船医生/.test(b.textContent || ''))[0]?.click()
})
await sleep(500)
await clickText(/扬帆起航/)
await sleep(500)
await clickText(/启航/)
await sleep(1200)
await clickText(/跳过引导/)
await sleep(600)
for (let i = 0; i < 3; i++) { await page.keyboard.press('Escape'); await sleep(350) }
await page.addStyleTag({ content: '[role=dialog][aria-label$="的致辞"]{display:none!important}' })
await page.evaluate(() => {
  window.__gameStore.setState({ gamePhase: 'playing', currentEvent: null })
  window.__mapStore.setState({ viewMode: 'chart' })
})
await sleep(900)

// ---- ① 进船上视角 ----
const opened = await page.evaluate(() => {
  const b = document.querySelector('[data-testid=deck-view-toggle]')
  if (!b) return false
  b.click()
  return true
})
check(opened, '主屏上有「船上」入口')
// three 场景是懒加载的：轮询"场景真的建好了"，而不是固定等
let sceneReady = false
for (let i = 0; i < 40 && !sceneReady; i++) {
  await sleep(500)
  sceneReady = await page.evaluate(() => !!window.__deckScene && !!window.__deckCam)
}
check(sceneReady, '船上视角的 three 场景已建好（__deckScene 存在）')
check(await page.evaluate(() => !!document.querySelector('[data-testid=deck-view]')), 'deck-view 容器已挂载')
check(await page.evaluate(() => document.querySelectorAll('canvas').length >= 1), '画布已插入')

// ---- ② 上甲板：相机要落到人眼高度、并落在甲板范围内 ----
await page.evaluate(() => document.querySelector('[data-testid=deck-walk-toggle]')?.click())
await sleep(1500)
const walk0 = await page.evaluate(() => window.__deckWalk?.get())
check(!!walk0 && walk0.walking === true, '「上甲板」按钮真的切进行走模式')
check(await page.evaluate(() => /WASD/.test(document.body.innerText)), '行走提示（WASD）可见')

const standing = await page.evaluate(() => {
  const THREE = window.__THREE
  const scene = window.__deckScene
  const cam = window.__deckCam
  const ship = scene.getObjectByName('deck-ship')
  const inv = new THREE.Matrix4().copy(ship.matrixWorld).invert()
  const local = cam.position.clone().applyMatrix4(inv)
  return { x: +local.x.toFixed(2), y: +local.y.toFixed(2), z: +local.z.toFixed(2) }
})
// 人眼 = 甲板面 + 1.7 米；船体局部坐标里甲板在 1.32~1.94，所以 y 应在 3.0~3.7
check(standing.y > 2.9 && standing.y < 3.7, `相机在人眼高度（局部 y=${standing.y}，甲板 1.3~1.9 + 1.7）`)
check(Math.abs(standing.x) < 4.5 && Math.abs(standing.z) < 18, `相机站在甲板范围内（x=${standing.x} z=${standing.z}）`)

// ---- ③ 往前走：位置必须变，且不会走出甲板 ----
await page.keyboard.down('w')
await sleep(1600)
await page.keyboard.up('w')
await sleep(600)
const walk1 = await page.evaluate(() => window.__deckWalk?.get())
check(!!walk1 && Math.abs(walk1.z - walk0.z) + Math.abs(walk1.x - walk0.x) > 0.5,
  `按 W 后确实移动了（z ${walk0.z.toFixed(2)} → ${walk1.z.toFixed(2)}）`)

// ---- ④ 点舱口：面板出来，载重与 store 一致 ----
const spotClick = async (name, spot) => {
  const p = await page.evaluate((n) => {
    const THREE = window.__THREE
    const scene = window.__deckScene
    const cam = window.__deckCam
    const o = scene.getObjectByName(n)
    if (!o) return null
    const v = new THREE.Vector3()
    o.getWorldPosition(v)
    v.project(cam)
    if (v.z > 1) return null // 在相机后面
    return {
      x: Math.round(((v.x + 1) / 2) * window.innerWidth),
      y: Math.round(((-v.y + 1) / 2) * window.innerHeight),
    }
  }, name)
  if (!p) return { clicked: false, text: null }
  await page.mouse.click(p.x, p.y)
  await sleep(800)
  const text = await page.evaluate((s) => {
    const el = document.querySelector(`[data-testid=deck-spot-${s}]`)
    return el ? el.innerText.replace(/\s+/g, ' ') : null
  }, spot)
  return { clicked: true, text }
}

const hatch = await spotClick('ship-hatch', 'hatch')
check(hatch.clicked && !!hatch.text, '点甲板上的舱口 → 货舱面板打开')
if (hatch.text) {
  const st = await page.evaluate(() => {
    const g = window.__gameStore.getState()
    return {
      used: g.fleet.cargo.reduce((s, c) => s + c.quantity, 0),
      cap: g.fleet.ships.find((s) => s.id === g.fleet.flagshipId)?.capacity ?? g.fleet.ships[0].capacity,
      food: Math.round(g.fleet.food),
    }
  })
  check(hatch.text.includes(`${st.used}`) && hatch.text.includes(`${st.cap}`),
    `面板里的载重与 store 一致（${st.used}/${st.cap}）`)
  check(hatch.text.includes(`粮 ${st.food}`), `面板里的粮与 store 一致（${st.food}）`)
  check(!/金币|gold/i.test(hatch.text), '货舱面板不谈钱（与"不再扩展经济"的方向一致）')
}

// ---- ⑤ 点舵轮：转身，面板里的下一站必须与只读提示同源 ----
await page.evaluate(() => window.__deckWalk?.set({ x: 0.2, z: -5.2, yaw: Math.PI, pitch: -0.12 }))
await sleep(1200)
const wheel = await spotClick('ship-wheel', 'wheel')
check(wheel.clicked && !!wheel.text, '点船尾的舵轮 → 航向面板打开')
check(!!wheel.text && /下一站|航路还没定/.test(wheel.text), '舵轮面板给的是"下一站"而不是一串仪表读数')
check(!!wheel.text && /天/.test(wheel.text), '舵轮面板带天数（与出航计划同口径）')

// 收起面板
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /收起/.test(b.textContent || ''))?.click())
await sleep(400)
check(await page.evaluate(() => !document.querySelector('[data-testid^=deck-spot-]')), '「收起」能关掉面板')

// ---- ⑤b 抬头点桅顶瞭望台：面板里的能见度/风必须与 store 同源 ----
// 瞭望台在 17.2 米的桅盘上，站着看不见 —— 先把视线抬起来（俯仰上限 1.3 rad）。
await page.evaluate(() => window.__deckWalk?.set({ x: -2.4, z: -6.0, yaw: 0, pitch: 1.05 }))
await sleep(1400)
const crow = await spotClick('ship-crow', 'crow')
check(crow.clicked && !!crow.text, '爬到桅顶的瞭望台 → 瞭望面板打开')
if (crow.text) {
  const wx = await page.evaluate(() => {
    const g = window.__gameStore.getState()
    return { kind: g.weather.kind, windSpeed: Math.round(g.weather.windSpeed) }
  })
  const labels = { clear: '晴朗', cloudy: '阴云', rain: '落雨', storm: '暴风雨', fog: '浓雾' }
  check(crow.text.includes(labels[wx.kind]), `面板里的天候与 store 一致（${labels[wx.kind]}）`)
  check(crow.text.includes(`${wx.windSpeed} 节`), `面板里的风速与 store 一致（${wx.windSpeed} 节）`)
  check(/海里|视野里没有一片陆地/.test(crow.text), '瞭望台报的是真实距离，不是空话')
}
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /收起/.test(b.textContent || ''))?.click())
await sleep(400)

// ---- ⑥ 回海图：场景要真的被拆掉（不能留一个跑着的 rAF）----
await page.evaluate(() => document.querySelector('[data-testid=deck-view-close]')?.click())
await sleep(1200)
check(await page.evaluate(() => !document.querySelector('[data-testid=deck-view]')), '「回海图」关掉了船上视角')
check(await page.evaluate(() => !window.__deckScene), '关闭时把 __deckScene 清掉了（资源确实释放）')

check(errors.length === 0, `无运行时错误（${errors.length} 条：${errors.slice(0, 2).join(' | ')}）`)

console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
