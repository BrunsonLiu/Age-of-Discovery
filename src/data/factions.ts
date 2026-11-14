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
  /**
   * 敌对（≤ -30）的代价。
   *
   * 【2026-11-14 逐条对过代码】真正生效的只有一条：声望低于阈值时该派系的
   * 交易折扣失效（priceMultiplier 里按阈值判）。"王室港拒绝服务""被俘可赎金免战"
   * "海盗遭遇率 +20%" 这些都还没有实现 —— 所以文案里一律写明"尚未实装"，
   * 将来真要做时先实现、再改文案。目前界面不显示 hostility，但数据不能先撒谎。
   */
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
      /*
       * 前两条是 2026-11-15 新接的：给 crewPerks 的 taskGold / repairCost / supplyCost
       * 各加一个倍率参数，倍率只从 `portServiceMul` / `escortRewardMul` 出 ——
       * 港口面板（显示）与 store（扣款）调同一个函数，屏幕价 = 实际扣款。
       */
      { at: 30, text: '护送委托赏金 +25%' },
      { at: 60, text: '王室港修理与补给九折' },
      { at: 90, text: '全港交易额外优惠 3%' },
    ],
    /*
     * 【"王室港"具体是哪几座】按 data/factions 的 PORT_FACTION：归 crown 的 9 座
     * （哈瓦那、圣胡安、塞维利亚、埃尔米纳、开普敦、果阿、卡塔赫纳、韦拉克鲁斯、加的斯）。
     * 文案不逐一列举：将来加港口只需改 PORT_FACTION，界面上的句子不用跟着改。
     */
    hostility: '被王室通缉：王室相关折扣全部失效（拒绝服务、王家合约关闭尚未实装）',
  },
  {
    id: 'guild',
    name: '商人商会',
    motto: '信用即通货，合约即海图',
    icon: '⚖️',
    desc: '阿姆斯特丹与伦敦的行商联合会。他们控制大宗商品的定价权与信贷——商会的朋友从不缺买主。',
    perks: [
      // 30 档没有"大宗 ≥50 件"条件：代码是 m -= 0.01，没有件数判定（见下方说明）
      { at: 30, text: '所有买卖价优惠 1%' },
      // 60 档是 else-if：达成后是 3%，不是 1%+3%
      { at: 60, text: '所有买卖价优惠 3%' },
    ],
    /*
     * 设计稿（未实现）：
     *   { at: 90, text: '商会为您兜底：滞销货物可按底价七折回收' }
     *
     * 【为什么 30 档从"大宗≥50 件额外 2%"改成"1%"】原文档写的是批量条件 + 2%，
     * 而 traits.ts 的 priceMultiplier 里是 `guild >= 30 → m -= 0.01`，没有件数判定。
     * 界面照着原文写就是在承诺一件不会发生的事。要么给买卖加件数参数
     * （dynamicBuyPrice/selectSellPrice 的签名全要动，且"多少件算大宗"要玩家自己数），
     * 要么照实写 1%。选了后者：一个准数胜过一句好听的。
     * 60 档原文"再降 3%"也不准 —— 代码是 else if，≥60 时只减 3%，不是 1%+3%。
     */
    hostility: '被商会除名：商会折扣失效（货源情报不再共享尚未实装）',
  },
  {
    id: 'scholars',
    name: '学者公会',
    motto: '未知的海角，比已知的黄金更珍贵',
    icon: '📜',
    desc: '里斯本与塞维利亚的制图师、博物学者与星算家。他们用羊皮纸和星盘换你带回的每一份新见闻。',
    perks: [
      // 实现在 utils/crewPerks.intelCost：显示价与结算价同源
      { at: 30, text: '航线情报半价' },
    ],
    /*
     * 设计稿（未实现）：
     *   { at: 30, ……'学者港可免费查询一条航线风险' } —— 情报是整条航线的三项风险，
     *        没有"单查一条"的粒度
     *   { at: 60, text: '发现物与遗物献学者可换双倍报酬' }
     *   { at: 90, text: '解锁"古海图"：地图上标注两处未标记的潜在地点' }
     */
    hostility: '被学界嗤笑：学者公会的情报半价失效（发现物无人问津尚未实装）',
  },
  {
    id: 'brethren',
    name: '海盗兄弟会',
    motto: '陆地上没有我们的位置',
    icon: '🏴‍☠️',
    desc: '皇家港、拿骚与托尔图加的法外之徒。他们不问你的旗帜只问你的胆子——黑旗向导能让追兵变成顺风。',
    perks: [
      /*
       * 实现在 data/traits.ts priceMultiplier：走 portFaction。
       * "自家港口"= 皇家港/拿骚/托尔图加（PORT_FACTION 里归 brethren 的三座）；
       * 别的港口不给折扣，单测钉住了这一点。
       */
      { at: 30, text: '自家港口买卖价优惠 4%' },
      // 实现在 utils/eventEngine.pirateEncounterSuppressed（抽事件时整类筛掉）
      { at: 60, text: '海盗遭遇率 -20%' },
      { at: 90, text: '海盗不再拦你的船' },
    ],
    /*
     * 设计稿（未实现）：
     *   { at: 30, text: '黑市开放：禁运品（武器/奢侈品）溢价收购' }
     *        需要价格链认"货物类型"（现在只有 portFaction 一个新增维度），
     *        以及"哪些货算禁运品"的表 —— 两者都没有。
     *
     * 【60/90 档为什么只留"遭遇率"这一半】原文还写着「被俘时可赎金免战」——
     * 这游戏没有"被俘"状态（打输了是掉耐久/货，不是被俘），也没有赎金界面。
     * 那句是设计稿里的想象，删掉比留着诚实。
     */
    hostility: '被兄弟会追猎：自家港口折扣失效（海盗遭遇率 +20% 尚未实装）',
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
  21: 'scholars', // 广州：市舶司与钦天监，见闻换船引的地方
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
