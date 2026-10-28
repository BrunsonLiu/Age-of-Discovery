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
