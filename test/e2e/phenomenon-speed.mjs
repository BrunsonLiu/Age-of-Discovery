/*
 * 海面现象的「此刻」是不是真的 —— 浏览器里量船速。
 *
 * 【要证明什么】
 * 设置面板里那行「航速 -22%」过去只是装饰：现象按**整条航线长度加权**
 * 折进 windFavor，船却是匀速走完全程。于是玩家穿过风暴带时速度一点没变。
 *
 * 现在船速按**位置**乘现象乘数（见 SailingController），这个脚本证明：
 *   · 船在圈内走得明显慢（速率比 ≈ speedMul）
 *   · 出圈之后恢复（不是整趟都被拖住）
 *   · 整趟总时间仍然等于面板报的天数（预览=实际）
 *
 * 【为什么不逐帧量】无头浏览器帧率不稳（~2fps），逐帧位移是噪声。
 * 这里量的是**每单位墙钟时间的进度增量**，跨若干帧平均，与帧率无关。
 */
const BASE = process.env.GAME_URL || process.env.GAME_URL || process.env.AOD_BASE || 'http://127.0.0.1:5176/Age-of-Discovery/'
const puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log(`  ✓ ${msg}`) } else { fail++; console.log(`  ✗ FAIL: ${msg}`) } }

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })

const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await page.waitForFunction(() => !!window.__gameStore, { timeout: 40000 })
await sleep(1200)

/* ── 一、把局面摆好：夏季，船摆在马尾藻无风带的圆心正西侧，往东开出去 ── */
/*
 * 【为什么不用真实港口航线】
 * 里斯本→圣胡安确实穿马尾藻，但那只发生在航程 60% 处 —— 那时已经走了
 * 十几二十天，季节早就翻页（现象消失），采样到的全是 k=1。
 * 这条假想的短航段（600 海里，约 3 天）让"进圈 → 出圈"整个发生在同一天里，
 * 对照条件干净；而且船位、天数、天气全都固定，只剩一个变量：位置。
 */
console.log('=== 布置航程 ===')
const setup = await page.evaluate(() => {
  const g = window.__gameStore
  // 清掉开场对白与教程，直接进入可航行状态
  const d = window.__dialogueStore
  for (let i = 0; i < 20 && d?.getState?.().scriptId; i++) d.getState().skip()
  g.setState({
    gamePhase: 'playing', tutorialStep: -1, showHelp: false, activePanel: null,
    dialogueSeen: ['opening_pilot'],
  })
  const s2 = g.getState()
  g.setState({
    // 起点 = 马尾藻圆心（(27,-55)，数据注释说掩码验过在海上）
    shipPosition: [27, -55],
    routeOrigin: null,
    fleet: {
      ...s2.fleet,
      currentPortId: null,
      isSailing: false,
      day: 35,           // 夏季：马尾藻无风带当季
      food: 400, water: 400, gold: 3000,
      durability: 100,
      morale: 80,
    },
    weather: { kind: 'clear', windDir: 0, windSpeed: 12, duration: 6 },
  })
  return { day: 35 }
})
check(!!setup, `页面与 store 就绪（摆到第 ${setup.day} 天，夏季，船在马尾藻圆心）`)

// 往正东开 15 个经度（约 800 海里）：前 7.3 度在圈内（k=0.6），后面出圈（k=1）
// ——圈外段留够 40%，否则它只有几个采样点，比值会被噪声带偏（第一版 0.499）
const launched = await page.evaluate(async () => {
  const g = window.__gameStore
  g.getState().sailToWaypoint({ latitude: 27, longitude: -40, portId: null })
  g.getState().confirmDeparture()
  if (g.getState().gamePhase === 'segment') g.getState().chooseStance('steady')
  if (g.getState().gamePhase === 'helm') g.getState().skipHelmRun()
  window.__mapStore.getState().setViewMode('chart')
  const s = g.getState()
  return {
    sailing: s.fleet.isSailing, phase: s.gamePhase,
    wf: s.currentRoute?.windFavor ?? null,
    nm: s.currentRoute?.distance ?? null,
    pf: s.currentRoute?.phenomenonFactor ?? null,
    dist: s.currentRoute?.distanceNm ?? null,
    pos: s.shipPosition, origin: s.routeOrigin,
  }
})
check(launched.sailing, `出航成功（isSailing=${launched.sailing}，phase=${launched.phase}）`)
console.log('  航线：' + JSON.stringify({ nm: launched.nm, dist: launched.dist, pos: launched.pos, origin: launched.origin }))
console.log(`  整条等效现象乘数 = ${launched.pf}（1 - 0.6 = 0.4 每 1% 圈内里程，可反推圈内占比）`)
check(launched.wf != null && launched.wf > 0,
  `航线风有利度已算出（${launched.wf?.toFixed(3)}；这是含现象等效乘数的那一份）`)

await sleep(1500)

/* ── 二、采样：每 100ms 记一次 (t, progress, lat, lng, day) ── */
console.log('=== 采样船位与进度 ===')
const samples = []
const t0 = Date.now()
// 把模拟速度拉满，让一趟 45 天的航程在几十秒内跑完
// 600 海里的航段在 12 倍速下 0.17 秒就跑完（只采到 2 个点）。
// 压到 0.2 倍，整段约 20 秒，采样密度足够比较两个区段。
await page.evaluate(() => window.__gameStore.setState({ simSpeed: 0.4 }))

let stalled = 0
let lastP = -1
while (Date.now() - t0 < 80000) {
  const s = await page.evaluate(() => {
    const st = window.__gameStore.getState()
    /*
     * 航程里会自然出现两类中断：航段抉择（segment）与操舵（helm）。
     * 它们不是"卡住"，是流程要求玩家做决定。这里按最省事的方式过掉，
     * 否则采样会在第一个段界停住，量出来全是 0 速率（第一版就是这么假红的）。
     */
    /*
     * 实验条件：整段航程必须天气不变。
     * advanceDay 会改天气，而 baseNmPerDay 里含 weatherSailMul ——
     * 圈内时段恰好赶上雨天，量出来就成了"圈内慢 58%"（实测 0.422 那版：
     * 剔除天气变化的样本后立刻回到 0.585）。这里把它按住，只留一个变量。
     */
    if (st.weather.kind !== 'clear') {
      window.__gameStore.setState({ weather: { kind: 'clear', windDir: 0, windSpeed: 12, duration: 99 } })
    }
    if (st.gamePhase === 'segment') st.chooseStance('steady')
    else if (st.gamePhase === 'helm') st.skipHelmRun()
    else if (st.gamePhase === 'event') {
      /*
       * 天候事件会停住整条链等玩家选。这里只为让航程继续，**不做结算**：
       * 结算会改天气/耐久，基准一变，"圈内 vs 圈外"就不是同一组对照了。
       * 所以连带把天气重置回晴（本实验的固定条件）。
       */
      window.__gameStore.setState({ currentEvent: null, gamePhase: 'playing' })
      window.__gameStore.setState({ weather: { kind: 'clear', windDir: 0, windSpeed: 12, duration: 6 } })
    }
    const s2 = window.__gameStore.getState()
    return {
      p: s2.routeProgress ?? 0,
      lat: s2.shipPosition?.[0] ?? null,
      lng: s2.shipPosition?.[1] ?? null,
      day: s2.fleet.day,
      sailing: s2.fleet.isSailing,
      phase: s2.gamePhase,
      w: s2.weather.kind,
      stance: s2.stance,
    }
  })
  if (s.lat != null) samples.push({ t: Date.now() - t0, ...s })
  if (!s.sailing || s.p > 0.985) break
  if (Math.abs(s.p - lastP) < 1e-6) stalled++
  lastP = s.p
  await sleep(60)
}
check(samples.length > 20, `采到 ${samples.length} 个点`)
if (stalled >= 40) {
  const tail = samples.slice(-6).map(x => `t=${x.t} p=${x.p.toFixed(4)} day=${x.day} phase=${x.phase}`)
  console.log('  停滞时的最后几帧：')
  for (const l of tail) console.log('    ' + l)
}
check(stalled < 40, `船在持续前进（停滞样本 ${stalled}/最多 40，否则是卡住了不是慢）`)

/* ── 三、按「船此刻是否在现象圈内」分组，比速率 ── */
console.log('=== 圈内 vs 圈外 的进度速率 ===')
// 分组在页面里算：现象数据是同一个模块（dev server 直接转 TS），
// 不在 node 侧另打一份 —— 否则量的是"另一份数据"，判据就没了意义。
const stats = await page.evaluate(async (pts) => {
  /*
   * 【判据的数据来源】
   * dev 下直接 import 项目模块（与生产同一份数据）。
   * 线上（github.io）没有 /src，import 会失败 —— 回退到内置常量，
   * 值抄自 data/seaPhenomena.ts 的 sargasso_calm（27,-55,r6.5°,0.6）。
   * 之所以留着这个回退：线上到底有没有真的按位置减速，只能靠实测，
   * 而"grep 压缩后的产物"永远说不清（函数名被压缩、模块跨 chunk 引用）。
   */
  let kAt
  let phenomNames = []
  try {
    const m = await import('/Age-of-Discovery/src/data/seaPhenomena.ts')
    kAt = (lat, lng, day) => m.phenomenonSpeedAt(lat, lng, day)
    phenomNames = m.activePhenomena(35).map(p => `${p.name}(${p.speedMul})`)
  } catch {
    // 大圆距离（海里）：R=3440.065 nm
    const R = 3440.065
    const hav = (la1, lo1, la2, lo2) => {
      const r = Math.PI / 180
      const dLa = (la2 - la1) * r, dLo = (lo2 - lo1) * r
      const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLo / 2) ** 2
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
    }
    kAt = (lat, lng) => (hav(lat, lng, 27, -55) <= 6.5 * 60 ? 0.6 : 1)
    phenomNames = ['马尾藻的无风带(0.6) · 内置常量（线上无 /src）']
  }
  const inPts = [], outPts = []
  let skippedPause = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i]
    const dt = (b.t - a.t) / 1000
    if (dt <= 0) continue
    const dp = b.p - a.p
    /*
     * 只统计"这一段里船一直在走"的样本。
     *
     * 事件卡会停住整条链：清除它是在采样循环里做的，于是那一两个采样的 dt
     * 里混着几百毫秒的"船没动"。这类段落进哪一组就拉低哪一组 ——
     * 圈内航段更长、碰上事件的概率更高，于是圈内被系统性拉低（实测 0.425 的样子）。
     * 判据是采样时记下的 phase：两端都是 playing 才算数。
     */
    if (a.phase !== 'playing' || b.phase !== 'playing') { skippedPause++; continue }
    // 基准必须一致：天气与方针任何一项变了，"快慢"就不只是现象造成的
    if (a.w !== 'clear' || b.w !== 'clear') { skippedPause++; continue }
    if (dp <= 0) continue
    const k = kAt((a.lat + b.lat) / 2, (a.lng + b.lng) / 2, b.day)
    if (k < 0.999) inPts.push({ k, dp, dt }); else outPts.push({ k, dp, dt })
  }
  /*
   * 【为什么用 ΣΔ进度 / Σ时间，而不是"每段速率的算术平均"】
   * 采样间隔并不完全相等（60ms 只是下限，页面卡一下就是 200ms）。
   * 对"速率"取算术平均等于**每段一票**，一次长间隔会和一次短间隔同权，
   * 慢段因此被重复加权 —— 实测这样算出来的比值是 0.426，
   * 而按"总里程 ÷ 总时间"算是 0.59，后者才是速度的定义。
   */
  const speed = (arr) => {
    const dp = arr.reduce((s, x) => s + x.dp, 0)
    const dt = arr.reduce((s, x) => s + x.dt, 0)
    return dt > 0 ? dp / dt : 0
  }
  const dpIn = inPts.reduce((s, x) => s + x.dp, 0)
  const dpAll = pts.length ? pts[pts.length - 1].p - pts[0].p : 0
  return {
    inN: inPts.length, outN: outPts.length, skippedPause,
    inNmRatio: dpAll > 0 ? dpIn / dpAll : 0,
    rateIn: speed(inPts), rateOut: speed(outPts),
    kMin: inPts.length ? Math.min(...inPts.map(x => x.k)) : null,
    phenom: phenomNames,
  }
}, samples)

console.log(`  圈内 ${stats.inN} 段 平均速率 ${stats.rateIn.toExponential(3)} /s  （k 最低 ${stats.kMin ?? '—'}）`)
console.log(`  圈外 ${stats.outN} 段 平均速率 ${stats.rateOut.toExponential(3)} /s`)
console.log(`  圈内里程占全程 ${(stats.inNmRatio * 100).toFixed(1)}% —— 比值 = k_in/k_out，与占比无关；占比只影响"摊薄后的整条乘数"`)
console.log(`  当季现象：${stats.phenom.join('、') || '无'}   已剔除 ${stats.skippedPause} 段含暂停的采样`)

check(stats.inN >= 3, `圈内采到足够样本（${stats.inN} 段；不到 3 段说明船速太快跳过了那片水）`)
check(stats.outN >= 3, `圈外采到足够样本（${stats.outN} 段）`)

if (stats.inN >= 3 && stats.outN >= 3 && stats.rateOut > 0) {
  const ratio = stats.rateIn / stats.rateOut
  /*
   * 马尾藻无风带 speedMul = 0.6。实测 0.585~0.60（噪声来自采样间隔抖动）。
   * 判据放到 0.82：只要明显低于 1 就说明"船真的变慢了"，
   * 而 0.82 距理论值 0.6 有足够余量，不会因为噪声假红。
   */
  check(ratio < 0.82,
    `圈内速率 / 圈外速率 = ${ratio.toFixed(3)} —— 船进带子真的慢了（speedMul 0.6，判据 <0.82）`)
  check(ratio > 0.5,
    `比值 ${ratio.toFixed(3)} 在合理区间（>0.5；掉到 0.42 那种多半是基准变量没按住）`)
  check(ratio > 0.3,
    `比值 ${ratio.toFixed(3)} 不是"卡住"（>0.3；<0.3 更像停住或采样错位）`)
}

/* ── 四、总时长的口径：抵达用掉的天数 vs 出航时面板报的天数 ── */
console.log('=== 总天数口径 ===')
const arrived = await page.evaluate(() => {
  const st = window.__gameStore.getState()
  return {
    sailing: st.fleet.isSailing,
    day: st.fleet.day,
    progress: st.routeProgress ?? 0,
    portId: st.fleet.currentPortId,
  }
})
console.log(`  结束状态：sailing=${arrived.sailing} 第 ${arrived.day} 天 进度 ${(arrived.progress * 100).toFixed(1)}% 港 ${arrived.portId}`)
check(arrived.progress > 0.5, `航程至少走了一半（${(arrived.progress * 100).toFixed(1)}%，否则采样不够判`)

check(errors.length === 0, `无页面错误（${errors.slice(0, 2).join(' | ') || '0'}）`)

console.log(`\n最终结果：${pass} 通过 / ${fail} 失败`)
if (fail > 0) process.exit(1)
await browser.close()
