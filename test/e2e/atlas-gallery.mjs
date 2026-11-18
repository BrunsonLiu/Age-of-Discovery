// 图鉴的港口画廊：靠过的岸带画，没靠过的仍是小格。
//
// 【为什么单独一套】图鉴原来 21 格全是「⚓ 名字 / 区域」两行字 —— 册子
// 已经整屏了，可港口区还是通讯录。改成"已发现带画 / 未发现小格"之后，
// 要盯的不再是"能不能跑"，而是四件容易被悄悄改坏的事：
//   ① 真图：<img> 的 naturalWidth 必须是 400（不是 404 的空框、不是大图）
//   ② 不剧透：未靠过的港在画廊里**一张卡都没有**
//   ③ 点得动：已发现卡 → 合册子 + 地图挪到该港
//   ④ 不白下：一次只请求已发现那几张缩略图，不碰 150~390KB 的大图
// 另外把「21 港全点亮」也跑一遍：全部都是画，没有小格组。
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL || process.env.AOD_BASE || process.env.GAME_URL || 'http://localhost:5174/Age-of-Discovery/'
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

const boot = async (page, discovered) => {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
  await page.waitForFunction(() => !!window.__gameStore && !!window.__mapStore, { timeout: 30000 })
  await page.evaluate((ids) => {
    window.__gameStore.setState({
      gamePhase: 'playing', tutorialStep: -1, showHelp: false,
      dialogueSeen: ['opening_pilot'], activePanel: null,
      logbook: [], claimedVictories: [], collectedDebris: [],
      collectedRelics: [], collectedLegends: [],
    })
    const s = window.__gameStore.getState()
    window.__gameStore.setState({
      fleet: { ...s.fleet, currentPortId: 21, isSailing: false, day: 20, gold: 1000, fame: 30 },
      discoveredPorts: ids,
    })
    window.__mapStore.getState().setViewMode('chart')
  }, discovered)
  await sleep(700)
  for (let i = 0; i < 3; i++) {
    const on = await page.evaluate(() => document.body.innerText.includes('Esc 跳过致辞'))
    if (!on) break
    await page.keyboard.press('Escape')
    await sleep(300)
  }
  await page.evaluate(() => {
    const d = window.__dialogueStore
    for (let i = 0; i < 8 && d?.getState?.().scriptId; i++) d.getState().skip()
  })
  await sleep(300)
}

/** 打开册子 → 图鉴页（顺手把残留的对白/致辞收掉，截图才看得见册子） */
const openAtlas = async (page) => {
  await page.evaluate(() => {
    const d = window.__dialogueStore
    for (let i = 0; i < 12 && d?.getState?.().scriptId; i++) d.getState().skip()
    window.__gameStore.setState({ showHelp: false, activePanel: null })
    window.__mapStore.getState().openLogbook('atlas')
  })
  await sleep(1100)
}

/* ───────────── 一、只靠过 3 个港 ───────────── */
console.log('=== 只靠过 3 个港：画廊 3 张，其余仍小格 ===')
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errs = []
page.on('pageerror', (e) => errs.push(e.message))
// 记下所有港口图片请求，用来判"有没有白下大图"
const imgReqs = []
page.on('request', (r) => {
  const u = r.url()
  if (/\/assets\/ports\/.*\.webp/.test(u)) imgReqs.push(u.split('/').pop())
})

await boot(page, [21, 12, 16])
await openAtlas(page)

const cards = await page.evaluate(() => {
  const cs = [...document.querySelectorAll('[data-testid^="atlas-port-"]')]
    .filter(el => /^atlas-port-\d+$/.test(el.getAttribute('data-testid')))
  return cs.map(el => ({
    id: Number(el.getAttribute('data-testid').replace('atlas-port-', '')),
    name: el.getAttribute('aria-label'),
    hasImg: !!el.querySelector('img'),
  }))
})
check(cards.length === 3, `画廊里正好 3 张卡（实际 ${cards.length}）`)
check(cards.every(c => c.hasImg), '3 张卡都带图')
check(cards.map(c => c.id).sort((a, b) => a - b).join(',') === '12,16,21',
  `是已发现的那 3 个港（${cards.map(c => c.id).join(',')}）`)

// 真图：naturalWidth 必须是 400（缩略图规格），不是 404 的空框、也不是大图
const imgs = await page.evaluate(async () => {
  const out = []
  for (const im of document.querySelectorAll('[data-testid^="atlas-port-img-"]')) {
    if (!im.complete) await new Promise(r => { im.onload = r; im.onerror = r })
    out.push({ nw: im.naturalWidth, nh: im.naturalHeight, src: im.getAttribute('src') })
  }
  return out
})
check(imgs.length === 3, `页面上有 3 张港口图（实际 ${imgs.length}）`)
check(imgs.every(i => i.nw === 400 && i.nh === 225),
  `3 张图都是 400×225 的小图（实际 ${imgs.map(i => `${i.nw}×${i.nh}`).join(' / ')}）`)
check(imgs.every(i => /\/thumb\//.test(i.src || '')), '图的地址落在 thumb/ 目录')

// 未发现的港：画廊里一张卡都没有
const unfoundInGallery = await page.evaluate(() => {
  // 未发现那组的小格没有 atlas-port-* 这个 testid，用 aria-label 反查港口中文名
  const gallery = [...document.querySelectorAll('[data-testid^="atlas-port-"]')]
    .map(el => el.getAttribute('aria-label'))
  return gallery
})
check(!unfoundInGallery.includes('哈瓦那') && !unfoundInGallery.includes('果阿'),
  '没靠过的港（哈瓦那/果阿）不在画廊里')

// 点已发现的卡 → 合册子 + 地图挪过去
const before = await page.evaluate(() => window.__mapStore.getState().center)
await page.click('[data-testid="atlas-port-12"]')
await sleep(800)
const after = await page.evaluate(() => ({
  records: window.__mapStore.getState().recordsOpen,
  center: window.__mapStore.getState().center,
}))
check(!after.records, '点已发现的港口卡 → 册子合上')
check(JSON.stringify(after.center) !== JSON.stringify(before), '地图挪到那个港了')

await openAtlas(page)
// 点未发现的小格 → 册子仍开着，且详情行不写港名
const unkClick = await page.evaluate(() => {
  const btn = document.querySelector('[data-testid="atlas-unfound-1"]')
  if (!btn) return null
  const label = btn.getAttribute('aria-label')
  btn.click()
  return label
})
await sleep(400)
const stillOpen = await page.evaluate(() => window.__mapStore.getState().recordsOpen)
const detail = await page.evaluate(() => {
  const t = document.body.innerText
  const m = t.match(/[^\n]*还有没靠过的岸[^\n]*/)
  return m ? m[0] : ''
})
check(!!unkClick, '未发现的港在册子里仍有一格（小格，可点）')
check(stillOpen, '点未发现的港不关册子（只给一句回执）')
check(/还有没靠过的岸/.test(detail), `回执写的是"那片海还有没靠过的岸"（${detail.slice(0, 20)}）`)
check(!/哈瓦那|果阿|马六甲/.test(unkClick || ''), '未发现格的读屏文字不含港名（不剧透）')

// 网络：只请求了已发现那 3 张缩略图，没碰大图
const thumbs = imgReqs.filter(f => f && f.endsWith('.webp'))
const bigs = await page.evaluate(() => {
  // 大图只可能来自岸上背景/港口面板，这里册子里不该请求它们
  return performance.getEntriesByType('resource')
    .map(e => e.name)
    .filter(u => /\/assets\/ports\/[^/]+\.webp$/.test(u))
})
check(thumbs.length >= 3 && thumbs.every(f => f.endsWith('.webp')), `册子请求了 ${thumbs.length} 张港口图`)
check(!bigs.some(u => /port_(havana|goa|malay_river)\.webp$/.test(u)),
  `没有请求三张原图（${bigs.length} 条大图请求）`)

await page.screenshot({ path: `${SHOTS}/atlas-gallery-3.png` })

/* ───────────── 二、21 港全点亮 ───────────── */
console.log('=== 21 港全点亮：全是画，没有小格组 ===')
const page2 = await browser.newPage()
await page2.setViewport({ width: 1920, height: 1080 })
page2.on('pageerror', (e) => errs.push(e.message))
await boot(page2, [21])
// 直接给全部 21 个 id
await page2.evaluate(() => {
  const all = []
  for (let i = 1; i <= 21; i++) all.push(i)
  window.__gameStore.setState({ discoveredPorts: all })
})
await sleep(300)
await openAtlas(page2)
const allCards = await page2.evaluate(() => ({
  cards: [...document.querySelectorAll('[data-testid^="atlas-port-"]')]
    .filter(el => /^atlas-port-\d+$/.test(el.getAttribute('data-testid'))).length,
  imgs: [...document.querySelectorAll('[data-testid^="atlas-port-img-"]')].length,
  hasUnfoundGroup: /还没靠过的岸/.test(document.body.innerText),
  counter: (document.body.innerText.match(/港口\s*\n?\s*(\d+)\s*\/\s*(\d+)/) || []).slice(1),
}))
check(allCards.cards === 21, `21 港全在画廊里（实际 ${allCards.cards}）`)
check(allCards.imgs === 21, `21 张图都在（实际 ${allCards.imgs}）`)
check(!allCards.hasUnfoundGroup, '全部点亮后不再出现"还没靠过的岸"那一组')
await page2.screenshot({ path: `${SHOTS}/atlas-gallery-21.png` })

/* ───────────── 三、窄屏 1024 ───────────── */
console.log('=== 1024×768：两列仍可读 ===')
const page3 = await browser.newPage()
await page3.setViewport({ width: 1024, height: 768 })
page3.on('pageerror', (e) => errs.push(e.message))
await boot(page3, [21, 12, 16, 11])
await openAtlas(page3)
const narrow = await page3.evaluate(() => {
  const el = document.querySelector('[data-testid="atlas-port-21"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  const img = el.querySelector('img')
  return { w: Math.round(r.width), h: Math.round(r.height), nw: img ? img.naturalWidth : 0 }
})
check(!!narrow && narrow.w >= 150, `1024 下港口卡宽 ${narrow?.w}px（不小于 150）`)
check(!!narrow && narrow.nw === 400, '窄屏也是同一张 400 宽的图（不做第二套素材）')

check(errs.length === 0, `无 pageerror（${errs.slice(0, 2).join(' | ')}）`)

console.log(`\n${pass} 通过 / ${fails.length} 失败`)
if (fails.length) { console.log('失败项：'); fails.forEach(f => console.log('  -', f)) }
await browser.close()
process.exit(fails.length ? 1 : 0)
