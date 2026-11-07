/**
 * 海上遗物：历史与神话在地图上的**实物**。
 *
 * 【为什么是"实物"而不是"段落"】
 * 2026-11-07 用户定的方向：不要再扩展金钱/经济玩法，
 * 神话与历史可以融入更多，但**不要只是一味地增加文字**。
 *
 * 原来历史只活在三个地方：时间轴上的一行字、事件卡里的 `historicalNote`、
 * 日志里的一段话。它们都在**屏幕上**，不在**世界里**——
 * 玩家读到"1520年麦哲伦的船队在这里找到了那条窄水"，
 * 但他的船照样从旁边开过去，海面上什么都没有。
 *
 * 遗物把同一段史实换成一件**看得见、点得到的东西**：
 * 好望角外海斜插着半截折断的桅杆，巴哈马外海泡着一只四爪铁锚，
 * 莫桑比克海峡的沙里立着半截葡人的界碑，厄加勒斯角外海浮着一根比船桅还长的白骨。
 * 史实不再是"读过"，而是"你路过它、你伸手、你带走了它"。
 *
 * 【为什么收益里没有金币】
 * 这是用户那条方向的第一条约束。金币是账本，不是航海的教义；
 * 这里给的是**名号（声望）、补给、士气**——
 * 前者是"别人怎么说你"，后两者是"你的船还能撑多久"。
 * 钱要挣，名号要挣回来。
 *
 * 【坐标必须真的在海上，而且真的开得到，而且真的会路过】
 * 三道关，缺一件就是"摆在世界另一头的摆设"：
 *
 *   ① **在海上**：`public/data/sea-mask.bin` 逐个校验过，落在陆地上就是错的。
 *   ② **开得到**：从最近的港口 A\* 过去有路、且这条路不压陆。
 *      麦哲伦海峡在 0.1° 掩码里是断的（东西向水道被陆地切成好几段），
 *      A\* 搜不出穿过去的路——钉在那儿的遗物等于永远拿不到，所以不用那个坐标。
 *   ③ **会路过**（最关键的一条，2026-11-07 补）：
 *      它必须落在玩家**真的会走的主航线**的拾取半径以内。
 *      ②只保证"不是死物件"，不保证玩家会遇到它——实测 8 件里曾有 2 件不合格：
 *        圣萨尔瓦多的铁锚  离最近主航线 153 海里（半径 150，差 3 海里）
 *        海妖的肋骨        离最近主航线 877 海里（在亚速尔外海，玩家根本不走那边）
 *      现在 8 件离主航线 4~127 海里，全部在半径内。
 *
 * 三条都由单测拿真掩码 + 真 A\* 守着（test/logic.test.ts）。
 * 挪坐标之前先看那几条断言——它们是"这东西到底有没有人碰得到"的唯一凭据。
 *
 * 【拾取半径：必须真的开过去】
 * 遗物不是"点一下就到手"的菜单项。它**一直在那儿，等着有人路过**——
 * 所以拾取有半径（`RELIC_PICKUP_NM`），超了就不结算，
 * 只告诉你「还在多少海里外」并把航向对准它。
 */

import { haversineNm } from '@/utils/navigation'
import { seasonAt, type SeasonId } from '@/utils/season'

export type RelicLore = 'history' | 'myth'

/** 遗物的视觉类别（决定画哪个图形，不是玩法分类） */
export type RelicKind = 'mast' | 'anchor' | 'wheel' | 'compass' | 'bone' | 'lyre' | 'pillar'

/**
 * 拾取半径（海里）。
 *
 * 【为什么有半径】遗物不是点一下就到手的菜单项——
 * 它是"半埋在海里的旧物"，**一直在那儿等着有人路过**。
 * 没有半径，玩家在塞维利亚就能拾走亚速尔外海的白骨，
 * 那句"它一直在那儿等你"就成了空话。
 *
 * 【为什么是 150】一次航段的量级：
 *   - 最短的一趟（近港之间）约 100~200 海里；
 *   - 一件东西放在 150 海里内 = 路过时抬头就能看见、伸手就能捞。
 * 再小就变成"必须精确停在它上面"；再大就变成"顺路经过半个大洋就算路过"。
 */
export const RELIC_PICKUP_NM = 150

export interface Relic {
  id: string
  /** 名字：短，海图标注用 */
  name: string
  lat: number
  lng: number
  kind: RelicKind
  lore: RelicLore
  /** 一行：这物件是什么（不超过 30 字，海图 tooltip 用） */
  hint: string
  /**
   * 拾起时写进日志的那一行：史实/神话的落点。
   * 这是**唯一**一段与史实有关的文字，且只在玩家亲手拾起时出现一次。
   */
  note: string
  /**
   * 收益：名号（声望）、补给、士气——**没有金币**。
   *
   * 为什么神话遗物给更多士气：史实让人知道自己在哪（名号），
   * 神话让人还敢往前走（士气）。这是两种不同的"带回船上的东西"。
   */
  gain: {
    fame: number
    food: number
    water: number
    morale: number
  }
  /**
   * 只在哪些航季出现（不给 = 四季都在）。
   *
   * 【为什么有的遗物要按时令出现】这是把神话与季节绑起来、且**不靠文字**的做法：
   * 塞壬的七弦琴只在风平浪静的夏天听得见（风浪大时她的歌被盖住），
   * 海妖的肋骨只在秋天的风暴里被浪翻上来。
   * 其他三季它不是"藏在某处"，而是**根本不在那儿**——
   * 玩家换季再来才看得见，这件事本身就是叙事，不需要一段说明。
   */
  seasons?: SeasonId[]
}

export const RELICS: Relic[] = [
  {
    id: 'dias_mast',
    name: '迪亚士的断桅',
    lat: -35.2,
    lng: 20.5,
    kind: 'mast',
    lore: 'history',
    hint: '半截桅杆斜插在浪里，缆绳早就烂尽了。',
    note: '1488年，迪亚士的船队在这一带被风浪逼得折了桅。他仍然认定前方是「风暴角」，并且回了国。',
    gain: { fame: 3, food: 0, water: 8, morale: 4 },
  },
  {
    id: 'mozambique_padrao',
    name: '达·伽马的界碑',
    lat: -19.5,
    lng: 40.5,
    kind: 'pillar',
    lore: 'history',
    hint: '半截石柱斜插在沙里，柱面刻着看不懂的纹样。',
    note: '1498年，达·伽马绕过好望角后没有急着横渡印度洋，而是沿非洲东岸北上，沿途立下这种刻着葡王纹章的石柱。返航时他留下副手埃里亚·德·阿尔梅达独自往东去，自己带着香料回了里斯本。阿尔梅达此后再没有回来。',
    gain: { fame: 5, food: 0, water: 4, morale: 6 },
  },
  {
    id: 'san_salvador_anchor',
    name: '圣萨尔瓦多的铁锚',
    lat: 24.5,
    lng: -75.3,
    kind: 'anchor',
    lore: 'history',
    hint: '一只四爪铁锚，锚爪上缠着已经发黑的麻绳。',
    note: '1492年10月12日，哥伦布的三条船在这里第一次抛锚。他给这座岛取名圣萨尔瓦多——「救世主」。',
    gain: { fame: 4, food: 0, water: 6, morale: 5 },
  },
  {
    id: 'blackbeard_wheel',
    name: '黑胡子的舵轮',
    lat: 25.1,
    lng: -77.3,
    kind: 'wheel',
    lore: 'history',
    hint: '橡木舵轮，辐条上刻着一个歪斜的骷髅。',
    note: '1718年11月22日，黑胡子在拿骚外海被一个英国海军的伤兵射落水中。船上最后只找到两袋烟。',
    gain: { fame: 5, food: 0, water: 0, morale: 8 },
  },
  {
    id: 'zhenghe_anchor',
    name: '陈祖义的铁锚',
    lat: 2.0,
    lng: 101.3,
    kind: 'anchor',
    lore: 'history',
    hint: '铁锚上铸着汉字，锈得只剩笔画的一半。',
    note: '1407年，郑和的船队在马六甲外海擒获海盗头目陈祖义，押回南京处死——那是一次没有载入宝船档案的胜利。',
    gain: { fame: 5, food: 6, water: 6, morale: 4 },
  },
  {
    id: 'galleon_compass',
    name: '马尼拉大帆船的罗盘',
    lat: 14.6,
    lng: 120.9,
    kind: 'compass',
    lore: 'history',
    hint: '黄铜罗盘盒，指针还稳稳指着北。',
    note: '1565年起，马尼拉大帆船把马尼拉的白银运往阿卡普尔科，再由陆路翻过维罗利尔山——白银绕了地球一整圈。',
    gain: { fame: 6, food: 0, water: 0, morale: 6 },
  },
  {
    id: 'kraken_rib',
    name: '海妖的肋骨',
    // 厄加勒斯角外海：绕过好望角的船必经之处，水深、离岸远、风浪大。
    // （旧位置在亚速尔外海 -37.8,-25.5——玩家根本不走那边，
    //   实测离最近主航线 877 海里，等于一件永远碰不到的摆设。）
    lat: -36.0,
    lng: 22.0,
    kind: 'bone',
    lore: 'myth',
    hint: '一根比船桅还长的白骨，从水里斜插出来。',
    note: '1488年迪亚士把这一带叫「风暴角」，随船的神父在航海日志里写：水里有东西跟着船走了三天，比桅杆还长。没有人能证明它，也没有人能推翻它。',
    gain: { fame: 6, food: 0, water: 0, morale: 10 },
    // 风暴季才把海底的东西翻上来——秋天的海面才会露出它
    seasons: ['autumn'],
  },
  {
    id: 'siren_lyre',
    name: '塞壬的七弦琴',
    lat: 34.5,
    lng: -9.5,
    kind: 'lyre',
    lore: 'myth',
    hint: '半张七弦琴，弦断了一半，琴身是海螺磨的。',
    note: '《奥德赛》里她们的歌让水手把耳朵塞进蜡里。古代海图把塞壬画在赫拉克勒斯之柱的里面——柱子以外的世界没人敢去；但她的歌会从海峡口飘出来。这半张琴是在柱外的洋面上捞到的，弦断了一半。真正的塞壬从来没有现身过：她只是让人听见了自己想听的东西。',
    gain: { fame: 6, food: 0, water: 0, morale: 10 },
    // 风平浪静才听得见她的歌；风浪大的季节，海面上一无所有
    seasons: ['summer'],
  },
]

export const RELIC_MAP = new Map(RELICS.map(r => [r.id, r]))

/** 遗物总数（图鉴那一格的满分） */
export const RELIC_COUNT = RELICS.length

/** 按 id 找到遗物；找不到返回 null（存档里可能有旧版本删掉的 id） */
export function findRelic(id: string): Relic | null {
  return RELIC_MAP.get(id) ?? null
}

/**
 * 船到这件遗物还有多远（海里）。
 *
 * 用的是**业务口径**的距离函数（utils/navigation 的 haversineNm），
 * 不用航线几何的弧长——这里问的是"直线还有多远"，
 * 回给玩家的那句话「还在 843 海里外」得是玩家自己心里那个距离。
 */
export function relicDistanceNm(fromLat: number, fromLng: number, relic: Relic): number {
  return haversineNm(fromLat, fromLng, relic.lat, relic.lng)
}

/** 这件遗物现在够不够得着（船在不在拾取半径内） */
export function relicInReach(
  fromLat: number | null | undefined,
  fromLng: number | null | undefined,
  relic: Relic,
): boolean {
  if (fromLat == null || fromLng == null) return false
  return relicDistanceNm(fromLat, fromLng, relic) <= RELIC_PICKUP_NM
}

/**
 * 这件遗物在指定游戏日**是否出现在海面上**。
 *
 * 没写 `seasons` 的一律都在（大多数遗物如此）；写了的只在列出的航季出现。
 * 2D 层、3D 层、拾取闸门、图鉴都走这一个函数——
 * 四处各判一次必然出现"图上看得见但点不动"或反过来。
 */
export function relicInSeason(relic: Relic, day: number): boolean {
  if (!relic.seasons || relic.seasons.length === 0) return true
  return relic.seasons.includes(seasonAt(day).id)
}
