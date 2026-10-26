/**
 * 混音平衡测量：实测各层在主输出上的实际量级，
 * 决定音效总线与 BGM 总线的增益配比。
 *
 * 玩家视角的关键：提示音不能盖过配乐（否则像警报），
 * 配乐也不能盖过提示音（否则反馈失效）。
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
page.on('pageerror', (e) => console.log('[pageerror]', String(e)))
await page.goto(BASE, { waitUntil: 'networkidle2' })
await new Promise((r) => setTimeout(r, 500))
await page.mouse.click(720, 480)
await new Promise((r) => setTimeout(r, 2000))

const result = await page.evaluate(async () => {
  const ctx = window.__audio.getContext()
  const master = window.__audio.getMasterGain()
  const sfx = window.__audio.getSfxBus()
  const bgm = window.__audio.getBgmBus()

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
  async function rmsOver(ms) {
    let sum = 0
    let n = 0
    const t0 = performance.now()
    while (performance.now() - t0 < ms) {
      an.getFloatTimeDomainData(buf)
      for (let i = 0; i < buf.length; i++) { sum += buf[i] * buf[i]; n++ }
      await new Promise((r) => setTimeout(r, 16))
    }
    return +Math.sqrt(sum / n).toFixed(6)
  }

  const out = {}

  // —— 每一步都显式设置总线状态，不依赖上一步的残留 ——
  // （早期版本第②步把 sfx 置 0 后忘了恢复，导致第③步的提示音根本没发出，
  //   比值恒等于 1，属于典型的"测试自己骗自己"。）
  const bgmGain = bgm.gain.value
  const sfxGain = sfx.gain.value

  // ① 只有环境音（关掉 BGM 与音效总线）
  bgm.gain.value = 0
  sfx.gain.value = 0
  await new Promise((r) => setTimeout(r, 400))
  out.ambiencePeak = await peakOver(1500)
  out.ambienceRms = await rmsOver(1500)

  // ② 只有 BGM（关掉音效与环境音总线）
  bgm.gain.value = bgmGain
  await new Promise((r) => setTimeout(r, 400))
  out.bgmPeak = await peakOver(2000)
  out.bgmRms = await rmsOver(2000)

  // ③ 典型提示音（coin）在**纯环境音背景**上的量级
  // 关键：必须关掉 BGM 总线来测背景，否则"背景"里混着配乐的高峰，
  // 比值会被随机压低，测不出提示音到底够不够穿透。
  bgm.gain.value = 0
  sfx.gain.value = sfxGain
  await new Promise((r) => setTimeout(r, 500))
  const bgOnly = await peakOver(1200)
  window.__audio.playCue('coin')
  const withCoin = await peakOver(800)
  out.bgOnlyPeak = bgOnly
  out.coinPeak = withCoin
  out.coinRatio = +(withCoin / Math.max(1e-6, bgOnly)).toFixed(2)

  // ④ 强烈音效（cannon）的绝对量级
  await new Promise((r) => setTimeout(r, 700))
  const bgOnly2 = await peakOver(900)
  window.__audio.playCue('cannon')
  const withCannon = await peakOver(1000)
  out.cannonRatio = +(withCannon / Math.max(1e-6, bgOnly2)).toFixed(2)

  // ⑤ 混合状态（环境音 + BGM + 音效同时开）的总峰值
  bgm.gain.value = bgmGain
  await new Promise((r) => setTimeout(r, 400))
  out.mixPeak = await peakOver(2500)

  out.gains = { master: +master.gain.value.toFixed(3), sfx: +sfx.gain.value.toFixed(3), bgm: +bgm.gain.value.toFixed(3) }
  return out
})

console.log('═══ 混音平衡实测 ═══\n')
console.log(`增益配置：master=${result.gains.master}  sfx=${result.gains.sfx}  bgm=${result.gains.bgm}\n`)
console.log(`① 环境音（海浪/风/海鸥）  峰值 ${result.ambiencePeak}  RMS ${result.ambienceRms}`)
console.log(`② BGM 配乐                峰值 ${result.bgmPeak}  RMS ${result.bgmRms}`)
console.log(`③ coin 提示音峰值 ${result.coinPeak}  （背景 ${result.bgOnlyPeak}，比值 ${result.coinRatio}×）`)
console.log(`④ cannon 峰值比背景 ${result.cannonRatio}×`)
console.log(`⑤ 混合状态总峰值           ${result.mixPeak}`)

const amb = result.ambienceRms
const music = result.bgmRms
const musicRatio = music / amb
console.log('\n判定标准（玩家视角）：')
console.log(`  配乐 RMS 应为环境音的 1.5~6 倍 → 实测 ${musicRatio.toFixed(2)}×`)
console.log(`  提示音峰值应 ≥ 背景 1.5 倍（听得清）→ 实测 ${result.coinRatio}×`)
console.log(`  强音效峰值应 ≥ 背景 2 倍（能穿透）→ 实测 ${result.cannonRatio}×`)
console.log(`  总峰值不应超过 0.9（不削波）→ 实测 ${result.mixPeak}`)

const ok = musicRatio >= 1.5 && musicRatio <= 6
  && result.coinRatio >= 1.5
  && result.cannonRatio >= 2
  && result.mixPeak <= 0.9
console.log(`\n结论：${ok ? '✓ 混音平衡合理' : '✗ 需调整'}`)
await browser.close()
process.exit(ok ? 0 : 1)
