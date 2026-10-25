/**
 * 操舵挑战（第三条线：实时操作）——纯逻辑层。
 *
 * 设计意图：把"航行"从点一下地图等进度条，变成一段可以真操作的 15 秒。
 * 玩家用键盘控船首向与帆缆，让船尽量长时间待在风向有利区里；
 * 风向本身在缓慢摆动，并周期性来阵风——考验的是读风与提前量。
 *
 * 本文件不碰 React / store，全部纯函数 + 可注入 rand，方便单测。
 */

/** 挑战总时长（秒） */
export const HELM_DURATION = 15
/** 基础转向速率（度/秒） */
export const HELM_TURN_RATE = 75
/** 有利区半角：航向与风向夹角小于该值算"吃风" */
export const HELM_FAVOR_ARC = 50
/** 阵风间隔（秒） */
export const HELM_GUST_INTERVAL = 4.2

export const HELM_KEYS = {
  left: ['a', 'arrowleft'],
  right: ['d', 'arrowright'],
  trimUp: ['w', 'arrowup'],
  trimDown: ['s', 'arrowdown'],
} as const

/** 角度归一到 0..360 */
export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** 两个角之间的最小夹角（0..180） */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(normalizeAngle(a) - normalizeAngle(b))
  return d > 180 ? 360 - d : d
}

/**
 * 风向有利度：与 navigation.windFavorForBearing 同一模型（cos 映射 0.6..1.4），
 * 保证"海图上的预估"和"操舵时的实感"是同一套物理。
 * 1.4 = 正顺风，0.6 = 正顶风。
 */
export function helmFavor(heading: number, wind: number): number {
  const angle = angleDiff(heading, wind)
  const cos = Math.cos(angle * Math.PI / 180)
  return Math.round((1 + cos * 0.4) * 100) / 100
}

/** 是否处在有利区（夹角 ≤ HELM_FAVOR_ARC） */
export function inFavorArc(heading: number, wind: number): boolean {
  return angleDiff(heading, wind) <= HELM_FAVOR_ARC
}

/** 帆缆状态：trim 0..1（0=松帆慢行，1=收满帆） */
export interface HelmShipState {
  heading: number
  trim: number
}

export interface HelmInput {
  /** -1 左转 / 0 / +1 右转 */
  turn: -1 | 0 | 1
  /** -1 松帆 / 0 / +1 收帆 */
  trimDelta: -1 | 0 | 1
}

/**
 * 帧推进：转向速率受帆缆影响——帆收得紧，舵响应更快（帆受风面积大、舵效好）；
 * 帆松垮则船反应迟钝。dt 秒。
 */
export function advanceHelmShip(
  state: HelmShipState,
  input: HelmInput,
  dt: number,
): HelmShipState {
  const turnRate = HELM_TURN_RATE * (0.75 + state.trim * 0.55)
  const heading = normalizeAngle(state.heading + input.turn * turnRate * dt)
  const trim = Math.max(0, Math.min(1, state.trim + input.trimDelta * dt * 0.9))
  return { heading, trim }
}

/**
 * 风场仿真：基准风 + 慢摆 + 阵风。
 * 阵风是离散事件：每 GUST_INTERVAL 秒触发一次，快速起风再缓慢平息，
 * 由 rand 决定方向与强度（测试可注入固定序列）。
 */
export class HelmWindSim {
  private readonly base: number
  private readonly rand: () => number
  private t = 0
  private gustTimer = 0
  /** 当前阵风偏移（度），正=风顺时针偏 */
  gust = 0
  /** 阵风目标偏移 */
  private gustTarget = 0
  /** 阵风剩余生命周期（秒），<=0 表示无阵风 */
  private gustLife = 0
  /** 本帧是否刚起阵风（供 UI 闪警示） */
  gustStarted = false

  constructor(baseWind: number, rand: () => number = Math.random) {
    this.base = normalizeAngle(baseWind)
    this.rand = rand
  }

  /** 推进 dt 秒并返回当前风向（风吹去的罗盘方位） */
  update(dt: number): number {
    this.t += dt
    this.gustTimer += dt
    this.gustStarted = false
    if (this.gustTimer >= HELM_GUST_INTERVAL && this.gustLife <= 0) {
      this.gustTimer = 0
      // 阵风强度 22°..42°，方向随机
      this.gustTarget = (this.rand() * 2 - 1) * 20 + (this.rand() > 0.5 ? 22 : -22)
      this.gustTarget = Math.sign(this.gustTarget) * (22 + this.rand() * 20)
      this.gustLife = 2.2
      this.gustStarted = true
    }
    if (this.gustLife > 0) {
      this.gustLife -= dt
      // 起风 0.35s 内快速到位，随后 1.8s 线性衰减回 0
      const age = 2.2 - this.gustLife
      const ramp = age < 0.35 ? age / 0.35 : 1
      const decay = age < 0.35 ? 1 : Math.max(0, 1 - (age - 0.35) / 1.85)
      this.gust = this.gustTarget * ramp * decay
      if (this.gustLife <= 0) this.gust = 0
    } else {
      this.gust = 0
    }
    // 慢摆 ±18°，周期约 18s
    const sway = Math.sin(this.t * 0.35) * 18
    return normalizeAngle(this.base + sway + this.gust)
  }
}

/** 一次采样 */
export interface HelmSample {
  t: number
  favor: number
  inArc: boolean
}

export interface HelmRunResult {
  /** 综合评分 0..1 */
  score: number
  /** 平均风向有利度（0.6..1.4） */
  avgFavor: number
  /** 处在有利区的时间占比 0..1 */
  timeInArcRatio: number
  /** 最长连续吃风时长（秒） */
  bestStreak: number
  /** 样本数 */
  samples: number
}

/** 空结果（无样本时的兜底） */
export function emptyHelmResult(): HelmRunResult {
  return { score: 0, avgFavor: 0.6, timeInArcRatio: 0, bestStreak: 0, samples: 0 }
}

/**
 * 评估一次操舵：均风换算成 0..1 评分，兼顾驻留有利区的时间与最长连击。
 * score = clamp01((avgFavor - 0.6) / 0.8) 的 0.8 权重 + 连击的 0.2 权重。
 * 连击时长按采样时间戳折算成秒（不假设固定帧率）。
 */
export function evaluateHelmRun(samples: HelmSample[]): HelmRunResult {
  if (samples.length === 0) return emptyHelmResult()
  let favorSum = 0
  let arcCount = 0
  let streakStart = 0
  let bestStreak = 0
  for (const s of samples) {
    favorSum += s.favor
    if (s.inArc) {
      arcCount++
      if (s.t - streakStart > bestStreak) bestStreak = s.t - streakStart
    } else {
      streakStart = s.t
    }
  }
  const avgFavor = favorSum / samples.length
  const timeInArcRatio = arcCount / samples.length
  // 连击按"满连击 = HELM_DURATION 秒"归一
  const streakScore = Math.min(1, bestStreak / HELM_DURATION)
  const favorScore = Math.max(0, Math.min(1, (avgFavor - 0.6) / 0.8))
  const score = Math.round((favorScore * 0.8 + streakScore * 0.2) * 1000) / 1000
  return {
    score,
    avgFavor: Math.round(avgFavor * 100) / 100,
    timeInArcRatio: Math.round(timeInArcRatio * 100) / 100,
    bestStreak: Math.round(bestStreak * 10) / 10,
    samples: samples.length,
  }
}

export type HelmGrade = 'legend' | 'good' | 'steady' | 'poor'

export interface HelmReward {
  grade: HelmGrade
  /** 评级称号 */
  label: string
  /** 沿当前航线真实推进的剩余航程比例（0..0.15）——操作好真的省时间 */
  progressBonus: number
  morale: number
  /** 旗舰耐久变化（poor 时颠簸受损） */
  wear: number
  fame: number
  /** 评语 */
  comment: string
}

/** 评级奖励表：分数越高，省下的航程越多 */
export function helmReward(result: HelmRunResult): HelmReward {
  const { score, bestStreak } = result
  if (score >= 0.85 && bestStreak >= HELM_DURATION * 0.35) {
    return {
      grade: 'legend',
      label: '传奇舵手',
      progressBonus: 0.15,
      morale: 4,
      wear: 0,
      fame: 1,
      comment: '整段航程你都咬在风的咽喉上——连老水手都过来讨教。',
    }
  }
  if (score >= 0.7) {
    return {
      grade: 'good',
      label: '老练舵手',
      progressBonus: 0.1,
      morale: 2,
      wear: 0,
      fame: 0,
      comment: '舵轮在你手里服服帖帖，省下了小半日航程。',
    }
  }
  if (score >= 0.5) {
    return {
      grade: 'steady',
      label: '稳稳到港',
      progressBonus: 0.05,
      morale: 1,
      wear: 0,
      fame: 0,
      comment: '有几个瞬间吃了顶风，但总体没让船吃亏。',
    }
  }
  return {
    grade: 'poor',
    label: '偏航颠簸',
    progressBonus: 0.02,
    morale: -2,
    wear: -3,
    fame: 0,
    comment: '帆脚索缠成了团，船在浪里颠得够呛——下次读风要趁早。',
  }
}

/** 评级对应的展示色（与全局色板一致） */
export const HELM_GRADE_COLOR: Record<HelmGrade, string> = {
  legend: '#f0d88a',
  good: '#7dd3a0',
  steady: '#c9a96e',
  poor: '#e07b5a',
}
