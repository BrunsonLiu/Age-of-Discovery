/*
 * 选项卡片上的**阵营芯片**（2026-11-26）。
 *
 * 【为什么值得一条 e2e】阵营是唯一"看得见就必须提前算"的非金钱杠杆：
 * 30 / 90 的阈值直接换港口特权（护送赏金、回收价、黑市）。卡片上不写，
 * 玩家就只能闭着眼投资 —— 而审计显示：160 个选项里，只看资源时有 17 个选项
 * 被另一个严格支配；算上阵营剩 12，算上取向才是 0。
 * 取向故意不上卡（"你会变成谁"留到结算屏揭晓），所以这条同时守住"别把取向也印出来"。
 *
 * 守四件事：
 *   ① 有阵营变化的选项，卡片上有对应芯片，数值与 summarizeChoice 一致；
 *   ② 只改阵营、资源全 0 的选项**不许**显示「影响甚微」，而应给阵营芯片；
 *   ③ 每个选项最多 2 枚（多了会挤掉资源芯片）；
 *   ④ 卡片上不出现取向名字（守秘/仁慈/贪婪/胆识/残忍）。
 */
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 160)) })
await page.setViewport({ width: 1440, height: 900 })

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) } }
const until = async (fn, ms = 10000) => { try { await page.waitForFunction(fn, { timeout: ms }); return true } catch { return false } }

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
check(await until(() => !!window.__gameStore, 20000), 'dev 状态钩子可用')

/** 注入一个事件并读出每张选项卡上的阵营芯片 */
const probe = async (eventId) => {
  await page.evaluate(async (id) => {
    const imp = (p) => import(`/Age-of-Discovery/src/${p}`).catch(() => import(`/src/${p}`))
    const m = await imp('data/events.ts')
    const ev = m.events.find(x => x.id === id)
    window.__gameStore.setState({ gamePhase: 'event', currentEvent: ev, tutorialStep: -1, showHelp: false, activePanel: null })
    window.__dialogueStore?.getState?.().skip?.()
  }, eventId)
  await until(() => [...document.querySelectorAll('button')].some(b => b.getBoundingClientRect().width > 200 && b.innerText.trim().length > 4))
  await new Promise(r => setTimeout(r, 350))
  return page.evaluate(() => [...document.querySelectorAll('button')]
    .filter(b => b.getBoundingClientRect().width > 200)
    .map(b => ({
      text: (b.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 28),
      chips: [...b.querySelectorAll('[data-faction-chip]')].map(el => ({
        id: el.getAttribute('data-faction-chip'),
        ev: Number(el.getAttribute('data-value')),
        text: (el.textContent || '').trim(),
        size: parseFloat(getComputedStyle(el).fontSize),
        w: Math.round(el.getBoundingClientRect().width),
        h: Math.round(el.getBoundingClientRect().height),
      })),
      plainWords: /影响甚微/.test(b.innerText || ''),
    })))
}

console.log('=== #233 通缉令：三个选项都有阵营变化 ===')
const c233 = await probe(233)
check(c233.length === 3, `三个选项都渲染出来（实测 ${c233.length}）`)
const withChips = c233.filter(c => c.chips.length > 0)
check(withChips.length === 3, `三个选项都带阵营芯片（实测 ${withChips.length}）`)
const crown = c233.flatMap(c => c.chips).filter(x => x.id === 'crown')
check(crown.length >= 2, `王室芯片存在（${crown.length} 枚）`)
check(crown.every(x => /^[王商学盗]\s?[+-]\d+$/.test(x.text)), `芯片文案是"单字 + 带符号数字"（${crown.map(x => x.text).join(' / ')}）`)
check(crown.some(x => x.ev > 0) && crown.every(x => x.ev !== 0), `数值非 0（${crown.map(x => x.ev).join(',')}）`)
check(c233.every(c => c.chips.length <= 2), '每个选项最多两枚阵营芯片')
check(c233.every(c => c.chips.length === 0 || c.chips.every(x => x.size >= 12)), '芯片字号 ≥12px')
check(c233.every(c => c.chips.length === 0 || c.chips.every(x => x.h >= 14 && x.w >= 24)), '芯片有实际尺寸（没被压成 0）')

console.log('=== #238 伊莲的求证：拒绝只动商会，资源全 0 ===')
const c238 = await probe(238)
const refuse = c238.find(c => c.text.includes('拒绝'))
check(!!refuse, '找到"拒绝"那一项')
check(!!refuse && refuse.chips.some(x => x.id === 'guild'), `拒绝有商会芯片（${refuse?.chips.map(x => x.text).join(' ')}）`)
check(!!refuse && !refuse.plainWords, '只改阵营的选项不再显示「影响甚微」')

console.log('=== 取向不许上卡片 ===')
const body = await page.evaluate(() => (document.body.innerText || ''))
const axisWords = ['守秘', '仁慈', '贪婪', '胆识', '残忍']
const leaked = axisWords.filter(w => body.includes(w))
check(leaked.length === 0, `卡片上没有取向名字（泄漏：${leaked.join('/') || '无'}）`)

check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)
console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
if (fail > 0) process.exit(1)
