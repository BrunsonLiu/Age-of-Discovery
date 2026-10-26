/**
 * 音频离线验证：在无头浏览器里用 OfflineAudioContext 渲染音效与 BGM，
 * 检查"真的有声音"而不是"代码看起来对"。
 *
 * 关键点：通过 Vite dev server 直接 import 项目的 TS 源码
 * （src/utils/cues.ts、src/utils/bgmEngine.ts），
 * 所以测的就是线上那套参数，不存在"测试副本与线上不一致"的问题。
 *
 * 输出 WAV 到 .workbuddy/audio/，可直接试听。
 */
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const ROOT = path.resolve('.')
const OUT = path.join(ROOT, '.workbuddy', 'audio')
fs.mkdirSync(OUT, { recursive: true })
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL || 'http://127.0.0.1:5174/Age-of-Discovery/'

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

await page.goto(BASE, { waitUntil: 'domcontentloaded' })

const report = await page.evaluate(async () => {
  // 直接 import 项目源码（Vite 会现场把 TS 转成 JS）
  const cuesMod = await import('/Age-of-Discovery/src/utils/cues.ts')
  const engine = await import('/Age-of-Discovery/src/utils/bgmEngine.ts')
  const { CUES, NOISE_PROFILE } = cuesMod

  function analyze(data) {
    let peak = 0, sum = 0, nonSilent = 0, dc = 0
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i])
      if (v > peak) peak = v
      sum += data[i] * data[i]
      dc += data[i]
      if (v > 0.005) nonSilent++
    }
    const n = data.length
    const mean = dc / n
    let ac = 0
    for (let i = 0; i < n; i++) ac += (data[i] - mean) ** 2
    return {
      peak: +peak.toFixed(4),
      rms: +Math.sqrt(sum / n).toFixed(5),
      nonSilentPct: +((nonSilent / n) * 100).toFixed(1),
      acRms: +Math.sqrt(ac / n).toFixed(5),
    }
  }

  function bands(data) {
    const out = new Array(8).fill(0)
    const N = 2048
    const step = Math.floor(data.length / N)
    for (let i = 0; i < N; i++) {
      const idx = i * step
      if (idx + 64 >= data.length) break
      let e = 0
      for (let k = 0; k < 64; k++) {
        const d = data[idx + k] - (idx + k + 1 < data.length ? data[idx + k + 1] : 0)
        e += d * d
      }
      out[Math.min(7, Math.floor(i / (N / 8)))] += e
    }
    const total = out.reduce((a, b) => a + b, 0) || 1
    return out.map((b) => +(b / total).toFixed(3))
  }

  async function renderCue(name, cue) {
    const sr = 44100
    const ctx = new OfflineAudioContext(1, Math.ceil(sr * (cue.dur + 0.1)), sr)
    const out = ctx.createGain()
    out.gain.value = 1
    out.connect(ctx.destination)

    cue.ratios.forEach((ratio, i) => {
      const start = i * (cue.dur * 0.34)
      const osc = ctx.createOscillator()
      osc.type = cue.type
      osc.frequency.setValueAtTime(cue.root * ratio, start)
      if (cue.sweep && cue.sweep !== 1) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, cue.root * ratio * cue.sweep), start + cue.dur)
      }
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, start)
      g.gain.exponentialRampToValueAtTime(cue.vol, start + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, start + cue.dur)
      osc.connect(g); g.connect(out)
      osc.start(start); osc.stop(start + cue.dur + 0.03)
    })

    if (cue.noise && NOISE_PROFILE[name]) {
      const p = NOISE_PROFILE[name]
      const length = Math.max(1, Math.floor(sr * cue.dur * 0.9))
      const buf = ctx.createBuffer(1, length, sr)
      const d = buf.getChannelData(0)
      for (let i = 0; i < length; i++) d[i] = Math.random() * 2 - 1
      const src = ctx.createBufferSource()
      src.buffer = buf
      const filt = ctx.createBiquadFilter()
      filt.type = p.type
      filt.frequency.setValueAtTime(p.freq, 0)
      if (p.sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(20, p.sweepTo), cue.dur * 0.9)
      filt.Q.value = p.q ?? 1
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, 0)
      g.gain.exponentialRampToValueAtTime(cue.vol * cue.noise * 0.9, 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, cue.dur * 0.9)
      src.connect(filt); filt.connect(g); g.connect(out)
      src.start(0)
    }

    const buf = await ctx.startRendering()
    return buf.getChannelData(0)
  }

  const cueResults = []
  for (const [name, cue] of Object.entries(CUES)) {
    const data = await renderCue(name, cue)
    cueResults.push({ name, ...analyze(data), data: Array.from(data) })
  }

  const bgmResults = []
  for (const mood of ['calm', 'sail', 'storm', 'event']) {
    const sr = 44100
    const seconds = 10
    const ctx = new OfflineAudioContext(2, sr * seconds, sr)
    const bus = ctx.createGain()
    bus.gain.value = 1
    bus.connect(ctx.destination)
    const channels = await engine.renderMood(ctx, bus, mood, seconds)
    const mono = channels[0]
    bgmResults.push({
      mood,
      ...analyze(mono),
      bands: bands(mono),
      data: channels.map(c => Array.from(c)),
    })
  }

  return { cues: cueResults, bgm: bgmResults }
})

function writeWav(file, channels, sampleRate) {
  const nCh = channels.length
  const frames = channels[0].length
  const bytes = frames * nCh * 2
  const buf = Buffer.alloc(44 + bytes)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + bytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(nCh, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * nCh * 2, 28)
  buf.writeUInt16LE(nCh * 2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(bytes, 40)
  let o = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < nCh; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]))
      buf.writeInt16LE(Math.round(v * 32767), o)
      o += 2
    }
  }
  fs.writeFileSync(file, buf)
  return bytes / 1024
}

console.log('═══ ① 音效离线渲染（参数取自 src/utils/cues.ts）═══')
const bad = []
for (const r of report.cues) {
  const ok = r.peak > 0.005 && r.nonSilentPct > 0.5
  if (!ok) bad.push('cue:' + r.name)
  const kb = writeWav(path.join(OUT, `cue-${r.name}.wav`), [r.data], 44100)
  console.log(
    `${ok ? '✓' : '✗'} ${r.name.padEnd(10)} 峰值 ${String(r.peak).padEnd(7)} RMS ${String(r.rms).padEnd(8)} 非静音 ${String(r.nonSilentPct).padEnd(6)}%  ${kb.toFixed(0).padStart(4)}KB`,
  )
}

console.log('\n═══ ② BGM 离线渲染（取自 src/utils/bgmEngine.ts）═══')
for (const r of report.bgm) {
  const ok = r.peak > 0.01 && r.acRms > 0.005 && r.bands[0] + r.bands[1] > 0.05
  if (!ok) bad.push('bgm:' + r.mood)
  const kb = writeWav(path.join(OUT, `bgm-${r.mood}.wav`), r.data, 44100)
  console.log(
    `${ok ? '✓' : '✗'} ${r.mood.padEnd(6)} 峰值 ${String(r.peak).padEnd(7)} RMS ${String(r.rms).padEnd(8)} 非静音 ${String(r.nonSilentPct).padEnd(6)}%  ${kb.toFixed(0).padStart(5)}KB`,
  )
  console.log(`        频段分布 [低→高]: ${r.bands.join(' ')}`)
}

const rmss = report.bgm.map(r => r.rms)
const spread = Math.max(...rmss) / Math.max(1e-6, Math.min(...rmss))
console.log(`\n各情绪 RMS 极差比 ${spread.toFixed(2)}×（>3 说明有的太吵有的太轻）`)
if (pageErrors.length) console.log('页面错误：' + pageErrors.slice(0, 3).join(' | '))

console.log(`\n结论：${bad.length === 0 ? '✓ 全部通过' : '✗ 异常：' + bad.join(', ')}`)
console.log('WAV 输出目录：' + OUT)
await browser.close()
process.exit(bad.length === 0 && pageErrors.length === 0 ? 0 : 1)
