import type { GameEvent, GameState, EventOutcome, FactionId, NotorietyAxis } from '@/types'
import { ports } from '@/data/ports'
import { biasProbabilities } from '@/utils/miniGame'
import { seasonAt } from '@/utils/season'

export function checkEventTrigger(
  event: GameEvent,
  gameState: GameState,
  /**
   * 随机数源。默认 Math.random；传固定值可以**复现同一次掷值**。
   *
   * 【为什么需要这个参数】"天生探险家"把发现类事件概率 ×1.3，但玩家看不到
   * 它起过作用。要判断"这一场遭遇是不是天赋给的"，只能拿**同一个掷值**
   * 分别跑"有天赋"和"没天赋"两遍 —— 随机数一旦重新取，就没有对照了。
   */
  rand: () => number = Math.random,
): boolean {
  const { triggerCondition } = event
  const { fleet, currentRoute } = gameState

  if (triggerCondition.minDay !== undefined && fleet.day < triggerCondition.minDay) {
    return false
  }

  if (triggerCondition.maxMorale !== undefined && fleet.morale > triggerCondition.maxMorale) {
    return false
  }

  if (triggerCondition.region) {
    let inRegion = false
    if (fleet.currentPortId) {
      const port = ports.find(p => p.id === fleet.currentPortId)
      if (port && port.region === triggerCondition.region) inRegion = true
    }
    if (!inRegion && currentRoute) {
      const fromPort = ports.find(p => p.id === currentRoute.fromPortId)
      const toPort = ports.find(p => p.id === currentRoute.toPortId)
      if (
        (fromPort && fromPort.region === triggerCondition.region) ||
        (toPort && toPort.region === triggerCondition.region)
      ) {
        inRegion = true
      }
    }
    if (!inRegion) return false
  }

  if (triggerCondition.dangerLevelMin !== undefined) {
    if (!currentRoute || currentRoute.dangerLevel < triggerCondition.dangerLevelMin) {
      return false
    }
  }

  // 事件链：需要全部持有才触发
  const flags = gameState.eventFlags ?? {}
  if (triggerCondition.requiresFlags) {
    if (!triggerCondition.requiresFlags.every(f => flags[f])) return false
  }
  // 收集类防重：持有任一旗标则不触发
  if (triggerCondition.conflictsWithFlags) {
    if (triggerCondition.conflictsWithFlags.some(f => flags[f])) return false
  }

  // 第二条线：派系声望门槛（王室的密令、兄弟会的请柬……）
  const rep = gameState.factionRep ?? {}
  if (triggerCondition.factionMin) {
    for (const [fid, min] of Object.entries(triggerCondition.factionMin)) {
      if ((rep[fid as FactionId] ?? 0) < (min ?? 0)) return false
    }
  }
  if (triggerCondition.factionMax) {
    for (const [fid, max] of Object.entries(triggerCondition.factionMax)) {
      if ((rep[fid as FactionId] ?? 0) > (max ?? 0)) return false
    }
  }

  // 第二条线：名船员门槛（个人事件只找得到人）
  if (triggerCondition.requiresCrew) {
    const roster = gameState.crewRoster ?? []
    if (!triggerCondition.requiresCrew.some(id => roster.some(m => m.id === id))) return false
  }

  // 第二条线：身份取向门槛（"铁腕"路线才有铁腕的选择）
  const notoriety = gameState.notoriety ?? {}
  if (triggerCondition.notorietyMin) {
    for (const [axis, min] of Object.entries(triggerCondition.notorietyMin)) {
      if ((notoriety[axis as NotorietyAxis] ?? 0) < (min ?? 0)) return false
    }
  }

  // 探险家特质：发现类事件触发率 +30%
  let probability = triggerCondition.probability
  if (fleet.trait === 'explorer' && event.type === 'discovery') {
    probability *= 1.3
  }
  // 第二条线：随船学者同样擅长撞见奇遇
  if ((gameState.crewRoster ?? []).some(m => m.id === 'scholar') && event.type === 'discovery') {
    probability *= 1.2
  }
  /*
   * 黑旗向导：「海盗遭遇率 -15%」。
   *
   * 他的另一半 perk（走私收益 +20%）走的是 smuggle 事件的结算，
   * 不在这里 —— 这里只管"撞不撞得上"。两半分开实现，但都由 crewRoster 驱动，
   * 和学者那两条是同一套写法。
   */
  if ((gameState.crewRoster ?? []).some(m => m.id === 'corsair') && event.type === 'pirate') {
    probability *= 0.85
  }
  /*
   * 船医（军官）：「疾病类事件概率减半」。
   *
   * 【为什么这一条以前是空的】军官卡上从第一版就印着这句话，但触发层只接了
   * 学者/向导/探险家三个**名船员**，`officers` 从没被读过。另有航医（名船员 medic）
   * 在断粮时把**船员病死概率**减半，那是 `tickCrewLoyalty` 里的另一件事——
   * 两个不同的人、两条不同的判据，别混成一条。
   *
   * 只压 disease 这一类：坏血病、瘟疫都算，风暴与海盗照旧。
   * 乘法放在「最终掷值」之前，不改 rand() 的消耗次数（全函数只在末尾掷一次），
   * 所以不会像「continue 少消耗一次随机」那样把后面的事件序列整体错位。
   */
  if ((gameState.officers ?? []).includes('surgeon') && event.type === 'disease') {
    probability *= 0.5
  }
  /*
   * 航季：秋季的风暴、海难、火山都更多。
   *
   * 【为什么只这三类】它们都直接由天候驱动。好望角的风暴季有史实
   * （迪亚士就是在那里折的桅）。货价、招募、传闻跟季节没有因果，
   * 乘上去就是编造。
   *
   * 倍率来自 season.stormBias（春 1.0 / 夏 1.15 / 秋 1.35 / 冬 1.1）。
   * 和上面两条 perk 一样，只乘概率、不改 rand() 的消耗次数，
   * 所以不会把后面的事件序列整体错位。
   */
  const WEATHER_DRIVEN = new Set(['storm', 'accident', 'volcano'])
  if (WEATHER_DRIVEN.has(event.type)) {
    probability *= seasonAt(fleet.day).stormBias
  }

  // 「遇事率」由航段方针统一控制（STANCES[stance].eventRateMul），
  // 施加在**全局触发闸门**上（见 store.advanceDay 的 eventBias）。
  // 这里不再叠第二层——两个旋钮都改同一件事，玩家会算不清账。

  return rand() < probability
}

/**
 * 从结局列表里掷一个结果。
 *
 * performance：可选的 0..1 表现分（来自事件小游戏）。
 * 给定时先按表现分重新分配各结局概率（biasProbabilities），
 * 于是"手稳的人把好结果拉过来，手抖的人被推向坏结果"——
 * 选项不再等价于一次纯掷骰。
 */
export function selectOutcome(outcomes: EventOutcome[], performance?: number): EventOutcome {
  const weights = performance === undefined
    ? outcomes.map(o => o.probability)
    : biasProbabilities(outcomes, performance)
  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  if (totalWeight <= 0) return outcomes[outcomes.length - 1]
  let random = Math.random() * totalWeight
  for (let i = 0; i < outcomes.length; i++) {
    random -= weights[i]
    if (random <= 0) return outcomes[i]
  }
  return outcomes[outcomes.length - 1]
}

// 事件节奏：平均约每 9 个航行日触发一次（间隔下限 5 天 + 概率 0.25），
// 避免长途航行被事件卡反复打断
const GLOBAL_EVENT_CHANCE = 0.25
const MIN_DAYS_BETWEEN_EVENTS = 5

/**
 * 「最近这么多条之内不重复」的窗口大小。
 *
 * 全表 63 条，一局大约走 11~17 条 —— 25 的窗口等于"一局内不撞重复"，
 * 又不会在长局里把内容抽干（窗口滑出后还能再遇到）。
 * 别把窗口调到接近全表：那样到后期就抽不到事件了，航行会变得平淡。
 */
export const RECENT_EVENT_WINDOW = 25

/**
 * 兄弟会的两条护航特权：60 档「海盗遭遇率 -20%」、90 档「海盗不再拦你的船」。
 *
 * 【为什么放在抽事件的循环里，而不是改事件概率】
 * 事件表里每个 pirate 事件自带 `triggerCondition.probability`，
 * 那是"这一条在符合条件的海域出现多密"；而特权说的是"这一整类遭遇少多少"。
 * 两者相乘写在 63 条数据里，等于让每条海盗事件各背一份派系逻辑 ——
 * 下次加一条海盗事件就会漏掉。所以判据放在**筛选**这一层：
 * 抽到海盗事件时先问一句"这艘船挂着兄弟会的旗，还用不用打"。
 *
 * @param brethrenRep 兄弟会声望
 * @param rng 注入随机源（单测要确定性）
 */
export const BRETHREN_PIRATE_REDUCE_REP = 60
export const BRETHREN_PIRATE_REDUCE = 0.2
export const BRETHREN_PIRATE_IMMUNE_REP = 90

export function pirateEncounterSuppressed(
  eventType: string,
  brethrenRep: number,
  rng: () => number = Math.random,
): boolean {
  if (eventType !== 'pirate') return false
  if (brethrenRep >= BRETHREN_PIRATE_IMMUNE_REP) return true
  if (brethrenRep >= BRETHREN_PIRATE_REDUCE_REP) return rng() < BRETHREN_PIRATE_REDUCE
  return false
}

export function getRandomEvents(
  gameState: GameState,
  events: GameEvent[],
  daysSinceLastEvent: number = 99,
  /** 天气偏置：乘在全局触发率上（暴风雨天更容易出事，晴天更太平） */
  chanceMultiplier = 1,
): GameEvent | null {
  if (daysSinceLastEvent < MIN_DAYS_BETWEEN_EVENTS) return null
  if (Math.random() > GLOBAL_EVENT_CHANCE * chanceMultiplier) return null

  /*
   * 先摘掉最近出现过的那些。
   * 只有 5 条事件自带 requiresFlags/conflictsWithFlags 的一次性保护，
   * 其余 58 条原来可以无限重复 —— 玩家第二次看到"独眼玛格的仇人"、
   * 连结果描述都一字不差，那一刻这台机器就露馅了。
   * 池子被摘空时退回全量：宁可重复，也不能不出事件。
   */
  const recent = gameState.recentEvents ?? []
  const fresh = events.filter(e => !recent.includes(e.id))
  const shuffled = [...(fresh.length ? fresh : events)].sort(() => Math.random() - 0.5)
  for (const event of shuffled) {
    /*
     * 兄弟会护航：抽到海盗事件先问一句"这艘船还用不用打"。
     * 90 档整类跳过（被兄弟会打过招呼），60 档每次 20% 概率跳过。
     * 被跳过就继续看下一条候选 —— 玩家这一趟改遇别的事，而不是"空手而归"。
     */
    if (pirateEncounterSuppressed(event.type, gameState.factionRep?.brethren ?? 0)) continue
    /*
     * 【这一次掷值必须留住】为了判断"这场遭遇是不是天赋给的"，
     * 命中之后要拿**同一个数**再跑一遍"没有探险家"的判定。
     * 重取随机数就没有对照了——那样得到的是"另一个平行世界的掷骰"，
     * 得出的"额外遭遇"标记会是随机噪声。
     */
    let roll = 0
    const recorded = () => { roll = Math.random(); return roll }
    if (checkEventTrigger(event, gameState, recorded)) {
      const viaExplorer = markExplorerBonus(event, gameState, roll)
      return viaExplorer ? { ...event, viaExplorer: true } : event
    }
  }
  return null
}

/**
 * 这一场遭遇是不是「天生探险家」多带来的？
 *
 * 只有当：① 玩家带 explorer；② 事件是发现类；③ 同一次掷值下没有天赋就不会触发
 * —— 三条同时成立才算。缺了第 ③ 条，每个发现事件都会被标成"天赋给的"，
 * 那是把"角色设定"讲成了"每次都生效"，比不标更糟。
 */
export function markExplorerBonus(event: GameEvent, gameState: GameState, roll: number): boolean {
  if (gameState.fleet.trait !== 'explorer') return false
  if (event.type !== 'discovery') return false
  const withoutTrait: GameState = {
    ...gameState,
    fleet: { ...gameState.fleet, trait: null },
  }
  return !checkEventTrigger(event, withoutTrait, () => roll)
}

/**
 * 事件触发后消耗 requiresFlags 旗标（一次性事件链）。
 * 返回新旗标表；无 requiresFlags 时原样返回。
 */
export function consumeEventFlags(event: GameEvent, flags: Record<string, number>): Record<string, number> {
  const required = event.triggerCondition.requiresFlags
  if (!required) return flags
  const next = { ...flags }
  for (const f of required) delete next[f]
  return next
}
