import { RELICS, type Relic } from '@/data/relics'

/**
 * 学者公会 60 档「把发现物报呈公会」。
 *
 * 【为什么这条特权最后才做、又为什么改了名字】
 * 原文写的是「发现物与遗物献学者可换**双倍报酬**」。它一直是设计稿，因为两件事：
 *   ① "献"需要一个动作（选中一件东西 → 交给学者 → 结算），而游戏里没有这个流程；
 *   ② "报酬"落回金币，而这一作的方向是**不再扩展金钱玩法**——卖的是航路、名号、见闻。
 * 所以这条特权的实现换了两个词，但意思没变小：
 *   · "献" → **报呈**：你带回来的实物还在你手上（图鉴里那一格不会空），
 *     公会抄一份、记进档案。这是那个年代真实发生的事——学者要的是**记录**，不是占有；
 *   · "报酬" → **名号**：公会替你说话，你的名字出现在他们的簿子上。
 *     60 档的实现就是"翻倍"：+6 → +12。这就是"双倍报酬"，只是钱换成了名。
 *
 * 【为什么报酬是名号而不是声望值本身】声望（fame）在这个游戏里就等于"后世怎么记你"，
 * 而名号是从它派生出来的称号。再单独加一种"公会积分"就是第四套货币了。
 */

/** 一次报呈的名号（学者声望 <60 时） */
export const DONATE_FAME = 6
/** 达到这个声望，报呈的名号翻倍（factions.ts 里学者 60 档的文案就是这个数） */
export const DONATE_DOUBLE_REP = 60

/** 这次报呈给多少名号：60 档翻倍 */
export function donateFame(scholarsRep: number): number {
  return scholarsRep >= DONATE_DOUBLE_REP ? DONATE_FAME * 2 : DONATE_FAME
}

/**
 * 还能报呈哪几件：**已经拾到**、**还没报呈过**。
 *
 * 顺序跟 RELICS 表一致（不按拾取顺序）：
 * 同一次报呈给的名号一样多，所以挑哪件对玩家没有区别 ——
 * 那就按一个稳定顺序给，玩家不会看到"这次能报呈铁锚、下次又变成断桅"。
 */
export function donatableRelics(
  collected: readonly string[],
  donated: readonly string[],
): Relic[] {
  const got = new Set(collected)
  const done = new Set(donated)
  return RELICS.filter((r) => got.has(r.id) && !done.has(r.id))
}
