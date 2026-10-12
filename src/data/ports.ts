import { Port, PortGood } from '@/types'

/**
 * 价格表设计原则（第一性：首笔贸易必须有利可图）：
 * - 每个港口有 2-3 种本地"特产"（priceModifier 低，买便宜）
 * - 有 1-2 种本地不产的"渴求品"（priceModifier 高，卖出溢价）
 * - 特产在别处的 modifier 一定高于本地买价 × 0.85 的回收价
 * - 欧洲与加勒比之间有往返都有利可图的货物对
 */

export const ports: Port[] = [
  { id: 1, name: 'Havana', nameCn: '哈瓦那', latitude: 23.1136, longitude: -82.3666, region: 'caribbean', description: '古巴首府，加勒比海最大的西班牙殖民港口，以优质雪茄和蔗糖闻名', services: ['repair', 'supply', 'recruit', 'trade', 'shipyard'] },
  { id: 2, name: 'Port Royal', nameCn: '皇家港', latitude: 17.9367, longitude: -76.8425, region: 'caribbean', description: '牙买加的"海盗之都"，加勒比海最臭名昭著的海盗据点', services: ['repair', 'supply', 'recruit', 'trade', 'shipyard'] },
  { id: 3, name: 'Nassau', nameCn: '拿骚', latitude: 25.0480, longitude: -77.3554, region: 'caribbean', description: '巴哈马群岛首府，海盗共和国的中心', services: ['repair', 'supply', 'trade', 'shipyard'] },
  { id: 4, name: 'Tortuga', nameCn: '托尔图加', latitude: 20.0444, longitude: -72.7847, region: 'caribbean', description: '海地北部的海盗岛，法国海盗的根据地', services: ['repair', 'recruit', 'trade'] },
  { id: 5, name: 'San Juan', nameCn: '圣胡安', latitude: 18.4655, longitude: -66.1057, region: 'caribbean', description: '波多黎各首府，西班牙在加勒比海的重要军事要塞', services: ['repair', 'supply', 'recruit', 'trade'] },
  { id: 6, name: 'Seville', nameCn: '塞维利亚', latitude: 37.3886, longitude: -5.9823, region: 'europe', description: '西班牙内河港口，大航海时代最重要的贸易中心，来自新大陆的财富汇聚于此', services: ['repair', 'supply', 'recruit', 'trade', 'shipyard'] },
  { id: 7, name: 'Lisbon', nameCn: '里斯本', latitude: 38.7223, longitude: -9.1393, region: 'europe', description: '葡萄牙首都，大航海时代的起点，达伽马和麦哲伦的出发港', services: ['repair', 'supply', 'recruit', 'trade', 'shipyard'] },
  { id: 8, name: 'London', nameCn: '伦敦', latitude: 51.5074, longitude: -0.1278, region: 'europe', description: '英格兰首都，伊丽莎白时代的海上霸权中心', services: ['repair', 'supply', 'recruit', 'trade', 'shipyard'] },
  { id: 9, name: 'Elmina', nameCn: '埃尔米纳', latitude: 5.0833, longitude: -1.3500, region: 'africa', description: '黄金海岸上的葡萄牙城堡，西非最重要的贸易据点', services: ['supply', 'trade'] },
  { id: 10, name: 'Cape Town', nameCn: '开普敦', latitude: -33.9249, longitude: 18.4241, region: 'africa', description: '好望角的补给站，通往东方航线的关键中转港', services: ['repair', 'supply', 'trade'] },
  { id: 11, name: 'Goa', nameCn: '果阿', latitude: 15.2993, longitude: 74.1240, region: 'asia', description: '葡萄牙在印度的殖民首府，东方香料贸易的核心', services: ['repair', 'supply', 'trade'] },
  { id: 12, name: 'Malacca', nameCn: '马六甲', latitude: 2.1896, longitude: 102.2501, region: 'asia', description: '马六甲海峡的咽喉要地，东西方贸易的十字路口', services: ['repair', 'supply', 'trade'] },
  { id: 13, name: 'Cartagena', nameCn: '卡塔赫纳', latitude: 10.3910, longitude: -75.5364, region: 'caribbean', description: '西班牙在加勒比海最重要的军事要塞和奴隶贸易中心', services: ['repair', 'supply', 'recruit', 'trade', 'shipyard'] },
  { id: 14, name: 'Veracruz', nameCn: '韦拉克鲁斯', latitude: 19.1738, longitude: -96.1342, region: 'caribbean', description: '墨西哥湾最重要的西班牙港口，新大陆财富的集散地', services: ['repair', 'supply', 'trade'] },
  { id: 15, name: 'Amsterdam', nameCn: '阿姆斯特丹', latitude: 52.3676, longitude: 4.9041, region: 'europe', description: '荷兰黄金时代的贸易中心，东印度公司的总部所在地', services: ['repair', 'supply', 'recruit', 'trade', 'shipyard'] },
  { id: 16, name: 'Mombasa', nameCn: '蒙巴萨', latitude: -4.0500, longitude: 39.6667, region: 'africa', description: '东非斯瓦希里海岸的重要港口，象牙和香料贸易枢纽', services: ['supply', 'trade'] },
  { id: 17, name: 'Zanzibar', nameCn: '桑给巴尔', latitude: -6.1659, longitude: 39.1989, region: 'africa', description: '印度洋上的香料之岛，东非最重要的贸易中转站', services: ['supply', 'trade'] },
  { id: 18, name: 'Macau', nameCn: '澳门', latitude: 22.1987, longitude: 113.5439, region: 'asia', description: '葡萄牙在中国的据点，东西方文化交汇之地', services: ['repair', 'supply', 'trade'] },
  { id: 19, name: 'Batavia', nameCn: '巴达维亚', latitude: -6.2088, longitude: 106.8456, region: 'asia', description: '荷兰东印度公司在亚洲的总部，今天的雅加达', services: ['repair', 'supply', 'recruit', 'trade'] },
  { id: 20, name: 'Cádiz', nameCn: '加的斯', latitude: 36.5298, longitude: -6.2928, region: 'europe', description: '西班牙珍宝舰队的终点港，来自新大陆的白银在此卸货', services: ['repair', 'supply', 'recruit', 'trade', 'shipyard'] },
]

export const portGoods: PortGood[] = [
  /* ---- 哈瓦那(1)：产蔗糖/烟草/朗姆酒，渴求丝绸/火炮 ---- */
  { portId: 1, goodId: 1, price: 8, stock: 200, priceModifier: 0.7 },
  { portId: 1, goodId: 5, price: 45, stock: 80, priceModifier: 0.8 },
  { portId: 1, goodId: 3, price: 30, stock: 100, priceModifier: 0.8 },
  { portId: 1, goodId: 10, price: 210, stock: 40, priceModifier: 1.6 },
  { portId: 1, goodId: 4, price: 130, stock: 25, priceModifier: 1.4 },
  { portId: 1, goodId: 8, price: 150, stock: 30, priceModifier: 1.3 },

  /* ---- 皇家港(2)：海盗港，产朗姆酒，渴求火炮/火枪/丝绸 ---- */
  { portId: 2, goodId: 1, price: 6, stock: 250, priceModifier: 0.5 },
  { portId: 2, goodId: 7, price: 110, stock: 25, priceModifier: 1.5 },
  { portId: 2, goodId: 4, price: 140, stock: 20, priceModifier: 1.6 },
  { portId: 2, goodId: 10, price: 200, stock: 30, priceModifier: 1.5 },
  { portId: 2, goodId: 9, price: 280, stock: 15, priceModifier: 1.6 },

  /* ---- 拿骚(3)：海盗共和国，产烟草，渴求武器/朗姆酒 ---- */
  { portId: 3, goodId: 3, price: 32, stock: 120, priceModifier: 0.7 },
  { portId: 3, goodId: 7, price: 100, stock: 30, priceModifier: 1.35 },
  { portId: 3, goodId: 4, price: 125, stock: 25, priceModifier: 1.4 },
  { portId: 3, goodId: 1, price: 14, stock: 80, priceModifier: 1.2 },
  { portId: 3, goodId: 9, price: 260, stock: 20, priceModifier: 1.45 },

  /* ---- 托尔图加(4)：法国海盗岛，产烟草/朗姆酒，渴求武器 ---- */
  { portId: 4, goodId: 3, price: 28, stock: 150, priceModifier: 0.6 },
  { portId: 4, goodId: 1, price: 7, stock: 180, priceModifier: 0.6 },
  { portId: 4, goodId: 7, price: 115, stock: 25, priceModifier: 1.5 },
  { portId: 4, goodId: 4, price: 145, stock: 20, priceModifier: 1.6 },
  { portId: 4, goodId: 9, price: 250, stock: 20, priceModifier: 1.4 },

  /* ---- 圣胡安(5)：产烟草，渴求蔗糖/丝绸 ---- */
  { portId: 5, goodId: 3, price: 33, stock: 130, priceModifier: 0.75 },
  { portId: 5, goodId: 5, price: 65, stock: 40, priceModifier: 1.3 },
  { portId: 5, goodId: 10, price: 195, stock: 30, priceModifier: 1.5 },
  { portId: 5, goodId: 1, price: 12, stock: 100, priceModifier: 1.0 },

  /* ---- 塞维利亚(6)：欧洲集散中心，产火炮/火枪/丝绸，渴求蔗糖/香料 ---- */
  { portId: 6, goodId: 4, price: 80, stock: 60, priceModifier: 0.85 },
  { portId: 6, goodId: 7, price: 65, stock: 50, priceModifier: 0.85 },
  { portId: 6, goodId: 10, price: 105, stock: 60, priceModifier: 0.85 },
  { portId: 6, goodId: 5, price: 90, stock: 50, priceModifier: 1.6 },
  { portId: 6, goodId: 9, price: 260, stock: 30, priceModifier: 1.5 },
  { portId: 6, goodId: 3, price: 55, stock: 40, priceModifier: 1.3 },

  /* ---- 里斯本(7)：产火炮/火枪，渴求香料/蔗糖/象牙 ---- */
  { portId: 7, goodId: 4, price: 75, stock: 70, priceModifier: 0.8 },
  { portId: 7, goodId: 7, price: 60, stock: 60, priceModifier: 0.8 },
  { portId: 7, goodId: 9, price: 250, stock: 40, priceModifier: 1.45 },
  { portId: 7, goodId: 5, price: 85, stock: 40, priceModifier: 1.5 },
  { portId: 7, goodId: 2, price: 55, stock: 40, priceModifier: 1.5 },

  /* ---- 伦敦(8)：产火枪/木材，渴求蔗糖/烟草/丝绸 ---- */
  { portId: 8, goodId: 7, price: 58, stock: 70, priceModifier: 0.75 },
  { portId: 8, goodId: 6, price: 16, stock: 150, priceModifier: 0.6 },
  { portId: 8, goodId: 5, price: 80, stock: 50, priceModifier: 1.45 },
  { portId: 8, goodId: 3, price: 60, stock: 40, priceModifier: 1.3 },
  { portId: 8, goodId: 10, price: 160, stock: 30, priceModifier: 1.25 },

  /* ---- 埃尔米纳(9)：西非，产象牙/黄金海岸木材，渴求火枪/布匹(丝) ---- */
  { portId: 9, goodId: 2, price: 20, stock: 150, priceModifier: 0.6 },
  { portId: 9, goodId: 6, price: 18, stock: 120, priceModifier: 0.7 },
  { portId: 9, goodId: 7, price: 95, stock: 30, priceModifier: 1.45 },
  { portId: 9, goodId: 10, price: 180, stock: 25, priceModifier: 1.4 },
  { portId: 9, goodId: 4, price: 120, stock: 20, priceModifier: 1.3 },

  /* ---- 开普敦(10)：补给站，产食物，渴求武器 ---- */
  { portId: 10, goodId: 1, price: 9, stock: 200, priceModifier: 0.9 },
  { portId: 10, goodId: 6, price: 20, stock: 100, priceModifier: 0.8 },
  { portId: 10, goodId: 4, price: 130, stock: 20, priceModifier: 1.5 },
  { portId: 10, goodId: 7, price: 105, stock: 25, priceModifier: 1.4 },
  { portId: 10, goodId: 9, price: 240, stock: 25, priceModifier: 1.35 },

  /* ---- 果阿(11)：印度，产香料（最便宜），渴求火炮/象牙/木材 ---- */
  { portId: 11, goodId: 9, price: 110, stock: 100, priceModifier: 0.6 },
  { portId: 11, goodId: 4, price: 115, stock: 30, priceModifier: 1.35 },
  { portId: 11, goodId: 2, price: 50, stock: 40, priceModifier: 1.25 },
  { portId: 11, goodId: 6, price: 40, stock: 60, priceModifier: 1.6 },
  { portId: 11, goodId: 10, price: 165, stock: 40, priceModifier: 1.3 },

  /* ---- 马六甲(12)：香料中心，产香料/丝绸（最便宜），渴求火炮 ---- */
  { portId: 12, goodId: 9, price: 100, stock: 120, priceModifier: 0.55 },
  { portId: 12, goodId: 10, price: 85, stock: 90, priceModifier: 0.65 },
  { portId: 12, goodId: 4, price: 135, stock: 25, priceModifier: 1.45 },
  { portId: 12, goodId: 3, price: 60, stock: 40, priceModifier: 1.3 },
  { portId: 12, goodId: 2, price: 48, stock: 40, priceModifier: 1.2 },

  /* ---- 卡塔赫纳(13)：产烟草/蔗糖，渴求丝绸/火枪 ---- */
  { portId: 13, goodId: 3, price: 30, stock: 140, priceModifier: 0.7 },
  { portId: 13, goodId: 5, price: 48, stock: 70, priceModifier: 0.85 },
  { portId: 13, goodId: 10, price: 190, stock: 30, priceModifier: 1.45 },
  { portId: 13, goodId: 7, price: 105, stock: 25, priceModifier: 1.4 },
  { portId: 13, goodId: 1, price: 11, stock: 120, priceModifier: 0.95 },

  /* ---- 韦拉克鲁斯(14)：产烟草/蔗糖（最便宜），渴求丝绸/香料 ---- */
  { portId: 14, goodId: 3, price: 25, stock: 180, priceModifier: 0.6 },
  { portId: 14, goodId: 5, price: 40, stock: 100, priceModifier: 0.7 },
  { portId: 14, goodId: 10, price: 185, stock: 35, priceModifier: 1.4 },
  { portId: 14, goodId: 9, price: 270, stock: 25, priceModifier: 1.55 },
  { portId: 14, goodId: 6, price: 30, stock: 60, priceModifier: 1.2 },

  /* ---- 阿姆斯特丹(15)：产火炮/木材/火枪，渴求香料/蔗糖/丝绸 ---- */
  { portId: 15, goodId: 4, price: 70, stock: 70, priceModifier: 0.75 },
  { portId: 15, goodId: 6, price: 14, stock: 180, priceModifier: 0.55 },
  { portId: 15, goodId: 7, price: 62, stock: 55, priceModifier: 0.8 },
  { portId: 15, goodId: 9, price: 255, stock: 35, priceModifier: 1.4 },
  { portId: 15, goodId: 5, price: 82, stock: 45, priceModifier: 1.45 },
  { portId: 15, goodId: 10, price: 145, stock: 40, priceModifier: 1.15 },

  /* ---- 蒙巴萨(16)：东非，产象牙，渴求火枪/丝绸 ---- */
  { portId: 16, goodId: 2, price: 22, stock: 130, priceModifier: 0.65 },
  { portId: 16, goodId: 7, price: 98, stock: 30, priceModifier: 1.4 },
  { portId: 16, goodId: 10, price: 175, stock: 30, priceModifier: 1.35 },
  { portId: 16, goodId: 1, price: 13, stock: 90, priceModifier: 1.05 },

  /* ---- 桑给巴尔(17)：香料岛，产香料，渴求火炮/象牙转运 ---- */
  { portId: 17, goodId: 9, price: 120, stock: 80, priceModifier: 0.65 },
  { portId: 17, goodId: 2, price: 24, stock: 110, priceModifier: 0.7 },
  { portId: 17, goodId: 4, price: 125, stock: 25, priceModifier: 1.4 },
  { portId: 17, goodId: 10, price: 170, stock: 30, priceModifier: 1.3 },

  /* ---- 澳门(18)：中国，产丝绸（最便宜），渴求香料/象牙 ---- */
  { portId: 18, goodId: 10, price: 55, stock: 120, priceModifier: 0.45 },
  { portId: 18, goodId: 9, price: 135, stock: 60, priceModifier: 0.75 },
  { portId: 18, goodId: 2, price: 45, stock: 40, priceModifier: 1.15 },
  { portId: 18, goodId: 5, price: 75, stock: 40, priceModifier: 1.35 },

  /* ---- 巴达维亚(19)：东印度公司，产香料/丝绸，渴求火炮/火枪 ---- */
  { portId: 19, goodId: 9, price: 105, stock: 100, priceModifier: 0.58 },
  { portId: 19, goodId: 10, price: 80, stock: 80, priceModifier: 0.6 },
  { portId: 19, goodId: 4, price: 128, stock: 30, priceModifier: 1.4 },
  { portId: 19, goodId: 7, price: 100, stock: 30, priceModifier: 1.35 },
  { portId: 19, goodId: 3, price: 55, stock: 40, priceModifier: 1.2 },

  /* ---- 加的斯(20)：珍宝舰队终点，白银充裕（什么都贵），渴求一切殖民地货 ---- */
  { portId: 20, goodId: 5, price: 95, stock: 40, priceModifier: 1.7 },
  { portId: 20, goodId: 3, price: 62, stock: 35, priceModifier: 1.4 },
  { portId: 20, goodId: 9, price: 275, stock: 25, priceModifier: 1.55 },
  { portId: 20, goodId: 1, price: 16, stock: 60, priceModifier: 1.3 },
  { portId: 20, goodId: 10, price: 175, stock: 30, priceModifier: 1.4 },
]

/**
 * 行情速报池：每个 portId 列出"该港渴求的商品"，
 * 用于酒馆传闻/抵达通知，让玩家能发现有利航线而非瞎撞。
 */
export const marketTips: { portId: number; goodId: number }[] = portGoods
  .filter(pg => pg.priceModifier >= 1.3)
  .map(pg => ({ portId: pg.portId, goodId: pg.goodId }))

/** 某港的本地特产（买价便宜，modifier <= 0.75） */
export function localSpecialties(portId: number): number[] {
  return portGoods
    .filter(pg => pg.portId === portId && pg.priceModifier <= 0.75)
    .map(pg => pg.goodId)
}

/** 某港高价收购的商品（modifier >= 1.3），按渴求度降序 */
export function localDemands(portId: number): number[] {
  return portGoods
    .filter(pg => pg.portId === portId && pg.priceModifier >= 1.3)
    .sort((a, b) => b.priceModifier - a.priceModifier)
    .map(pg => pg.goodId)
}
