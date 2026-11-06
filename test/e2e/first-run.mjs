// 真实首局：从清档打开页面，一路走到"第一笔钱到账"。
//
// 跑法：先起 dev server（npx vite --port 5174 --host 127.0.0.1），
//      再 `node test/e2e/first-run.mjs`
//
// 【为什么要这个脚本】其余 e2e 全都用 `setState({tutorialStep:-1})` 跳到地图，
// 于是"开局 5 屏 + 10 步教程"这段从未被实测过。而它恰恰决定新人会不会留下来：
// 实测在修掉"教程刚结束就被一段对白挡住"之前，点两次「贸易」都命中在
// `bg-black/45` 遮罩上，玩家看到的就是"点了没反应"。
//
// 断言分四段：
//   ① 开局到能操作 ≤25 次点击（防以后又加仪式）
//   ② 教程结束后第一下点「贸易」必须立刻打开面板（不被对白挡）
//   ③ 贸易面板里有掮客推荐条，且被推荐的那一行有标记
//   ④ 照推荐买 → 出航 → 卖出，净赚 ≥300 金（"第一笔钱"的承诺必须兑现）

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }
import { mkdirSync } from 'node:fs'

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'
mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 160)) })
await page.setViewport({ width: 1440, height: 900 })

let pass = 0, fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) }
  else { fail++; console.log('  ✗ FAIL:', msg) }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))

let clicks = 0
/** 找可见且中心点真命中的按钮（精确文案）。返回中心坐标 */
async function findButton(labels) {
  return page.evaluate((labels) => {
    const btns = [...document.querySelectorAll('button')]
    for (const label of labels) {
      const hit = btns.find(b => {
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
}
async function clickReal(hit) {
  await page.mouse.click(hit.x, hit.y)
  clicks++
}
const phase = () => page.evaluate(() => window.__gameStore.getState().gamePhase)
const panel = () => page.evaluate(() => window.__gameStore.getState().activePanel)
const gold = () => page.evaluate(() => window.__gameStore.getState().fleet.gold)
const dialogue = () => page.evaluate(() => window.__dialogueStore?.getState?.().scriptId ?? null)

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
check(await page.evaluate(() => !!window.__gameStore), 'dev 状态钩子可用')
check(await page.evaluate(() => !!window.__dialogueStore), '对白 store 钩子可用（判"被遮罩挡住"要靠它）')

// ---- 1. 开局 ----
console.log('\n1) 开局（IntroScreen）')
for (let i = 0; i < 15; i++) {
  if (await phase() !== 'start') break
  const hit = await findButton(['翻开日志', '继续', '扬帆起航！', '启航！'])
  if (!hit) { await sleep(700); continue }
  await clickReal(hit)
  await sleep(850)
}
check(await phase() === 'playing', '点了开局那一串按钮之后进到 playing')

// ---- 2. 开场致辞：必须在教程之前 ----
console.log('\n2) 开场致辞')
const opening = await dialogue()
check(opening === 'opening_pilot', `进 playing 的瞬间播开场致辞（实际 ${opening}）`)
check(await page.evaluate(() => !document.body.innerText.includes('下一步')), '致辞期间不该同时开着教程遮罩')
for (let i = 0; i < 12; i++) {
  if (!(await dialogue())) break
  const hit = await findButton(['继续'])
  if (hit) await clickReal(hit)
  else await page.mouse.click(720, 700)   // 打字中点画面跳字
  await sleep(450)
}
check(await dialogue() === null, '致辞能一路点完并关闭')

// 立绘必须真的加载出来（换了 WebP 之后尤其要守：路径写错会静默 404，
// 界面上只剩一个空框，不会报错）。三句对应三张表情差分（calm/serious/hope），
// 所以要逐句推进才能把三张都读到——只读第一张等于只测了三分之一。
const portraits = []
await page.evaluate(() => window.__dialogueStore?.getState?.().open?.('opening_pilot'))
await sleep(520)
for (let i = 0; i < 3; i++) {
  const one = await page.evaluate(() => {
    const img = [...document.querySelectorAll('img')].find(x => /assets\/portraits\//.test(x.currentSrc || x.src))
    if (!img) return null
    return {
      name: (img.currentSrc || img.src).split('/').pop(),
      loaded: img.complete && img.naturalWidth > 0,
      w: img.naturalWidth,
    }
  })
  if (one) portraits.push(one)
  await page.evaluate(() => window.__dialogueStore.getState().advance())
  await sleep(450)
}
await page.evaluate(() => window.__dialogueStore?.getState?.().skip?.())
check(portraits.length === 3, `三句各一张立绘（读到 ${portraits.length} 张）`)
check(portraits.every(p => p.loaded), `立绘全部加载成功（${portraits.filter(p => p.loaded).length}/${portraits.length}，都不是空框）`)
check(portraits.every(p => !/\.png$/.test(p.name)), `立绘走的是 WebP（${portraits.map(p => p.name).join(', ')}）`)
await sleep(300)

// ---- 3. 教程 ----
console.log('\n3) 教程（10 步）')
let tutorialSteps = 0
for (let i = 0; i < 20; i++) {
  const step = await page.evaluate(() => window.__gameStore.getState().tutorialStep)
  if (step == null || step < 0) break
  const hit = await findButton(['下一步', '开始冒险'])
  if (!hit) break
  await clickReal(hit)
  tutorialSteps++
  await sleep(380)
}
check(tutorialSteps >= 9, `教程能一路点完（点了 ${tutorialSteps} 步）`)
const clicksToPlay = clicks
check(clicksToPlay <= 22, `从打开页面到能做决定 ≤22 次点击（实测 ${clicksToPlay}）`)
await page.screenshot({ path: `${SHOTS}/first-run-ready.png` })

// ---- 4. 教程刚结束就去开面板：不能被任何遮罩吃掉 ----
console.log('\n4) 第一下「贸易」必须立刻有反应')
check(await dialogue() === null, '教程结束时没有残留对白')
await sleep(900)  // 教程遮罩淡出
const tradeBtn = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').replace(/\s+/g, '').startsWith('贸易'))
  if (!b) return null
  const r = b.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
check(!!tradeBtn, '侧栏有「贸易」入口')
await page.mouse.click(tradeBtn.x, tradeBtn.y)
clicks++
await sleep(800)
check(await panel() === 'trade', `点一次就打开贸易面板（实际 ${await panel()}）—— 这一条守的是"点了没反应"`)

// ---- 5. 掮客推荐条 ----
console.log('\n5) 面板上的掮客推荐')
const rec = await page.evaluate(async () => {
  const el = document.querySelector('[data-testid="trade-recommend"]')
  const row = document.querySelector('[data-testid="trade-buy-row"][data-recommended="1"]')
  const text = el ? el.innerText.replace(/\s+/g, ' ').trim() : null
  let toPortId = null
  if (text) {
    const m = await import('/Age-of-Discovery/src/data/ports.ts')
    const hit = m.ports.find(p => text.includes(p.nameCn))
    toPortId = hit ? hit.id : null
  }
  return {
    text, toPortId,
    recommendedGoodId: row ? Number(row.getAttribute('data-good-id')) : null,
    rows: document.querySelectorAll('[data-testid="trade-buy-row"]').length,
    firstRowRecommended: document.querySelector('[data-testid="trade-buy-row"]')?.getAttribute('data-recommended') === '1',
  }
})
check(!!rec.text, `推荐条渲染出来了（${rec.text?.slice(0, 40)}…）`)
check(rec.recommendedGoodId != null, '被推荐的那一行有 data-recommended 标记')
check(rec.rows >= 3, `本港行情列了 ${rec.rows} 件货`)
// 推荐行必须在第一行：面板滚动区只有 240px，排第三行时 +N 按钮落在折叠线以下，
// 玩家看见"掮客说买丝绸"却点不到，得先滚动。推荐不能只写在标题上。
check(rec.firstRowRecommended, '被推荐的商品排在第一行（打开就能点，不用滚动）')
check(/\d+ 金 \/ \d+ 天/.test(rec.text ?? ''), '推荐条给了"多少金 / 多少天"，不是空口说赚')
await page.screenshot({ path: `${SHOTS}/first-run-recommend.png` })

// ---- 6. 照推荐买 ----
console.log('\n6) 照推荐买')
const g0 = await gold()
for (let i = 0; i < 4; i++) {
  const ok = await page.evaluate(() => {
    const row = document.querySelector('[data-testid="trade-buy-row"][data-recommended="1"]')
    if (!row) return null
    for (const qty of ['+10', '+5', '+1']) {
      const btn = [...row.querySelectorAll('button')].find(b => (b.textContent || '').trim() === qty)
      if (btn && !btn.disabled) {
        const r = btn.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }
    }
    return null
  })
  if (!ok) break
  await page.mouse.click(ok.x, ok.y)
  clicks++
  await sleep(240)
}
const g1 = await gold()
const cargo = await page.evaluate(() => window.__gameStore.getState().fleet.cargo.reduce((a, c) => a + c.quantity, 0))
check(cargo >= 5, `买到了推荐的货（${cargo} 件）`)
check(g1 < g0, `金币真的扣了（${g0} → ${g1}）`)

// ---- 7. 出航到推荐港 ----
console.log('\n7) 出航')
await page.keyboard.press('Escape')
await sleep(500)
await page.evaluate(async (toId) => {
  const m = await import('/Age-of-Discovery/src/data/ports.ts')
  const p = m.ports.find(x => x.id === toId)
  window.__gameStore.getState().sailToWaypoint({ latitude: p.latitude, longitude: p.longitude, portId: p.id })
}, rec.toPortId)
await sleep(900)
const depart = await findButton(['出航'])
check(!!depart, '出航计划面板弹出且有「出航」')
if (depart) { await clickReal(depart); await sleep(900) }
// 航行推进：点「+1 天」直到到港；遇事件卡选第一个可点的
for (let i = 0; i < 60; i++) {
  const st = await page.evaluate(() => ({ sailing: window.__gameStore.getState().fleet.isSailing, ph: window.__gameStore.getState().gamePhase }))
  if (!st.sailing) break
  if (st.ph === 'event') {
    const c = await findButton(['继续', '迎上去', '稳妥', '绕开'])
    if (c) await clickReal(c)
    await sleep(500)
    continue
  }
  const d1 = await findButton(['+1天', '+1 天'])
  if (!d1) { await sleep(400); continue }
  await clickReal(d1)
  await sleep(200)
}
const atPort = await page.evaluate(() => ({ port: window.__gameStore.getState().fleet.currentPortId, day: window.__gameStore.getState().fleet.day, sailing: window.__gameStore.getState().fleet.isSailing }))
check(atPort.port === rec.toPortId, `到了推荐的那个港（${atPort.port}，第 ${atPort.day} 天）`)
check(!atPort.sailing, '航行已结束，船停在港里')

// ---- 8. 卖出：第一笔钱到账 ----
console.log('\n8) 卖出')
await sleep(800)
const trade2 = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').replace(/\s+/g, '').startsWith('贸易'))
  if (!b) return null
  const r = b.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
if (trade2) { await page.mouse.click(trade2.x, trade2.y); clicks++; await sleep(700) }
const sellTab = await findButton(['出售'])
check(!!sellTab, '贸易面板有「出售」页签（到港后能卖）')
if (sellTab) { await clickReal(sellTab); await sleep(450) }
for (let i = 0; i < 6; i++) {
  const ok = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('[data-testid="trade-sell-row"]')]
    for (const r of rows) {
      for (const qty of ['-10', '-5', '-1']) {
        const btn = [...r.querySelectorAll('button')].find(b => (b.textContent || '').trim() === qty)
        if (btn && !btn.disabled) {
          const rect = btn.getBoundingClientRect()
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
        }
      }
    }
    return null
  })
  if (!ok) break
  await page.mouse.click(ok.x, ok.y)
  clicks++
  await sleep(240)
}
const g2 = await gold()
const left = await page.evaluate(() => window.__gameStore.getState().fleet.cargo.reduce((a, c) => a + c.quantity, 0))
const profit = g2 - 500
check(left === 0, `货全出手了（剩 ${left} 件）`)
check(profit >= 300, `第一笔钱净赚 ${profit} 金（开局 500 → ${g2}）`)
await page.screenshot({ path: `${SHOTS}/first-run-done.png` })
console.log(`\n全程 ${clicks} 次点击 · 第 ${atPort.day} 天 · 金币 500 → ${g2}（净赚 ${profit}）`)

check(errors.length === 0, `全程运行时错误 0 条${errors.length ? ' → ' + errors.slice(0, 2).join(' | ') : ''}`)
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
if (fail > 0) process.exit(1)
