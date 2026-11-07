/**
 * 港口服务按钮：点了到底有没有反应。
 *
 * 背景：这 5 个铜牌里只有 trade / shipyard 绑过 onClick，修理/补给/招募
 * 三块点了毫无反应——正是玩家最初反馈的「点了没反应」。现在改成跳到对应分区，
 * 这个探针要证明三件事：
 *   ① 5 个按钮都有 data-service 与非空 aria-label；
 *   ② trade / shipyard 真的切换面板；
 *   ③ 修理/补给/招募 能让目标分区**真的进入可视区**（不是调了个没人滚的函数）。
 */
import puppeteer from 'puppeteer-core'

const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) } }

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 30000, polling: 100 })

// 塞维利亚：repair / supply / recruit / trade / shipyard 五项全有
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({
    gamePhase: 'playing',
    tutorialStep: -1,
    fleet: {
      ...s.fleet, isSailing: false, currentPortId: 6, day: 18, gold: 6000,
      // 让修理区有活可干、招募区有位置
      ships: s.fleet.ships.map((sh, i) => (i === 0 ? { ...sh, durability: Math.max(1, sh.maxDurability - 30) } : sh)),
    },
    discoveredPorts: [1, 6, 7],
  })
  window.__mapStore.setState({ selectedPortId: 6 })
  window.__gameStore.setState({ activePanel: 'port' })
  window.__dialogueStore?.getState?.().skip?.()
})
await sleep(1500)

/**
 * 前置清场：新手引导会留一层 `absolute inset-0 bg-black/45` 压暗层，
 * 它没有 role 属性，盖住整张面板时点击全部落空（本轮就是先被它骗了一次：
 * scrollTop 一动不动、trade 也没切面板）。判据不用"有没有某个元素"，
 * 而是直接问"我要点的那个按钮，中心点现在命中的是不是它自己"。
 */
async function ensureClickable(svc) {
  const probe = () => page.evaluate((s) => {
    const b = document.querySelector(`button[data-service="${s}"]`)
    if (!b) return 'no-button'
    const r = b.getBoundingClientRect()
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    return top && (top === b || b.contains(top)) ? 'ok' : `blocked:${(top?.className || '').toString().slice(0, 28)}`
  }, svc)

  for (let i = 0; i < 15; i++) {
    const st = await probe()
    if (st === 'ok') return true
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /跳过引导|跳过这段致辞/.test(x.textContent || ''))
      if (b) b.click()
    })
    await page.keyboard.press('Escape')
    await sleep(300)
  }
  return (await probe()) === 'ok'
}

check(await ensureClickable('repair'), '港口服务按钮真的可命中（没有遮罩盖着）')

const labels = await page.evaluate(() => [...document.querySelectorAll('button[data-service]')].map(b => ({
  svc: b.getAttribute('data-service'),
  label: b.getAttribute('aria-label'),
})))
check(labels.length === 5, `港口服务有 5 个按钮（实际 ${labels.length}）`)
check(labels.every(l => l.label && l.label.length >= 3), `每个都有说得清的 aria-label（${labels.map(l => l.label).join(' / ')}）`)

// 先看滚动容器是谁：把每个服务分区 scrollIntoView 之后，哪个元素的 scrollTop 变了
const scrollInfo = await page.evaluate(() => {
  const anchor = document.querySelector('[data-service-anchor="repair"]')
  let el = anchor?.parentElement
  const chain = []
  while (el) {
    const cs = getComputedStyle(el)
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) {
      chain.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0, 40), sh: el.scrollHeight, ch: el.clientHeight })
    }
    el = el.parentElement
  }
  return chain
})
console.log('  · 可滚动祖先：', JSON.stringify(scrollInfo))

for (const svc of ['repair', 'supply', 'recruit']) {
  // 用真实鼠标点，不用 el.click()（要走命中测试）
  const pt = await page.evaluate((s) => {
    const b = document.querySelector(`button[data-service="${s}"]`)
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, svc)
  if (!pt) { check(false, `${svc}：按钮不存在`); continue }

  const pre = await page.evaluate((s) => {
    const a = document.querySelector(`[data-service-anchor="${s}"]`)
    const r = a.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
  }, svc)

  await page.mouse.click(pt.x, pt.y)
  await sleep(900)

  const post = await page.evaluate((s) => {
    const a = document.querySelector(`[data-service-anchor="${s}"]`)
    const r = a.getBoundingClientRect()
    /*
     * 「进了可视区」不能用视口当判据：面板是 max-h-[60vh] 的滚动容器，
     * 分区在视口内但在容器外一样看不见（第一版就漏判了 repair/supply：
     * 它们停在 y661/434，在 900 高的视口里"可见"，其实已经在面板下沿之外）。
     * 判据改成"落在滚动容器的矩形里"。
     */
    const sc = [...document.querySelectorAll('div')].find(el => {
      const cs = getComputedStyle(el)
      return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4 && el.contains(a)
    })
    const cr = sc ? sc.getBoundingClientRect() : { top: 0, bottom: innerHeight, left: 0, right: innerWidth }
    const cx = Math.round(r.left + Math.min(120, r.width / 2))
    const cy = Math.round(r.top + 12)
    const hit = document.elementFromPoint(cx, cy)
    return {
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      box: [Math.round(cr.top), Math.round(cr.bottom)],
      inView: r.top >= cr.top - 2 && r.bottom <= cr.bottom + 2,
      hitInside: !!(hit && a.contains(hit)),
    }
  }, svc)

  check(post.inView, `${svc} 分区进入了面板可视区（容器 y${post.box[0]}–${post.box[1]}，分区 y ${pre.top} → ${post.top}）`)
  check(post.hitInside, `${svc} 分区标题处真的点到它自己（没被遮挡）`)
}

for (const [svc, sel] of [['trade', '[data-testid="trade-panel"]'], ['shipyard', '[data-testid="shipyard-panel"]']]) {
  await page.evaluate(() => window.__gameStore.setState({ activePanel: 'port' }))
  await sleep(500)
  // 上一轮"跳到分区"已经把面板滚下去了，服务按钮不在视野里 —— 先滚回顶部再点，
  // 否则坐标落在可视区外，点击必然打空（这条也算踩过的坑）。
  await page.evaluate(() => {
    const sc = [...document.querySelectorAll('div')].find(el => {
      const cs = getComputedStyle(el)
      return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4
    })
    sc?.scrollTo({ top: 0 })
  })
  await sleep(400)
  check(await ensureClickable(svc), `${svc} 按钮在视野里可命中`)
  const pt = await page.evaluate((s) => {
    const b = document.querySelector(`button[data-service="${s}"]`)
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, svc)
  await page.mouse.click(pt.x, pt.y)
  /*
   * 面板是 React.lazy 的：dev 下首次打开要现编那个 chunk，可能超过 1s。
   * 固定 sleep(800) 在全链里跑成过、也红过一次（seg2 里 12/1），所以改成
   * 轮询「面板真的可见」最多 6s —— 真打不开照样超时判红。
   */
  let ok = false
  for (let waited = 0; waited < 6000; waited += 200) {
    ok = await page.evaluate((q) => {
      const el = document.querySelector(q)
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.width > 100 && r.height > 100 && r.left < innerWidth && r.right > 0
    }, sel)
    if (ok) { console.log(`    · ${svc} 面板出现用时约 ${waited}ms`); break }
    await sleep(200)  }
  check(ok, `${svc} 按钮切到了对应面板（${sel}）`)
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail === 0 ? 0 : 1)
