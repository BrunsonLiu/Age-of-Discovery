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
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
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

// 等航线几何就绪：海陆掩码异步加载，之前算不出真实弧长（只显示港名）。
// 掩码没到位就报里程 = 报一条少 49% 的直线距离，所以这里必须等。
const geoReady = await page.waitForFunction(() => {
  const el = document.querySelector('[data-testid="next-port-hint"]')
  return !!el && /海里/.test(el.textContent || '')
}, { timeout: 20000, polling: 150 }).then(() => true).catch(() => false)
check(geoReady, '航线几何就绪后常驻条才给出里程（掩码未到位时宁可空着）')

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
check(!!dy && Number(dy[1]) > 0, `给出按部就班口径的天数（${dy?.[1] ?? '无'}）——与出航计划面板同一口径`)
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
const beforeFlags = await page.evaluate(() => ({
  sailing: window.__gameStore.getState().fleet.isSailing,
  route: window.__gameStore.getState().currentRoute,
  panel: window.__gameStore.getState().activePanel,
}))

/*
 * 先把地图挪到别处，再点「定位」。
 *
 * 【为什么必须先挪走】原来直接点，靠"中心变化 >0.01"判断点击生效。可是开局
 * 地图本来就停在目标港附近时，这一条必然假红（实测偶发：中心 5.091 已经
 * 是埃尔米纳，判"没动"）。挪到伦敦再点，"从伦敦回到埃尔米纳"就没有歧义了。
 */
await page.evaluate(() => window.__mapStore.getState().setCenter([51.5, -0.12]))
await page.waitForFunction(() => {
  const c = window.__mapStore.getState().center
  return c && Math.abs(c[0] - 51.5) < 0.2
}, { timeout: 8000, polling: 100 })

// 点击坐标每次重测：常驻条会随未读数/文案重渲染，旧坐标会点空
const locatePt = await page.evaluate(() => {
  const b = document.querySelector('[data-testid="next-port-locate"]')
  if (!b) return null
  const r = b.getBoundingClientRect()
  return [r.x + r.width / 2, r.y + r.height / 2]
})
if (locatePt) await page.mouse.click(locatePt[0], locatePt[1])

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
/*
 * setCenter 是平滑移动：上面那条只等到"中心变了 >0.01"，此时地图还在滑，
 * 直接读会读到半路（实测 5.09,-1.36，目标 5.083,-1.35，差 0.007 → 假红）。
 * 这里等它真正停到目标港上（<0.001），最多 4s；停不下来就按当时的值判红。
 */
/*
 * 容差 0.05°：飞行动画按像素取整后，落点会比目标偏 0.008°（zoom 3 下不到 0.1px），
 * 原来的 0.001° 会把这丝毫偏差判成"没落在该港"。0.05° 仍然远小于两港间距。
 */
const near = (c, t, tol = 0.05) => !!c && !!t && Math.abs(c[0] - t[0]) < tol && Math.abs(c[1] - t[1]) < tol
for (let waited = 0; waited < 5000; waited += 150) {
  const now = await page.evaluate(() => window.__mapStore.getState().center)
  if (now) after.center = now
  if (near(after.center, portCoord)) break
  await sleep(150)
}
check(near(after.center, portCoord),
  `中心落在「${targetName}」而不是别的点（${after.center.map(x => x.toFixed(3)).join(',')}）`)

console.log('=== 与面板里的航路卡同源 ===')
const detailPoint = await page.evaluate(() => {
  const b = document.querySelector('[data-testid="next-port-detail"]')
  if (!b) return null
  const r = b.getBoundingClientRect()
  return [r.left + r.width / 2, r.top + r.height / 2]
})
if (detailPoint) await page.mouse.click(detailPoint[0], detailPoint[1])
/*
 * 「看航路」原来是打开 320px 的「冒险笔记」侧板。任务搬进航海志之后，
 * 它打开的是整屏的任务页，航路卡在右栏。判据照样落在**同一张卡**上
 * （[data-testid="voyage-next-card"]），只是换了"它在哪儿"的定位方式。
 */
const panelShown = await page.waitForFunction(
  () => !!document.querySelector('[data-testid="logbook-page-task"] [data-testid="voyage-next-card"]'),
  { timeout: 12000, polling: 100 },
).then(() => true).catch(() => false)
check(panelShown, '「看航路」打开航海志的任务页，航路卡在右栏')
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

/*
 * ==========================================================================
 * 与**出航计划面板**同口径（第 33 轮）
 *
 * 常驻条与面板卡同源还不够——玩家真正起航时看的是出航计划面板。
 * 第 33 轮实测 20 条里程碑航线**全部**对不上：
 *   常驻条用 haversine 大圆距离报里程、用**当前方针**算天数；
 *   出航计划用避陆弧长报航程、按**按部就班**算天数。
 * 塞维利亚→埃尔米纳：常驻条「1956 海里 · 约 10 天」，
 * 出航计划「航程 2917 海里 · 约 15 天可达」——差 49%、差 5 天，
 * 而「粮水够不够」又是按出航计划那个天数判的。
 *
 * 这里真的开出航计划面板，把两处的里程与天数逐字对账。
 * ========================================================================== */
console.log('=== 与出航计划面板同口径 ===')

const readHintNumbers = () => page.evaluate(() => {
  const el = document.querySelector('[data-testid="next-port-hint"]')
  const t = (el?.textContent || '').replace(/\s+/g, ' ')
  const nm = t.match(/(\d+) 海里/)
  const dy = t.match(/约 (\d+) 天/)
  const name = t.match(/下一站：([\u4e00-\u9fff]+)/)
  return { nm: nm ? Number(nm[1]) : null, dy: dy ? Number(dy[1]) : null, name: name ? name[1] : null }
})

/** 真的开出航计划面板，读它的「航程」与结论句里的天数 */
const openPlanAndRead = async (portName) => {
  const coord = await page.evaluate(async (name) => {
    const m = await import('/Age-of-Discovery/src/data/ports.ts').catch(() => import('/src/data/ports.ts'))
    const p = m.ports.find(x => x.nameCn === name)
    return p ? { lat: p.latitude, lng: p.longitude, id: p.id } : null
  }, portName)
  if (!coord) return null
  await page.evaluate((c, nm) => {
    const st = window.__gameStore.getState()
    st.sailToWaypoint({ latitude: c.lat, longitude: c.lng, name: nm, portId: c.id })
  }, coord, portName)
  const shown = await page.waitForFunction(
    () => !!document.querySelector('[data-testid="voyage-verdict-text"]'),
    { timeout: 12000, polling: 100 },
  ).then(() => true).catch(() => false)
  if (!shown) return null
  const out = await page.evaluate(() => {
    const verdict = (document.querySelector('[data-testid="voyage-verdict-text"]')?.textContent || '').replace(/\s+/g, ' ').trim()
    const distEl = document.querySelector('[data-testid="voyage-route-distance"]')
    const nm = (distEl?.textContent || '').match(/(\d+) 海里/)
    // 结论句有两种形态：
    //   够： 「补给充足 · 约 19 天可达」
    //   不够：「粮食不够——按部就班只够 12 天，这趟要 19 天」
    const dy = verdict.match(/约 (\d+) 天/) || verdict.match(/这趟要 (\d+) 天/)
    return { verdict, nm: nm ? Number(nm[1]) : null, dy: dy ? Number(dy[1]) : null }
  })
  await page.evaluate(() => window.__gameStore.getState().cancelVoyage())
  await sleep(200)
  return out
}

// 第一轮：默认（无军官）
{
  const h = await readHintNumbers()
  check(!!h && h.nm !== null && h.dy !== null,
    `常驻条给出里程与天数（${h?.nm} 海里 · 约 ${h?.dy} 天 → ${h?.name}）`)
  const plan = await openPlanAndRead(h.name)
  check(!!plan, `出航计划面板真的打开了（目标：${h?.name}）`)
  check(!!plan && !!h && plan.nm === h.nm,
    `里程同源（常驻 ${h?.nm} / 计划 ${plan?.nm}）`)
  check(!!plan && !!h && plan.dy === h.dy,
    `天数同源（常驻 ${h?.dy} / 计划 ${plan?.dy}）`)
  // 反向检查：不能是"大圆距离 + 当前方针"那套旧算法
  const gc = await page.evaluate(async (name) => {
    const m = await import('/Age-of-Discovery/src/data/ports.ts').catch(() => import('/src/data/ports.ts'))
    const nav = await import('/Age-of-Discovery/src/utils/navigation.ts').catch(() => import('/src/utils/navigation.ts'))
    const st = window.__gameStore.getState()
    const here = m.ports.find(p => p.id === st.fleet.currentPortId)
    const there = m.ports.find(p => p.nameCn === name)
    if (!here || !there) return null
    return Math.round(nav.haversineNm(here.latitude, here.longitude, there.latitude, there.longitude))
  }, h.name)
  check(!!gc && !!h && h.nm !== gc,
    `常驻条报的不是大圆距离（${h?.nm} ≠ 大圆 ${gc}）——避陆弧长才是玩家要走的那条`)
}

// 第二轮：带上领航员（+15% 航速）——天数必须同步变快，两处仍相等
{
  await page.evaluate(() => {
    const st = window.__gameStore.getState()
    window.__gameStore.setState({ officers: ['pilot'] })
  })
  await sleep(400)
  const h = await readHintNumbers()
  const plan = await openPlanAndRead(h.name)
  check(!!plan && !!h && plan.nm === h.nm && plan.dy === h.dy,
    `带领航员时两处仍同源（${h?.nm} 海里 / ${h?.dy} 天 vs ${plan?.nm} / ${plan?.dy}）`)
  await page.evaluate(() => {
    const st = window.__gameStore.getState()
    window.__gameStore.setState({ officers: [] })
  })
  await sleep(300)
}

// 第三轮：切到「抢行」——天数不许跟着变
// 方针要到每段起点才选，而「粮水够不够」的判定用的是「按部就班」这个基准。
// 常驻条若按当前方针算，就会跟出航计划面板差出好几天（实测 17 vs 19）。
{
  const before = await readHintNumbers()
  await page.evaluate(() => window.__gameStore.setState({ stance: 'rush' }))
  await sleep(500)
  const after = await readHintNumbers()
  check(after.nm === before.nm && after.dy === before.dy,
    `切到抢行后常驻条的天数不变（${before.dy} → ${after.dy}）——判定基准是「按部就班」`)
  const plan = await openPlanAndRead(after.name)
  check(!!plan && !!after && plan.dy === after.dy,
    `抢行状态下出航计划仍报同一个天数（常驻 ${after.dy} / 计划 ${plan?.dy}）`)
  await page.evaluate(() => window.__gameStore.setState({ stance: 'steady' }))
  await sleep(300)
}

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
