// 可点性巡检：所有可见按钮的中心点，是否真的命中它自己
//
// 跑法：先起 dev server，再 `node test/e2e/clickable-audit.mjs`
//
// 【为什么需要这个脚本】
// 单元测试测逻辑，其它 e2e 测流程，但没有一个能回答"玩家到底点不点得到"。
// DOM 里的 button.click() 直接派发事件，**绕过 z-index、pointer-events、遮挡**——
// 按钮被顶栏整个盖住也照样"点击成功"，测试全绿而玩家完全用不了。
//
// 真实事故（2026-10-30）：地图右上角的「3D 海图」切换按钮放在 top-3（12px），
// 被 h-12（48px）的顶栏压得严严实实；侧栏容器还额外挡住了它的点击。
// map3d-check 的 71 条断言全绿，玩家反馈"我还是没看到 3D"。
// 同一个容器把「帮助」按钮也一起挡了。
//
// 判据只有一条：elementFromPoint(按钮中心) 必须落在按钮自身（或它的子元素）上。
// 另外同时检查按钮是否完整落在视口内——被裁到屏幕外的按钮同样点不到。
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)) })

// 视口尺寸：优先 CLI 参数（--vw=1024 --vh=768），其次环境变量，最后默认桌面。
// 不引 cross-env —— Windows 下 `VAR=x cmd` 在 cmd.exe 里不成立，而 npm scripts
// 走的是 cmd.exe，不是 Git Bash。CLI 参数两边都能用。
const argOf = (k) => {
  const hit = process.argv.find(a => a.startsWith(`--${k}=`))
  return hit ? Number(hit.split('=')[1]) : undefined
}
/** 字符串型 CLI 参数（视口那两个是数字，这个是 '2d' / '3d'） */
const strArgOf = (k) => {
  const hit = process.argv.find(a => a.startsWith(`--${k}=`))
  return hit ? hit.split('=')[1] : undefined
}
const VW = argOf('vw') ?? Number(process.env.VW ?? 1440)
const VH = argOf('vh') ?? Number(process.env.VH ?? 900)
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

// 走到「在地图上、没有浮层」的状态——这是玩家看地图时的常态
for (const [a, b] of [['翻开日志', '翻开日志'], ['塞维利亚港', '继续'], ]) {
  await clickIn(a, b); await sleep(450)
}
await page.evaluate(() => document.querySelector('button[data-mode="captain"]')?.click()); await sleep(400)
await clickIn('你想怎么玩', '继续'); await sleep(700)
await page.evaluate(() => {
  const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /选择你的天赋/.test(x.textContent || ''))
  if (!o) return
  [...o.querySelectorAll('button')].filter(b => /商界血脉|铁壁舰长|魅力领袖|天生探险家|随船医生/.test(b.textContent || ''))[0]?.click()
}); await sleep(400)
await clickIn('扬帆起航', '扬帆起航'); await sleep(700)
await clickIn('第一次出航', '启航'); await sleep(1500)
await clickIn('跳过引导', '跳过引导'); await sleep(400)
// 入场后港口面板会自动打开（带 bg-black/45 遮罩），关掉才是常态
await page.keyboard.press('Escape'); await sleep(400)
await page.keyboard.press('Escape'); await sleep(700)

/*
 * `--mode=3d`：切到 2.5D 再巡检。
 *
 * 【为什么必须单独跑一遍】3D 是一整块覆盖全屏的 canvas。如果它的层叠顺序或
 * pointer-events 有问题，会把侧栏、底栏、顶栏的按钮全盖住 —— 而 DOM 的
 * button.click() 照样成功，所有其它测试全绿。这类"看得见点不到"在这个项目
 * 已经发生过一次（3D 切换按钮被顶栏压住，71 条断言全绿、玩家说看不到 3D）。
 * 而在此之前，巡检只在 2D 模式下跑过，3D 模式是块真空。
 */
const MODE = strArgOf('mode') ?? '2d'
if (MODE === '3d') {
  await page.evaluate(() => document.querySelector('[data-testid="map-mode-toggle"]')?.click())
  const t3 = Date.now()
  while (Date.now() - t3 < 25000) {
    const ready = await page.evaluate(() => !!document.querySelector('canvas') && !!document.querySelector('.map3d-area-label'))
    if (ready) break
    await sleep(300)
  }
  await sleep(1800)   // 等相机缓动与标签落位
  // 【必须是断言而不是日志】切换失败却继续巡检，等于拿 2D 的结果冒充 3D ——
  // 那比不测更糟：以后 3D 真出遮挡问题，这份报告会显示"全部可点"。
  const ok3d = await page.evaluate(() => !!document.querySelector('.map3d-area-label') && !!document.querySelector('canvas'))
  if (!ok3d) {
    console.log('  ✗ 切到 2.5D 失败（20 秒内未见 3D 标签与 canvas），后续巡检结果不可信')
    await browser.close()
    process.exit(1)
  }
  console.log('  ✓ 已切到 2.5D（标签与 canvas 都已就绪）')
  if (VW < 768) console.log('  （提示：这一档视口 <768，按项目约定走的是移动端结构）')
}

const report = await page.evaluate(() => {
  const out = { total: 0, blocked: [], offscreen: [] }
  for (const b of document.querySelectorAll('button')) {
    const r = b.getBoundingClientRect()
    const cs = getComputedStyle(b)
    // 排除不可见/无尺寸：它们本来就点不到，不算缺陷
    if (r.width < 4 || r.height < 4) continue
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue
    if (b.closest('[aria-hidden="true"]')) continue
    out.total++

    const label = (b.getAttribute('aria-label') || b.getAttribute('data-testid') || b.textContent || '')
      .replace(/\s+/g, ' ').trim().slice(0, 24)
    const rect = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]

    if (r.x < 0 || r.y < 0 || r.right > innerWidth || r.bottom > innerHeight) {
      out.offscreen.push({ label, rect })
      continue
    }
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    if (!hit || !(b === hit || b.contains(hit))) {
      out.blocked.push({
        label, rect,
        hitTag: hit ? `${hit.tagName}.${(hit.className || '').toString().slice(0, 46)}` : null,
      })
    }
  }
  return out
})

console.log(`巡检 ${report.total} 个可见按钮（${MODE === '3d' ? '2.5D 模式' : '2D 模式'}）`)

let fails = 0
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fails++ }

check(report.offscreen.length === 0, `没有被裁到屏幕外的按钮（异常 ${report.offscreen.length}）`)
for (const o of report.offscreen) console.log(`      越界：${o.label} @ ${o.rect.join(',')}`)

check(report.blocked.length === 0, `所有按钮中心点都能命中自己（被遮挡 ${report.blocked.length}）`)
for (const b of report.blocked) console.log(`      被挡：${b.label} @ ${b.rect.join(',')} ← ${b.hitTag}`)

check(errors.length === 0, `无运行时错误（${errors.length}）`)
for (const e of errors.slice(0, 3)) console.log(`      ${e}`)

console.log(`\n结果：${fails === 0 ? '全部可点' : fails + ' 项异常'}`)
await browser.close()
process.exit(fails === 0 ? 0 : 1)
