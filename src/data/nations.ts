import type { FactionId, NationId } from '@/types'

/**
 * 开局国别：**你是谁的人，决定了你从哪片海出发、船上是什么人、以及你在追哪一个传说**。
 *
 * 【为什么要这一层，而不是只换一段开场文字】
 * 2026-11-12 用户提的方向："可不可以开局选城或者国家，毕竟不同的国家在大航海
 * 这段期间有不同的故事，可以适当编造，结合神话和传说"。
 * 单纯把开场白里的「塞维利亚」替换成「里斯本」是不成立的——那只是换了个地名，
 * 玩家选完之后世界一模一样。所以每一个国别必须真的改变**四件事**：
 *
 *   ① **出发点**：出发港（塞维利亚 / 里斯本 / 伦敦 / 阿姆斯特丹）。
 *      这本身就改变了第一趟航程：从里斯本去加勒比比从伦敦去少走 900 海里。
 *   ② **船上的人**：船员数 / 士气 / 名号（`start`）。 Spaniards 带着王室的兵，
 *      English 一上来就有人怕他，Dutch 的商馆认他。
 *   ③ **起手就认你的势力**（`faction.crown/guild/brethren`）——
 *      声望是"别人怎么说你"，不是钱。这一条刻意不给金币：
 *      用户的方向是**不再扩展金钱玩法**，卖的是航路、名号与见闻。
 *   ④ **一个传说**（`legend`）：每国一个**真实海域坐标上的神话物件**，
 *      开进 90 海里内就兑现一次（名号 + 士气 + 一条写进见闻的句子）。
 *      它不是"读一段介绍"，是海图上一个点，你得把船开过去。
 *
 * 【为什么传说必须是真坐标】
 * 这一层最容易做假：写四个漂亮的名字，玩家一辈子开不到那儿，那就是文案。
 * 所以四个坐标全部用 `land.geojson` 校验过在海上（单测里也守着），
 * 并且都落在这一国真实航线上：葡萄牙往西横渡大西洋会路过圣布伦丹岛，
 * 西班牙往加勒比会路过不老泉，英格兰出泰晤士河向西六百海里就是海厄布拉，
 * 荷兰绕好望角时会在风暴里遇见那条诅咒船。
 *
 * 【史实只写一句】
 * `history` 一句话，带年份、带人名、带港口。玩家不需要在这里读论文；
 * 他要的是"我选的这面旗，在这段历史里真的做过这件事"。
 */

/* NationId 的唯一定义在 types/index.ts（GameState 要用它），这里只转出去 */
export type { NationId }

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
}

export const NATIONS: readonly Nation[] = [
  {
    id: 'portugal',
    name: '葡萄牙',
    origin: '你替若昂二世跑过三次西非。海图室的钥匙，你有半把。',
    rumor: '老绘图员指着西边：本来有个岛在那儿，后来被人从图上擦掉了。',
    short: '葡',
    portId: 7,
    shipName: '圣加布里埃尔号',
    history: '1488 年迪亚士绕过了那道风暴角，1498 年达伽马抵达印度——里斯本是这条航线唯一的起点。',
    perk: '王室起手就信你：王室声望 +14，水手跟过远洋（士气 +8）',
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
  },
  {
    id: 'spain',
    name: '西班牙',
    origin: '你从格拉纳达的营地退伍，王室欠你一份差事——和一张去西边的许可证。',
    rumor: '酒馆里有人赌咒：比米尼的水，喝下去能让人不老。',
    short: '西',
    portId: 6,
    shipName: '圣玛利亚号',
    history: '1492 年格拉纳达陷落的同一年，王室把特许状发给了一个热那亚人；此后美洲的白银全部从塞维利亚过账。',
    perk: '王室的兵上了船：船员 +5，王室声望 +10（士气 +4）',
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
  },
  {
    id: 'england',
    name: '英格兰',
    origin: '德文郡的船主们凑钱给你置了这条船，条件只有一个：别问货是从哪来的。',
    rumor: '布里斯托的水手说，往西六百海里，雾里能看见一段海岸。',
    short: '英',
    portId: 8,
    shipName: '鹈鹕号',
    history: '1497 年卡博特从布里斯托往西北找中国，1588 年英格兰挡住了无敌舰队；德雷克一路抢到太平洋。',
    perk: '私掠许可：一开局就有人怕你（名号 +12），兄弟会认你（+12）',
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
  },
  {
    id: 'netherlands',
    name: '荷兰',
    origin: '你替商馆跑过三年波罗的海的粮船，账目比海图更熟。',
    rumor: '账房先生只说了一句：绕好望角时，别在风暴里回头看。',
    short: '荷',
    portId: 15,
    shipName: '阿姆斯特丹号',
    history: '1595 年第一支荷兰船队绕过好望角；1602 年东印度公司成立，阿姆斯特丹成了全欧洲的账房。',
    perk: '商馆人脉：商会声望 +16，北方水手耐冻（士气 +4，船员 +2）',
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
  },
]

export const NATION_COUNT = NATIONS.length

/**
 * 默认国别：**西班牙**。
 *
 * 【为什么要有默认值】开局的这四张卡和「天赋」「模式」是同一套交互：
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
