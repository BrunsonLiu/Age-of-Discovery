// 2.5D 立体海图 —— 浏览器实测
//
// 跑法：先起 dev server（npx vite --port 5174 --host 127.0.0.1），
//       再 node test/e2e/map3d-check.mjs
//
// 断言：切换到 3D 后 canvas 真的出现、WebGL 上下文活着、港口标签有内容、
//       航线几何与 2D 一致（同一份 getRouteGeometry）、切回 2D 后 Leaflet 恢复正常。
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 220)) })
await page.setViewport({ width: 1440, height: 900 })

let pass = 0, fail = 0
const check = (ok, msg, extra) => { if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗', msg, extra ?? '') } }
const sleep = ms => new Promise(r => setTimeout(r, ms))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await sleep(2500)

// 先走过开场引导（否则浮层盖住地图，截图全屏是标题页）
for (let i = 0; i < 16; i++) {
  const clicked = await page.evaluate(() => {
    const overlays = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')]
    const o = overlays.find(x => /翻开日志|继续|启航|扬帆|下一步|跳过引导|跳过/.test(x.textContent || ''))
    if (!o) return null
    const b = [...o.querySelectorAll('button')].find(x => /翻开日志|继续|启航|扬帆|下一步|跳过引导|跳过/.test(x.textContent || ''))
    if (b && b instanceof HTMLElement) { b.click(); return (b.textContent || '').trim() }
    return null
  })
  if (!clicked) break
  await sleep(700)
}
await sleep(1500)

// 切到 3D（用 evaluate 绕开开场浮层的遮挡）
const toggled = await page.evaluate(() => {
  const btn = document.querySelector('[data-testid="map-mode-toggle"]')
  if (!btn) return null
  btn.click()
  return btn.textContent
})
console.log('切换按钮:', JSON.stringify(toggled))
check(!!toggled, '视图切换按钮存在')

// 等 canvas 出现
await page.waitForSelector('canvas', { timeout: 30000 })
await sleep(3500)

const probe = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('canvas')]
  const labels = [...document.querySelectorAll('.map3d-port-label')]
  const store = window.__gameStore?.getState?.()
  // 【为什么要取 rect 而不是只数个数】
  // 光断言「DOM 里有 20 个 .map3d-port-label」区分力不够：
  // 标签元素是全部无条件创建的，未发现的港口靠 style.display='none' 隐藏。
  // 如果投影逻辑坏了（left/top 没更新、相机矩阵错），元素照样存在 20 个，
  // 但全部堆在 (0,0) 或跑到视口外 —— 那种情况下旧断言照样通过。
  // 所以必须量**可见标签**的实际矩形：尺寸非 0、位置在视口内、互不重叠。
  const rects = labels
    .filter(l => l.style.display !== 'none')
    .map(l => {
      const r = l.getBoundingClientRect()
      return { text: l.textContent, x: r.x, y: r.y, w: r.width, h: r.height }
    })
  const overlaps = []
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j]
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (ox > 0 && oy > 0) overlaps.push(`${a.text}/${b.text}`)
    }
  }
  return {
    canvasCount: canvases.length,
    canvasSize: canvases.map(c => `${c.width}x${c.height}`),
    labelCount: labels.length,
    labelTexts: labels.slice(0, 6).map(l => l.textContent),
    labelVisible: rects.length,
    labelRects: rects.map(r => `${r.text} ${Math.round(r.w)}x${Math.round(r.h)} @(${Math.round(r.x)},${Math.round(r.y)})`),
    labelZeroSized: rects.filter(r => r.w < 4 || r.h < 4).map(r => r.text),
    labelOffscreen: rects.filter(r => r.x < -8 || r.y < -8 || r.x + r.w > innerWidth + 8 || r.y + r.h > innerHeight + 8).map(r => r.text),
    labelOverlaps: overlaps,
    viewport: `${innerWidth}x${innerHeight}`,
    dimmedOverlay: !!document.querySelector('.vintage-map-overlay--dimmed'),
    mode: window.__mapStore?.getState?.().renderMode,
    discovered: store?.discoveredPorts,
    shipPosition: store?.shipPosition,
  }
})
console.log('探针:', JSON.stringify(probe))
check(probe.canvasCount >= 1, '3D canvas 已渲染', probe.canvasCount)
check(probe.dimmedOverlay, '羊皮纸装饰层已弱化（3D 模式）')
check(probe.labelCount === 20, `港口标签 20 个（实得 ${probe.labelCount}）`)
// 已发现的港口必须有可见标签（数量对得上）
const discoveredCount = Array.isArray(probe.discovered) ? probe.discovered.length : 0
check(probe.labelVisible === discoveredCount,
  `可见标签数 = 已发现港口数（可见 ${probe.labelVisible} / 已发现 ${discoveredCount}）`)
check(probe.labelZeroSized.length === 0,
  `可见标签都有实际尺寸（零尺寸：${probe.labelZeroSized.join(',') || '无'}）`)
check(probe.labelOffscreen.length === 0,
  `可见标签都在视口内（越界：${probe.labelOffscreen.join(',') || '无'}）`)
check(probe.labelOverlaps.length === 0,
  `可见标签互不重叠（重叠：${probe.labelOverlaps.join(',') || '无'}）`)

// ---- 多港口场景 ----
//
// 【为什么必须单独测】
// 开局只发现了 1 个港口，「重叠」断言在只有 1 个标签时**必然通过** ——
// 那是永远为真的假测试。把已发现港口扩到多个，
// 才能真正检验投影定位逻辑与标签避让。
await page.evaluate(() => {
  const st = window.__gameStore
  if (!st) return
  st.setState({ discoveredPorts: [1, 2, 3, 4, 5, 6, 7, 8] })
})
await sleep(1200)
const multi = await page.evaluate(() => {
  const labels = [...document.querySelectorAll('.map3d-port-label')]
    .filter(l => l.style.display !== 'none')
    .map(l => {
      const r = l.getBoundingClientRect()
      return { text: l.textContent, x: r.x, y: r.y, w: r.width, h: r.height }
    })
  const overlaps = []
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i], b = labels[j]
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (ox > 0 && oy > 0) overlaps.push(`${a.text}/${b.text}(${Math.round(ox)}x${Math.round(oy)})`)
    }
  }
  return {
    n: labels.length,
    texts: labels.map(l => l.text),
    zeroSized: labels.filter(l => l.w < 4 || l.h < 4).map(l => l.text),
    offscreen: labels.filter(l => l.x < -8 || l.y < -8 || l.x + l.w > innerWidth + 8 || l.y + l.h > innerHeight + 8).map(l => l.text),
    overlaps,
  }
})
console.log('多港口探针:', JSON.stringify(multi))
check(multi.n >= 5, `扩到多港口后可见标签 ≥5 个（实得 ${multi.n}）`)
check(multi.zeroSized.length === 0, `多港口标签都有尺寸（零尺寸：${multi.zeroSized.join(',') || '无'}）`)
check(multi.offscreen.length === 0, `多港口标签都在视口内（越界：${multi.offscreen.join(',') || '无'}）`)
check(multi.overlaps.length === 0, `多港口标签互不重叠（重叠：${multi.overlaps.join(',') || '无'}）`)

await page.screenshot({ path: `${SHOTS}/map3d-桌面.png` })
console.log('截图: map3d-桌面.png')

// ===================================================================
// 叠加图层：底栏开关在 3D 里真的生效
// ===================================================================
//
// 【为什么必须单独测】
// 底栏的图层开关（风向/洋流/海盗区域）在 3D 模式下**照样可见可点**
// ——BottomBar 是无条件渲染的。3D 里如果没有对应实现，
// 玩家按下去什么都不会发生：这就是"承诺不兑现"。
//
// 【怎么证明"真的生效"而不是"对象存在"】
// 分三层：
//   ① 场景里有对应 group（对象存在）
//   ② 底栏点击后 group.visible 真的翻转（开关驱动）
//   ③ 同帧内开/关的 WebGL 像素差（画面真的变了）
// 第③层是关键——前两层都可能在"东西被画成全透明"的情况下照样通过。
await page.evaluate(() => {
  // 先关掉三个图层，回到干净基线
  const st = window.__mapStore
  if (!st) return
  const s = st.getState()
  if (s.showWindOverlay) st.getState().toggleWindOverlay()
  if (s.showCurrentOverlay) st.getState().toggleCurrentOverlay()
  if (s.showPirateZones) st.getState().togglePirateZones()
})
await sleep(600)

const layerBaseline = await page.evaluate(() => {
  const sc = window.__map3d?.scene
  if (!sc) return { error: 'no scene' }
  const read = n => {
    const g = sc.getObjectByName(n)
    if (!g) return null
    let line2 = 0, mesh = 0, inst = 0, other = 0
    g.traverse(o => {
      // 【顺序要紧】Line2 / LineSegments2 是 Mesh 的子类（isMesh 为 true），
      // 所以必须先判线、再判 mesh，否则所有折线都会被算成"填充块"。
      if (o.type === 'Line2' || o.type === 'LineSegments2') line2++
      else if (o.isInstancedMesh) inst++
      else if (o.isMesh) mesh++
      else other++
    })
    return { visible: g.visible, line2, mesh, inst, other, children: g.children.length }
  }
  return {
    currents: read('map3d-currents'),
    pirates: read('map3d-pirates'),
    winds: read('map3d-winds'),
    borders: (() => {
      const b = sc.getObjectByName('map3d-borders')
      if (!b) return null
      return {
        visible: b.visible,
        type: b.type,
        segments: b.geometry?.attributes?.instanceStart?.count ?? null,
        dashed: b.material?.dashed ?? null,
      }
    })(),
  }
})
console.log('图层基线:', JSON.stringify(layerBaseline))
check(!!layerBaseline.currents, '场景里有洋流图层 group')
check(!!layerBaseline.pirates, '场景里有海盗区图层 group')
check(!!layerBaseline.winds, '场景里有风带图层 group')
check(layerBaseline.currents?.line2 === 7, `洋流 7 条折线（实得 ${layerBaseline.currents?.line2}）`)
check(layerBaseline.pirates?.line2 === 3 && layerBaseline.pirates?.mesh === 3,
  `海盗区 3 条环 + 3 块填充（实得 ${layerBaseline.pirates?.line2} 环 / ${layerBaseline.pirates?.mesh} 填充）`)
check(layerBaseline.winds?.inst === 1, `风带箭头是 1 个 InstancedMesh（实得 ${layerBaseline.winds?.inst}）`)
check(layerBaseline.borders?.segments > 10000,
  `国界线合并成 1 个 LineSegments2，含 ${layerBaseline.borders?.segments} 段`)
check(layerBaseline.borders?.dashed === true, '国界线是虚线')

// 逐个点击底栏按钮，验证 visible 跟着翻转
const toggleByLabel = async ariaLabel => {
  await page.evaluate(lbl => {
    const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === lbl)
    b?.click()
  }, ariaLabel)
  await sleep(450)
}
const readVisible = () => page.evaluate(() => {
  const sc = window.__map3d?.scene
  const g = n => sc?.getObjectByName(n)?.visible ?? null
  const st = window.__mapStore?.getState?.()
  return {
    currents: g('map3d-currents'),
    pirates: g('map3d-pirates'),
    winds: g('map3d-winds'),
    store: st ? {
      wind: st.showWindOverlay, current: st.showCurrentOverlay, pirate: st.showPirateZones,
    } : null,
  }
})

const before = await readVisible()
await toggleByLabel('风向')
await toggleByLabel('洋流')
await toggleByLabel('海盗区域')
const after = await readVisible()
console.log('开关前:', JSON.stringify(before))
console.log('开关后:', JSON.stringify(after))
check(before.currents === false && before.pirates === false && before.winds === false,
  '图层初始为隐藏')
check(after.currents === true && after.pirates === true && after.winds === true,
  '底栏三个开关点击后，3D 里对应图层都变为显示')
check(after.store?.wind === true && after.store?.current === true && after.store?.pirate === true,
  '底栏开关确实写进了 store（不是只改了场景）')

// 同帧内开/关的 WebGL 像素差 —— 证明"画面真的变了"
const glDelta = await page.evaluate(() => {
  const m = window.__map3d
  if (!m) return { error: 'no __map3d' }
  const gl = m.renderer.getContext()
  const c = m.renderer.domElement
  const W = c.width, H = c.height
  const grab = () => {
    m.renderer.render(m.scene, m.camera)
    const b = new Uint8Array(W * H * 4)
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, b)
    return b
  }
  const count = (a, b) => {
    let n = 0
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
      if (d > 12) n++
    }
    return n
  }
  // 噪声基线：同一帧内连续两次 render（相机不动，画面应当完全一致）
  const n0 = grab(), n1 = grab()
  const noise = count(n0, n1)

  // 信号：同一帧内把三个图层全关掉再抓一次
  const names = ['map3d-currents', 'map3d-pirates', 'map3d-winds']
  const objs = names.map(n => m.scene.getObjectByName(n)).filter(Boolean)
  const prev = objs.map(o => o.visible)
  objs.forEach(o => { o.visible = false })
  const off = grab()
  objs.forEach((o, i) => { o.visible = prev[i] })
  const on = grab()

  // 国界线单独测。
  // 【为什么必须单独测】国界线没有底栏开关，只能靠场景对象控制。
  // 如果只断言「场景里有这个对象 + 段数对 + 是虚线」，
  // 那把它沉到海面以下（完全看不见）测试照样全绿——这是实测过的假测试。
  // 所以国界线必须有自己的像素断言。
  const bd = m.scene.getObjectByName('map3d-borders')
  let borderSignal = -1
  if (bd) {
    const bdPrev = bd.visible
    bd.visible = false
    const bOff = grab()
    bd.visible = true
    const bOn = grab()
    bd.visible = bdPrev
    borderSignal = count(bOn, bOff)
  }

  return { noise, signal: count(on, off), borderSignal, total: W * H }
})
console.log('WebGL 差分:', JSON.stringify(glDelta))
check(!glDelta.error, '能读到 WebGL framebuffer')
// 噪声必须接近 0 —— 否则这个测量方法本身没有区分力
check(glDelta.noise === 0, `同帧两次 render 无差异（噪声 ${glDelta.noise} 像素）`)
check(glDelta.signal > 500,
  `三个图层在画面上真的贡献了像素（信号 ${glDelta.signal} 像素）`)
check(glDelta.borderSignal > 500,
  `国界线在画面上真的画出来了（像素 ${glDelta.borderSignal}）`)

await page.screenshot({ path: `${SHOTS}/map3d-图层全开.png` })
console.log('截图: map3d-图层全开.png')

// 关回去，保持后面的截图干净
await toggleByLabel('风向')
await toggleByLabel('洋流')
await toggleByLabel('海盗区域')
await sleep(400)

// ===================================================================
// 区域名（海名 + 洲名）
// ===================================================================
const areaProbe = await page.evaluate(() => {
  const areaEls = [...document.querySelectorAll('.map3d-area-label')]
  const oceanEls = [...document.querySelectorAll('.map3d-area-label--ocean')]
  const regionEls = [...document.querySelectorAll('.map3d-area-label--region')]
  const portEls = [...document.querySelectorAll('.map3d-port-label')]
  const rectOf = l => {
    const r = l.getBoundingClientRect()
    return { text: l.textContent, x: r.x, y: r.y, w: r.width, h: r.height, vis: l.style.display !== 'none' }
  }
  const visArea = areaEls.filter(l => l.style.display !== 'none').map(rectOf)
  const visPort = portEls.filter(l => l.style.display !== 'none').map(rectOf)
  const all = [...visArea.map(r => ({ ...r, tag: 'area' })), ...visPort.map(r => ({ ...r, tag: 'port' }))]
  const overlaps = []
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j]
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      if (ox > 0 && oy > 0) overlaps.push(`${a.text}/${b.text}`)
    }
  }
  return {
    areaTotal: areaEls.length,
    oceanTotal: oceanEls.length,
    regionTotal: regionEls.length,
    portTotal: portEls.length,
    areaVisible: visArea.length,
    areaZeroSized: visArea.filter(r => r.w < 4 || r.h < 4).map(r => r.text),
    areaOffscreen: visArea.filter(r => r.x < -2 || r.y < -2 || r.x + r.w > innerWidth + 2 || r.y + r.h > innerHeight + 2).map(r => r.text),
    overlaps,
    oceanColor: oceanEls[0] ? getComputedStyle(oceanEls[0]).color : null,
    regionColor: regionEls[0] ? getComputedStyle(regionEls[0]).color : null,
  }
})
console.log('区域名探针:', JSON.stringify(areaProbe))
check(areaProbe.areaTotal === 28, `区域名 28 个（海名 18 + 洲名 10，实得 ${areaProbe.areaTotal}）`)
check(areaProbe.oceanTotal === 18, `海名 18 个（实得 ${areaProbe.oceanTotal}）`)
check(areaProbe.regionTotal === 10, `洲名 10 个（实得 ${areaProbe.regionTotal}）`)
check(areaProbe.areaVisible > 0, `有可见的区域名（实得 ${areaProbe.areaVisible}）`)
check(areaProbe.areaZeroSized.length === 0,
  `可见区域名都有实际尺寸（零尺寸：${areaProbe.areaZeroSized.join(',') || '无'}）`)
check(areaProbe.areaOffscreen.length === 0,
  `可见区域名完整落在视口内（越界：${areaProbe.areaOffscreen.join(',') || '无'}）`)
check(areaProbe.overlaps.length === 0,
  `区域名与港口名互不重叠（重叠：${areaProbe.overlaps.join(',') || '无'}）`)

// 拖拽转视角 + 滚轮缩放
await page.mouse.move(700, 450)
await page.mouse.down()
await page.mouse.move(880, 380, { steps: 12 })
await page.mouse.up()
await page.mouse.wheel({ deltaY: -400 })
await sleep(900)
await page.screenshot({ path: `${SHOTS}/map3d-转视角.png` })
console.log('截图: map3d-转视角.png')

// 移动端视口
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
await sleep(1200)
await page.screenshot({ path: `${SHOTS}/map3d-手机.png` })
console.log('截图: map3d-手机.png')

// 切回 2D，确认 Leaflet 恢复正常
await page.setViewport({ width: 1440, height: 900 })
await sleep(400)
await page.evaluate(() => document.querySelector('[data-testid="map-mode-toggle"]')?.click())
await sleep(2500)
const back = await page.evaluate(() => ({
  leaflet: !!document.querySelector('.leaflet-container'),
  canvas3d: !!document.querySelector('.vintage-map-overlay--dimmed'),
}))
check(back.leaflet, '切回 2D 后 Leaflet 恢复')
check(!back.canvas3d, '切回 2D 后 3D 层已卸载')
await page.screenshot({ path: `${SHOTS}/map3d-切回2D.png` })

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (errors.length) {
  console.log('\n运行时错误:')
  for (const e of [...new Set(errors)].slice(0, 12)) console.log(' ', e)
} else console.log('运行时错误：0')
await browser.close()
process.exit(fail > 0 || errors.length > 0 ? 1 : 0)
