import type { FactionId, Port } from '@/types'

export interface FactionPerk {
  /** 声望阈值 */
  at: number
  /** 效果描述 */
  text: string
}

export interface Faction {
  id: FactionId
  name: string
  /** 代表人物/旗帜描述 */
  motto: string
  icon: string
  desc: string
  /** 正面效果（按阈值递进） */
  perks: FactionPerk[]
  /** 敌对（≤ -30）的代价 */
  hostility: string
}

/**
 * 四方势力。核心设计：同一种行为在不同派系眼里意义相反——
 * 击退海盗赢得王室赏识，却在兄弟会结下梁子；走私让兄弟会引为知己，王室则视为通缉犯。
 */
export const FACTIONS: Faction[] = [
  {
    id: 'crown',
    name: '王室',
    motto: '奉王命而行，持王之特许',
    icon: '👑',
    desc: '西班牙与葡萄牙的王室。他们掌握特许状、王家合约与珍宝舰队的护航权——也掌握绞索。',
    perks: [
      { at: 30, text: '解锁王家合约：护送任务的报酬 +25%' },
      { at: 60, text: '王室港（塞维利亚/加的斯/卡塔赫纳）修理与补给永久九折' },
      { at: 90, text: '国王亲自授勋：全港交易额外优惠 3%' },
    ],
    hostility: '被王室通缉：王室港拒绝提供服务，王家合约全部关闭',
  },
  {
    id: 'guild',
    name: '商人商会',
    motto: '信用即通货，合约即海图',
    icon: '⚖️',
    desc: '阿姆斯特丹与伦敦的行商联合会。他们控制大宗商品的定价权与信贷——商会的朋友从不缺买主。',
    perks: [
      { at: 30, text: '大宗货物（≥50 件）买卖价额外优惠 2%' },
      { at: 60, text: '所有港口买卖价再降 3%' },
      { at: 90, text: '商会为您兜底：滞销货物可按底价七折回收' },
    ],
    hostility: '被商会除名：大宗交易无优惠，货源情报不再共享',
  },
  {
    id: 'scholars',
    name: '学者公会',
    motto: '未知的海角，比已知的黄金更珍贵',
    icon: '📜',
    desc: '里斯本与塞维利亚的制图师、博物学者与星算家。他们用羊皮纸和星盘换你带回的每一份新见闻。',
    perks: [
      { at: 30, text: '航线情报半价，学者港可免费查询一条航线风险' },
      { at: 60, text: '发现物与遗物献学者可换双倍报酬' },
      { at: 90, text: '解锁"古海图"：地图上标注两处未标记的潜在地点' },
    ],
    hostility: '被学界嗤笑：发现物无人问津，情报渠道关闭',
  },
  {
    id: 'brethren',
    name: '海盗兄弟会',
    motto: '陆地上没有我们的位置',
    icon: '🏴‍☠️',
    desc: '皇家港、拿骚与托尔图加的法外之徒。他们不问你的旗帜只问你的胆子——黑旗向导能让追兵变成顺风。',
    perks: [
      { at: 30, text: '黑市开放：禁运品（武器/奢侈品）溢价收购' },
      { at: 60, text: '海盗遭遇率 -20%，被俘时可赎金免战' },
      { at: 90, text: '兄弟会为您护航：高危航段不再遇敌' },
    ],
    hostility: '被兄弟会追猎：海盗遭遇率 +20%，无人替你说话',
  },
]

export const FACTION_MAP = new Map(FACTIONS.map(f => [f.id, f]))

/** 港口归属势力：决定当地"谁说话算数" */
const PORT_FACTION: Record<number, FactionId> = {
  1: 'crown',    // 哈瓦那：西班牙殖民港
  2: 'brethren', // 皇家港：海盗之都
  3: 'brethren', // 拿骚：海盗共和国
  4: 'brethren', // 托尔图加：法外之地
  5: 'crown',    // 圣胡安：军事要塞
  6: 'crown',    // 塞维利亚：贸易总管
  7: 'scholars', // 里斯本：大航海起点，学者云集
  8: 'guild',    // 伦敦：商会中心
  9: 'crown',    // 埃尔米纳：葡萄牙城堡
  10: 'crown',   // 开普敦：王室补给站
  11: 'crown',   // 果阿：葡萄牙殖民首府
  12: 'guild',   // 马六甲：商业十字路口
  13: 'crown',   // 卡塔赫纳：军事要塞
  14: 'crown',   // 韦拉克鲁斯：财富集散地
  15: 'guild',   // 阿姆斯特丹：东印度公司
  16: 'guild',   // 蒙巴萨：贸易枢纽
  17: 'guild',   // 桑给巴尔：贸易中转
  18: 'guild',   // 澳门：商业据点
  19: 'guild',   // 巴达维亚：荷属总部
  20: 'crown',   // 加的斯：珍宝舰队终点
}

export function portFaction(portId: number): FactionId {
  return PORT_FACTION[portId] ?? 'guild'
}

/** 态度分档：崇敬 / 友善 / 中立 / 冷淡 / 敌对 */
export interface FactionAttitude {
  label: string
  /** 语气色：good/neutral/bad */
  tone: 'good' | 'neutral' | 'bad'
  /** 0-4 档位，用于星标显示 */
  level: number
}

export function factionAttitude(rep: number): FactionAttitude {
  if (rep >= 60) return { label: '崇敬', tone: 'good', level: 4 }
  if (rep >= 30) return { label: '友善', tone: 'good', level: 3 }
  if (rep >= -30) return { label: '中立', tone: 'neutral', level: 2 }
  if (rep >= -60) return { label: '冷淡', tone: 'bad', level: 1 }
  return { label: '敌对', tone: 'bad', level: 0 }
}

/** 已解锁到第几档（用于显示"再 X 点解锁下一档"） */
export function nextPerk(faction: Faction, rep: number): FactionPerk | null {
  return faction.perks.find(p => rep < p.at) ?? null
}

export function factionOfPort(port: Port | undefined): Faction | null {
  if (!port) return null
  return FACTION_MAP.get(portFaction(port.id)) ?? null
}
