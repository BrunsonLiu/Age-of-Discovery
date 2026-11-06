import { ports } from './ports'
import type { LogbookEntry, VictoryClaim } from '@/types'

/**
 * 航海日志：一本会自己变厚的册子。
 *
 * 【为什么是"累积页"而不是"结算横幅"】
 * 以前每一趟都是全闭合的：到港 → 通知 → 数字清零 → 没有任何东西指向下一趟。
 * 途中加的漂流物、异闻、彩蛋全是**弹完就消失**的点缀，玩家一个都留不住。
 * 同类游戏留人最久的机制不是"决策有多难"，是「回来有个东西在等你，
 * 而且留了个没讲完的尾巴」（图鉴 / 见闻 / 允许缺席）。
 *
 * 【三条硬约束】
 * 1. 不设期限、不设失败：线索只是"有人在酒馆提起过"，做不做都不扣任何东西。
 * 2. 不逼算术：页里不写差价、天数、收益率；数字只在「图鉴 · 个人纪录」里陈列。
 * 3. 不撒谎：线索指向的是**真实存在且尚未发现**的港口，点一下只把地图移过去，
 *    不替玩家出航、不承诺奖励。
 */

/** 上限是存档体积的护栏：实测 200 条也只有约 25 KB，留足余量 */
export const LOGBOOK_MAX = 120

export const REGION_CN: Record<string, string> = {
  caribbean: '加勒比',
  europe: '欧洲',
  africa: '非洲',
  asia: '东方',
}

/** 到港小注：按海域固定，不掷骰——同一片海读起来该是同一种口气 */
const REGION_ASIDE: Record<string, string> = {
  caribbean: '码头上晒着糖，空气里全是甜味和焦油味。',
  europe: '教堂的钟比船上的更准，账房先生比水手还忙。',
  africa: '风从陆地吹来，带着沙和没见过的香料。',
  asia: '港里挤着各式帆，桅杆密得像一片林子。',
}

/**
 * 称号：三条胜利阈值改成"写进日志的一页"，而不是停机弹窗。
 *
 * 【为什么必须改】三条条件是单调可加的累积阈值取 max，horizon 无穷，
 * 一达标就全屏停住 = 玩家就此离开。写进册子则既不打断，又给了个看得见的纪念，
 * 并且 `claimedVictories` 保证每条只领一次，不会每天重复弹。
 */
/**
 * 追加一页，超出上限时只从**最旧**的普通见闻开始丢；称号页与应验页永远保留。
 *
 * 为什么不能简单 slice(0, MAX)：纪念页往往是最早写下的那几页，长局里必然被挤掉，
 * 而它恰恰是玩家最不该丢的东西。
 * 应验页也必须留着：它同时是「这条线索已经收过尾」的去重凭据，丢了会让玩家
 * 下次再靠同一港时又应验一遍，日志里冒出第二句"今天真来了"。
 */
export function appendLogbook(list: readonly LogbookEntry[], entry: LogbookEntry): LogbookEntry[] {
  const next = [entry, ...list]
  let drop = next.length - LOGBOOK_MAX
  if (drop <= 0) return next
  const kept: LogbookEntry[] = []
  for (let i = next.length - 1; i >= 0; i--) {
    const e = next[i]
    if (drop > 0 && e.kind === 'arrival') { drop--; continue }
    kept.push(e)
  }
  return kept.reverse()
}

/**
 * 从**尚未发现**的港口里挑一个当线索。
 *
 * 用 (day, portId) 的确定性取模而不是 Math.random：
 * · 同一趟刷新页面不会换掉刚看过的线索（存档读回来还是那一句）；
 * · 单测能断言"指向的一定是没去过的港"，不需要固定随机数种子。
 */
export function pickRumor(
  discovered: readonly number[],
  day: number,
  portId: number,
): { id: number; text: string } | null {
  const got = new Set(discovered)
  const pool = ports.filter(p => !got.has(p.id))
  if (pool.length === 0) return null
  const target = pool[(day * 31 + portId * 17) % pool.length]
  // 风土志常常很长（逗号后还有半句），截到第一个逗号为止，别把册子撑成说明文
  const gist = target.description.split('，')[0].slice(0, 24)
  return {
    id: target.id,
    text: `酒馆里有人提起${target.nameCn}——${gist}。没说什么时候去，也不催。`,
  }
}

/** 到港见闻：每带回一趟就多一页；同一天同一港只写一页 */
export function makeArrivalEntry(
  portId: number,
  day: number,
  discovered: readonly number[],
): LogbookEntry | null {
  const port = ports.find(p => p.id === portId)
  if (!port) return null
  const rumor = pickRumor(discovered, day, portId)
  return {
    id: `arrival-${day}-${portId}`,
    kind: 'arrival',
    day,
    portId,
    title: `靠岸 · ${port.nameCn}`,
    text: port.description,
    aside: REGION_ASIDE[port.region] ?? '海风把帆吹得鼓鼓的，缆绳终于松了。',
    hint: rumor?.text ?? '海图上已经没有空白了。剩下的，只是你自己想再去一次的地方。',
    targetPortId: rumor?.id ?? null,
    read: false,
  }
}

/* ── 线索的回响 ────────────────────────────────────────────────────────
 *
 * 【为什么必须有这一段】以前那句"酒馆里有人提起 X"是留的尾巴，但尾巴**永远
 * 没有下文**：玩家真把船开到了 X，旧页仍写着"没说什么时候去，也不催"，
 * 按钮还把地图移向一个早已点亮的港，册子里一个字都不变。留了钩子却不认账，
 * 比不留更伤。现在到港那一刻把旧页和今天接起来，只写一页纪念，
 * 不派任务、不给奖励、不设期限 —— 应验了是彩蛋，不去也什么都不会少。
 */

/** 指向该港、且还没有应验页的那句线索（logbook 新→旧，取最近写下的一句） */
export function findClueFor(
  logbook: readonly LogbookEntry[],
  portId: number,
): LogbookEntry | null {
  if (logbook.some(e => e.kind === 'echo' && e.portId === portId)) return null
  return logbook.find(e => e.kind === 'arrival' && e.targetPortId === portId) ?? null
}

/**
 * 应验页。天数与港名全部从**真实发生过的**旧页和本次到达里读：
 * 第几天听说的（clue.day）、在哪座港听说的（clue.portId）、今天靠的是哪座港。
 * 界面直接陈列这段 text，不再各处自己拼句子，免得说法不一致。
 */
export function makeEchoEntry(
  clue: LogbookEntry,
  portId: number,
  day: number,
): LogbookEntry | null {
  const port = ports.find(p => p.id === portId)
  if (!port) return null
  const from = ports.find(p => p.id === clue.portId)
  return {
    id: `echo-${day}-${portId}`,
    kind: 'echo',
    day,
    portId,
    title: `应验 · ${port.nameCn}`,
    text: `第 ${clue.day} 天在${from?.nameCn ?? '别的港'}听人提起的${port.nameCn}，今天自己靠上来了。`,
    aside: '没人催过，也没设过期限。只是那句话，如今有了下文。',
    hint: null,
    targetPortId: null,
    read: false,
  }
}

/** 这座港的应验页。应验页不会被上限挤掉，所以再回来也还看得见 */
export function echoForPort(
  logbook: readonly LogbookEntry[],
  portId: number | null,
): LogbookEntry | null {
  if (portId == null) return null
  return logbook.find(e => e.kind === 'echo' && e.portId === portId) ?? null
}

/** 这句线索哪天真应验了；没有就 null。视图只显示这个数，不自己推天数 */
export function echoDayFor(logbook: readonly LogbookEntry[], portId: number | null): number | null {
  return echoForPort(logbook, portId)?.day ?? null
}

/** 本次到达（day + portId）刚刚应验的那一页，给到港通知读；旧页不认 */
export function echoAt(
  logbook: readonly LogbookEntry[],
  portId: number,
  day: number,
): LogbookEntry | null {
  const page = echoForPort(logbook, portId)
  return page?.day === day ? page : null
}

/** 累计收过几句尾。只陈列、不比较、不排名 */
export function countEchoes(logbook: readonly LogbookEntry[]): number {
  return logbook.reduce((n, e) => n + (e.kind === 'echo' ? 1 : 0), 0)
}

/** 称号页：达标那一刻写进册子，游戏继续 */
export function makeTitleEntry(claim: VictoryClaim, day: number): LogbookEntry {
  return {
    id: `title-${claim.key}`,
    kind: 'title',
    day,
    portId: null,
    title: `称号 · ${claim.name}`,
    text: claim.desc,
    aside: '酒馆会给这一页配支曲子。海不会因此变小，明天照样可以出航。',
    hint: null,
    targetPortId: null,
    read: false,
  }
}

/** 全部标已读（打开「见闻」页时调用） */
export function markAllRead(list: readonly LogbookEntry[]): LogbookEntry[] {
  return list.some(e => !e.read) ? list.map(e => (e.read ? e : { ...e, read: true })) : [...list]
}
