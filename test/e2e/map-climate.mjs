// 2D 海图「气候线：回归线与极圈」（回归）
//
// 【守什么】这四条线不是装饰，它们把纬度切成气候带（季风/风带/海况都按纬度分档）。
// 所以守的不是"画出来了"，而是**图上说的和天文上的一致**：
//  ① 四条线都在（南北回归线 + 南北极圈），而且缩到全世界时一条不缺；
//  ② 名字嵌在线里：线在标签处**真的断开**，两侧各留 10~40px（不是线穿字而过、
//     也不是断得没边）；
//  ③ 南北对称：北回归线与南回归线的 y 关于赤道对称（墨卡托关于赤道对称，
//     这是投影的性质，摊平错了就会露馅）；
//  ④ 位置来自投影而不是线性插值：23.4362° 在 25°N 与 20°N 之间的相对位置
//     必须等于墨卡托公式算出来的那个比值（线性插值会差 4 个百分点）；
//  ⑤ 和网格分得开：暖色虚线 / pane 345 / 名字 522 / 12px / 不吃点击。
//
// 跑法：先起 dev server（5174），再 `node test/e2e/map-climate.mjs`
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
const page = await (await browser.createBrowserContext()).newPage()
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
await sleep(2400)
await page.evaluate(() => {
  window.__gameStore.setState({ gamePhase: 'playing', currentEvent: null })
  window.__mapStore.setState({ viewMode: 'chart' })
})
await sleep(1200)
await page.evaluate(() => {
  document.querySelectorAll('div.fixed.inset-0').forEach((d) => {
    if (/跳过致辞/.test(d.textContent || '')) d.style.display = 'none'
  })
  document.querySelectorAll('[role=dialog]').forEach((d) => { d.style.display = 'none' })
})
await sleep(1800)

/** 读气候线（线 + 名字）与网格度数 */
const read = () => page.evaluate(() => {
  const paths = [...document.querySelectorAll('.climate-line')].map((p) => {
    const b = p.getBoundingClientRect()
    return {
      stroke: (p.getAttribute('stroke') || '').toLowerCase(),
      dash: p.getAttribute('stroke-dasharray') || '',
      opacity: Number(p.getAttribute('stroke-opacity')),
      weight: Number(p.getAttribute('stroke-width')),
      x0: b.x, x1: b.x + b.width, y: b.y + b.height / 2,
    }
  })
  const labels = [...document.querySelectorAll('.climate-label span')].map((s) => {
    const b = s.getBoundingClientRect()
    const st = getComputedStyle(s)
    return {
      t: (s.textContent || '').trim(),
      x0: b.x, x1: b.x + b.width, y: b.y + b.height / 2,
      w: b.width, h: b.height,
      fs: parseFloat(st.fontSize),
      bg: st.backgroundColor,
    }
  })
  const grid = [...document.querySelectorAll('.grat-label span')].map((s) => {
    const b = s.getBoundingClientRect()
    return { t: (s.textContent || '').trim(), y: b.y + b.height / 2 }
  })
  const pane = document.querySelector('.leaflet-climate-pane')
  const lblPane = document.querySelector('.leaflet-climateLabels-pane')
  const landPane = document.querySelector('.leaflet-overlay-pane')
  const st = (el) => (el ? getComputedStyle(el) : null)
  return {
    paths, labels, grid,
    paneZ: st(pane)?.zIndex ?? null,
    panePE: st(pane)?.pointerEvents ?? null,
    lblZ: st(lblPane)?.zIndex ?? null,
    lblPE: st(lblPane)?.pointerEvents ?? null,
    landZ: st(landPane)?.zIndex ?? null,
    labelPE: st(document.querySelector('.climate-label'))?.pointerEvents ?? null,
  }
})

/** 连续两次读数一致才算稳定（缩放是 CSS transform 动画，动画中量到的是中间值） */
const readStable = async () => {
  let prev = null
  for (let i = 0; i < 15; i++) {
    const s = await read()
    const sig = s.paths.map((p) => `${p.x0.toFixed(0)}-${p.x1.toFixed(0)}@${p.y.toFixed(0)}`).sort().join(',')
      + '|' + s.labels.map((l) => l.t + '@' + l.y.toFixed(0)).sort().join(',')
    if (sig === prev && s.paths.length) return s
    prev = sig
    await sleep(400)
  }
  return read()
}

// ------------------------------------------------------------ ① 默认视角
const s1 = await readStable()
check(s1.paths.length >= 2, `线画出来了（${s1.paths.length} 段）`)
check(s1.labels.length >= 1, `名字写出来了（${s1.labels.map((l) => l.t).join(' ')}）`)
check(s1.paths.every((p) => p.stroke === '#d8bd8a'), `线是暖金色（实测 ${s1.paths[0]?.stroke}）`)
check(s1.paths.every((p) => p.dash === '8 4'), `线是虚线（dash="${s1.paths[0]?.dash}"，占空 67% —— 7 6 读成"一串点"）`)
check(s1.paths.every((p) => Math.abs(p.opacity - 0.5) < 1e-6),
  `透明度 0.5（A/B 差分实测：线本身 mean 21.7 / p90 54 级，网格 13.2 / 15.3 —— 比网格重一档）`)
check(s1.labels.every((l) => l.fs >= 12), `名字字号 ${s1.labels[0]?.fs}px ≥ 12（项目下限）`)
check(s1.labels.every((l) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(l.bg || '')
  return m && Number(m[4] ?? 1) >= 0.45
}), `名字带底板（${s1.labels[0]?.bg}）—— 回归线要穿过撒哈拉，金字直接放在沙色上读不出来`)

// ----------------------------------------------------- ② 层级与不吃点击
check(s1.paneZ === '345', `线 pane z=${s1.paneZ}（陆地 ${s1.landZ} 之下 → 压陆的半截自动被盖住）`)
check(s1.lblZ === '522', `名字 pane z=${s1.lblZ}（网格度数 520 之上、港口 600 之下）`)
check(s1.panePE === 'none' && s1.lblPE === 'none' && s1.labelPE === 'none',
  `两层都不吃指针（线 ${s1.panePE} / 名字 ${s1.lblPE} / 标签 ${s1.labelPE}）`)

// -------------------------------------------------- ③ 断口：线在字处断开
const gapOk = []
for (const l of s1.labels) {
  const sameRow = s1.paths.filter((p) => Math.abs(p.y - l.y) <= 2)
  if (sameRow.length < 2) { gapOk.push({ t: l.t, ok: false, why: `${sameRow.length} 段` }); continue }
  const left = sameRow.filter((p) => p.x1 <= l.x0 + 1).sort((a, b) => b.x1 - a.x1)[0]
  const right = sameRow.filter((p) => p.x0 >= l.x1 - 1).sort((a, b) => a.x0 - b.x0)[0]
  const gapL = left ? l.x0 - left.x1 : -1
  const gapR = right ? right.x0 - l.x1 : -1
  gapOk.push({ t: l.t, ok: gapL >= 8 && gapL <= 44 && gapR >= 8 && gapR <= 44, gapL, gapR })
}
check(gapOk.every((g) => g.ok),
  `名字嵌在线的断口里（两侧空隙 ${gapOk.map((g) => `${g.t}:${g.gapL === undefined ? '?' : Math.round(g.gapL)}/${g.gapR === undefined ? '?' : Math.round(g.gapR)}px`).join(' ')}）`)

// ------------------------------------------------------- ④ 缩到全世界：四线齐全
await page.mouse.move(720, 430)
for (let i = 0; i < 14; i++) { await page.mouse.wheel({ deltaY: 220 }); await sleep(320) }
await sleep(1200)
const s2 = await readStable()
const names = s2.labels.map((l) => l.t).sort().join(' ')
check(s2.labels.length === 4, `全世界视图四条线都在（${names}）`)
for (const n of ['北回归线', '南回归线', '北极圈', '南极圈']) {
  check(s2.labels.some((l) => l.t === n), `有「${n}」`)
}
check(s2.paths.length === 8, `每条线两段（共 ${s2.paths.length} 段 = 4 线 × 2）`)

/** "赤道" 网格标签的 y（全世界视图里它在南北回归线正中间） */
const eq = s2.grid.find((g) => g.t === '赤道')
check(!!eq, `网格里有「赤道」（y=${eq ? Math.round(eq.y) : '—'}）`)

const latY = (name) => s2.labels.find((l) => l.t === name)?.y
const yN = latY('北回归线')
const yS = latY('南回归线')
check(Number.isFinite(yN) && Number.isFinite(yS) && eq &&
  Math.abs((yN + yS) / 2 - eq.y) <= 2,
  `南北回归线关于赤道对称（${Math.round(yN)} / ${Math.round(yS)}，中点 ${Math.round((yN + yS) / 2)} vs 赤道 ${eq ? Math.round(eq.y) : '—'}）`)
const yArc = latY('北极圈')
const yAnt = latY('南极圈')
check(Number.isFinite(yArc) && Number.isFinite(yAnt) && eq &&
  Math.abs((yArc + yAnt) / 2 - eq.y) <= 2,
  `南北极圈也关于赤道对称（${Math.round(yArc)} / ${Math.round(yAnt)}）`)
check(yArc < yN, `北极圈在回归线以北（y ${Math.round(yArc)} < ${Math.round(yN)}）`)

// --------------------------- ⑤ 位置来自墨卡托投影，不是线性插值
const parseLat = (t) => {
  if (t === '赤道') return 0
  const m = /^(\d+)°(?:(\d{2})′)?([NS])?$/.exec(t)
  if (!m) return null
  const d = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0)
  return m[3] === 'S' ? -d : d
}
const gridLats = s2.grid.filter((g) => /[NS]$|^赤道$/.test(g.t)).map((g) => ({ lat: parseLat(g.t), y: g.y }))
  .filter((g) => Number.isFinite(g.lat))
const gEq = gridLats.find((g) => g.lat === 0)
const g60 = gridLats.find((g) => Math.abs(g.lat - 60) < 1e-6)
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
OK_GEO:
check(!!gEq && !!g60, `网格里有「赤道」与 60°N（${gEq?.y?.toFixed(0) ?? '—'} / ${g60?.y?.toFixed(0) ?? '—'}）`)
if (gEq && g60 && Number.isFinite(yN) && Number.isFinite(yArc)) {
  /*
   * 判据取**跨 60 度**的一条基线：从赤道到 60°N。
   * 为什么不用"相邻两条网格线之间"（25/20 或 70/60）：纬度接近赤道时墨卡托
   * 与线性插值几乎一样（25/20 之间只差 0.5px），那条判据根本没有区分力 ——
   * 用它判"是投影画的"等于没判。跨到 60°N 之后，两者差 13px 以上（见下一条）。
   */
  const span = gEq.y - g60.y
  const predict = (lat) => gEq.y - (merc(lat) / merc(60)) * span
  const linear = (lat) => gEq.y - (lat / 60) * span
  const pTropic = predict(23.4362)
  const pArc = predict(90 - 23.4362)
  check(Math.abs(yN - pTropic) <= 2,
    `北回归线的 y 由墨卡托公式算出（实测 ${yN.toFixed(0)} vs 公式 ${pTropic.toFixed(0)}，线性插值会给 ${linear(23.4362).toFixed(0)}）`)
  check(Math.abs(yArc - pArc) <= 2,
    `北极圈的 y 由墨卡托公式算出（实测 ${yArc.toFixed(0)} vs 公式 ${pArc.toFixed(0)}，线性插值会给 ${linear(90 - 23.4362).toFixed(0)}）`)
  check(Math.abs(pTropic - linear(23.4362)) > 8 && Math.abs(pArc - linear(90 - 23.4362)) > 8,
    `这两条判据真的能区分"投影"与"线性插值"（差 ${Math.abs(pTropic - linear(23.4362)).toFixed(0)}px / ${Math.abs(pArc - linear(90 - 23.4362)).toFixed(0)}px）`)
  const g30 = gridLats.find((g) => Math.abs(g.lat - 30) < 1e-6)
  if (g30) {
    check(Math.abs(yN - g30.y) > 4, `回归线没有和 30°N 网格线画在一起（相距 ${Math.abs(yN - g30.y).toFixed(0)}px）`)
  }
}

// ------------------------------------------- ⑥ 全世界视图里断口仍然对位
const gapOk2 = []
for (const l of s2.labels) {
  const sameRow = s2.paths.filter((p) => Math.abs(p.y - l.y) <= 2)
  const left = sameRow.filter((p) => p.x1 <= l.x0 + 1).sort((a, b) => b.x1 - a.x1)[0]
  const right = sameRow.filter((p) => p.x0 >= l.x1 - 1).sort((a, b) => a.x0 - b.x0)[0]
  gapOk2.push({
    t: l.t,
    ok: !!left && !!right && (l.x0 - left.x1) >= 8 && (l.x0 - left.x1) <= 44
      && (right.x0 - l.x1) >= 8 && (right.x0 - l.x1) <= 44,
  })
}
check(gapOk2.every((g) => g.ok), `缩到全世界后断口仍对位（${gapOk2.filter((g) => g.ok).length}/${gapOk2.length}）`)
check(s2.labels.every((l) => l.y > 56 && l.y < 838), '名字没有被顶部木梁/底栏压住')

// --------------------------------------------- ⑦ 放大回去：回归进程一出现就在
/*
 * 【为什么不是"放大回来必须还在"】这张图跟着船走，放大几级之后视野只有几度，
 * 回归线根本不在画面里 —— 那时"没有"才是对的（纬线是水平的，要么整条在、
 * 要么整条不在）。所以判据要判**该出现的时候出现了**：慢慢放大，只要某一步
 * 视野扫过回归线，它就必须带着名字出现。
 */
let seen = null
for (let i = 0; i < 16; i++) {
  await page.mouse.wheel({ deltaY: -110 })
  await sleep(420)
  const s = await read()
  if (s.labels.length > 0) { seen = s; break }
}
check(!!seen && seen.paths.length >= 2,
  seen ? `放大过程中回归线还在（${seen.paths.length} 段 / ${seen.labels.map((l) => l.t).join(' ')}）`
    : '放大 16 档都没再见到回归线（每档视野都没扫过 23.44°N？）')

console.log(`\n报错：${errors.length ? errors.join(' | ') : '无'}`)
check(errors.length === 0, '无页面报错')
console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
