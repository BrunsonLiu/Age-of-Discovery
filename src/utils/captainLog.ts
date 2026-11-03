import type { EventLogEntry } from '@/types'

/**
 * 船长日志的行文体。
 *
 * 【为什么需要这一层】原来的「航海日志」是按事件逐条堆卡片：
 *   第 12 天 | 顺风而行 | 选择: 顺风而行 | 船在浪尖上飞驰…… | 史实注
 * 四块内容、一个"选择:"的前缀、再加一段博物馆标签。它读起来像**事件调试记录**，
 * 而不是一个船长写下的东西 —— 而日志是这个游戏里唯一一处可以成为"回忆"的地方。
 *
 * 现在改成：**每天一行**，24 字以内，不带任何数字（数字留给面板与结算），
 * 语气是船长的第一人称；想细看再点开当天的条目。
 *
 * 【为什么必须"不带数字"】日志里出现"耐久 -17、金币 +240"，它就变成了第二张报表；
 * 而报表已经有底栏、贸易面板、结算屏三处了。日记的价值恰恰是它不记账。
 *
 * 【为什么必须"只在有事时写"】空白的一天不值得占一行。没有条目 = 这一天不出现
 * （不是"今天风平浪静"这种凑数句）—— 凑数的平静会让真正的平静失去分量。
 */

/** 事件的"重量"：与 EventCard 判断好坏用的是同一套权重（耐久最贵、其次人命） */
function harmOf(entry: EventLogEntry): number {
  const o = entry.outcome
  return (o.durabilityChange ?? 0) * 5
    + (o.crewChange ?? 0) * 10
    + (o.moraleChange ?? 0)
    + (o.goldChange ?? 0)
}

/**
 * 每种事件的两句（不好 / 不坏）。
 *
 * 只写"那一刻的样子"，不写因果、不写数值。全部 ≤ 24 字、不含阿拉伯数字。
 * 未列出的事件类型落到最后的兜底句。
 */
const LINES: Record<string, readonly [string, string]> = {
  storm: ['风把帆撕了一道口子。', '顶着风走，居然过去了。'],
  pirate: ['他们的刀比我们快。', '打退了，还留下点东西。'],
  disease: ['有人开始发热。', '病退了，甲板上松了口气。'],
  accident: ['一根缆绳先断的。', '人都捞上来了。'],
  discovery: ['海岸不是图上画的样子。', '看见了没画在图上的岸。'],
  treasure: ['沙里埋着东西。', '沙里真有东西。'],
  kraken: ['海里有东西比船大。', '它走了。没人说话。'],
  ghost: ['船上多了一个不该有的人。', '那本日志我没敢再翻。'],
  festival: ['甲板上难得有歌声。', '甲板上难得有歌声。'],
  smuggle: ['有些货不好见光。', '有些货不好见光。'],
  siren: ['水里有人在唱歌。', '我让人堵上了耳朵。'],
  volcano: ['山在吐火。', '山在吐火。'],
  fog: ['雾厚得看不见船头。', '雾散的时候，星星还在。'],
  faction: ['有人记住了我们站哪边。', '有人记住了我们站哪边。'],
  crew: ['有人来找我说话。', '有人来找我说话。'],
  reckoning: ['该算的账来了。', '该算的账来了。'],
  historical: ['这一年，世道变了。', '这一年，世道变了。'],
}

const FALLBACK: readonly [string, string] = ['那天海上不太平。', '那天海上还算太平。']

/** 一天里最重的那一条 —— 用它来定这一行的语气与措辞 */
export function heaviestEntry(entries: EventLogEntry[]): EventLogEntry | null {
  let best: EventLogEntry | null = null
  let bestAbs = -1
  for (const e of entries) {
    const a = Math.abs(harmOf(e))
    if (a > bestAbs) { bestAbs = a; best = e }
  }
  return best
}

/**
 * 当天的日志行。
 * @returns null = 这一天什么都没发生（不该出现在日志里）
 */
export function journalHeadline(entries: EventLogEntry[]): string | null {
  if (!entries.length) return null
  const top = heaviestEntry(entries)
  if (!top) return null
  const pair = LINES[top.event.type] ?? FALLBACK
  return harmOf(top) >= 0 ? pair[1] : pair[0]
}

export interface JournalDay {
  day: number
  /** ≤24 字、无数字；null 表示没有任何条目的一天（不会出现在结果里） */
  headline: string | null
  /** 当天的条目，按发生顺序 */
  entries: EventLogEntry[]
}

/**
 * 把事件流按天分组，**新的在前**。
 *
 * 【为什么按天而不是按事件】日志的主体应该像"日子"，不像"流水"。
 * 同一天发生的三件事属于同一页，不该是三张并列的卡。
 */
export function groupJournal(eventLog: EventLogEntry[]): JournalDay[] {
  const byDay = new Map<number, EventLogEntry[]>()
  for (const e of eventLog) {
    const list = byDay.get(e.day)
    if (list) list.push(e)
    else byDay.set(e.day, [e])
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([day, entries]) => ({ day, headline: journalHeadline(entries), entries }))
}
