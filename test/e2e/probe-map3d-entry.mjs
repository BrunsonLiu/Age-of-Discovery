/**
 * 剖析「切到 3D 海图」那一下的主线程阻塞（实测生产路径 2269ms，长任务合计 3486ms）。
 *
 * 这是玩家最常点的转场（右上角「3D 海图」），比上甲板更常走 ——
 * 稳态 60fps 与它无关，卡就卡在这一下。
 *
 * 跑法：dev 起 5174 直接跑；或 VITE_PROBE=1 构建后用 GAME_URL 指向 preview。
 */
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default } catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default }
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: EDGE, headless: true, protocolTimeout: 180000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const p = await (await b.createBrowserContext()).newPage()
await p.setViewport({ width: 1440, height: 900 })
await p.goto(BASE, { waitUntil: 'networkidle2', timeout: 90000 })
await p.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await p.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await p.waitForFunction(() => !!window.__mapStore, { timeout: 60000 })
await p.evaluate(() => window.__gameStore.getState().initGame('ming'))
await sleep(2500)

const cdp = await p.createCDPSession()
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await cdp.send('Profiler.start')
await p.evaluate(() => window.__mapStore.getState().setRenderMode('3d'))
await p.waitForFunction(() => !!window.__map3d, { timeout: 90000 }).catch(() => {})
await sleep(4000)
const { profile } = await cdp.send('Profiler.stop')

const byId = new Map(profile.nodes.map((n) => [n.id, n]))
const self = new Map()
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i])
  if (!n) continue
  const f = n.callFrame
  const url = (f.url || '').replace(/^https?:\/\/[^/]+/, '')
  const key = `${f.functionName || '(anon)'}${url ? '  @' + url.split('/').slice(-2).join('/') : ''}`
  self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas?.[i] ?? 0) / 1000)
}
const total = [...self.values()].reduce((s, v) => s + v, 0)
console.log(`\n切到 3D 全过程采样合计 ${total.toFixed(0)}ms，按函数自时间：`)
for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24)) {
  console.log(`  ${v.toFixed(0).padStart(5)}ms ${((v / total) * 100).toFixed(1).padStart(5)}%  ${k}`)
}
await b.close()
