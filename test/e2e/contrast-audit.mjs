// 文字对比度审计：屏幕上每一段可见文字，实际读起来够不够清楚
//
// 跑法：先起 dev server，再 `node test/e2e/contrast-audit.mjs [--vw=1440 --vh=900]`
//
// 【为什么必须用截图像素，不能只读 CSS】
// 背景几乎从来不是单一色：面板是半透明叠在地图上、文字底下可能压着贴图/渐变、
// 元素还可能带 backdrop-filter。顺着 DOM 往上找第一个不透明的 background-color，
// 拿到的是"某个祖先的色值"，不是**文字背后那块像素真实是什么**。
// 所以这里：截图 → 对每段文字的矩形统计像素直方图 → 取众数当背景色。
// 文字像素只占矩形的一小部分，众数稳定落在背景上；抗锯齿的边缘像素因为量化
// 到每通道 8 级而被归并，不会污染众数。
//
// 判据用 WCAG AA：
//   · 正文           ≥ 4.5:1
//   · 大字（≥18px，或 ≥14px 且 bold）≥ 3:1
//
// 输出按"最差优先"排序，并附带该文字所在区域，便于定位。

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default } catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default }
const { readFileSync, mkdirSync } = await import('node:fs')

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const argOf = (k) => { const h = process.argv.find(a => a.startsWith(`--${k}=`)); return h ? h.split('=')[1] : undefined }
const VW = Number(argOf('vw') ?? 1440)
const VH = Number(argOf('vh') ?? 900)
/** 可选：先打开某个面板再审计（--panel=port） */
const PANEL = argOf('panel')

mkdirSync('.workbuddy/shots', { recursive: true })

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: VW, height: VH })
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
await clickIn('扬帆起航', '扬帆起航'); await sleep(700)
await clickIn('第一次出航', '启航'); await sleep(1500)
await clickIn('跳过引导', '跳过引导'); await sleep(400)
await page.keyboard.press('Escape'); await sleep(400)
await page.keyboard.press('Escape'); await sleep(800)

if (PANEL) {
  await page.evaluate((t) => document.querySelector(`[data-tut="${t}"]`)?.click(), PANEL)
  await sleep(900)
}

const shotPath = `.workbuddy/shots/contrast-${PANEL ?? 'map'}.png`
await page.screenshot({ path: shotPath })

// ---- 收集所有可见文字节点 ----
const items = await page.evaluate((VW, VH) => {
  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const p = m[1].split(',').map(Number)
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }
  }
  const visible = (el) => {
    let r = el.getBoundingClientRect()
    /*
     * 【盲区：0×0 的包裹层】
     * Leaflet 的 divIcon 包裹层是 0×0 的，文字靠溢出画在盒外——
     * `getBoundingClientRect()` 于是返回 width=0，整批洋名/洲名标签
     * 被这里一句 `width < 2` 全部跳过。它们恰恰是全屏面积最大的那片海上
     * 唯一的文字（"大西洋""加勒比海"），颜色是 rgba(60,80,50,0.45)
     * 压在深蓝海面上，实测对比 **1.03:1** —— 一个字都看不见，
     * 而审计一直报"0 未达标"，给了个假的"已验证"。
     *
     * 盒宽为 0 时用 Range 量**真实文字范围**：它取的是字形实际占据的矩形。
     */
    if (r.width < 2 || r.height < 2) {
      const range = document.createRange()
      range.selectNodeContents(el)
      const rr = range.getBoundingClientRect()
      if (rr.width >= 2 && rr.height >= 2) r = rr
    }
    if (r.width < 2 || r.height < 2) return null
    if (r.right < 2 || r.bottom < 2 || r.left > VW - 2 || r.top > VH - 2) return null
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none') return null
    let op = 1
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      op *= Number(getComputedStyle(n).opacity)
      /*
       * 装饰层跳过。
       * 底图上有一层复古水印（罗盘玫瑰、经纬线、角落的 N/W 字母），
       * 它本来就该"若隐若现"，按正文 4.5:1 去要求它是错的——
       * 修成高对比反而会盖住地图。
       * 用 aria-hidden="true" 当判据：这是无障碍语义里"纯装饰、无信息"的
       * 正式写法，比按类名猜稳。真正承载信息的文字不该挂在 aria-hidden 下。
       */
      if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return null
      /*
       * 禁用态跳过。
       * ActionButton 的 disabled 是 `opacity-40`——按 WCAG 的意图，禁用的控件
       * 本来就不承诺可读（它根本没有可点的动作）。把它们算成"未达标"会让
       * 交易面板凭空多出十几条，掩盖真正的毛病（实测：22 条里有一大半是
       * 买不起时灰掉的 +10 / +5）。
       */
      if (n.matches && n.matches(':disabled, [aria-disabled="true"]')) return null
    }
    if (op < 0.25) return null
    /*
     * 被滚动容器裁掉的元素要跳过。
     * 面板内容区是 overflow-y:auto，滚出视口的那几行 getBoundingClientRect
     * 照样落在屏幕里 —— 我一开始拿它们和"面板外面那片地图"的像素比对比度，
     * 于是交易面板凭空多出一堆 1.0:1 的"未达标"。判据必须问一句
     * "这段字此刻真的画在那块像素上吗"。
     * 只看 overflow（不看 transform 动画），因为它是最常见的裁切来源。
     */
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs2 = getComputedStyle(n)
      if (cs2.overflowY === 'visible' && cs2.overflowX === 'visible') continue
      const pr = n.getBoundingClientRect()
      if (pr.height < 4) continue
      if (r.top < pr.top - 1 || r.bottom > pr.bottom + 1) return null
    }
    return r
  }
  const out = []
  for (const el of document.querySelectorAll('body *')) {
    let txt = ''
    for (const n of el.childNodes) if (n.nodeType === 3) txt += n.textContent
    txt = txt.trim()
    if (!txt) continue
    const r = visible(el)
    if (!r) continue
    const cs = getComputedStyle(el)
    /*
     * 【SVG <text> 用 fill 上色，不是 CSS color】
     * 第一版统一读 cs.color，结果 compass 的 N/E/S/W 被判成"奶白字压在浅色盘面上
     * 1.31:1"——其实那些字母的 fill 是深金色，画得很清楚。判据读错了属性，
     * 就会报假阳性，而假阳性比不测更糟：会让人去"修"一个本来没坏的东西。
     */
    const isSvgText = el.namespaceURI === 'http://www.w3.org/2000/svg'
    const fg = parse(isSvgText ? (cs.fill || cs.color) : cs.color)
    if (!fg) continue
    const fs = parseFloat(cs.fontSize)
    const bold = Number(cs.fontWeight) >= 700
    out.push({
      txt: txt.slice(0, 22),
      tag: el.tagName,
      cls: ((el.getAttribute && el.getAttribute('class')) || '').toString().slice(0, 46),
      parentCls: ((el.parentElement?.getAttribute?.('class')) || '').toString().slice(0, 40),
      color: cs.color,
      fg, fs, bold,
      rect: { x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.min(r.width, VW - r.left), h: Math.min(r.height, VH - r.top) },
    })
  }
  return out
}, VW, VH)

// ---- 用截图像素估每段文字的背景色 ----
const b64 = readFileSync(shotPath).toString('base64')
const measured = await page.evaluate(async (b64, items) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0)
  // 一次性取出整屏像素，避免几百次 getImageData
  const full = g.getImageData(0, 0, img.width, img.height)
  const W = img.width

  const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  const lum = (r, gr, b) => 0.2126 * lin(r) + 0.7152 * lin(gr) + 0.0722 * lin(b)
  const ratio = (a, b) => { const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05) }

  return items.map(it => {
    /*
     * 【取样范围要外扩，并且要把"接近文字色"的像素剔掉】
     * 第一版只取元素矩形内的众数。对 13px 的小字（罗盘的 N/S/E/W 只有 10×14px）
     * 矩形里几乎全是字形像素，众数直接落在**文字自己身上**，算出来的对比度
     * 是 1.05:1 —— 一个深色盘面上的奶白字母被报成"看不清"，
     * 完全是因为背景估错了。
     * 现在：矩形外扩 4px（把周围底色圈进来），统计时跳过与前景色接近的分箱。
     */
    const PAD = 4
    const x0 = Math.max(0, Math.floor(it.rect.x) - PAD), y0 = Math.max(0, Math.floor(it.rect.y) - PAD)
    const x1 = Math.min(img.width - 1, Math.ceil(it.rect.x + it.rect.w) + PAD)
    const y1 = Math.min(img.height - 1, Math.ceil(it.rect.y + it.rect.h) + PAD)
    const near = (r, g, b) => {
      const dr = r - it.fg.r, dg = g - it.fg.g, db = b - it.fg.b
      return Math.sqrt(dr * dr + dg * dg + db * db) < 90
    }
    const hist = new Map()
    let n = 0
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const i = (y * W + x) * 4
        // 量化到每通道 5 级，容忍抗锯齿
        const k = ((full.data[i] >> 3) << 10) | ((full.data[i + 1] >> 3) << 5) | (full.data[i + 2] >> 3)
        const e = hist.get(k) || [0, 0, 0, 0]
        e[0] += full.data[i]; e[1] += full.data[i + 1]; e[2] += full.data[i + 2]; e[3] += 1
        hist.set(k, e)
        n++
      }
    }
    if (!n) return { ...it, bg: null, contrast: null }
    let best = null
    for (const e of hist.values()) {
      const mr = e[0] / e[3], mg = e[1] / e[3], mb = e[2] / e[3]
      // 跳过"就是文字本身"的那一箱，否则背景会被估成前景色
      if (near(mr, mg, mb)) continue
      if (!best || e[3] > best[3]) best = e
    }
    // 整块都被文字占满（极窄的字形）时退回全量众数，至少不至于空
    if (!best) for (const e of hist.values()) if (!best || e[3] > best[3]) best = e
    const bg = { r: Math.round(best[0] / best[3]), g: Math.round(best[1] / best[3]), b: Math.round(best[2] / best[3]) }
    // 文字色若带 alpha，先与背景合成再算
    const a = it.fg.a
    const fg = {
      r: Math.round(it.fg.r * a + bg.r * (1 - a)),
      g: Math.round(it.fg.g * a + bg.g * (1 - a)),
      b: Math.round(it.fg.b * a + bg.b * (1 - a)),
    }
    const cr = ratio(lum(fg.r, fg.g, fg.b), lum(bg.r, bg.g, bg.b))
    return {
      ...it, bg, contrast: +cr.toFixed(2),
      dbg: { fg, lf: +lum(fg.r, fg.g, fg.b).toFixed(4), lb: +lum(bg.r, bg.g, bg.b).toFixed(4), raw: it.color },
    }
  })
}, b64, items)

// ---- 汇总 ----
const need = (it) => (it.fs >= 18 || (it.fs >= 14 && it.bold)) ? 3 : 4.5
const graded = measured.filter(m => m.contrast != null).map(m => ({ ...m, need: need(m), pass: m.contrast >= need(m) }))
const fails = graded.filter(m => !m.pass).sort((a, b) => a.contrast - b.contrast)

console.log(`\n视口 ${VW}×${VH}${PANEL ? ` · 面板 ${PANEL}` : ''} · 可见文字 ${graded.length} 段`)
console.log(`  未达标 ${fails.length} 段（AA：正文 4.5 / 大字 3.0）`)

if (fails.length) {
  console.log('\n最差的 25 段：')
  for (const m of fails.slice(0, 25)) {
    console.log(`  ${String(m.contrast).padStart(5)}:1 (需 ${m.need})  ${m.fs}px${m.bold ? ' bold' : ''} @(${Math.round(m.rect.x)},${Math.round(m.rect.y)})  字 ${m.color}  底 rgb(${m.bg.r},${m.bg.g},${m.bg.b})  「${m.txt}」`)
    console.log(`         dbg fg=${JSON.stringify(m.dbg.fg)} | ${m.tag}.${m.cls} <- ${m.parentCls}`)
  }
}

const bucket = {}
for (const f of fails) {
  const k = `${Math.floor(f.contrast)}:1 段`
  bucket[k] = (bucket[k] || 0) + 1
}
if (fails.length) {
  console.log('\n分布：')
  for (const k of Object.keys(bucket).sort()) console.log(`  ${k}  ×${bucket[k]}`)
}

await browser.close()
process.exit(fails.length ? 1 : 0)
