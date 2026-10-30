import type { Fleet } from '@/types'

/*
 * 【这里原本有 calculateBuyPrice / calculateSellPrice，已删除】
 *
 * 它们是早期的"裸公式"：
 *   buy  = round(price × priceModifier)
 *   sell = round(price × priceModifier × 0.85)
 * 没有任何动态项 —— 不算库存 surge、不算声望/特质/名船员的 priceMultiplier、
 * 也不算"卖价必须低于同港买价"的兜底。这正是当年造成
 * 「面板 97/99 条与结算对不上、最大差 67 金」的那一版。
 *
 * 它们在删除时已无人引用，但**导出着就是隐患**：谁顺手 import 一下，
 * 屏幕上就会出现一个和结算不同的价格。
 * 价格只有一个来源：store 的 selectBuyPrice / selectSellPrice。
 */

export function canAfford(gold: number, price: number, quantity: number): boolean {
  return gold >= price * quantity
}

export function hasCargoSpace(fleet: Fleet, quantity: number): boolean {
  const totalCapacity = fleet.ships.reduce((sum, ship) => sum + ship.capacity, 0)
  const totalUsed = fleet.cargo.reduce((sum, item) => sum + item.quantity, 0)
  return totalCapacity - totalUsed >= quantity
}
