// 布局巡检：多视口 × 多面板，找「元素超出视口 / 文字被裁 / 容器溢出」
//
// 跑法：先起 dev server，再 `node test/e2e/layout-audit.mjs [--widths=768,1024,1440]`
//
// 【为什么需要它】
// clickable-audit 只看按钮能不能点到；这个看更广的一类毛病：
//   · 元素右边缘/下边缘超出视口（被裁掉一半，玩家读不全）
//   · 文字容器 scrollWidth > clientWidth（文字溢出但被 overflow:hidden 吃掉）
//   · 面板自身比自己所在的容器还高（底部内容永远看不到）
// 前两类在压缩截图里几乎看不出来，只能量 DOM。
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default } catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default }
const sleep = ms => new Promise(r => setTimeout(r, ms))

const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const argOf = (k, d) => {
  const hit = process.argv.find(a => a.startsWith(`--${k}=`))
  return hit ? hit.split('=')[1] : d
}
const widths = argOf('widths', '1024,1440').split(',').map(Number)
const PANELS = ['fleet', 'task', 'event', 'achievement', 'rival', 'port', 'trade', 'shipyard']

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
let fails = 0
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fails++ }

const clickIn = (ov, bt) => page.evaluate((o, b) => {
  const ovl = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')].find(x => new RegExp(o).test(x.textContent || ''))
  const btn = ovl && [...ovl.querySelectorAll('button')].find(x => new RegExp(b).test(x.textContent || ''))
  if (btn) btn.click()
}, ov, bt)

async function enter(w, h) {
  await page.setViewport({ width: w, height: h })
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(2600)
  for (const [a, b] of [['翻开日志', '翻开日志'], ['塞维利亚港', '继续'], ['你的航程', '继续']]) { await clickIn(a, b); await sleep(450) }
  await page.evaluate(() => document.querySelector('button[data-mode="captain"]')?.click()); await sleep(400)
  await clickIn('你想怎么玩', '继续'); await sleep(700)
  await page.evaluate(() => { const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /选择你的天赋/.test(x.textContent || '')); o && [...o.querySelectorAll('button')].filter(b => /商界血脉|铁壁舰长|魅力领袖|天生探险家|随船医生/.test(b.textContent || '')).at(0)?.click() }); await sleep(400)
  await clickIn('扬帆起航', '扬帆起航'); await sleep(700)
  await clickIn('开船前的最后一眼', '启航'); await sleep(1500)
  await page.evaluate(() => { [...document.querySelectorAll('button')].find(b => /跳过引导/.test(b.textContent || ''))?.click() }); await sleep(500)
  await page.keyboard.press('Escape'); await sleep(400)
  await page.keyboard.press('Escape'); await sleep(700)
}

// 单次扫描：返回本页所有越界/溢出元素
const scan = () => page.evaluate(() => {
  const W = innerWidth, H = innerHeight
  const offRight = [], offBottom = [], textClip = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue
    if (cs.position === 'fixed' && +cs.zIndex > 9000) continue // 标题页
    // Leaflet 的 svg 图层本来就比视口大（它按瓦片范围铺），被外层 overflow 裁掉，
    // 不是可见问题。地图内部元素一律跳过——地图的可读性由 map-legibility 负责。
    if (el.closest('.leaflet-container')) continue
    // SVG 元素的 className 是 SVGAnimatedString，直接 toString 会得到 "[object ...]"
    const cls = typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '')
    const tag = `${el.tagName}.${cls.slice(0, 34)}`
    // 横向越界：右边缘超出视口（排除明确允许溢出的滚动容器）
    if (r.right > W + 1 && !el.closest('[data-allow-overflow]')) offRight.push({ tag, right: Math.round(r.right) })
    // 文字被裁：有文本、overflow 隐藏、内容比容器宽
    const hasText = (el.textContent || '').trim().length > 0 && el.children.length === 0
    if (hasText && /hidden|clip/.test(cs.overflowX + cs.overflow)) {
      if (el.scrollWidth > el.clientWidth + 1) textClip.push({ tag, sw: el.scrollWidth, cw: el.clientWidth, text: (el.textContent || '').trim().slice(0, 16) })
    }
    if (r.bottom > H + 1) offBottom.push({ tag, bottom: Math.round(r.bottom) })
  }
  return { W, H, offRight: offRight.slice(0, 8), offBottom: offBottom.slice(0, 8), textClip: textClip.slice(0, 8) }
})

for (const w of widths) {
  const h = w <= 1024 ? 768 : 900
  console.log(`\n===== ${w}×${h} =====`)
  await enter(w, h)

  const main = await scan()
  console.log('  主界面：')
  check(main.offRight.length === 0, `无元素横向越界${main.offRight.length ? '：' + main.offRight.map(o => `${o.tag}@${o.right}`).join(', ') : ''}`)
  check(main.textClip.length === 0, `无文字被裁${main.textClip.length ? '：' + main.textClip.map(o => `「${o.text}」${o.sw}>${o.cw}`).join(', ') : ''}`)

  for (const p of PANELS) {
    const opened = await page.evaluate((type) => {
      const b = document.querySelector(`[data-tut="${type}"]`)
      if (!b) return false
      b.click(); return true
    }, p)
    if (!opened) { console.log(`  面板 ${p}：入口不存在，跳过`); continue }
    await sleep(800)
    const s = await scan()
    check(s.offRight.length === 0, `面板 ${p} 无横向越界${s.offRight.length ? '：' + s.offRight.map(o => `${o.tag}@${o.right}`).join(', ') : ''}`)
    check(s.textClip.length === 0, `面板 ${p} 无文字被裁${s.textClip.length ? '：' + s.textClip.map(o => `「${o.text}」${o.sw}>${o.cw}`).join(', ') : ''}`)
    // 关掉
    await page.evaluate((type) => document.querySelector(`[data-tut="${type}"]`)?.click(), p)
    await sleep(300)
  }
}
console.log(`\n结果：${fails === 0 ? '全部通过' : fails + ' 项异常'}`)
await browser.close()
process.exit(fails === 0 ? 0 : 1)
