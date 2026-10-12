import { Ship } from '@/types'

export interface ShipTemplate extends Omit<Ship, 'id'> {
  /** 购买价格 */
  price: number
  /** 哪些大区能买到：shipyard 服务 + 区域限制 */
  regions: ('caribbean' | 'europe' | 'africa' | 'asia')[]
}

export const shipTemplates: Record<string, ShipTemplate> = {
  caravel: {
    name: '卡拉维尔帆船',
    type: 'caravel',
    speed: 8,
    durability: 60,
    maxDurability: 60,
    capacity: 40,
    usedCapacity: 0,
    crew: 15,
    maxCrew: 20,
    price: 0,
    regions: ['europe', 'caribbean', 'africa', 'asia'],
  },
  sloop: {
    name: '单桅快船',
    type: 'sloop',
    speed: 12,
    durability: 40,
    maxDurability: 40,
    capacity: 20,
    usedCapacity: 0,
    crew: 8,
    maxCrew: 12,
    price: 800,
    regions: ['caribbean'],
  },
  frigate: {
    name: '护卫舰',
    type: 'frigate',
    speed: 7,
    durability: 90,
    maxDurability: 90,
    capacity: 60,
    usedCapacity: 0,
    crew: 30,
    maxCrew: 45,
    price: 2000,
    regions: ['europe', 'caribbean'],
  },
  galleon: {
    name: '盖伦大帆船',
    type: 'galleon',
    speed: 5,
    durability: 120,
    maxDurability: 120,
    capacity: 100,
    usedCapacity: 0,
    crew: 40,
    maxCrew: 60,
    price: 5000,
    regions: ['europe'],
  },
}

/** 船只出售价：原价五折（按剩余耐久略微浮动） */
export function shipResaleValue(ship: Ship): number {
  const template = Object.values(shipTemplates).find(t => t.type === ship.type)
  if (!template) return 0
  const condition = ship.durability / ship.maxDurability
  return Math.round(template.price * 0.5 * (0.5 + condition * 0.5))
}
