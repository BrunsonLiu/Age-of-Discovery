/**
 * 程序化环境音引擎：用 Web Audio API 实时合成海浪、海风与海鸥声，
 * 不依赖任何音频素材文件（体积为零、无版权问题）。
 *
 * 浏览器自动播放策略：AudioContext 必须在用户手势中创建/恢复，
 * 因此 startAmbience() 只在首次交互（点击）时真正启动。
 */

const STORAGE_KEY = 'age-of-discovery-audio'

let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
let sourceNodes: AudioScheduledSourceNode[] = []
let lfoNodes: OscillatorNode[] = []
let gullTimer: number | null = null
let running = false

/** 是否已启用（用户偏好），与是否已启动（受手势限制）分离 */
let userEnabled = readPref()

function readPref(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === null ? true : v === '1'
  } catch {
    return true
  }
}

function writePref(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  ctx = new AC()
  masterGain = ctx.createGain()
  masterGain.gain.value = 0
  masterGain.connect(ctx.destination)
  return ctx
}

/** 生成一段循环的白噪声缓冲 */
function noiseBuffer(context: AudioContext, seconds = 4): AudioBuffer {
  const length = context.sampleRate * seconds
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < length; i++) {
    // 对白噪声做轻微积分，得到更低频、更像海浪的"粉红"质感
    const white = Math.random() * 2 - 1
    last = (last + 0.02 * white) / 1.02
    data[i] = last * 3.5
  }
  return buffer
}

function startWavesDeep(context: AudioContext, out: GainNode) {
  // 低沉的涌浪：低频噪声 + 低通 + 缓慢起伏
  const src = context.createBufferSource()
  src.buffer = noiseBuffer(context, 6)
  src.loop = true
  const lp = context.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 380
  lp.Q.value = 0.6
  const g = context.createGain()
  g.gain.value = 0.5
  const lfo = context.createOscillator()
  lfo.frequency.value = 0.07
  const lfoGain = context.createGain()
  lfoGain.gain.value = 0.28
  lfo.connect(lfoGain)
  lfoGain.connect(g.gain)
  src.connect(lp)
  lp.connect(g)
  g.connect(out)
  src.start()
  lfo.start()
  sourceNodes.push(src)
  lfoNodes.push(lfo)
}

function startWavesFoam(context: AudioContext, out: GainNode) {
  // 浪花沙沙声：高频噪声 + 高通 + 更快的起伏
  const src = context.createBufferSource()
  src.buffer = noiseBuffer(context, 5)
  src.loop = true
  const hp = context.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 1800
  const g = context.createGain()
  g.gain.value = 0.06
  const lfo = context.createOscillator()
  lfo.frequency.value = 0.13
  const lfoGain = context.createGain()
  lfoGain.gain.value = 0.05
  lfo.connect(lfoGain)
  lfoGain.connect(g.gain)
  src.connect(hp)
  hp.connect(g)
  g.connect(out)
  src.start()
  lfo.start()
  sourceNodes.push(src)
  lfoNodes.push(lfo)
}

function startWind(context: AudioContext, out: GainNode) {
  // 海风：中频带通噪声，缓慢流动
  const src = context.createBufferSource()
  src.buffer = noiseBuffer(context, 5)
  src.loop = true
  const bp = context.createBiquadFilter()
  bp.type = 'bandpass'
  bp.frequency.value = 700
  bp.Q.value = 0.8
  const g = context.createGain()
  g.gain.value = 0.05
  const lfo = context.createOscillator()
  lfo.frequency.value = 0.05
  const lfoGain = context.createGain()
  lfoGain.gain.value = 0.03
  lfo.connect(lfoGain)
  lfoGain.connect(g.gain)
  src.connect(bp)
  bp.connect(g)
  g.connect(out)
  src.start()
  lfo.start()
  sourceNodes.push(src)
  lfoNodes.push(lfo)
}

/** 一声海鸥啼叫：带快速频率包络的振荡器，偶尔触发 */
function chirp(context: AudioContext, out: GainNode) {
  const now = context.currentTime
  const osc = context.createOscillator()
  osc.type = 'sawtooth'
  const g = context.createGain()
  const lp = context.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 2600
  const base = 900 + Math.random() * 500
  osc.frequency.setValueAtTime(base * 1.6, now)
  osc.frequency.exponentialRampToValueAtTime(base * 0.7, now + 0.18)
  g.gain.setValueAtTime(0, now)
  g.gain.linearRampToValueAtTime(0.05, now + 0.02)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
  osc.connect(lp)
  lp.connect(g)
  g.connect(out)
  osc.start(now)
  osc.stop(now + 0.25)
}

function scheduleGulls(context: AudioContext, out: GainNode) {
  const delay = 6000 + Math.random() * 14000
  gullTimer = window.setTimeout(() => {
    if (!running) return
    const count = 1 + Math.floor(Math.random() * 3)
    for (let i = 0; i < count; i++) {
      window.setTimeout(() => { if (running) chirp(context, out) }, i * (180 + Math.random() * 160))
    }
    scheduleGulls(context, out)
  }, delay)
}

/** 在用户手势中调用：创建/恢复上下文并（按偏好）启动环境音 */
export function startAmbience() {
  const context = ensureContext()
  if (!context || !masterGain) return
  if (context.state === 'suspended') void context.resume()
  if (running) return

  running = true
  startWavesDeep(context, masterGain)
  startWavesFoam(context, masterGain)
  startWind(context, masterGain)
  scheduleGulls(context, masterGain)

  const target = userEnabled ? 0.32 : 0
  masterGain.gain.cancelScheduledValues(context.currentTime)
  masterGain.gain.setValueAtTime(masterGain.gain.value, context.currentTime)
  masterGain.gain.linearRampToValueAtTime(target, context.currentTime + 1.2)
}

export function setAmbienceEnabled(enabled: boolean) {
  userEnabled = enabled
  writePref(enabled)
  if (!ctx || !masterGain) return
  if (enabled && !running) {
    startAmbience()
    return
  }
  const now = ctx.currentTime
  masterGain.gain.cancelScheduledValues(now)
  masterGain.gain.setValueAtTime(masterGain.gain.value, now)
  masterGain.gain.linearRampToValueAtTime(enabled ? 0.32 : 0, now + 0.6)
}

export function isAmbienceEnabled(): boolean {
  return userEnabled
}

/** 组件卸载/游戏重置时彻底停止并释放节点 */
export function stopAmbience() {
  running = false
  if (gullTimer !== null) {
    clearTimeout(gullTimer)
    gullTimer = null
  }
  for (const n of sourceNodes) {
    try { n.stop() } catch { /* already stopped */ }
  }
  for (const l of lfoNodes) {
    try { l.stop() } catch { /* already stopped */ }
  }
  sourceNodes = []
  lfoNodes = []
}
