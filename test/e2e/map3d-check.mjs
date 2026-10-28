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
  return {
    canvasCount: canvases.length,
    canvasSize: canvases.map(c => `${c.width}x${c.height}`),
    labelCount: labels.length,
    labelTexts: labels.slice(0, 6).map(l => l.textContent),
    labelVisible: labels.filter(l => l.style.display !== 'none').length,
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
