/**
 * 名船员的特长公式——**单一来源**。
 *
 * 【为什么要有这个文件】
 * 修理费在代码里出现过三处：港口面板的按钮、面板里每艘船的报价、store 里的结算。
 * 三处各算一遍，就必然出现"按钮写 150、扣 90"这类事故——而这个项目最硬的一条
 * 规矩是**屏幕上的数字必须等于实际发生的变化**。
 *
 * 所以凡是被 UI 和结算共用的特长，公式只写在这里，两边都调它。
 * 每加一条都问一句：这个数字会不会同时出现在两个地方？
 * 会，就进这个文件；不会（只在结算里出现的概率、只在日志里出现的文案），
 * 就地写在 store 里，不必绕一圈。
 */
import { GAME_BALANCE } from '@/data/gameConfig'

/** 船匠：靠港修理费六折（自己动手，只算料钱） */
export const CARPENTER_COST_MUL = 0.6
/**
 * 修理某艘船需要多少金。
 *
 * 向上取整：0.6 折之后如果出现半金，宁可多收半金也不能少收——
 * 少收会让"耐久 1 点、金币刚好差 1"的边界反复出现，玩家点不动却看不出去哪了。
 *
 * @param damage 需要修复的耐久点数
 * @param hasCarpenter 船匠（木匠马蒂亚斯）在船
 */
export function repairCost(damage: number, hasCarpenter: boolean): number {
  const raw = damage * GAME_BALANCE.REPAIR_COST_PER_DURABILITY
  return Math.ceil(raw * (hasCarpenter ? CARPENTER_COST_MUL : 1))
}

/** 商人：委托赏金 +25%（她替你谈价） */
export const MERCHANT_REWARD_MUL = 1.25

/**
 * 航海士：靠港补给半价（60 → 30 金，粮水份量不变）。
 *
 * 【为什么不是"淡水消耗 -20%"】试过，做不到。
 * 起始船队 15 人，淡水基础消耗 `ceil(15×0.15)=3` 份/天，打八折是 2.4，
 * 再取整还是 3 —— **百分比减免在这个量级会被取整直接吃掉**：
 * 面板上写 -20%，实际一份都没省。改到"未取整前乘倍率"也不行，
 * 因为 1.5×0.8=1.2 与 1.5 都向上取整成 2。
 * 所以航海士的加成改成**离散的一次性动作**：补给这件商品他谈得下价。
 * （顺带记一笔：胖厨子的"食物 -20%"在 15 人船队上有同样的问题，
 * 已在《航海图》记忆里记为待修的既有缺陷——那是另一条线，本轮不动。）
 */
export const NAVIGATOR_SUPPLY_COST_MUL = 0.5

/**
 * 完成一条委托实际到手的金币。
 *
 * 委托卡上写着多少，结算就给多少 —— 所以显示处和结算处都必须调这一个函数。
 * 面板上有三处要显示赏金（任务面板的列表、任务面板的浮动提示、港口面板的可接任务），
 * 各抄一遍 `reward.gold` 的话，商人在船时就是"卡片写 480、到账 600"。
 */
export function taskGold(gold: number, hasMerchant: boolean): number {
  return Math.round(gold * (hasMerchant ? MERCHANT_REWARD_MUL : 1))
}

/**
 * 一次补给的实际花费。
 *
 * 港口面板的按钮上写着这个数字，store 里扣的也是这个数字——同一个函数。
 * @param hasNavigator 航海士（巴托洛梅乌）在船
 */
export function supplyCost(baseCost: number, hasNavigator: boolean): number {
  return Math.round(baseCost * (hasNavigator ? NAVIGATOR_SUPPLY_COST_MUL : 1))
}

/** 翻译官：事件里的派系好感 +50% */
export const INTERPRETER_FACTION_MUL = 1.5

/** 探险家：探索类事件的金币与声望收益 +30% */
export const PATHFINDER_DISCOVERY_MUL = 1.3
