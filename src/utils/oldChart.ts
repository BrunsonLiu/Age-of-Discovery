import { ports } from '@/data/ports'
import { haversineNm } from '@/utils/navigation'

/**
 * 学者公会 90 档「古海图」：海图上标出**还没去过的近处**。
 *
 * 【为什么这条特权只能靠"地图"来实现】
 * 2026-11-07 用户定的方向：不再扩展金钱玩法，卖的是**航路、名号、见闻**。
 * 势力特权里剩下没做的两条（学者 60 的"献纳"、学者 90 的"古海图"）
 * 之所以一直是设计稿，是因为它们要的不是价格链上的一个倍率，而是**世界里的东西**。
 * 古海图正好落在最该落的地方：它不给你一枚金币，它给你**一张更完整的图**。
 *
 * 【为什么是"离船最近的未至之地"，而不是随机两处】
 * 古海图不是藏宝图，它不承诺奖赏，只回答"再往前还有什么"。
 * 所以它标的是**从你现在的位置出发、最近的、你还没记进海图的地方** ——
 * 那是玩家此刻真正要做的决定：往哪开。
 * 随机抽两处会变成"满世界散布的诱饵"，与"一张旧图"的语义对不上。
 *
 * 【为什么不用 `relics` 那套"必须在主航线 150 海里内"】
 * 遗物是"路过的礼物"，标出来必须保证玩家真的会路过；
 * 古海图标的是**目的地**，玩家会为它改航线 —— 约束方向相反，不能套用。
 */

/** 解锁古海图的学者公会声望（与 factions.ts 的文案同源） */
export const OLD_CHART_REP = 90
/** 一卷旧图最多标几处 */
export const OLD_CHART_MARKS = 2
/**
 * 两处标记之间的最小间隔（海里）。
 *
 * 【为什么需要这条】只按"最近的两处"来标，开局时会标出塞维利亚与加的斯
 * —— 两座港相距几十海里，在 zoom 5 上两个圈和两行字**完全叠在一起**，
 * 截图上是一团墨。而"一卷旧图"标的是两条不同的航路，不是同一个海角旁边的两座港。
 *
 * 300 海里在实测数据里刚好把"同一片海岸的相邻港"分开
 * （里斯本→塞维利亚 170 / →加的斯 190，两者只差 20），
 * 又近到足以在大多数局面里都存在第二个候选。
 * 找不到够远的候选时**只标一处** —— 宁可少标，也不叠成一团。
 */
export const OLD_CHART_MIN_APART_NM = 300

export interface OldChartMark {
  portId: number
  lat: number
  lng: number
  /** 从船位到这里的球面距离（海里，已取整）—— 与港口面板/出航计划用同一个 haversine */
  nm: number
}

/**
 * 选出这一卷旧图上该画哪几处。
 *
 * 纯函数：只吃"已发现港口 / 船位 / 学者声望"，不读 store，
 * 所以单测能直接钉住"声望 89 不标、90 标两处、已发现的不标、全发现后不标"。
 *
 * 船位为空时返回空数组（还没开局或坐标尚未算出）——
 * 这时候没有任何"离船最近"可言，编一个出来就是在屏幕上说谎。
 */
export function oldChartMarks(opts: {
  discovered: readonly number[]
  ship: readonly [number, number] | null
  scholarsRep: number
}): OldChartMark[] {
  if (opts.scholarsRep < OLD_CHART_REP) return []
  if (!opts.ship) return []
  const [lat, lng] = opts.ship
  const seen = new Set(opts.discovered)
  const candidates = ports
    .filter((p) => !seen.has(p.id))
    .map((p) => ({
      portId: p.id,
      lat: p.latitude,
      lng: p.longitude,
      nm: Math.round(haversineNm(lat, lng, p.latitude, p.longitude)),
    }))
    // 距离相同时按港口 id 定序：否则同一局面两次渲染的顺序可能不同，
    // 图上两处记号会互相换位（那些"看起来像 bug 的东西"往往就是这么来的）
    .sort((a, b) => a.nm - b.nm || a.portId - b.portId)

  const first = candidates[0]
  if (!first) return []
  /*
   * 第一处 = 离船最近的未至之地（"下一步往哪开"）。
   * 第二处 = 离第一处至少 OLD_CHART_MIN_APART_NM 的最近一处（"下一条航路"）。
   * 找不到够远的就是没有 —— 不拿相邻港凑数（理由见常量注释）。
   */
  const far = candidates.find(
    (c) => haversineNm(first.lat, first.lng, c.lat, c.lng) >= OLD_CHART_MIN_APART_NM,
  )
  return far ? [first, far] : [first]
}
