/**
 * 谁在每帧改 DOM 属性？—— hook `Element.prototype.setAttribute` 与
 * `CSSStyleDeclaration.setProperty`，按「标签 + class 前缀 + 属性名」计数。
 *
 * 【为什么要查这个】2D 海图在 4 倍 CPU 节流下主线程 84% 是原生绘制（paint），
 * JS 自时间不到 5%。持续重绘一定来自**持续变化的 DOM**：每帧改一个 transform
 * 会让该图层整块重新合成，改 width/height/left 更会触发 layout。
 *
 * 跑法：先起 dev server（5174），再 `node test/e2e/probe-dom-writes.mjs --view=2d`
 */
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const VIEW = (process.argv.find((a) => a.startsWith('--view=')) ?? '--view=2d').split('=')[1]
const SECS = Number((process.argv.find((a) => a.startsWith('--sec=')) ?? '--sec=4').split('=')[1])

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const ctx = await browser.createBrowserContext()
const page = await ctx.newPage()
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!window.__mapStore, { timeout: 30000 })

if (VIEW === 'deck') {
  await page.evaluate(() => window.__mapStore.setState({ viewMode: '3d' }))
  await sleep(2500)
  await page.evaluate(() => document.querySelector('[data-testid=deck-view-toggle]')?.click())
  await page.waitForFunction(() => !!window.__deckScene, { timeout: 60000 })
} else {
  await page.evaluate(() => {
    const g = window.__gameStore
    g.getState().initGame('ming')
    g.getState().sailToWaypoint?.({ latitude: 1.35, longitude: 103.8, name: '马六甲' })
    if (g.getState().pendingSegment) g.getState().confirmSegment?.('steady')
  })
}
await sleep(2500)

const out = await page.evaluate(
  (secs) =>
    new Promise((res) => {
      const count = new Map()
      const bump = (k) => count.set(k, (count.get(k) ?? 0) + 1)
      const cls = (el) => {
        if (!el || !el.getAttribute) return '?'
        const c = el.getAttribute('class') || ''
        // 只取最有辨识度的前两段（leaflet-xxx / 自定义前缀）
        return (el.tagName || '?').toLowerCase() + (c ? '.' + c.split(/\s+/).slice(0, 2).join('.') : '')
      }
      const origSet = Element.prototype.setAttribute
      Element.prototype.setAttribute = function (name, value) {
        bump(`${cls(this)} [${name}]`)
        return origSet.call(this, name, value)
      }
      const origSetProp = CSSStyleDeclaration.prototype.setProperty
      CSSStyleDeclaration.prototype.setProperty = function (name, value, prio) {
        bump(`style.setProperty [${name}]`)
        return origSetProp.call(this, name, value, prio)
      }
      /*
       * `el.style.transform = ...` 走的是 CSSStyleDeclaration 的命名 setter，
       * setProperty 拦不到。用 MutationObserver 看 style 属性的变更次数，
       * 再按元素归类 —— 这是"谁在每帧动"最直接的证据。
       */
      const samples = new Map()
      const mo = new MutationObserver((recs) => {
        for (const r of recs) {
          if (r.attributeName !== 'style') continue
          const el = r.target
          const c = el.getAttribute?.('class') || ''
          const key = `style-mut ${(el.tagName || '?').toLowerCase()}${c ? '.' + c.split(/\s+/).slice(0, 2).join('.') : ''}`
          bump(key)
          if (!samples.has(key) && samples.size < 12) {
            // 记一次"身份"：id / data-* / 父链 / 当前 style
            const chain = []
            let p = el
            for (let i = 0; i < 5 && p; i++, p = p.parentElement) {
              const cc = p.getAttribute?.('class') || ''
              chain.push((p.tagName || '?').toLowerCase() + (p.id ? '#' + p.id : '') + (cc ? '.' + cc.split(/\s+/)[0] : ''))
            }
            const attrs = {}
            for (const a of el.attributes || []) if (a.name !== 'class' && a.name !== 'style') attrs[a.name] = a.value.slice(0, 40)
            samples.set(key, { chain: chain.join(' < '), attrs, style: (el.getAttribute('style') || '').slice(0, 120) })
          }
        }
      })
      mo.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['style'] })
      const origAnim = Element.prototype.animate
      Element.prototype.animate = function (...a) {
        bump(`${cls(this)} [animate()]`)
        return origAnim.apply(this, a)
      }
      setTimeout(() => {
        Element.prototype.setAttribute = origSet
        CSSStyleDeclaration.prototype.setProperty = origSetProp
        Element.prototype.animate = origAnim
        mo.disconnect()
        const anims = document.getAnimations().map((a) => {
          const t = a.effect?.target
          const c = t?.getAttribute?.('class') || ''
          return `${a.playState} ${a.playbackRate}x ${(t?.tagName || '?').toLowerCase()}${c ? '.' + c.split(/\s+/)[0] : ''} [${a.animationName || a.transitionProperty || '?'}]`
        })
        res({ top: [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25), anims, samples: [...samples.entries()] })
      }, secs * 1000)
    }),
  SECS,
)

console.log(`\n[${VIEW}] ${SECS}s 内 DOM 写入次数（按元素+属性）：`)
for (const [k, v] of out.top) console.log(`  ${String(v).padStart(6)}  ${k}`)
console.log(`\n每帧被改 style 的元素身份：`)
for (const [k, v] of out.samples) {
  console.log(`  ${k}`)
  console.log(`      父链 ${v.chain}`)
  console.log(`      属性 ${JSON.stringify(v.attrs)}`)
  console.log(`      style ${v.style}`)
}
console.log(`\n正在运行的 CSS 动画 ${out.anims.length} 个：`)
for (const a of out.anims.slice(0, 20)) console.log(`  ${a}`)

await browser.close()
