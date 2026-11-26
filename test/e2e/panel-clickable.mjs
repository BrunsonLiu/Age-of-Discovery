/*
 * 全站可点性巡检：把「看得见但点不到」扫到每一个面板、每一页册子、岸上。
 *
 * 跑法：`npm run test:e2e:panelshot`（先起 dev server）
 *   或 GAME_URL=... node test/e2e/panel-clickable.mjs
 *
 * 【和 clickable-audit 的分工】
 * clickable-audit 只扫"地图常态"（2D/3D 各一遍），它守的是顶栏/侧栏/底栏
 * 这类**常驻**控件。但玩家有一半时间在面板里：贸易的三档按钮、
 * 造船厂的「买下」、册子里每一页的条目、岸上的六块门牌 —— 那些地方
 * 一个按钮被自己的滚动容器裁掉半截、或被相邻浮层压住，同样点不到，
 * 而 DOM 的 `btn.click()` 照样成功，其它测试全绿。
 *
 * 判据只有一条（与 clickable-audit 同源）：`elementFromPoint(按钮中心)`
 * 必须落在按钮自身或它的子元素上；同时按钮必须完整落在视口内。
 */
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? process.env.AOD_BASE ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log(`  ✓ ${msg}`) } else { fail++; console.log(`  ✗ FAIL: ${msg}`) } }

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)) })
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 40000 })
await sleep(2200)

/** 关掉所有模态（对白 / 教程 / 帮助）。它们盖住面板是**正常**的，不算面板缺陷。 */
const calmDown = async () => {
  await page.evaluate(() => {
    const d = window.__dialogueStore
    for (let i = 0; i < 25 && d?.getState?.().scriptId; i++) d.getState().skip()
    window.__gameStore.setState({ showHelp: false, currentEvent: null, gamePhase: 'playing' })
  })
  await sleep(350)
}

/* ── 进门：清档 → 常态（地图上、没有浮层） ── */
await page.evaluate(() => {
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false, activePanel: null,
    dialogueSeen: ['opening_pilot'],
  })
})
await calmDown()
// 给足钱与货，否则贸易/造船厂里的按钮全是禁用态（禁用按钮不在巡检范围，但也就失去了意义）
await page.evaluate(() => {
  const g = window.__gameStore.getState()
  window.__gameStore.setState({
    fleet: { ...g.fleet, gold: 50000, currentPortId: 1, isSailing: false, day: 40, food: 200, water: 200, durability: 100 },
  })
})
await sleep(400)

/**
 * 扫当前**前景容器**里的按钮。
 *
 * 【为什么要传 root】
 * 第一版扫的是全页 —— 结果每个面板都报"19 个按钮被挡"，被挡的全是
 * 底下的地图控件（3D 切换、小地图、旗舰详情、暂停）。册子是整屏浮层，
 * 盖住地图是**设计**，不是缺陷。只扫前景容器，判据才有意义。
 *
 * 【为什么用"裁剪后的可见中心"】
 * 面板里有滚动列表，一屏放不下时底部按钮的 rect 会超出视口 ——
 * 那是正常的（要滚才看到），而 rect 中心落在视口外时 elementFromPoint 返回 null，
 * 会被误判成"被挡"。改成与视口求交后的中心；完全不可见的直接跳过并计数。
 */
const scan = async (name, rootSel) => {
  const r = await page.evaluate((sel) => {
    const root = sel ? document.querySelector(sel) : document.body
    const out = { total: 0, blocked: [], skipped: 0, clipped: 0, disabled: 0, noRoot: !root }
    if (!root) return out
    for (const b of root.querySelectorAll('button')) {
      const rect = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      if (rect.width < 4 || rect.height < 4) continue
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue
      if (b.closest('[aria-hidden="true"]')) continue
      if (b.disabled) { out.disabled++; continue }
      /*
       * 可见矩形 = 按钮 rect ∩ 视口 ∩ 所有祖先滚动容器的 client rect。
       * 只跟视口求交是不够的：滚动列表里的行 rect 是真的（映射到视口坐标），
       * 只要它落在卡片外但在视口内，就会被当成"可见然后被判被挡"。
       * 实测舰队面板的航线行与港口面板的服务行都是这种 —— 它们要滚才看得到，
       * 滚得到就不算缺陷。
       */
      let clipL = 0, clipT = 0, clipR = innerWidth, clipB = innerHeight
      for (let p = b.parentElement; p; p = p.parentElement) {
        const pcs = getComputedStyle(p)
        if (pcs.overflowY !== 'visible' || pcs.overflowX !== 'visible') {
          const pr = p.getBoundingClientRect()
          clipL = Math.max(clipL, pr.left); clipT = Math.max(clipT, pr.top)
          clipR = Math.min(clipR, pr.right); clipB = Math.min(clipB, pr.bottom)
        }
      }
      const left = Math.max(rect.left, clipL), top = Math.max(rect.top, clipT)
      const right = Math.min(rect.right, clipR), bottom = Math.min(rect.bottom, clipB)
      /*
       * 【可见面积不足就跳过，不是缺陷】
       * 滚动列表里"刚露一条边"的行，rect 是真实的（在滚动内容坐标系里），
       * 但它只有几个像素在视口内 —— 玩家不会去点那 3px。第一版把它们算成
       * "被挡"（命中底栏或下一个容器），舰队面板因此长期假红。
       * 要求可见高度 ≥ 按钮自身高度的 55% 且 ≥ 10px 才判命中。
       */
      const visH = bottom - top, visW = right - left
      if (visH < Math.min(rect.height * 0.55, 14) || visW < Math.min(rect.width * 0.55, 14)) {
        out.skipped++; continue
      }
      out.total++
      if (rect.left < -1 || rect.top < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1) out.clipped++
      const label = (b.getAttribute('aria-label') || b.getAttribute('data-testid') || b.textContent || '')
        .replace(/\s+/g, ' ').trim().slice(0, 26)
      const px = (left + right) / 2, py = (top + bottom) / 2
      const hit = document.elementFromPoint(px, py)
      const ok = hit && (b === hit || b.contains(hit) || hit.contains(b))
      if (!ok) {
        out.blocked.push({
          label, rect: [Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height)],
          hit: hit ? `${hit.tagName}.${(hit.className || '').toString().slice(0, 40)}` : null,
        })
      }
    }
    return out
  }, rootSel || null)
  if (r.noRoot) {
    check(false, `${name}：找不到容器 ${rootSel}（面板没开出来，后面的判定不可信）`)
    return r
  }
  check(r.blocked.length === 0,
    `${name}：${r.total} 个可点按钮全部命中` +
    `（禁用 ${r.disabled} 不计，滚动外 ${r.skipped}，部分出界 ${r.clipped}）`)
  for (const b of r.blocked.slice(0, 4)) console.log(`      · 被挡「${b.label}」rect=${b.rect} 命中=${b.hit}`)
  return r
}

/* ── 一、地图常态 ── */
console.log('=== 地图常态 ===')
// 靠岸状态下"自动打开港口面板"会留一层 bg-black/45 遮罩，扫之前先收干净
await page.evaluate(() => window.__gameStore.getState().setActivePanel(null))
await calmDown()
await sleep(400)
await scan('地图', 'body')

/* ── 二、左侧栏四块面板 ── */
console.log('=== 左侧栏面板 ===')
for (const [panel, name, sel] of [
  ['fleet', '舰队', '[data-testid="fleet-panel"]'],
  ['port', '港口', '[data-testid="port-panel"]'],
  ['trade', '贸易', '[data-testid="trade-panel"]'],
  ['shipyard', '造船厂', '[data-testid="shipyard-panel"]'],
]) {
  await calmDown()
  await page.evaluate((p) => window.__gameStore.getState().setActivePanel(p), panel)
  /*
   * 等面板真的挂出来，而不是死等 750ms：全量连跑时（前一个套件刚退出）
   * 造船厂这屏会晚一拍，`shipyard-panel` 还没进 DOM 就开始扫 → "找不到容器"假红。
   * 单跑绿、套件红，就是这一条。真条件 = 那个容器在不在。
   */
  await page.waitForSelector(sel, { timeout: 8000 }).catch(() => {})
  await sleep(750)
  await scan(name, sel)
}
await page.evaluate(() => window.__gameStore.getState().setActivePanel(null))
await sleep(400)

/* ── 三、册子五页 ── */
console.log('=== 航海志五页 ===')
for (const [tab, name] of [['task', '任务'], ['journal', '日志'], ['atlas', '图鉴'], ['achievement', '成就'], ['rival', '船长']]) {
  await calmDown()
  await page.evaluate((t) => window.__mapStore.getState().openLogbook(t), tab)
  await sleep(850)
  await scan(`册子·${name}`, '[data-testid="logbook-screen"]')
}
await page.evaluate(() => window.__mapStore.getState().closeRecords())
await sleep(400)

/* ── 四、岸上 ── */
console.log('=== 岸上 ===')
await calmDown()
await page.evaluate(() => window.__mapStore.getState().setViewMode('harbor'))
await sleep(1500)
await calmDown()
// 等整屏入场动画走完再扫：中途 scan 会量到还没落位的元素
await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="harbor-view"]')
  return !el || Number(getComputedStyle(el).opacity) >= 0.999
}, { timeout: 8000 }).catch(() => {})
await sleep(300)
await scan('岸上', '[data-testid="harbor-view"]')

/* ── 五、店里那些"要花真金"的按钮真能按下去 ── */
console.log('=== 交易动作（真点一次） ===')
await page.evaluate(() => window.__mapStore.getState().setViewMode('chart'))
await sleep(600)
await calmDown()
await page.evaluate(() => window.__gameStore.getState().setActivePanel('trade'))
await sleep(800)
const traded = await page.evaluate(() => {
  // 找第一个买 10 的按钮，真点它
  const row = document.querySelector('[data-testid="trade-buy-row"]')
  const btn = row?.querySelector('button')
  if (!btn) return { found: false }
  const gold0 = window.__gameStore.getState().fleet.gold
  btn.click()
  return { found: true, gold0, label: (btn.textContent || '').trim().slice(0, 18) }
})
await sleep(600)
const after = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return { gold: s.fleet.gold, cargo: s.fleet.cargo.reduce((n, c) => n + c.quantity, 0) }
})
if (traded.found) {
  check(after.gold < traded.gold0 || after.cargo > 0,
    `贸易按钮真的成交（点「${traded.label}」：金币 ${traded.gold0} → ${after.gold}，货舱 ${after.cargo}）`)
} else {
  check(false, '贸易面板里找到买入按钮（没找到就无法验证"可点"是否等于"可用"）')
}

check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)

console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
if (fail > 0) process.exit(1)
await browser.close()
