import type { Fleet, Ship } from '@/types'

/** 游戏数值平衡常量，集中管理所有可调参数 */
export const GAME_BALANCE = {
  /** 修理费用：每点耐久度 */
  REPAIR_COST_PER_DURABILITY: 5,
  /** 食物单价 */
  FOOD_PRICE: 2,
  /** 淡水单价 */
  WATER_PRICE: 1,
  /** 每次补给量 */
  SUPPLY_AMOUNT: 20,
  /** 补给总费用 */
  SUPPLY_TOTAL_COST: 20 * 2 + 20 * 1, // 60
  /** 每日士气衰减 */
  MORALE_DECAY_PER_DAY: 5,
  /** 士气上限 */
  MORALE_MAX: 100,
  /** 招募船员每人费用 */
  CREW_COST_PER_PERSON: 10,
  /** 默认每次招募人数 */
  DEFAULT_RECRUIT_COUNT: 5,
  /** 货舱容量上限 */
  CARGO_CAPACITY_MAX: 200,
} as const
