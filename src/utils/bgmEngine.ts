/**
 * BGM 合成引擎（纯函数层，零依赖）。
 *
 * 这一层不依赖 audio.ts，也不碰 AudioContext 的获取逻辑——
 * 只负责"给定一个 AudioContext 与输出节点，把一段音乐渲染/排定出来"。
 * 好处有两点：
 *   1. 可以被离线测试脚本直接引入渲染成 WAV，实测"真的有声音"
 *   2. 音乐结构（和声、节奏、音色）与播放控制彻底解耦，改音乐不碰控制逻辑
 *
 * 音乐结构（三层）：
 *   1. 拨弦层  Karplus-Strong 物理弦模型，模拟鲁特琴/吉他拨奏
 *   2. 铺底层  低频三角波 + 缓慢滤波包络，模拟大提琴/管风琴持续音
 *   3. 节奏层  弱打击（低频冲击 + 短噪声），港口偏活泼、海上偏稀疏
 */

export type BgmMood = 'calm' | 'sail' | 'storm' | 'event'

/** 音名 → 半音偏移（相对 A4）。含降号写法（Eb/Bb），与升号等价。 */
const NOTE_OFFSET: Record<string, number> = {
  C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3,
  G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2,
  'Db': -7, 'Eb': -5, 'Gb': -2, 'Ab': 0, 'Bb': 2,
}

/**
 * 半音偏移 → 音名（升号写法）。
 * 必须显式按半音值建索引，不能靠 Object.keys(NOTE_OFFSET).find()——
 * 对象的键枚举顺序与半音顺序无关，会匹配到错误的音名。
 */
const NOTE_NAMES: string[] = []
for (let semi = -9; semi <= 2; semi++) {
  const name = Object.keys(NOTE_OFFSET).find((k) => NOTE_OFFSET[k] === semi)!
  NOTE_NAMES.push(name)
}

export function freq(note: string): number {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(note)
  if (!m) return 440
  const semis = NOTE_OFFSET[m[1]] + (Number(m[2]) - 4) * 12
  return 440 * Math.pow(2, semis / 12)
}

/**
 * Karplus-Strong 拨弦：把一段滤波白噪声注入延迟线，靠低通反馈维持衰减振荡。
 * 听起来比振荡器叠加更像真实弦乐器——有自然的衰减包络与轻微不谐。
 */
export function pluckBuffer(context: BaseAudioContext, frequency: number, duration: number, damping: number): AudioBuffer {
  const sr = context.sampleRate
  const n = Math.max(2, Math.floor(sr / frequency))
  const total = Math.floor(sr * duration)
  const buffer = context.createBuffer(1, total, sr)
  const out = buffer.getChannelData(0)

  // 激励：低通白噪声（拨弦的高频成分更亮）
  const line = new Float32Array(n)
  let prev = 0
  for (let i = 0; i < n; i++) {
    const white = Math.random() * 2 - 1
    prev = prev * 0.6 + white * 0.4
    line[i] = prev
  }
  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(line[i]))
  if (peak > 0) for (let i = 0; i < n; i++) line[i] /= peak

  let idx = 0
  let prevOut = 0
  for (let i = 0; i < total; i++) {
    const cur = line[idx]
    const filtered = (cur + prevOut) * 0.5 * damping
    prevOut = filtered
    line[idx] = filtered
    out[i] = cur
    idx = (idx + 1) % n
  }
  // 尾部淡出，避免截断爆音
  const fade = Math.floor(sr * 0.05)
  for (let i = 0; i < fade; i++) out[total - 1 - i] *= i / fade
  // 亮度整形：压掉过亮的高次谐波（Karplus-Strong 天然偏亮，
  // 不整形会盖住铺底、在总览频谱里堆到最高频段）
  shapePluck(out, sr, 2600)
  return buffer
}

/**
 * 拨弦音的一阶低通整形：相当于给弦乐加一个"身体"，
 * 让它不刺耳、能与铺底共存。
 */
function shapePluck(data: Float32Array, sampleRate: number, cutoffHz: number) {
  const rc = 1 / (2 * Math.PI * cutoffHz)
  const dt = 1 / sampleRate
  const alpha = dt / (rc + dt)
  let prevOut = 0
  for (let i = 0; i < data.length; i++) {
    const y = alpha * data[i] + (1 - alpha) * prevOut
    prevOut = y
    data[i] = y
  }
}

/** 每个情绪的和声与节奏结构 */
export interface MoodSpec {
  /** 每小节的和弦（根音 + 音程集合，单位：半音） */
  chords: { root: string; intervals: number[] }[]
  /** 每小节的节奏型：每个音占的拍数 */
  rhythm: number[]
  /** 旋律音阶（相对和弦根音的半音偏移） */
  scale: number[]
  /** 旋律是否只用和弦音（true=琶音式），false=含经过音 */
  arpeggioOnly: boolean
  /** 拨弦旋律相对和弦根音的八度偏移（+1 = 高一个八度） */
  melodyOctave: number
  padVol: number
  pluckVol: number
  /** 节奏层音量，0 = 无节奏 */
  drumVol: number
  /** 每拍秒数 */
  beat: number
  /** 每个音位实际弹奏的概率 */
  density: number
}

export const MOODS: Record<BgmMood, MoodSpec> = {
  // 港口/主菜单：D 大调偏暖，节奏轻快
  // 和弦根音落在 D3~B3（147~247Hz），拨弦旋律再高一个八度（294~494Hz），
  // 保证旋律始终在人耳最舒适的中频区，铺底负责低频支撑。
  calm: {
    chords: [
      { root: 'D3', intervals: [0, 4, 7] },     // D
      { root: 'A3', intervals: [0, 4, 7] },     // Am
      { root: 'B3', intervals: [0, 3, 7] },     // Bm
      { root: 'G3', intervals: [0, 4, 7] },     // G
    ],
    rhythm: [1, 1, 2, 1, 1, 2],
    scale: [0, 2, 4, 7, 9, 12],
    arpeggioOnly: true,
    /** 拨弦旋律相对和弦根音的八度偏移：+1 让旋律高于铺底 */
    melodyOctave: 1,
    padVol: 0.255,
    pluckVol: 0.39,
    drumVol: 0.15,
    beat: 0.46,
    density: 0.85,
  },
  // 航行中：D 多利亚（带小调阴郁但不压抑），节奏稀疏
  sail: {
    chords: [
      { root: 'D3', intervals: [0, 3, 7, 10] },  // Dm7
      { root: 'C3', intervals: [0, 4, 7, 10] },  // C7
      { root: 'G3', intervals: [0, 4, 7] },      // G
      { root: 'A3', intervals: [0, 3, 7] },      // Am
    ],
    rhythm: [2, 2, 4],
    scale: [0, 2, 3, 5, 7, 9, 10],
    arpeggioOnly: false,
    melodyOctave: 1,
    padVol: 0.3,
    pluckVol: 0.3,
    drumVol: 0.066,
    beat: 0.58,
    density: 0.75,
  },
  // 暴风雨：低音小二度摩擦，节奏压迫
  // 根音压到 D2（73Hz）制造压迫感，但旋律仍在 +1 八度保持可辨
  storm: {
    chords: [
      { root: 'D2', intervals: [0, 1, 7] },      // D + 小二度（紧张）
      { root: 'D2', intervals: [0, 1, 7] },
      { root: 'Eb2', intervals: [0, 1, 8] },
      { root: 'C2', intervals: [0, 1, 7] },
    ],
    rhythm: [1, 1, 1, 1, 2, 2],
    scale: [0, 1, 3, 6, 8, 12],
    arpeggioOnly: false,
    melodyOctave: 1,
    padVol: 0.375,
    pluckVol: 0.345,
    drumVol: 0.255,
    beat: 0.40,
    density: 0.95,
  },
  // 事件/对白：留白，只有铺底与稀疏低频
  event: {
    chords: [
      { root: 'A2', intervals: [0, 7] },
      { root: 'F2', intervals: [0, 7] },
    ],
    rhythm: [4, 4],
    scale: [0, 7, 12],
    arpeggioOnly: true,
    melodyOctave: 2,
    padVol: 0.225,
    /** 事件时旋律仍需可辨（玩家在读文字，但配乐不能完全消失） */
    pluckVol: 0.255,
    drumVol: 0.0,
    beat: 0.66,
    density: 0.55,
  },
}

/** 把音程偏移转成音名（相对和弦根音） */
export function noteFromOffset(root: string, offset: number): string {
  const m = /^([A-G][#b]?)(\d)$/.exec(root)
  if (!m) return root
  const base = NOTE_OFFSET[m[1]]
  const semis = base + (Number(m[2]) - 4) * 12 + offset
  // NOTE_NAMES 的下标 9 对应半音 0（A）
  const idx = (((semis + 9) % 12) + 12) % 12
  const name = NOTE_NAMES[idx]
  // 八度：把半音数折回该音名自身的基准八度
  // （必须用该音名的 base，而不是 A 的 0，否则会整体差一个八度）
  const oct = Math.floor((semis - base) / 12) + 4
  return `${name}${oct}`
}

/** 一小节的时长（秒） */
export function barDuration(mood: BgmMood): number {
  const spec = MOODS[mood]
  return spec.rhythm.reduce((a, b) => a + b, 0) * spec.beat
}

/** 拨弦一个音 */
function playPluck(ctx: BaseAudioContext, bus: AudioNode, note: string, when: number, vol: number, dur: number) {
  const f = freq(note)
  const buffer = pluckBuffer(ctx, f, dur, 0.996)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol, when)
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
  // 轻微立体声宽度
  const panner = ctx.createStereoPanner()
  panner.pan.value = Math.random() * 2 - 1 > 0.5 ? 0.35 : -0.35
  src.connect(g)
  g.connect(panner)
  panner.connect(bus)
  src.start(when)
  src.stop(when + dur + 0.05)
}

/** 铺底层：持续低音 + 和弦音，缓慢起音 */
function playPad(ctx: BaseAudioContext, bus: AudioNode, root: string, intervals: number[], when: number, vol: number, dur: number) {
  const rootF = freq(root)
  for (const iv of intervals) {
    const f = rootF * Math.pow(2, iv / 12)
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = f
    osc.detune.value = (Math.random() * 2 - 1) * 6
    const filt = ctx.createBiquadFilter()
    filt.type = 'lowpass'
    filt.frequency.setValueAtTime(320, when)
    filt.frequency.linearRampToValueAtTime(900, when + dur * 0.4)
    filt.frequency.linearRampToValueAtTime(380, when + dur)
    filt.Q.value = 0.7
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, when)
    g.gain.linearRampToValueAtTime(vol / intervals.length, when + dur * 0.28)
    g.gain.linearRampToValueAtTime(0.0001, when + dur)
    osc.connect(filt)
    filt.connect(g)
    g.connect(bus)
    osc.start(when)
    osc.stop(when + dur + 0.05)
  }
}

/** 节奏层：低频冲击（桶鼓）+ 拍点噪声 */
function playDrum(ctx: BaseAudioContext, bus: AudioNode, when: number, vol: number, accent: boolean) {
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(accent ? 92 : 68, when)
  osc.frequency.exponentialRampToValueAtTime(38, when + 0.16)
  const g = ctx.createGain()
  g.gain.setValueAtTime(vol * (accent ? 1 : 0.6), when)
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.22)
  osc.connect(g)
  g.connect(bus)
  osc.start(when)
  osc.stop(when + 0.26)

  if (accent) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * 0.06))
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len)
    const src = ctx.createBufferSource()
    src.buffer = buf
    const filt = ctx.createBiquadFilter()
    filt.type = 'bandpass'
    filt.frequency.value = 2400
    filt.Q.value = 1.2
    const ng = ctx.createGain()
    ng.gain.value = vol * 0.35
    src.connect(filt)
    filt.connect(ng)
    ng.connect(bus)
    src.start(when)
  }
}

/**
 * 排定一小节。
 * @param ctx   音频上下文
 * @param bus   输出节点
 * @param mood  情绪
 * @param barStart 该小节的起始时间（ctx 时间轴）
 * @param barIndex 小节序号（决定用哪个和弦）
 */
export function scheduleBar(
  ctx: BaseAudioContext,
  bus: AudioNode,
  mood: BgmMood,
  barStart: number,
  barIndex: number,
) {
  const spec = MOODS[mood]
  const chord = spec.chords[barIndex % spec.chords.length]
  const barDur = barDuration(mood)

  playPad(ctx, bus, chord.root, chord.intervals, barStart, spec.padVol, barDur * 0.98)

  let t = barStart
  let noteIdx = 0
  for (const durBeats of spec.rhythm) {
    if (Math.random() < spec.density) {
      // 旋律音：琶音式取和弦音，否则取音阶音；再统一抬高 melodyOctave 个八度
      const offset = spec.arpeggioOnly
        ? chord.intervals[noteIdx % chord.intervals.length]
        : spec.scale[noteIdx % spec.scale.length]
      const note = noteFromOffset(chord.root, offset + spec.melodyOctave * 12)
      const dur = durBeats * spec.beat
      playPluck(ctx, bus, note, t, spec.pluckVol, Math.min(dur * 1.5, 1.6))
    }
    if (spec.drumVol > 0) {
      playDrum(ctx, bus, t, spec.drumVol, noteIdx % 2 === 0)
    }
    t += durBeats * spec.beat
    noteIdx++
  }
}

/**
 * 离线渲染一段 BGM（供测试用）。
 * @returns 渲染出的声道数组
 */
export async function renderMood(
  ctx: OfflineAudioContext,
  bus: AudioNode,
  mood: BgmMood,
  seconds: number,
): Promise<Float32Array[]> {
  const barDur = barDuration(mood)
  let t = 0
  let bar = 0
  while (t < seconds) {
    scheduleBar(ctx, bus, mood, t, bar)
    t += barDur
    bar++
  }
  const buf = await ctx.startRendering()
  return Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i))
}
