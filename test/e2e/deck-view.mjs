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
  /*
   * 【面板必须真的有不透明背景】
   * 这条是第 73 轮抓到的真 bug：类名写的是 `bg-[#0a1420]/92`，而 Tailwind 的透明度
   * 刻度里**没有 92**（0/5/10/20/25/30/40/50/60/70/75/80/90/95/100）——于是整条
   * `bg-*` 被丢弃，面板算出来是 rgba(0,0,0,0)：一块只有模糊的玻璃，米色文字压在
   * 亮帆上完全读不出来。截图看着"像设计"，量一次计算样式就露了。
   */
  const bg = await page.evaluate(() => {
    const el = document.querySelector('[data-testid=deck-spot-hatch]')
    return el ? getComputedStyle(el).backgroundColor : ''
  })
  const alpha = Number((bg.match(/rgba?\(([^)]+)\)/) || [])[1]?.split(',')[3] ?? 1)
  check(/^rgba?\(/.test(bg) && alpha >= 0.85,
    `面板背景是不透明的（实测 ${bg}，alpha ${alpha}）`)
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

// ---- ⑤c 海鸟层：样式在位，且"远洋必须没有鸟"----
const birdLayer = await page.evaluate(() => {
  const o = window.__deckScene?.getObjectByName('deck-birds')
  if (!o) return null
  const p = o.geometry.attributes.position
  return {
    verts: p.count,
    opacity: o.material.opacity,
    finite: Array.from({ length: Math.min(48, p.count) }).every((_, i) => Number.isFinite(p.getY(i))),
    info: window.__deckBirds ?? null,
  }
})
check(!!birdLayer, '船上视角有海鸟层（deck-birds）')
check(birdLayer && birdLayer.verts === 48, `海鸟层 12 只 × 4 顶点（实测 ${birdLayer?.verts}）`)
check(birdLayer && birdLayer.finite, '海鸟顶点没有 NaN（否则整批消失）')
// 远洋：没有陆地 → 一只鸟都不许有。这条与时相无关，所以不会随「跑测试的时刻」变红。
await page.evaluate(() => {
  const st = window.__gameStore.getState()
  window.__gameStore.setState({ shipPosition: [10, -150], waypoint: null, fleet: { ...st.fleet, isSailing: false, currentPortId: null } })
})
await sleep(1600)
const offshore = await page.evaluate(() => window.__deckBirds ?? null)
check(!!offshore && offshore.count === 0, `远洋（太平洋中部）没有海鸟（实测 ${offshore?.count} 只）`)
check(await page.evaluate(() => window.__deckScene.getObjectByName('deck-birds').material.opacity === 0),
  '没有鸟的时候整层不透明度是 0（不是"画在原点"）')

// ---- ⑤d 甲板水手：人数必须等于 crew 推出来的那个数，清零后一个都不许剩 ----
const crewNow = () => page.evaluate(() => {
  const st = window.__gameStore.getState()
  const flag = st.fleet.ships.find((x) => x.id === st.fleet.flagshipId) ?? st.fleet.ships[0]
  const shown = []
  window.__deckScene.traverse((o) => { if (/^ship-sailor-/.test(o.name) && o.visible) shown.push(o.name) })
  return { crew: flag?.crew ?? 0, shown }
})
const c0 = await crewNow()
// 与 deckCrew.sailorCount 同一套阈值：<8 → 1、<20 → 2、否则 3；0 人 → 0
const want = c0.crew <= 0 ? 0 : c0.crew < 8 ? 1 : c0.crew < 20 ? 2 : 3
check(c0.shown.length === want, `甲板上的水手数 = crew ${c0.crew} 推出的 ${want}（实测 ${c0.shown.length}）`)
// 清零：甲板上不该还站着人（空船飘在海上比什么都说明问题）
await page.evaluate(() => {
  const st = window.__gameStore.getState()
  const flag = st.fleet.ships.find((x) => x.id === st.fleet.flagshipId) ?? st.fleet.ships[0]
  window.__gameStore.setState({ fleet: { ...st.fleet, ships: st.fleet.ships.map((s) => (s.id === flag.id ? { ...s, crew: 0 } : s)) } })
})
await sleep(1200)
const c1 = await crewNow()
check(c1.shown.length === 0, `船员清零后甲板上没人（实测 ${c1.shown.length} 个还在）`)

// ---- ⑤e 船长室：点舱门进舱、舱内撞墙不出界、点门回甲板 ----
const cabinState = () => page.evaluate(() => {
  const w = window.__deckWalk?.get()
  return {
    walk: w,
    hud: document.querySelector('[data-testid=deck-coast-hud]')?.textContent ?? '',
    badge: !!document.querySelector('[data-testid=deck-cabin-badge]'),
  }
})
// 站到舵轮右后方，正对舱门
await page.evaluate(() => window.__deckWalk?.set({ x: 1.5, z: -9.2, yaw: Math.PI - 0.12, pitch: -0.18 }))
await sleep(1200)
const before = await cabinState()
check(!before.badge, '进舱前没有「船长室」提示')
const doorPt = await page.evaluate(() => {
  const THREE = window.__THREE, o = window.__deckScene.getObjectByName('ship-cabin-door')
  if (!o) return null
  const v = new THREE.Vector3(); o.getWorldPosition(v)
  /*
   * 点门的**下沿**（世界 y 减 0.03 ≈ 模型 0.6 米）。门的上半截与舵轮在同一个高度，
   * 从甲板看过去被舵轮挡着 —— 玩家实际能点到的也是下半截（射线实测：
   * 门中心落在 `ship-wheel` 命中盒里，下沿才是 `ship-cabin-door`）。
   */
  v.y -= 0.03
  window.__deckCam.updateMatrixWorld(true)
  v.project(window.__deckCam)
  return { x: Math.round(((v.x + 1) / 2) * innerWidth), y: Math.round(((-v.y + 1) / 2) * innerHeight) }
})
check(!!doorPt, '船尾楼正面有舱门（ship-cabin-door）')
if (doorPt) {
  await page.mouse.click(doorPt.x, doorPt.y)
  await sleep(1200)
  const inside = await cabinState()
  check(inside.walk.z < -12.4, `点舱门后站进了舱里（z=${inside.walk.z?.toFixed(2)}）`)
  check(inside.hud.includes('船长室'), '舱内 HUD 换成「船长室」（不再报海岸距离）')
  check(inside.badge, '舱内有「船长室」提示')
  // 舱内朝船尾一直走：不许穿出后壁
  await page.evaluate(() => window.__deckWalk?.set({ x: 0, z: -14.5, yaw: Math.PI, pitch: 0 }))
  await sleep(400)
  await page.keyboard.down('w')
  await sleep(2000)
  await page.keyboard.up('w')
  const pushed = await cabinState()
  check(pushed.walk.z >= -16.85, `舱内撞到后壁就停住（z=${pushed.walk.z?.toFixed(2)}，后壁 −17.2）`)
  // 点舱内的门回甲板
  const innerPt = await page.evaluate(() => {
    const THREE = window.__THREE, o = window.__deckScene.getObjectByName('ship-cabin-inner-door')
    if (!o) return null
    window.__deckWalk?.set({ x: 0, yaw: undefined, z: -13.4 })
    const v = new THREE.Vector3(); o.getWorldPosition(v)
    v.project(window.__deckCam)
    return { x: Math.round(((v.x + 1) / 2) * innerWidth), y: Math.round(((-v.y + 1) / 2) * innerHeight) }
  })
  await page.evaluate(() => window.__deckWalk?.set({ x: 0, z: -13.4, yaw: 0, pitch: -0.1 }))
  await sleep(900)
  const innerPt2 = await page.evaluate(() => {
    const THREE = window.__THREE, o = window.__deckScene.getObjectByName('ship-cabin-inner-door')
    const v = new THREE.Vector3(); o.getWorldPosition(v)
    window.__deckCam.updateMatrixWorld(true)
    v.project(window.__deckCam)
    return { x: Math.round(((v.x + 1) / 2) * innerWidth), y: Math.round(((-v.y + 1) / 2) * innerHeight) }
  })
  await page.mouse.click(innerPt2.x, innerPt2.y)
  await sleep(1200)
  const out = await cabinState()
  check(out.walk.z > -12.4, `点内门后回到甲板（z=${out.walk.z?.toFixed(2)}）`)
  check(!out.badge, '回甲板后「船长室」提示消失')
}

// ---- ⑤f 桅顶三角旗：数量、方向跟着 windDir 转；水线带贴在船壳上 ----
const pennant = await page.evaluate(() => {
  const o = window.__deckScene.getObjectByName('ship-pennant')
  const pivot = window.__deckScene.getObjectByName('ship-pennant-pivot')
  if (!o || !pivot) return null
  const pos = o.geometry.attributes.position
  let maxZ = 0
  for (let i = 0; i < pos.count; i++) maxZ = Math.max(maxZ, Math.abs(pos.getZ(i)))
  return { verts: pos.count, yaw: pivot.rotation.y, maxZ, finite: Number.isFinite(maxZ) }
})
check(!!pennant, '桅顶有三角旗（ship-pennant）')
check(pennant && pennant.verts === 68, `三角旗 17×4 个顶点（实测 ${pennant?.verts}）`)
check(pennant && pennant.finite && pennant.maxZ > 0.01, '旗面真的在甩（有横向位移）')

// 风力 0 → 风向 90：旗子必须转过去（一阶平滑，等 2.4 秒到位）
const yawAt = async (dir) => {
  await page.evaluate((d) => {
    const st = window.__gameStore.getState()
    window.__gameStore.setState({ weather: { ...st.weather, windDir: d, windSpeed: 20 } })
  }, dir)
  await sleep(2400)
  return page.evaluate(() => window.__deckScene.getObjectByName('ship-pennant-pivot').rotation.y)
}
const yawNorth = await yawAt(0)
const yawEast = await yawAt(90)
check(Math.abs(yawNorth - yawEast) > 0.6,
  `风向变了旗子跟着转（北 ${yawNorth.toFixed(2)} → 东 ${yawEast.toFixed(2)} rad）`)
// 转到位之后应接近 −π/2 − B
check(Math.abs(Math.abs(yawEast - (-Math.PI / 2 - Math.PI / 2)) % (Math.PI * 2)) < 0.5
  || Math.abs(Math.abs(yawEast) - Math.PI) < 0.5,
  `风向 90° 时旗子指向右舷（yaw=${yawEast.toFixed(2)}）`)

// 水线带：两条（左右舷），贴在船壳上，顶点数 = 2×(28+1)
const wet = await page.evaluate(() => {
  const out = {}
  for (const n of ['ship-wetline-port', 'ship-wetline-stbd', 'ship-wake-side-port']) {
    const o = window.__deckScene.getObjectByName(n)
    out[n] = o ? { verts: o.geometry.attributes.position.count, vis: o.visible } : null
  }
  return out
})
check(!!wet['ship-wetline-port'] && !!wet['ship-wetline-stbd'], '左右舷都有水线湿痕带')
check(wet['ship-wetline-port']?.verts === 58, `湿痕带 29×2 个顶点（实测 ${wet['ship-wetline-port']?.verts}）`)
check(!!wet['ship-wake-side-port'], '船壳上有白沫带（不是水面上的水平带）')

// ---- ⑤g 开尔文波：船首/船尾的 z 与强度必须跟着 store 走 ----
const kelvinNow = () => page.evaluate(() => {
  const u = window.__deckScene.getObjectByName('deck-sea').material.uniforms
  return { bowZ: u.uBowZ.value, sternZ: u.uSternZ.value, k: u.uWakeK.value, has: !!u.uBowZ }
})
const kelvin = await kelvinNow()
check(kelvin.has, '海面材质有开尔文波的三个 uniform')
check(kelvin.bowZ > 0.4 && kelvin.sternZ < -0.4,
  `船首 z（${kelvin.bowZ?.toFixed(2)}）在船前、船尾 z（${kelvin.sternZ?.toFixed(2)}）在船后`)
check(kelvin.bowZ - kelvin.sternZ > 1.2,
  `首尾间距 ${(kelvin.bowZ - kelvin.sternZ).toFixed(2)} ≈ 船长（1.5 世界单位）`)
// 系泊 → 航行：强度必须涨（而且系泊时不是 0，船停着也有一点点水痕）
check(Math.abs(kelvin.k - 0.26) < 0.02, `系泊时强度 0.26（实测 ${kelvin.k?.toFixed(2)}）`)
await page.evaluate(() => {
  const st = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...st.fleet, isSailing: true } })
})
await sleep(900)
const kelvinSail = await kelvinNow()
check(kelvinSail.k > kelvin.k + 0.1,
  `航行时波脊强度涨上去（${kelvin.k?.toFixed(2)} → ${kelvinSail.k?.toFixed(2)}）`)
await page.evaluate(() => {
  const st = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...st.fleet, isSailing: false } })
})
await sleep(500)

// ---- ⑥ 回海图：场景要真的被拆掉（不能留一个跑着的 rAF）----
await page.evaluate(() => document.querySelector('[data-testid=deck-view-close]')?.click())
await sleep(1200)
check(await page.evaluate(() => !document.querySelector('[data-testid=deck-view]')), '「回海图」关掉了船上视角')
check(await page.evaluate(() => !window.__deckScene), '关闭时把 __deckScene 清掉了（资源确实释放）')

check(errors.length === 0, `无运行时错误（${errors.length} 条：${errors.slice(0, 2).join(' | ')}）`)

console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
