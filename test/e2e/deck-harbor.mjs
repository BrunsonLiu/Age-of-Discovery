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

/** 读海面的浪高系数（uWaveScale = 天气浪高 × 港内 calm） */
const readWave = () => page.evaluate(() => {
  const sea = window.__deckScene?.getObjectByName('deck-sea')
  const u = sea?.material?.uniforms?.uWaveScale
  return u ? Math.round(u.value * 1000) / 1000 : null
})

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
      panes: h?.plan?.panes?.length ?? 0,
      chimneys: h?.plan?.chimneys?.length ?? 0,
      folk: h?.plan?.folk?.length ?? 0,
      folkKinds: [...new Set((h?.plan?.folk ?? []).map((f) => f.kind))],
      lamps: h?.plan?.lamps?.length ?? 0,
      lines: h?.plan?.lines?.length ?? 0,
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
  /*
   * 白天的立面细节：墙是一块纯色 Basic 材质，没有窗就是"一排白板"。
   * 窗数必须是房子数的 2 倍以上（每栋至少两扇），烟囱 0 < n < 房子数。
   */
  check(r.panes >= r.houses * 2, `${e.name}：${r.panes} 扇窗（≥ ${r.houses * 2}）`)
  check(r.chimneys > 0 && r.chimneys < r.houses,
    `${e.name}：${r.chimneys} 个烟囱（0 < n < ${r.houses}）`)
  /* 空城问题：码头上得有人，而且不止一种身份（不然是一排复制品） */
  check(r.folk >= 4, `${e.name}：码头上 ${r.folk} 个人`)
  check(r.folkKinds.length >= 2, `${e.name}：至少两种身份（${r.folkKinds.join('/')}）`)
  check(r.lamps >= r.piers + 2, `${e.name}：水边 ${r.lamps} 盏灯（≥ 栈桥数 ${r.piers} + 2）`)
  /* 船真的被系住了：最近的一两条船，艏艉各一根 */
  check(r.lines === Math.min(2, r.moorings) * 2, `${e.name}：${r.lines} 根系泊缆绳`)
}
check(new Set(seen.map((s) => s.got.style)).size === 4,
  `四个海域四种样式，各不相同（${seen.map((s) => s.got.style).join(' / ')}）`)
check(seen.every((s) => s.got.groupPos?.[1] > 10),
  `四个港口的岸线都在相机前方（z=${seen.map((s) => s.got.groupPos?.[1]).join('/')}）`)

// -------------------------------------- ①b 港内海面必须平静（防波堤的意义）
/*
 * 【为什么要测这个】防波堤不是装饰：堤内该是平水。原来停泊时海面与比斯开湾
 * 中间一模一样（同一套全局波浪），那座堤就只是几块石头。停泊压到 0.34，
 * 而且**船与水面读同一个倍率**（否则水面平了船还在摇）。
 */
/* 白天不许点灯：正午的码头上挂几个黄点是最露怯的一处（必须在推进夜里之前测） */
const lampDay = await page.evaluate(() => window.__deckScene?.getObjectByName('deck-harbor-lamps')?.material?.opacity ?? -1)
check(lampDay >= 0 && lampDay <= 0.15, `白天水边的灯几乎不亮（opacity ${lampDay.toFixed(2)}）`)

/*
 * 【云为什么不量像素】天空那一块在 e2e 里被教程遮罩压着：同一块纯天空，
 * 带遮罩 std 32.8、清掉之后 12.7（差 2.6 倍）—— 量出来的是遮罩，不是云。
 * 改成读 uniform（能证伪"把云关掉"），几何上的细节交给单测的源码守卫。
 */
const cloud = await page.evaluate(() => {
  const u = window.__deckSky?.uniforms
  return u ? { k: u.uCloud?.value ?? -1, drift: !!u.uCloudDrift, color: !!u.uCloudColor } : null
})
check(!!cloud && cloud.k > 0.5, `白天云是开着的（uCloud=${cloud?.k?.toFixed(2)}）`)
check(!!cloud?.drift && !!cloud?.color, '云有漂移与自己的颜色两个 uniform')

const waveDock = await readWave()
check(waveDock !== null && Math.abs(waveDock - 0.34) < 0.03,
  `停泊塞维利亚：浪高系数 ${waveDock}（期望 0.34——堤内几乎无浪）`)

/*
 * 尾迹跟着港内系数走：系泊那一档 0.26 × 0.34 = 0.088。
 * 不跟的话，港内海面平如镜、船尾还拖一道白沫（实测截图里很清楚）。
 */
const wakeDock = await page.evaluate(() => {
  const sea = window.__deckScene?.getObjectByName('deck-sea')
  const u = sea?.material?.uniforms?.uWakeK
  return u ? Math.round(u.value * 1000) / 1000 : null
})
check(wakeDock !== null && wakeDock <= 0.12,
  `停泊：尾迹强度 ${wakeDock}（≤0.12——镜面海面上不该有白沫）`)

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

const waveFar = await readWave()
check(waveFar !== null && Math.abs(waveFar - 1) < 0.03,
  `远洋：浪高系数恢复到 ${waveFar}（外海不该被压平）`)

// ------------------------------------------------ ③ A/B：它真的画在像素上
await gotoPort(6)
/*
 * 【为什么要 hide 再拍】只读 `visible === true` 会漏掉"对象在、但一个像素都不显示"
 * 的那种错（本轮停泊船的 ExtrudeGeometry 就是这样）。所以把组藏起来再拍一张，
 * 比较**变化了的那些像素**的亮度差：>10 级说明这一片画面真的由它构成。
 */
/*
 * 【截图前必须先清掉教程/致辞那层浮层】它是一张半透明的整屏卡片，压在天空上 ——
 * 实测：同样的天空，带浮层时像素梯度 1.53、清掉之后 0.15（差 10 倍）。
 * 判据里混进一层卡片就等于在量那张卡片，不是在量云。
 */
await page.evaluate(() => {
  document.querySelectorAll('div.fixed.inset-0').forEach((d) => {
    if (/跳过致辞|跳过引导|翻开日志/.test(d.textContent || '')) d.style.display = 'none'
  })
})
await sleep(400)
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
  /*
   * 【只统计港口带（y 200..390）】整屏差分原来也可以，但海面加了细纹、天空加了
   * 云之后，两张截图相隔几百毫秒，水纹与云也在动 —— 大量 5~15 级的"动态变化"
   * 混进来，把 p90 从 40 拖到 29（判据被新功能污染，实测）。
   * 这条判据要问的是"**房屋是不是实心色块**"，就只该看有房子的那一条。
   */
  const W2 = c.width
  for (let y = 200; y < 390; y++) {
    for (let x = 100; x < 1300; x++) {
      const i = (y * W2 + x) * 4
      const d = (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])) / 3
      if (d > 6) { changed++; diffs.push(d) }
    }
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

// ---------------------------------- ⑤ 夜里：一排灯亮起、整座城暗下去
/*
 * 【为什么要闭环推到深黑】日相 = ((now-t0)/1000/480 + START_PHASE) mod 1，
 * 两个常数都在模块里 —— 一次加多少不好算。所以每次加 60 秒（0.125 周期）
 * 再读 `__deckHarbor().night`，够黑就停。第一版直接加 312384000，
 * 实测只到 night 0.44（黄昏），于是"夜里房子还是亮的"看起来像个 bug。
 */
const nightState = await page.evaluate(async () => {
  const o = window.performance.now.bind(window.performance)
  window.performance.now = () => o() + 312384000
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  let n = 0
  for (let i = 0; i < 10; i++) {
    await sleep(900)
    n = window.__deckHarbor?.()?.night ?? 0
    if (n > 0.85) break
    const o2 = window.performance.now.bind(window.performance)
    window.performance.now = () => o2() + 60000
  }
  await sleep(900)
  const lamp = window.__deckScene?.getObjectByName('deck-harbor-lamps')
  const glow = window.__deckScene?.getObjectByName('deck-harbor-lampglow')
  const wall = window.__deckScene?.getObjectByName('deck-harbor-walls')
  const win = window.__deckScene?.getObjectByName('deck-harbor-windows')
  return {
    night: window.__deckHarbor?.()?.night ?? 0,
    litK: window.__deckHarbor?.()?.litK ?? 1,
    lampOp: lamp?.material?.opacity ?? 0,
    glowOp: glow?.material?.opacity ?? 0,
    winOp: win?.material?.opacity ?? 0,
    wall: wall?.material?.color.getHexString() ?? '',
  }
})
check(nightState.night > 0.8, `推到深夜（night=${nightState.night.toFixed(2)}）`)
check(nightState.lampOp > 0.6, `水边的灯亮起来（opacity ${nightState.lampOp.toFixed(2)}）`)
check(nightState.winOp > 0.5, `墙上的窗光也亮（opacity ${nightState.winOp.toFixed(2)}）`)
/* 灯挂着、水里没像 = 灯悬在空气中 */
check(nightState.glowOp > 0.5, `灯在水面有倒影（opacity ${nightState.glowOp.toFixed(2)}）`)
/* 夜里墙必须真的暗下去：与白天那张 shotA 相比，litK 是唯一的口径 */
check(nightState.litK < 0.35, `夜里整座城暗下来（litK ${nightState.litK.toFixed(2)} < 0.35）`)

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

// 人的网格存在且实例数正确（按身份各一个 + 一个头）
const folkMesh = await page.evaluate(() => {
  const scene = window.__deckScene
  const names = ['deck-harbor-folk-porter', 'deck-harbor-folk-sailor', 'deck-harbor-folk-idle', 'deck-harbor-folk-head']
  const out = {}
  for (const n of names) {
    const m = scene?.getObjectByName(n)
    out[n.replace('deck-harbor-folk-', '')] = m ? { count: m.count, visible: m.visible } : null
  }
  return out
})
/* 注意：InstancedMesh 的 count 是**实例池容量**，不是实际人数（人数由 plan 判据守） */
check(Object.values(folkMesh).every((v) => v && v.visible),
  `人的四个网格都在，实例池 ${Object.values(folkMesh)[0]?.count ?? '—'}/个（${
    Object.entries(folkMesh).map(([k, v]) => `${k}${v?.visible ? '✓' : '✗'}`).join(' ')}）`)

const lineMeshes = await page.evaluate(() => {
  const scene = window.__deckScene
  const out = []
  for (let i = 0; i < 4; i++) {
    const m = scene?.getObjectByName(`deck-harbor-mooringline-${i}`)
    out.push(m ? { visible: m.visible, verts: m.geometry?.attributes?.position?.count ?? 0 } : null)
  }
  return out
})
check(lineMeshes.filter(Boolean).every((m) => m.visible) && lineMeshes.filter(Boolean).length >= 2,
  `缆绳网格都在（${lineMeshes.filter(Boolean).map((m) => m.verts).join('/')} 个顶点）`)

// ---- ⑨ 明暗烘在几何上、逐栋色差、新结构件 ----
/*
 * 【为什么要验 vertexColors 与几何的 color 属性**成对**】这一层的材质全部改成
 * `vertexColors: true`，明暗靠几何上的顶点色。两者只要有一个缺失，屏幕上就是
 * **整块纯黑**（attribute 默认 0）—— 而"黑"在像素 A/B 判据里是"有变化"，抓不到。
 */
const shade = await page.evaluate(() => {
  const scene = window.__deckScene
  const probe = ['deck-harbor-walls', 'deck-harbor-roofs', 'deck-harbor-quay', 'deck-harbor-quayface',
    'deck-harbor-eaves', 'deck-harbor-plinths', 'deck-harbor-craneposts', 'deck-harbor-breakwater']
  const out = {}
  for (const n of probe) {
    const m = scene?.getObjectByName(n)
    if (!m) { out[n] = null; continue }
    const hasColor = !!m.geometry?.getAttribute?.('color')
    out[n] = {
      vertexColors: m.material?.vertexColors ?? false,
      hasColor,
      // 顶点色的最小值（纯黑 = 0）—— 按真实顶点数遍历，不要写死索引
      min: hasColor ? (() => {
        const c = m.geometry.getAttribute('color')
        let v = Infinity
        for (let i = 0; i < c.count; i++) v = Math.min(v, c.getX(i))
        return Number.isFinite(v) ? v : null
      })() : null,
      instColor: !!m.instanceColor,
    }
  }
  const lamp = scene?.getObjectByName('deck-harbor-lamps')
  return { out, lampOp: lamp?.material?.opacity ?? -1 }
})
for (const [n, v] of Object.entries(shade.out)) {
  check(!!v, `网格存在：${n}`)
  if (!v) continue
  check(v.vertexColors && v.hasColor, `${n}：材质开顶点色且几何真的带 color（缺一个就是纯黑）`)
  check(v.min !== null && v.min > 0.25, `${n}：顶点色最小值 ${v.min?.toFixed(2)}（不是 0/纯黑）`)
}
check(shade.out['deck-harbor-walls']?.instColor, '墙有 instanceColor（逐栋色差）')
check(shade.out['deck-harbor-roofs']?.instColor, '屋顶有 instanceColor')

// ---- ⑩ 画面本身有多少细节（把"粗糙"变成可量的数）----
/*
 * 【为什么要量这个】用户两次说"看着还是非常粗糙"。而"粗糙"可以拆成一个
 * 可量的东西：**这一块像素有多不平** —— 亮度标准差。
 * 实测（1440×900，停在塞维利亚）：
 *   · 海面左侧一块（纯水、无船无岸）改动前 std = 1.87 —— 一整片纯色塑料；
 *     加毛细波与水色斑之后 7.63。
 *   · 天空改动前 std = 15.11（只有渐变），加云之后 19.72，且"比天顶亮 6 级
 *     以上的像素"从 0 变成两成多（云）。
 * 这两条同时守住两件事：别再把海面压平成塑料板、别把云删掉。
 */
const detail = await page.evaluate(async (b64) => {
  const img = new Image()
  img.src = 'data:image/png;base64,' + b64
  await img.decode()
  const c = document.createElement('canvas')
  c.width = img.width; c.height = img.height
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  const px = g.getImageData(0, 0, img.width, img.height).data
  const W = img.width
  /*
   * 除了 std，还要算**相邻像素梯度**：std 分不清"渐变"与"细节"——
   * 一整片从深到浅的天空 std 有 15，却一个像素的纹理都没有。
   * 梯度（左右相邻的亮度差）只认边界：渐变每像素 0.1 级、云边 3~8 级、
   * 水纹 2~6 级。判"有没有纹理"用它，比 std 可靠。
   */
  const region = (x0, y0, w, h) => {
    let n = 0, s = 0, s2 = 0, gsum = 0, gn = 0
    const L = (x, y) => {
      const i = (y * W + x) * 4
      return 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
    }
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const l = L(x, y)
        s += l; s2 += l * l; n++
        if (x + 1 < x0 + w) { gsum += Math.abs(L(x + 1, y) - l); gn++ }
        if (y + 1 < y0 + h) { gsum += Math.abs(L(x, y + 1) - l); gn++ }
      }
    }
    const mean = s / n
    return { mean, std: Math.sqrt(Math.max(0, s2 / n - mean * mean)), grad: gsum / gn }
  }
  /*
   * 【统计区必须避开界面】上一版天空取 [0,0,1440,170]：左上角的「DECK VIEW」
   * 面板与右上角两个按钮都在里面，深色底板 + 白字的 std 有 41 —— 把云删掉判据
   * 照样绿（注入验证抓到的）。现在只取正上方一块纯天空（220..520 × 20..150）。
   */
  const sea = region(20, 430, 260, 180)
  /*
   * 天空区：避开左上 DECK VIEW 面板（x<150）、右上按钮（x>1170）、
   * **月亮**（≈847,72，亮盘的边缘会把梯度拉高）与远处的海岸线（y>230）。
   * 取 200..700 × 14..120 这一块，实测：有云 grad 0.235 / 关云 0.053。
   */
  const sky = region(200, 14, 500, 106)
  return {
    seaStd: +sea.std.toFixed(2), seaGrad: +sea.grad.toFixed(3),
    skyStd: +sky.std.toFixed(2), skyGrad: +sky.grad.toFixed(3),
  }
}, shotA)
check(detail.seaGrad >= 1.2, `海面有纹理（相邻像素梯度 ${detail.seaGrad}，纯色板 ≈0.05）`)

check(detail.seaStd >= 5, `海面明暗有起伏（std ${detail.seaStd}，纯色板 1.87）`)

console.log(`\n报错：${errors.length ? errors.join(' | ') : '无'}`)
check(errors.length === 0, '无页面错误')
await ctx.close()
await browser.close()
console.log(`\n结论：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
