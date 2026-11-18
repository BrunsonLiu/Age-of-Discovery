/*
 * 翻船屏（gameover）：玩家看到这一屏的时刻，是"要不要再开一局"的决策点。
 *
 * 【为什么单独量这一屏】
 * 它由 `gamePhase === 'gameover'` 一块条件渲染，不在任何面板里，
 * 所以 panel-clickable / contrast-audit / 册子五页都扫不到它。
 * 而它恰好是全项目**最后一个**还挂着彩色 emoji 的地方
 * （🏴‍☠️ 标题图标、🥇🥈🥉 奖牌、🏷️ 称号），也是最后一个把
 * 「探索 x/20」写死的地方 —— 同一个文件上面那条注释还专门写着
 * "加了大明广州之后这里还写着 /20，翻船屏会显示 21/20"，
 * 而下面那张座次表一模一样地踩了。
 *
 * 【判据取向】
 * 不写死 21：日本有 21 座港，明天加第 22 座这条就过期了。
 * 改成"同一屏两处分母必须相同"（上面「探索港口」与座次表「探索」），
 * 谁写死一个数，两处立刻不一致。
 */
const BASE = process.env.GAME_URL || process.env.GAME_URL || process.env.AOD_BASE || 'http://127.0.0.1:5174/Age-of-Discovery/'
const puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log(`  ✓ ${msg}`) } else { fail++; console.log(`  ✗ FAIL: ${msg}`) } }

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox'],
})
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)) })
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 40000 })
await sleep(2000)

/* ── 一、造一个"有内容可讲"的残局，再翻船 ── */
console.log('=== 布置：一个有故事的残局 → 翻船 ===')
await page.evaluate(() => {
  const g = window.__gameStore
  const d = window.__dialogueStore
  for (let i = 0; i < 25 && d?.getState?.().scriptId; i++) d.getState().skip()
  g.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false, activePanel: null,
    dialogueSeen: ['opening_pilot'],
    // 让四个派系落在三种色阶上：+40（safe）、-40（danger）、0（中性）
    factionRep: { crown: 40, guild: -40, scholars: 0, brethren: 12 },
    // 已点亮 6 港、拿过两页称号，翻船屏要如实反映这些
    discoveredPorts: [1, 3, 6, 12, 16, 21],
    claimedVictories: ['title_merchant', 'title_explorer'],
    notoriety: { cruel: 1, mercy: 4, greed: 2, bold: 3, secret: 0 },
  })
  const s = g.getState()
  g.setState({
    fleet: { ...s.fleet, currentPortId: 6, isSailing: false, day: 88, gold: 12480, fame: 61 },
    stats: { ...s.stats, daysSailed: 88, trades: 41, bestDeal: 1880, eventsSurvived: 22, pirateWins: 5, historySeen: 7 },
  })
})
await sleep(500)
// 翻船：直接落 gamePhase（生产里由 morale<=0 / 全船沉没触发，这里只量那一屏）
await page.evaluate(() => window.__gameStore.setState({ gamePhase: 'gameover' }))
await sleep(1200)

const shown = await page.evaluate(() => {
  const t = document.body.innerText || ''
  return { hasTitle: /航行终结/.test(t), hasResume: /接着看海/.test(t), hasReset: /重新起航/.test(t) }
})
check(shown.hasTitle, '翻船屏真的出现了（「航行终结」）')
check(shown.hasResume && shown.hasReset, '两条退路都在：接着看海 / 重新起航')

/* ── 二、可见文本里不许有彩色 emoji ── */
console.log('\n=== 彩色 emoji（全项目清过一遍，只有这块漏了） ===')
/*
 * 只扫**可见文本**，不扫 HTML —— 注释与 aria-label 不影响画面。
 * 范围取 Unicode 的 emoji 主区（1F300-1FAFF）+ 杂项符号与装饰符（2600-27BF），
 * 奖牌 🥇 在 1F3C5、旗帜 🏴 在 1F3F4、标签 🏷 在 1F3F7，都被盖住。
 * ★☆✓⚠ 这类单字符不属于这两段，它们是"排版符号"，全项目都在用，不算。
 */
const emojis = await page.evaluate(() => {
  const re = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu
  const root = document.body
  const out = []
  const walk = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const m = (n.textContent || '').match(re)
        if (m) out.push(...m.map(c => `${c}(${c.codePointAt(0).toString(16)})`))
      } else if (n.nodeType === 1) {
        const cs = getComputedStyle(n)
        if (cs.display !== 'none' && cs.visibility !== 'hidden' && n.tagName !== 'SCRIPT' && n.tagName !== 'STYLE') walk(n)
      }
    }
  }
  walk(root)
  return [...new Set(out)]
})
check(emojis.length === 0, `翻船屏无彩色 emoji（${emojis.join(',') || '干净'}）`)

/* ── 三、两处「探索」分母必须一致 ── */
console.log('\n=== 探索分母：同屏两处必须同源 ===')
const dens = await page.evaluate(() => {
  const t = document.body.innerText || ''
  // 「探索港口: 6/21」与「探索 6/21」
  const a = t.match(/探索港口:\s*\d+\/(\d+)/)
  const rows = [...t.matchAll(/探索\s+(\d+)\/(\d+)/g)].map(m => ({ have: +m[1], total: +m[2] }))
  return { summary: a ? +a[1] : null, rows }
})
check(dens.summary != null, `生涯总结里写了「探索港口 x/${dens.summary}」`)
check(dens.rows.length === 4, `座次表四行都写了探索分母（${dens.rows.length} 行）`)
check(dens.rows.every(r => r.total === dens.summary),
  `座次表分母与生涯总结一致（${dens.rows.map(r => r.total).join(',')} vs ${dens.summary}）—— 写死 20 的那行会在这里红`)

/* ── 四、排序规则必须写在界面上 ── */
console.log('\n=== 排序规则（玩家看不见的排序 = 看起来像 bug） ===')
const rule = await page.evaluate(() => (document.body.innerText || '').includes('按金币排'))
check(rule, '座次表写明了「按金币排 · 同分看声望」')

/* ── 五、名次是数字，不是奖牌 emoji ── */
const ranks = await page.evaluate(() => {
  const t = document.body.innerText || ''
  const seg = t.slice(t.indexOf('同代船长座次'), t.indexOf('后世如何记载你'))
  return { seg: seg.replace(/\s+/g, ' ').slice(0, 160) }
})
check(/1\s*你/.test(ranks.seg) || /\b1\b/.test(ranks.seg),
  `名次以数字呈现（${ranks.seg.slice(0, 60)}）`)

/* ── 六、小字颜色实测（danger-400 只有 3.50，要 ≥4.5） ── */
console.log('\n=== 派系声望小字色阶 ===')
const tones = await page.evaluate(() => {
  return ['crown', 'guild', 'scholars', 'brethren'].map(id => {
    const el = document.querySelector(`[data-testid="gameover-faction-${id}"]`)
    return el ? { id, text: (el.textContent || '').trim(), color: getComputedStyle(el).color } : { id, text: '（缺失）', color: null }
  })
})
const negTone = tones.find(t => /-\d+$/.test(t.text))
check(tones.every(t => t.text !== '（缺失）'),
  `四个派系都渲染了（${tones.map(t => t.text).join(' / ')}）`)
check(!!negTone, `负声望那一条渲染出来了（${negTone?.text ?? '无'}）`)
check(!negTone || negTone.color !== 'rgb(184, 67, 46)',
  `负声望小字不是 danger-400（实际 ${negTone?.color}；那是 3.50:1，12px 读不清）`)
// 派系图标必须是矢量徽记（<img>），不是彩色 emoji —— 与另外三处同源
const factionIconIsImg = await page.evaluate(() =>
  ['crown', 'guild', 'scholars', 'brethren'].every(id =>
    !!document.querySelector(`[data-testid="gameover-faction-${id}"] img`)))
check(factionIconIsImg, '派系图标走 Badge 矢量徽记（不是 emoji）')

/* ── 七、手机 390：整屏可滚、两个按钮都在视口内能点到 ── */
console.log('\n=== 390 宽（4 张卡必然超一屏，要能滚） ===')
await page.setViewport({ width: 390, height: 844 })
await sleep(700)
const mobile = await page.evaluate(() => {
  const layer = document.querySelector('[data-testid="gameover-screen"]')
  const btn = document.querySelector('[data-testid="continue-as-visitor"]')
  const r = btn?.getBoundingClientRect()
  return {
    scrollable: layer ? layer.scrollHeight > layer.clientHeight : false,
    // 按钮不该在视口外（可以靠滚，但起点不该被裁成半个）
    btnBottom: r ? Math.round(r.bottom) : null,
    vh: innerHeight,
    clipped: r ? r.bottom > innerHeight + 2 : true,
  }
})
check(mobile.scrollable, '整屏可滚（内容高于视口时不会把下面的按钮切掉）')
check(mobile.btnBottom != null, `「接着看海」按钮在 DOM 里（底边 ${mobile.btnBottom} / 视口 ${mobile.vh}）`)
// 按钮在首屏之外是正常的（内容长）；但必须能滚到 —— scrollIntoView 后中心点要命中自己
const hit = await page.evaluate(async () => {
  const btn = document.querySelector('[data-testid="continue-as-visitor"]')
  if (!btn) return null
  btn.scrollIntoView({ block: 'center' })
  await new Promise(r => setTimeout(r, 400))
  const r = btn.getBoundingClientRect()
  const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
  return {
    ok: !!el && (el === btn || btn.contains(el)),
    tag: el ? el.tagName : null,
    cls: el ? (el.className || '').toString().slice(0, 60) : null,
    rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
  }
})
check(!!hit && hit.ok, `滚到之后中心点命中自己（rect ${hit?.rect} / 命中 ${hit?.tag}.${hit?.cls}）`)

/* ── 八、点「接着看海」真的进参观模式（进度不清） ── */
console.log('\n=== 接着看海 ===')
await page.setViewport({ width: 1440, height: 900 })
await sleep(400)
await page.evaluate(() => {
  const btn = document.querySelector('[data-testid="continue-as-visitor"]')
  btn?.scrollIntoView({ block: 'center' })
})
await sleep(300)
const before = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return { gold: s.fleet.gold, ports: s.discoveredPorts.length, mode: s.gameMode }
})
await page.evaluate(() => document.querySelector('[data-testid="continue-as-visitor"]')?.click())
await sleep(1200)
const after = await page.evaluate(() => {
  const s = window.__gameStore.getState()
  return { gold: s.fleet.gold, ports: s.discoveredPorts.length, mode: s.gameMode, phase: s.gamePhase }
})
check(after.mode === 'visitor', `进入参观模式（gameMode=${after.mode}，phase=${after.phase}）`)
check(after.gold === before.gold && after.ports === before.ports,
  `进度没被清（金币 ${after.gold}、港口 ${after.ports}）`)

check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail ? 1 : 0)
