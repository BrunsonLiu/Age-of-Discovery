/**
 * 一趟航行的"海况脾气"（R2）。
 *
 * 【要解决什么】实测过的节奏空档：选完航段方针之后，一趟 15 天的航行里
 * **没有任何需要重新决策的节点** —— 而这是玩家花时间最多的地方
 * （35 分钟的会话里大半在看船走）。Balatro / StS 那类游戏靠"每局换一组约束"
 * 让同一套规则每次不一样；我们的一趟航行也该有它自己的脾气。
 *
 * 【为什么是"每趟不同的事件密度"这一个维度】
 * 它是**唯一不需要动账目**的维度：
 *   · 补给/价格/天数都有"面板=结算"的单一来源约束，改一个就要连带改面板；
 *   · 事件密度只乘在 `getRandomEvents` 的 chanceMultiplier 上（那本来就是
 *     天气偏置用的入口），没有第二个消费者，不会出现两处口径。
 *
 * 【为什么由 (day, from, to) 推导，而不是存进存档】
 * 推导出来的东西不会不同步：刷新页面、导入旧档、换设备，同一趟航行算出来的
 * 永远是同一条脾气。存字段反而要动 partialize / SAVE_FIELDS / migrate 三处，
 * 还多一个"中途读档丢了它"的失效面。
 *
 * 【设计取向】**坏脾气不是纯惩罚**：这个游戏里事件大多带来金币/声望/见闻，
 * 所以"多事"其实是机会多、"太平"反而寡淡。台词按这个取向写，不做"debuff"。
 */
export interface VoyageModifier {
  id: string
  /** 一句话名字（面板上显示的就是它） */
  name: string
  /** 一句话解释，告诉玩家它意味着什么（不超过 18 字） */
  line: string
  /** 乘在全局事件触发率上（>1 更热闹，<1 更寡淡） */
  eventMul: number
  /**
   * 1..4，给界面上的**四柱小表**用（面板不再用一句话解释强弱，
   * 而是画出"这一趟有多热闹"）。必须与 `eventMul` 同序：数字越大越热闹。
   */
  level: 1 | 2 | 3 | 4
}

export const VOYAGE_MODS: readonly VoyageModifier[] = [
  { id: 'calm', name: '风平浪静', line: '这一趟少见人少见事', eventMul: 0.55, level: 1 },
  { id: 'ordinary', name: '寻常海况', line: '和哪一趟都差不多', eventMul: 1, level: 2 },
  { id: 'busy', name: '往来频繁', line: '帆影比平时多，事也多', eventMul: 1.3, level: 3 },
  { id: 'troubled', name: '多事之秋', line: '这一带不太平，事会找上门', eventMul: 1.75, level: 4 },
]

/**
 * 同一趟航行永远算出同一条脾气。
 * 用 (日, 起点港, 终点港) 三个数混合 —— 与 `pickRumor` 同一套思路（可解释、无状态）。
 */
export function pickVoyageMod(day: number, fromPortId: number, toPortId: number): VoyageModifier {
  const key = Math.abs(day * 31 + fromPortId * 17 + toPortId * 7)
  return VOYAGE_MODS[key % VOYAGE_MODS.length]
}
