/**
 * 同代船长的座次：**三项各自排名，同分并列**。
 *
 * 【为什么不发明"综合分"】金币 × 0.5 + 声望 × 0.3 + 探索 × 0.2 是最容易写、
 * 也最容易骗人的东西：玩家金币第一却排第三时，界面上没有任何地方能回答
 * "凭什么"。本作没有那套权重，所以三项各自算一项座次，规则全部摊在表头。
 *
 * 【名次 = 1 + 严格大于它的人数】这就是"同分并列"的定义：
 * 四个人金币 100 / 100 / 50 / 10 → 名次 1 / 1 / 3 / 4。
 * 名次列表跳过 2 不是 bug，是并列该有的样子 —— 所以界面上要写明"同分并列"。
 *
 * 【行序 = 金币降序，同分按声望，再按探索】行序也必须是一条能写出来的规则：
 * 玩家看不见的排序规则就等于界面坏了（本作在结算行上踩过这个坑）。
 */

export interface SeatInput<T> {
  item: T
  gold: number
  fame: number
  ports: number
}

export interface Seat<T> extends SeatInput<T> {
  /** 金币座次（1 最好，同分并列） */
  goldRank: number
  fameRank: number
  portsRank: number
}

/** 某一位在某一项上的名次：1 + 严格大于它的个数 */
export function rankOf(values: number[], mine: number): number {
  let better = 0
  for (const v of values) if (v > mine) better++
  return better + 1
}

export function standings<T>(rows: SeatInput<T>[]): Seat<T>[] {
  if (rows.length === 0) return []
  const golds = rows.map(r => r.gold)
  const fames = rows.map(r => r.fame)
  const counts = rows.map(r => r.ports)
  return [...rows]
    .sort((a, b) => b.gold - a.gold || b.fame - a.fame || b.ports - a.ports)
    .map(r => ({
      ...r,
      goldRank: rankOf(golds, r.gold),
      fameRank: rankOf(fames, r.fame),
      portsRank: rankOf(counts, r.ports),
    }))
}
