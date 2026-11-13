/**
 * 冷启动分解：从 navigationStart 到"地图可看"，时间都花在哪。
 *
 * 【为什么单独量】prod 实测冷启动到可交互 **6.6 秒**（本地 preview，不含网络延迟）。
 * 这比任何一次转场都长，而且每局必走一次。但"6.6 秒"是个总数，拆不开就没法动手：
 * 可能是 JS 下载/解析、可能是首屏渲染、可能是地图数据（geojson / 海陆掩码 / 贴图）。
 *
 * 三路取证：
 *   ① 资源时间线 —— 谁慢、多大（按 duration 排序）
 *   ② 长任务 —— 主线程被谁长时间占住（含起始时刻，能对上"哪个阶段"）
 *   ③ 关键节点 —— FCP / 首帧 / __mapStore 就绪 / 地图第一帧画完
 *
 * 跑法：`npx vite preview --port 5186 ...`（用 dist 真产物），再
 *      `GAME_URL=http://127.0.0.1:5186/Age-of-Discovery/ node test/e2e/probe-cold-start.mjs`
 */
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default } catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default }
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5186/Age-of-Discovery/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const b = await puppeteer.launch({ executablePath: EDGE, headless: true, protocolTimeout: 120000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const ctx = await b.createBrowserContext()
const page = await ctx.newPage()
await page.setViewport({ width: 1440, height: 900 })
/* 关掉缓存，保证每次都是真冷启动 */
await page.setCacheEnabled(false)

/*
 * 网络限速：本地跑在 0.1ms 的环回上，网络从来不是瓶颈 ——
 * 但玩家不是。用 CDP 模拟两档：
 *   fast4g：延迟 100ms、下行 1.5MB/s（≈12Mbps）
 *   slow4g：延迟 300ms、下行 400KB/s（≈3.2Mbps，地铁/电梯里的常见水准）
 * 【为什么必须配带 gzip 的静态服务】本地 preview 不压缩，会把数据成本高估 3 倍。
 * 用 test/e2e/serve-gzip.mjs 起服务再跑这个探针。
 */
const NET = (process.argv.find((a) => a.startsWith('--net=')) ?? '--net=none').split('=')[1]
const NET_PROFILES = {
  none: null,
  fast4g: { latency: 100, download: 1.5e6, upload: 7.5e5 },
  slow4g: { latency: 300, download: 4e5, upload: 2e5 },
}
const netProfile = NET_PROFILES[NET]
if (netProfile) {
  const c0 = await page.createCDPSession()
  await c0.send('Network.enable')
  await c0.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: netProfile.latency,
    downloadThroughput: netProfile.download,
    uploadThroughput: netProfile.upload,
  })
  console.log(`网络：${NET}（延迟 ${netProfile.latency}ms / 下行 ${(netProfile.download / 1024).toFixed(0)}KB/s）`)
} else {
  console.log('网络：不限速（环回）')
}
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 120000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.setCacheEnabled(false)

const cdp = await page.createCDPSession()
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await cdp.send('Profiler.start')
const t0 = Date.now()
await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 })
/*
 * 生产构建把调试钩子剥掉了，所以只能用**玩家真的看到的东西**判断就绪：
 * ① Leaflet 容器挂上（框架起来了）
 * ② 陆地多边形画出来 >100 个（地图真画了，不是空框）
 * 这比"__mapStore 存在"更贴近"可看"，而且在线上也能用。
 */
await page.waitForFunction(() => !!document.querySelector('.leaflet-container'), { timeout: 120000 })
const domMs = Date.now() - t0
await page.waitForFunction(
  () => document.querySelectorAll('.leaflet-overlay-pane path').length > 100,
  { timeout: 120000 },
)
const readyMs = Date.now() - t0
await sleep(3000)
console.log(`  容器挂上 ${domMs}ms；陆地画出来 ${readyMs}ms`)
/*
 * 符号是延后补上的（这是本次改动的目的），所以必须确认它**真的补上**了：
 * 地形层是一张整屏 canvas，数它的非透明像素。空画布 = 山树丢了。
 */
const tSym = Date.now()
let symPx = 0
for (let i = 0; i < 40 && symPx < 500; i++) {
  await sleep(250)
  symPx = await page.evaluate(() => {
    /* 必须精确定位到地形层：页面上还有风痕、夜色等别的 canvas，数错了会给出假结论 */
    const pane = document.querySelector('.leaflet-terrain-pane')
    const c = pane?.querySelector('canvas')
    if (!c || !c.width || !c.height) return 0
    const g = c.getContext('2d')
    if (!g) return 0
    const d = g.getImageData(0, 0, c.width, c.height).data
    let n = 0
    for (let k = 3; k < d.length; k += 4) if (d[k] > 0) n++
    return n
  })
}
console.log(`  地形符号补齐：${symPx} 个非透明像素（比地图晚 ${Date.now() - tSym}ms）`)

const { profile } = await cdp.send('Profiler.stop')
/*
 * 冷启动的自时间归因。
 * 【为什么要在这段窗口采样】从 load(189ms) 到"陆地画出来"(2.8s) 之间没有网络请求
 * 在等（TTFB 7ms），2.6 秒全在主线程上 —— 必须知道是解析、是建多边形、还是贴图解码。
 */
const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const self = new Map()
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i])
  if (!n) continue
  const f = n.callFrame
  const url = (f.url || '').replace(/^https?:\/\/[^/]+\/Age-of-Discovery\//, '')
  const key = `${f.functionName || '(anon)'}${url ? '  @' + url : ''}`
  self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas?.[i] ?? 0) / 1000)
}
const totalSelf = [...self.values()].reduce((s, v) => s + v, 0)
console.log(`\n冷启动窗口主线程采样合计 ${totalSelf.toFixed(0)}ms，按函数自时间（前 22）：`)
for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22)) {
  console.log(`  ${v.toFixed(0).padStart(5)}ms ${((v / totalSelf) * 100).toFixed(1).padStart(5)}%  ${k}`)
}

/*
 * 时间轴分箱：自时间总和会把"不同阶段"混在一起（同一个函数在首屏建一次、
 * 随后又被重画时再跑一次，名字一样、意义完全不同）。按 200ms 一格切开，
 * 能回答"哪一段在占主线程"。
 */
{
  const name = (n) => {
    const f = n.callFrame
    const url = (f.url || '').replace(/^https?:\/\/[^/]+\/Age-of-Discovery\//, '').split('/').pop() ?? ''
    return `${f.functionName || '(anon)'}${url ? '@' + url : ''}`
  }
  const binMs = 200
  const bins = new Map()
  let acc = 0
  for (let i = 0; i < profile.samples.length; i++) {
    const n = byId.get(profile.samples[i])
    const dt = (profile.timeDeltas?.[i] ?? 0) / 1000
    const t = acc + dt / 2
    acc += dt
    if (!n || dt <= 0) continue
    const k = Math.floor(t / binMs)
    const m = bins.get(k) ?? new Map()
    const nm = name(n)
    m.set(nm, (m.get(nm) ?? 0) + dt)
    bins.set(k, m)
  }
  console.log('\n时间轴（每 200ms 一格，只列该格自时间最长的 3 个）：')
  for (const k of [...bins.keys()].sort((a, b) => a - b)) {
    const m = bins.get(k)
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    const busy = [...m.values()].reduce((s, v) => s + v, 0)
    console.log(`  ${String(k * binMs).padStart(5)}ms 忙${busy.toFixed(0).padStart(4)}ms  ` + top.map(([n, v]) => `${n} ${v.toFixed(0)}`).join(' | '))
  }
}

const data = await page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0]
  const paints = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]))
  const res = performance.getEntriesByType('resource')
    .map((r) => ({
      name: r.name.replace(/^https?:\/\/[^/]+\/Age-of-Discovery\//, ''),
      ms: Math.round(r.duration),
      start: Math.round(r.startTime),
      // transferSize = 线上真实传输字节（压缩后 + 头）；decodedBodySize = 解压后
      kb: Math.round((r.decodedBodySize || r.transferSize || 0) / 1024),
      tkb: Math.round((r.transferSize || 0) / 1024),
      type: r.initiatorType,
    }))
    .sort((a, b) => b.ms - a.ms)
  return {
    nav: nav
      ? {
          ttfb: Math.round(nav.responseStart),
          dcl: Math.round(nav.domContentLoadedEventEnd),
          load: Math.round(nav.loadEventEnd),
          transferKB: Math.round((nav.transferSize || 0) / 1024),
          decodedKB: Math.round((nav.decodedBodySize || 0) / 1024),
        }
      : null,
    paints,
    totalKB: res.reduce((s, r) => s + r.kb, 0),
    totalTKB: res.reduce((s, r) => s + r.tkb, 0),
    top: res.slice(0, 16),
    dataByStart: res.filter((r) => r.type === 'fetch' || r.type === 'img' || r.type === 'xmlhttprequest')
      .sort((a, b) => a.start - b.start),
    byStart: res.slice().sort((a, b) => a.start - b.start).slice(0, 26),
    slowestTypes: [...res.reduce((m, r) => m.set(r.type, (m.get(r.type) ?? 0) + r.kb), new Map()).entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8),
  }
})

console.log(`\n冷启动：到 __mapStore 就绪 ${readyMs}ms`)
if (data.nav) {
  console.log(`  TTFB ${data.nav.ttfb}ms  DCL ${data.nav.dcl}ms  load ${data.nav.load}ms`)
  console.log(`  HTML 传输 ${data.nav.transferKB}KB / 解压 ${data.nav.decodedKB}KB`)
}
console.log(`  FCP ${data.paints['first-contentful-paint'] ?? '?'}ms  FP ${data.paints['first-paint'] ?? '?'}ms`)
console.log(`  资源总量 传输 ${data.totalTKB}KB / 解压 ${data.totalKB}KB  → 压缩率 ${(data.totalTKB / data.totalKB * 100).toFixed(0)}%`)

console.log('\n最慢的 16 个资源（传输 / 解压）：')
for (const r of data.top) {
  console.log(`  ${String(r.ms).padStart(5)}ms @${String(r.start).padStart(5)}  传${String(r.tkb).padStart(5)}KB 解${String(r.kb).padStart(5)}KB  ${r.type.padEnd(8)} ${r.name}`)
}

console.log('\n全部资源按**开始时刻**排（谁在抢带宽）：')
for (const r of data.byStart) {
  const mark = r.start > 0 ? '' : ''
  console.log(`  ${mark}@${String(r.start).padStart(5)}ms  传${String(r.tkb).padStart(5)}KB  ${r.type.padEnd(8)} ${r.name}`)
}

console.log('\n数据与图（fetch/img），按**开始时刻**排 —— 谁挡在首屏前面：')
for (const r of data.dataByStart) {
  console.log(`  @${String(r.start).padStart(5)}ms  传${String(r.tkb).padStart(5)}KB 解${String(r.kb).padStart(5)}KB  ${r.type.padEnd(6)} ${r.name}`)
}

console.log('\n按类型（解压后 KB）：')
for (const [k, v] of data.slowestTypes) console.log(`  ${String(v).padStart(6)}KB  ${k}`)

await b.close()
