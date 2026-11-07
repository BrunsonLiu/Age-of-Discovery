// 海上遗物：历史与神话必须真的在地图上，而且拾起来给的不是钱
// （端到端）
//
// 跑法：先起 dev server，再 `node test/e2e/relics.mjs`
//   GAME_URL=...  EDGE_PATH=...  可覆盖默认路径
//
// 【守的是什么】
// 2026-11-07 用户定的方向：**不要再扩展金钱/经济玩法**；
// 神话与历史可以融入更多，但**不要只是一味地增加文字** ——
// 史实必须以「地图上看得见、点得到的东西」落地，而不是日志里的一段话。
//
// 断言：
//   ① 遗物是**地图上的实物**：能找到、能点、点完从图上消失；
//   ② 拾起来给的是**名号与士气**，**金币一个都不动**（钱重要，但本作卖的是航路与名号）；
//   ③ 拾过的那件记进图鉴（刷新/存档不丢）。
//
// 【为什么不用"点最近的"】玩家点的是**看见的那一个**，所以脚本按
// data-relic-id 精确找那一件，再走真实鼠标点击（带命中测试）。
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

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) } }

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
const hooked = await page.waitForFunction(
  () => !!(window.__gameStore && window.__mapStore), { timeout: 30000, polling: 100 },
).then(() => true).catch(() => false)
if (!hooked) throw new Error('store 调试钩子没挂上（dev 编译失败或页面空白）')

// ---- 开局遮罩必须先清掉 ----
// 开局的 `H1.pirate-title` 盖住整屏（z-9999），不点掉它，
// 遗物图标再准也会被 `elementFromPoint` 判成"被遮挡"。
//
// 【为什么不能固定 sleep】开局是 4 页（标题 → 1492 塞维利亚 → 你想怎么玩 → 选择你的天赋），
// 每页切换中间还有 300ms 的淡出淡入（IntroScreen.handleNext 里的 setTimeout）。
// 固定 sleep 会在"上一页还没切走"时点到不存在的按钮——
// 实测卡在第 2 页，后面所有点击全打在遮罩上，看起来像"遗物点不到"。
// 所以每一步都**轮询等文案出现**再点，点完**轮询等这一页消失**。
const clickIn = (o, t) => page.evaluate((o, t) => {
  const ov = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')].find(x => new RegExp(o).test(x.textContent || ''))
  const btn = ov && [...ov.querySelectorAll('button')].find(x => new RegExp(t).test(x.textContent || ''))
  if (btn) btn.click()
}, o, t)

/** 轮询等某个遮罩文案出现 */
const waitOverlay = (t, label) => page.waitForFunction((t) => {
  const ov = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')].find(x => new RegExp(t).test(x.textContent || ''))
  return !!ov
}, { timeout: 25000, polling: 100 }, t).then(() => true).catch(() => false)

/** 走完开局的一页：等它出现 → 点按钮 → 等它消失 */
async function introStep(pageText, buttonText) {
  const appeared = await waitOverlay(pageText, pageText)
  if (!appeared) { check(false, `开局第「${pageText}」屏没出现`); return false }
  await clickIn(pageText, buttonText)
  const gone = await page.waitForFunction((t) => {
    const ov = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')].find(x => new RegExp(t).test(x.textContent || ''))
    return !ov
  }, { timeout: 25000, polling: 100 }, pageText).then(() => true).catch(() => false)
  if (!gone) { check(false, `开局第「${pageText}」屏点「${buttonText}」后没切走`); return false }
  return true
}

check(await introStep('翻开日志', '翻开日志'), '开局第 1 屏（标题）→ 翻开日志')
check(await introStep('塞维利亚港', '继续'), '开局第 2 屏（1492 塞维利亚）→ 继续')
// 第 3 屏要选玩法（默认就是船长模式，显式点一下保证走的是完整玩法）
const modeOk = await waitOverlay('你想怎么玩', '你想怎么玩')
check(modeOk, '开局第 3 屏（你想怎么玩）出现')
await page.evaluate(() => document.querySelector('button[data-mode="captain"]')?.click())
await sleep(300)
check(await introStep('你想怎么玩', '继续'), '开局第 3 屏 → 继续')
// 第 4 屏选天赋
check(await waitOverlay('选择你的天赋', '选择你的天赋'), '开局第 4 屏（选择你的天赋）出现')
await page.evaluate(() => {
  const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /选择你的天赋/.test(x.textContent || ''))
  if (!o) return
  ;[...o.querySelectorAll('button')].filter(b => /商界血脉|铁壁舰长|魅力领袖|天生探险家|随船医生/.test(b.textContent || ''))[0]?.click()
})
await sleep(300)
await clickIn('选择你的天赋', '启航')
const introGone = await page.waitForFunction(
  () => !document.querySelector('[data-testid="intro-screen"]'), { timeout: 25000, polling: 100 },
).then(() => true).catch(() => false)
check(introGone, '开局第 4 屏 → 启航（引子整屏退场）')

// 教学引导与致辞是先后两层遮罩
await clickIn('跳过引导', '跳过引导'); await sleep(500)
await page.keyboard.press('Escape'); await sleep(450)
await page.keyboard.press('Escape'); await sleep(900)

// 遮罩确实清干净了（否则后面的命中测试全是假的）
const maskLeft = await page.evaluate(() => {
  const bad = [...document.querySelectorAll('div.fixed.inset-0, [data-testid="intro-screen"]')]
    .filter(x => /大航海时代|选择你的天赋|你想怎么玩|1492年|翻开日志/.test(x.textContent || ''))
  return bad.map(x => `${x.tagName}.${(x.className || '').toString().slice(0, 40)}`)
})
check(maskLeft.length === 0, `开局遮罩已清干净（残留 ${maskLeft.length} 个：${maskLeft.join(' | ') || '无'}）`)

/** 航线几何就绪（掩码到位）后地图内容才挂载 */
const geoReady = await page.waitForFunction(
  () => window.__mapStore.getState().landDataReady === true, { timeout: 30000, polling: 100 },
).then(() => true).catch(() => false)
check(geoReady, '航线几何就绪（地图内容挂载的前提）')

/** 取一件遗物的坐标（页面里 import 数据层） */
const relicInfo = await page.evaluate(async () => {
  const imp = (p) => import(`/Age-of-Discovery/src/${p}`).catch(() => import(`/src/${p}`))
  const mod = await imp('data/relics.ts')
  return mod.RELICS.map(r => ({ id: r.id, name: r.name, lat: r.lat, lng: r.lng, gain: r.gain }))
})
check(relicInfo.length >= 6, `数据层里有遗物（${relicInfo.length} 件）`)

console.log('=== 第 1 轮：遗物是地图上看得见、点得到的实物 ===')
const target = relicInfo[0]
// 把地图挪到那件遗物上（用 store 改中心，等 Leaflet 自己走过去）
await page.evaluate((c) => {
  window.__mapStore.setState({ center: c, zoom: 6 })
}, [target.lat, target.lng])
await sleep(1200)

const before = await page.evaluate((t) => {
  const st = window.__gameStore.getState()
  return {
    relics: st.collectedRelics ? st.collectedRelics.length : 0,
    fame: st.fleet.fame,
    gold: st.fleet.gold,
    morale: st.fleet.morale,
    onMap: document.querySelectorAll('[data-relic-id]').length,
    hasTarget: !!document.querySelector(`[data-relic-id="${t.id}"]`),
  }
}, target)

check(before.onMap > 0, `遗物在地图上有实物标记（实测 ${before.onMap} 个 data-relic-id）`)
check(before.hasTarget, `目标遗物「${target.name}」在屏幕上`)

// 真实鼠标点击（带命中测试——被遮挡就不算点到了）
const hit = await page.evaluate((id) => {
  const el = document.querySelector(`[data-relic-id="${id}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2
  const top = document.elementFromPoint(cx, cy)
  /*
   * 「这次点击落在哪一件遗物上」——2D 与 3D 的锚点位置不同：
   *   2D：data-relic-id 在内层剪影 .relic-glyph 上（剪影 pointer-events:none，
   *       所以命中的是外层 .leaflet-marker-icon 容器）；
   *   3D：data-relic-id 直接在外层 .relic3d-icon 上。
   * 于是两头都要找：向上 closest（3D）、向下 querySelector（2D 的外层容器）。
   */
  const hitId = top?.closest?.('[data-relic-id]')?.dataset?.relicId
    ?? top?.querySelector?.('[data-relic-id]')?.dataset?.relicId
    ?? null
  const chain = []
  for (let n = top; n && chain.length < 5; n = n.parentElement) {
    chain.push(`${n.tagName}#${n.id || ''}.${(n.getAttribute?.('class') || '').slice(0, 40)}`)
  }
  return {
    x: cx, y: cy,
    hitsSelf: hitId === id,
    hitId,
    inViewport: r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    hitTag: top ? `${top.tagName}.${(top.className || '').toString().slice(0, 40)}` : null,
    chain: chain.join(' < '),
  }
}, target.id)
check(!!hit, '找得到那件遗物的图标')
check(!!hit && hit.inViewport, '遗物完整落在视口内')
check(!!hit && hit.hitsSelf, `遗物真的能被点到（未被遮挡）——实测命中 ${hit?.hitTag}（hitId=${hit?.hitId}）｜层链 ${hit?.chain}`)
if (hit && hit.hitsSelf) await page.mouse.click(hit.x, hit.y)

await sleep(600)

console.log('=== 第 2 轮：拾起来给的是名号与士气，不是钱 ===')
const after = await page.evaluate((id) => {
  const st = window.__gameStore.getState()
  return {
    relics: st.collectedRelics ? st.collectedRelics.length : 0,
    has: (st.collectedRelics || []).includes(id),
    fame: st.fleet.fame,
    gold: st.fleet.gold,
    morale: st.fleet.morale,
    onMap: document.querySelectorAll(`[data-relic-id="${id}"]`).length,
    notify: (st.notifications || []).map(n => n.title).filter(t => /拾起/.test(t)).length,
  }
}, target.id)

check(after.relics === before.relics + 1, `拾过一次就记进图鉴（${before.relics} → ${after.relics}）`)
check(after.has, `图鉴里记的是这一件（${target.id}）`)
check(after.onMap === 0, '拾过的那件从海图上消失（不留一个点了没反应的死图标）')
check(after.fame > before.fame, `名号 +${after.fame - before.fame}（声望涨了）`)
check(after.gold === before.gold,
  `金币一个都不动（${before.gold} → ${after.gold}）——钱重要，但这不是账本`)
check(after.notify > 0, '拾起时有一条回执（玩家知道自己拿到了什么）')

// 再点一次同一个 id：不能重复结算
const dbl = await page.evaluate((id) => {
  const st = window.__gameStore.getState()
  return { fame: st.fleet.fame, gold: st.fleet.gold, relics: st.collectedRelics.length }
}, target.id)
await page.evaluate((id) => { window.__gameStore.getState().collectRelic(id) }, target.id)
await sleep(200)
const dbl2 = await page.evaluate(() => {
  const st = window.__gameStore.getState()
  return { fame: st.fleet.fame, gold: st.fleet.gold, relics: st.collectedRelics.length }
})
check(dbl2.fame === dbl.fame && dbl2.gold === dbl.gold && dbl2.relics === dbl.relics,
  '同一件遗物不能重复结算（拾过一次就没了）')

console.log('=== 第 3 轮：2.5D 里它也还是一件可点的实物 ===')
// 【为什么要单独验 3D】2.5D 的图标是每帧投影出来的，
// 远景下几个物件会挤成一团 → "点木桶捞到零钱"（见 debris-3d.mjs 的教训）。
// 而且 2D 与 3D 读的是同一份 data/relics.ts，拾过一件两边必须同时消失。
const target3d = relicInfo.find(r => r.id !== target.id)
check(!!target3d, '还有第二件遗物可用来验 3D')
// 3D 相机以船位起手（见 Map3DView 的 camState），所以先把船挪到那件遗物旁边
await page.evaluate((t) => {
  window.__gameStore.getState().setShipPosition([t.lat, t.lng])
}, target3d)
await sleep(400)
// 切 2.5D（真实点按钮，不走 store）
await page.evaluate(() => document.querySelector('[data-testid="map-mode-toggle"]')?.click())

let ready3d = false
for (let i = 0; i < 60; i++) {
  ready3d = await page.evaluate((id) => {
    const c = document.querySelector('canvas')
    const el = document.querySelector(`.relic3d-icon[data-relic-id="${id}"]`)
    return window.__mapStore?.getState?.().renderMode === '3d'
      && !!c && c.width > 100
      && !!el && getComputedStyle(el).display !== 'none'
  }, target3d.id)
  if (ready3d) break
  await sleep(250)
}
check(ready3d, `切到 2.5D 后「${target3d.name}」也渲染出来了（同一份数据）`)
await sleep(900)

const hit3d = await page.evaluate((id) => {
  const el = document.querySelector(`.relic3d-icon[data-relic-id="${id}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2)
  const top = document.elementFromPoint(cx, cy)
  const hitId = top?.closest?.('[data-relic-id]')?.dataset?.relicId
    ?? top?.querySelector?.('[data-relic-id]')?.dataset?.relicId ?? null
  return { cx, cy, w: Math.round(r.width), hitId, hitTag: top ? `${top.tagName}.${(top.className || '').toString().slice(0, 30)}` : null }
}, target3d.id)
check(!!hit3d && hit3d.hitId === target3d.id,
  `3D 里点谁拾谁（实测命中 ${hit3d?.hitTag} → ${hit3d?.hitId}）`)
check(!!hit3d && hit3d.w >= 44, `3D 热区 ≥44px（实测 ${hit3d?.w}）`)

const g3Before = await page.evaluate(() => window.__gameStore.getState().fleet.gold)
if (hit3d) await page.mouse.click(hit3d.cx, hit3d.cy)
await sleep(700)
const after3d = await page.evaluate((id) => {
  const st = window.__gameStore.getState()
  return {
    has: (st.collectedRelics || []).includes(id),
    gold: st.fleet.gold,
    dom: document.querySelectorAll(`.relic3d-icon[data-relic-id="${id}"]`).length,
  }
}, target3d.id)
check(after3d.has, `3D 里也拾到了「${target3d.name}」`)
check(after3d.gold === g3Before, `3D 拾取同样不给金币（${g3Before} → ${after3d.gold}）`)
check(after3d.dom === 0, '3D 里拾过的也从图上消失（2D 与 3D 同一份状态）')

check(errors.length === 0, `无运行时错误（${errors.length} 条：${errors.slice(0, 2).join(' | ')}）`)

console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
