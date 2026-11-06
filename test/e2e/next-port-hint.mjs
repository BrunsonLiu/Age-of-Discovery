// 主屏常驻「下一站」指引（端到端）
//
// 跑法：先起 dev server，再 `node test/e2e/next-port-hint.mjs`
//   GAME_URL=...  EDGE_PATH=...  可覆盖默认路径
//
// 【守的是什么】
// 第 28 轮实测：1440×900 进游戏第一屏 38 条可见文本 / 122 字 / 20 个按钮，
// 「下一站」「航路」「目标」「推荐」一个都没有。唯一回答「我该往哪开」的
// 航路卡只挂在「冒险笔记」面板里，入口名字叫「委托」，玩家整局多半不会点开。
// 这条巡检守三件事：
//   ① 不用点开任何面板，第一屏就能看见它，而且真实鼠标点得到；
//   ② 常驻条与面板卡的港名 / 海里 / 天数完全同源（不能各算一套）；
//   ③ 点「定位」只移动地图，不出航、不打开面板（预览与实际动作分离）。
// 另外覆盖：岸上视角收起、3D 下仍可点、移动端并入底栏不越界也不被压住。
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
// 独立 context：避免同 browser 其它页面写过的 localStorage 让开局遮罩被跳过
const ctx = await browser.createBrowserContext()
const page = await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (/favicon|AudioContext|net::ERR_/.test(t)) return
  errors.push('CONSOLE: ' + t.slice(0, 160))
})
await page.setViewport({ width: 1440, height: 900 })
// dev 的 HMR websocket 会让 networkidle2 在重编译期间一直等不到空闲；
// 用 domcontentloaded + 下面轮询 store 钩子，比等网络空闲稳。
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) pass++; else { fail++; console.log('  ✗', msg) } }

// 跳过 4 屏开局，直接站到「玩家进游戏、面板关掉」的常态（与 clickable-audit 一致）
const setup = () => page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, gameMode: 'captain',
    dialogueSeen: ['opening_pilot'], currentEvent: null, activePanel: null,
    pendingVoyage: null, waypoint: null, currentRoute: null, routeProgress: 0,
    stance: 'steady', rand: () => 1,
    discoveredPorts: [1],
    fleet: {
      ...s.fleet, gold: 1200, day: 1, fame: 0, currentPortId: 1,
      isSailing: false, food: 100, water: 150, morale: 70,
    },
  })
  window.__mapStore.setState({ viewMode: 'chart', renderMode: '2d', center: [34, -9] })
})
// dev 首次编译 / HMR 重建可能超过 1s：轮询等 store 钩子挂上，别用固定 sleep
// （写死等待会把「模块还没编译完」变成空指针崩溃，而不是一条明确的失败断言）
const ready = await page.waitForFunction(
  () => !!(window.__gameStore && window.__mapStore), { timeout: 30000, polling: 100 },
).then(() => true).catch(() => false)
if (!ready) {
  check(false, '页面未就绪：store 调试钩子 30s 内没挂上（dev 编译失败或页面空白）')
  console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
  await browser.close()
  process.exit(1)
}
await setup()

const waitHint = async () => {
  try {
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="next-port-hint"]')
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.width > 100 && r.height > 10 && getComputedStyle(el).display !== 'none'
    }, { timeout: 15000, polling: 100 })
    return true
  } catch { return false }
}

/** 读常驻条：文本、两个按钮、真实命中测试、几何位置 */
const readHint = () => page.evaluate(() => {
  const el = document.querySelector('[data-testid="next-port-hint"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  const locate = el.querySelector('[data-testid="next-port-locate"]')
  const detail = el.querySelector('[data-testid="next-port-detail"]')
  const hitOf = (b) => {
    if (!b) return false
    const q = b.getBoundingClientRect()
    const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2)
    return !!hit && (hit === b || b.contains(hit))
  }
  return {
    text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
    rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
    hasLocate: !!locate, hasDetail: !!detail,
    locateHit: hitOf(locate), detailHit: hitOf(detail),
    locatePoint: locate ? (() => {
      const q = locate.getBoundingClientRect()
      return [q.left + q.width / 2, q.top + q.height / 2]
    })() : null,
  }
})

console.log('=== 桌面 · 进游戏第一屏 ===')
const appeared = await waitHint()
check(appeared, '进游戏后常驻「下一站」出现（不依赖点开任何面板）')

const activeAtFirst = await page.evaluate(() => window.__gameStore.getState().activePanel)
check(activeAtFirst === null, `此时没有打开任何面板（activePanel=${String(activeAtFirst)}）`)

// 可见文本扫描：DOM 里有 ≠ 玩家看得见（这是第 28 轮取证用的同一套判据）
const firstScreen = await page.evaluate(() => {
  const out = []
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let n
  while ((n = walk.nextNode())) {
    const t = (n.textContent || '').replace(/\s+/g, ' ').trim()
    if (t.length < 2) continue
    const el = n.parentElement
    if (!el) continue
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none') continue
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue
    if (Number(cs.opacity) < 0.05) continue
    out.push(t)
  }
  return [...new Set(out)]
})
check(firstScreen.some(t => t.includes('下一站：')), '第一屏可见文本里就有「下一站：」')
check(firstScreen.some(t => t.includes('航路 ·')), '第一屏可见文本里就有「航路」标签')

const hint = await readHint()
check(!!hint && hint.hasLocate && hint.hasDetail, '常驻条带「定位」与「看航路」两个可操作入口')
check(!!hint && /下一站：\S+/.test(hint.text), `给出具体港口而不是「往南」：${hint?.text.slice(0, 70)}`)
const nm = hint ? hint.text.match(/(\d+) 海里/) : null
const dy = hint ? hint.text.match(/约 (\d+) 天/) : null
check(!!nm && Number(nm[1]) > 0, `给出海里数（${nm?.[1] ?? '无'}）`)
check(!!dy && Number(dy[1]) > 0, `给出按当前方针/天候算的天数（${dy?.[1] ?? '无'}）`)
check(!!hint && hint.locateHit, '「定位」按钮中心点真实命中自己（未被罗盘/顶栏/地图层遮挡）')
check(!!hint && hint.detailHit, '「看航路」按钮中心点真实命中自己')
// 这块空地的边界：顶栏 h-12=48、罗盘 left-3+96=108、天候徽章从 156 起
check(!!hint && hint.rect.top >= 48 && hint.rect.left >= 110,
  `不压顶栏、不压罗盘（top=${hint?.rect.top.toFixed(0)} left=${hint?.rect.left.toFixed(0)}）`)
check(!!hint && hint.rect.bottom <= 156,
  `不压天候徽章（bottom=${hint?.rect.bottom.toFixed(0)} ≤ 156）`)
// 邀请条已下移到 y104，横向不再要求错开；但常驻条仍不能宽到吃掉右半屏
check(!!hint && hint.rect.right < 560, `常驻条不过宽（right=${hint?.rect.right.toFixed(0)} < 560）`)

console.log('=== 定位动作：只移图，不出航 ===')
const before = await page.evaluate(() => ({
  center: window.__mapStore.getState().center,
  sailing: window.__gameStore.getState().fleet.isSailing,
  route: window.__gameStore.getState().currentRoute,
  panel: window.__gameStore.getState().activePanel,
}))
if (hint?.locatePoint) await page.mouse.click(hint.locatePoint[0], hint.locatePoint[1])
const moved = await page.waitForFunction((c) => {
  const now = window.__mapStore?.getState?.().center
  return !!now && (Math.abs(now[0] - c[0]) > 0.01 || Math.abs(now[1] - c[1]) > 0.01)
}, { timeout: 8000, polling: 100 }, before.center).then(() => true).catch(() => false)
check(moved, '真实鼠标点「定位」后地图中心真的移动了')
const after = await page.evaluate(() => ({
  center: window.__mapStore.getState().center,
  sailing: window.__gameStore.getState().fleet.isSailing,
  route: window.__gameStore.getState().currentRoute,
  panel: window.__gameStore.getState().activePanel,
}))
check(!after.sailing && !after.route, '点定位没有把船开出去（isSailing/currentRoute 都没变）')
check(after.panel === null, '点定位没有弹出面板')
// 中心必须落在目标港，而不是随便挪一下
// 只取中文港名：textContent 里港名后面紧跟「4789 海里」，用 \S+ 会把数字一起吞进去
const targetName = hint ? (hint.text.match(/下一站：([\u4e00-\u9fff]+)/) || [])[1] : null
const portCoord = await page.evaluate(async (name) => {
  // base 是 /Age-of-Discovery/，绝对路径必须带上；根路径版用于本地 --base=/ 的构建
  const m = await import('/Age-of-Discovery/src/data/ports.ts').catch(() => import('/src/data/ports.ts'))
  const p = m.ports.find(x => x.nameCn === name)
  return p ? [p.latitude, p.longitude] : null
}, targetName)
check(!!portCoord && Math.abs(after.center[0] - portCoord[0]) < 0.001 && Math.abs(after.center[1] - portCoord[1]) < 0.001,
  `中心落在「${targetName}」而不是别的点（${after.center.map(x => x.toFixed(2)).join(',')}）`)

console.log('=== 与面板里的航路卡同源 ===')
const detailPoint = await page.evaluate(() => {
  const b = document.querySelector('[data-testid="next-port-detail"]')
  if (!b) return null
  const r = b.getBoundingClientRect()
  return [r.left + r.width / 2, r.top + r.height / 2]
})
if (detailPoint) await page.mouse.click(detailPoint[0], detailPoint[1])
const panelShown = await page.waitForFunction(
  () => /冒险笔记/.test(document.body.innerText), { timeout: 12000, polling: 100 },
).then(() => true).catch(() => false)
check(panelShown, '「看航路」真的打开冒险笔记')
const card = await page.evaluate(() => {
  // 直接读卡片根节点，不从整屏 innerText 里捞——后者会把常驻条、底栏的数字一起吃进来
  const root = document.querySelector('[data-testid="voyage-next-card"]')
  const btn = root?.querySelector('button')
  return {
    text: (btn?.textContent || '').replace(/\s+/g, ' ').trim(),
    why: (root?.textContent || '').replace(/\s+/g, ' ').trim(),
  }
})
const cardNm = card.text.match(/(\d+) 海里/)
const cardDy = card.text.match(/约 (\d+) 天/)
check(card.text.includes(`下一站：${targetName}`), `面板卡与常驻条指向同一个港（卡：${card.text.slice(0, 50)}）`)
check(!!cardNm && !!nm && cardNm[1] === nm[1], `海里数同源（常驻 ${nm?.[1]} / 卡 ${cardNm?.[1]}）`)
check(!!cardDy && !!dy && cardDy[1] === dy[1], `天数同源（常驻 ${dy?.[1]} / 卡 ${cardDy?.[1]}）`)
check(/完成奖励/.test(card.why), '面板里仍保留完整理由与奖励（常驻条只是摘要）')
const hiddenInPanel = await page.evaluate(() => !document.querySelector('[data-testid="next-port-hint"]'))
check(hiddenInPanel, '面板打开时收起常驻条，避免同一张卡并排出现两次')

await page.evaluate(() => window.__gameStore.getState().setActivePanel(null))
const backAgain = await waitHint()
check(backAgain, '关掉面板后常驻条回来（不是一次性提示）')

console.log('=== 岸上视角与 3D ===')
await page.evaluate(() => window.__mapStore.setState({ viewMode: 'harbor' }))
await sleep(350)
const harborHidden = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="next-port-hint"]')
  return !el || getComputedStyle(el).display === 'none'
})
check(harborHidden, '岸上视角不把海图指引压在港口近景上')
await page.evaluate(() => window.__mapStore.setState({ viewMode: 'chart' }))
await waitHint()

await page.evaluate(() => window.__mapStore.setState({ renderMode: '3d' }))
await sleep(900)
const in3d = await readHint()
check(!!in3d && in3d.locateHit && in3d.detailHit, '3D 全屏 canvas 之下常驻条仍然点得到')
await page.evaluate(() => window.__mapStore.setState({ renderMode: '2d' }))
await sleep(350)

console.log('=== 到港邀请条与常驻条错开 ===')
// 邀请条只在「航行 → 停泊」的下降沿出现 9 秒。真触发一次，别拿静态坐标当证据。
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...s.fleet, isSailing: true } })
})
await sleep(150)
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({ fleet: { ...s.fleet, isSailing: false, currentPortId: 1 } })
})
const inviteShown = await page.waitForSelector('[data-testid="harbor-invite"]', { timeout: 6000 })
  .then(() => true).catch(() => false)
check(inviteShown, '到港下降沿真的弹出靠岸邀请条（不是空测）')
if (inviteShown) {
  const overlap = await page.evaluate(() => {
    const a = document.querySelector('[data-testid="harbor-invite"]')?.getBoundingClientRect()
    const b = document.querySelector('[data-testid="next-port-hint"]')?.getBoundingClientRect()
    if (!a || !b) return null
    return {
      a: { left: a.left, top: a.top, right: a.right, bottom: a.bottom },
      b: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
      hit: !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom),
    }
  })
  check(!!overlap && !overlap.hit,
    `两条不重叠（邀请条 top=${overlap?.a.top.toFixed(0)} / 常驻条 bottom=${overlap?.b.bottom.toFixed(0)}）`)
  await page.click('[data-testid="harbor-invite-close"]').catch(() => {})
}

console.log('=== 移动端 390×844 ===')
await page.setViewport({ width: 390, height: 844 })
await sleep(700)
const mob = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="next-port-hint"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  const locate = el.querySelector('[data-testid="next-port-locate"]')
  const hit = locate ? (() => {
    const q = locate.getBoundingClientRect()
    const h = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2)
    return !!h && (h === locate || locate.contains(h))
  })() : false
  // 顶栏是 .wood-beam、底栏是 .wood-beam--foot（两份共用材质定义但类名不同）。
  // 按 top 取最下面那条，不能靠 DOM 顺序：顶栏在结构里排得更靠后。
  const bottomBar = [...document.querySelectorAll('.wood-beam, .wood-beam--foot')]
    .map(x => x.getBoundingClientRect())
    .sort((a, b) => b.top - a.top)[0]
  // 从常驻条往上找它所在的 fixed 容器，别用「所有 fixed 里最高的」——
  // 那会命中 fixed inset-0 的全屏遮罩层，量出 100% 的假数字
  const fixedBottom = el.closest('div.fixed')?.getBoundingClientRect()
  return {
    text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
    rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height },
    hit,
    barTop: bottomBar?.top ?? null,
    fixedHeight: fixedBottom?.height ?? null,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }
})
check(!!mob, '移动端也有常驻指引（不是桌面专属）')
check(!!mob && mob.rect.top > 400, `移动端排在底部文档流里（top=${mob?.rect.top.toFixed(0)}）`)
check(!!mob && mob.rect.height <= 40, `移动端只占一行（${mob?.rect.height.toFixed(0)}px）`)
check(!!mob && !/海里|天/.test(mob.text), '移动端收起细账，只留「航路 · 下一站」')
check(!!mob && mob.hit, '移动端「定位」按钮真实可点（未被底栏/抽屉压住）')
check(!!mob && mob.barTop !== null && mob.rect.bottom <= mob.barTop + 1,
  `常驻条不压住底栏（bottom=${mob?.rect.bottom.toFixed(0)} / 底栏顶=${mob?.barTop?.toFixed(0)}）`)
check(!!mob && mob.fixedHeight !== null && mob.fixedHeight / 844 < 0.55,
  `底部容器总高未吃掉半屏（${((mob?.fixedHeight ?? 0) / 844 * 100).toFixed(0)}%）`)
check(!!mob && mob.scrollWidth === mob.clientWidth,
  `页面没有横向溢出（${mob?.scrollWidth} vs ${mob?.clientWidth}）`)

check(errors.length === 0, `无运行时错误（${errors.length} 条：${errors.slice(0, 2).join(' | ')}）`)

console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
