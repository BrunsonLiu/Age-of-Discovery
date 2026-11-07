// 2D 天气层验收：到底看不看得出「变天」，方向对不对
//
// 跑法：`node test/e2e/weather-2d.mjs`
//
// 【为什么必须量化】
// 这一层肉眼极难判断。第一版写在最底层的压暗被上方的白云贴图吃掉，实测
//   晴天 81.1 亮度 → 阴天 83.9（+2.8）、雨 83.4（+2.3）
// 也就是**阴雨天比晴天还亮**，而截图看上去"好像是灰了一点"——凭观感根本发现不了。
// 判据只能是数字：取一块纯海面区域，算叠加后的平均亮度，和晴天基线比。
//
// 断言（基线 = 晴天的海面平均亮度 L0）：
//   · 阴天  L < L0          （哪怕只暗 5 也算及格，但方向绝不能反）
//   · 雨    L < L0 − 10
//   · 暴风雨 L < L0 − 30     （暴风雨是这套里最该"一眼看出"的）
//   · 浓雾  L > L0 + 25      （雾是灰白色，方向相反）
//   · 纹理要还在：雨的亮度离散度必须明显高于晴天（雨丝/云是有高频细节的）
//   · 天气层里不许有元素被顶栏/底栏压住（顶栏 48px、底栏高度动态）
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default } catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default }
const { readFileSync, mkdirSync } = await import('node:fs')

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++; console.log(`  ✓ ${msg}`) } else { fail++; console.log(`  ✗ FAIL: ${msg}`) } }

mkdirSync('.workbuddy/shots', { recursive: true })

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2500)

const clickIn = (o, t) => page.evaluate((o, t) => {
  const ov = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')].find(x => new RegExp(o).test(x.textContent || ''))
  const btn = ov && [...ov.querySelectorAll('button')].find(x => new RegExp(t).test(x.textContent || ''))
  if (btn) btn.click()
}, o, t)
for (const [a, c] of [['翻开日志', '翻开日志'], ['塞维利亚港', '继续']]) { await clickIn(a, c); await sleep(450) }
await page.evaluate(() => document.querySelector('button[data-mode="captain"]')?.click()); await sleep(400)
await clickIn('你想怎么玩', '继续'); await sleep(700)
await page.evaluate(() => {
  const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /选择你的天赋/.test(x.textContent || ''))
  if (!o) return
  ;[...o.querySelectorAll('button')].filter(b => /商界血脉|铁壁舰长|魅力领袖|天生探险家|随船医生/.test(b.textContent || ''))[0]?.click()
}); await sleep(400)
await clickIn('选择你的天赋', '启航'); await sleep(1500)
await clickIn('跳过引导', '跳过引导'); await sleep(400)
await page.keyboard.press('Escape'); await sleep(400)
await page.keyboard.press('Escape'); await sleep(800)

// 天气层只在航行中渲染，直接置状态（dev 钩子只在 DEV 挂载）
const setW = (kind) => page.evaluate((kind) => {
  const s = window.__gameStore
  const st = s.getState()
  s.setState({
    fleet: { ...st.fleet, isSailing: true },
    weather: { ...st.weather, kind, windDir: 70, windSpeed: 22, duration: 2 },
  })
}, kind)

const KINDS = ['clear', 'cloudy', 'rain', 'fog', 'storm']
const shots = {}
for (const k of KINDS) {
  await setW(k)
  await sleep(1500) // 过渡 1000ms + 余量
  const path = `.workbuddy/shots/wx-${k}.png`
  await page.screenshot({ path })
  shots[k] = path
}

// 是否有天气层里的元素被顶栏/底栏压住
const occluded = await page.evaluate(() => {
  const bar = document.querySelector('[data-tut="ship"]')?.getBoundingClientRect()
  const bot = document.querySelector('[data-tut="bottombar"]')?.getBoundingClientRect()
  const layer = [...document.querySelectorAll('div')].find(d => {
    const cs = getComputedStyle(d)
    return cs.position === 'absolute' && cs.inset === '0px' && cs.zIndex === '450'
  })
  if (!layer) return { layer: false, hits: [] }
  const hits = []
  for (const el of layer.querySelectorAll('div')) {
    const r = el.getBoundingClientRect()
    if (r.width < 30 || r.height < 10) continue
    // 只查"有内容"的层（纯色渐变铺满整屏的不算，它们本来就该压住整个视口）
    if (r.width > 1400 && r.height > 800) continue
    if (bar && r.top < bar.bottom - 1) hits.push({ top: Math.round(r.top), h: Math.round(r.height), where: '顶栏' })
    if (bot && r.bottom > bot.top + 1) hits.push({ top: Math.round(r.top), h: Math.round(r.height), where: '底栏' })
  }
  return { layer: true, hits }
})

// 逐张算海面区域的平均亮度与离散度
const stats = {}
for (const k of KINDS) {
  const b64 = readFileSync(shots[k]).toString('base64')
  stats[k] = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const x = c.getContext('2d'); x.drawImage(img, 0, 0)
    /*
     * 纯海面取样区：必须完全避开海岸线与 UI。
     *
     * 【踩过的坑】第一版取 x260-780 / y120-250，结果**晴天**（这一层根本不渲染）
     * 的接缝比就高达 6.34@x=511 —— 那道"接缝"是底图的海岸线被框进来了。
     * 判据一旦被无关元素污染，改对了也判失败（或改坏了也判通过）。
     * 现在这块 x180-420 / y200-400 全在开阔海面内，晴天接缝比应当接近 1。
     */
    const R = { x: 180, y: 200, w: 240, h: 200 }
    const d = x.getImageData(R.x, R.y, R.w, R.h).data
    const lums = []
    let r = 0, g = 0, bl = 0
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]; g += d[i + 1]; bl += d[i + 2]
      lums.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])
    }
    const n = lums.length
    const mean = lums.reduce((a, v) => a + v, 0) / n
    const sd = Math.sqrt(lums.reduce((a, v) => a + (v - mean) ** 2, 0) / n)
    /*
     * 高频能量：相邻像素亮度差的平均值（横+纵）。
     *
     * 【为什么不能用标准差判"雨看得出来"】雨丝是细斜线，在 520×130 的窗口里
     * 占的像素极少，标准差早就被云层的大面积渐变主导了——实测把雨纹不透明度
     * 从 0.46 提到 0.62，标准差一动不动（9.1 → 9.1），而画面其实是变了的。
     * 相邻差只对"密集的短边"敏感，正好是雨丝的特征：均匀海面几乎为 0，
     * 有雨时明显抬高。判据要挑对量，否则改对了也会判错。
     */
    let edge = 0, cn = 0
    for (let y = 0; y < R.h; y++) {
      for (let x = 0; x < R.w - 1; x++) {
        const i = (y * R.w + x) * 4
        edge += Math.abs(d[i] - d[i + 4]) + Math.abs(d[i + 1] - d[i + 5]) + Math.abs(d[i + 2] - d[i + 6])
        cn++
      }
    }
    edge /= cn

    /*
     * 接缝检测：平铺贴图会在**某一列**出现贯穿全高的突变。
     *
     * 【为什么不能用低频起伏（先模糊再算标准差）判接缝】云影本来就是大片明暗，
     * 模糊后依然有起伏——那是设计，不是缺陷。两者用同一个数根本分不开：
     * 实测把平铺云图换成 CSS 云影后，接缝肉眼已经没了，但低频起伏反而从
     * 7.98 涨到 8.22（因为云影更重更明显）。
     * 接缝的特征是"单列尖峰"：逐列求相邻像素差的均值，整片区域的这类均值
     * 应该彼此接近（雨丝是均匀分布的），只有贴图边界那一列会突然高出几倍。
     * 所以判据是 max(列差) / median(列差) 的比值。
     */
    const colDiff = []
    for (let x = 0; x < R.w - 1; x++) {
      let acc = 0
      for (let y = 0; y < R.h; y++) acc += Math.abs(d[(y * R.w + x) * 4] - d[(y * R.w + x + 1) * 4])
      colDiff.push(acc / R.h)
    }
    const sorted = [...colDiff].sort((a, b) => a - b)
    const med = sorted[sorted.length >> 1]
    let maxIdx = 0
    for (let i = 1; i < colDiff.length; i++) if (colDiff[i] > colDiff[maxIdx]) maxIdx = i
    const seamRatio = med > 0.01 ? colDiff[maxIdx] / med : 1

    return {
      rgb: [Math.round(r / n), Math.round(g / n), Math.round(bl / n)],
      lum: mean, sd, edge, seamRatio: +seamRatio.toFixed(2), seamAt: R.x + maxIdx,
    }
  }, b64)
}

const L0 = stats.clear.lum
console.log('\n=== 2D 天气层：海面平均亮度（基线 晴天 = ' + L0.toFixed(1) + '）===')
for (const k of KINDS) {
  const s = stats[k]
  const d = s.lum - L0
  console.log(`  ${k.padEnd(7)} rgb(${String(s.rgb[0]).padStart(3)},${String(s.rgb[1]).padStart(3)},${String(s.rgb[2]).padStart(3)})  亮度 ${s.lum.toFixed(1).padStart(5)} (${d >= 0 ? '+' : ''}${d.toFixed(1)})  高频 ${s.edge.toFixed(2)}  接缝比 ${s.seamRatio}@x=${s.seamAt}`)
}

console.log('\n=== 断言 ===')
ok(occluded.layer, '天气层存在（z-index 450 的整屏容器）')
ok(stats.cloudy.lum < L0, `阴天必须变暗（实测 ${(stats.cloudy.lum - L0).toFixed(1)}）`)
ok(stats.rain.lum < L0 - 10, `雨天至少要暗 10（实测 ${(stats.rain.lum - L0).toFixed(1)}）`)
ok(stats.storm.lum < L0 - 30, `暴风雨至少要暗 30（实测 ${(stats.storm.lum - L0).toFixed(1)}）`)
ok(stats.fog.lum > L0 + 25, `浓雾要提亮（雾是灰白的，实测 ${(stats.fog.lum - L0).toFixed(1)}）`)
ok(stats.rain.edge > stats.clear.edge * 1.25, `雨天要有可辨的雨丝（高频 ${stats.rain.edge.toFixed(2)} vs 晴 ${stats.clear.edge.toFixed(2)}，要求 ≥1.25×）`)
ok(stats.storm.edge > stats.clear.edge * 1.25, `暴风雨也要有密集雨丝（高频 ${stats.storm.edge.toFixed(2)}）`)
/*
 * 接缝断言：拿**同一块海面的晴天**做基线比，不设绝对值。
 * 绝对值没法定：底图自己就有羊皮纸噪点与网点纹理，晴天（天气层根本不渲染）
 * 的列差自然就有起伏。真正的贴图接缝会出现在**固定的那几个 x**（贴图宽度的
 * 整数倍处），且明显高出周围——所以既看倍数，也看它是不是落在同一个位置。
 */
for (const k of ['rain', 'fog', 'storm']) {
  const r = stats[k].seamRatio / stats.clear.seamRatio
  ok(r < 2.2, `${k} 的海面没有平铺接缝（列差尖峰 ${r.toFixed(2)}× 晴天基线，阈值 2.2）`)
}
ok(occluded.hits.length === 0, `天气层没有被顶栏/底栏压住的元素（越界 ${occluded.hits.length} 个${occluded.hits.length ? '：' + JSON.stringify(occluded.hits.slice(0, 3)) : ''}）`)
ok(errors.length === 0, `无运行时错误（${errors.length}）`)

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
