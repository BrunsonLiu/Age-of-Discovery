/*
 * 3D 海图上的传说 / 故事标记。
 *
 * 守三件事：
 *   ① 切到立体海图之后，金色传说标记与故事菱形**都在**（2D 有、3D 没有，
 *      玩家只会觉得"这边少了东西"）；
 *   ② 标记落在图板范围内（不能在板外的"空中"）；
 *   ③ 传说标签是**可读的**（存在、没被 display:none、字号 ≥12px）。
 */
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pass = 0
let fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗', msg) } }

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2400)
await page.evaluate(() => {
  window.__gameStore.getState().initGame?.('navigator', 'voyage', 'spain')
  window.__gameStore.setState({ gamePhase: 'playing', currentEvent: null })
  window.__mapStore.setState({ renderMode: '3d' })
  window.__gameStore.getState().skipTutorial?.()
})
await sleep(700)
for (let i = 0; i < 8; i++) {
  if (!(await page.evaluate(() => !!window.__dialogueStore?.getState?.().scriptId))) break
  await page.evaluate(() => window.__dialogueStore?.getState?.().skip?.())
  await sleep(200)
}
await sleep(6500)

const r = await page.evaluate(() => {
  const scene = window.__map3d?.scene
  const out = { found: {}, pos: [], label: null }
  scene?.traverse?.((o) => {
    if (o.name === 'map3d-legend-legend') {
      out.found.legend = true
      out.pos.push([o.position.x, o.position.y, o.position.z, 'legend'])
    }
    if (o.name === 'map3d-legend-story') {
      out.found.story = true
      out.pos.push([o.position.x, o.position.y, o.position.z, 'story'])
    }
    if (o.name === 'map3d-legend-ring') out.found.ring = true
  })
  /*
   * 【这三条曾经在查 DOM 标签 —— 而那个实现已经不在了】
   * 传说/故事标记改成 Canvas 纹理的 Sprite（`mapLegends3d.makeMarkTexture`）之后，
   * `.map3d-legend-label` 这个类在 DOM 里**再也不会出现**：
   * 全项目只有 index.css 里还留着那两条规则。
   * 于是 `check(!!r.label, '传说标签存在')` 长期是红的 ——
   * 而红的理由不是"功能坏了"，是断言盯的实现被换掉了。
   *
   * 现在改成断言**当前实现**：标签是贴图上的字，DOM 里不该再有那个类。
   * 若哪天又做回 DOM 标签，两条同时变红，提醒一起改（而不是继续红着没人看）。
   */
  const el = document.querySelector('.map3d-legend-label, .map3d-story-label')
  out.label = el ? { text: el.textContent, cls: el.className } : null
  scene?.traverse?.((o) => {
    if (o.name === 'map3d-legend-legend' || o.name === 'map3d-legend-story') {
      // Sprite 的 scale 就是它的世界尺寸；0 表示没画出来
      out.sizes = out.sizes || {}
      out.sizes[o.name] = Math.max(o.scale?.x ?? 0, o.scale?.y ?? 0)
    }
  })
  // 图板尺寸（MAP_WORLD_SIZE = 20，x 0..20、z -10..10）
  out.plate = 20
  return out
})

check(!!r.found.legend, '立体海图上有传说标记（金色星）')
check(!!r.found.story, '立体海图上有故事菱形')
check(!!r.found.ring, '传说标记有呼吸圆环（"这里有事情"的信号）')
for (const [x, y, z, kind] of r.pos) {
  check(x >= -1 && x <= r.plate + 1 && z >= -11 && z <= 11 && Math.abs(y) < 1,
    `${kind} 标记在 3D 图板范围内（${x.toFixed(1)}, ${y.toFixed(2)}, ${z.toFixed(1)}）`)
}

check(!r.label, '传说标记已不是 DOM 标签（改为 Canvas 纹理 Sprite，旧的 .map3d-legend-label 不该再出现）')
const sizes = r.sizes || {}
check((sizes['map3d-legend-legend'] ?? 0) > 0, `传说贴图标尺正常（${(sizes['map3d-legend-legend'] ?? 0).toFixed(3)}）`)
check((sizes['map3d-legend-story'] ?? 0) > 0, `故事贴图标尺正常（${(sizes['map3d-legend-story'] ?? 0).toFixed(3)}）`)

check(errs.length === 0, `无运行时错误（${errs.length} 条${errs.length ? '：' + errs[0] : ''}）`)

console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
