import type { FactionId, NationId } from '@/types'

/* NationId 的唯一定义在 types/index.ts（GameState 要用它），这里只转出去 */
export type { NationId }

/**
 * 开局国别：**你是谁的人，决定了你从哪片海出发、船上是什么人、追哪个传说，
 * 以及这一局要走哪一条航路**。
 *
 * 【为什么要这一层，而不是只换一段开场文字】
 * 2026-11-12 用户的方向："开局选城或者国家，毕竟不同的国家在大航海
 * 这段期间有不同的故事，以及可以适当编造，结合神话和传说"；
 * 紧接着又补了一句："每个国家在这段历史有不同的故事线和航线，
 * 开局船的位置也不一样……但还是不要只用文字堆砌"。
 *
 * 所以每一面旗都真的改变五件事（任何一件只是文案就不算数）：
 *
 *   ① **出发点**：里斯本 / 塞维利亚 / 伦敦 / 阿姆斯特丹 / 广州。
 *      第一趟航程的距离本身就变了（伦敦去加勒比比里斯本多 900 海里；
 *      广州去加勒比要横穿两个大洋）。
 *   ② **船上的人**：船名、士气、船员、名号（`start`）。
 *   ③ **起手就认你的势力**（`faction`）—— 声望是"别人怎么说你"，不是钱。
 *      这一条刻意不给金币：这条线不再扩展金钱玩法。
 *   ④ **一个传说**（`legend`）：真实海域坐标上的神话物件，开进 90 海里兑现一次。
 *   ⑤ **一条三段的故事线**（`story`）：三段的终点是**地图上真实的港口**，
 *      玩家必须把船开过去；每走完一段，名号/士气/势力声望当场变，
 *      而**下一段的目的地才出现在海图上**。故事不是读出来的，是走出来的。
 *
 * 【史实只写一句】
 * `history` 一句话，带年份、带人名、带港口。玩家不需要在这里读论文；
 * 他要的是"我选的这面旗，在这段历史里真的做过这件事"。
 *
 * 【传说与故事线的坐标都必须是真地方】
 * 传说坐标全部用 `land.geojson` 校验过在海里（单测守着）；故事线的终点是
 * `data/ports` 里已有的港 —— 两条都保证"开得到"，不是摆在世界另一头的摆设。
 */

/** 传说海域：真实坐标上的神物件，开进半径就兑现（每国一条，一次性） */
export interface NationLegend {
  /** 稳定的键（进存档的 `collectedLegends`），不要用中文名 */
  id: string
  name: string
  lat: number
  lng: number
  /** 触发半径（海里）：必须真的开过去，不能隔着半个大洋领 */
  radiusNm: number
  /** 兑现什么（**没有金币**：给名号与士气） */
  gain: { fame: number; morale: number }
  /** 兑现时写进日志/通知的一句话 */
  line: string
}

/**
 * 一国航路的**一段**：开到那个港，这一段就算走完。
 *
 * 【为什么判"到港"而不是"到某片海"】航线是"从港到港"的，不是"从某片浪到某片浪"。
 * 用港做判据，玩家在东印度洋上不会因为蹭到一个看不见的圆圈就"通过了"，
 * 他必须真的把船开进那个码头。
 *
 * 【为什么奖励里没有金币】与遗物、传说同一条规矩：卖的是航路、名号、见闻。
 */
export interface StoryChapter {
  /** 稳定 id（进存档的 `storyDone`）：`<nationId>-<n>` */
  id: string
  /** 图上写的一段名（「绕过风暴角」），不是句子 */
  name: string
  /** 目的地港 id（必须真的存在） */
  portId: number
  /** 兑现（**没有金币**） */
  gain: { fame: number; morale: number; faction: Partial<Record<FactionId, number>> }
  /** 兑现时的一句话（带史实，一句） */
  line: string
}

export interface NationStart {
  /** 士气加成（加在 70 上，封顶 100） */
  morale: number
  /** 船员加成（加在座船的现有船员上，不超过 maxCrew） */
  crew: number
  /** 初始名号（"别人怎么说你"） */
  fame: number
  /** 开局就认你的势力 */
  faction: Partial<Record<FactionId, number>>
}

export interface Nation {
  id: NationId
  name: string
  /** 单字简称（窄卡片上用） */
  short: string
  /** 出发港 id（必须真的存在于 data/ports） */
  portId: number
  /** 座船名（同一艘卡拉维尔，只是船名不同——不靠换船型来堆强度） */
  shipName: string
  /** 这一国在这段历史里真的做过的事：一句话，带年份、人名、港口 */
  history: string
  /** 机制差异：玩家读得懂的一句话（不写数值堆砌） */
  perk: string
  /** 你是谁：两句，落在人身上（"你替谁跑过船"），不是国史 */
  origin: string
  /** 传说钩子：开局时听谁说起过那片海（不剧透兑现时的那句话） */
  rumor: string
  start: NationStart
  legend: NationLegend
  /** 这一国在这个时代真正走过的那条航线：三段，顺序不能乱 */
  story: StoryChapter[]
}

export const NATIONS: readonly Nation[] = [
  {
    id: 'portugal',
    name: '葡萄牙',
    short: '葡',
    portId: 7,
    shipName: '圣加布里埃尔号',
    history: '1488 年迪亚士绕过了那道风暴角，1498 年达伽马抵达印度——里斯本是这条航线唯一的起点。',
    perk: '王室起手就信你：王室声望 +14，水手跟过远洋（士气 +8）',
    origin: '你替若昂二世跑过三次西非。海图室的钥匙，你有半把。',
    rumor: '老绘图员指着西边：本来有个岛在那儿，后来被人从图上擦掉了。',
    start: { morale: 8, crew: 0, fame: 0, faction: { crown: 14 } },
    legend: {
      id: 'sao-brandao',
      name: '圣布伦丹岛',
      lat: 28.5,
      lng: -38.0,
      radiusNm: 90,
      gain: { fame: 20, morale: 6 },
      line: '云开了一线，海图上没有的岛在那里——老绘图员说它七年才浮上来一次。',
    },
    story: [
      {
        id: 'portugal-1', name: '西非商站', portId: 9,
        gain: { fame: 12, morale: 4, faction: { crown: 8 } },
        line: '埃尔米纳的城堡是葡人在黄金海岸钉下的第一颗钉子，你替王室把货单送到了。',
      },
      {
        id: 'portugal-2', name: '绕过风暴角', portId: 10,
        gain: { fame: 16, morale: 6, faction: { crown: 8, scholars: 6 } },
        line: '迪亚士当年把它叫风暴角，国王把它改叫好望角——你从这边绕过去了。',
      },
      {
        id: 'portugal-3', name: '印度的账房', portId: 11,
        gain: { fame: 20, morale: 6, faction: { crown: 10, guild: 6 } },
        line: '达伽马在卡利卡特说“我们来寻找基督徒和香料”，果阿后来成了这条航线的账房。',
      },
    ],
  },
  {
    id: 'spain',
    name: '西班牙',
    short: '西',
    portId: 6,
    shipName: '圣玛利亚号',
    history: '1492 年格拉纳达陷落的同一年，王室把特许状发给了一个热那亚人；此后美洲的白银全部从塞维利亚过账。',
    perk: '王室的兵上了船：船员 +5，王室声望 +10（士气 +4）',
    origin: '你从格拉纳达的营地退伍，王室欠你一份差事——和一张去西边的许可证。',
    rumor: '酒馆里有人赌咒：比米尼的水，喝下去能让人不老。',
    start: { morale: 4, crew: 5, fame: 0, faction: { crown: 10 } },
    legend: {
      id: 'fountain-youth',
      name: '不老泉',
      lat: 25.4,
      lng: -78.4,
      radiusNm: 90,
      gain: { fame: 16, morale: 10 },
      line: '比米尼的水甜得不像海水。同行的人不肯说出口，但都多喝了一口。',
    },
    story: [
      {
        id: 'spain-1', name: '古巴南岸', portId: 1,
        gain: { fame: 12, morale: 6, faction: { crown: 8 } },
        line: '哈瓦那湾是西印度航线的第一处深水锚地，去大陆的船都在这儿等风。',
      },
      {
        id: 'spain-2', name: '新西班牙的银', portId: 14,
        gain: { fame: 16, morale: 4, faction: { crown: 10 } },
        line: '韦拉克鲁斯的码头上，白银一箱一箱地装上驶向塞维利亚的船。',
      },
      {
        id: 'spain-3', name: '黄金通道', portId: 13,
        gain: { fame: 20, morale: 6, faction: { crown: 8, guild: 6 } },
        line: '卡塔赫纳的炮台护着这条黄金通道——账本比大炮更能守住它。',
      },
    ],
  },
  {
    id: 'england',
    name: '英格兰',
    short: '英',
    portId: 8,
    shipName: '鹈鹕号',
    history: '1497 年卡博特从布里斯托往西北找中国，1588 年英格兰挡住了无敌舰队；德雷克一路抢到太平洋。',
    perk: '私掠许可：一开局就有人怕你（名号 +12），兄弟会认你（+12）',
    origin: '德文郡的船主们凑钱给你置了这条船，条件只有一个：别问货是从哪来的。',
    rumor: '布里斯托的水手说，往西六百海里，雾里能看见一段海岸。',
    start: { morale: 2, crew: 0, fame: 12, faction: { brethren: 12 } },
    legend: {
      id: 'hy-brasil',
      name: '海厄布拉',
      lat: 51.4,
      lng: -15.6,
      radiusNm: 90,
      gain: { fame: 22, morale: 4 },
      line: '雾里浮起一段海岸，图上是空的——等雾散，那段海岸就没了。',
    },
    story: [
      {
        id: 'england-1', name: '海盗的锚地', portId: 4,
        gain: { fame: 14, morale: 4, faction: { brethren: 10 } },
        line: '托尔图加的锚地上挂满了各国旗帜，没有一面是被承认的。',
      },
      {
        id: 'england-2', name: '牙买加', portId: 2,
        gain: { fame: 16, morale: 4, faction: { brethren: 8 } },
        line: '皇家港的码头白天卖糖，晚上卖别人船上的东西。',
      },
      {
        id: 'england-3', name: '西班牙人的港口', portId: 1,
        gain: { fame: 20, morale: 6, faction: { brethren: 6, crown: 6 } },
        line: '抢来的东西要有人肯收，哈瓦那的商人从不问来路。',
      },
    ],
  },
  {
    id: 'netherlands',
    name: '荷兰',
    short: '荷',
    portId: 15,
    shipName: '阿姆斯特丹号',
    history: '1595 年第一支荷兰船队绕过好望角；1602 年东印度公司成立，阿姆斯特丹成了全欧洲的账房。',
    perk: '商馆人脉：商会声望 +16，北方水手耐冻（士气 +4，船员 +2）',
    origin: '你替商馆跑过三年波罗的海的粮船，账目比海图更熟。',
    rumor: '账房先生只说了一句：绕好望角时，别在风暴里回头看。',
    start: { morale: 4, crew: 2, fame: 0, faction: { guild: 16 } },
    legend: {
      id: 'flying-dutchman',
      name: '飞行的荷兰人',
      lat: -36.6,
      lng: 18.6,
      radiusNm: 90,
      gain: { fame: 20, morale: 2 },
      line: '风暴里有一艘不该出现的船。它不是朝你来的，它也没有航向。',
    },
    story: [
      {
        id: 'netherlands-1', name: '绕过好望角', portId: 10,
        gain: { fame: 12, morale: 4, faction: { guild: 8 } },
        line: '第一支荷兰船队 1595 年从这里绕过去，回来时船上的胡椒比黄金值钱。',
      },
      {
        id: 'netherlands-2', name: '东印度的账房', portId: 19,
        gain: { fame: 16, morale: 4, faction: { guild: 10 } },
        line: '巴达维亚的仓库按货号排列，账本比海图管得还严。',
      },
      {
        id: 'netherlands-3', name: '海峡的关卡', portId: 12,
        gain: { fame: 20, morale: 6, faction: { guild: 8, crown: 4 } },
        line: '马六甲海峡卡着东西方的咽喉，谁在这儿设关卡，谁就能对香料定价。',
      },
    ],
  },
  {
    id: 'china',
    name: '大明',
    short: '明',
    /*
     * 【为什么母港是广州而不是澳门】1492 年葡人还没到澳门（1557 年才落脚），
     * 那时珠江口的市舶司在广州。用澳门当大明的母港，是把六十五年后的事
     * 挪到开局——这属于"地图在说谎"。
     */
    portId: 21,
    shipName: '清和号',
    history: '1405 年郑和的宝船从太仓出海，七下西洋最远抵东非麻林地；六十年后，朝贡的船仍沿老航路南下满剌加。',
    perk: '市舶司认你的勘合：学者声望 +14，船上多带两成口粮（士气 +6，船员 +2）',
    origin: '你本是广州市舶司的通事，替朝廷押过两回朝贡船。这条船是抵债留下的一艘番舶。',
    rumor: '市舶司的老吏说，东海之外有个归墟，天下的水都往那儿流。',
    start: { morale: 6, crew: 2, fame: 0, faction: { scholars: 14 } },
    legend: {
      id: 'guixu',
      name: '归墟',
      lat: 29.5,
      lng: 128.5,
      radiusNm: 90,
      gain: { fame: 22, morale: 6 },
      line: '海面平得像一块铁，罗盘针慢下来——船老大说，这下面就是归墟。',
    },
    story: [
      {
        id: 'china-1', name: '满剌加', portId: 12,
        gain: { fame: 12, morale: 4, faction: { scholars: 8 } },
        line: '郑和的船队在这儿设过官厂，仓库的墙基还在——朝贡的船都从这里转西。',
      },
      {
        id: 'china-2', name: '蒙巴萨', portId: 16,
        gain: { fame: 16, morale: 6, faction: { scholars: 8, guild: 4 } },
        line: '东非的斯瓦希里城邦用珊瑚石砌墙，郑和的船到过这一带。',
      },
      {
        id: 'china-3', name: '麒麟上船的地方', portId: 17,
        gain: { fame: 20, morale: 6, faction: { scholars: 10, crown: 6 } },
        line: '榜葛剌进贡的那头“麒麟”就是从这一带运上船的——其实是长颈鹿。',
      },
    ],
  },
]

export const NATION_COUNT = NATIONS.length

/**
 * 默认国别：**西班牙**。
 *
 * 【为什么要有默认值】开局的这几张卡和「天赋」「模式」是同一套交互：
 * 默认选中一张，玩家可以直接按「继续」。指着"必须点一下才能继续"是把
 * 一个已经想好的玩家再拦一次；而默认值是老版本的开局（塞维利亚），
 * 所以关掉这层的人看到的仍然是原来的世界。
 */
export const DEFAULT_NATION: NationId = 'spain'

export function nationById(id: string | null | undefined): Nation {
  return NATIONS.find(n => n.id === id) ?? NATIONS.find(n => n.id === DEFAULT_NATION) ?? NATIONS[0]
}

/** 这个国别的传说是否还没兑现 */
export function legendPending(nationId: string | null | undefined, collected: readonly string[]): NationLegend | null {
  /*
   * 【这里**不能**走 `nationById`】那个函数找不到就回落到默认国别（西班牙），
   * 而"没有国别"是一个真实状态：老存档、参观模式、以及关掉这一层的人。
   * 回落到西班牙等于给一个从没选过的人凭空塞进一条传说海域。
   */
  if (!nationId) return null
  const n = NATIONS.find(x => x.id === nationId)
  if (!n?.legend) return null
  return collected.includes(n.legend.id) ? null : n.legend
}

/**
 * 这条故事线**下一段**该走哪儿（`null` = 三段都走完了）。
 *
 * 【为什么按"已完成的 id"推而不是存一个下标】下标在两种情况下会说谎：
 * ① 老存档没有这个字段（补 0 等于让人重走一遍）；② 将来允许跳段或加段时，下标全错位。
 * 按 id 判"这一段做过没有"是幂等的，重复到港也不会重复发奖。
 */
export function nextChapter(nationId: string | null | undefined, done: readonly string[]): StoryChapter | null {
  if (!nationId) return null
  const n = NATIONS.find(x => x.id === nationId)
  if (!n) return null
  return n.story.find(c => !done.includes(c.id)) ?? null
}

/** 已走完几段（给界面上的"第 N 段 / 共三段"用） */
export function storyStep(nationId: string | null | undefined, done: readonly string[]): number {
  if (!nationId) return 0
  const n = NATIONS.find(x => x.id === nationId)
  if (!n) return 0
  return n.story.filter(c => done.includes(c.id)).length
}
