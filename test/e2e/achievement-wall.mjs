// 成就殿：三面墙（商路 / 航迹 / 见闻）+ 自绘勋章。
//
// 【为什么单独一套】成就页从"一张卡片墙"改成"三面分组墙 + 勋章"之后，
// 最容易坏的不是样式，是**数字**与**分组完整性**：
//   · 每面墙的进度加起来必须等于顶部那个总数（不然界面自相矛盾）
//   · 17 条一条都不许从墙上掉下来（拼错 group 就会静默消失）
//   · 已得 / 未得必须真的换了描边（不是同一枚暗一点的章）
// 这三件事单测只能查源码字符串，查不到"渲染出来到底几条"。
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
// AOD_BASE 可指向 preview（5180）或别的端口：改 tailwind.config 之类的东西要重启 dev 才生效，
// 这时直接拿 build 产物验更省事。
const BASE = (process.env.GAME_URL || process.env.AOD_BASE) ?? 'http://localhost:5174/Age-of-Discovery/'
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

const EARNED = ['first_trade', 'merchant_1000', 'explorer_5', 'sailor_50', 'eventful_15', 'relic_collector']
await page.evaluate((earned) => {
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false,
    dialogueSeen: ['opening_pilot'], activePanel: null,
    logbook: [], claimedVictories: [], collectedDebris: [], collectedRelics: [], collectedLegends: [],
    achievements: earned,
  })
  const d = window.__dialogueStore
  for (let i = 0; i < 12 && d?.getState?.().scriptId; i++) d.getState().skip()
  window.__gameStore.setState({ showHelp: false, activePanel: null })
  window.__mapStore.getState().openLogbook('achievement')
}, EARNED)
await sleep(1100)

/* ── 一、三面墙都在，顺序固定 ── */
console.log('=== 三面墙 ===')
const walls = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-testid^="ach-group-"]')]
    .filter(el => /^ach-group-(trade|voyage|lore)$/.test(el.getAttribute('data-testid')))
  return els.map(el => ({
    key: el.getAttribute('data-testid').replace('ach-group-', ''),
    top: Math.round(el.getBoundingClientRect().top),
    count: (el.querySelector('[data-testid^="ach-group-count-"]')?.textContent || '').trim(),
  }))
})
check(walls.length === 3, `三面墙都在（实际 ${walls.length}）`)
check(walls.map(w => w.key).join(',') === 'trade,voyage,lore',
  `顺序是 商路 → 航迹 → 见闻（${walls.map(w => w.key).join(',')}）`)
check(walls.every(w => w.top > 0) && walls[0].top < walls[1].top && walls[1].top < walls[2].top,
  '三面墙自上而下排列（不是叠在一起）')

/* ── 二、每组进度加起来 = 顶部总数 ── */
console.log('=== 数字对账 ===')
const nums = await page.evaluate(() => {
  const head = (document.body.innerText.match(/已得\s*\n?\s*(\d+)\s*\/\s*(\d+)/) || []).slice(1).map(Number)
  const groups = [...document.querySelectorAll('[data-testid^="ach-group-count-"]')].map(el => {
    const m = (el.textContent || '').match(/(\d+)\s*\/\s*(\d+)/)
    return m ? [Number(m[1]), Number(m[2])] : null
  })
  const cards = [...document.querySelectorAll('[data-testid^="achievement-"]')]
    .filter(el => /^achievement-/.test(el.getAttribute('data-testid')))
  const on = cards.filter(el => el.getAttribute('data-earned') === '1')
  return {
    head, groups,
    cards: cards.length,
    earnedCards: on.length,
    earnedIds: on.map(el => el.getAttribute('data-testid').replace('achievement-', '')),
  }
})
check(nums.groups.every(g => g && g.length === 2), '每面墙都有「已得 / 总数」')
const sumOn = nums.groups.reduce((a, g) => a + (g ? g[0] : 0), 0)
const sumAll = nums.groups.reduce((a, g) => a + (g ? g[1] : 0), 0)
check(sumOn === nums.head[0], `三面墙已得之和 = 顶部已得（${sumOn} vs ${nums.head[0]}）`)
check(sumAll === nums.head[1], `三面墙总数之和 = 顶部总数（${sumAll} vs ${nums.head[1]}）`)
check(nums.cards === nums.head[1], `墙上的卡数 = 总数（${nums.cards} 张 / ${nums.head[1]}）`)
check(nums.earnedCards === EARNED.length, `已得卡 ${EARNED.length} 张（实际 ${nums.earnedCards}）`)
check(EARNED.every(id => nums.earnedIds.includes(id)),
  `点亮的正是设的那几条（${nums.earnedIds.join(',')}）`)

/* ── 三、勋章：已得实线金环 / 未得虚线暗环 ── */
console.log('=== 勋章 ===')
const medals = await page.evaluate(() => {
  const pick = (id) => {
    const card = document.querySelector(`[data-testid="achievement-${id}"]`)
    const c = card?.querySelector('svg circle:nth-of-type(2)')
    const all = card?.querySelectorAll('svg circle') || []
    return {
      earned: card?.getAttribute('data-earned'),
      svg: !!card?.querySelector('svg'),
      // 第二个 circle 是外环（第一个是盘面填充、第三个是内环）
      stroke: all[1]?.getAttribute('stroke') || null,
      dash: all[1]?.getAttribute('stroke-dasharray'),
      width: all[1]?.getAttribute('stroke-width'),
      path: !!card?.querySelector('svg path'),
    }
  }
  return { on: pick('first_trade'), off: pick('merchant_5000') }
})
check(medals.on.svg && medals.off.svg, '已得与未得都有自绘勋章')
check(medals.on.stroke === '#e6c67a', `已得的环是实心金（${medals.on.stroke}）`)
check(medals.on.dash === null, '已得的环没有虚线（实线）')
check(medals.off.dash === '3 4', `未得的环是虚线（${medals.off.dash}）`)
check(medals.off.stroke !== medals.on.stroke, `未得的环换了颜色（${medals.off.stroke}）`)
check(medals.on.path && medals.off.path, '两枚勋章都有绶带（path）')
check(Number(medals.on.width) > Number(medals.off.width),
  `已得的环更粗（${medals.on.width} vs ${medals.off.width}）`)

/* ── 四、已得卡的底真的画出来了（Tailwind 会静默丢掉不合法的透明度） ── */
{
  const bg = await page.evaluate(() => {
    const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number)
    const on = document.querySelector('[data-testid="achievement-first_trade"]')
    const off = document.querySelector('[data-testid="achievement-merchant_5000"]')
    return {
      on: parse(getComputedStyle(on).backgroundColor),
      off: parse(getComputedStyle(off).backgroundColor),
    }
  })
  check(bg.on.join(',') !== bg.off.join(','),
    `已得卡与未得卡的底色不同（${bg.on.join(',')} vs ${bg.off.join(',')}）`)
}

/* ── 五、未得卡的文字真的读得清 ── */
console.log('=== 对比度 ===')
const contrast = await page.evaluate(() => {
  const lum = (rgb) => {
    const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const parse = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number)
  const card = document.querySelector('[data-testid="achievement-merchant_5000"]')
  const p = card?.querySelector('p')
  if (!p) return null
  const fg = parse(getComputedStyle(p).color)
  // 卡片底是半透明叠在册子底上的，这里退一步：拿最接近的实际背景（body 计算色）
  const bg = parse(getComputedStyle(document.querySelector('[data-testid="logbook-screen"]') || document.body).backgroundColor)
  const l1 = lum(fg), l2 = lum(bg.length === 3 ? bg : [14, 17, 20])
  return { ratio: +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2)), fg }
})
check(!!contrast && contrast.ratio >= 4.5,
  `未得卡的说明文字对比度 ${contrast?.ratio}:1（12px 小字要 ≥4.5）`)

/* ── 五、宽屏与窄屏都不崩 ── */
console.log('=== 两档宽度 ===')
await page.screenshot({ path: `${SHOTS}/ach-wall-1440.png` })
for (const [w, h] of [[1920, 1080], [1024, 768]]) {
  await page.setViewport({ width: w, height: h })
  await sleep(500)
  const box = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="achievement-first_trade"]')
    if (!card) return null
    const r = card.getBoundingClientRect()
    const svg = card.querySelector('svg')
    const sr = svg?.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height), medal: Math.round(sr?.width || 0) }
  })
  check(!!box && box.w >= 240 && box.medal === 56,
    `${w} 下卡片宽 ${box?.w}px、勋章 56×64（实际 ${box?.medal}）`)
}
await page.screenshot({ path: `${SHOTS}/ach-wall-1024.png` })

check(errs.length === 0, `无 pageerror（${errs.slice(0, 2).join(' | ')}）`)

console.log(`\n${pass} 通过 / ${fails.length} 失败`)
if (fails.length) { console.log('失败项：'); fails.forEach(f => console.log('  -', f)) }
await browser.close()
process.exit(fails.length ? 1 : 0)
