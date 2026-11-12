// 靠港近景（甲板视角下的那座城）：样式随海域变、该出现时出现、真的画在像素上
//
// 跑法：先起 dev server，再 `node test/e2e/deck-harbor.mjs`
//
// 【守的是什么】这一层是"停在港里能看出到了哪"——单测守得住布局数字，守不住
// "屏幕上到底有没有"。所以这里做三件事：
//   ① 四个海域各停一次，读 `__deckHarbor()` 的样式与件数（欧洲/加勒比/南洋/非洲）；
//   ② 远洋时整组必须隐藏（否则"停在海中央也有一座城"）；
//   ③ A/B 截图：把 `deck-harbor` 组藏起来前后各拍一张，统计变化像素 ——
//      证明它**真的**画在了画面上，而不只是一个 visible=true 的对象。
//
// 【踩过的坑】第一版停泊船用 ExtrudeGeometry，实例位置与投影全对（探针把船投到
// 屏幕 (919,436)，正是水面），但一个像素都不显示。所以"对象存在 + 可见"不等于
// "画出来了"，必须有像素级的 A/B。
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const ctx = await browser.createBrowserContext()
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (/favicon|AudioContext|net::ERR_/.test(t)) return
  errors.push('CONSOLE: ' + t.slice(0, 160))
})
await page.setViewport({ width: 1440, height: 900 })

let pass = 0
let fail = 0
const check = (ok, msg) => {
  if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) }
}

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2200)

// ---- 剥遮罩进游戏（与其它 e2e 同一套）----
await page.evaluate(() => {
  window.__gameStore.setState({ gamePhase: 'playing', currentEvent: null })
  window.__mapStore.setState({ viewMode: 'chart' })
  window.__gameStore.getState().skipTutorial?.()
})
await sleep(700)
for (let i = 0; i < 10; i++) {
  const open = await page.evaluate(() => !!window.__dialogueStore?.getState?.().scriptId)
  if (!open) break
  await page.evaluate(() => window.__dialogueStore?.getState?.().skip?.())
  await sleep(200)
}
await page.addStyleTag({ content: '[role=dialog][aria-label$="的致辞"]{display:none!important}' })
await page.evaluate(() => {
  document.querySelectorAll('div.fixed.inset-0').forEach((d) => {
    if (/跳过致辞/.test(d.textContent || '')) d.style.display = 'none'
  })
})

// ---------------------------------------------------------------- ① 进甲板视角
await page.evaluate(() => window.__mapStore.setState({ deckView: true }))
await sleep(2600)
check(await page.evaluate(() => !!window.__deckHarbor), '甲板视角里挂了港口的取证句柄')

/** 到港 + 读布局（停泊时可见性是"无条件"的，见 harborVisible 的注释）*/
const gotoPort = async (portId) => {
  await page.evaluate((pid) => {
    window.__gameStore.setState({ gamePhase: 'playing', waypoint: null, currentRoute: null })
    window.__gameStore.getState().arriveAtPort(pid)
  }, portId)
  // 近岸每 8 帧算一次；无头 Edge ~2fps，所以最多等 6 秒
  for (let i = 0; i < 14; i++) {
    await sleep(450)
    const got = await page.evaluate((pid) => {
      const s = window.__gameStore.getState()
      const h = window.__deckHarbor?.()
      return s.fleet.currentPortId === pid && !!h?.plan
    }, portId)
    if (got) break
  }
  return page.evaluate(() => {
    const h = window.__deckHarbor?.()
    const g = window.__deckScene?.getObjectByName('deck-harbor')
    return {
      style: h?.style, houses: h?.houses, piers: h?.piers, moorings: h?.moorings,
      visible: g?.visible ?? null,
      groupPos: g ? [Math.round(g.position.x), Math.round(g.position.z)] : null,
      palms: h?.plan?.palms?.length ?? 0,
      spire: h?.plan?.spire ? Math.round(h.plan.spire.h * 10) / 10 : null,
      port: window.__gameStore.getState().fleet.currentPortId,
    }
  })
}

const EXPECT = [
  { portId: 6, name: '塞维利亚', style: 'europe', palms: 0, spire: true },
  { portId: 1, name: '哈瓦那', style: 'caribbean', palms: 7, spire: false },
  { portId: 21, name: '广州', style: 'asia', palms: 5, spire: false },
  { portId: 9, name: '埃尔米纳', style: 'africa', palms: 6, spire: false },
]
const seen = []
for (const e of EXPECT) {
  const r = await gotoPort(e.portId)
  seen.push({ ...e, got: r })
  check(r.port === e.portId && r.style === e.style,
    `${e.name}：样式 ${r.style}（港口 ${r.port}）`)
  check(r.visible === true, `${e.name}：港口组可见`)
  /*
   * 栈桥 ≥2 而不是 ≥3：样式里的 `piers` 是**名义条数**，中间那一条永远被
   * 航道口让掉（`|x| < halfW*0.12` 就 skip）—— 港口的正前方必须能进船。
   * 所以实际条数是名义值 −0 或 −1，判据写 2~4。
   */
  check(r.houses >= 5 && r.piers >= 2 && r.piers <= 4 && r.moorings >= 3,
    `${e.name}：${r.houses} 栋房 / ${r.piers} 条栈桥 / ${r.moorings} 条停泊船`)
  check(r.palms === e.palms, `${e.name}：棕榈 ${r.palms} 棵`)
  check(e.spire ? r.spire !== null : r.spire === null,
    `${e.name}：${e.spire ? `有钟楼（高 ${r.spire}）` : '没有钟楼'}`)
}
check(new Set(seen.map((s) => s.got.style)).size === 4,
  `四个海域四种样式，各不相同（${seen.map((s) => s.got.style).join(' / ')}）`)
check(seen.every((s) => s.got.groupPos?.[1] > 10),
  `四个港口的岸线都在相机前方（z=${seen.map((s) => s.got.groupPos?.[1]).join('/')}）`)

// ---------------------------------------------------------- ② 远洋：必须整组隐藏
await page.evaluate(() => {
  const s = window.__gameStore.getState()
  window.__gameStore.setState({
    fleet: { ...s.fleet, currentPortId: null, isSailing: true },
    gamePhase: 'playing',
    shipPosition: [-30, -140], // 南太平洋，离所有港都远
    waypoint: null,
  })
})
let far = null
for (let i = 0; i < 14; i++) {
  await sleep(450)
  far = await page.evaluate(() => {
    const g = window.__deckScene?.getObjectByName('deck-harbor')
    return { visible: g?.visible, plan: !!window.__deckHarbor?.()?.plan }
  })
  if (far.visible === false) break
}
check(far?.visible === false, `远洋（南太平洋）时港口组隐藏（visible=${far?.visible}）`)

// ------------------------------------------------ ③ A/B：它真的画在像素上
await gotoPort(6)
/*
 * 【为什么要 hide 再拍】只读 `visible === true` 会漏掉"对象在、但一个像素都不显示"
 * 的那种错（本轮停泊船的 ExtrudeGeometry 就是这样）。所以把组藏起来再拍一张，
 * 比较**变化了的那些像素**的亮度差：>10 级说明这一片画面真的由它构成。
 */
const shotA = await page.screenshot({ encoding: 'base64' })
await page.evaluate(() => { window.__deckScene.getObjectByName('deck-harbor').visible = false })
await sleep(600)
const shotB = await page.screenshot({ encoding: 'base64' })
await page.evaluate(() => { window.__deckScene.getObjectByName('deck-harbor').visible = true })

const diff = await page.evaluate(async ([a, b]) => {
  const load = (d) => new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = rej
    im.src = 'data:image/png;base64,' + d
  })
  const [ia, ib] = await Promise.all([load(a), load(b)])
  const c = document.createElement('canvas')
  c.width = ia.width; c.height = ia.height
  const g = c.getContext('2d')
  const px = (img) => { g.clearRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data }
  const da = px(ia); const db = px(ib)
  const diffs = []
  let changed = 0
  for (let i = 0; i < da.length; i += 4) {
    const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3
    if (d > 6) { changed++; diffs.push(d) }
  }
  diffs.sort((x, y) => x - y)
  const at = (p) => (diffs.length ? Math.round(diffs[Math.floor(diffs.length * p)] * 10) / 10 : 0)
  return { changed, total: da.length / 4, p50: at(0.5), p90: at(0.9), max: at(0.999) }
}, [shotA, shotB])

check(diff.changed > 4000,
  `藏起港口 → 画面有 ${diff.changed} 个像素变化（占 ${(diff.changed / diff.total * 100).toFixed(1)}%）`)
check(diff.p50 >= 10,
  `变化像素的中位亮度差 ${diff.p50} 级（>10 才算真的"画出来"，不只是边缘抗锯齿）`)
check(diff.p90 >= 30, `p90 ${diff.p90} 级 / 最大 ${diff.max} 级（房屋与船是实心色块）`)

// 顺带记一笔：夜里的窗光（用 performance.now 偏移推到夜里）
await page.evaluate(() => {
  const base = 312384000 - (window.performance.now() - 0)
  const orig = window.performance.now.bind(window.performance)
  window.performance.now = () => orig() + base
})
await sleep(1400)
const nightShot = await page.screenshot({ encoding: 'base64' })
const nightDiff = await page.evaluate(async ([a, b]) => {
  const load = (d) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + d })
  const [ia, ib] = await Promise.all([load(a), load(b)])
  const c = document.createElement('canvas')
  c.width = ia.width; c.height = ia.height
  const g = c.getContext('2d')
  const px = (img) => { g.clearRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data }
  const da = px(ia); const db = px(ib)
  let lit = 0
  for (let i = 0; i < da.length; i += 4) {
    // 只数"变得更亮"的像素：窗光是加法混合，夜里会出现比白天亮的点
    if (db[i] - da[i] > 18) lit++
  }
  return lit
}, [shotA, nightShot])
check(nightDiff > 60, `推到夜里之后有 ${nightDiff} 个像素变亮（码头与房屋的窗光）`)

console.log(`\n报错：${errors.length ? errors.join(' | ') : '无'}`)
check(errors.length === 0, '无页面错误')
await ctx.close()
await browser.close()
console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
