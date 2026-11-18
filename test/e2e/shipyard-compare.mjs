// 造船厂的「差值对比旗舰」：买船时不该让玩家自己做减法。
//
// 【为什么单独一套】这一轮给每个船型卡加了四项 `data-delta`（速度/耐久/舱位/船员
// 相对旗舰的差）。这种东西最容易坏在两处：
//   ① 基准取错 —— 拿"舰队里最好的那艘"比，玩家会得出"买了反而变差"的错觉；
//   ② 浮点残差 —— 耐久明明相同，屏幕上写「-0」，看着像有个不认识的负数。
// 单测查得到源码字符串，查不到"屏幕上那四个数是不是真的等于 模板−旗舰"。
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL || process.env.AOD_BASE || 'http://localhost:5174/Age-of-Discovery/'
const SHOTS = '.workbuddy/shots'
mkdirSync(SHOTS, { recursive: true })

let pass = 0
const fails = []
const check = (ok, label) => {
  if (ok) { pass++; console.log('  ✓', label) }
  else { fails.push(label); console.log('  ✗ FAIL:', label) }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!window.__gameStore && !!window.__mapStore, { timeout: 30000 })
await sleep(900)

await page.evaluate(() => {
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false,
    dialogueSeen: ['opening_pilot'], activePanel: null,
    logbook: [], claimedVictories: [], collectedDebris: [], collectedRelics: [], collectedLegends: [],
    discoveredPorts: [6],
  })
  const s = window.__gameStore.getState()
  // 塞维利亚（欧洲）有造船厂；钱够买护卫舰，不够买盖伦（用来验"还差多少"）
  window.__gameStore.setState({
    fleet: { ...s.fleet, currentPortId: 6, isSailing: false, day: 40, gold: 2500 },
  })
  const d = window.__dialogueStore
  for (let i = 0; i < 12 && d?.getState?.().scriptId; i++) d.getState().skip()
  window.__gameStore.setState({ showHelp: false, activePanel: null })
  window.__mapStore.getState().setViewMode('chart')
})
await sleep(700)
await page.evaluate(() => window.__gameStore.getState().setActivePanel('shipyard'))
await sleep(1000)

/* ── 一、结构与宽度 ── */
console.log('=== 结构 ===')
const geo = await page.evaluate(() => {
  const panel = document.querySelector('[data-testid="shipyard-panel"]')
  const offers = [...document.querySelectorAll('[data-testid^="shipyard-offer-"]')]
  const pr = panel?.getBoundingClientRect()
  return {
    panelW: Math.round(pr?.width || 0),
    offers: offers.length,
    keys: offers.map(o => o.getAttribute('data-testid').replace('shipyard-offer-', '')),
    hasSpeed: !!document.querySelector('[data-testid="shipyard-fleet-speed"]'),
  }
})
check(geo.panelW >= 400, `面板宽 ≥400px（实际 ${geo.panelW}）`)
check(geo.offers === 3, `三个可买船型都在（${geo.keys.join('/')}）`)
check(geo.hasSpeed, '顶部有舰队均速')

/* ── 二、差值 = 模板值 − 旗舰值 ── */
console.log('=== 差值对账 ===')
const rows = await page.evaluate(() => {
  const fleet = window.__gameStore.getState().fleet
  const flag = fleet.ships.find(s => s.id === fleet.flagshipId) || fleet.ships[0]
  const out = []
  for (const card of document.querySelectorAll('[data-testid^="shipyard-offer-"]')) {
    const key = card.getAttribute('data-testid').replace('shipyard-offer-', '')
    // 每项属性是 span[data-delta]，文字形如「速度 12节 +4」/「耐久 40 0」
    const stats = [...card.querySelectorAll('[data-delta]')].map(el => {
      const t = (el.parentElement?.textContent || '').replace(/\s+/g, '')
      return {
        label: t.replace(/[\d.+\-字节舱位员速度耐久船]/g, ''),
        delta: Number(el.getAttribute('data-delta')),
        shown: (el.textContent || '').trim(),
        text: t,
      }
    })
    out.push({ key, stats })
  }
  return { flag: { speed: flag.speed, dur: flag.maxDurability, cap: flag.capacity, crew: flag.maxCrew }, out }
})
check(rows.out.every(o => o.stats.length === 4), '每张卡有 4 项差值')
check(rows.flag.speed > 0, `读到了旗舰数据（速度 ${rows.flag.speed} / 耐久 ${rows.flag.dur} / 舱位 ${rows.flag.cap} / 船员 ${rows.flag.crew}）`)

// 从页面上读出的绝对值重算一遍：delta 必须等于 值 − 旗舰值
const recompute = await page.evaluate(() => {
  const fleet = window.__gameStore.getState().fleet
  const flag = fleet.ships.find(s => s.id === fleet.flagshipId) || fleet.ships[0]
  const base = { 速度: flag.speed, 耐久: flag.maxDurability, 舱位: flag.capacity, 船员: flag.maxCrew }
  const bad = []
  for (const card of document.querySelectorAll('[data-testid^="shipyard-offer-"]')) {
    const key = card.getAttribute('data-testid').replace('shipyard-offer-', '')
    for (const el of card.querySelectorAll('[data-delta]')) {
      const txt = (el.parentElement?.textContent || '').replace(/\s+/g, '')
      const m = txt.match(/^(速度|耐久|舱位|船员)([\d.]+)/)
      if (!m) { bad.push(`${key}: 解析失败 ${txt}`); continue }
      const label = m[1]
      const value = parseFloat(m[2])
      const want = value - base[label]
      const got = Number(el.getAttribute('data-delta'))
      if (Math.abs(want - got) > 0.05) bad.push(`${key}.${label}: 显示差 ${got}，应为 ${want}`)
    }
  }
  return bad
})
check(recompute.length === 0, `四项差值全部等于「模板值 − 旗舰值」（${recompute.slice(0, 3).join('; ') || '全部一致'}）`)

/* ── 三、没有「-0」 ── */
const zeros = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('[data-delta]')) {
    const shown = (el.textContent || '').trim()
    if (/-0$|−0$/.test(shown)) out.push(shown)
  }
  return out
})
check(zeros.length === 0, `没有「-0」这种浮点残差写法（${zeros.join(',') || '干净'}）`)

/* ── 三·五、差值的颜色要读得清 ──
 * 12px 的 `+60` / `-20` 是第一眼要读的东西。实测 danger-400 (#b8432e) 在面板底
 * (#281e12) 上只有 **3.02:1** —— 缺陷比优势更看不清，正好反过来。
 * 这里量的是 computed color，不是查 class 名。
 */
const contrast = await page.evaluate(() => {
  const lum = (rgb) => {
    const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const parse = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number)
  // 卡片底：inlay 叠在面板底上，取最近的不透明祖先背景
  const cardBg = (el) => {
    let n = el
    while (n) {
      const bg = getComputedStyle(n).backgroundColor
      const m = bg.match(/rgba?\(([^)]+)\)/)
      if (m) {
        const parts = m[1].split(',').map(Number)
        if (parts.length < 4 || parts[3] > 0.9) return parts.slice(0, 3)
      }
      n = n.parentElement
    }
    return [40, 30, 18]
  }
  const out = { pos: null, neg: null, zero: null }
  for (const el of document.querySelectorAll('[data-delta]')) {
    const d = Number(el.getAttribute('data-delta'))
    const fg = parse(getComputedStyle(el).color)
    const bg = cardBg(el)
    const l1 = lum(fg), l2 = lum(bg)
    const r = +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2))
    const bucket = d > 0 ? 'pos' : d < 0 ? 'neg' : 'zero'
    if (!out[bucket] || r < out[bucket]) out[bucket] = r
  }
  return out
})
check(contrast.pos === null || contrast.pos >= 4.5, `优势差值对比度 ${contrast.pos}:1（≥4.5）`)
check(contrast.neg === null || contrast.neg >= 4.5, `劣势差值对比度 ${contrast.neg}:1（≥4.5，这一项原来只有 3.02）`)
check(contrast.zero === null || contrast.zero >= 4.5, `零差值对比度 ${contrast.zero}:1（≥4.5）`)

/* ── 四、买不起与买得到要分开 ── */
console.log('=== 可买性 ===')
const afford = await page.evaluate(() => {
  const frigate = document.querySelector('[data-testid="shipyard-offer-frigate"]')
  const galleon = document.querySelector('[data-testid="shipyard-offer-galleon"]')
  const btn = (el) => el?.querySelector('button')
  return {
    frigateDisabled: btn(frigate)?.disabled,
    // 单桅快船只在地中海以外的加勒比造船厂卖，塞维利亚（欧洲）不该能点
    sloopDisabled: btn(document.querySelector('[data-testid="shipyard-offer-sloop"]'))?.disabled,
    galleonDisabled: btn(galleon)?.disabled,
    shortText: (document.querySelector('[data-testid="shipyard-short-galleon"]')?.textContent || '').trim(),
  }
})
check(afford.galleonDisabled === true, '钱不够时盖伦的按钮是禁用的')
check(/还差\s*\d+\s*金币/.test(afford.shortText), `写清了还差多少（${afford.shortText}）`)
check(afford.frigateDisabled === false, '钱够的护卫舰（2000 ≤ 2500）可以点')
check(afford.sloopDisabled === true, '单桅快船只在加勒比有售，塞维利亚不可点')

await page.screenshot({ path: `${SHOTS}/shipyard-compare.png` })

/* ── 五、窄屏不溢出 ── */
await page.setViewport({ width: 1024, height: 768 })
await sleep(500)
const narrow = await page.evaluate(() => {
  const card = document.querySelector('[data-testid="shipyard-offer-frigate"]')
  const panel = document.querySelector('[data-testid="shipyard-panel"]')
  return {
    cardRight: Math.round(card?.getBoundingClientRect().right || 0),
    panelRight: Math.round(panel?.getBoundingClientRect().right || 0),
    cardW: Math.round(card?.getBoundingClientRect().width || 0),
  }
})
check(narrow.cardRight <= narrow.panelRight + 1, `1024 下卡片不越界（${narrow.cardRight} ≤ ${narrow.panelRight}）`)
check(narrow.cardW >= 320, `1024 下卡片仍有 ${narrow.cardW}px（两列属性排得开）`)

check(errs.length === 0, `无 pageerror（${errs.slice(0, 2).join(' | ')}）`)

console.log(`\n${pass} 通过 / ${fails.length} 失败`)
if (fails.length) { console.log('失败项：'); fails.forEach(f => console.log('  -', f)) }
await browser.close()
process.exit(fails.length ? 1 : 0)
