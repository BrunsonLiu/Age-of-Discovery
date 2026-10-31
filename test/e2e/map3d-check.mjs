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

/**
 * 用**真实鼠标点击**，而且先做命中测试。
 *
 * 【为什么不能用 btn.click()】
 * DOM 的 click() 直接派发事件，完全绕过 z-index、pointer-events、遮挡——
 * 按钮就算被顶栏整个盖住，这样点也照样"成功"。本轮真出过这个事故：
 * 「3D 海图」按钮放在 top-3（12px），被 h-12 的顶栏压得严严实实，
 * 玩家反馈"我还是没看到 3D"，而本脚本 71 条断言全绿。
 * 所以凡是"用户能不能点到"的断言，必须 elementFromPoint + page.mouse.click。
 */
const clickReal = async (sel) => {
  const box = await page.evaluate((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2
    const hit = document.elementFromPoint(cx, cy)
    return {
      x: cx, y: cy,
      text: (el.textContent || '').trim(),
      inViewport: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      hitsSelf: !!hit && (el === hit || el.contains(hit)),
      hitTag: hit ? `${hit.tagName}.${(hit.className || '').toString().slice(0, 40)}` : null,
    }
  }, sel)
  if (!box) return null
  if (box.hitsSelf) await page.mouse.click(box.x, box.y)
  return box
}

// 入场后港口面板会自动打开、带一层 bg-black/45 遮罩；玩家这时候也点不到
// 切换按钮，所以先按 Esc 关掉（真实玩家路径），再做命中测试。
await page.keyboard.press('Escape'); await sleep(400)
await page.keyboard.press('Escape'); await sleep(700)

const toggled = await clickReal('[data-testid="map-mode-toggle"]')
console.log('切换按钮:', JSON.stringify(toggled))
check(!!toggled, '视图切换按钮存在')
check(toggled.inViewport, '切换按钮完整落在视口内')
check(toggled.hitsSelf, `切换按钮真的能被点到（未被遮挡）——实测命中的是 ${toggled.hitTag}`)

// 等 canvas 出现
await page.waitForSelector('canvas', { timeout: 30000 })
await sleep(3500)

// ------------------------------------------------------------------
// 3D 操作提示：必须看得见。
//
// 【为什么要断言】它原来是 `absolute bottom-3 left-3`，而底栏就叠在视口底部：
// 实测桌面提示底边 888 / 底栏顶边 858，手机 832 / 714 —— **完全在底栏底下**，
// 从来没被玩家看见过。这类问题没有任何报错，只有量矩形才发现。
// 提示会在 6.5 秒后淡出（visibility:hidden），但矩形仍在，所以这里测得到。
// ------------------------------------------------------------------
const hintChk = await page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(d => /转视角/.test(d.textContent || '') && d.children.length === 0)
  if (!el) return { found: false }
  const r = el.getBoundingClientRect()
  const bar = document.querySelector('[data-tut="bottombar"]')?.getBoundingClientRect()
  return {
    found: true,
    text: el.textContent.trim(),
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    barTop: bar ? Math.round(bar.top) : null,
    inViewport: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
    beforeFade: getComputedStyle(el).visibility === 'visible',
  }
})
console.log('操作提示:', JSON.stringify(hintChk))
check(hintChk.found, '3D 操作提示存在')
check(hintChk.found && hintChk.inViewport, `操作提示完整在视口内（top=${hintChk.top} bottom=${hintChk.bottom}）`)
check(hintChk.found && hintChk.barTop !== null && hintChk.bottom < hintChk.barTop,
  `操作提示不被底栏遮挡（提示底边 ${hintChk.bottom} / 底栏顶边 ${hintChk.barTop}）`)

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
// 【下限为什么不是 >0】实测默认视角有 24 个可见（15 海名 + 9 洲名）、4 个因避让隐藏。
// 写 >0 的话，只剩 1 个也算通过 —— 而"标签卡死在 display:none"这种回归
// 恰恰是从"从 25 个掉到 1 个"开始的（本轮就踩过一次，见 mapLabels3d 的 hideLabel）。
check(areaProbe.areaVisible >= 18,
  `可见区域名 ≥18 个（实测默认视角 24，实得 ${areaProbe.areaVisible}）`)
check(areaProbe.areaZeroSized.length === 0,
  `可见区域名都有实际尺寸（零尺寸：${areaProbe.areaZeroSized.join(',') || '无'}）`)
check(areaProbe.areaOffscreen.length === 0,
  `可见区域名完整落在视口内（越界：${areaProbe.areaOffscreen.join(',') || '无'}）`)
check(areaProbe.overlaps.length === 0,
  `区域名与港口名互不重叠（重叠：${areaProbe.overlaps.join(',') || '无'}）`)

// ------------------------------------------------------------------
// 相机静止时，标签的 style 不该被反复改写。
//
// 【为什么值得单独断言】placeLabels 每帧都跑，48 个标签 × (display/left/top)
// 是无条件写的话，静止 1.5 秒就是 48 × ~35fps ≈ 2500 次样式赋值，全是白费。
// 现在按缓存只在真变化时写，实测静止 2 秒 0 次。
// 阈值给 120（远小于"每帧都写"的量级，又留足余量应对字体/尺寸的首次落位）。
// ------------------------------------------------------------------
const idleWrites = await page.evaluate(() => new Promise(res => {
  const els = [...document.querySelectorAll('.map3d-area-label, .map3d-port-label')]
  let n = 0
  const ob = new MutationObserver(muts => { n += muts.length })
  for (const el of els) ob.observe(el, { attributes: true, attributeFilter: ['style'] })
  setTimeout(() => { ob.disconnect(); res({ els: els.length, writes: n }) }, 1500)
}))
check(idleWrites.writes < 120,
  `相机静止 1.5s 内标签 style 改写 <120 次（实测 0；每帧都写会是上千次，实得 ${idleWrites.writes}）`)

// ===================================================================
// 港口辨识度：三档规模 + 干船坞
// ===================================================================
//
// 【为什么必须单独测】
// "20 个港口长得一样"是玩家能直接看到的问题。改完后如果只断言
// 「场景里有 20 个港口 group」，那把三档全部退化成同一档、把所有干船坞删掉，
// 测试照样全绿——又一个假测试。
//
// 所以这里断言三件事：
//   ① 档位分布（8 大 / 9 中 / 3 小）——对应真实的 services 分布
//   ② 干船坞数量 == 有 shipyard 的港口数（9）
//   ③ **几何尺度真的不同**（大港包围盒体积 > 小港，且差距 >1.5 倍）——
//      前两条只证明"标记打对了"，第③条才证明"画面上真的不一样"
const portProbe = await page.evaluate(() => {
  const sc = window.__map3d?.scene
  if (!sc) return { error: 'no scene' }
  // 港口 group 挂在场景下，靠 userData.portScale 认出来
  const groups = []
  sc.traverse(o => {
    if (o.isGroup && o.userData?.portScale) groups.push(o)
  })
  const byScale = {}
  let drydocks = 0
  for (const g of groups) {
    const s = g.userData.portScale
    byScale[s] = (byScale[s] ?? 0) + 1
    if (g.getObjectByName('drydock')) drydocks++
  }
  const sizeOf = g => {
    let minX = Infinity, minY = Infinity, minZ = Infinity
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
    g.updateMatrixWorld(true)
    g.traverse(o => {
      if (!o.isMesh || !o.geometry) return
      const pos = o.geometry.attributes.position
      if (!pos) return
      const v = { x: 0, y: 0, z: 0 }
      for (let i = 0; i < pos.count; i++) {
        v.x = pos.getX(i); v.y = pos.getY(i); v.z = pos.getZ(i)
        // 手动应用 matrixWorld（不依赖 THREE.Vector3）
        const m = o.matrixWorld.elements
        const x = m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12]
        const y = m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13]
        const z = m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14]
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
      }
    })
    return { dx: maxX - minX, dy: maxY - minY, dz: maxZ - minZ }
  }
  // 按档位算平均包围盒体积（体积差异 = 画面上轮廓差异的代理指标）
  const sum = {}, cnt = {}
  for (const g of groups) {
    const s = g.userData.portScale
    const d = sizeOf(g)
    sum[s] = (sum[s] ?? 0) + d.dx * d.dy * d.dz
    cnt[s] = (cnt[s] ?? 0) + 1
  }
  const avgVol = {}
  for (const s of Object.keys(sum)) avgVol[s] = sum[s] / cnt[s]
  return {
    total: groups.length,
    byScale,
    drydocks,
    avgVol,
    // 朝向多样性读的是 town 子组的旋转（整体不转，只转建筑群——
    // 转整体会把干船坞/栈桥转到背对视角的一侧，实测看不见）
    rotations: [...new Set(groups.map(g => +(g.userData.townRotation ?? 0).toFixed(3)))].length,
  }
})
console.log('港口模型探针:', JSON.stringify(portProbe))
check(portProbe.total === 20, `3D 场景里有 20 个港口模型（实得 ${portProbe.total}）`)
check(portProbe.byScale?.major === 8, `大港 8 个（实得 ${portProbe.byScale?.major}）`)
check(portProbe.byScale?.medium === 9, `中港 9 个（实得 ${portProbe.byScale?.medium}）`)
check(portProbe.byScale?.minor === 3, `小港 3 个（实得 ${portProbe.byScale?.minor}）`)
check(portProbe.drydocks === 9, `干船坞 9 座（= 有 shipyard 的港口数，实得 ${portProbe.drydocks}）`)
// 几何尺度必须真的不同——否则"分了三档"只是数据结构上的分档，画面上没区别
const vMajor = portProbe.avgVol?.major ?? 0
const vMinor = portProbe.avgVol?.minor ?? 0
check(vMinor > 0 && vMajor / vMinor > 1.5,
  `大港模型体积显著大于小港（大/小 = ${vMinor > 0 ? (vMajor / vMinor).toFixed(2) : 'N/A'} 倍，要求 >1.5）`)
// 朝向不能全部一致，否则一眼是复制粘贴
check(portProbe.rotations >= 6,
  `港口朝向有多样性（不同朝向 ${portProbe.rotations} 种，要求 ≥6）`)

// 停泊时船不能把港口模型盖住
//
// 【为什么这条必须有】港口辨识度做完后，线上实测发现：船停在港口时
// 帆船模型（刻意放大）**把港口整个盖住**，只露出一个港口名标签——
// 刚做的三档规模/干船坞在玩家最常看的位置完全失效。
// 处理是停泊时把船挪开并缩小。这条断言防的就是"哪天又挪回港口中心"。
const dockProbe = await page.evaluate(() => {
  const sc = window.__map3d?.scene
  if (!sc) return { error: 'no scene' }
  const ship = sc.getObjectByName('map3d-ship')
  if (!ship) return { error: 'no ship' }
  const ports = []
  sc.traverse(o => {
    if (o.isGroup && o.userData?.portId && o.userData?.portScale) ports.push(o)
  })
  let nearest = Infinity
  for (const p of ports) {
    const d = Math.hypot(ship.position.x - p.position.x, ship.position.z - p.position.z)
    if (d < nearest) nearest = d
  }
  return {
    scale: +ship.scale.x.toFixed(2),
    nearestPortDist: +nearest.toFixed(2),
  }
})
console.log('停泊船探针:', JSON.stringify(dockProbe))
check(dockProbe.scale < 0.7,
  `停泊时船已缩小（scale ${dockProbe.scale}，要求 <0.7）`)
// 港口底座半径最大 0.19×1.2×0.8 ≈ 0.18，船半长 0.92×0.55/2 ≈ 0.25
// → 中心距 > 0.4 才保证两者不重叠
check(dockProbe.nearestPortDist > 0.4,
  `停泊时船与最近港口不重叠（中心距 ${dockProbe.nearestPortDist}，要求 >0.4）`)

// 反向断言：出港后船必须恢复原尺寸。
// 少了这条，"停泊缩小"很容易写成"永远缩小"——航行中的船一直只有 55% 大小。
const sailingProbe = await page.evaluate(async () => {
  const st = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...st.fleet, currentPortId: null } })
  await new Promise(r => setTimeout(r, 400))
  const ship = window.__map3d?.scene?.getObjectByName('map3d-ship')
  const scale = +ship.scale.x.toFixed(2)
  // 还原
  window.__gameStore.setState({ fleet: { ...st.fleet } })
  await new Promise(r => setTimeout(r, 400))
  return { scale }
})
console.log('出港船探针:', JSON.stringify(sailingProbe))
check(sailingProbe.scale >= 0.75,
  `出港后船恢复原尺寸（scale ${sailingProbe.scale}，要求 ≥0.75）`)

// ---- 场景「活起来」：船随浪摇 / 洋流流动 ----
//
// 【为什么这三条必须有】它们都只是"帧循环里写一个数值"，
// tsc 与 eslint 全绿什么都不代表：数值写错了、或者被后面的赋值覆盖，
// 界面上完全看不出来（船照样停在那，只是不动）。
// 而且这种"装饰性动画"最容易被后来的重构顺手删掉，删了也没人发现。
const aliveProbe = () => page.evaluate(() => {
  const sc = window.__map3d?.scene
  const ship = sc?.getObjectByName('map3d-ship')
  const cur = sc?.children.find(c => c.name === 'map3d-currents')
  let dash = null
  if (cur) {
    cur.traverse((o) => {
      const mat = o.material
      if (dash === null && mat && mat.isLineMaterial) dash = mat.dashOffset
    })
  }
  return {
    rotZ: ship ? +ship.rotation.z.toFixed(5) : null,
    rotX: ship ? +ship.rotation.x.toFixed(5) : null,
    posY: ship ? +ship.position.y.toFixed(5) : null,
    yaw: ship ? +ship.rotation.y.toFixed(4) : null,
    dash: dash === null ? null : +dash.toFixed(4),
  }
})
const aliveA = await aliveProbe()
// 采 4 次取极差，而不是"两次采样值不等"。
// 【为什么】正弦在峰值附近变化率趋近 0：实测有一次 posY 两次采样只差 0.00002，
// "不相等"侥幸通过，但换个采样时刻就完全可能相等 → flaky。
// 极差看的是"这一段时间里摆动过多少"，与采样相位无关。
const aliveSeries = [aliveA]
for (let i = 0; i < 3; i++) {
  await sleep(150)
  aliveSeries.push(await aliveProbe())
}
const aliveB = aliveSeries[aliveSeries.length - 1]
const rotZs = aliveSeries.map(s => s.rotZ)
const posYs = aliveSeries.map(s => s.posY)
const rotZSpan = Math.max(...rotZs) - Math.min(...rotZs)
const posYSpan = Math.max(...posYs) - Math.min(...posYs)
console.log('活性探针:', JSON.stringify(aliveSeries))
console.log(`  rotZ 极差 ${rotZSpan.toFixed(4)}  posY 极差 ${posYSpan.toFixed(4)}`)

check(rotZSpan > 0.002,
  `船随浪横摇（rotZ 极差 ${rotZSpan.toFixed(4)}，要求 >0.002）`)
check(posYSpan > 0.001,
  `船随浪起伏（posY 极差 ${posYSpan.toFixed(4)}，要求 >0.001）`)
// 幅度必须克制：摇晃是为了"活"，不是让船横倾。
// 停泊 0.45 倍 → rotZ 上限 0.035×0.45≈0.016；航行全幅 0.035。留到 0.05 有富余。
check(Math.max(...rotZs.map(Math.abs)) < 0.05,
  `摇晃幅度克制（|rotZ| 最大 ${Math.max(...rotZs.map(Math.abs)).toFixed(4)}，要求 <0.05）`)
check(aliveA.dash !== null && aliveB.dash !== null && aliveB.dash < aliveA.dash,
  `洋流在流动（dashOffset ${aliveA.dash} → ${aliveB.dash}，要求递减）`)

// 「当前所在港口」的信号：地面光环 + 名字高亮
//
// 【为什么必须测】2D 用「34px + 发光 + portPulse」标出船所在的港口。
// 3D 里原本没有任何对应物——玩家看不出自己停在哪。
// 而停泊时船还被挪开缩小，方位感更弱，所以这个信号是补欠账，不是装饰。
const curProbe = await page.evaluate(async () => {
  const m = window.__map3d
  const sc = m?.scene
  if (!sc) return { error: 'no scene' }
  const ring = sc.getObjectByName('current-port-ring')
  const read = () => ({
    visible: !!ring?.visible,
    opacity: ring ? +ring.material.opacity.toFixed(2) : null,
    scaleX: ring ? +ring.scale.x.toFixed(3) : null,
  })
  const docked = read()
  // 停泊时：光环可见、位置落在某个港口附近
  const ports = []
  sc.traverse(o => {
    if (o.isGroup && o.userData?.portId && o.userData?.portScale) ports.push(o)
  })
  let nearest = Infinity
  if (ring?.visible) {
    for (const p of ports) {
      const d = Math.hypot(ring.position.x - p.position.x, ring.position.z - p.position.z)
      if (d < nearest) nearest = d
    }
  }
  // 标签高亮
  const curLabels = [...document.querySelectorAll('.map3d-port-label--current')].map(l => l.textContent)
  const allLabels = [...document.querySelectorAll('.map3d-port-label')]
  // 出港后光环应隐藏
  const st = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...st.fleet, currentPortId: null } })
  await new Promise(r => setTimeout(r, 500))
  const afterUndock = read()
  window.__gameStore.setState({ fleet: { ...st.fleet } })
  await new Promise(r => setTimeout(r, 500))
  return {
    docked,
    ringToNearestPort: +nearest.toFixed(3),
    curLabels,
    labelTotal: allLabels.length,
    afterUndock,
  }
})
console.log('当前港口探针:', JSON.stringify(curProbe))
check(curProbe.docked?.visible === true, '停泊时「当前港口」光环可见')
// 【必须判 isFinite】光环不可见时 nearest 保持 Infinity，而 JSON 序列化会把
// Infinity 变成 null，`null < 0.15` 竟然为 true —— 断言会假通过。
// 这是注入实验（关掉光环）当场暴露出来的。
check(Number.isFinite(curProbe.ringToNearestPort) && curProbe.ringToNearestPort < 0.15,
  `光环落在当前港口上（到最近港口 ${curProbe.ringToNearestPort}，要求 <0.15）`)
check(curProbe.docked?.opacity > 0.2 && curProbe.docked?.opacity < 0.75,
  `光环透明度在脉冲区间内（${curProbe.docked?.opacity}）`)
check(curProbe.curLabels?.length === 1, `只有一个港口名被高亮（实得 ${curProbe.curLabels?.length}：${curProbe.curLabels}）`)
check(curProbe.curLabels?.[0] === '塞维利亚', `高亮的是船所在的塞维利亚（实得 ${curProbe.curLabels?.[0]}）`)
check(curProbe.labelTotal === 20, `其它港口名仍有 20 个（实得 ${curProbe.labelTotal}）`)
check(curProbe.afterUndock?.visible === false, '出港后光环隐藏')

// ===================================================================
// 3D 点击交互：点港口开面板 / 点海面设航向
// ===================================================================
//
// 【为什么必须测】这是玩家在 3D 视图里的主要操作方式，逻辑虽然是从 2D 的
// MapClickHandler 逐条复刻的，但 raycaster 那条路径（先打港口模型、打不中再打海面）
// 从未被验证过——此前 e2e 里 grep `mouse.click` 命中 0 次。
//
// 顺带确认了一件容易误判的事：Three.js 的 Raycaster **不检查 visible**，
// 未发现的港口虽然 group.visible=false 仍会被射线命中。
// 查过 2D 的 MapClickHandler 后确认这不是 bug——它同样有「2° 内吸附到港口」
// 的规则，且同样只在 alreadyDiscovered 时才开面板，所以不会泄露未发现港口的信息。
await page.evaluate(() => {
  const st = window.__gameStore.getState()
  window.__gameStore.setState({
    activePanel: null,
    waypoint: null,
    shipPosition: [37.3886, -5.9823],           // 塞维利亚
    fleet: { ...st.fleet, currentPortId: 6, isSailing: false },
  })
})
await sleep(2500)   // 等相机缓动跟上

const portScreen = await page.evaluate(() => {
  const m = window.__map3d
  if (!m) return null
  let t = null
  m.scene.traverse(o => {
    if (o.isGroup && o.userData?.portId === 6 && o.userData?.portScale) t = o
  })
  if (!t) return null
  // y 取港口模型的**中部**（约 0.14）而不是贴地的 0.05。
  // 港口模型是有高度的立体物：投影点放在底面时，屏幕坐标对应模型脚下的地面，
  // 射线从相机射过去会从模型旁边擦过（实测打到 8° 以西的海面，
  // waypoint 变成 [43.71,-8.01]），于是"点当前港口不设航点"这条断言
  // 验的根本不是港口命中。
  const v = new m.camera.position.constructor().set(t.position.x, 0.14, t.position.z)
  v.project(m.camera)
  // 【必须用 canvas 自己的 rect】project 得到的是 NDC，换成点击坐标要基于
  // canvas 的实际位置与尺寸（顶栏占了视口上方约 40px）。
  // 用 innerWidth/innerHeight 会整体偏移几十像素，模型只有 ~30px 大 → 点空。
  // 本轮第一次就是这么写错的，4 条点击断言全红。
  const c = m.renderer.domElement
  const r = c.getBoundingClientRect()
  return {
    x: Math.round(r.left + (v.x + 1) / 2 * r.width),
    y: Math.round(r.top + (-v.y + 1) / 2 * r.height),
    z: +v.z.toFixed(2),
  }
})
console.log('塞维利亚屏幕坐标:', JSON.stringify(portScreen))
check(!!portScreen && portScreen.z < 1,
  `塞维利亚在相机前方（ndc.z=${portScreen?.z}）`)

// 点击语义①：点**自己所在的港口**应当什么都不做
//
// 这是 applyWaypoint 里 `if (nearbyPort.id === fleet.currentPortId) return` 的行为，
// 2D 的 MapClickHandler 同样如此。断言它，是为了防"误触弹出港口面板"。
if (portScreen && portScreen.z < 1) {
  await page.mouse.click(portScreen.x, portScreen.y)
  await sleep(700)
  const afterSelfClick = await page.evaluate(() => {
    const st = window.__gameStore.getState()
    return {
      panel: st.activePanel,
      waypoint: st.waypoint ? [st.waypoint.latitude, st.waypoint.longitude] : null,
      pendingVoyage: !!st.pendingVoyage,
    }
  })
  console.log('点「当前所在港口」后:', JSON.stringify(afterSelfClick))
  // 诊断用：万一又打偏，先看射线到底命中了什么
  if (afterSelfClick.waypoint) {
    const hit = await page.evaluate(() => {
      const m = window.__map3d
      const c = m.renderer.domElement
      const r = c.getBoundingClientRect()
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return { topTag: el?.tagName, topClass: (el?.className || '').toString().slice(0, 30) }
    })
    console.log('  （打偏诊断）画布中心命中:', JSON.stringify(hit))
  }
  check(afterSelfClick.panel === null,
    `点当前所在港口不弹面板（实得 ${afterSelfClick.panel}）`)
  check(!afterSelfClick.waypoint,
    `点当前所在港口不设航点（实得 ${JSON.stringify(afterSelfClick.waypoint)}）`)
}

// 点击语义②：点海面会设定航点
//
// 【为什么每次点完都要彻底清理】点海面或点别的港口会让船**直接出航**
// （applyWaypoint 里 sailToWaypoint），而游戏随即弹出 VoyagePlanModal
// （`fixed inset-0`、z=80、全屏遮罩）。那个弹窗会把后续所有点击吃掉——
// 本轮第一次写这条测试时就是被它挡住的，4 条断言全红，
// 排查了半天以为 raycast 坏了，其实是测试没处理"点击会触发出航流程"。
const resetForClick = async () => {
  await page.evaluate(() => {
    const st = window.__gameStore.getState()
    st.cancelVoyage?.()
    window.__gameStore.setState({
      activePanel: null, waypoint: null, pendingVoyage: null,
      shipPosition: [37.3886, -5.9823],
      fleet: { ...st.fleet, currentPortId: 6, isSailing: false },
    })
  })
  // 关掉可能弹出的对话层（`absolute inset-0 bg-black/45`）。
  // 【为什么必须处理】对话遮罩会锁住整个地图——这是**正常设计**
  // （对话中不该能操作地图），但对测试来说就是"点了没反应"。
  // 本项目 e2e 的已知坑，README 里也写了。
  for (let i = 0; i < 12; i++) {
    const state = await page.evaluate(() => {
      const mask = [...document.querySelectorAll('div.absolute.inset-0')].find(d =>
        (d.className?.toString?.() || '').includes('bg-black/45') &&
        d.offsetWidth > innerWidth * 0.8 && d.offsetHeight > innerHeight * 0.6)
      if (!mask) return 'closed'
      const b = [...document.querySelectorAll('button')]
        .filter(x => {
          const r = x.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        })
        .find(x => /继续|跳过|下一步|结束/.test(x.textContent || ''))
      if (b) { b.click(); return 'clicked' }
      return 'no-button'
    })
    if (state === 'closed') break
    if (state === 'no-button') await page.keyboard.press('Escape')
    await sleep(500)
  }
  await sleep(300)
}
await resetForClick()

// 点海面：拿大西洋中部（lon -30 / lat 25，确定是海）投影到屏幕
const seaScreen = await page.evaluate(() => {
  const m = window.__map3d
  if (!m) return null
  // 与 utils/mapProjection 同一套公式（这里手算，避免动态 import 的模块实例问题）
  const SIZE = 20
  const mercNorm = lat => (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2
  const wx = (-30 + 180) / 360 * SIZE
  const wz = mercNorm(25) * SIZE - SIZE / 2
  const v = new m.camera.position.constructor().set(wx, -0.089, wz)
  v.project(m.camera)
  // 同样基于 canvas 的 rect（见上面港口投影处的说明）
  const c = m.renderer.domElement
  const r = c.getBoundingClientRect()
  return {
    x: Math.round(r.left + (v.x + 1) / 2 * r.width),
    y: Math.round(r.top + (-v.y + 1) / 2 * r.height),
    z: +v.z.toFixed(2),
  }
})
console.log('大西洋中部屏幕坐标:', JSON.stringify(seaScreen))
// 点击前先确认那块屏幕位置确实能点到 canvas（没被弹窗/面板盖住）
const seaHitIsCanvas = await page.evaluate((pt) => {
  const c = window.__map3d?.renderer?.domElement
  const top = document.elementFromPoint(pt.x, pt.y)
  return { isCanvas: top === c, topTag: top?.tagName, topClass: (top?.className?.toString?.() || '').slice(0, 60) }
}, { x: seaScreen?.x ?? 0, y: seaScreen?.y ?? 0 })
console.log('海面命中元素:', JSON.stringify(seaHitIsCanvas))
check(seaHitIsCanvas.isCanvas,
  `海面点击位置没有被浮层遮挡（命中 ${seaHitIsCanvas.topTag}.${seaHitIsCanvas.topClass}）`)

if (seaScreen && seaScreen.z < 1 && seaHitIsCanvas.isCanvas) {
  await page.mouse.click(seaScreen.x, seaScreen.y)
  await sleep(700)
  const afterSeaClick = await page.evaluate(() => {
    const st = window.__gameStore.getState()
    return {
      panel: st.activePanel,
      waypoint: st.waypoint ? [+st.waypoint.latitude.toFixed(1), +st.waypoint.longitude.toFixed(1)] : null,
      pendingVoyage: !!st.pendingVoyage,
    }
  })
  console.log('点海面后:', JSON.stringify(afterSeaClick))
  check(!!afterSeaClick.waypoint, '点海面 → 设定了航点')
  check(afterSeaClick.panel !== 'port', `点海面不应打开港口面板（实得 ${afterSeaClick.panel}）`)
  // 大西洋中部 lon≈-30：若误命中陆地被贴岸改道，经度会明显偏移
  check(afterSeaClick.waypoint && Math.abs(afterSeaClick.waypoint[1] + 30) < 8,
    `航点落在大西洋中部而非被吸到港口（经度 ${afterSeaClick.waypoint?.[1]}）`)
  // 点海面出航 → 应弹航段计划（这是既有流程，顺带断言一下，避免以后改坏）
  check(afterSeaClick.pendingVoyage,
    `点海面出航会弹出航段计划（pendingVoyage=${afterSeaClick.pendingVoyage}）`)

  // ---- 航线可视化：方向箭头 + 终点标记 + 危险度配色 ----
  //
  // 【为什么这三条重要】2D 的 RouteLine 一直有箭头、终点图标、按危险度上色，
  // 3D 只有一条纯金虚线。缺箭头在 3D 里比 2D 更严重：斜俯视 + 透视下，
  // 同一条虚线可以是"往远处去"也可以是"从远处来"，光看线分不清方向。
  const routeProbe = await page.evaluate(() => {
    const sc = window.__map3d?.scene
    const arrows = sc?.getObjectByName('map3d-route-arrows')
    const dest = sc?.getObjectByName('map3d-dest-mark')
    const line = sc?.children.find(o => o.type === 'Line2' && o.visible)
    return {
      arrowCount: arrows?.count ?? -1,
      arrowVisible: arrows?.visible ?? null,
      destVisible: dest?.visible ?? null,
      destY: dest ? +dest.position.y.toFixed(2) : null,
      lineColor: line?.material?.color ? '#' + line.material.color.getHexString() : null,
      dangerLevel: window.__gameStore.getState().currentRoute?.dangerLevel ?? null,
    }
  })
  console.log('航线可视化探针:', JSON.stringify(routeProbe))
  check(routeProbe.arrowCount > 0, `航线上有方向箭头（${routeProbe.arrowCount} 个）`)
  check(routeProbe.arrowVisible === true, '箭头可见')
  check(routeProbe.destVisible === true, '终点有悬空标记')
  // 终点标记要浮在港口模型之上（港口最高约 0.28），否则会插进建筑里
  check(routeProbe.destY !== null && routeProbe.destY > 0.28,
    `终点标记浮在建筑之上（y=${routeProbe.destY}，要求 >0.28）`)
} else {
  console.log('  跳过点海面断言：大西洋中部不在当前视野内或被遮挡')
}

// 收拾现场：关面板、清航点、取消出航流程、回到停泊状态
await page.evaluate(() => {
  const st = window.__gameStore.getState()
  st.cancelVoyage?.()
  window.__gameStore.setState({
    activePanel: null, waypoint: null, pendingVoyage: null,
    fleet: { ...st.fleet, currentPortId: 6, isSailing: false },
    shipPosition: [37.3886, -5.9823],
  })
})
await sleep(400)

// 拖拽转视角 + 滚轮缩放
await page.mouse.move(700, 450)
await page.mouse.down()
await page.mouse.move(880, 380, { steps: 12 })
await page.mouse.up()
await page.mouse.wheel({ deltaY: -400 })
await sleep(900)
await page.screenshot({ path: `${SHOTS}/map3d-转视角.png` })
console.log('截图: map3d-转视角.png')

// 拉近到极限：船必须缩小，给港口让位
//
// 【为什么必须测】玩家拉近本意是看港口的三档细节（塔楼/干船坞/栈桥），
// 而船就在相机注视点正中心。实测 dist=3（camY=1.74）时船占屏 **54.5%**，
// 港口整块被自己的船压住——刚做的辨识度在最该看清的距离上失效。
// 这条"近景让位"与"停泊时把船挪开缩小"是同一原则，只写代码不写断言的话，
// 下一次重构很容易把它当成多余的一行删掉。
const nearA = await page.evaluate(() =>
  +window.__map3d.scene.getObjectByName('map3d-ship').scale.x.toFixed(3))
await page.mouse.move(700, 450)
for (let i = 0; i < 14; i++) {
  await page.mouse.wheel({ deltaY: -400 })
  await sleep(60)
}
await sleep(800)
const nearB = await page.evaluate(() => {
  const m = window.__map3d
  return {
    scale: +m.scene.getObjectByName('map3d-ship').scale.x.toFixed(3),
    camY: +m.camera.position.y.toFixed(2),
  }
})
console.log('拉近船探针:', JSON.stringify({ 拉近前: nearA, 拉近后: nearB }))
check(nearB.scale < nearA * 0.8,
  `拉近时船缩小让位给港口（${nearA} → ${nearB.scale}，要求缩小 20% 以上）`)
// 拉回远景，别让后面的截图变成贴脸
for (let i = 0; i < 12; i++) {
  await page.mouse.wheel({ deltaY: 400 })
  await sleep(50)
}
await sleep(600)
const backFar = await page.evaluate(() =>
  +window.__map3d.scene.getObjectByName('map3d-ship').scale.x.toFixed(3))
check(backFar > nearB.scale * 1.5,
  `拉回远景后船恢复大小（${nearB.scale} → ${backFar}）`)

// 移动端视口
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 })
await sleep(1200)
await page.screenshot({ path: `${SHOTS}/map3d-手机.png` })
console.log('截图: map3d-手机.png')

// 切回 2D，确认 Leaflet 恢复正常
await page.setViewport({ width: 1440, height: 900 })
await sleep(400)
// ------------------------------------------------------------------
// 天气：风暴要让海面明显变暗，改回晴天必须**完全恢复**。
//
// 【为什么必须测"恢复"】这段是"只在天气变化时写材质"的缓存逻辑。
// 缓存类改动最典型的失败不是"没变暗"，而是"变暗之后回不来" ——
// 玩家打完一场风暴，海面永远停在阴沉的颜色。本项目在标签缓存上
// 刚栽过一次（漏同步 → 48 个标签永久隐藏），所以这里专门盯恢复。
// ------------------------------------------------------------------
const weatherChk = await page.evaluate(async () => {
  const g = window.__gameStore
  const sc = window.__map3d.scene
  let m = null
  sc.traverse(o => {
    if (o.isMesh && !o.isInstancedMesh && o.material?.map && o.geometry?.parameters?.width === 20) m = o.material
  })
  if (!m) return { err: 'no sea material' }
  // 光照也要一起读：亮度几乎全来自三盏灯（实测关灯 → 亮度掉到 4.9），
  // 只断言 color 会漏掉"颜色恢复了但灯还压着"这种半恢复状态。
  const lightSum = () => {
    let sum = 0
    sc.traverse(o => { if (o.isLight) sum += o.intensity })
    return +sum.toFixed(3)
  }
  const read = () => ({ color: m.color.toArray().map(v => +v.toFixed(3)), lights: lightSum() })
  g.setState({ weather: { ...g.getState().weather, kind: 'clear' } })
  await new Promise(r => setTimeout(r, 350))
  const base = read()
  g.setState({ weather: { ...g.getState().weather, kind: 'storm' } })
  await new Promise(r => setTimeout(r, 350))
  const storm = read()
  g.setState({ weather: { ...g.getState().weather, kind: 'clear' } })
  await new Promise(r => setTimeout(r, 350))
  return { base, storm, back: read() }
})
console.log('天气调色:', JSON.stringify(weatherChk))
check(!!weatherChk.base, '3D 里能找到海面材质')
check(weatherChk.base && weatherChk.storm && weatherChk.storm.color.every((v, i) => v < weatherChk.base.color[i] * 0.8),
  `暴风雨时海面三个通道都明显压暗（${JSON.stringify(weatherChk.base?.color)} → ${JSON.stringify(weatherChk.storm?.color)}）`)
check(weatherChk.base && weatherChk.storm && weatherChk.storm.lights < weatherChk.base.lights * 0.75,
  `暴风雨时光照同步压暗（${weatherChk.base?.lights} → ${weatherChk.storm?.lights}）—— 亮度主要来自灯，光压色不够`)
check(weatherChk.base && weatherChk.back
  && weatherChk.back.color.every((v, i) => Math.abs(v - weatherChk.base.color[i]) < 1e-6)
  && Math.abs(weatherChk.back.lights - weatherChk.base.lights) < 1e-6,
  `改回晴天后颜色与光照都完全恢复（${JSON.stringify(weatherChk.back)}）`)

await clickReal('[data-testid="map-mode-toggle"]')
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
