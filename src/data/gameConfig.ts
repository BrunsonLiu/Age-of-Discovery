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
  /** 每日价格波动幅度（±%，按库存反向浮动） */
  PRICE_FLUCTUATION_MAX: 0.2,
  /** 库存每日恢复量 */
  STOCK_RECOVER_PER_DAY: 8,
  /** 胜利条件：探索全部港口 */
  VICTORY_DISCOVER_ALL: 20,
  /** 胜利条件：累积金币（完成全部任务一档按 tasks.length 动态判定） */
  VICTORY_GOLD: 20000,
  /** 港口休整：消耗食物 */
  REST_FOOD: 5,
  /** 港口休整：消耗淡水 */
  REST_WATER: 5,
  /** 港口休整：士气回复 */
  REST_MORALE: 10,
  /** 甲板盛宴：总费用（金币） */
  FEAST_COST: 150,
  /** 甲板盛宴：消耗食物 */
  FEAST_FOOD: 10,
  /** 甲板盛宴：消耗淡水 */
  FEAST_WATER: 5,
  /*
   * 航行中「加餐」（holdMess）：每天最多一次，用食物换士气。
   *
   * 【为什么要给航行中加一个士气操作】
   * 士气的**所有**管理原先都在港口（休整 +10 / 盛宴 +25），而海上没有入口。
   *
   * 【更正：士气不是每天 -5】
   * 我一开始以为 MORALE_DECAY_PER_DAY 是"每天被动衰减"，实测才发现
   * advanceDay 里唯一的自然消耗是 `if (food === 0 || water === 0)`：
   * 断粮断水那天才掉 5 点，粮水充足时士气一动不动（20 天采样验证）。
   * 所以士气是**事件驱动**的：被海盗/风暴打掉，再靠休整/盛宴/士气事件补回。
   *
   * 于是这条特长的价值是："在海上被事件打掉士气后，不必为了补士气绕回港口"。
   * 对 30 天以上的远洋是实打实的；对两天短途没有用（那时也不缺士气）。
   *
   * 数值：粮 2 + 水 1 → 士气 +10（约等于一次港口休整的一半，但不占靠港时间）。
   * 每天一次是硬约束：不设的话玩家会一口气把粮全换成士气，
   * 那既不是决策也不是操作，只是把一个数字搬到另一个数字上。
   */
  MESS_FOOD: 2,
  MESS_WATER: 1,
  MESS_MORALE: 10,
  /** 甲板盛宴：士气回复 */
  FEAST_MORALE: 30,
  /** 甲板盛宴：声望增益 */
  FEAST_FAME: 2,
  /** 航线情报购买费用（金币） */
  INTEL_COST: 80,
  /** 航线情报有效期（天）——过期后风险构成需重新购买 */
  INTEL_VALID_DAYS: 30,
  /** 航行中切换航速的士气代价 */
  SPEED_SWITCH_MORALE: 2,
  /** 竞争船长推进间隔（天） */
  RIVAL_TICK_DAYS: 2,
  /* ---- 第二条线：派系声望 ---- */
  /** 大额贸易门槛：单笔成交额达到该值才为商会赢得好感 */
  GUILD_DEAL_MIN: 400,
  /** 大额贸易的商会好感增益 */
  GUILD_DEAL_FAME: 4,
  /** 击退海盗：王室好感 / 兄弟会恶感 */
  CROWN_PIRATE_WIN: 6,
  BRETHREN_PIRATE_WIN: -8,
  /** 走私交易：兄弟会好感 / 王室恶感 */
  BRETHREN_SMUGGLE: 10,
  CROWN_SMUGGLE: -6,
  /** 港口盛宴：商会好感 / 王室好感（宴请行商与官吏） */
  GUILD_FEAST: 4,
  CROWN_FEAST: 2,
  /** 发现新港口：学者好感（海图）/ 王室好感（拓疆） */
  SCHOLARS_DISCOVER: 5,
  CROWN_DISCOVER: 3,
  /* ---- 第二条线：名船员 ---- */
  /** 忠诚度初始值 */
  CREW_LOYALTY_START: 60,
  /** 低士气（<45）每日忠诚衰减 */
  CREW_LOYALTY_DECAY_LOW_MORALE: 3,
  /** 高危航段（dangerLevel≥4）每日忠诚衰减 */
  CREW_LOYALTY_DECAY_DANGER: 1,
  /** 忠诚度低于该值时有离船风险 */
  CREW_LOYALTY_RISK: 25,
  /** 每日忠诚衰减的随机离船概率（低于风险线时） */
  CREW_DESERT_CHANCE: 0.15,
  /** 海盗战败/坏血病时名船员死亡概率 */
  CREW_DEATH_CHANCE: 0.12,
  /* ---- 第二条线：称谓 ---- */
  /** "贪婪者"毛利加成（唯一实装的称号数值，被 data/traits.priceMultiplier 读取） */
  GREED_PROFIT_BONUS: 0.04,
  /*
   * 曾经还有两条：
   *   GREED_FAME_PENALTY: 0.2   —— "贪婪者"声望获取 -20%
   *   BOLD_LUCK_BONUS: 0.04     —— "海上赌徒"好结局概率 +4%
   * 定义了从来没有一处读过，而称号面板/帮助面板却照着它们写了好几个月。
   * 2026-11-14 删掉：配置里留一个没人读的数，比没有更危险 ——
   * 后来的人（包括我自己）会以为改它有用。真要做这两条效果，先实现再重新加。 */
} as const

/**
 * 航速档位档案：speed=移动倍率，supply=补给消耗倍率，event=事件遭遇倍率，wear=耐久损耗倍率
 *
 * 【已废弃】这套「航速档位」曾与「航段方针」并存，两个旋钮都在改速度与补给，
 * 叠乘之后玩家无法推演因果；而且航速档位实际上从未改变航程天数
 * （每日航程没乘它的倍率），只有界面上的数字在变——数字在骗人。
 *
 * 现在速度/补给/磨损/事件率**统一由航段方针 STANCES 决定**（见 utils/segment.ts）。
 * 这个对象保留下来只为兼容旧存档与旧测试，不参与任何游戏逻辑。
 */
export const SPEED_PROFILES = {
  full: {
    label: '全速航行',
    hint: '张满帆抢时间——补给烧得快，遭遇风险也高',
    speed: 1.5,
    supply: 1.5,
    event: 1.35,
    wear: 2,
  },
  cruise: {
    label: '巡航',
    hint: '标准航速，时间与消耗的平衡',
    speed: 1,
    supply: 1,
    event: 1,
    wear: 1,
  },
  economy: {
    label: '经济航行',
    hint: '收帆省补给——慢一些，但坏血病和断粮都更晚找上门',
    speed: 0.7,
    supply: 0.6,
    event: 0.7,
    wear: 0.5,
  },
} as const satisfies Record<string, { label: string; hint: string; speed: number; supply: number; event: number; wear: number }>
