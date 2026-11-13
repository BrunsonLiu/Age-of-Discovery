// 岸上天光：同一座港，白天 / 黄昏 / 深夜是三种画面
//
// 跑法：先起 dev server，再 `node test/e2e/harbor-mood.mjs`
//
// 【怎么在 10 秒内看到深夜】日相是 `skyAt(performance.now(), 进度)` 的**纯函数**，
// 所以改 performance.now 就能挪日相（挪 1 个昼夜 = 480000ms）。不用等 8 分钟，
// 也就不用给生产代码加"调试用后门"——这一点和 2D/3D 是同一个时钟来源。
//
// 判据全是**像素**：opacity 对了不代表画出来了（这一层的坑项目里踩过：
// "visible ≠ 画出来了"）。所以每组都取截图分区亮度对比。

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
const until = async (fn, ms = 8000, ...args) => {
  try { await page.waitForFunction(fn, { timeout: ms }, ...args); return true } catch { return false }
}

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
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...s.fleet, isSailing: false, currentPortId: 1 } })
  window.__mapStore.getState().setViewMode('harbor')
})
check(await until(() => !!document.querySelector('[data-testid="harbor-view"]')), '进入岸上视角')
// 入场动画是整屏 opacity 0→1；没等它结束就截图会把整层稀释（同 harbor-view.mjs 的坑）
await until(() => {
  const v = document.querySelector('[data-testid="harbor-view"]')
  const i = document.querySelector('[data-testid="harbor-backdrop"]')
  return !!v && +getComputedStyle(v).opacity >= 0.999 && !!i && i.complete && i.naturalWidth > 0
}, 20000)

/** 挪日相：+ms。一昼夜 480000ms；起点相位 0.18（上午） */
const shift = ms => page.evaluate(d => {
  if (window.__realNow === undefined) {
    window.__realNow = performance.now.bind(performance)
    Object.defineProperty(performance, 'now', {
      configurable: true,
      value: () => window.__realNow() + window.__shiftMs,
    })
  }
  window.__shiftMs = d
}, ms)

const DAY = 0
const DUSK = 178400  // phase≈0.55 → lit≈0.34（日头贴海平线，暖光峰值）
const NIGHT = 273600 // phase≈0.75 → 午夜

/** 等 hook 的 4Hz 写入落地，再读各层 opacity */
const mood = async () => {
  await new Promise(r => setTimeout(r, 800))
  return page.evaluate(() => {
    const op = sel => {
      const el = document.querySelector(sel)
      return el ? +getComputedStyle(el).opacity : null
    }
    return {
      veil: op('[data-testid="harbor-night-veil"]'),
      warm: op('[data-testid="harbor-dusk-warm"]'),
      glow: op('[data-testid="harbor-dusk-glow"]'),
      stars: op('[data-testid="harbor-stars"]'),
      glint: op('[data-testid="harbor-glint"]'),
      lamps: (() => {
        const g = document.querySelector('[data-testid="harbor-lamps"]')
        return g ? +getComputedStyle(g).opacity : null
      })(),
      rain: !!document.querySelector('[data-testid="harbor-rain"]'),
      fog: !!document.querySelector('[data-testid="harbor-fog"]'),
      hasForeground: !!document.querySelector('[data-testid="harbor-quay"]'),
    }
  })
}

/** 截图并按分区量亮度（避开两块面板与两侧栏，只取玩家真能看见的带） */
const zones = async (name) => {
  const shot = await page.screenshot(name ? { path: `${SHOTS}/harbor-mood-${name}.png` } : {})
  return page.evaluate(async b64 => {
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
      const v = []
      for (let i = 0; i < d.length; i += 4) v.push((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255)
      const mean = v.reduce((a, b) => a + b, 0) / v.length
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length)
      return { mean: +mean.toFixed(3), grain: +sd.toFixed(3), max: +Math.max(...v).toFixed(3) }
    }
    return {
      满码人群: pick(0.13, 0.50, 0.40, 0.66),
      水面: pick(0.55, 0.50, 0.88, 0.66),
      天空: pick(0.30, 0.02, 0.70, 0.08),
      /*
       * 「灯下」不再写死比例：直接读**光池元素**的包围盒。
       * 上一次改前景（纯黑横带 → 石砌码头）之后，写死的 0.695~0.735 已经
       * 完全离开了灯的位置，那条断言还在"通过"（量到的是画里的水面，instead of 地面）。
       * 取样跟着元素走，改版时才会自己跟上。
       */
      灯下: (() => {
        const el = document.querySelector('[data-testid="harbor-lamp-pool"]')
        if (!el) return { mean: 0, grain: 0, max: 0 }
        const r = el.getBoundingClientRect()
        return pick(
          (r.x + r.width * 0.25) / innerWidth, (r.y + r.height * 0.45) / innerHeight,
          (r.x + r.width * 0.75) / innerWidth, (r.y + r.height * 1.05) / innerHeight,
        )
      })(),
      城市带: pick(0.02, 0.30, 0.10, 0.55),
    }
  }, shot.toString('base64'))
}

/* ── 1. 白天：三样必须严格归零 ─────────────────────────────────────── */
await shift(DAY)
const mDay = await mood()
const zDay = await zones('day')
check(mDay.veil === 0 && mDay.stars === 0 && mDay.lamps === 0,
  `白天不压夜：夜幕 ${mDay.veil} / 星 ${mDay.stars} / 灯 ${mDay.lamps} 全为 0`)
check(mDay.warm === 0, '白天没有黄昏暖光（太阳不在海平线上）')
check(mDay.hasForeground && mDay.lamps !== null, '桌面端有前景码头（灯挂在那四根系缆桩上）')

/* ── 2. 深夜：夜幕/星/灯真的起来 ───────────────────────────────────── */
await shift(NIGHT)
const mNight = await mood()
const zNight = await zones('night')
check(mNight.veil >= 0.7, `深夜夜幕起来（${mNight.veil} ≥ 0.70）`)
check(mNight.stars >= 0.9, `深夜有星（${mNight.stars} ≥ 0.90）`)
check(mNight.lamps >= 0.95, `深夜点灯（${mNight.lamps} ≥ 0.95）`)
/* 不能断言 === 0：探针挪到的"午夜"是按整秒算的，真实时刻还在走，
   太阳可能刚好差 0.1° 没过地平线（实测 warm 0.007）。判据是"基本归零"。 */
check(mNight.warm <= 0.02, `深夜没有暖光（${mNight.warm} ≤ 0.02，暖光是三角窗、日落后归零）`)

/* 判"变暗"用**比值**而不是绝对差：水面本身就是画面里最亮的一带（实测 0.17），
   往深蓝里混 0.8 也只会落到 0.13 —— 绝对差 0.04 会误判，而 1.2 倍是肉眼可见的台阶。 */
const darkRatio = zDay.水面.mean / zNight.水面.mean
check(darkRatio >= 1.15,
  `深夜确实比白天暗（水面 ${zDay.水面.mean} → ${zNight.水面.mean}，暗了 ${darkRatio.toFixed(2)} 倍）`)
check(zNight.水面.mean >= 0.06, `但没压成黑（水面仍 ${zNight.水面.mean}，城的轮廓还在）`)
check(zNight.满码人群.grain >= 0.012, `深夜仍有可辨的层次（grain ${zNight.满码人群.grain}）`)
/* 灯是"画"出来的，不只是 opacity 变了：灯下那一小块必须真的亮起来 */
const lampLift = zNight.灯下.mean - zDay.灯下.mean
check(lampLift >= 0.08, `四盏码头灯真的照亮了脚下（灯下 ${zDay.灯下.mean} → ${zNight.灯下.mean}，+${lampLift.toFixed(3)}）`)

/* ── 3. 黄昏：暖光是"染色"不是"橙色蒙版" ───────────────────────────── */
await shift(DUSK)
const mDusk = await mood()
const zDusk = await zones('dusk')
check(mDusk.warm > 0.3 && mDusk.glow > 0.3, `黄昏暖光与辉光都起来（${mDusk.warm} / ${mDusk.glow}）`)
/* 关键判据：变暖的同时**纹理不能掉**。第一版是一个 screen 橙层，
   实测 A/B 变暖 28 级、但同一片 grain 从 0.030 掉到 0.012（一片橙雾）。 */
check(zDusk.满码人群.grain >= 0.02,
  `暖光没有把画面洗平（黄昏 grain ${zDusk.满码人群.grain} ≥ 0.02；screen 单层时是 0.012）`)
check(zDusk.满码人群.mean < zDay.满码人群.mean + 0.05,
  `暖光是染色不是加亮（黄昏 ${zDusk.满码人群.mean} vs 白天 ${zDay.满码人群.mean}）`)

/* ── 4. 天候：雨/雾只在该出现时挂载，且一律在正文之下 ─────────────── */
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ weather: { ...s.weather, kind: 'storm' } })
})
await shift(DAY)
const mStorm = await mood()
check(mStorm.rain, '暴雨挂载雨幕')
check(mStorm.veil >= 0.3, `正午暴雨也压暗（veil ${mStorm.veil}；只靠 night 的话正午恒为 0）`)
check(mStorm.warm === 0 && mStorm.stars === 0, '暴雨：没有暖光、云底之下没有星')
{
  /* 雨层必须画在**正文之下**：两块内容板的背景 alpha ≥0.95，
     雨要是盖在面板上，面板内的像素会明显变化。这里 A/B 量面板内那块。 */
  await new Promise(r => setTimeout(r, 400))
  const off = await page.screenshot({ encoding: 'base64' })
  await page.evaluate(() => { document.querySelector('[data-testid="harbor-rain"]').style.opacity = '1' })
  await new Promise(r => setTimeout(r, 250))
  const on = await page.screenshot({ encoding: 'base64' })
  const d = await page.evaluate(async (x, y) => {
    const load = async s => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight; c.getContext('2d').drawImage(i, 0, 0); return c }
    const A = await load(x), B = await load(y)
    const mean = (c, x0, y0, x1, y1) => {
      const ax = Math.round(x0 * c.width), ay = Math.round(y0 * c.height)
      const w = Math.round((x1 - x0) * c.width), h = Math.round((y1 - y0) * c.height)
      const d = c.getContext('2d').getImageData(ax, ay, w, h).data
      let s = 0, m = 0
      for (let p = 0; p < d.length; p += 4) {
        const v = (Math.abs(d[p] - d[p + 1]) + Math.abs(d[p + 1] - d[p + 2])) / 2
        s += v
      }
      return s / (d.length / 4)
    }
    const diff = (x0, y0, x1, y1) => {
      const ax = Math.round(x0 * A.width), ay = Math.round(y0 * A.height)
      const w = Math.round((x1 - x0) * A.width), h = Math.round((y1 - y0) * A.height)
      const da = A.getContext('2d').getImageData(ax, ay, w, h).data
      const db = B.getContext('2d').getImageData(ax, ay, w, h).data
      let s = 0, m = 0
      for (let p = 0; p < da.length; p += 4) {
        const v = (Math.abs(da[p] - db[p]) + Math.abs(da[p + 1] - db[p + 1]) + Math.abs(da[p + 2] - db[p + 2])) / 3
        s += v; if (v > m) m = v
      }
      return { mean: +(s / (da.length / 4)).toFixed(2), max: +m.toFixed(1) }
    }
    void mean
    return { 面板内: diff(0.60, 0.15, 0.88, 0.50), 天空带: diff(0.05, 0.05, 0.45, 0.30) }
  }, off, on)
  check(d.面板内.max <= 4, `雨幕在正文之下（面板内最大差 ${d.面板内.max} ≤ 4 级；盖在面板上会是几十级）`)
  check(d.天空带.max >= 8, `雨幕真的看得见（天空带最大差 ${d.天空带.max} ≥ 8 级）`)
  check(d.天空带.max <= 60, `雨丝没有糊成白色短杠（天空带最大差 ${d.天空带.max} ≤ 60；第一版是 92）`)
}

await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ weather: { ...s.weather, kind: 'fog' } })
})
await new Promise(r => setTimeout(r, 800))
const mFog = await mood()
const zFog = await zones('fog')
check(mFog.fog && !mFog.rain, '雾天挂载雾幕、撤掉雨幕')
check(zFog.城市带.mean >= zDay.城市带.mean + 0.08,
  `雾把远处的城吞掉（城市带 ${zDay.城市带.mean} → ${zFog.城市带.mean}）`)
check(mFog.stars === 0, '雾天没有星')
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ weather: { ...s.weather, kind: 'clear' } })
})

await page.screenshot({ path: `${SHOTS}/harbor-mood-desktop.png` })

/* ── 5. 移动端：没有前景就没有灯，但夜幕/星照旧 ────────────────────── */
await page.setViewport({ width: 390, height: 844 })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => window.__gameStore.setState({
  gamePhase: 'playing', tutorialStep: -1, showHelp: false,
  dialogueSeen: ['opening_pilot'], activePanel: null,
}))
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...s.fleet, isSailing: false, currentPortId: 1 } })
  window.__mapStore.getState().setViewMode('harbor')
})
await until(() => !!document.querySelector('[data-testid="harbor-view"]'), 12000)
await until(() => {
  const v = document.querySelector('[data-testid="harbor-view"]')
  return !!v && +getComputedStyle(v).opacity >= 0.999
}, 15000)
await shift(NIGHT)
const mMobile = await mood()
check(!mMobile.hasForeground && mMobile.lamps === null,
  '移动端不渲染前景（灯也无从挂，不是"挂上了看不见"）')
check(mMobile.veil >= 0.7 && mMobile.stars >= 0.9, `移动端夜里也压暗、也有星（${mMobile.veil} / ${mMobile.stars}）`)
await page.screenshot({ path: `${SHOTS}/harbor-mood-mobile.png` })

check(errors.length === 0, `无页面错误${errors.length ? `（${errors.slice(0, 2).join(' | ')}）` : ''}`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
if (fail > 0) process.exit(1)
