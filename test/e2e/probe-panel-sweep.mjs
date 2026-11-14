// 界面完成度巡检：逐个打开侧栏面板，量"点开之后多了多少东西"。
//
// 判据（都是可证伪的数字，不是"看着挺满"）：
//   · 新增文字字符数 —— < 60 基本是空壳
//   · 新增可点元素数 —— 0 就是死界面
//   · 新增文字里出现 undefined / NaN / null / [object / Infinity —— 数据没兜住
//   · 面板容器高度利用率 —— 内容 < 容器 35% 说明大片空白
//
// 跑法：先起 dev server，再 node test/e2e/probe-panel-sweep.mjs
//      SHOT=1 时每个面板截图落 .workbuddy/shots/panel-<type>.png

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'
const SHOT = process.env.SHOT === '1'
mkdirSync(SHOTS, { recursive: true })

const PANELS = ['fleet', 'task', 'event', 'achievement', 'rival', 'port', 'trade', 'shipyard']
const BAD = /undefined|NaN|Infinity|\[object |: null|>null</

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 140)) })
await page.setViewport({ width: 1440, height: 900 })

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 30000 })
// 造一个"有内容"的存档：靠岸、有日志、有发现、有遗物，面板才不是空态
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false,
    dialogueSeen: ['opening_pilot'], activePanel: null,
    collectedDebris: [],
    discoveredPorts: [21, 12, 18, 11, 10, 6],
    // 四方声望各给一档，一张截图里能同时看到"已达成"与"还没到"
    factionRep: { crown: 95, guild: 55, scholars: 10, brethren: 35 },
    logbook: [
      { id: 'p1', day: 1, kind: 'port', title: '广州', text: '大明广东的市舶司所在。' },
      { id: 'p2', day: 4, kind: 'event', title: '海峡里的灯', text: '马六甲的水面上有灯在动。' },
    ],
    fleet: {
      ...s.fleet,
      currentPortId: 21, isSailing: false, day: 12,
      gold: 1500, fame: 42, durability: 78, food: 60, water: 55, morale: 70,
    },
  })
})
await page.waitForFunction(() => !document.body.innerText.includes('选择你的船长天赋'), { timeout: 30000 })

/*
 * 先关掉剧情对白层。
 * 第一次跑出来 6 个面板「零可点」，截图一看是大副立绘整屏盖着演台词
 * （"船坞就在那儿……"）—— 不是面板坏了，是探针没收拾场景。
 * 对白在独立 store（window.__dialogueStore），skip 是它自己的 API。
 */
const clearDialogue = () => page.evaluate(() => {
  const d = window.__dialogueStore
  for (let i = 0; i < 8 && d?.getState?.().scriptId; i++) d.getState().skip()
})
await clearDialogue()
await new Promise(r => setTimeout(r, 300))

const snap = () => page.evaluate(() => {
  const text = document.body.innerText
  const clickable = [...document.querySelectorAll('button, a, [role="button"], input, select')]
    .filter(el => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
    }).length
  return { text, clickable }
})

const rows = []
for (const type of PANELS) {
  const btn = await page.$(`[data-tut="${type}"]`)
  if (!btn) { rows.push({ type, err: '没有入口按钮' }); continue }
  await clearDialogue()
  const before = await snap()
  await btn.click()
  await new Promise(r => setTimeout(r, 700)) // 懒加载块 + 滑入动画
  const after = await snap()

  // 新增行 = 面板自己画上去的那些
  const beforeLines = new Set(before.text.split('\n').map(s => s.trim()).filter(Boolean))
  const added = after.text.split('\n').map(s => s.trim()).filter(Boolean).filter(l => !beforeLines.has(l))
  const addedChars = added.join('').length
  const bad = added.filter(l => BAD.test(l))
  const clickDelta = after.clickable - before.clickable

  // 面板容器：左侧板（left-[5.75rem]）或右侧板
  const box = await page.evaluate(() => {
    const cands = [...document.querySelectorAll('div')].filter(d => {
      const c = d.getAttribute('class') || ''
      return c.includes('left-[5.75rem]') || c.includes('right-[5.75rem]')
    })
    const out = []
    for (const d of cands) {
      const r = d.getBoundingClientRect()
      if (r.width < 200 || r.height < 200) continue
      const kids = [...d.querySelectorAll('*')].map(k => k.getBoundingClientRect())
      const bottom = kids.length ? Math.max(...kids.map(k => k.bottom)) : r.top
      out.push({ w: Math.round(r.width), h: Math.round(r.height), used: Math.round(Math.min(bottom, r.bottom) - r.top) })
    }
    return out
  })

  rows.push({ type, addedChars, addedLines: added.length, bad, clickDelta, box })
  if (SHOT) await page.screenshot({ path: `${SHOTS}/panel-${type}.png` })
  await btn.click() // 关掉，下一个
  await new Promise(r => setTimeout(r, 350))
}

console.log('面板'.padEnd(14), '新增字数 新增行  可点Δ  容器(高/内容)   异常')
for (const r of rows) {
  if (r.err) { console.log(r.type.padEnd(14), r.err); continue }
  const b = r.box.map(x => `${x.h}/${x.used}`).join(' ') || '—'
  console.log(
    r.type.padEnd(14),
    String(r.addedChars).padStart(7),
    String(r.addedLines).padStart(6),
    String(r.clickDelta).padStart(6),
    b.padEnd(14),
    r.bad.length ? '⚠ ' + r.bad.slice(0, 2).join(' | ').slice(0, 60) : '',
  )
}

const thin = rows.filter(r => !r.err && r.addedChars < 60)
const dead = rows.filter(r => !r.err && r.clickDelta <= 0)
const dirty = rows.filter(r => !r.err && r.bad.length)
console.log(`\n空壳(<60 字): ${thin.map(r => r.type).join(' ') || '无'}`)
console.log(`零可点: ${dead.map(r => r.type).join(' ') || '无'}`)
console.log(`异常串: ${dirty.map(r => r.type).join(' ') || '无'}`)
if (errors.length) console.log('页面错误:', errors.slice(0, 3).join(' | '))
await browser.close()
