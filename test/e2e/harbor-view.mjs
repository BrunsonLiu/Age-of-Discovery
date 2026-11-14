// 岸上视角：第二个空间 / 三层景深 / 键盘退路 / 出航自动回 / 移动端可达
//
// 跑法：先起 dev server（npx vite --port 5174 --host 127.0.0.1），
//      再 `node test/e2e/harbor-view.mjs`
// 重点：真实鼠标点服务按钮（走命中测试，能抓出被浮卡遮挡），
//      不靠截图判断文字，DOM 里读 rect / computedStyle / store。

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'
mkdirSync(SHOTS, { recursive: true })

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
const text = () => page.evaluate(() => document.body.innerText)
const until = async (fn, ms = 6000, ...args) => {
  try { await page.waitForFunction(fn, { timeout: ms }, ...args); return true } catch { return false }
}
const mode = () => page.evaluate(() => window.__mapStore?.getState().viewMode)
const state = () => page.evaluate(() => {
  const s = window.__gameStore.getState()
  const m = window.__mapStore.getState()
  return { isSailing: s.fleet.isSailing, currentPortId: s.fleet.currentPortId, panel: s.activePanel, center: m.center, selectedPortId: m.selectedPortId }
})

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
check(await until(() => !!window.__gameStore), 'dev 状态钩子可用')
await page.evaluate(() => window.__gameStore.setState({
  gamePhase: 'playing', tutorialStep: -1, showHelp: false,
  dialogueSeen: ['opening_pilot'], activePanel: null,
  logbook: [], claimedVictories: [], collectedDebris: [],
}))
await until(() => !document.body.innerText.includes('选择你的船长天赋'))

// ---- 1. 起点与入口 ----
check(await mode() === 'chart', '默认在海图（岸上不自动弹出）')
check(!(await page.$('[data-testid="harbor-view"]')), '初始没有岸上视图')
await page.evaluate(() => window.__gameStore.setState({ activePanel: 'port' }))
check(await until(() => !!document.querySelector('[data-testid="harbor-enter"]')), '港口面板里给出「上岸走走」入口')
await page.click('[data-testid="harbor-enter"]')
check(await until(() => !!document.querySelector('[data-testid="harbor-view"]')), '点入口 → 进入岸上视角')
check(await mode() === 'harbor', 'viewMode 真的切成 harbor')

// ---- 2. 三层景深确实存在 ----
const layers = await page.evaluate(() => {
  const R = sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) } }
  const img = document.querySelector('[data-testid="harbor-backdrop"]')
  return {
    backdrop: R('[data-testid="harbor-backdrop"]'),
    natural: img ? [img.naturalWidth, img.naturalHeight] : null,
    plate: R('[data-testid="harbor-arrival-plate"]'),
    services: R('[data-testid="harbor-services"]'),
    svg: !!document.querySelector('[data-testid="harbor-quay"]'),
    mapEvents: getComputedStyle(document.querySelector('[data-testid="chart-layer"]')).pointerEvents,
    serviceButtons: [...document.querySelectorAll('[data-testid^="harbor-service-"]')].length,
  }
})
check(layers.backdrop && layers.backdrop.w >= 1400 && layers.backdrop.h >= 880,
  `远景港口图铺满画面（${layers.backdrop?.w}×${layers.backdrop?.h}），不再是 294×96 的缩略条`)
// 远景必须走"全景图"这条路：面板里那张 96px 缩略图（原生 800×220 插值到 1600）
// 铺满整屏就是一团涂抹。判据看两件事——读的是哪张、原生宽是否够（不写死文件名，
// 以后换新全景只要原生宽达标就自动通过）。
// 先等图真的解码完再断言。全链里前面几个脚本会占满 CPU（map3d 走 swiftshader），
// 400KB 的背景图解码能拖到 2s 以上，固定等待就会读到 naturalWidth=0 而误报"加载失败"。
await until(() => {
  const i = document.querySelector('[data-testid="harbor-backdrop"]')
  return !!i && i.complete && i.naturalWidth > 0
}, 8000)
const bk = await page.evaluate(() => {
  const img = document.querySelector('[data-testid="harbor-backdrop"]')
  if (!img) return null
  const r = img.getBoundingClientRect()
  const scale = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight)
  return {
    url: (img.currentSrc || img.src).split('/').pop(),
    naturalW: img.naturalWidth,
    naturalH: img.naturalHeight,
    // 有效像素密度 = 原生宽 ÷ 实际铺开宽。<1 就是被放大（糊）
    density: +(img.naturalWidth / (img.naturalWidth * scale)).toFixed(3),
    srcChanged: img.complete && img.naturalWidth > 0,
  }
})
check(bk?.srcChanged, '远景图真的加载成功（不是空 src 或 404）')
check(bk?.url === 'harbor_europe.webp', `远景读的是全景图（${bk?.url}）`)
check(bk?.naturalW >= 1600, `全景图原生宽 ≥1600（实测 ${bk?.naturalW}×${bk?.naturalH}）`)
check(bk?.density >= 0.8, `1440 屏下基本不放大（有效密度 ${bk?.density}，<1 即放大）`)

/*
 * 【画面别被压成一团褐】这是接完高清素材后最容易白干的地方：
 * 图换对了、加载成功、密度也够，但 filter + 两层暗角叠下去，
 * 玩家屏幕上只剩一块糊。实测判据取**玩家真能看见的边缘条带**
 * （中间两块面板把画面盖住了，拿中心采样等于量面板）。
 * 改前右下水面亮度只有 0.08，改后 0.107，取 0.12 当门限会误伤，
 * 所以按"至少不是纯黑"取 0.10，并额外要求 grain（标准差）≥0.03 有纹理。
 */
{
  /*
   * 【截图前必须等淡入动画真的结束】HarborView 的整屏容器是 opacity 0→1 的
   * 入场动画（enterStyle，DURATION.grand）。前面几个脚本跑完 3D 软渲染后 CPU 很满，
   * 这个动画会被拖慢；只等「背景图 complete + naturalWidth>0」不够——图解码完
   * 不等于已经合成到屏幕。实测有一次截图落在半透明帧上：背景被底色 #140d06
   * 稀释，最暗带从 0.146 掉到 0.079、grain 从 0.05 掉到 0.016，
   * 下面三条判据一起假红（单独重跑又 60/0）。
   * 等一个客观信号：容器 opacity 到 1，再等两帧 rAF 让新帧真正画出来。
   */
  await until(() => {
    const v = document.querySelector('[data-testid="harbor-view"]')
    const img = document.querySelector('[data-testid="harbor-backdrop"]')
    if (!v || !img) return false
    return +getComputedStyle(v).opacity >= 0.999 && img.complete && img.naturalWidth > 0
  }, 12000)
  await page.evaluate(() => new Promise(res =>
    requestAnimationFrame(() => requestAnimationFrame(res))))
  const shot = await page.screenshot()
  const zones = await page.evaluate(async (b64) => {
    const im = new Image()
    im.src = 'data:image/png;base64,' + b64
    await im.decode()
    const c = document.createElement('canvas')
    c.width = im.naturalWidth; c.height = im.naturalHeight
    const ctx = c.getContext('2d')
    ctx.drawImage(im, 0, 0)
    const pick = (x0, y0, x1, y1) => {
      const x = Math.round(x0 * c.width), y = Math.round(y0 * c.height)
      const w = Math.max(1, Math.round((x1 - x0) * c.width))
      const h = Math.max(1, Math.round((y1 - y0) * c.height))
      const d = ctx.getImageData(x, y, w, h).data
      const vals = []
      for (let i = 0; i < d.length; i += 4) {
        vals.push((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255)
      }
      const mean = vals.reduce((a, v) => a + v, 0) / vals.length
      const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length)
      return { mean: +mean.toFixed(3), grain: +sd.toFixed(3) }
    }
    // 取样块必须避开三样东西：两侧栏（半透明深底会拉低均值）、
    // 两块内容板、底部前景剪影。y 0.50~0.66 是唯一干净的一带。
    return { 码头人群: pick(0.13, 0.50, 0.40, 0.66), 水面船队: pick(0.55, 0.50, 0.88, 0.66) }
  }, shot.toString('base64'))
  const worst = Math.min(...Object.values(zones).map(z => z.mean))
  const worstName = Object.entries(zones).sort((a, b) => a[1].mean - b[1].mean)[0][0]
  // 门限只用来判"图有没有被压成黑"：实测 0.146~0.179（同一构建多次采样，
  // 差在动画相位），压回旧暗角是 0.11。两者太近，把门限卡在 0.13 会偶发误报，
  // 所以这里守 0.10，**参数本身**由单测源码守卫管（brightness ≥0.85、暗角 <0.80）。
  check(worst >= 0.10, `可见的景没被压成黑（最暗 ${worstName} ${worst}；旧暗角下是 0.11）`)
  // grain 门限只用来判"整片平色"：深海帆船剪影这类深色主体本身层次就少
  // （实测 0.023 ≈ 6/255，肉眼能分出桅杆与索具），压平会掉到 0.01 以下。
  // 所以门限取 0.015，真正的纹理强度另看最大那块（石墙 0.10）。
  const grains = Object.values(zones).map(z => z.grain)
  check(Math.min(...grains) >= 0.015,
    `画面没有整片平色（grain ${grains.join(' / ')}）`)
  check(Math.max(...grains) >= 0.04,
    `近景仍有可辨的纹理（grain 最大 ${Math.max(...grains)}）`)
}
check(layers.plate && layers.services, '中景两块内容板都在')
/*
 * 前景是**我们脚下的码头**（石砌铺装 + 系缆桩 + 货物 + 灯），不是一块纯黑矩形。
 * 判据不是"那个 svg 在不在"（它一直在），而是**石面上真的有多块色阶**：
 * 上一版是一条 std 0.00 的纯色横带 —— 屏幕上量得出来，代码里看不出来。
 */
{
  const band = await page.evaluate(() => {
    const q = document.querySelector('[data-testid="harbor-quay"]')
    const r = q.getBoundingClientRect()
    /* 水线 = 石面底板那条 rect 的上沿（svg 盒子的上沿在 0.70，那是给人和灯留的空） */
    const deck = q.querySelector('rect[fill="#100b06"]')
    const d = deck.getBoundingClientRect()
    return {
      slabs: q.querySelectorAll('path[fill^="#2"], path[fill^="#3"]').length,
      top: +(d.y / innerHeight).toFixed(3),
      bottom: +((r.bottom / innerHeight)).toFixed(3),
    }
  })
  check(layers.svg && band.slabs >= 60, `前景码头是石砌铺装（${band.slabs} 块石面，不是一块纯色）`)
  check(band.top >= 0.78 && band.top <= 0.86 && band.bottom >= 0.99,
    `水线在 0.78~0.86、石面铺到屏幕最底（${band.top.toFixed(2)} ~ ${band.bottom.toFixed(2)}）`)
}
check(layers.mapEvents === 'none', '岸上时地图层关掉命中测试，点岸上不会穿透设航点')
check(layers.serviceButtons === 5, '本港 5 个服务入口齐全')
await page.screenshot({ path: `${SHOTS}/harbor-e2e-desktop.png` })

// ---- 3. 真实鼠标点服务按钮：能点开面板，且岸上视图仍在（第三层） ----
await page.click('[data-testid="harbor-service-trade"]')
check(await until(() => window.__gameStore.getState().activePanel === 'trade'), '真实鼠标点「商行」→ 贸易面板打开（没被浮卡挡住）')
check(await mode() === 'harbor', '面板浮在岸上画面之上，不把玩家踢回海图')
// Esc 一层层退：先关面板，再离开岸上
await page.keyboard.press('Escape')
check(await until(() => window.__gameStore.getState().activePanel === null), '第一次 Esc 只关面板')
check(await mode() === 'harbor', '第一次 Esc 不退岸上（不会退得太远）')
await page.keyboard.press('Escape')
check(await until(() => window.__mapStore.getState().viewMode === 'chart'), '第二次 Esc 才回海图')

// ---- 4. A 键切换 ----
await page.keyboard.press('a')
check(await until(() => window.__mapStore.getState().viewMode === 'harbor'), '停泊时按 A 上岸')
await page.keyboard.press('a')
check(await until(() => window.__mapStore.getState().viewMode === 'chart'), '再按 A 回海图')

// ---- 4b. 空间入口：海图上开、岸上关（两张脸各在自己的屏上） ----
/*
 * 【为什么不再是"一个双向开关"】
 * 岸上是整屏界面（harbor-view 不透明、连罗盘都收起来了），侧栏那一列根本不在 DOM 里 ——
 * 开关的"回海图"态玩家一辈子看不到，却还挂着一个常驻按钮占位。
 * 现在：海图侧栏给「上岸走走」（航行中禁用）；回程用岸上自己的「回海图 · 准备出航」。
 */
{
  check(!!(await page.$('[data-testid="view-mode-switch"]')), '海图侧栏有常驻的「上岸走走」入口')
  check(await page.evaluate(() => document.querySelector('[data-testid="view-mode-switch"]')?.getAttribute('aria-label')) === '上岸走走',
    '它只是入口，不假装自己是双向开关')
  await page.click('[data-testid="view-mode-switch"]')
  check(await until(() => window.__mapStore.getState().viewMode === 'harbor'), '点它 → 上岸')
  check(await page.evaluate(() => !document.querySelector('[data-testid="view-mode-switch"]')),
    '岸上整屏里不再挂那颗开关（它的"回海图"态从来没人看得见）')
  check(!!(await page.$('[data-testid="harbor-back-to-chart"]')), '岸上有自己的「回海图 · 准备出航」')
  await page.click('[data-testid="harbor-back-to-chart"]')
  check(await until(() => window.__mapStore.getState().viewMode === 'chart'), '从岸上回到海图')
  const atSea = await page.evaluate(async () => {
    const s = window.__gameStore.getState()
    window.__gameStore.setState({ fleet: { ...s.fleet, isSailing: true } })
    await new Promise(r => setTimeout(r, 150))
    const b = document.querySelector('[data-testid="view-mode-switch"]')
    return { disabled: !!b?.disabled, title: b?.getAttribute('title') ?? '' }
  })
  check(atSea.disabled && /靠岸后/.test(atSea.title), '航行中是明确禁用态 + 原因说明，不是「点了没反应」')
  await page.evaluate(() => {
    const s = window.__gameStore.getState()
    window.__gameStore.setState({ fleet: { ...s.fleet, isSailing: false } })
  })
}

// ---- 5. 到港带回的一页 / 线索只移地图 ----
await page.evaluate(() => {
  window.__gameStore.setState({ activePanel: null, logbook: [] })
  window.__gameStore.getState().arriveAtPort(1)
  window.__mapStore.getState().setViewMode('harbor')
})
check(await until(() => document.querySelector('[data-testid="harbor-arrival-plate"] h1')?.textContent?.includes('哈瓦那')),
  '岸上显示当前港名（读 h1，不靠全文匹配）')
check(await until(() => /第 \d+ 天写下的一页/.test(document.body.innerText)), '岸上直接展示这趟带回的那一页见闻')
check(!!(await page.$('[data-testid="harbor-clue"]')), '见闻里的线索给了可点的「在地图上看看」')
const beforeClue = await state()
await page.click('[data-testid="harbor-clue"]')
check(await until(() => window.__mapStore.getState().viewMode === 'chart'), '点线索回海图')
const afterClue = await state()
check(afterClue.isSailing === false && afterClue.currentPortId === beforeClue.currentPortId,
  '点线索只移地图，没有替玩家出航')
check(afterClue.center[0] !== beforeClue.center[0] || afterClue.center[1] !== beforeClue.center[1],
  '地图中心确实移到了线索指向的港口')

// ---- 5b. 第二趟回同一港：累积痕迹必须看得见 ----
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  // 同天同港会按 id 去重，推进一天才是真正的「下一趟」
  window.__gameStore.setState({ fleet: { ...s.fleet, day: s.fleet.day + 1 } })
  window.__gameStore.getState().arriveAtPort(1)
  window.__mapStore.getState().setViewMode('harbor')
})
check(await until(() => document.body.innerText.includes('第 2 次靠岸')), '铭牌写出「第 2 次靠岸」')
check(!!(await page.$('[data-testid="harbor-previous-visit"]')), '上一趟留下的那页摆在见闻板里')
await page.click('[data-testid="harbor-previous-visit"]')
check(await until(() => window.__mapStore.getState().recordsOpen), '点「上一趟」真的翻开航海志（整屏浮层）')
check(await mode() === 'harbor', '翻日志不把玩家踢回海图')
await page.keyboard.press('Escape')
await until(() => window.__mapStore.getState().recordsOpen === false)

// ---- 6. 出航自动回海图 / 航行中不能上岸 ----
await page.evaluate(() => window.__mapStore.getState().setViewMode('harbor'))
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...s.fleet, isSailing: true } })
})
check(await until(() => window.__mapStore.getState().viewMode === 'chart'), '船一离港自动回海图')
await page.keyboard.press('a')
check(await mode() === 'chart', '航行中按 A 不会上岸（视角不撒谎）')
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...s.fleet, isSailing: false, currentPortId: 6 } })
})

// ---- 7. 靠岸邀请条：只在「刚从海上回来」的下降沿出现 ----
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...s.fleet, isSailing: true } })
})
await new Promise(r => setTimeout(r, 150))
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...s.fleet, isSailing: false } })
})
check(await until(() => !!document.querySelector('[data-testid="harbor-invite"]')), '航行→停泊那一下出现靠岸邀请')
await page.click('[data-testid="harbor-invite-enter"]')
check(await until(() => window.__mapStore.getState().viewMode === 'harbor'), '邀请条上的「上岸走走」真的能进')
check(!(await page.$('[data-testid="harbor-invite"]')), '进岸上后邀请条收起，不叠在画面上')
await page.evaluate(() => window.__mapStore.getState().setViewMode('chart'))
// 再来一次，验关闭按钮
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...s.fleet, isSailing: true } })
})
await new Promise(r => setTimeout(r, 150))
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...s.fleet, isSailing: false } })
})
await until(() => !!document.querySelector('[data-testid="harbor-invite"]'))
await page.click('[data-testid="harbor-invite-close"]')
check(!(await page.$('[data-testid="harbor-invite"]')), '邀请条可以手动收起')

/*
 * 【岸上 → 船】这一步守的是"两个空间接得上"：
 * 岸上那张 1600×900 是画的（素材本身就是远景），但船那头是真的 3D。
 * 「上船看看」必须真的把玩家送到甲板上：viewMode 回 chart + deckView = true，
 * 两个状态缺一个都会出现"点了黑屏"或"点了回到海图却没上船"。
 */
// 先站到岸上（上一段结束时已经回了海图）
await page.evaluate(() => {
  window.__mapStore.setState({ viewMode: 'harbor', deckView: false })
})
await new Promise(r => setTimeout(r, 500))
if (await page.$('[data-testid="harbor-go-deck"]')) {
  await page.click('[data-testid="harbor-go-deck"]')
  await new Promise(r => setTimeout(r, 900))
  const bridge = await page.evaluate(() => ({
    view: window.__mapStore.getState().viewMode,
    deck: window.__mapStore.getState().deckView,
    canvas: !!document.querySelector('[data-testid="deck-view"] canvas'),
  }))
  check(bridge.view === 'chart' && bridge.deck === true, `岸上点「上船看看」→ 上甲板（view=${bridge.view} deck=${bridge.deck}）`)
  check(bridge.canvas, '甲板层真的画出来了（有 canvas，不是黑屏）')
  await page.evaluate(() => window.__mapStore.setState({ deckView: false }))
  await new Promise(r => setTimeout(r, 500))
} else {
  check(false, '岸上应该有「上船看看」入口（从码头跨到甲板）')
}


// ---- 8. 移动端：功能一个不少，服务按钮不被底栏/浮卡压住 ----
await page.setViewport({ width: 390, height: 844 })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => window.__gameStore.setState({
  gamePhase: 'playing', tutorialStep: -1, showHelp: false,
  dialogueSeen: ['opening_pilot'], activePanel: null,
}))
await page.evaluate(() => window.__gameStore.setState({ activePanel: 'port' }))
check(await until(() => !!document.querySelector('[data-testid="harbor-enter"]')), '移动端港口面板里也有上岸入口')
await page.click('[data-testid="harbor-enter"]')
check(await until(() => !!document.querySelector('[data-testid="harbor-view"]')), '移动端能进岸上')
/*
 * 【为什么要先滚到底】岸上的服务是一列**可以滚的列表**（手机 390×844 时内容
 * 888px，比可视区高）。原先的判据在"没滚动"的状态下逐点命中，最后一块
 * `harbor-service-logbook` 正好落在底部木梁后面 → 永远点不到（实测 y=568..632，
 * 木梁从 595 起）。修法是让滚动区止于木梁顶（`bottom-[249px]`），于是
 * **滚到底就全都能点到**。判据要跟着改成"滚到底之后"——"不滚也能全看到"
 * 对一列五个入口是不现实的（那要求内容压进 595px）。
 */
/* 「回海图」在页面顶部：**必须在滚动之前测**，否则滚到底之后它自己出屏了 */
const backVisible = await page.evaluate(() => {
  const back = document.querySelector('[data-testid="harbor-back-to-chart"]')?.getBoundingClientRect()
  return !!back && back.y >= 0 && back.y < innerHeight
})
await page.evaluate(() => {
  const sc = [...document.querySelectorAll('[data-testid="harbor-view"] div')]
    .find(d => getComputedStyle(d).overflowY === 'auto')
  if (sc) sc.scrollTop = sc.scrollHeight
})
await new Promise(r => setTimeout(r, 400))
const mobile = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('[data-testid^="harbor-service-"]')].map(b => {
    const r = b.getBoundingClientRect()
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return { id: b.getAttribute('data-testid'), y: Math.round(r.y), h: Math.round(r.height), hit: b.contains(top) }
  })
  return {
    btns,
    foreground: !!document.querySelector('[data-testid="harbor-quay"]'),
    vh: innerHeight,
  }
})
check(mobile.btns.length === 5, '移动端 5 个服务入口都在（功能不少）')
check(mobile.btns.every(b => b.hit),
  `滚动到底之后 5 个按钮的中心都能被点中（${mobile.btns.filter(b => !b.hit).map(b => b.id).join(',') || '全部命中'}）`)
check(mobile.btns.every(b => b.y >= 0 && b.y + b.h <= mobile.vh),
  `滚到底之后 5 个按钮都在屏幕内（最低到 y=${Math.max(...mobile.btns.map(b => b.y + b.h))}，视口 ${mobile.vh}）`)
check(backVisible, '移动端「回海图」按钮在视口内')
check(!mobile.foreground, '移动端不渲染前景码头（会被多行底栏吃掉）')
await page.click('[data-testid="harbor-service-logbook"]')
check(await until(() => window.__mapStore.getState().recordsOpen), '移动端真实鼠标点「航海日志」→ 航海志打开')
check(await mode() === 'harbor', '移动端打开面板后仍在岸上')
await page.screenshot({ path: `${SHOTS}/harbor-e2e-mobile.png` })

// ---- 8b. 移动端底栏的常驻开关：十个入口一个不少，且真能来回切 ----
await page.keyboard.press('Escape')
await until(() => window.__gameStore.getState().activePanel === null)
{
  const labels = await page.$$eval('[data-testid="mobile-tab-bar"] button', els => els.map(e => e.getAttribute('aria-label')))
  check(labels.includes('回海图'), '移动端底栏第十个入口是空间开关（岸上时写「回海图」）')
  const sw = await page.$('[data-testid="view-mode-switch"]')
  check(!!sw, '移动端也能看到常驻开关，不用先翻港口面板')
  if (sw) {
    await sw.click()
    check(await until(() => window.__mapStore.getState().viewMode === 'chart'), '移动端点开关 → 回海图')
    const labels2 = await page.$$eval('[data-testid="mobile-tab-bar"] button', els => els.map(e => e.getAttribute('aria-label')))
    check(labels2.includes('上岸'), '回海图后开关改写成「上岸」')
    await page.click('[data-testid="view-mode-switch"]')
    check(await until(() => window.__mapStore.getState().viewMode === 'harbor'), '移动端再点一次 → 又上岸')
  }
}

check(errors.length === 0, `无页面错误${errors.length ? `（${errors.slice(0, 2).join(' | ')}）` : ''}`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
if (fail > 0) process.exit(1)
