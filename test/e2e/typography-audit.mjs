// 字号与按钮尺寸巡检：屏幕上到底有多少字是「10px 中文」这种读不动的大小
//
// 跑法：先起 dev server，再 `node test/e2e/typography-audit.mjs [--vw=1440 --vh=900]`
//
// 【为什么需要这个脚本】
// 玩家反馈「字体有点小，包括按钮、信息栏、地图四周的按键」。这种事靠读代码
// 判断不了：`text-xs` 在 Tailwind 里是 12px，但同一个 12px 放在深木底上、
// 放在半透明黑上、放在金边卡片上，可读性完全不同；而且 201 处 text-xs 里
// 哪些是"重要信息"、哪些是"装饰角标"，只能按它在屏幕上的位置和上下文分。
//
// 判据（业界最保守的一套，中文尤其要保守）：
//   · 正文/按钮文字 ≥ 14px：中文没有 x-height 缓冲，12px 宋黑笔画会糊
//   · 辅助信息 ≥ 12px：低于 12px 的中文只能当符号看
//   · 可点目标 ≥ 32×32px：Fitts 定律下的最低可用尺寸，一手鼠标点得准
//
// 输出按「所在区域」分组，只统计真正可见（尺寸>0、屏内、非透明）的元素。

let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const argOf = (k) => {
  const hit = process.argv.find(a => a.startsWith(`--${k}=`))
  return hit ? Number(hit.split('=')[1]) : undefined
}
const VW = argOf('vw') ?? 1440
const VH = argOf('vh') ?? 900

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.setViewport({ width: VW, height: VH })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2500)

const clickIn = (ov, bt) => page.evaluate((o, b) => {
  const ovl = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')].find(x => new RegExp(o).test(x.textContent || ''))
  const btn = ovl && [...ovl.querySelectorAll('button')].find(x => new RegExp(b).test(x.textContent || ''))
  if (btn) btn.click()
}, ov, bt)

// 走到「在地图上、没有浮层」的常态
for (const [a, b] of [['翻开日志', '翻开日志'], ['塞维利亚港', '继续']]) { await clickIn(a, b); await sleep(450) }
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
await page.keyboard.press('Escape'); await sleep(700)

const report = await page.evaluate((VW, VH) => {
  /** 页面滚不滚都不影响：本游戏全屏 fixed 布局 */
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) return null
    if (r.bottom < 0 || r.top > VH || r.right < 0 || r.left > VW) return null
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) return null
    return r
  }

  /** 区域判定：先看祖先里有没有已知容器，再退回几何分带 */
  const region = (el, r) => {
    let n = el
    for (let i = 0; i < 12 && n; i++, n = n.parentElement) {
      const tut = n.getAttribute?.('data-tut')
      if (tut === 'bottombar') return '底栏'
      if (tut === 'ship') return '顶栏'
      const c = n.className?.baseVal ?? n.className ?? ''
      if (typeof c === 'string') {
        if (/side-plate|SideBar|sidebar/.test(c)) return '左侧栏'
        if (/fixed.*top-0|topbar|TopBar/.test(c) && n.getBoundingClientRect().top < 4) return '顶栏'
      }
      if (n.tagName === 'ASIDE') return '右侧面板'
    }
    // 几何兜底
    if (r.top < 56) return '顶栏'
    if (r.bottom > VH - 4 && r.top > VH * 0.6) return '底栏'
    if (r.left > VW * 0.6 && r.top > 50) return '右侧面板'
    if (r.left < 150 && r.top < VH * 0.6) return '左侧栏'
    return '地图浮层'
  }

  // 只取「叶子文字」：自身有直接文本节点，避免把容器重复算一遍
  const leafText = (el) => {
    let t = ''
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent
    return t.trim()
  }

  const rows = []
  for (const el of document.querySelectorAll('body *')) {
    const txt = leafText(el)
    if (!txt) continue
    const r = visible(el)
    if (!r) continue
    const cs = getComputedStyle(el)
    rows.push({
      txt: txt.slice(0, 18),
      px: parseFloat(cs.fontSize),
      lh: cs.lineHeight === 'normal' ? null : parseFloat(cs.lineHeight),
      weight: cs.fontWeight,
      family: cs.fontFamily.split(',')[0].replace(/["']/g, ''),
      region: region(el, r),
      w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top), left: Math.round(r.left),
    })
  }

  const buttons = []
  for (const b of document.querySelectorAll('button, [role=button]')) {
    const r = visible(b)
    if (!r) continue
    const cs = getComputedStyle(b)
    buttons.push({
      txt: (b.textContent || '').trim().slice(0, 16),
      w: Math.round(r.width), h: Math.round(r.height),
      px: parseFloat(cs.fontSize),
      region: region(b, r),
      top: Math.round(r.top), left: Math.round(r.left),
    })
  }

  return { rows, buttons }
}, VW, VH)

// ── 汇总 ────────────────────────────────────────────────
const pxHist = {}
for (const r of report.rows) pxHist[r.px] = (pxHist[r.px] || 0) + 1
const pxSorted = Object.entries(pxHist).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0])

const byRegion = {}
for (const r of report.rows) {
  byRegion[r.region] ??= { n: 0, hist: {}, small: [] }
  byRegion[r.region].n++
  byRegion[r.region].hist[r.px] = (byRegion[r.region].hist[r.px] || 0) + 1
  if (r.px < 13) byRegion[r.region].small.push(r)
}

console.log(`\n视口 ${VW}×${VH} · 可见文字节点 ${report.rows.length} · 按钮 ${report.buttons.length}`)
console.log(`\n=== 全局字号分布 ===`)
for (const [px, n] of pxSorted) console.log(`  ${String(px).padStart(4)}px  ${String(n).padStart(4)} 个  ${'█'.repeat(Math.round(n / 4))}`)

const total = report.rows.length
const tiny = report.rows.filter(r => r.px < 12).length
const small = report.rows.filter(r => r.px >= 12 && r.px < 14).length
const ok = report.rows.filter(r => r.px >= 14).length
console.log(`\n  <12px（中文读不动）: ${tiny} 个 = ${(tiny / total * 100).toFixed(1)}%`)
console.log(`  12~13px（勉强）    : ${small} 个 = ${(small / total * 100).toFixed(1)}%`)
console.log(`  ≥14px（合格）      : ${ok} 个 = ${(ok / total * 100).toFixed(1)}%`)

console.log(`\n=== 各区域分布 ===`)
for (const [reg, d] of Object.entries(byRegion).sort((a, b) => b[1].n - a[1].n)) {
  const hist = Object.entries(d.hist).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0])
  const min = hist[0][0]
  console.log(`  ${reg.padEnd(6)} ${String(d.n).padStart(3)} 条  最小 ${min}px  |  ${hist.map(([k, v]) => `${k}px×${v}`).join('  ')}`)
}

console.log(`\n=== 最小的 40 条（按字号升序，同行按区域） ===`)
const worst = [...report.rows].sort((a, b) => a.px - b.px || a.top - b.top).slice(0, 40)
for (const r of worst) console.log(`  ${String(r.px).padStart(4)}px ${r.region.padEnd(5)} @(${String(r.left).padStart(4)},${String(r.top).padStart(3)}) ${r.weight} 「${r.txt}」`)

// 按钮：小目标 + 小字
const smallBtns = report.buttons.filter(b => b.h < 32 || b.w < 32)
const smallFontBtns = report.buttons.filter(b => b.px < 14)
console.log(`\n=== 按钮 ${report.buttons.length} 个：可点区 <32px 的 ${smallBtns.length} 个 · 字号 <14px 的 ${smallFontBtns.length} 个 ===`)
for (const b of [...smallBtns].sort((a, b) => a.h - b.h).slice(0, 25)) {
  console.log(`  ${String(b.w).padStart(4)}×${String(b.h).padStart(3)}  ${String(b.px).padStart(4)}px  ${b.region.padEnd(5)} @(${String(b.left).padStart(4)},${String(b.top).padStart(3)}) 「${b.txt}」`)
}

// 中文元素用的是什么字体族（有没有落到宋体/无衬线兜底）
const famHist = {}
for (const r of report.rows) famHist[r.family] = (famHist[r.family] || 0) + 1
console.log(`\n=== 字体族分布 ===`)
for (const [f, n] of Object.entries(famHist).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`)

if (errors.length) console.log(`\n⚠ 页面错误 ${errors.length}:`, errors.slice(0, 3))
await browser.close()
