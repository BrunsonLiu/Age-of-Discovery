// 座次表：三项各自排名、同分并列、行序按金币。
//
// 【为什么单独一套】这张表的价值全在"数字自洽"上，而自洽是最容易被
// 悄悄改坏的：名次写死、行序改了但名次没跟着、对手卡与表各算一套……
// 单测只能验纯函数（utils/rivalRank），验不到"页面上到底显示了几行、
// 名次跟数字对不对得上、改了金币会不会真的动"。
//
// 守六件：
//   ① 四行（你 + 三位对手），"你"只有一行且高亮
//   ② 行序真的是金币降序
//   ③ 每一格显示的名次 = 用它那一列的可见数字重算出来的名次
//   ④「比你」= 他的金币 − 我的金币（带符号；自己那行是一道撇）
//   ⑤ 对手卡上的三项名次与表一致
//   ⑥ 活性：把我的金币提到最高 / 压到最低，行序与名次都跟着变
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

import { mkdirSync } from 'node:fs'
const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
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

/** 把玩家放到一个指定的金币档，并打开船长页 */
const openWith = async (gold, fame, ports) => {
  await page.evaluate((g, f, n) => {
    window.__gameStore.setState({
      gamePhase: 'playing', tutorialStep: -1, showHelp: false,
      dialogueSeen: ['opening_pilot'], activePanel: null,
      logbook: [], claimedVictories: [], collectedDebris: [], collectedRelics: [], collectedLegends: [],
    })
    const s = window.__gameStore.getState()
    window.__gameStore.setState({
      fleet: { ...s.fleet, gold: g, fame: f, day: 40 },
      discoveredPorts: Array.from({ length: n }, (_, i) => i + 1),
    })
    const d = window.__dialogueStore
    for (let i = 0; i < 12 && d?.getState?.().scriptId; i++) d.getState().skip()
    window.__gameStore.setState({ showHelp: false, activePanel: null })
    window.__mapStore.getState().openLogbook('rival')
  }, gold, fame, ports)
  await sleep(900)
}

/** 读页面上的整张座次表（不做任何假设，全部从 DOM 抓） */
const readBoard = () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-testid^="standing-"]')]
    .filter(el => /^standing-/.test(el.getAttribute('data-testid')))
  return rows.map(el => {
    const c = [...el.children]
    const num = (t) => {
      const m = (t || '').match(/^(\d+)\s*#\s*(\d+)$/)
      return m ? { value: Number(m[1]), rank: Number(m[2]) } : null
    }
    const port = (t) => {
      const m = (t || '').match(/^(\d+)\s*\/\s*(\d+)\s*#\s*(\d+)$/)
      return m ? { value: Number(m[1]), total: Number(m[2]), rank: Number(m[3]) } : null
    }
    return {
      key: el.getAttribute('data-testid').replace('standing-', ''),
      you: el.getAttribute('data-you') === '1',
      name: (c[0]?.textContent || '').trim(),
      gold: num(c[1]?.textContent),
      fame: num(c[2]?.textContent),
      ports: port(c[3]?.textContent),
      gap: (c[4]?.textContent || '').trim(),
    }
  })
})

const recompute = (vals, mine) => 1 + vals.filter(v => v > mine).length

/* ── 一、中等财富：你在中间 ── */
console.log('=== 表结构 ===')
await openWith(700, 12, 4)
const board = await readBoard()
check(board.length === 4, `四行（你 + 三位对手，实际 ${board.length}）`)
check(board.filter(r => r.you).length === 1, '"你"只有一行')
check(board.every(r => r.gold && r.fame && r.ports), '每行的金币/声望/探索都能解析出「数值 + 名次」')

/* ── 二、行序 = 金币降序 ── */
const goldOrder = board.map(r => r.gold.value)
check(goldOrder.every((v, i) => i === 0 || goldOrder[i - 1] >= v),
  `行序是金币降序（${goldOrder.join(' → ')}）`)

/* ── 三、每一格的名次 = 用这一列的可见数字重算 ── */
const golds = board.map(r => r.gold.value)
const fames = board.map(r => r.fame.value)
const portVals = board.map(r => r.ports.value)
const mismatch = []
for (const r of board) {
  if (r.gold.rank !== recompute(golds, r.gold.value)) mismatch.push(`${r.key}.gold`)
  if (r.fame.rank !== recompute(fames, r.fame.value)) mismatch.push(`${r.key}.fame`)
  if (r.ports.rank !== recompute(portVals, r.ports.value)) mismatch.push(`${r.key}.ports`)
}
check(mismatch.length === 0, `名次与数字对得上（${mismatch.length ? '错在 ' + mismatch.join(',') : '全部一致'}）`)
check(board.every(r => r.ports.total === 21), `探索分母是 21 座港（${board.map(r => r.ports.total).join('/')}）`)

/* ── 四、「比你」= 他的金币 − 我的金币 ── */
const me = board.find(r => r.you)
const gapIssues = board.filter(r => !r.you).filter(r => {
  const want = r.gold.value - me.gold.value
  if (want === 0) return r.gap !== '持平'
  const shown = Number(r.gap.replace(/[^\d-]/g, ''))
  return shown !== want
})
check(gapIssues.length === 0, `「比你」列 = 他的金币减我的（${gapIssues.map(r => r.key + ':' + r.gap).join(',') || '全部正确'}）`)
check(me.gap === '—', `自己那行写一道撇（${me.gap}）`)

/*
 * 【高亮必须真的画出来】这条是踩出来的：Tailwind 3 对不在 opacity 刻度里的
 * 值（`bg-gold-700/12`）会**静默丢掉整条 bg-***，不报错、不警告 ——
 * 界面上那一行看起来"怎么调都不变色"。所以这里量 computed background，
 * 而不是查 class 名有没有写上。
 */
const hl = await page.evaluate(() => {
  const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number)
  const rows = [...document.querySelectorAll('[data-testid^="standing-"]')]
  const you = rows.find(el => el.getAttribute('data-you') === '1')
  const other = rows.find(el => el.getAttribute('data-you') === '0')
  const r = (el) => el.getBoundingClientRect()
  return {
    youBg: parse(getComputedStyle(you).backgroundColor),
    otherBg: parse(getComputedStyle(other).backgroundColor),
    // 左缘那道金条：border-left-width 与颜色
    youBorder: getComputedStyle(you).borderLeftWidth,
    rowH: Math.round(r(you).height),
  }
})
check(hl.youBg.join(',') !== hl.otherBg.join(','),
  `你的行真的有底色（${hl.youBg.join(',')} vs 别人 ${hl.otherBg.join(',')}）`)
check(parseFloat(hl.youBorder) >= 2, `你的行有金条（左边框 ${hl.youBorder}）`)
check(hl.rowH >= 24 && hl.rowH <= 48, `行高 ${hl.rowH}px（不挤成一团也不散成两行）`)

/* ── 五、对手卡与表一致 ── */
const cards = await page.evaluate(() => {
  return [...document.querySelectorAll('[data-testid^="rival-card-"]')].map(el => ({
    id: el.getAttribute('data-testid').replace('rival-card-', ''),
    chips: [...el.querySelectorAll('span')]
      .map(s => (s.textContent || '').trim())
      .filter(t => /^[金声探]\s*第\s*\d+$/.test(t)),
  }))
})
check(cards.length === 3, `三张对手卡（${cards.length}）`)
const cardMismatch = []
for (const c of cards) {
  const row = board.find(r => r.key === c.id)
  if (!row) { cardMismatch.push(c.id + ':no-row'); continue }
  const want = [`金 第 ${row.gold.rank}`, `声 第 ${row.fame.rank}`, `探 第 ${row.ports.rank}`]
  if (c.chips.join('|') !== want.join('|')) cardMismatch.push(`${c.id}: ${c.chips.join(',')} vs ${want.join(',')}`)
}
check(cardMismatch.length === 0, `对手卡三项名次与表一致（${cardMismatch.join('; ') || '全部一致'}）`)

/* ── 六、活性：把我推到最高 / 压到最低 ── */
console.log('=== 活性 ===')
await openWith(99999, 999, 21)
const top = await readBoard()
check(top[0].you, '金币拉到最高 → 你排在第一位')
check(top[0].gold.rank === 1 && top[0].fame.rank === 1 && top[0].ports.rank === 1,
  `三项都是一名（${top[0].gold.rank}/${top[0].fame.rank}/${top[0].ports.rank}）`)
check(top.filter(r => !r.you).every(r => Number(r.gap.replace(/[^\d-]/g, '')) < 0),
  `其余三人的「比你」全是负数（${top.filter(r => !r.you).map(r => r.gap).join(' ')}）`)

await openWith(1, 0, 1)
const bottom = await readBoard()
check(bottom[3].you, '金币压到最低 → 你排在最后一位')
check(bottom[3].gold.rank === 4, `金币名次 4（实际 ${bottom[3].gold.rank}）`)
check(bottom.slice(0, 3).every(r => Number(r.gap.replace(/[^\d-]/g, '')) > 0),
  `其余三人的「比你」全是正数（${bottom.slice(0, 3).map(r => r.gap).join(' ')}）`)

/* ── 七、并列 ── */
console.log('=== 并列 ===')
const rivals = await page.evaluate(() => window.__gameStore.getState().rivals.map(r => r.gold))
await openWith(rivals[0], 5, 2)
const tie = await readBoard()
const tieRows = tie.filter(r => r.gold.value === rivals[0])
check(tieRows.length >= 2, `至少两行金币相同（${tieRows.length} 行 = ${rivals[0]}）`)
check(tieRows.every(r => r.gold.rank === tieRows[0].gold.rank),
  `同分给同一个名次（都是 #${tieRows[0]?.gold.rank}）`)

await page.setViewport({ width: 1440, height: 900 })
/*
 * 截图前必须再收一次对白：setState 之后大副的提示语可能又被触发，
 * 立绘会盖掉半屏 —— 上一次就是这样把"整张座次表"截成了"一张脸"。
 */
const quiet = async () => {
  await page.evaluate(() => {
    const d = window.__dialogueStore
    for (let i = 0; i < 12 && d?.getState?.().scriptId; i++) d.getState().skip()
    window.__gameStore.setState({ showHelp: false })
  })
  await sleep(500)
}
await quiet()
await page.screenshot({ path: `${SHOTS}/rival-standings.png` })
await page.setViewport({ width: 1024, height: 768 })
await sleep(400)
await quiet()
const narrow = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="rival-standings"]')
  const row = el?.querySelector('[data-testid^="standing-"]')
  return { w: Math.round(el?.getBoundingClientRect().width || 0), rowW: Math.round(row?.getBoundingClientRect().width || 0) }
})
check(narrow.rowW > 0 && narrow.rowW <= narrow.w, `1024 下座次表不横向溢出（行 ${narrow.rowW} / 表 ${narrow.w}）`)
await page.screenshot({ path: `${SHOTS}/rival-standings-1024.png` })

check(errs.length === 0, `无 pageerror（${errs.slice(0, 2).join(' | ')}）`)

console.log(`\n${pass} 通过 / ${fails.length} 失败`)
if (fails.length) { console.log('失败项：'); fails.forEach(f => console.log('  -', f)) }
await browser.close()
process.exit(fails.length ? 1 : 0)
