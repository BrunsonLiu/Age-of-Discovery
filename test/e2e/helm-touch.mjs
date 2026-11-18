/*
 * 操舵挑战在**真触屏**上能不能玩。
 *
 * 【为什么必须单独一套】
 * 这是玩家每段航程都会遇到的小游戏，但它的输入是键盘（A/D + W/S + Enter）。
 * 触屏版靠 `useIsTouchPrimary()`（`(pointer: coarse)`）换成 ◀▲▶▼ 四个虚拟键。
 * 桌面浏览器把窗口拖到 390 宽**不会**让这个媒体查询命中 ——
 * 只用 setViewport 测，会得出"手机上根本没有虚拟键"的错结论（第一版就这么误判了）。
 * 必须 `hasTouch: true` + `isMobile: true`，而且**从一开始就是**这个视口：
 * 挂载后再改 hasTouch，matchMedia 的 change 事件不播，组件不会重渲染。
 *
 * 【判据取向】
 * 不只看"按钮在不在"——那只能证明渲染分支走对了。要证明**触摸真的让船转了**：
 * 按住 ▶ 一段时间，"帆向/风向夹角"必须单向持续变化（每秒约 40°）；
 * 而不按键时风向只是缓慢摆动，不会有这种单向大位移。这是唯一能把
 * "转向生效" 和 "风在摆" 分开的判据。
 */
const BASE = process.env.GAME_URL || process.env.GAME_URL || process.env.AOD_BASE || 'http://127.0.0.1:5174/Age-of-Discovery/'
const puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log(`  ✓ ${msg}`) } else { fail++; console.log(`  ✗ FAIL: ${msg}`) } }

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
// 真手机：390×844 + 触摸 + 移动端 UA 语义。**goto 之前**就设好。
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 40000 })
await sleep(2200)

console.log('=== 布置：出航 → 选方针 → 进操舵 ===')
await page.evaluate(async () => {
  const g = window.__gameStore
  const d = window.__dialogueStore
  for (let i = 0; i < 25 && d?.getState?.().scriptId; i++) d.getState().skip()
  g.setState({ gamePhase: 'playing', tutorialStep: -1, showHelp: false, activePanel: null, dialogueSeen: ['opening_pilot'] })
  const ps = await import('/Age-of-Discovery/src/data/ports.ts')
  const t = ps.ports.find(x => x.id === 14)
  g.getState().sailToWaypoint({ latitude: t.latitude, longitude: t.longitude, portId: t.id })
  g.getState().confirmDeparture()
})
await sleep(900)
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  if (s.gamePhase === 'segment') s.chooseStance('steady')
})
await sleep(1100)
const phase = await page.evaluate(() => window.__gameStore.getState().gamePhase)
check(phase === 'helm', `进到操舵阶段（${phase}）`)
check(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches), '(pointer: coarse) 命中（真触屏语义）')

/* ── 一、开始屏：虚拟键不该在，但要说清"没有键盘怎么办" ── */
console.log('\n=== 开始屏 ===')
const start = await page.evaluate(() => {
  const t = document.body.innerText || ''
  return { hasNoKeyboard: /没有键盘/.test(t), hasKeypad: !!document.querySelector('[data-testid="touch-keypad"]') }
})
check(start.hasNoKeyboard, '开始屏明说「没有键盘？下方有一套虚拟按键」')
check(!start.hasKeypad, '开始屏还没到操作阶段，虚拟键不出现（不抢按钮）')

/* ── 二、进游戏：四个虚拟键 + 收舵 ── */
console.log('\n=== 进行中：虚拟键 ===')
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => /掌舵启程/.test(b.textContent || ''))
  btn?.click()
})
await sleep(1800)

const keys = await page.evaluate(() => {
  const ids = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']
  return ids.map(k => {
    const el = document.querySelector(`[data-testid="touch-key-${k}"]`)
    if (!el) return { k, ok: false }
    const r = el.getBoundingClientRect()
    return {
      k, ok: true,
      label: (el.textContent || '').replace(/\s+/g, ' ').trim(),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      inView: r.bottom <= innerHeight + 1 && r.top >= -1,
      // 触摸热区：手指比鼠标粗，44px 是通用下限
      bigEnough: r.width >= 44 && r.height >= 44,
    }
  })
})
check(keys.every(k => k.ok), `四个虚拟键都在（${keys.map(k => k.k).join('/')}）`)
check(keys.every(k => k.inView), '四个键都在视口内（不用滚动）')
check(keys.every(k => k.bigEnough),
  `每个键热区 ≥44×44（实际 ${keys.map(k => `${Math.round(k.rect[2])}×${Math.round(k.rect[3])}`).join(', ')}）`)

const finish = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="touch-helm-finish"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { text: (el.textContent || '').trim(), inView: r.bottom <= innerHeight + 1, h: Math.round(r.height) }
})
check(!!finish, '「收舵」按钮在')
check(!!finish && finish.inView, `「收舵」不用滚动就能点到（${finish?.text}）`)
check(!!finish && !/Enter/.test(finish.text), `触屏上的收舵按钮不提 Enter（${finish?.text}）`)

/* ── 三、键盘提示必须让位 ── */
const hintText = await page.evaluate(() => (document.body.innerText || ''))
check(!/A\/D 转向/.test(hintText), '触屏上不再显示「A/D 转向」——手机上没这个键')
check(/按住 ◀ ▶ 转舵/.test(hintText), '换成触屏说法：「按住 ◀ ▶ 转舵」')

/* ── 四、活性：按住 ▶ 与静置，用"逐帧变化之和"对照 ── */
console.log('\n=== 活性：按住 ▶ 让船真的转 ===')
const readAngle = () => page.evaluate(() => {
  const t = document.body.innerText || ''
  const m = t.match(/夹角\s*(\d+)\s*°/)
  return m ? +m[1] : null
})

/*
 * 为什么用"逐帧变化之和"（total variation）而不是首尾差：
 * 夹角是 0~180 的最短夹角，转到 90° 之后会**往回折**，首尾差可能接近 0；
 * 而风向本身在缓慢摆动，单看首尾差分不清"在转"还是"风在摆"。
 * TV = Σ|Δ| 对"持续单向转"很敏感（每 200ms ~8°），
 * 对低频风摆不敏感，这才是能把两者分开的量。
 */
const tv = (arr) => {
  let sum = 0
  for (let i = 1; i < arr.length; i++) {
    let d = Math.abs(arr[i] - arr[i - 1])
    if (d > 90) d = 180 - d          // 夹角回绕
    sum += d
  }
  return sum
}
const sample = async (n, gap) => {
  const out = []
  for (let i = 0; i < n; i++) { out.push(await readAngle()); await sleep(gap) }
  return out
}

// ① 静置基线
const idleSeq = await sample(6, 200)
const tvIdle = tv(idleSeq)
console.log(`  静置 1s：${idleSeq.join('→')}（TV ${tvIdle}°）`)

// ② 按住 ▶ 1 秒
const down = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="touch-key-ArrowRight"]')
  if (!el) return false
  const r = el.getBoundingClientRect()
  el.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch',
    clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, isPrimary: true,
  }))
  return true
})
check(down, '能在 ▶ 上派发 pointerdown')
const heldSeq = await sample(6, 200)
await page.evaluate(() => {
  const el = document.querySelector('[data-testid="touch-key-ArrowRight"]')
  const r = el.getBoundingClientRect()
  el.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch',
    clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, isPrimary: true,
  }))
})
const tvHeld = tv(heldSeq)
console.log(`  按住 ▶ 1s：${heldSeq.join('→')}（TV ${tvHeld}°）`)

check(tvHeld >= 15, `按住时夹角持续在动（TV ${tvHeld}°，判据 ≥15 —— 每秒约 40°，1 秒该有 30° 以上）`)
check(tvHeld > Math.max(tvIdle * 2, tvIdle + 8),
  `明显大于静置基线（${tvHeld}° vs 静置 ${tvIdle}°）—— 是真的在转，不是风在摆`)

// ③ 松手后必须停下来
const relSeq = await sample(6, 200)
const tvRel = tv(relSeq)
console.log(`  松手后 1s：${relSeq.join('→')}（TV ${tvRel}°）`)
check(tvRel < tvHeld / 2,
  `松手后不再持续转（TV 从 ${tvHeld}° 降到 ${tvRel}°）—— 不会"卡住油门"`)

await page.screenshot({ path: '.workbuddy/shots/helm-touch.png' })
check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail ? 1 : 0)
