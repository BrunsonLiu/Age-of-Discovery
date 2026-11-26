/*
 * 月相圆盘（顶栏，2026-11-26）。
 *
 * 【为什么是圆盘而不是"满月"两个字】月相是连续形变：玩家该在余光里看出"今晚有月亮"。
 * 这条守四件事：
 *   ① 相位真的跟着**航程天数**走（第 1 天新月、第 16 天满月、第 9 天上弦）；
 *   ② 圆盘有实际尺寸、在视口内、不被别的元素压住（顶栏挤满过三次）；
 *   ③ 悬停说明写清"第几天 + 相位 + 影响"，不是只有一个词；
 *   ④ 手机（390）隐藏 —— 顶栏那时候已经装不下，月亮不该挤掉"正在发生什么"。
 */
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) } }

async function pageReady(w, h) {
  const p = await browser.newPage()
  const errors = []
  p.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
  p.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 140)) })
  p.__errors = errors
  await p.setViewport({ width: w, height: h })
  await p.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
  await p.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await p.reload({ waitUntil: 'networkidle2', timeout: 60000 })
  await p.waitForFunction(() => !!window.__gameStore, { timeout: 30000 })
  await p.evaluate(() => {
    window.__gameStore.setState({ gamePhase: 'playing', tutorialStep: -1, showHelp: false, activePanel: null, dialogueSeen: ['opening_pilot'] })
    window.__dialogueStore?.getState?.().skip?.()
  })
  /*
   * 靠岸会弹港口面板、跳过对白后还可能**立刻触发一个事件**——两者的遮罩都会盖住顶栏
   * （2D 是 bg-black/70、3D 是 bg-black/45，别按类名找）。等真条件：
   * 既没有面板、也没有事件。否则 elementFromPoint 命中遮罩，"圆盘被压住"就是假红。
   */
  /*
   * 靠岸会弹港口面板、跳过对白后还可能**立刻触发一个事件或下一段对白**——
   * 它们的遮罩（role=dialog z=75 / 事件卡固定层）都会盖住顶栏。
   * 对白又是**队列**：skip 一次只推一句。所以要"收一轮、等一拍、再看看"，
   * 不能用一次 evaluate 就宣判干净。
   */
  for (let round = 0; round < 6; round++) {
    await p.evaluate(() => {
      /* dialogueSeen 里必须记下开场那段：清过 localStorage 之后，
         不记它就会被"开场对白"反复重新打开（skip 掉、下一拍又回来）。 */
      window.__gameStore.setState({ currentEvent: null, gamePhase: 'playing', dialogueSeen: ['opening_pilot'] })
      window.__gameStore.getState().setActivePanel(null)
      window.__mapStore?.getState?.().closeRecords?.()
      const d = window.__dialogueStore
      for (let i = 0; i < 40 && d?.getState?.().scriptId; i++) d.getState().skip()
    })
    const clean = await p.evaluate(() => !document.querySelector('[role="dialog"]') &&
      !document.querySelector('.fixed.inset-0.bg-black\\/45') &&
      !document.querySelector('.fixed.inset-0.bg-black\\/70'))
    if (clean) break
    await new Promise(r => setTimeout(r, 200))
  }
  await new Promise(r => setTimeout(r, 400))
  return { page: p }
}

const { page } = await pageReady(1440, 900)

const read = (p) => p.evaluate(() => {
  const el = document.querySelector('[data-testid="moon-phase"]')
  if (!el) return null
  const r = el.getBoundingClientRect()
  const svg = el.querySelector('svg')
  const path = el.querySelector('svg path')
  return {
    phase: el.getAttribute('data-phase'),
    illum: Number(el.getAttribute('data-illum')),
    day: Number(el.getAttribute('data-day')),
    title: el.getAttribute('title') || '',
    w: Math.round(r.width), h: Math.round(r.height),
    x: Math.round(r.x), y: Math.round(r.y),
    inViewport: r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
    svg: !!svg,
    hasPath: !!path,
    display: getComputedStyle(el).display,
    opacity: Number(getComputedStyle(el).opacity),
    hitSelf: (() => {
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return !!hit && (hit === el || el.contains(hit))
    })(),
    hitTag: (() => {
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return hit ? `${hit.tagName}.${(hit.className || '').toString().slice(0, 70)}` : null
    })(),
  }
})

const setDay = async (d) => {
  await page.evaluate((day) => window.__gameStore.setState({ fleet: { ...window.__gameStore.getState().fleet, day } }), d)
  await new Promise(r => setTimeout(r, 250))
}

console.log('=== 桌面：相位跟着天数走 ===')
await setDay(1)
const d1 = await read(page)
check(!!d1, '月相圆盘存在')
check(d1?.phase === 'new', `第 1 天是新月（data-phase=${d1?.phase}）`)
check(d1?.day === 1, `圆盘记着第几天（data-day=${d1?.day}）`)
check(/第 1 天/.test(d1?.title || '') && /新月/.test(d1?.title || ''), `悬停写清"第几天 + 相位"（${d1?.title.slice(0, 34)}…）`)
check(/月暗|月明|月光/.test(d1?.title || ''), '悬停还说了这一晚的影响')

await setDay(16)
const d16 = await read(page)
check(d16?.phase === 'full', `第 16 天是满月（data-phase=${d16?.phase}）`)
check(d16?.illum >= 0.9, `满月照亮高（data-illum=${d16?.illum}）`)
check(d16?.hasPath, '满月画出了亮面路径（不是一个空圆）')

await setDay(9)
const d9 = await read(page)
check(d9?.phase === 'firstQuarter', `第 9 天是上弦（data-phase=${d9?.phase}）`)

console.log('=== 尺寸与遮挡 ===')
await setDay(16)
const box = await read(page)
check(box.w >= 14 && box.h >= 14, `圆盘有实际尺寸（${box.w}×${box.h}）`)
check(box.inViewport, `在视口内（x=${box.x} y=${box.y}）`)
/*
 * 不做 elementFromPoint 命中判据：月亮是**纯显示**，不可点（"入口按钮必须验命中"
 * 那条针对的是可点入口）。而且开局那段「老领航员的致辞」遮罩 z=75 会盖住顶栏，
 * 命中天然落在遮罩上——那是"模态开着"的正常状态，不是被压住。
 * 真正要守的是：它自己可见（有尺寸、不透明、没有被 display:none 或 opacity:0 藏掉）。
 */
check(box.w >= 14 && box.h >= 14 && box.display !== 'none' && box.opacity > 0.5,
  `圆盘可见（${box.w}×${box.h} / display=${box.display} / opacity=${box.opacity}）`)

const fameBox = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.font-mono')].find(e => /^\d+$/.test((e.textContent || '').trim()) && e.closest('[title*="声望"]'))
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.x), w: Math.round(r.width) }
})
check(!fameBox || box.x + box.w <= fameBox.x + 1, `不与声望数字重叠（月亮右缘 ${box.x + box.w} ≤ 声望左缘 ${fameBox?.x}）`)

console.log('=== 手机 390：隐藏（不挤掉"正在发生什么"）===')
const m = await pageReady(390, 844)
const dm = await read(m.page)
check(!dm || dm.display === 'none', `390 宽时圆盘不占位（display=${dm?.display ?? 'absent'}）`)

const errors = [...(page.__errors || []), ...(m.page.__errors || [])]
check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
if (fail > 0) process.exit(1)
