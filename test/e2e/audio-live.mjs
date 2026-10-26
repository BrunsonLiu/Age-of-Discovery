/**
 * 音频实跑验证：在真实浏览器里检查玩家实际听到的那条链路。
 *
 * 关键：用 window.__audio / window.__bgm 调试钩子（dev 构建暴露），
 * 而不是重新 import 模块——Vite 的 HMR 时间戳会让脚本 import 出
 * 另一个模块实例（各自的 ctx / bus 互相隔离），导致假阴性。
 *
 * 检查项：
 *   1. 用户交互后 AudioContext 是否 running
 *   2. BGM 调度器是否在跑（barIndex 递增）
 *   3. BGM 总线是否有真实能量（AnalyserNode 采样）
 *   4. 音效是否有真实能量
 *   5. 情绪是否跟着游戏状态切换
 *   6. 总开关是否真的静音
 */
import puppeteer from 'puppeteer-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL || 'http://127.0.0.1:5174/Age-of-Discovery/'

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 600))

const fails = []
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? '  ' + detail : ''}`)
  if (!ok) fails.push(label)
}

console.log('═══ 音频实跑验证（真实运行实例）═══\n')

// —— 0. 钩子存在性 ——
const hooks = await page.evaluate(() => ({
  audio: !!window.__audio,
  bgm: !!window.__bgm,
}))
check(hooks.audio && hooks.bgm, '调试钩子已暴露', `(audio=${hooks.audio} bgm=${hooks.bgm})`)

// —— 1. 用户交互前：不应有声音（自动播放策略）——
const before = await page.evaluate(() => ({
  ctx: window.__audio.getContext()?.state ?? 'none',
  running: window.__bgm.isRunning(),
}))
check(before.ctx === 'none' || before.ctx === 'suspended',
  '交互前不自动播放', `ctx=${before.ctx} bgm=${before.running}`)

// —— 2. 真实点击启动 ——
await page.mouse.click(720, 480)
await new Promise((r) => setTimeout(r, 1600))

const started = await page.evaluate(() => ({
  ctx: window.__audio.getContext()?.state ?? 'none',
  running: window.__bgm.isRunning(),
  mood: window.__bgm.getMood(),
  barIndex: window.__bgm.getBarIndex(),
  master: window.__audio.getMasterGain()?.gain.value ?? 0,
  ambienceRunning: window.__audio.isRunning(),
}))
console.log(`\n① 点击后：ctx=${started.ctx} bgm运行=${started.running} 情绪=${started.mood} 小节=${started.barIndex} 主音量=${started.master.toFixed(3)}`)
check(started.ctx === 'running', 'AudioContext 已 running')
check(started.running, 'BGM 调度器已启动')
check(started.barIndex > 0, 'BGM 已排定并推进小节', `barIndex=${started.barIndex}`)
check(started.master > 0.05, '主音量已抬起', `${started.master.toFixed(3)}`)

// —— 3. BGM 总线能量实测 ——
const bgmEnergy = await page.evaluate(async () => {
  const bus = window.__audio.getBgmBus()
  const ctx = window.__audio.getContext()
  const an = ctx.createAnalyser()
  an.fftSize = 2048
  bus.connect(an)
  const buf = new Float32Array(an.fftSize)
  let peak = 0
  let sum = 0
  let n = 0
  const t0 = performance.now()
  while (performance.now() - t0 < 1200) {
    an.getFloatTimeDomainData(buf)
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i])
      if (v > peak) peak = v
      sum += buf[i] * buf[i]
      n++
    }
    await new Promise((r) => setTimeout(r, 20))
  }
  return { peak: +peak.toFixed(5), rms: +Math.sqrt(sum / n).toFixed(6) }
})
console.log(`\n② BGM 总线能量：峰值 ${bgmEnergy.peak}  RMS ${bgmEnergy.rms}`)
check(bgmEnergy.peak > 0.002, 'BGM 总线有真实能量')

// —— 4. 音效能量实测（走 sfxBus）——
// 必须用真实实例：import 出来的副本 playCue 会作用在另一个模块的 sfxBus 上，
// 原实例根本收不到声音。
const sfxEnergy = await page.evaluate(async () => {
  const bus = window.__audio.getSfxBus()
  const ctx = window.__audio.getContext()
  const an = ctx.createAnalyser()
  an.fftSize = 2048
  bus.connect(an)
  const buf = new Float32Array(an.fftSize)
  let peak = 0
  // 用钩子触发音效，避免 import 副本实例（副本的 playCue 作用在另一个 sfxBus 上）
  for (let round = 0; round < 3; round++) {
    window.__audio.playCue('cannon')
    const t0 = performance.now()
    while (performance.now() - t0 < 350) {
      an.getFloatTimeDomainData(buf)
      for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]))
      await new Promise((r) => setTimeout(r, 10))
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return { peak: +peak.toFixed(5) }
})
console.log(`   音效总线峰值：${sfxEnergy.peak}`)
check(sfxEnergy.peak > 0.002, '音效总线有真实能量')

// —— 5. 情绪跟随游戏状态 ——
console.log('\n③ 情绪跟随游戏状态')
const moodTrace = await page.evaluate(async () => {
  const g = window.__gameStore
  const trace = []
  const snap = (label) => trace.push({ label, mood: window.__bgm.getMood() })

  snap('初始(港口)')

  const evmod = await import('/Age-of-Discovery/src/data/events.ts')
  const ev = evmod.events.find((e) => e.sceneKey === 'storm')
  g.getState().setCurrentEvent(ev)
  await new Promise((r) => setTimeout(r, 500))
  snap('事件中')

  g.getState().clearCurrentEvent()
  await new Promise((r) => setTimeout(r, 500))
  snap('事件关闭')

  g.setState({ fleet: { ...g.getState().fleet, isSailing: true, currentPortId: null } })
  await new Promise((r) => setTimeout(r, 500))
  snap('航行中')

  g.setState({ weather: { ...g.getState().weather, kind: 'storm' } })
  await new Promise((r) => setTimeout(r, 500))
  snap('航行+暴风雨')

  g.setState({
    fleet: { ...g.getState().fleet, isSailing: false, currentPortId: 1 },
    weather: { ...g.getState().weather, kind: 'clear' },
  })
  await new Promise((r) => setTimeout(r, 500))
  snap('港口+晴天')

  return trace
})
for (const t of moodTrace) console.log(`   ${t.label.padEnd(14)} → ${t.mood}`)
const mEvent = moodTrace.find((t) => t.label === '事件中')?.mood
const mSail = moodTrace.find((t) => t.label === '航行中')?.mood
const mStorm = moodTrace.find((t) => t.label === '航行+暴风雨')?.mood
const mCalm = moodTrace.find((t) => t.label === '港口+晴天')?.mood
check(mEvent === 'event', '事件 → event 情绪', `实得 ${mEvent}`)
check(mSail === 'sail', '航行 → sail 情绪', `实得 ${mSail}`)
check(mStorm === 'storm', '暴风雨 → storm 情绪', `实得 ${mStorm}`)
check(mCalm === 'calm', '港口晴天 → calm 情绪', `实得 ${mCalm}`)

// —— 6. 总开关确实静音 ——
console.log('\n④ 总开关')
const mute = await page.evaluate(async () => {
  // 注意：必须用真实实例（window.__audio），不能用 import 出来的副本——
  // HMR 时间戳会让 import 拿到另一个模块实例，改动不生效还会造成误判。
  const master = window.__audio.getMasterGain()
  const ctx = window.__audio.getContext()
  const an = ctx.createAnalyser()
  an.fftSize = 2048
  master.connect(an)
  const buf = new Float32Array(an.fftSize)
  async function peakOver(ms) {
    let p = 0
    const t0 = performance.now()
    while (performance.now() - t0 < ms) {
      an.getFloatTimeDomainData(buf)
      for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]))
      await new Promise((r) => setTimeout(r, 16))
    }
    return +p.toFixed(5)
  }
  const on = await peakOver(2500)
  const masterAfterOn = +master.gain.value.toFixed(4)
  // 通过 UI 按钮操作总开关（走真实玩家路径），而不是直接调函数
  const btn = [...document.querySelectorAll('button')].find((b) => /关闭声音|开启声音/.test(b.getAttribute('aria-label') || ''))
  if (btn) btn.click()
  await new Promise((r) => setTimeout(r, 1400))
  const off = await peakOver(1500)
  const masterAfterOff = +master.gain.value.toFixed(4)
  const btn2 = [...document.querySelectorAll('button')].find((b) => /关闭声音|开启声音/.test(b.getAttribute('aria-label') || ''))
  if (btn2) btn2.click()
  await new Promise((r) => setTimeout(r, 1400))
  const back = await peakOver(2500)
  return { on, off, back, masterAfterOn, masterAfterOff, btnFound: !!btn }
})
console.log(`   开启 ${mute.on} → 关闭 ${mute.off} → 再开启 ${mute.back}`)
console.log(`   （master: 采样时 ${mute.masterAfterOn} → 关闭后 ${mute.masterAfterOff}；按钮找到=${mute.btnFound}）`)
check(mute.on > 0.002, '开启时主输出有声', `${mute.on}`)
check(mute.off < 0.002, '关闭后主输出静音', `${mute.off}`)
check(mute.back > 0.002, '重新开启后声音恢复', `${mute.back}`)

console.log(`\n控制台错误：${errors.length} 条`)
if (errors.length) console.log(errors.slice(0, 5).join('\n'))

console.log(`\n结论：${fails.length === 0 && errors.length === 0 ? '✓ 全部通过' : '✗ 失败 ' + fails.length + ' 项' + (errors.length ? '，另有 ' + errors.length + ' 条控制台错误' : '')}`)
await browser.close()
process.exit(fails.length === 0 && errors.length === 0 ? 0 : 1)
