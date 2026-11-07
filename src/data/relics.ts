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
 * 麦哲伦海峡里浮着一枚断链的铜浮标，巴哈马外海泡着一只四爪铁锚，
 * 亚速尔外海斜插着一根比船桅还长的白骨。
 * 史实不再是"读过"，而是"你路过它、你伸手、你带走了它"。
 *
 * 【为什么收益里没有金币】
 * 这是用户那条方向的第一条约束。金币是账本，不是航海的教义；
 * 这里给的是**名号（声望）、补给、士气**——
 * 前者是"别人怎么说你"，后两者是"你的船还能撑多久"。
 * 钱要挣，名号要挣回来。
 *
 * 【坐标必须真的在海上】
 * 每件遗物都钉在真实发生过事情的地方（迪亚士折桅的好望角外海、
 * 哥伦布第一次抛锚的巴哈马、郑和擒陈祖义的马六甲……）。
 * 坐标由 `public/data/sea-mask.bin` 逐个校验过——落在陆地上就是错的，
 * 单测 `relics.test` 段会拿真掩码把每一条都点一遍。
 */

export type RelicLore = 'history' | 'myth'

/** 遗物的视觉类别（决定画哪个图形，不是玩法分类） */
export type RelicKind = 'mast' | 'anchor' | 'wheel' | 'compass' | 'bone' | 'lyre'

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
    id: 'magellan_beacon',
    name: '海峡的引航浮标',
    lat: -53.5,
    lng: -70.5,
    kind: 'mast',
    lore: 'history',
    hint: '一枚铜制浮标，锚链断在一半。',
    note: '1520年10月，麦哲伦的船队找到了贯通南美与火地地峡的那条窄水——人类第一次从这条海峡穿过去。',
    gain: { fame: 4, food: 4, water: 0, morale: 6 },
  },
  {
    id: 'san_salvador_anchor',
    name: '圣萨尔瓦多的铁锚',
    lat: -24.05,
    lng: -74.45,
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
    lat: -37.8,
    lng: -25.5,
    kind: 'bone',
    lore: 'myth',
    hint: '一根比船桅还长的白骨，从水里斜插出来。',
    note: '1634年，一条自称在亚速尔附近见过海怪的船留下了这个说法。没有人能证明它，也没有人能推翻它。',
    gain: { fame: 6, food: 0, water: 0, morale: 10 },
  },
  {
    id: 'siren_lyre',
    name: '塞壬的七弦琴',
    lat: 37.5,
    lng: 16.0,
    kind: 'lyre',
    lore: 'myth',
    hint: '半张七弦琴，弦断了一半，琴身是海螺磨的。',
    note: '《奥德赛》里她们的歌让水手把耳朵塞进蜡里。可真正的塞壬从来没有现身过——她们只是让人听见了自己想听的东西。',
    gain: { fame: 6, food: 0, water: 0, morale: 10 },
  },
]

export const RELIC_MAP = new Map(RELICS.map(r => [r.id, r]))

/** 遗物总数（图鉴那一格的满分） */
export const RELIC_COUNT = RELICS.length

/** 按 id 找到遗物；找不到返回 null（存档里可能有旧版本删掉的 id） */
export function findRelic(id: string): Relic | null {
  return RELIC_MAP.get(id) ?? null
}
