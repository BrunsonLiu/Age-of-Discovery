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
  window.__deckScene.traverse((o) => { if (/^ship-sailor-(helm|hatch|bow)$/.test(o.name) && o.visible) shown.push(o.name) })
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

// ---- ⑤h 艉灯与护舷木条：物件在位，夜里那盏灯真的亮 ----
const sternLamp = await page.evaluate(() => {
  const lantern = window.__deckScene.getObjectByName('ship-stern-lantern')
  if (!lantern) return null
  const THREE = window.__THREE
  const v = new THREE.Vector3()
  lantern.getWorldPosition(v)
  const lights = []
  lantern.traverse((o) => { if (o.isLight) lights.push(+o.intensity.toFixed(3)) })
  return { y: +v.y.toFixed(3), lights, sprites: lantern.children.filter((o) => o.isSprite).length }
})
check(!!sternLamp, '船尾有艉灯（ship-stern-lantern）')
check(sternLamp && sternLamp.lights.length === 1, `艉灯带一盏点光（实测 ${sternLamp?.lights.length}）`)
check(sternLamp && sternLamp.y > 0.15, `艉灯在船尾高处（世界 y=${sternLamp?.y}）`)

const strakes = await page.evaluate(() => {
  const out = {}
  for (const n of ['ship-strake-port', 'ship-strake-stbd']) {
    const o = window.__deckScene.getObjectByName(n)
    out[n] = o ? o.geometry.attributes.position.count : null
  }
  return out
})
check(strakes['ship-strake-port'] === 58 && strakes['ship-strake-stbd'] === 58,
  `左右舷护舷木条都是 29×2 顶点（实测 ${strakes['ship-strake-port']} / ${strakes['ship-strake-stbd']}）`)

/*
 * 夜里：艉灯的点光必须亮（白天被 litK 压成 0.0165）。
 * 先把 performance.now 的偏移装上 —— 这个脚本原先没装，所以"推到夜里"那句是空操作，
 * 断言拿到的是白天的值（实测 0.019）。推完必须复位，否则后面所有断言都在夜里跑。
 */
await page.evaluate(() => {
  if (!window.__skyBase) {
    const real = performance.now.bind(performance)
    window.__skyBase = real()
    window.__skyOff = 0
    performance.now = () => real() + window.__skyOff
  }
  window.__skyOff = (0.72 - 0.18) * 480000
})
await sleep(1800)
const lampNight = await page.evaluate(() => {
  const lantern = window.__deckScene.getObjectByName('ship-stern-lantern')
  let v = 0
  lantern.traverse((o) => { if (o.isLight) v = o.intensity })
  return +v.toFixed(3)
})
check(lampNight > 0.2, `夜里艉灯点亮（点光 ${lampNight}）`)
await page.evaluate(() => { window.__skyOff = (0.25 - 0.18) * 480000 })
await sleep(1400)
// 复位到"不偏移"，别把后面的断言留在某个特定时刻
await page.evaluate(() => { window.__skyOff = 0 })
await sleep(600)

// ---- ⑤i 三个岗位的姿态必须不同（不是三根一样的木桩）----
// 前面的用例把船员清零了（那是另一条断言），这里先恢复：三个人要同时在场
await page.evaluate(() => {
  const st = window.__gameStore.getState()
  const flag = st.fleet.ships.find((x) => x.id === st.fleet.flagshipId) ?? st.fleet.ships[0]
  window.__gameStore.setState({
    fleet: {
      ...st.fleet,
      ships: st.fleet.ships.map((sh) => (sh.id === flag.id ? { ...sh, crew: 26 } : sh)),
    },
  })
})
await sleep(1200)
const poses = await page.evaluate(() => {
  const out = {}
  for (const kind of ['helm', 'hatch', 'bow']) {
    const g = window.__deckScene.getObjectByName(`ship-sailor-${kind}`)
    if (!g) { out[kind] = null; continue }
    const upper = g.children.find((c) => c.type === 'Group')
    /*
     * 手臂 = **圆柱**、高 0.56。必须同时判类型：躯干是 BoxGeometry，它的
     * parameters.height 也是 0.56 —— 只按高度筛会连躯干一起抓进来（实测 3 个）。
     */
    const arms = (upper ? upper.children : []).filter(
      (c) => c.isMesh && c.geometry?.type === 'CylinderGeometry' && c.geometry?.parameters?.height === 0.56,
    )
    out[kind] = upper
      ? { lean: +upper.rotation.x.toFixed(2), arms: arms.map((a) => +a.rotation.x.toFixed(2)), visible: g.visible }
      : null
  }
  return out
})
check(!!poses.helm?.visible, '舵手在甲板上（初始船员 15 → 至少两人）')
check(poses.helm && poses.helm.arms.length === 2, `舵手有两条手臂（实测 ${poses.helm?.arms?.length}）`)
check(poses.helm && poses.helm.arms[0] === poses.helm.arms[1],
  `舵手两臂对称（${poses.helm?.arms?.join(' / ')}）`)
check(poses.helm && poses.helm.arms[0] < -1, `舵手手臂前伸到轮上（${poses.helm?.arms?.[0]} rad）`)
check(poses.hatch && Math.abs(poses.hatch.arms[0] - poses.helm.arms[0]) > 0.3,
  '舱口的人手臂角度与舵手不同（各有各的动作）')

/*
 * ---- ⑤k 岗位小动作：弯腰的人会直起腰、舵手会推轮、头真的会抬/低 ----
 *
 * 【为什么要连采 5 秒】上一轮的判据是"lean > 0.4"这种**瞬时**值 —— 加了周期性
 * 小动作之后，单点采样会在 0.21~0.55 之间随机命中，"有时绿有时红"是最糟的判据。
 * 现在改成看**极差**：既守"他确实弯腰"（任何时刻 > 0.15），也守"他确实会动"
 * （极差 > 0.1）。顺带守上一轮那条**躺着的死数据**：`headTilt` 之前从没被应用。
 */
const idleSeries = []
for (let i = 0; i < 11; i++) {
  idleSeries.push(await page.evaluate(() => {
    const g = window.__deckScene.getObjectByName('ship-sailor-hatch')
    const upper = g?.children.find((c) => c.type === 'Group')
    const head = window.__deckScene.getObjectByName('ship-head-hatch')
    return {
      lean: upper ? upper.rotation.x : null,
      headTilt: head ? head.rotation.x : null,
      hatOnHead: head ? head.children.length : 0,
    }
  }))
  await sleep(450)
}
const leans = idleSeries.map((s) => s.lean)
const leanMin = Math.min(...leans)
const leanMax = Math.max(...leans)
check(leanMin > 0.15, `舱口的人任何时刻都前倾（最低 ${leanMin.toFixed(2)} rad > 0.15）`)
check(leanMax - leanMin > 0.08, `他会直起腰再弯下去（5 秒里起伏 ${(leanMax - leanMin).toFixed(2)} rad）`)
check(leanMax < 0.62, `不会趴得比姿势本身更弯（最高 ${leanMax.toFixed(2)} rad）`)
const headTilts = idleSeries.map((s) => s.headTilt)
check(headTilts.every((v) => v !== null && v < 0),
  `头是"抬着看"的（俯仰 ${headTilts.map((v) => v.toFixed(2)).join(' ')} 全为负）`)
check(Math.max(...headTilts) - Math.min(...headTilts) > 0.02,
  `头跟着上身动（俯仰极差 ${(Math.max(...headTilts) - Math.min(...headTilts)).toFixed(2)} rad）`)
check(idleSeries.every((s) => s.hatOnHead === 2), '头和帽子在同一个组里（低头时帽子不会悬空）')

// 舵手：推轮时两臂同增量，5 秒内必须动过
const helmSeries = []
for (let i = 0; i < 11; i++) {
  helmSeries.push(await page.evaluate(() => {
    const g = window.__deckScene.getObjectByName('ship-sailor-helm')
    const upper = g?.children.find((c) => c.type === 'Group')
    const arms = (upper ? upper.children : []).filter(
      (c) => c.isMesh && c.geometry?.type === 'CylinderGeometry' && c.geometry?.parameters?.height === 0.56,
    )
    return arms.map((a) => a.rotation.x)
  }))
  await sleep(400)
}
const helmSymmetric = helmSeries.every((a) => Math.abs(a[0] - a[1]) < 1e-6)
const helmArms = helmSeries.map((a) => a[0])
check(helmSymmetric, '舵手推轮时两臂始终同角（不会一只手离轮）')
check(Math.max(...helmArms) - Math.min(...helmArms) > 0.02,
  `舵手在推轮（4 秒里 ${(Math.max(...helmArms) - Math.min(...helmArms)).toFixed(2)} rad）`)
check(Math.max(...helmArms) < -1.2, `推的时候手仍在轮上（最大 ${Math.max(...helmArms).toFixed(2)} rad）`)

// 船首的人：举起的手会放下歇一会，但**始终举着**（垂手就不是瞭望了）
const bowSeries = []
for (let i = 0; i < 7; i++) {
  bowSeries.push(await page.evaluate(() => {
    const g = window.__deckScene.getObjectByName('ship-sailor-bow')
    const upper = g?.children.find((c) => c.type === 'Group')
    const arms = (upper ? upper.children : []).filter(
      (c) => c.isMesh && c.geometry?.type === 'CylinderGeometry' && c.geometry?.parameters?.height === 0.56,
    )
    return arms.map((a) => a.rotation.x)
  }))
  await sleep(900)
}
const bowRight = bowSeries.map((a) => a[1])
check(bowSeries.every((a) => Math.abs(a[0]) < 0.2), '船首的另一只手一直垂着（只有一只手在瞭望）')
/*
 * 幅度只要求"确实在变"（0.005 rad），**不要求幅度**：
 * `ship.update(t)` 的 t 是逐帧累加的（每帧最多 0.05 秒），而无头 Edge 只有约 2fps
 * ——于是场景时间比墙钟慢好几倍，6 秒墙钟只推进约 1 秒场景时间。瞭望的周期是
 * 20 秒，在一个窗口里可能只挪了一点点。幅度的判据交给单测（`sailorIdle` 扫
 * 0..60 秒，最大放下 0.55 rad），e2e 只守"接线是对的、它真的在动"。
 */
check(Math.max(...bowRight) - Math.min(...bowRight) > 0.005,
  `瞭望的手在动（6 秒墙钟里 ${(Math.max(...bowRight) - Math.min(...bowRight)).toFixed(3)} rad）`)
check(Math.max(...bowRight) <= -1.2, `放下之后仍然举着（最高 ${Math.max(...bowRight).toFixed(2)} rad）`)

// ---- ⑤l 船首：索具必须系在斜桅端头上，船首像不能插进桅里 ----
/*
 * 【为什么这条只能在这里测】斜桅端点在源码里原来算了**两遍**：实体杆用
 * base+dir·len，索具用 shipDeckAt(17)+6.1。实测两处**碰巧重合**（都落在
 * y=7.96：方向里少算的 0.95 与底端多算的 0.95 抵消）—— 但这靠的是巧合，
 * 改任何一个数就会让前支索、艏三角帆拉索系在杆头之外的空气里，而远景里
 * 那只是几根细线。所以判据要拿**网格自己**算出来的端头去比**索具顶点**，
 * 而不是再写第三份公式。
 */
const bowCheck = await page.evaluate(() => {
  const THREE = window.__THREE
  const scene = window.__deckScene
  const sprit = scene.getObjectByName('ship-bowsprit')
  const rig = scene.getObjectByName('ship-rig-static')
  const fig = scene.getObjectByName('ship-figurehead')
  const stem = scene.getObjectByName('ship-stem')
  if (!sprit || !rig || !fig || !stem) return null
  const len = sprit.geometry.parameters.height
  // 杆的两端（船体局部系）：position ± quaternion·(0, len/2, 0)
  const half = new THREE.Vector3(0, len / 2, 0).applyQuaternion(sprit.quaternion)
  const tip = sprit.position.clone().add(half)
  const base = sprit.position.clone().sub(half)
  // 索具里 z 最大的顶点 = 前支索的端点（它应该就是端头）
  const pos = rig.geometry.attributes.position
  let far = null
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i)
    if (!far || z > far.z) far = { x: pos.getX(i), y: pos.getY(i), z }
  }
  const gap = Math.hypot(far.x - tip.x, far.y - tip.y, far.z - tip.z)
  // 船首像的包围（**算上每个部件的实际尺寸**，不只是挂点位置）——
  // 头冠建在脊柱之外，只比位置会把"尖捅进斜桅"漏掉（第一版就是这么漏的）
  let maxZ = -99
  let minY = 99
  let topY = -99
  let topZ = 0
  fig.children.forEach((c) => {
    const p = c.geometry?.parameters ?? {}
    const ext = Math.max(p.radius ?? 0, (p.height ?? 0) / 2)
    maxZ = Math.max(maxZ, c.position.z + ext)
    minY = Math.min(minY, c.position.y - ext)
    if (c.position.y + ext > topY) { topY = c.position.y + ext; topZ = c.position.z }
  })
  // 斜桅轴线上 z=topZ 处的高度（参数插值，与 deckBow.bowspritYAt 同一件事）
  const t = (topZ - base.z) / (tip.z - base.z)
  const spritY = base.y + (tip.y - base.y) * t
  return {
    spritTip: [+tip.x.toFixed(2), +tip.y.toFixed(2), +tip.z.toFixed(2)],
    rigEnd: [+far.x.toFixed(2), +far.y.toFixed(2), +far.z.toFixed(2)],
    gap: +gap.toFixed(3),
    figPieces: fig.children.length,
    figMaxZ: +maxZ.toFixed(2),
    figMinY: +minY.toFixed(2),
    figTop: +topY.toFixed(2),
    spritYAtTop: +spritY.toFixed(2),
    hasStem: !!stem,
  }
})
check(!!bowCheck, '斜桅 / 索具 / 船首像 / 船首柱都在场景里')
check(bowCheck && bowCheck.gap < 0.15,
  `前支索系在斜桅端头上（差 ${bowCheck?.gap} 米：索端 ${bowCheck?.rigEnd} vs 端头 ${bowCheck?.spritTip}）`)
check(bowCheck && bowCheck.spritTip[2] > 25 && bowCheck.spritTip[1] > 7.5,
  `斜桅端头在船首前方高处（${bowCheck?.spritTip}）`)
check(bowCheck && bowCheck.hasStem, '船首柱存在（船体前缘不再是刀口）')
check(bowCheck && bowCheck.figPieces >= 7, `船首像由多块拼成（实测 ${bowCheck?.figPieces} 块）`)
check(bowCheck && bowCheck.figMaxZ > 19, `船首像探出船首 1 米以上（最前 ${bowCheck?.figMaxZ}）`)
check(bowCheck && bowCheck.figMinY > -2.4, `船首像在水线之上（最低 ${bowCheck?.figMinY} > −2.4）`)
check(bowCheck && bowCheck.figTop < bowCheck.spritYAtTop - 0.05,
  `船首像没捅进斜桅（顶 ${bowCheck?.figTop} < 斜桅 ${bowCheck?.spritYAtTop}）`)

// ---- ⑤j 动索：绳头必须在帆角上、索要真的在动 ----
// 这一条不重写公式，而是**从帆自身的顶点**里找出那个角 —— 绳与布是否分家，
// 只有拿真实几何对才测得出来（公式对公式会一起错）。
const ropesCount = await page.evaluate(() => {
  let sheets = 0
  let braces = 0
  window.__deckScene.traverse((o) => {
    if (/^ship-sheet-/.test(o.name)) sheets++
    if (/^ship-brace-/.test(o.name)) braces++
  })
  return { sheets, braces }
})
check(ropesCount.sheets === 12, `六张帆各两根脚索（实测 ${ropesCount.sheets} 根）`)
check(ropesCount.braces === 6, `三根下桁各有两根转桁索（实测 ${ropesCount.braces} 根）`)

const clewCheck = await page.evaluate(() => {
  const scene = window.__deckScene
  const pivot = scene.getObjectByName('ship-yard-pivot-1')
  const sail = scene.getObjectByName('ship-sail-1')
  const sheet = scene.getObjectByName('ship-sheet-1-port')
  if (!pivot || !sail || !sheet) return null
  const pos = sail.geometry.attributes.position
  /*
   * 从**帆自己的顶点**里找帆角，不重写收分公式：
   *  · 帆顶不收分 ⇒ 全几何最大 |x| 就是半个帆宽；
   *  · 帆面以中心为原点 ⇒ 最大 y 就是半个帆高；
   *  · 帆角 = (半帆宽 × 收分, −半帆高)，再去顶点里找**离它最近的那个真顶点**，
   *    用那个顶点当判据 —— 于是"索头贴着的必须是布上真有的点"，而不是我算出来的点。
   */
  let maxX = 0
  let maxY = 0
  for (let i = 0; i < pos.count; i++) {
    maxX = Math.max(maxX, pos.getX(i))
    maxY = Math.max(maxY, pos.getY(i))
  }
  const wantX = maxX * (1 - 0.13)
  const wantY = -maxY
  let corner = null
  let bestD = Infinity
  for (let i = 0; i < pos.count; i++) {
    const d = Math.hypot(pos.getX(i) - wantX, pos.getY(i) - wantY)
    if (d < bestD) { bestD = d; corner = { x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) } }
  }
  const sp = sail.position
  // 帆角在 deck-ship 局部系（pivot 转角之后）。dx/dz 是**相对 pivot 的**偏移：
  // 帆的挂点 z 已经是相对 pivot 的 0.42，再减一次 pivot.z 会把差距算成 −10.58
  // （第一版就是这么错，量出来"差 11 米"，实际绳和布是贴着的）。
  const yaw = pivot.rotation.y
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const dx = corner.x + sp.x
  const dz = corner.z + sp.z
  const want = {
    x: dx * c + dz * s,
    y: corner.y + sp.y + pivot.position.y,
    z: pivot.position.z + (-dx * s + dz * c),
  }
  const arr = sheet.geometry.attributes.position.array
  const n = arr.length / 3 - 1
  const midI = (n / 2) * 3
  return {
    yaw: +yaw.toFixed(3),
    pivotY: +pivot.position.y.toFixed(2),
    pivotZ: +pivot.position.z.toFixed(2),
    gap: +Math.hypot(arr[0] - want.x, arr[1] - want.y, arr[2] - want.z).toFixed(3),
    sag: +(((arr[1] + arr[n * 3 + 1]) / 2) - arr[midI + 1]).toFixed(3),
    top: [+arr[0].toFixed(2), +arr[1].toFixed(2)],
    want: [+want.x.toFixed(2), +want.y.toFixed(2)],
    // 绳尾在下方（索是从帆角垂到舷边的）
    drop: +(arr[1] - arr[n * 3 + 1]).toFixed(2),
  }
})
check(!!clewCheck, '找得到帆桁枢轴 / 帆 / 帆脚索')
check(clewCheck && clewCheck.gap < 0.02,
  `帆脚索的头就在帆角上（差 ${clewCheck?.gap} 米：绳 ${clewCheck?.top} vs 角 ${clewCheck?.want}）`)
check(clewCheck && clewCheck.drop > 3, `脚索从帆角垂到舷边（落差 ${clewCheck?.drop} 米）`)
check(clewCheck && clewCheck.sag > 0.05, `索是垂的，不是一条直杆（中点低 ${clewCheck?.sag} 米）`)
check(clewCheck && clewCheck.pivotY === 13.6 && clewCheck.pivotZ === 11,
  `帆桁枢轴就在桁上（y=${clewCheck?.pivotY} z=${clewCheck?.pivotZ}，前桅下桁）`)

// 索必须**真的在动**：连续采 6 次中点高度，看极差（不是"值不等"）
const sagSeries = []
for (let i = 0; i < 6; i++) {
  sagSeries.push(await page.evaluate(() => {
    const arr = window.__deckScene.getObjectByName('ship-sheet-3-port').geometry.attributes.position.array
    const n = arr.length / 3 - 1
    return arr[((n / 2) * 3) + 1]
  }))
  await sleep(320)
}
const sagSpan = Math.max(...sagSeries) - Math.min(...sagSeries)
check(sagSpan > 0.004, `帆脚索的中点在一秒多里起伏了 ${(sagSpan * 100).toFixed(1)} 厘米（真的在抽动）`)

// 转桁索的尾端必须跟着桁臂走（帆转了、索没转 = 绳从桁上脱开）
const braceCheck = await page.evaluate(() => {
  const scene = window.__deckScene
  const out = []
  for (const seed of [1, 3, 5]) {
    const pivot = scene.getObjectByName(`ship-yard-pivot-${seed}`)
    const yard = scene.getObjectByName(`ship-yard-${seed}`)
    const brace = scene.getObjectByName(`ship-brace-${seed}-port`)
    if (!pivot || !yard || !brace) { out.push(null); continue }
    const half = yard.geometry.parameters.height / 2 * 0.97
    const yaw = pivot.rotation.y
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    const want = { x: half * c, z: pivot.position.z - half * s, y: pivot.position.y }
    const arr = brace.geometry.attributes.position.array
    out.push({
      seed,
      yaw: +yaw.toFixed(3),
      gap: +Math.hypot(arr[0] - want.x, arr[1] - want.y, arr[2] - want.z).toFixed(3),
    })
  }
  return out
})
check(braceCheck.every((b) => b && b.gap < 0.02),
  `三根转桁索的索头都咬在桁臂上（误差 ${braceCheck.map((b) => b?.gap).join(' / ')} 米）`)
check(braceCheck.every((b) => b && Math.abs(b.yaw) <= 0.2601),
  `转桁角都没超过 15°（${braceCheck.map((b) => b?.yaw).join(' / ')} rad）`)

// ---- ⑥ 回海图：场景要真的被拆掉（不能留一个跑着的 rAF）----
await page.evaluate(() => document.querySelector('[data-testid=deck-view-close]')?.click())
await sleep(1200)
check(await page.evaluate(() => !document.querySelector('[data-testid=deck-view]')), '「回海图」关掉了船上视角')
check(await page.evaluate(() => !window.__deckScene), '关闭时把 __deckScene 清掉了（资源确实释放）')

check(errors.length === 0, `无运行时错误（${errors.length} 条：${errors.slice(0, 2).join(' | ')}）`)

console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
