/**
 * 海上异闻（氛围层，纯逻辑）。
 *
 * 【为什么是"氛围"而不是事件卡】
 * 试玩反馈是"弹窗太多、任务感太重"。所以这一层东西**不打断任何操作**：
 * 不弹窗、不要求选择、不给奖励，只在海面上升起一个剪影，然后在航海日志里
 * 留一行字。玩家可以完全不理它——这正是"世界还活着"该有的样子。
 *
 * 【为什么用剪影而不是现有插图】
 * 现有事件插图是 1200×675 的油画，贴在海图上就是一个矩形，和手绘海图打架。
 * 剪影是纯 SVG，随船位缩放、边缘融进海面，观感上像"海图边上画的怪物"。
 * 另一个好处：零字节（不进图片加载）。
 *
 * 【为什么是这几样东西】
 * 1492 年前后水手真正会怕的东西：克拉肯（巨乌贼）、鲸群、幽灵船、
 * 塞壬礁石、天火（流星）、夜光海。不是奇幻怪物，是"当时的人以为存在的生物"。
 */

export type OmenKind = 'kraken' | 'whale' | 'ghost' | 'siren' | 'meteor' | 'lights'

/** 每出现一次，至少隔这么多天才可能再出现 */
export const OMEN_COOLDOWN_DAYS = 4

/**
 * 基准出现概率（逐日判定）。
 *
 * 【0.16 → 0.22 的依据】40 次 20 天航行采样（塞维利亚→哈瓦那，粮水充足）实测：
 * 异闻平均 **11.6 天**才一次，比设计意图稀一倍 —— 因为晴朗天还要乘 0.55，
 * 而天气大多数时候是晴。调整后降到约 **9 天一次**。
 *
 * 【不要被"太稀"推着继续加】玩家视角的"空"并不是缺异闻。
 * 按"当天没有事件、没有异闻、海面上也没有任何可点的漂流物"来量 ——
 * 真正全空的天只有 **15%**（3/20），也就是 85% 的日子至少有一件东西可看或可点。
 * （第一版采样得出"58% 无事"是因为判据写成了"当天没有新漂来"，
 *  而漂流物会在海上存在 3 天 —— 判据错了，不是游戏空。）
 */
export const OMEN_CHANCE = 0.22

/**
 * 天候对"异闻"的偏置。
 *
 * 晴朗时海面太干净，什么都能看清，反而没什么可说的；
 * 浓雾与暴风雨才是水手编故事的时候。0 表示这一类天气不出。
 */
const WEATHER_BIAS: Record<string, number> = {
  // 晴天不是什么都没有：海豚、跃鱼、夜里发亮的海面都在这时候看得见
  clear: 0.75,
  cloudy: 0.9,
  rain: 1.2,
  storm: 1.6,
  fog: 1.8,
}

/** 每种异闻的候选文案（一行，≤ 18 字，不带数字） */
const LINES: Record<OmenKind, string[]> = {
  kraken: [
    '水面下掠过一条比船还长的影子。',
    '有什么东西把缆绳拉直了，又松开。',
    '海面鼓起一个包，慢慢沉回去。',
  ],
  whale: [
    '一群鲸贴着船舷游了半个时辰。',
    '远处喷起三道水柱，又没了。',
    '一头鲸在船底翻了个身，整条船晃了晃。',
  ],
  ghost: [
    '雾里有一艘船，帆是破的，没有灯。',
    '一条船迎面驶过，甲板上站满了人。',
    '有人在雾里喊船名，喊的是旧名字。',
  ],
  siren: [
    '礁石上坐着人，歌声顺着风过来。',
    '有人跟着那歌声走到船舷边。',
    '那歌声停下来的时候，海面空了。',
  ],
  meteor: [
    '一颗火球从东北划到西南，落进海里。',
    '整片海亮了一下，像白天。',
    '天上掉下一条火线，水手们跪下了。',
  ],
  lights: [
    '海面浮起一片冷光，船像走在星河上。',
    '水里的光跟着船走，一直跟到天亮。',
    '每一道桨痕都亮着，像有人在水下划。',
  ],
}

/** 天气 → 更容易出现哪几种（顺序即权重，前面的更容易） */
const KIND_BY_WEATHER: Record<string, OmenKind[]> = {
  storm: ['kraken', 'ghost', 'lights', 'meteor'],
  fog: ['ghost', 'siren', 'kraken', 'whale'],
  rain: ['whale', 'lights', 'kraken', 'meteor'],
  cloudy: ['whale', 'meteor', 'siren', 'lights'],
  clear: ['whale', 'meteor', 'lights', 'siren'],
}

export interface OmenContext {
  day: number
  lastOmenDay: number
  weatherKind: string
  /** 当前航段的危险度 1~5，越危险越多异闻 */
  dangerLevel: number
  /** 参观模式：不加倍也不压制，世界照常活着 */
  isVisitor?: boolean
  rand?: () => number
}

export interface OmenRoll {
  kind: OmenKind
  text: string
  day: number
}

/**
 * 今天会不会看见点什么。返回 null 表示什么都没有——**绝大多数日子是这样**。
 *
 * 概率刻意压得很低：一天一遇的东西会变成噪音，十几趟航程遇见一次才叫"异闻"。
 */
export function rollSeaOmen(ctx: OmenContext): OmenRoll | null {
  const rand = ctx.rand ?? Math.random
  if (ctx.day - ctx.lastOmenDay < OMEN_COOLDOWN_DAYS) return null

  const bias = WEATHER_BIAS[ctx.weatherKind] ?? 1
  // 危险航段多两成：水手越紧张，越容易看见东西（这一条本身也是心理描写）
  const dangerBias = 1 + Math.max(0, ctx.dangerLevel - 2) * 0.1
  if (rand() >= OMEN_CHANCE * bias * dangerBias) return null

  const pool = KIND_BY_WEATHER[ctx.weatherKind] ?? KIND_BY_WEATHER.cloudy
  const kind = pool[Math.floor(rand() * pool.length)] ?? 'whale'
  const lines = LINES[kind]
  const text = lines[Math.floor(rand() * lines.length)] ?? lines[0]
  return { kind, text, day: ctx.day }
}

/** 供 UI 与测试共用：某种异闻的默认文案（日志里没有记录时的兜底） */
export function omenText(kind: OmenKind): string {
  return LINES[kind][0]
}
