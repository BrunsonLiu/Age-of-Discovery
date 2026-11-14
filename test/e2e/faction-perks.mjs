// 阵营特权：舰队面板上写的档位、点数、百分比，必须与代码里实际生效的一致
//
// 跑法：先起 dev server，再 `node test/e2e/faction-perks.mjs`
//
// 【为什么要这一套】
// `factions.ts` 里每个阵营写着三档特权，`nextPerk()` 这个 helper 也早就写好了，
// 但界面从来没调用过它们 —— 玩家看到「友善 (+55)」，不知道友善有什么用。
// 2026-11-14 把已实现的那几条接进面板；同一轮发现另有 8 条是纯设计稿
// （其中 2 条数值与代码不符），已经移进注释、perks 只留真的。
//
// 所以这里守三件事：
//   1. 四个阵营都有小字（至少一条真特权，否则界面上这个阵营等于没有承诺）
//   2. 「再 +X 点」的 X = 下一档阈值 − 当前声望（写死一个数就会红）
//   3. 已达成的档位显示 ✓，且与下一档同时出现时不互相顶掉

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'
mkdirSync(SHOTS, { recursive: true })

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 140)) })
await page.setViewport({ width: 1440, height: 900 })

let pass = 0, fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) }
  else { fail++; console.log('  ✗ FAIL:', msg) }
}
const until = async (fn, ms = 8000) => {
  try { await page.waitForFunction(fn, { timeout: ms }); return true } catch { return false }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
check(await until(() => !!window.__gameStore), 'dev 状态钩子可用')

const openFleet = async (rep) => {
  await page.evaluate((rep) => {
    const s = window.__gameStore.getState()
    window.__gameStore.setState({
      gamePhase: 'playing', tutorialStep: -1, showHelp: false,
      dialogueSeen: ['opening_pilot'], activePanel: null,
      logbook: [], claimedVictories: [], collectedDebris: [],
      factionRep: rep,
      fleet: { ...s.fleet, currentPortId: 21, isSailing: false, day: 10, gold: 800 },
    })
    const d = window.__dialogueStore
    for (let i = 0; i < 8 && d?.getState?.().scriptId; i++) d.getState().skip()
  }, rep)
  await until(() => !document.body.innerText.includes('选择你的船长天赋'), 20000)
  await page.evaluate(() => window.__gameStore.setState({ activePanel: 'fleet' }))
  return until(() => /四方态度/.test(document.body.innerText), 10000)
}

/** 读四个阵营下面那几行小字 */
const readPerks = () => page.evaluate(() => {
  const out = {}
  for (const f of ['crown', 'guild', 'scholars', 'brethren']) {
    const own = document.querySelector(`[data-testid="faction-owned-${f}"]`)
    const next = document.querySelector(`[data-testid="faction-next-${f}"]`)
    out[f] = {
      owned: own ? own.textContent.replace(/\s+/g, ' ').trim() : null,
      next: next ? next.textContent.replace(/\s+/g, ' ').trim() : null,
    }
  }
  return out
})

const IDS = ['crown', 'guild', 'scholars', 'brethren']

console.log('\n【1】声望全 0：每个阵营都该写着"还差多少"')
check(await openFleet({ crown: 0, guild: 0, scholars: 0, brethren: 0 }), '舰队面板打开')
const zero = await readPerks()
for (const f of IDS) {
  check(!!zero[f]?.next, `${f} 显示下一档（${zero[f]?.next ?? '没有'}）`)
  check(!zero[f]?.owned, `${f} 声望 0 时没有"已生效"标记`)
}
// 阈值来自数据：crown 90 / guild 30 / scholars 30 / brethren 30
const expectAt = { crown: 90, guild: 30, scholars: 30, brethren: 30 }
for (const f of IDS) {
  const m = /再 \+(\d+) 点/.exec(zero[f]?.next ?? '')
  check(!!m && Number(m[1]) === expectAt[f], `${f} 的"再 +X 点"= ${expectAt[f]}（实际 ${m?.[1] ?? '无'}）`)
}

console.log('\n【2】跨档位：已生效的档位与下一档要同时出现')
check(await openFleet({ crown: 95, guild: 55, scholars: 10, brethren: 35 }), '舰队面板打开')
const mid = await readPerks()
check(/✓/.test(mid.crown?.owned ?? '') && !mid.crown?.next,
  `王室 95（最高档）：只有 ✓，没有下一档 —— ${mid.crown?.owned}`)
check(/✓/.test(mid.guild?.owned ?? '') && /再 \+5 点/.test(mid.guild?.next ?? ''),
  `商会 55：已生效 1% 与"再 +5 点"同时显示 —— ${mid.guild?.owned} / ${mid.guild?.next}`)
check(!mid.scholars?.owned && /再 \+20 点/.test(mid.scholars?.next ?? ''),
  `学者 10：只有下一档 —— ${mid.scholars?.next}`)
check(/✓/.test(mid.brethren?.owned ?? '') && !mid.brethren?.next,
  `兄弟会 35：已达 30 档 —— ${mid.brethren?.owned}`)
await page.screenshot({ path: `${SHOTS}/faction-perks.png` })

console.log('\n【3】界面上出现的百分比 = 代码里实际生效的折扣')
/*
 * 面板文字里有"1%""3%""4%"，用 store 自己的报价函数量一遍实际折扣。
 * 这里不重复实现公式：拿 selectBuyPrice 在"声望 0"与"声望达标"两种状态下各取一次价，
 * 差价比例就是真折扣。兄弟会那条只在自家港口生效，所以用皇家港（id 2）。
 */
const measure = async (fid, rep, portId, goodId) => {
  await page.evaluate(({ fid, rep, portId }) => {
    const s = window.__gameStore.getState()
    window.__gameStore.setState({
      factionRep: { crown: 0, guild: 0, scholars: 0, brethren: 0, [fid]: rep },
      fleet: { ...s.fleet, currentPortId: portId, isSailing: false },
    })
  }, { fid, rep, portId })
  return page.evaluate(async ({ portId, goodId }) => {
    const mod = await import('/Age-of-Discovery/src/store/useGameStore.ts')
    const goods = await import('/Age-of-Discovery/src/data/ports.ts')
    const st = window.__gameStore.getState()
    /*
     * 不给 goodId 时挑**该港最贵的那件**。
     * 第一版拿的是"该港第一个商品"，结果兄弟会在皇家港实测 0.0% ——
     * 那件货只有十几金，4% 折扣不到 0.5 金，四舍五入之后价格一模一样。
     * 百分比折扣要在足够大的基数上量，否则量的是取整噪声。
     */
    if (goodId != null) return { goodId, price: mod.selectBuyPrice(st, portId, goodId) }
    let best = null
    for (const pg of goods.portGoods.filter(p => p.portId === portId)) {
      const price = mod.selectBuyPrice(st, portId, pg.goodId)
      if (price == null) continue
      if (!best || price > best.price) best = { goodId: pg.goodId, price }
    }
    return best
  }, { portId, goodId })
}

const ratio = async (fid, rep, portId) => {
  const base = await measure(fid, 0, portId)          // 先定位"最贵的那件"
  if (!base) return null
  const after = await measure(fid, rep, portId, base.goodId)  // 同一件货再看一次
  if (after?.price == null) return null
  return +(1 - after.price / base.price).toFixed(4)
}

const rGuild30 = await ratio('guild', 30, 21)
const rGuild60 = await ratio('guild', 60, 21)
const rCrown90 = await ratio('crown', 90, 21)
const rBrethrenHome = await ratio('brethren', 30, 2)   // 皇家港 = 兄弟会地盘
const rBrethrenOther = await ratio('brethren', 30, 6)  // 塞维利亚 = 王室地盘

check(rGuild30 != null && Math.abs(rGuild30 - 0.01) < 0.012,
  `商会 30 档实测折扣 ${(rGuild30 * 100).toFixed(1)}%（文案写 1%）`)
check(rGuild60 != null && Math.abs(rGuild60 - 0.03) < 0.012,
  `商会 60 档实测折扣 ${(rGuild60 * 100).toFixed(1)}%（文案写 3%）`)
check(rCrown90 != null && Math.abs(rCrown90 - 0.03) < 0.012,
  `王室 90 档实测折扣 ${(rCrown90 * 100).toFixed(1)}%（文案写 3%）`)
check(rBrethrenHome != null && Math.abs(rBrethrenHome - 0.04) < 0.012,
  `兄弟会 30 档在皇家港实测折扣 ${(rBrethrenHome * 100).toFixed(1)}%（文案写 4%）`)
check(rBrethrenOther != null && rBrethrenOther <= 0.012,
  `兄弟会 30 档在塞维利亚没有折扣（实测 ${(rBrethrenOther * 100).toFixed(1)}%）`)

check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail ? 1 : 0)
