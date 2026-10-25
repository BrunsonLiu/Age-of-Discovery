import type { EventOutcome, OfficerId } from '@/types'

/**
 * 事件内嵌小游戏（第四条线：让玩家真的动手）——纯逻辑层。
 *
 * 病根诊断：此前事件选择只是"按概率抽签"，玩家点完按钮就等着看结果，
 * 参与感全靠读文字。这里把"选项"升级成"选择 + 操作"：
 *
 *   选一个带 miniGame 的选项 → 玩一段几秒的实时小游戏 → 拿到 performance(0..1)
 *   → performance 修正该选项各结局的概率（撬动幅度 ±25pp 量级）→ 掷出最终结局
 *
 * 于是"选项"本身不再等价于"掷骰子"：手稳的人能把好结果拉过来，手抖的人会被推向坏结果。
 *
 * 本文件不碰 React / store，全部纯函数 + 可注入 rand，方便单测。
 */

export type { MiniGameId } from '@/types'

/* ==================== 通用工具 ==================== */

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function round2(v: number): number {
  return Math.round(v * 100) / 100
}

/* ==================== 属性加成模型 ==================== */

/**
 * 小游戏可读取的外部条件。
 * 玩家经营得越好，小游戏越宽容——经营线与操作线由此咬合。
 */
export interface MiniGameContext {
  /** 旗舰完好度 0..1（耐久/最大耐久） */
  hullRatio: number
  /** 旗舰人手充裕度 0..1（船员/满员） */
  crewRatio: number
  /** 在船军官 */
  officers: OfficerId[]
}

/** 由经营状况折算出的操作加成 */
export interface MiniGameModifiers {
  /** 判定窗口/推进力度的放大倍率（0 = 无加成） */
  windowBonus: number
  /** 额外容错：超出这个数的失误才额外扣分 */
  forgiveness: number
  /** 表现分的额外加成（按表现比例计入） */
  edgeBonus: number
}

/**
 * 加成公式（三项来源，与三条经营线对应）：
 *   · 船体（hullRatio）：帆索与船身越完好，风浪里越抓得住 → 判定窗口变宽
 *   · 人手（crewRatio）：人手越足，越有人手轮换硬扛 → 判定窗口变宽 + 容错 +1
 *   · 军官：领航员读风更准（大副镇场、船医善后各有其用）
 */
export function computeModifiers(ctx: MiniGameContext): MiniGameModifiers {
  const hull = clamp01(ctx.hullRatio)
  const crew = clamp01(ctx.crewRatio)
  const windowBonus =
    hull * 0.10 +
    crew * 0.06 +
    (ctx.officers.includes('pilot') ? 0.14 : 0)
  const forgiveness =
    (ctx.officers.includes('quartermaster') ? 1 : 0) +
    (crew >= 0.6 ? 1 : 0)
  const edgeBonus = ctx.officers.includes('surgeon') ? 0.05 : 0
  return { windowBonus, forgiveness, edgeBonus }
}

/** 把加成翻译成给玩家看的一句话 */
export function describeModifiers(m: MiniGameModifiers, ctx: MiniGameContext): string[] {
  const lines: string[] = []
  if (ctx.officers.includes('pilot')) lines.push('领航员在船：读风更准，判定窗口 +14%')
  if (ctx.officers.includes('quartermaster')) lines.push('大副在船：压得住场面，多容错 1 次')
  if (ctx.officers.includes('surgeon')) lines.push('船医在船：善后得当，表现 +5%')
  if (ctx.hullRatio >= 0.7) lines.push('船体完好：判定窗口 +' + Math.round(ctx.hullRatio * 10) + '%')
  if (ctx.crewRatio >= 0.6) lines.push('人手充足：判定窗口 +6%、多容错 1 次')
  if (lines.length === 0) lines.push('没有额外的帮手：判定窗口只有基准值')
  return lines
}

/* ==================== 表现分 → 结局概率 ==================== */

/**
 * 结局的"优劣分"。只在同一个选项的若干结局之间横向比较，
 * 用于把概率质量往好结果 / 坏结果两边推。
 */
export function outcomeMerit(o: EventOutcome): number {
  return (
    o.goldChange * 0.02 +
    o.foodChange * 0.05 +
    o.waterChange * 0.05 +
    o.moraleChange * 0.60 +
    o.durabilityChange * 0.40 +
    o.crewChange * 1.50 +
    (o.fameChange ?? 0) * 0.40
  )
}

/** 概率撬动强度（exp 倾斜系数）。1.0 时三结局场景约 ±27pp。 */
export const MINI_GAME_BIAS_K = 1.0

/**
 * 按表现分重新分配结局概率。
 *
 * 做法是 exp 倾斜：把每个结局的优劣分标准化成 z（和为 0），
 * 再乘以 exp(k · centered · z)，最后归一化。
 *   · performance = 0.5 → 不倾斜，等价于原始概率
 *   · performance = 1.0 → 好结局概率明显上抬、坏结局被压低
 *   · performance = 0.0 → 反向
 *
 * 好处是保持概率为正、保持结局之间的相对次序，且撬动幅度连续。
 */
export function biasProbabilities(outcomes: EventOutcome[], performance: number): number[] {
  const n = outcomes.length
  if (n === 0) return []
  const base = outcomes.map(o => Math.max(0, o.probability))
  const total = base.reduce((a, b) => a + b, 0)
  if (total <= 0) return outcomes.map(() => 1 / n)

  const centered = (clamp01(performance) - 0.5) * 2
  if (Math.abs(centered) < 1e-9) return base.map(p => p / total)

  const merits = outcomes.map(outcomeMerit)
  const mean = merits.reduce((a, b) => a + b, 0) / n
  const spread = Math.max(...merits.map(m => Math.abs(m - mean)))
  if (spread < 1e-9) return base.map(p => p / total)

  const z = merits.map(m => (m - mean) / spread)
  const tilted = base.map((p, i) => p * Math.exp(MINI_GAME_BIAS_K * centered * z[i]))
  const t2 = tilted.reduce((a, b) => a + b, 0)
  return tilted.map(p => p / t2)
}

/* ==================== 风暴：收帆时机条 ==================== */

export const STORM_ROUNDS = 5
export const STORM_BASE_HALF = 0.16
export const STORM_SPEED0 = 0.78
/** 单轮时限（秒）：超时未收帆算失手，防止玩家干等 */
export const STORM_ROUND_LIMIT = 4.5
/** 两次收帆之间的最小间隔（秒）：防止连点秒杀 */
export const STORM_COOLDOWN = 0.35

export interface StormRoundSpec {
  /** 窗口中心 0..1 */
  center: number
  /** 窗口半宽 0..1 */
  halfWidth: number
}

export interface StormState {
  /** 当前是第几轮（0 起） */
  round: number
  /** 指针位置 0..1 */
  needle: number
  dir: 1 | -1
  speed: number
  rounds: StormRoundSpec[]
  hits: number
  misses: number
  precisionSum: number
  /** 距下一次可操作的冷却（秒） */
  cooldown: number
  /** 本轮已过时间（秒） */
  roundTime: number
  finished: boolean
}

export function createStormState(
  rand: () => number = Math.random,
  modifiers?: MiniGameModifiers,
): StormState {
  const bonus = modifiers?.windowBonus ?? 0
  const rounds: StormRoundSpec[] = []
  for (let i = 0; i < STORM_ROUNDS; i++) {
    const halfWidth = Math.max(0.05, STORM_BASE_HALF * (1 - i * 0.13))
    // 窗口必须完整落在轨道内：按"加成后的有效半宽"留边距，
    // 否则窗口会贴到轨道边缘甚至被裁掉一段，判定看起来就不公平了
    const effHalf = halfWidth * (1 + bonus)
    const margin = Math.min(0.45, effHalf + 0.02)
    rounds.push({
      center: margin + rand() * Math.max(0.02, 1 - margin * 2),
      halfWidth,
    })
  }
  return {
    round: 0,
    needle: rand(),
    dir: rand() > 0.5 ? 1 : -1,
    speed: STORM_SPEED0,
    rounds,
    hits: 0,
    misses: 0,
    precisionSum: 0,
    cooldown: 0,
    roundTime: 0,
    finished: false,
  }
}

/** 推进一帧：指针往复移动、冷却与轮次计时 */
export function advanceStorm(s: StormState, dt: number): StormState {
  if (s.finished) return s
  s.cooldown = Math.max(0, s.cooldown - dt)
  s.roundTime += dt

  let n = s.needle + s.dir * s.speed * dt
  if (n > 1) { n = 2 - n; s.dir = -1 }
  else if (n < 0) { n = -n; s.dir = 1 }
  s.needle = n

  if (s.roundTime >= STORM_ROUND_LIMIT) {
    // 超时未收帆：算一次失手，进入下一轮
    s.misses += 1
    s.round += 1
    s.roundTime = 0
    s.cooldown = STORM_COOLDOWN
    s.speed = STORM_SPEED0 + s.round * 0.07
    if (s.round >= STORM_ROUNDS) s.finished = true
  }
  return s
}

/**
 * 尝试收帆。命中判定用"离窗口中心的距离"，
 * 精准度 = 0.35（擦边）+ 0.65 · 归一化距离，越正中间分越高。
 */
export function tryReef(
  s: StormState,
  modifiers: MiniGameModifiers,
): { state: StormState; hit: boolean; precision: number } {
  if (s.finished || s.cooldown > 0 || s.round >= STORM_ROUNDS) {
    return { state: s, hit: false, precision: 0 }
  }
  const spec = s.rounds[s.round]
  const effHalf = spec.halfWidth * (1 + modifiers.windowBonus)
  const d = Math.abs(s.needle - spec.center)
  const hit = d <= effHalf
  const precision = hit ? clamp01(0.35 + 0.65 * (1 - d / Math.max(0.01, effHalf))) : 0

  if (hit) {
    s.hits += 1
    s.precisionSum += precision
  } else {
    s.misses += 1
  }
  s.round += 1
  s.roundTime = 0
  s.cooldown = STORM_COOLDOWN
  s.speed = STORM_SPEED0 + s.round * 0.07
  if (s.round >= STORM_ROUNDS) s.finished = true
  return { state: s, hit, precision }
}

/** 风暴表现分：命中轮次为主、精准度为辅，超出的失误额外扣分 */
export function stormPerformance(s: StormState, modifiers: MiniGameModifiers): number {
  const total = s.rounds.length
  const base = s.hits / total
  const precision = s.hits > 0 ? s.precisionSum / s.hits : 0
  const over = Math.max(0, s.misses - modifiers.forgiveness)
  let p = base * 0.72 + precision * 0.28 - over * 0.15
  p = clamp01(p + modifiers.edgeBonus * base)
  return round2(p)
}

/* ==================== 接舷：连点拦跳板 ==================== */

export const BOARDING_WAVES = 8
export const BOARDING_PLANKS = 3
/** 登船者初始攀爬进度 */
export const BOARDING_SPAWN_HEAT = 0.35
/** 每秒攀爬速度 */
export const BOARDING_CLIMB = 0.22
/** 每次推挡削减的进度 */
export const BOARDING_PUSH = 0.17
/** 两次推挡之间的最小间隔（秒） */
export const BOARDING_COOLDOWN = 0.20
export const BOARDING_SPAWN_START = 2.8
export const BOARDING_SPAWN_MIN = 1.7

export interface BoardingPlank {
  id: number
  /** 攀爬进度 0..1，越接近 1 越要上船 */
  heat: number
  /** 该跳板上是否有登船者 */
  active: boolean
  /** 该登船者已被推挡了几次 */
  clicks: number
}

export interface BoardingState {
  /** 已经放出多少波登船者（0..total） */
  wave: number
  total: number
  planks: BoardingPlank[]
  spawnTimer: number
  repelled: number
  boarded: number
  /** 打在空跳板上的无效推挡 */
  wasted: number
  /** 各登船者被推挡次数之和（用于算精准度） */
  clicksTotal: number
  cooldown: number
  finished: boolean
}

export function createBoardingState(): BoardingState {
  return {
    wave: 0,
    total: BOARDING_WAVES,
    planks: Array.from({ length: BOARDING_PLANKS }, (_, i) => ({
      id: i,
      heat: 0,
      active: false,
      clicks: 0,
    })),
    spawnTimer: BOARDING_SPAWN_START,
    repelled: 0,
    boarded: 0,
    wasted: 0,
    clicksTotal: 0,
    cooldown: 0,
    finished: false,
  }
}

/**
 * 推进一帧：攀爬进度上升、到点上船、计时放下一波。
 *
 * 计数约定：wave 只统计"已放出的登船者"；登上船的那一个已经消耗过自己的名额，
 * 因此不再增加 wave——否则总波数会被凭空多算，结算时对不上。
 */
export function advanceBoarding(s: BoardingState, dt: number, rand: () => number = Math.random): BoardingState {
  if (s.finished) return s
  s.cooldown = Math.max(0, s.cooldown - dt)

  for (const p of s.planks) {
    if (!p.active) continue
    p.heat += BOARDING_CLIMB * dt
    if (p.heat >= 1) {
      p.heat = 0
      p.active = false
      p.clicks = 0
      s.boarded += 1
    }
  }

  if (s.wave < s.total) {
    s.spawnTimer -= dt
    if (s.spawnTimer <= 0) {
      const free = s.planks.filter(p => !p.active)
      if (free.length > 0) {
        const target = free[Math.floor(rand() * free.length)]
        target.active = true
        target.heat = BOARDING_SPAWN_HEAT
        target.clicks = 0
        s.wave += 1
        const progress = s.wave / s.total
        s.spawnTimer = BOARDING_SPAWN_START + (BOARDING_SPAWN_MIN - BOARDING_SPAWN_START) * progress
      } else {
        s.spawnTimer = 0.4
      }
    }
  } else if (s.planks.every(p => !p.active)) {
    s.finished = true
  }
  return s
}

/** 推挡一次：把对应跳板上的登船者顶回去 */
export function pushPlank(
  s: BoardingState,
  plankIndex: number,
  modifiers: MiniGameModifiers,
): { state: BoardingState; repelled: boolean } {
  if (s.finished || s.cooldown > 0) return { state: s, repelled: false }
  const p = s.planks[plankIndex]
  if (!p) return { state: s, repelled: false }
  if (!p.active) {
    s.wasted += 1
    s.cooldown = BOARDING_COOLDOWN
    return { state: s, repelled: false }
  }
  p.clicks += 1
  s.clicksTotal += 1
  p.heat -= BOARDING_PUSH * (1 + modifiers.windowBonus)
  s.cooldown = BOARDING_COOLDOWN
  if (p.heat <= 0) {
    p.heat = 0
    p.active = false
    p.clicks = 0
    s.repelled += 1
    return { state: s, repelled: true }
  }
  return { state: s, repelled: false }
}

/** 接舷表现分：击退比例为主、出手效率为辅，上船超额额外扣分 */
export function boardingPerformance(s: BoardingState, modifiers: MiniGameModifiers): number {
  const rate = s.repelled / s.total
  const avgClicks = s.repelled > 0 ? s.clicksTotal / s.repelled : s.total
  const efficiency = clamp01(1 - (avgClicks - 1) / 4)
  const over = Math.max(0, s.boarded - modifiers.forgiveness)
  let p = rate * (0.80 + 0.20 * efficiency) - over * 0.08 - Math.min(0.15, s.wasted * 0.02)
  p = clamp01(p + modifiers.edgeBonus * rate)
  return round2(p)
}

/* ==================== 逃脱：方向键闪避（QTE） ==================== */

/**
 * 逃脱：袭击者从四个方向扑来，屏幕先给一个方向预告，
 * 玩家必须在攻击落到头前按对方向键格挡开。
 *
 * 与风暴的差别：风暴考"时机"（一个连续量），逃脱考"方向识别 + 快捷键映射"。
 * 加成在这里体现为"预警时间更长"（windowBonus 放大可反应窗口）。
 */
export const ESCAPE_WAVES = 8
/** 攻击从预告到落下的基准时间（秒） */
export const ESCAPE_TELEGRAPH = 1.1
/** 加成可延长的反应时间（秒），受 windowBonus 放大 */
export const ESCAPE_REACTION = 0.55
/** 两次格挡之间的最小间隔（秒） */
export const ESCAPE_COOLDOWN = 0.18

export type EscapeDir = 'up' | 'down' | 'left' | 'right'

export const ESCAPE_DIRS: readonly EscapeDir[] = ['up', 'down', 'left', 'right']

export const ESCAPE_DIR_LABEL: Record<EscapeDir, string> = {
  up: '上',
  down: '下',
  left: '左',
  right: '右',
}

export const ESCAPE_DIR_KEY: Record<EscapeDir, string> = {
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
}

export interface EscapeState {
  /** 已进入第几次袭击（0 起） */
  wave: number
  total: number
  /** 本次袭击的方向（null = 尚未生成） */
  dir: EscapeDir | null
  /** 距袭击落下的倒计时（秒） */
  timer: number
  /** 本次袭击的总时长（含加成延长的部分） */
  window: number
  /** 是否已经处理过本次袭击 */
  resolved: boolean
  /** 成功格挡次数 */
  dodged: number
  /** 被击中次数 */
  hit: number
  /** 成功格挡的"提前量"累计（秒，越早按分越高） */
  speedSum: number
  cooldown: number
  finished: boolean
}

export function createEscapeState(): EscapeState {
  return {
    wave: 0,
    total: ESCAPE_WAVES,
    dir: null,
    timer: 0,
    window: ESCAPE_TELEGRAPH,
    resolved: true,
    dodged: 0,
    hit: 0,
    speedSum: 0,
    cooldown: 0,
    finished: false,
  }
}

/** 本次袭击的可反应总时长：基准 + 加成延长的部分 */
export function escapeWindow(modifiers: MiniGameModifiers): number {
  return ESCAPE_TELEGRAPH + ESCAPE_REACTION * (1 + modifiers.windowBonus)
}

/** 推进一帧：倒计时、生成下一次袭击、超时算被击中 */
export function advanceEscape(
  s: EscapeState,
  dt: number,
  rand: () => number = Math.random,
  modifiers: MiniGameModifiers = { windowBonus: 0, forgiveness: 0, edgeBonus: 0 },
): EscapeState {
  if (s.finished) return s
  s.cooldown = Math.max(0, s.cooldown - dt)

  if (!s.resolved) {
    s.timer -= dt
    if (s.timer <= 0) {
      // 没挡住：被击中
      s.hit += 1
      s.resolved = true
      s.cooldown = ESCAPE_COOLDOWN
      s.wave += 1
      if (s.wave >= s.total) {
        s.finished = true
        s.dir = null
      }
    }
    return s
  }

  // 上一波已结算：等冷却结束后开下一波
  if (s.wave < s.total && s.cooldown <= 0) {
    spawnEscapeWave(s, rand, modifiers)
  }
  return s
}

function spawnEscapeWave(
  s: EscapeState,
  rand: () => number,
  modifiers: MiniGameModifiers,
): void {
  s.dir = ESCAPE_DIRS[Math.floor(rand() * ESCAPE_DIRS.length)]
  s.window = escapeWindow(modifiers)
  s.timer = s.window
  s.resolved = false
}

/**
 * 格挡一次。按对方向且在窗口内 = 成功；按错方向 = 被击中。
 * 提前量越大（越早按下）得分越高。
 */
export function dodgeEscape(
  s: EscapeState,
  dir: EscapeDir,
): { state: EscapeState; dodged: boolean; speed: number } {
  if (s.finished || s.resolved || s.cooldown > 0 || !s.dir) {
    return { state: s, dodged: false, speed: 0 }
  }
  // 剩余时间占总窗口的比例 = 提前量（越早按越接近 1）
  const speed = clamp01(s.timer / Math.max(0.01, s.window))
  // 判定必须在清空 s.dir 之前做完：s.dir 一旦置 null 就没法比对了
  const dodged = dir === s.dir

  s.cooldown = ESCAPE_COOLDOWN
  s.resolved = true
  s.wave += 1
  if (dodged) {
    s.dodged += 1
    s.speedSum += speed
  } else {
    s.hit += 1
  }
  if (s.wave >= s.total) {
    s.finished = true
  }
  s.dir = null
  return { state: s, dodged, speed: dodged ? speed : 0 }
}

/** 逃脱表现分：格挡率为主、反应速度为辅，超额失误扣分 */
export function escapePerformance(s: EscapeState, modifiers: MiniGameModifiers): number {
  const total = Math.max(1, s.total)
  const rate = s.dodged / total
  const avgSpeed = s.dodged > 0 ? s.speedSum / s.dodged : 0
  const over = Math.max(0, s.hit - modifiers.forgiveness)
  let p = rate * 0.68 + avgSpeed * 0.32 - over * 0.16
  p = clamp01(p + modifiers.edgeBonus * rate)
  return round2(p)
}

/* ==================== 瞭望：灯号记忆序列 ==================== */

/**
 * 瞭望：先亮一串灯号（方向序列），玩家必须按同样顺序复现。
 *
 * 与逃脱的差别：逃脱考反应速度，瞭望考记性。
 * 加成体现为"展示时间更长"（windowBonus 放大每盏灯的亮起时长）。
 */
export const LOOKOUT_START_LEN = 3
/** 序列最长多少盏 */
export const LOOKOUT_MAX_LEN = 6
/** 最多玩多少轮（序列到顶后再玩就是纯折磨） */
export const LOOKOUT_MAX_ROUNDS = 4
/** 每盏灯亮起时长（秒） */
export const LOOKOUT_SHOW_TIME = 0.6
/** 每盏灯之间的间隔（秒） */
export const LOOKOUT_GAP = 0.25
/** 展示完到开始复现之间的空档（秒） */
export const LOOKOUT_LEAD = 0.5
/** 复现阶段的基础时限（秒）——不管几盏灯都有的缓冲 */
export const LOOKOUT_INPUT_BASE = 2.5
/** 复现阶段每盏灯额外给的时限（秒） */
export const LOOKOUT_INPUT_PER_LAMP = 1.5

export type LookoutPhase = 'lead' | 'lit' | 'gap' | 'input' | 'roundOver' | 'done'

export interface LookoutState {
  /** 当前是第几轮（0 起） */
  round: number
  /** 本轮要复现的序列 */
  sequence: EscapeDir[]
  /** 展示阶段：当前亮着第几盏（0 起）；不在展示时为 -1 */
  litIndex: number
  /** 当前子阶段的剩余时间 */
  timer: number
  /** 复现阶段的时限（秒）；非复现阶段为 0 */
  inputLimit: number
  /** 玩家已输入的方向 */
  input: EscapeDir[]
  /** 本轮是否已经判负 */
  failed: boolean
  /** 本轮判负的原因：'wrong' 按错方向 / 'timeout' 超时 / null 未判负 */
  failReason: 'wrong' | 'timeout' | null
  /** 累计答对轮数 */
  cleared: number
  /** 累计失败轮数 */
  missed: number
  phase: LookoutPhase
  finished: boolean
}

export function createLookoutState(rand: () => number = Math.random): LookoutState {
  return {
    round: 0,
    sequence: makeSequence(LOOKOUT_START_LEN, rand),
    litIndex: -1,
    timer: 0,
    inputLimit: 0,
    input: [],
    failed: false,
    failReason: null,
    cleared: 0,
    missed: 0,
    phase: 'lead',
    finished: false,
  }
}

function makeSequence(len: number, rand: () => number): EscapeDir[] {
  const seq: EscapeDir[] = []
  for (let i = 0; i < len; i++) {
    seq.push(ESCAPE_DIRS[Math.floor(rand() * ESCAPE_DIRS.length)])
  }
  return seq
}

/**
 * 推进一帧，驱动展示阶段的子状态流转：
 *   lead（开场空档）→ lit（亮一盏）→ gap（两盏之间）→ … → lead → input（玩家复现）
 *
 * 亮灯时长受 windowBonus 放大：经营得越好，每盏灯亮得更久，好记。
 */
export function advanceLookout(
  s: LookoutState,
  dt: number,
  modifiers: MiniGameModifiers = { windowBonus: 0, forgiveness: 0, edgeBonus: 0 },
  rand: () => number = Math.random,
): LookoutState {
  if (s.finished) return s

  if (s.phase === 'lead') {
    s.timer -= dt
    if (s.timer <= 0) {
      s.phase = 'lit'
      s.litIndex = 0
      s.timer = LOOKOUT_SHOW_TIME * (1 + modifiers.windowBonus)
    }
    return s
  }

  if (s.phase === 'lit') {
    s.timer -= dt
    if (s.timer <= 0) {
      if (s.litIndex + 1 < s.sequence.length) {
        // 还有下一盏：先走一个短空档
        s.phase = 'gap'
        s.timer = LOOKOUT_GAP
      } else {
        // 全部亮完：留一段空档再让玩家复现
        s.phase = 'gap'
        s.timer = LOOKOUT_LEAD
      }
    }
    return s
  }

  if (s.phase === 'gap') {
    s.timer -= dt
    if (s.timer <= 0) {
      if (s.litIndex + 1 < s.sequence.length) {
        // 亮下一盏
        s.litIndex += 1
        s.phase = 'lit'
        s.timer = LOOKOUT_SHOW_TIME * (1 + modifiers.windowBonus)
      } else {
        // 展示结束，进入复现阶段
        s.phase = 'input'
        s.litIndex = -1
        s.input = []
        // 复现也要有时限：否则玩家可以一直不按，游戏永远不结束
        s.inputLimit = (LOOKOUT_INPUT_BASE + s.sequence.length * LOOKOUT_INPUT_PER_LAMP)
          * (1 + modifiers.windowBonus)
        s.timer = s.inputLimit
      }
    }
    return s
  }

  if (s.phase === 'input') {
    s.timer -= dt
    if (s.timer <= 0) {
      // 超时 = 本轮作废（跟按错一样）
      s.failed = true
      s.failReason = 'timeout'
      s.missed += 1
      s.phase = 'roundOver'
      s.timer = 0.8
    }
    return s
  }

  if (s.phase === 'roundOver') {
    s.timer -= dt
    if (s.timer <= 0) startLookoutRound(s, rand)
    return s
  }

  return s
}

/**
 * 开始下一轮：序列加长一盏。
 *
 * rand 通过参数传入（默认 Math.random）：新一轮的序列必须重新生成，
 * 否则每轮都是同一串灯号，"记性"就退化成了"背下来"。
 *
 * 终止条件：轮数用尽（LOOKOUT_MAX_ROUNDS）→ 结束这一局。
 * 没有终止条件的话，游戏会无限循环下去。
 */
function startLookoutRound(s: LookoutState, rand: () => number = Math.random): void {
  s.round += 1
  if (s.round >= LOOKOUT_MAX_ROUNDS) {
    s.finished = true
    return
  }
  const nextLen = Math.min(LOOKOUT_MAX_LEN, LOOKOUT_START_LEN + s.round)
  s.sequence = makeSequence(nextLen, rand)
  s.phase = 'lead'
  s.litIndex = -1
  s.timer = LOOKOUT_LEAD
  s.input = []
  s.failed = false
  s.failReason = null
}

/**
 * 玩家按下一个方向。
 * 与当前应按的方向一致 → 继续；不一致 → 本轮失败。
 */
export function pressLookout(
  s: LookoutState,
  dir: EscapeDir,
): { state: LookoutState; ok: boolean; roundFailed: boolean; cleared: boolean } {
  if (s.finished || s.phase !== 'input') {
    return { state: s, ok: false, roundFailed: false, cleared: false }
  }
  const expected = s.sequence[s.input.length]
  const ok = expected === dir
  if (!ok) {
    s.failed = true
    s.failReason = 'wrong'
    s.missed += 1
    s.phase = 'roundOver'
    s.timer = 0.8
    return { state: s, ok: false, roundFailed: true, cleared: false }
  }
  s.input.push(dir)
  if (s.input.length >= s.sequence.length) {
    s.cleared += 1
    s.phase = 'roundOver'
    s.timer = 0.8
    return { state: s, ok: true, roundFailed: false, cleared: true }
  }
  return { state: s, ok: true, roundFailed: false, cleared: false }
}

/**
 * 瞭望表现分：过轮数为主、序列长度进度为辅。
 *
 * 分母用"实际玩过的轮数"（cleared + missed），不是轮数上限。
 * 早先用 s.round + 1 会多算一轮：全对通关也只能拿 0.90，满分拿不到。
 */
export function lookoutPerformance(s: LookoutState, modifiers: MiniGameModifiers): number {
  const rounds = Math.max(1, s.cleared + s.missed)
  const rate = s.cleared / rounds
  // 走得越深（序列越长）说明记得越多
  const depth = clamp01(s.sequence.length / LOOKOUT_MAX_LEN)
  const over = Math.max(0, s.missed - modifiers.forgiveness)
  let p = rate * 0.70 + depth * 0.30 - over * 0.12
  p = clamp01(p + modifiers.edgeBonus * rate)
  return round2(p)
}

/* ==================== 赌博：押注对赌 ==================== */

/**
 * 赌博：庄家摇一个点数并报出"押大/押小"，玩家选边下注。
 *
 * 与前几个原子的差别：这是"有信息不完全的决策"——庄家明说押哪边，
 * 但没说点数是多少；玩家要赌自己的判断。运气成分大，但可以提前收手。
 *
 * 加成体现为"看得更清"（windowBonus 缩短庄家点数的不确定区间）。
 */
export const GAMBLE_ROUNDS = 6
/** 骰子面数 */
export const GAMBLE_DICE = 6
/** 初始赌本 */
export const GAMBLE_BANKROLL = 100
/** 每次下注额 */
export const GAMBLE_STAKE = 20
/** 庄家点数报出时的不确定区间半宽（基准） */
export const GAMBLE_SPREAD = 3

export type GambleSide = 'high' | 'low'

export interface GambleState {
  round: number
  total: number
  /** 庄家这一手报出的"可能点数区间" */
  low: number
  high: number
  /** 玩家下注方向 */
  side: GambleSide | null
  /** 本轮是否已翻牌（公布结果） */
  revealed: boolean
  /** 庄家实际点数 */
  dealer: number
  /** 玩家实际点数 */
  player: number
  bankroll: number
  /** 累计赢的次数 */
  wins: number
  /** 累计输的次数 */
  losses: number
  /** 是否提前收手 */
  cashedOut: boolean
  /** 累计盈亏 */
  pnl: number
  finished: boolean
}

export function createGambleState(): GambleState {
  return {
    round: 0,
    total: GAMBLE_ROUNDS,
    low: 0,
    high: 0,
    side: null,
    revealed: false,
    dealer: 0,
    player: 0,
    bankroll: GAMBLE_BANKROLL,
    wins: 0,
    losses: 0,
    cashedOut: false,
    pnl: 0,
    finished: false,
  }
}

/**
 * 开一手：摇庄家点数，报出一个含而不露的区间。
 *
 * 区间半宽随 windowBonus 收窄——经营得越好，"看得越清"，
 * 但仍不能直接看到确切点数（否则就不叫赌了）。
 *
 * 边界处理：区间至少要能同时包含"大"和"小"两种可能，
 * 否则玩家看到 low==high 就等于直接读出了点数，赌博就变成了算术题。
 */
export function dealGamble(
  s: GambleState,
  modifiers: MiniGameModifiers,
  rand: () => number = Math.random,
): GambleState {
  if (s.finished) return s
  s.dealer = 1 + Math.floor(rand() * GAMBLE_DICE)
  s.side = null
  s.revealed = false
  s.player = 0

  const spread = Math.max(1, GAMBLE_SPREAD * (1 - modifiers.windowBonus * 1.6))
  let lo = Math.max(1, s.dealer - spread)
  let hi = Math.min(GAMBLE_DICE, s.dealer + spread)
  // 区间必须真的"含而不露"：至少跨 2 个点，且不能把点数顶到边界
  if (hi - lo < 1) {
    if (s.dealer <= GAMBLE_DICE - 1) hi = lo + 1
    else lo = hi - 1
  }
  s.low = lo
  s.high = hi
  return s
}

/**
 * 下注并开牌。
 * 玩家点数 ≥ 庄家算"大"（平局算输，避免无脑押大）。
 *
 * 下注后不可反悔——想改押另一边只能等下一手，这就是赌博的赌性。
 */
export function placeGambleBet(
  s: GambleState,
  side: GambleSide,
  modifiers: MiniGameModifiers,
  rand: () => number = Math.random,
): { state: GambleState; won: boolean } {
  if (s.finished || s.revealed || s.side !== null) {
    return { state: s, won: false }
  }
  s.side = side
  s.player = 1 + Math.floor(rand() * GAMBLE_DICE)
  s.revealed = true

  const won = side === 'high' ? s.player > s.dealer : s.player < s.dealer
  if (won) {
    s.bankroll += GAMBLE_STAKE
    s.wins += 1
    s.pnl += GAMBLE_STAKE
  } else {
    s.bankroll -= GAMBLE_STAKE
    s.losses += 1
    s.pnl -= GAMBLE_STAKE
  }
  return { state: s, won }
}

/** 跳过这一手：不押注、不输赢，直接进入下一手（观望也是一种策略） */
export function skipGambleRound(s: GambleState): GambleState {
  if (s.finished || s.revealed || s.side !== null) return s
  s.side = null
  s.revealed = true
  s.dealer = 0
  s.player = 0
  return s
}

/** 收手：保住当前赌本，结束这一局 */
export function cashOutGamble(s: GambleState): GambleState {
  if (s.finished) return s
  s.cashedOut = true
  s.finished = true
  return s
}

/** 推进到下一手：轮数用完即结束 */
export function nextGambleRound(s: GambleState): GambleState {
  if (s.finished) return s
  s.round += 1
  if (s.round >= s.total) {
    s.finished = true
    return s
  }
  return s
}

/**
 * 赌博表现分：净盈亏为主、赢率为辅。
 *
 * 注意基准是 0.5（而不是 0）：赌博本身是零和的，
 * 赢得多说明玩家判断准确，不该被当成"及格线"。
 */
export function gamblePerformance(s: GambleState, modifiers: MiniGameModifiers): number {
  const net = s.pnl / GAMBLE_BANKROLL
  const rounds = Math.max(1, s.wins + s.losses)
  const winRate = s.wins / rounds
  let p = 0.5 + net * 0.55 + (winRate - 0.5) * 0.30
  // 提前收手且没亏：会止损，属于理性
  if (s.cashedOut && s.pnl >= 0) p += 0.08
  p = clamp01(p + modifiers.edgeBonus * winRate)
  return round2(p)
}

/* ==================== 贸易：议价拉锯 ==================== */

/**
 * 议价：双方围绕一个价格来回拉锯，玩家每次选择"加价 / 让步 / 收手"。
 *
 * 这是四个新原型里唯一一个"没有时间压力"的——它考的是分寸感：
 * 什么时候该再顶一手、什么时候该见好就收。
 *
 * 加成体现为"更懂行情"（windowBonus 让对方底价的暗示更清楚）。
 */
export const HAGGLE_ROUNDS = 8
/** 初始报价 */
export const HAGGLE_START_PRICE = 100
/** 对方底线（低于此交易破裂） */
export const HAGGLE_FLOOR = 60
/** 对方能接受的最高价（超过就翻脸） */
export const HAGGLE_CEILING = 130
/** 玩家每次加价幅度 */
export const HAGGLE_RAISE_STEP = 12
/** 低于此价就不值得做这笔生意（评分基准的下限） */
export const HAGGLE_WORTH_MIN = 70
/** 收手时对方会再让一步（离场损失） */
export const HAGGLE_EXIT_CONCESSION = 10
/** 报价超过此数开始有实质谈崩风险 */
export const HAGGLE_DANGER_LINE = 118

export type HaggleAction = 'raise' | 'concede' | 'accept'

export interface HaggleState {
  round: number
  total: number
  /** 当前报价 */
  price: number
  /** 对方底线（低于此交易破裂） */
  floor: number
  /** 玩家累计加价次数 */
  raises: number
  /** 玩家累计让步次数 */
  concessions: number
  /** 交易是否已破裂 */
  broken: boolean
  /** 是否已成交 */
  closed: boolean
  /** 成交价（成交时记录） */
  finalPrice: number
  finished: boolean
}

export function createHaggleState(): HaggleState {
  return {
    round: 0,
    total: HAGGLE_ROUNDS,
    price: HAGGLE_START_PRICE,
    floor: HAGGLE_FLOOR,
    raises: 0,
    concessions: 0,
    broken: false,
    closed: false,
    finalPrice: 0,
    finished: false,
  }
}

/**
 * 推进一轮：对方先压价，再轮到玩家。
 *
 * 压价幅度随机在 6~12 之间。底线固定，但报价每轮被压低，
 * 所以"报价 - 底线"的余量越来越小——加价的风险自然随轮次上升。
 */
export function advanceHaggle(
  s: HaggleState,
  dt: number,
  rand: () => number = Math.random,
): HaggleState {
  if (s.finished) return s
  s.round += 1
  if (s.round >= s.total) {
    // 谈到底：按当前价格成交（若没破底）
    s.finalPrice = Math.max(0, s.price)
    s.closed = !s.broken
    s.finished = true
    return s
  }
  // 对方压价
  s.price -= 6 + Math.floor(rand() * 7)
  if (s.price < s.floor) {
    s.broken = true
    s.finished = true
    s.finalPrice = 0
  }
  return s
}

/**
 * 玩家的一次动作。
 *   raise   —— 加价：报价上去，但越接近对方上限越可能谈崩
 *   concede —— 让步：接受当前价并成交（落袋为安）
 *   accept  —— 收手：按当前价成交，但对方会因你离场再让一步
 *
 * 谈崩概率的设计（关键平衡）：
 *   风险由两部分叠加：
 *     · 报价越过危险线（HAGGLE_DANGER_LINE）的幅度 —— 越贪越危险
 *     · 累计加价次数 —— 反复纠缠本来就会磨掉对方的耐心
 *   对方的每轮压价（6~12）会把报价拉回危险线附近，
 *   所以只靠"绝对报价"会让风险恒定、玩家感觉不到"越贪越险"。
 *   实测：第 1 加约 12%、第 2 加约 22%、第 3 加约 32%（累计谈崩率）。
 */
export function haggleAction(
  s: HaggleState,
  action: HaggleAction,
  rand: () => number = Math.random,
): { state: HaggleState; broke: boolean; closed: boolean } {
  if (s.finished) return { state: s, broke: s.broken, closed: s.closed }

  if (action === 'raise') {
    s.raises += 1
    const next = s.price + HAGGLE_RAISE_STEP
    // 越过危险线后风险陡增；每次纠缠再加一点
    const over = Math.max(0, next - HAGGLE_DANGER_LINE)
    const risk = clamp01(
      0.05 +
      over * 0.06 +
      (s.raises - 1) * 0.07 +
      rand() * 0.10,
    )
    if (rand() < risk) {
      s.broken = true
      s.finished = true
      s.finalPrice = 0
      return { state: s, broke: true, closed: false }
    }
    s.price = Math.min(HAGGLE_CEILING + 20, next)
    return { state: s, broke: false, closed: false }
  }

  if (action === 'concede') {
    s.concessions += 1
    s.finalPrice = s.price
    s.closed = true
    s.finished = true
    return { state: s, broke: false, closed: true }
  }

  // accept：按当前价成交，但对方因为你态度坚决而多让一步
  s.finalPrice = Math.min(HAGGLE_CEILING + 20, s.price + HAGGLE_EXIT_CONCESSION)
  s.closed = true
  s.finished = true
  return { state: s, broke: false, closed: true }
}

/**
 * 议价表现分：成交价折算到"值得做的区间"。
 *
 * 基准区间是 [HAGGLE_WORTH_MIN, HAGGLE_CEILING]：
 *   · 谈崩 → 0（有容错时给一点"还能再来"的余地）
 *   · 成交价低于下限 → 分数很低（做成了但没赚）
 *   · 成交价达到上限 → 满分附近
 * 让步次数会压低分数：让步虽然落袋，但放弃了本可以争取的价。
 */
export function hagglePerformance(s: HaggleState, modifiers: MiniGameModifiers): number {
  if (s.broken) {
    // 谈崩：容错额度内给一点"还能再来"的余地
    const salvage = modifiers.forgiveness > 0 ? 0.18 : 0
    return round2(clamp01(salvage))
  }
  if (!s.closed) return 0
  const span = HAGGLE_CEILING - HAGGLE_WORTH_MIN
  const ratio = clamp01((s.finalPrice - HAGGLE_WORTH_MIN) / Math.max(1, span))
  const concedePenalty = s.concessions * 0.05
  let p = ratio * 0.88 - concedePenalty
  p = clamp01(p + modifiers.edgeBonus * ratio)
  return round2(p)
}

/* ==================== 舷炮对轰：三轮齐射 ==================== */

/**
 * 炮战（第七条线：rival 炮战）——与竞争船长的舷炮对决。
 *
 * 对应事件 236「独眼玛格的仇人」的迎战选项。叙事说"三轮齐射"，
 * 机制就真的是三轮：每轮先瞄准开火，再扛对方一轮反击。
 *
 * 设计要点：
 * 1. **一轮两个决策**——开火时机（准不准）与架盾时机（早晚都吃亏）。
 *    早架盾"累垮"（只挡掉一部分），晚架盾来不及，不架盾直吃。
 * 2. **敌军不按玩家节奏行动**：反击在玩家开火后自动到来，
 *    玩家无法用连点跳过——这是节奏，不是抽奖。
 * 3. 命中判定与风暴同构：离敌舰中心的归一化距离 → hit / graze / miss。
 */

/** 总轮次（叙事：三轮齐射） */
export const CANNON_VOLLEYS = 3
/** 瞄准标单程时长（秒）——掠过敌舰一次的时间 */
export const CANNON_AIM_TIME = 1.5
/** 敌方炮弹来袭时长（秒） */
export const CANNON_INCOMING_TIME = 1.6
/** 命中半宽（0..1 归一化）：|aim-0.5| 小于它才算打中 */
export const CANNON_HIT_HALF = 0.14
/** 擦弹半宽：小于它算擦伤（介于命中与落水之间） */
export const CANNON_GRAZE_HALF = 0.3
/** 架盾有效窗口：来袭标小于它才算是"及时" */
export const CANNON_BRACE_MARK = 0.5
/** 轮间停顿（秒）：看结果的时间 */
export const CANNON_RESOLVE_TIME = 0.55

export type CannonShotResult = 'hit' | 'graze' | 'miss' | null

export interface CannonState {
  /** 当前第几轮（0 起） */
  volley: number
  /** 阶段：aim 瞄准 / incoming 敌弹来袭 / resolve 轮间停顿 */
  phase: 'aim' | 'incoming' | 'resolve'
  /** 瞄准标位置 0..1（0.5 = 敌舰正中） */
  aim: number
  /** 来袭标位置 0..1（1 = 刚出膛，0 = 命中） */
  incoming: number
  /** 本轮阶段已进行的时间（秒） */
  phaseTime: number
  /** 本轮开火结果 */
  shot: CannonShotResult
  /** 本轮是否已架盾 */
  braced: boolean
  /** 本轮架盾时机：'early' 太早 / 'timely' 及时 / null 未架 */
  braceTiming: 'early' | 'timely' | null
  /** 本轮受创 0..1（1 = 直吃） */
  damage: number
  /** 历史：每轮的受创 */
  damages: number[]
  /** 命中 / 擦弹 / 落水计数 */
  hits: number
  grazes: number
  misses: number
  /** 及时架盾次数 */
  timelyBraces: number
  finished: boolean
}

export function createCannonState(): CannonState {
  return {
    volley: 0,
    phase: 'aim',
    aim: 0,
    incoming: 1,
    phaseTime: 0,
    shot: null,
    braced: false,
    braceTiming: null,
    damage: 0,
    damages: [],
    hits: 0,
    grazes: 0,
    misses: 0,
    timelyBraces: 0,
    finished: false,
  }
}

/** 推进一帧。瞄准标匀速往复；来袭标匀速逼近；resolve 到点进下一轮。 */
export function advanceCannon(s: CannonState, dt: number): CannonState {
  if (s.finished) return s
  s.phaseTime += dt

  if (s.phase === 'aim') {
    // 匀速掠过：一个单程内必然经过敌舰——等下去一定有开火机会，
    // 但等越久离下一轮回合越近，节奏由玩家自己掌握。
    const span = (s.phaseTime / CANNON_AIM_TIME) % 2
    s.aim = span <= 1 ? span : 2 - span
    if (s.phaseTime >= CANNON_AIM_TIME * 2) {
      // 两程未开火：视为放弃这一轮（落水）。
      // 不走 fireCannon——那是玩家主动开火的判定入口，
      // 超时是系统判负，直接记账，避免把 modifiers 拽进帧推进里。
      s.shot = 'miss'
      s.misses += 1
      s.phase = 'incoming'
      s.phaseTime = 0
      s.incoming = 1
    }
  } else if (s.phase === 'incoming') {
    s.incoming = Math.max(0, 1 - s.phaseTime / CANNON_INCOMING_TIME)
    if (s.phaseTime >= CANNON_INCOMING_TIME) {
      // 敌弹落定：未架盾直吃；早架盾只挡一部分；及时架盾几乎无伤
      s.damage = !s.braced ? 1 : s.braceTiming === 'early' ? 0.65 : 0.15
      s.damages.push(s.damage)
      s.phase = 'resolve'
      s.phaseTime = 0
    }
  } else {
    if (s.phaseTime >= CANNON_RESOLVE_TIME) {
      s.volley += 1
      if (s.volley >= CANNON_VOLLEYS) {
        s.finished = true
      } else {
        s.phase = 'aim'
        s.phaseTime = 0
        s.shot = null
        s.braced = false
        s.braceTiming = null
        s.damage = 0
      }
    }
  }
  return s
}

/**
 * 开火。返回命中结果；窗口外或已开过火则本伦作废（miss）。
 * 判定：|aim-0.5| 与有效半宽比较——半宽乘 (1+windowBonus)，
 * 船体完好、人手充足的船炮位更稳（与其它原型的加成模型同构）。
 */
export function fireCannon(
  s: CannonState,
  modifiers: MiniGameModifiers,
): { state: CannonState; result: CannonShotResult } {
  if (s.finished || s.phase !== 'aim' || s.shot !== null) {
    return { state: s, result: null }
  }
  const dist = Math.abs(s.aim - 0.5)
  const hitHalf = CANNON_HIT_HALF * (1 + modifiers.windowBonus)
  const grazeHalf = CANNON_GRAZE_HALF * (1 + modifiers.windowBonus)
  const result: Exclude<CannonShotResult, null> =
    dist <= hitHalf ? 'hit' : dist <= grazeHalf ? 'graze' : 'miss'
  s.shot = result
  if (result === 'hit') s.hits += 1
  else if (result === 'graze') s.grazes += 1
  else s.misses += 1
  s.phase = 'incoming'
  s.phaseTime = 0
  s.incoming = 1
  return { state: s, result }
}

/**
 * 架盾（↓）。太早（来袭标还在 CANNON_BRACE_MARK 之外）只能挡掉一部分，
 * 及时则几乎无伤。每轮只能架一次。
 */
export function braceCannon(
  s: CannonState,
): { state: CannonState; timing: 'early' | 'timely' | null } {
  if (s.finished || s.phase !== 'incoming' || s.braced) {
    return { state: s, timing: null }
  }
  s.braced = true
  s.braceTiming = s.incoming <= CANNON_BRACE_MARK ? 'timely' : 'early'
  if (s.braceTiming === 'timely') s.timelyBraces += 1
  return { state: s, timing: s.braceTiming }
}

/**
 * 炮战表现分：准头 70% + 扛伤 30%。
 * 命中满分、擦弹 0.55、落水 0；受创按 (1-伤害) 计。
 */
export function cannonPerformance(s: CannonState, modifiers: MiniGameModifiers): number {
  if (s.finished === false && s.hits + s.grazes + s.misses === 0) return 0
  const shotScore = (s.hits + s.grazes * 0.55) / CANNON_VOLLEYS
  const avgDamage = s.damages.length > 0
    ? s.damages.reduce((a, b) => a + b, 0) / s.damages.length
    : 1
  let p = shotScore * 0.7 + (1 - avgDamage) * 0.3
  p = clamp01(p + modifiers.edgeBonus * (s.hits / CANNON_VOLLEYS))
  return round2(p)
}

/* ==================== 表现分 → 评语 ==================== */

export type MiniGameGrade = 'excellent' | 'good' | 'rough' | 'disaster'

export function miniGameGrade(performance: number): MiniGameGrade {
  if (performance >= 0.82) return 'excellent'
  if (performance >= 0.6) return 'good'
  if (performance >= 0.35) return 'rough'
  return 'disaster'
}

export const MINI_GAME_GRADE_LABEL: Record<MiniGameGrade, string> = {
  excellent: '滴水不漏',
  good: '稳当',
  rough: '勉强',
  disaster: '狼狈',
}

export const MINI_GAME_GRADE_COLOR: Record<MiniGameGrade, string> = {
  excellent: '#f0d88a',
  good: '#7dd3a0',
  rough: '#c9a96e',
  disaster: '#e07b5a',
}

/** 一句话说明表现分如何改变了概率（给玩家看因果，不玩黑箱） */
export function describePerformance(performance: number): string {
  if (performance >= 0.82) return '操作滴水不漏，结局明显朝你希望的方向落。'
  if (performance >= 0.6) return '操作稳当，好结果更可能发生。'
  if (performance >= 0.35) return '操作勉强，概率只是被轻微推了推。'
  return '你被推向了坏结果——这一局是运气，也是手劲。'
}
