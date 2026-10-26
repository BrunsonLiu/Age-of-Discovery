/**
 * 程序化环境音引擎：用 Web Audio API 实时合成海浪、海风与海鸥声，
 * 不依赖任何音频素材文件（体积为零、无版权问题）。
 *
 * 浏览器自动播放策略：AudioContext 必须在用户手势中创建/恢复，
 * 因此 startAmbience() 只在首次交互（点击）时真正启动。
 *
 * 增益分层（从下到上）：
 *   [音效总线 sfxBus] ┐
 *   [BGM 总线 bgmBus] ┴→ [masterGain] → destination
 * 总开关同时作用于两者；BGM 另有独立的音量比例（bgmLevel）。
 */

const STORAGE_KEY = 'age-of-discovery-audio'

/**
 * 主音量目标值。环境音、音效、BGM 都在它之下，由各自的总线再分。
 *
 * 三条总线的相对关系是实测定的（scripts/measure_audio_mix.mjs）：
 *   环境音是"背景"（海浪），应当垫底但可感知；
 *   BGM 是"前景"（配乐），是玩家真正想听的东西，不能被海浪淹没；
 *   音效是"瞬时反馈"（金币、炮击），要能穿透背景但不能刺耳。
 * 早期版本让环境音与音效共用一条总线，实测环境音 RMS 是 BGM 的 12 倍，
 * 配乐被完全盖住；拆开后各层才能独立配平。
 */
const MASTER_TARGET = 0.32
/** 环境音总线增益（背景层） */
const AMBIENCE_BUS_GAIN = 0.34
/** 音效总线增益（反馈层） */
const SFX_BUS_GAIN = 1.0
/**
 * BGM 引擎的整体输出倍数。
 * 引擎内部的 padVol/pluckVol 是"相对层"的配比，这个倍数决定它在总线上的绝对量级。
 * 实测（scripts/measure_audio_mix.mjs）：配乐 RMS 需达到环境音的 1.5 倍以上才不会被海浪盖住。
 */
const BGM_ENGINE_GAIN = 2.0

let ctx: AudioContext | null = null
let masterGain: GainNode | null = null
/** 音效总线：所有 cue 走这里 */
let sfxBus: GainNode | null = null
/** 环境音总线：海浪/风/海鸥等常驻背景音，与音效分开以便独立配平 */
let ambienceBus: GainNode | null = null
/** BGM 总线：音乐轨走这里，可单独调音量 */
let bgmBus: GainNode | null = null
let sourceNodes: AudioScheduledSourceNode[] = []
let lfoNodes: OscillatorNode[] = []
let gullTimer: number | null = null
let running = false

/** BGM 相对音量的用户偏好（0~1），独立于总开关 */
const BGM_LEVEL_KEY = 'age-of-discovery-bgm-level'
let bgmLevel = readBgmLevel()

function readBgmLevel(): number {
  try {
    const v = localStorage.getItem(BGM_LEVEL_KEY)
    if (v === null) return 0.55
    const n = Number(v)
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.55
  } catch {
    return 0.55
  }
}

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

  sfxBus = ctx.createGain()
  sfxBus.gain.value = SFX_BUS_GAIN
  sfxBus.connect(masterGain)

  ambienceBus = ctx.createGain()
  ambienceBus.gain.value = AMBIENCE_BUS_GAIN
  ambienceBus.connect(masterGain)

  bgmBus = ctx.createGain()
  bgmBus.gain.value = bgmLevel * BGM_ENGINE_GAIN
  bgmBus.connect(masterGain)

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

/**
 * 事件音效（cue）：与常驻环境音共用同一个 AudioContext 与 masterGain，
 * 因此音量开关对两者同时生效，也无需额外的用户手势。
 * 资源占用为零——全部现场合成，播完即弃。
 *
 * 音效表定义在 utils/cues.ts（纯数据），便于离线渲染测试复用同一份参数。
 */
import { CUES, NOISE_PROFILE, type CueName } from './cues'
export type { CueName }
export { CUES }

function playTone(
  context: AudioContext,
  out: GainNode,
  freq: number,
  start: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  sweep?: number,
) {
  const osc = context.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (sweep && sweep !== 1) {
    // 指数滑音：终止频率须为正，否则 exponentialRamp 会抛错
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq * sweep), start + dur)
  }
  const g = context.createGain()
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(vol, start + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  osc.connect(g)
  g.connect(out)
  osc.start(start)
  osc.stop(start + dur + 0.03)
}

/**
 * 噪声成分：白噪声经带通滤波后按指数衰减，用于爆裂/摩擦/水花质感。
 * 与振荡器叠加使用，让炮击、雷声、翻页不像是纯合成音。
 */
function playNoise(
  context: AudioContext,
  out: GainNode,
  start: number,
  dur: number,
  vol: number,
  opts: { type: BiquadFilterType; freq: number; q?: number; sweepTo?: number } = { type: 'bandpass', freq: 900 },
) {
  const length = Math.max(1, Math.floor(context.sampleRate * dur))
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  const src = context.createBufferSource()
  src.buffer = buffer
  const filt = context.createBiquadFilter()
  filt.type = opts.type
  filt.frequency.setValueAtTime(opts.freq, start)
  if (opts.sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(20, opts.sweepTo), start + dur)
  filt.Q.value = opts.q ?? 1
  const g = context.createGain()
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(vol, start + Math.min(0.01, dur * 0.1))
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur)
  src.connect(filt)
  filt.connect(g)
  g.connect(out)
  src.start(start)
  src.stop(start + dur + 0.02)
}

/** 播放一声提示音。未启用音频（或浏览器不支持）时静默返回。 */
export function playCue(name: CueName) {
  if (!userEnabled) return
  const context = ensureContext()
  if (!context || !sfxBus) return
  if (context.state === 'suspended') void context.resume()
  const cue = CUES[name]
  if (!cue) return
  const now = context.currentTime
  cue.ratios.forEach((ratio, i) => {
    playTone(context, sfxBus!, cue.root * ratio, now + i * (cue.dur * 0.34), cue.dur, cue.type, cue.vol, cue.sweep)
  })
  // 噪声成分：按 cue 语义选择滤波中心频率（参数表在 utils/cues.ts）
  if (cue.noise) {
    const p = NOISE_PROFILE[name]
    if (p) {
      const nvol = cue.vol * cue.noise * 0.9
      playNoise(context, sfxBus!, now, cue.dur * 0.9, nvol, p)
    }
  }
}

/**
 * BGM 专用：取得音乐总线。返回 null 表示音频上下文尚未建立
 * （浏览器要求用户手势后才能创建 AudioContext）。
 *
 * 同时确保主音量已抬起——否则 BGM 会挂在 gain=0 的 masterGain 下，
 * 表现为"调度器在跑但一点声音都没有"。
 */
export function getBgmBus(): { ctx: AudioContext; bus: GainNode } | null {
  const context = ensureContext()
  if (!context || !bgmBus) return null
  if (masterGain && masterGain.gain.value < 0.001 && userEnabled) {
    raiseMasterGain(context)
  }
  return { ctx: context, bus: bgmBus }
}

/** BGM 音量比例（0~1），独立于总开关 */
export function getBgmLevel(): number {
  return bgmLevel
}

export function setBgmLevel(level: number) {
  bgmLevel = Math.min(1, Math.max(0, level))
  try {
    localStorage.setItem(BGM_LEVEL_KEY, String(bgmLevel))
  } catch {
    /* ignore */
  }
  if (bgmBus && ctx) {
    bgmBus.gain.setTargetAtTime(bgmLevel * BGM_ENGINE_GAIN, ctx.currentTime, 0.05)
  }
}

/**
 * 提升主音量。
 *
 * masterGain 初始为 0（避免 AudioContext 建立瞬间爆出噪音），
 * 必须由某个入口把它 ramp 上来。若只有 startAmbience() 负责，
 * 那么在环境音尚未启动时启动的 BGM 与音效会被整体静音——
 * 这是实测踩过的坑：masterGain 为 0 时，BGM 调度器在跑、上下文在 running，
 * 但 AnalyserNode 采到的能量恒为 0。
 *
 * 因此把"音量爬升"从"启动环境音"里拆出来，独立暴露。
 */
function raiseMasterGain(context: AudioContext) {
  if (!masterGain) return
  const target = userEnabled ? MASTER_TARGET : 0
  masterGain.gain.cancelScheduledValues(context.currentTime)
  masterGain.gain.setValueAtTime(masterGain.gain.value, context.currentTime)
  masterGain.gain.linearRampToValueAtTime(target, context.currentTime + 1.2)
}

/** 在用户手势中调用：创建/恢复上下文并（按偏好）启动环境音 */
export function startAmbience() {
  const context = ensureContext()
  if (!context || !masterGain || !sfxBus || !ambienceBus) return
  if (context.state === 'suspended') void context.resume()
  if (running) {
    // 环境音已在跑，但主音量可能还是 0（例如音效先于环境音启动）
    raiseMasterGain(context)
    return
  }

  running = true
  startWavesDeep(context, ambienceBus)
  startWavesFoam(context, ambienceBus)
  startWind(context, ambienceBus)
  scheduleGulls(context, ambienceBus)

  raiseMasterGain(context)
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
  masterGain.gain.linearRampToValueAtTime(enabled ? MASTER_TARGET : 0, now + 0.6)
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

/**
 * 开发调试钩子：仅在 dev 构建下暴露音频内部状态。
 *
 * 存在的理由：Vite 的 HMR 会给模块 URL 加时间戳，
 * 自动化脚本若用 `import('/src/utils/audio.ts')` 重新导入，
 * 拿到的是**另一个模块实例**（各自的 ctx / bus 互相隔离），
 * 于是"调度器在跑但采不到能量"这类假象会误导排查。
 * 暴露真实实例才能测到玩家实际听到的那条链路。
 */
if (typeof import.meta !== 'undefined' && import.meta.env?.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __audio: unknown }).__audio = {
    getContext: () => ctx,
    getMasterGain: () => masterGain,
    getSfxBus: () => sfxBus,
    getBgmBus: () => bgmBus,
    isRunning: () => running,
    /** 供自动化测试触发音效（避免测试脚本重复 import 模块而拿到副本实例） */
    playCue: (name: CueName) => playCue(name),
    setEnabled: (on: boolean) => setAmbienceEnabled(on),
  }
}
