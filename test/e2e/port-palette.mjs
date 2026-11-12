// 同一座港在两个视图里必须是同一座城：2.5D 全球板 vs 甲板视角的港口配色
//
// 跑法：先起 dev server，再 `node test/e2e/port-palette.mjs`
//
// 【守的是什么】这两处各有一套港口材质。原来 3D 那边把四个屋顶色写死了一遍，
// 加勒比是砖红、甲板上是茅草土黄 —— 玩家"出海图看一眼、进港看一眼"是两个建筑。
// 现在 3D 侧从 `HARBOR_STYLES` 取色，只做一次 ACES 补偿（× PORT_TINT_LIFT）。
// 这里读**真实材质对象**的颜色来对账，而不是看源码里写了什么。
//
// 【改样式时这里会红】期望值写成"甲板的色 × 1.18"，下面表里是算好的结果。
// 改了 `HARBOR_STYLES` 就同步这一张表 —— 红一次是提醒，不是噪声。
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
await page.evaluate(() => {
  window.__gameStore.setState({ gamePhase: 'playing', currentEvent: null })
  window.__mapStore.setState({ viewMode: 'chart' })
  window.__gameStore.getState().skipTutorial?.()
})
await sleep(700)
for (let i = 0; i < 8; i++) {
  const open = await page.evaluate(() => !!window.__dialogueStore?.getState?.().scriptId)
  if (!open) break
  await page.evaluate(() => window.__dialogueStore?.getState?.().skip?.())
  await sleep(200)
}
await page.addStyleTag({ content: '[role=dialog][aria-label$="的致辞"]{display:none!important}' })
await page.evaluate(() => { window.__mapStore.setState({ renderMode: '3d' }) })
let up = false
for (let i = 0; i < 40; i++) {
  await sleep(500)
  up = await page.evaluate(() => !!window.__map3d?.scene)
  if (up) break
}
check(up, '3D 全球板起来了（懒加载 chunk 挂上了）')
if (!up) {
  await ctx.close(); await browser.close()
  console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
  process.exit(1)
}
await sleep(1500)

/* 期望值 = HARBOR_STYLES[style].wall/roof × PORT_TINT_LIFT(1.18)，由单测算过 */
const EXPECT = {
  europe: { wall: 'e8ddc4', roof: 'a85038', port: 6, name: '塞维利亚' },
  caribbean: { wall: 'be9564', roof: '99844a', port: 1, name: '哈瓦那' },
  asia: { wall: 'd8bf94', roof: '505c68', port: 21, name: '广州' },
  africa: { wall: 'd3ac73', roof: '957e57', port: 9, name: '埃尔米纳' },
}

const read = await page.evaluate(() => {
  const out = {}
  window.__map3d.scene.traverse((o) => {
    if (!o.isGroup || o.userData?.portId === undefined) return
    const row = {}
    o.traverse((c) => {
      if (!c.isMesh || !c.material?.color) return
      const t = c.geometry?.type
      if (t === 'BoxGeometry' && !row.wall) row.wall = c.material.color.getHexString()
      if (t === 'ConeGeometry' && !row.roof) row.roof = c.material.color.getHexString()
    })
    if (row.wall || row.roof) out[String(o.userData.portId)] = row
  })
  return out
})

check(Object.keys(read).length === 21, `21 个港口都有微缩模型（实测 ${Object.keys(read).length}）`)
for (const [style, e] of Object.entries(EXPECT)) {
  const got = read[String(e.port)] ?? {}
  check(got.wall === e.wall, `${e.name}（${style}）墙色 ${got.wall} = 甲板口径 ${e.wall}`)
  check(got.roof === e.roof, `${e.name}（${style}）屋顶 ${got.roof} = 甲板口径 ${e.roof}`)
}
/* 四个海域必须真的分得开：墙与屋顶各自四色互不相同 */
const walls = Object.values(EXPECT).map((e) => read[String(e.port)]?.wall)
const roofs = Object.values(EXPECT).map((e) => read[String(e.port)]?.roof)
check(new Set(walls).size === 4, `四个海域的墙色互不相同（${walls.join(' / ')}）`)
check(new Set(roofs).size === 4, `四个海域的屋顶色互不相同（${roofs.join(' / ')}）`)
/* 不能出现"某个海域的港用了邻居的色"（抄错一格最容易发生） */
check(read['7']?.roof === EXPECT.europe.roof && read['6']?.roof === EXPECT.europe.roof,
  '同为欧洲的里斯本与塞维利亚用同一套色')
check(read['2']?.roof === EXPECT.caribbean.roof, '皇家港（加勒比）用加勒比的色')
check(read['12']?.roof === EXPECT.asia.roof, '满剌加（南洋）用南洋的色')

console.log(`\n报错：${errors.length ? errors.join(' | ') : '无'}`)
check(errors.length === 0, '无页面错误')
await ctx.close()
await browser.close()
console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
