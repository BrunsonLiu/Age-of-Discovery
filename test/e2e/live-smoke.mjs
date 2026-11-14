/**
 * 线上冒烟：验证 GitHub Pages 上真正跑着的那一份，不只是本地 preview。
 *
 * 为什么需要这个脚本：其余 e2e 全都依赖 dev 专属的状态钩子
 * （`__gameStore` / `__mapStore`，生产包会被 tree-shake 掉），所以
 * 「本地全绿、线上白屏」这类问题一直没人守。这里刻意 **只用界面**：
 * 真实鼠标点按钮、真实看 DOM，任何 store 都不碰。
 *
 * 能抓到的四类线上专属故障：
 *   ① 路径错：base `/Age-of-Discovery/` 拼错 → 全部资源 404，本地看不出来
 *   ② MIME / 大小写：GitHub Pages 对大小写敏感，Linux 构建和 Windows 本地不同
 *   ③ 字体没上传或哈希变了 → 中文回退成系统字体（静默，不报错）
 *   ④ 首屏把阻塞资源放错位置 → 线上（真 gzip + 真 CDN）FCP 明显变慢
 *
 * 跑法：
 *   npm run test:e2e:live                          # 默认打线上
 *   GAME_URL=http://127.0.0.1:5180/Age-of-Discovery/ npm run test:e2e:live
 */

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'https://brunsonliu.github.io/Age-of-Discovery/'

let pass = 0, fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) }
  else { fail++; console.log('  ✗ FAIL:', msg) }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

/** 一次完整访问：收集网络与脚本错误，返回诊断数据 */
async function visit(viewport, label) {
  const page = await browser.newPage()
  await page.setViewport(viewport)
  const bad = []        // 4xx / 5xx
  const fake = []       // 200 但内容类型是 HTML —— 资源路径失效被 SPA 兜底了
  const failed = []     // 连接失败
  const pageErrors = []
  const consoleErrors = []

  page.on('response', r => {
    const url = r.url()
    const st = r.status()
    const ct = (r.headers()['content-type'] || '').toLowerCase()
    if (st >= 400) bad.push(`${st} ${url.replace(BASE, '')}`)
    /*
     * 「200 却不是资源」：vite preview 的 SPA 兜底会把不存在的
     * /assets/xxx.woff2 返回成 index.html（实测 1761 字节、状态 200）。
     * 浏览器解析失败后静默回退系统字体，页面上不报错、控制台也无 error，
     * 只有屏幕上的中文悄悄换了字型。只看状态码会把这种情况判成"上线了"。
     * GitHub Pages 对缺失资源是 404，所以这条在线上与本地都值得守。
     */
    const isAsset = /\.(js|mjs|css|woff2?|png|jpe?g|webp|svg|json|geojson|mp3|ogg)(\?|$)/.test(url)
    if (isAsset && st === 200 && ct.startsWith('text/html')) {
      fake.push(`${url.split('/').pop()} → text/html`)
    }
  })
  page.on('requestfailed', r => failed.push(`${r.failure()?.errorText ?? 'failed'} ${r.url().replace(BASE, '')}`))
  page.on('pageerror', e => pageErrors.push(e.message.slice(0, 160)))
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)) })

  const t0 = Date.now()
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 })
  const loadMs = Date.now() - t0
  const fcp = await page.evaluate(() => {
    const e = performance.getEntriesByName('first-contentful-paint')[0]
    return e ? Math.round(e.startTime) : null
  })

  console.log(`\n=== ${label} · ${viewport.width}×${viewport.height} · 加载 ${loadMs}ms · FCP ${fcp ?? '?'}ms ===`)
  check(bad.length === 0, `没有 4xx/5xx 资源${bad.length ? '：' + bad.slice(0, 4).join(' / ') : ''}`)
  check(fake.length === 0, `没有「200 但内容是 HTML」的假资源${fake.length ? '：' + fake.slice(0, 3).join(' / ') : ''}`)
  check(failed.length === 0, `没有连接失败${failed.length ? '：' + failed.slice(0, 3).join(' / ') : ''}`)
  check(pageErrors.length === 0, `没有未捕获异常${pageErrors.length ? '：' + pageErrors[0] : ''}`)
  check(consoleErrors.length === 0, `控制台没有 error${consoleErrors.length ? '：' + consoleErrors[0] : ''}`)

  /*
   * 中文字体单独验：不信状态码，直接把它抓下来量字节与 MIME。
   * （曾经只看 200，结果 preview 的 SPA 兜底把 index.html 当字体返回，
   *  界面静默回退系统字体，测试仍然全绿。）
   *
   * 【为什么是两片】中文字体按 unicode-range 拆成了 boot（首屏片，约 108KB）
   * 与 rest（其余片，约 273KB）：浏览器只下载当前要渲染的那一片。
   * 这里两片都要验 —— 只验一片的话，另一片 404 也照样绿，而后果一样是
   * "某一段文字静默回退系统字体"，只是发现问题时已经上线了。
   */
  const fonts = await page.evaluate(async () => {
    const out = []
    for (const key of ['boot', 'rest']) {
      const re = new RegExp(`noto-serif-sc-${key}`)
      const e = performance.getEntriesByType('resource').find((x) => re.test(x.name))
      if (!e) { out.push({ key, found: false }); continue }
      try {
        const r = await fetch(e.name, { cache: 'no-store' })
        const buf = await r.arrayBuffer()
        out.push({ key, found: true, status: r.status, ct: r.headers.get('content-type') || '', bytes: buf.byteLength })
      } catch (err) {
        out.push({ key, found: true, error: String(err).slice(0, 80) })
      }
    }
    return out
  })
  for (const f of fonts) {
    const label = f.key === 'boot' ? '首屏片' : '其余片'
    check(f.found, `中文字体${label}被请求了（noto-serif-sc-${f.key}）`)
    check(!!f.found && f.status === 200, `中文字体${label}返回 200（实际 ${f.status ?? f.error ?? '未请求'}）`)
    check(!!f.found && /font|woff/i.test(f.ct || ''), `中文字体${label} MIME 是字体（实际 ${f.ct || '空'}）`)
    /* 下限按各自的量级定：boot ≈ 108KB、rest ≈ 273KB。取一半留余量，只抓"返回了 HTML"这类 */
    const minKB = f.key === 'boot' ? 60 : 150
    check(!!f.found && (f.bytes ?? 0) > minKB * 1024,
      `中文字体${label}体积对得上（${f.bytes ? Math.round(f.bytes / 1024) + 'KB' : '取不到'}，应 >${minKB}KB）`)
  }
  const totalKB = Math.round(fonts.reduce((s, f) => s + (f.bytes ?? 0), 0) / 1024)
  check(totalKB > 200000 / 1024, `两片字体合计 ${totalKB}KB（拆前是 369KB 的单文件）`)

  return { page, fcp, loadMs, bad, fake, pageErrors }
}

/** 精确文案 + 中心点真命中（防止点到被遮罩盖住的按钮） */
const findButton = (page, labels) => page.evaluate((labels) => {
  for (const label of labels) {
    const hit = [...document.querySelectorAll('button')].find(b => {
      const t = (b.textContent || '').replace(/\s+/g, ' ').trim()
      if (t !== label) return false
      const r = b.getBoundingClientRect()
      if (r.width < 8 || r.height < 8) return false
      const cs = getComputedStyle(b)
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return el && (el === b || b.contains(el))
    })
    if (hit) {
      const r = hit.getBoundingClientRect()
      return { text: (hit.textContent || '').trim().slice(0, 20), x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }
  }
  return null
}, labels)

const clickText = async (page, labels) => {
  const hit = await findButton(page, labels)
  if (!hit) return null
  await page.mouse.click(hit.x, hit.y)
  return hit
}

/**
 * 清场：开局之后会先后压上来两层遮罩，**它们不是同一个东西**。
 *   ① 开场致辞：`[role="dialog"]`，有「继续」按钮（打字中没按钮，点画面跳字）
 *   ② 新手引导：`div.fixed.inset-0.bg-black/80`，**没有 role="dialog"**，
 *      只有「跳过引导」/「下一步」
 * 只查 role="dialog" 会误判"清完了"——线上实测就是这样：致辞点完了，
 * 引导遮罩还盖着，点侧栏「贸易」全被吃掉，看起来像"点了没反应"。
 * 所以这里按遮罩的**实际形态**逐层剥，剥到 elementFromPoint 真正落到按钮为止。
 */
const maskState = (page) => page.evaluate(() => {
  const masks = [...document.querySelectorAll('div.fixed.inset-0')].filter(el => {
    const r = el.getBoundingClientRect()
    if (r.width < innerWidth * 0.9 || r.height < innerHeight * 0.9) return false
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.2) return false
    const cls = (el.className || '').toString()
    return /bg-black\/(4|5|6|7|8|9)/.test(cls) || el.getAttribute('role') === 'dialog'
  }).length
  const labels = [...document.querySelectorAll('button')].map(b => (b.textContent || '').replace(/\s+/g, ' ').trim())
  return {
    masks,
    dialog: !!document.querySelector('[role="dialog"]'),
    hasSkip: labels.includes('跳过引导'),
    hasNext: labels.includes('下一步'),
    hasContinue: labels.includes('继续'),
  }
})

async function clearMasks(page, tag = '') {
  let actions = 0
  for (let i = 0; i < 40; i++) {
    const s = await maskState(page)
    if (s.masks === 0) break
    let hit = null
    if (s.hasSkip) hit = await clickText(page, ['跳过引导'])
    if (!hit && s.hasContinue) hit = await clickText(page, ['继续'])
    if (!hit && s.hasNext) hit = await clickText(page, ['下一步'])
    if (hit) { actions++; await sleep(420); continue }
    // 打字中：点画面跳字 / 点偏下位置，别点按钮（可能是"取消"）
    await page.mouse.click(Math.round(page.viewport().width / 2), Math.round(page.viewport().height * 0.78))
    actions++
    await sleep(380)
  }
  const left = await maskState(page)
  if (tag) console.log(`  · 清场（${tag}）：动作 ${actions} 次，剩余遮罩 ${left.masks}`)
  return { actions, left }
}

// ─────────────────── 桌面：走完开局 + 主屏可用 ───────────────────
const desk = await visit({ width: 1440, height: 900, deviceScaleFactor: 1 }, '桌面')
const page = desk.page

// 每次都从干净存档开始（线上首页若沿用上次存档会跳过开局，测不到开局）
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await sleep(600)

console.log('\n--- 开局 ---')
let clicks = 0
let sawIntro = false
for (let i = 0; i < 20; i++) {
  if (await page.$('[data-testid="intro-screen"]')) sawIntro = true
  const hit = await clickText(page, ['翻开日志', '继续', '扬帆起航！', '启航！'])
  if (hit) { clicks++; await sleep(800); continue }
  if (!(await page.$('[data-testid="intro-screen"]'))) break
  await sleep(500)
}
check(sawIntro, '首访确实出现了开局页（不是直接进地图）')
check(clicks > 0 && clicks <= 15, `开局点击次数受控（${clicks} 次，上限 15）`)
check(!(await page.$('[data-testid="intro-screen"]')), '开局页能走完并关闭')

// 开场致辞 + 新手引导：两层不同形态的遮罩，逐层剥
const cleared = await clearMasks(page, '桌面')
check(cleared.left.masks === 0, `开局的两层遮罩都清干净了（剩余 ${cleared.left.masks}）`)
check(!(await page.evaluate(() => !!document.querySelector('[role="dialog"]'))), '开场致辞能点完，不留在屏幕上')

console.log('\n--- 主屏 ---')
const hint = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="next-port-hint"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  return {
    text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
    visible: r.width > 40 && r.height > 20 && r.top >= 0 && r.top < innerHeight
      && cs.visibility !== 'hidden' && +cs.opacity > 0.9,
  }
})
check(!!hint && hint.visible, `主屏常驻「下一站」可见${hint ? `（${hint.text.slice(0, 28)}）` : '：没渲染'}`)
check(!!hint && /海里|航路|刚带回/.test(hint.text), '常驻条里带具体数字或回执，不是空壳')

// 侧栏「贸易」：真实鼠标点开面板，再用面板自己的锚点确认——不能用 innerText 包含判断
// （主屏本来就有「买进并起航」按钮，那种判据永远通过）
const tradeBefore = await page.$('[data-testid="trade-panel"]')
check(!tradeBefore, '点之前贸易面板是关着的（判据要能区分开/关）')
const trade = await clickText(page, ['贸易'])
check(!!trade, '侧栏「贸易」按钮点得到（没被遮罩吃掉）')
await sleep(800)
const panel = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="trade-panel"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    visible: r.width > 100 && r.height > 100 && r.right > 0 && r.left < innerWidth,
    text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    recommend: !!el.querySelector('[data-testid="trade-recommend"]'),
    buyRows: el.querySelectorAll('[data-testid="trade-buy-row"]').length,
  }
})
check(!!panel && panel.visible, '贸易面板真的打开了（有 trade-panel 且可见）')
check(!!panel && panel.buyRows > 0, `面板里有可买的货（${panel?.buyRows ?? 0} 行）`)
check(!!panel && panel.recommend, '掮客推荐条在（首局 11 秒闭环的入口）')

// 立绘：线上必须是 WebP 且真的解码成功（路径错会静默 404、只剩空框）
const portrait = await page.evaluate(async () => {
  const imgs = [...document.querySelectorAll('img')].filter(i => /assets\/portraits\//.test(i.currentSrc || i.src))
  return imgs.map(i => ({ name: (i.currentSrc || i.src).split('/').pop(), ok: i.complete && i.naturalWidth > 0 }))
})
if (portrait.length) {
  check(portrait.every(p => p.ok), `立绘全部解码成功（${portrait.filter(p => p.ok).length}/${portrait.length}）`)
  check(portrait.every(p => !/\.png$/i.test(p.name)), '立绘走 WebP（不回落 PNG）')
} else {
  console.log('  · 本次未出现立绘（贸易面板无对白），跳过')
}

// 横向不溢出（线上字体度量不同，最容易在这里翻车）
const overflow = await page.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  clientW: document.documentElement.clientWidth,
}))
check(overflow.scrollW === overflow.clientW, `页面无横向溢出（${overflow.scrollW} / ${overflow.clientW}）`)

await page.close()

// ─────────────────── 手机：只验可用性，不重复走开局 ───────────────────
const mob = await visit({ width: 390, height: 844, deviceScaleFactor: 2 }, '手机')
const mp = mob.page
await mp.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await mp.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await sleep(500)
let mClicks = 0
for (let i = 0; i < 20; i++) {
  const hit = await clickText(mp, ['翻开日志', '继续', '扬帆起航！', '启航！'])
  if (hit) { mClicks++; await sleep(800); continue }
  if (!(await mp.$('[data-testid="intro-screen"]'))) break
  await sleep(500)
}
// 手机上的两层遮罩（与桌面同一套判据，别各写一遍）
const mCleared = await clearMasks(mp, '手机')
check(mCleared.left.masks === 0, `手机上的遮罩也清干净了（剩余 ${mCleared.left.masks}）`)
const mState = await mp.evaluate(() => {
  const hint = document.querySelector('[data-testid="next-port-hint"]')
  const r = hint?.getBoundingClientRect()
  return {
    hintVisible: !!hint && r.width > 40 && r.height > 20 && r.top < innerHeight,
    placement: hint?.className.includes('stack') ? 'stack' : 'desktop',
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
    bottomBar: !!document.querySelector('.wood-beam'),
  }
})
check(mState.hintVisible, '手机上常驻条也在（并进底栏文档流）')
check(mState.scrollW === mState.clientW, `手机无横向溢出（${mState.scrollW} / ${mState.clientW}）`)
check(mState.bottomBar, '手机底栏渲染出来了')

await mp.close()
await browser.close()

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (fail > 0) process.exit(1)
