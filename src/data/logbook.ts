import { ports, marketTips, portGoods } from './ports'
import { goods } from './goods'
import type { LogbookEntry, VictoryClaim } from '@/types'
import type { NationLegend } from '@/data/nations'

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
 * 追加一页，超出上限时只从**最旧**的普通见闻开始丢；称号页、应验页、传说页永远保留。
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
 * 一条**能兑现的行情**：这边便宜、那边缺，而且那地方你还没去过。
 *
 * 【为什么传闻要优先说货，而不是只说"那座城长什么样"】
 * 游戏的设计前提是"卖的是航路"，而远洋航路长期不划算（`npm run probe:economy`
 * 实测远洋中位数只有近海的 0.56×）。但数值不该为此被抬 —— 真正缺的是
 * **玩家根本不知道哪条远洋值得跑**：掮客只推从本港出发的最优单子，贸易面板
 * 只写本港的渴求，外港缺什么全靠玩家自己撞。
 *
 * `marketTips`（`data/ports`）早就配好了这层数据 53 条、21 港全覆盖，
 * 却一次都没被引用过 —— 这里把它接上，让"留个没讲完的尾巴"变成
 * "留一条能跑的航路"。
 *
 * 【三条约束照旧】不写差价、不写天数、不承诺奖励。
 * 只写"那儿缺什么"和"这边买得便宜"—— 算不算得过账，是玩家自己的事。
 */
function demandRumor(
  discovered: readonly number[],
  day: number,
  portId: number,
): { id: number; text: string } | null {
  const got = new Set(discovered)
  /*
   * 口径取「比基准便宜」（<1），不是贸易面板的 localSpecialties(≤0.75)。
   * 后者是"这港的特产"，而传闻要的是"这边买得不贵" —— 塞维利亚全港最便宜的
   * 货是 0.85，用 0.75 去筛会让整个西班牙开局都收不到一条行情。
   */
  const sp = new Set(
    portGoods.filter(pg => pg.portId === portId && pg.priceModifier < 1).map(pg => pg.goodId),
  )
  if (sp.size === 0) return null
  // 只从"还没去过的港"里挑：去过的港玩家自己知道价，不需要传闻
  const cands = marketTips
    .filter(t => !got.has(t.portId) && t.portId !== portId && sp.has(t.goodId))
    .map(t => {
      const pg = portGoods.find(p => p.portId === t.portId && p.goodId === t.goodId)
      const g = goods.find(x => x.id === t.goodId)
      const to = ports.find(p => p.id === t.portId)
      return pg && g && to ? { to, good: g, modifier: pg.priceModifier } : null
    })
    .filter((x): x is { to: typeof ports[number]; good: typeof goods[number]; modifier: number } => !!x)
  if (cands.length === 0) return null
  /*
   * 排序完全确定（渴求度降序 → 港名）：不用 Math.random，
   * 刷新页面不会换掉刚看过的那一句，单测也能直接断言指向谁。
   *
   * 取模范围是**前三条**而不是"同等渴求的那几条"：只按最高档轮换时，
   * 所有港都会指向同一个"最缺的地方"（实测哈瓦那、马六甲、广州全提哈瓦那）。
   * 前三名之间换着说，商人才像在不同港口听来的话。
   */
  cands.sort((a, b) => b.modifier - a.modifier || a.to.nameCn.localeCompare(b.to.nameCn))
  const top = cands.slice(0, Math.min(3, cands.length))
  /*
   * 轮换种子用**港名的字符和**，不是 portId。
   *
   * 【为什么不能只按 id 取模】港 id 恰好一堆是三的倍数（塞维利亚 6、
   * 马六甲 12、广州 21…），`(day*31 + portId*k) % 3` 在这些港上永远同余 ——
   * 实测塞维利亚与马六甲都提"哈瓦那缺丝绸"，读起来像文案写死了。
   * 名字的字符和对 id 没有这种整除关系，且仍然完全确定（刷新不跳）。
   */
  const me = ports.find(p => p.id === portId)
  const nameSeed = me ? [...me.nameCn].reduce((n, ch) => n + ch.charCodeAt(0), 0) : portId
  const pick = top[(day * 31 + nameSeed) % top.length]
  return {
    id: pick.to.id,
    /*
     * 不写"跑一趟不亏"：那是**承诺收益**，而这几条线索的立身之本是不承诺
     * （见文件头三条硬约束）。跑一趟要 8 天还是 60 天、值不值，去贸易面板看。
     */
    text: `酒馆里有人说，${pick.to.nameCn}正缺${pick.good.nameCn}——这边买得便宜，去不去随你。`,
  }
}

/**
 * 从**尚未发现**的港口里挑一个当线索。
 *
 * 用 (day, portId) 的确定性取模而不是 Math.random：
 * · 同一趟刷新页面不会换掉刚看过的线索（存档读回来还是那一句）；
 * · 单测能断言"指向的一定是没去过的港"，不需要固定随机数种子。
 *
 * 优先给"能兑现的行情"（见 demandRumor）；本港没有哪种特产被未发现港渴求时，
 * 退回"那座城长什么样"——叙述类的线索本来就是这套册子的基线，不能被行情挤掉。
 */
export function pickRumor(
  discovered: readonly number[],
  day: number,
  portId: number,
): { id: number; text: string } | null {
  const got = new Set(discovered)
  const pool = ports.filter(p => !got.has(p.id))
  if (pool.length === 0) return null
  const deal = demandRumor(discovered, day, portId)
  if (deal) return deal
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

/**
 * 传说页：开进那片海、兑现的那一刻写进册子。
 *
 * 【为什么要这一页】传说兑现时原来只有一条通知 + 一条横幅 ——
 * 通知会自动消失，横幅三秒就走，玩家回头看册子，这一趟"带回了什么"里没有它。
 * 而传说恰恰是最该被记下来的那种事：它不是买卖、不是称号，
 * 是"海图上原本没有的地方，你去过了"。
 *
 * 【为什么 portId 是 null】兑现发生在海上，那一刻船不在任何码头。
 * 硬塞一个"最近的港"会让页面写着"靠岸 · 某某"却是别处的图 —— 这是撒谎。
 * 没有港口就不配图（`logbookArt` 对 null 返回 undefined），这一页只有字。
 *
 * 【去重靠 legendPending，不靠 appendLogbook】`appendLogbook` 只做前插 + 裁剪，
 * **没有 id 去重**（别把"不会写两页"指望在它身上）。同一片海只会兑现一次：
 * 兑现之后 `legendPending` 返回 null，第二天结算不会再进来。id 稳定是为了导出/导入
 * 与排查时能认出来，不是去重手段。
 */
export function makeLegendEntry(legend: NationLegend, day: number): LogbookEntry {
  return {
    id: `legend-${legend.id}`,
    kind: 'legend',
    day,
    portId: null,
    title: `传说 · ${legend.name}`,
    text: legend.line,
    aside: '海图上原本没有它。现在有了——是你开过去，它才有的。',
    hint: null,
    targetPortId: null,
    read: false,
  }
}

/**
 * 朝贡页：每一次"交勘合"都写一页。
 *
 * 【为什么不能只在拿到名号时写】面板上写着「市舶司收下香料，**记下你的船名**」，
 * 而 store 原来只在第 3 次（该给名号那次）才写页 —— 前两次、以及所有没到
 * 名号门槛的朝贡，屏幕上只有一条会消失的横幅和一条通知。文案承诺了"记下"，
 * 册子里却查不到，这跟"数字对不上"是同一类错。
 *
 * 【id 用 天+次数】同一天不可能交两次（冷却 20 天），但导入存档/重复结算
 * 可能在同一帧写两次，带上次数就不会互相覆盖。
 *
 * 【portId 给真港】朝贡确实发生在市舶司所在的那座港，所以这一页配得上那张画，
 * 头行也写得出"靠岸 · 广州"——不是硬塞一个"最近的港"。
 */
export function makeTributeEntry(rule: { portId: number; label: string; gift: string; gain: { fame: number; morale: number } }, day: number, count: number): LogbookEntry {
  return {
    id: `tribute-${day}-${count}`,
    kind: 'tribute',
    day,
    portId: rule.portId,
    title: `${rule.label} · 第 ${count} 次`,
    text: rule.gift,
    aside: `名号 +${rule.gain.fame} · 士气 +${rule.gain.morale}。船名记在市舶司的簿子上。`,
    hint: null,
    targetPortId: null,
    read: false,
  }
}

/**
 * 报呈页：每一次"把发现物报呈公会"都写一页。
 *
 * 【为什么值得单独一页】报呈换来的只有名号，而名号是个数字 ——
 * 数字不会让玩家记住任何事。这一页记的是**那件东西本身**：
 * 它的名字、它是什么（`relic.hint`）、以及它背后那一行史实（`relic.note`）。
 * 也就是说，报呈的真正回报是"你讲的东西被写进了别人的档案"。
 */
export function makeDonationEntry(relic: { id: string; name: string; hint: string; note: string }, day: number, fame: number, portId: number): LogbookEntry {
  return {
    id: `donate-${relic.id}`,
    kind: 'echo',
    day,
    portId,
    title: `公会档案 · ${relic.name}`,
    text: relic.hint,
    aside: `${relic.note}（名号 +${fame}）`,
    hint: null,
    targetPortId: null,
    read: false,
  }
}

/** 全部标已读（打开「见闻」页时调用） */
export function markAllRead(list: readonly LogbookEntry[]): LogbookEntry[] {
  return list.some(e => !e.read) ? list.map(e => (e.read ? e : { ...e, read: true })) : [...list]
}
