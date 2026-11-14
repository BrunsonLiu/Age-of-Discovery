// 验证对比度审计的「遮挡判定」真的会红 —— 判据自己也要有区分力。
//
// 做法：海图上找到罗盘的 N，量它没被盖时是否判"可见"；
// 再注入一个不透明 div 精确盖住它，看是否改判"被遮挡"。
// 这个逻辑与 contrast-audit.mjs 里的内联块一一对应，改了那边这里要同步。
import puppeteer from 'puppeteer-core'

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'

const b = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
await p.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await p.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await p.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await p.waitForFunction(() => !!window.__gameStore, { timeout: 30000 })
await p.evaluate(() => window.__gameStore.setState({
  gamePhase: 'playing', tutorialStep: -1, showHelp: false, dialogueSeen: ['opening_pilot'], activePanel: null,
  logbook: [], claimedVictories: [], collectedDebris: [],
}))

const probe = () => p.evaluate(() => {
  const el = [...document.querySelectorAll('svg text')].find(t => t.textContent.trim() === 'N' && t.getBoundingClientRect().width > 0)
  if (!el) return { found: false }
  const r = el.getBoundingClientRect()
  const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2))
  const cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))
  const hit = document.elementFromPoint(cx, cy)
  if (!hit) return { found: true, occluded: false, why: 'no-hit' }
  const blend = getComputedStyle(hit).mixBlendMode
  const soft = hit.tagName === 'CANVAS' || (blend && blend !== 'normal')
  if (soft || hit === el || hit.contains(el) || el.contains(hit)) {
    return { found: true, occluded: false, hit: hit.tagName, soft }
  }
  let n = hit, occluded = false
  for (let k = 0; n && k < 2; n = n.parentElement, k++) {
    const c2 = getComputedStyle(n)
    const m = /rgba?\(([^)]+)\)/.exec(c2.backgroundColor)
    const alpha = m ? (m[1].split(',').length > 3 ? +m[1].split(',')[3] : 1) : 0
    if (alpha >= 0.5 || (c2.backgroundImage && c2.backgroundImage !== 'none')) { occluded = true; break }
  }
  return { found: true, occluded, hit: hit.tagName }
})

const before = await probe()
console.log('未遮挡：', JSON.stringify(before))

await p.evaluate(() => {
  const el = [...document.querySelectorAll('svg text')].find(t => t.textContent.trim() === 'N' && t.getBoundingClientRect().width > 0)
  const r = el.getBoundingClientRect()
  const d = document.createElement('div')
  d.id = 'occluder-test'
  d.style.cssText = `position:fixed;left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;background:#000;z-index:99999`
  document.body.appendChild(d)
})
const after = await probe()
console.log('被盖住：', JSON.stringify(after))

const ok = before.found && before.occluded === false && after.found && after.occluded === true
console.log(ok ? '✓ 判据有区分力（未盖=可见，盖住=遮挡）' : '✗ 判据失效')
await b.close()
process.exit(ok ? 0 : 1)
