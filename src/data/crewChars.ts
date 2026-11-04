import type { CrewCharId } from '@/types'
import { Anchor, Bomb, BookOpen, Calculator, Compass, Coins, Cross, Footprints, Hammer, Languages, Map as MapIcon, Music, Soup, Stethoscope, Telescope, type LucideIcon } from 'lucide-react'

export interface CrewCharDef {
  id: CrewCharId
  name: string
  /** 身份头衔 */
  title: string
  icon: LucideIcon
  /** 一次性招募费（金币） */
  hireCost: number
  /** 特长效果描述 */
  perk: string
  /** 来历一句话 */
  origin: string
  /** 口头禅：低士气时出现在航海日志的引言 */
  quote: string
  /**
   * 只在指定港口出现（不填 = 任何港口都能招）。
   *
   * 【为什么要这个字段】第一批 8 位是"行会介绍所里挂着的名字"，哪个港都问得到，
   * 这是既有体验，不动。第二批 7 位是**具体的人**——某个港口的药剂师、某个环礁
   * 长大的向导。全挂在每个港口，港口面板就会变成 15 张卡片的长列表，
   * 而"跑到某处才遇得见"本身是探索的回报（探索全港本来就是胜利条件之一）。
   */
  portId?: number
}

/**
 * 名船员：船上的"人"。
 * 与 crew:47 的数字不同，他们有名字、有过去、有忠诚度——
 * 低士气会掉忠诚，忠诚归零会离船，坏血病与海盗战中可能死亡（葬礼事件）。
 */
export const CREW_CHARS: CrewCharDef[] = [
  {
    id: 'boatswain',
    name: '老汤姆',
    title: '水手长',
    icon: Anchor,
    hireCost: 200,
    perk: '船员流失减半（战斗/坏血病/绝望离船的 crew 损失打五折）',
    origin: '在英王麾下当了二十年水手长，据说他记得每一艘沉没的船的名字。',
    quote: '“船长，绳结要在干燥时打好，人要在吃饱时留住。”',
  },
  {
    id: 'gunner',
    name: '独眼玛格',
    title: '炮手',
    icon: Bomb,
    hireCost: 300,
    perk: '击退海盗时的缴获 +50%（战胜结局的金币收益）',
    origin: '曾在皇家港的炮台上轰碎过三艘缉私船，左眼换来的军衔。',
    quote: '“别跟海盗讲道理，先把炮弹塞进他们水线以下。”',
  },
  {
    id: 'purser',
    name: '小王',
    title: '账房先生',
    icon: Calculator,
    hireCost: 250,
    perk: '所有港口买卖价再降 2%（叠加天赋与声望优惠）',
    origin: '泉州钱庄出来的少年，算盘打得比教堂钟声还准。',
    quote: '“买入价差两成，卖出时差的就是两成人心。”',
  },
  {
    id: 'chaplain',
    name: '费尔南神甫',
    title: '随船神甫',
    icon: Cross,
    hireCost: 280,
    perk: '低士气（<45）时的每日衰减减半；船员离船概率下降',
    origin: '主动请缨上船的苦修者，随身只有一本翻烂的圣经和一副铁十字架。',
    quote: '“恐惧会传染，希望也会——只是后者需要有人先开口。”',
  },
  {
    id: 'scholar',
    name: '伊莲',
    title: '随船学者',
    icon: BookOpen,
    hireCost: 350,
    perk: '发现类事件触发率 +20%；航线情报半价',
    origin: '为考证"南方大陆"传闻偷偷上船的比利时女学者，箱子里是标本和星图。',
    quote: '“每一处没有画进海图的海角，都是尚未写下的一个词。”',
  },
  {
    id: 'cook',
    name: '胖厨子班',
    title: '厨子',
    icon: Soup,
    hireCost: 180,
    perk: '航行中食物消耗 -20%（坏血病来得更晚）',
    origin: '拿骚酒馆的招牌厨子，据说能用咸肉和豆子做出让人不想家的一餐。',
    quote: '“胃满了，叛乱就少一半。”',
  },
  {
    id: 'midshipman',
    name: '阿尔芒少爷',
    title: '见习航海士',
    icon: Music,
    hireCost: 400,
    perk: '发现新港口的声望 +50%（贵族的身份让发现更受瞩目）',
    origin: '布列塔尼没落贵族的三子，为逃避安排的婚姻偷跑上船，连航海绳结都还打不利索。',
    quote: '“等回到瑟堡，我要把这张海图挂在家族厅里——用我自己的名字命名海角。”',
  },
  {
    id: 'corsair',
    name: '退役海盗胡安',
    title: '黑旗向导',
    icon: MapIcon,
    hireCost: 320,
    perk: '海盗遭遇率 -15%；走私交易收益 +20%',
    origin: '悬赏令上挂了十五年的人物，如今只想找个肯付钱的船长，把安全航道再卖一遍。',
    quote: '“这一带的海盗我都认识——认识的方式是他们都欠我钱。”',
  },

  /* ==========================================================================
   * 第二批：7 个岗位
   *
   * 美术在 e01–e14 里按 14 个岗位做齐了立绘（带铭牌的成品卡），
   * 而玩法只实现了上面 8 个——这 7 张脸在仓库里躺了很久，从没进过游戏。
   * 立绘已从 e 系列裁掉铭牌转为 crew_*.png（见 .workbuddy/gen-crew-portraits.mjs）。
   *
   * 【每条 perk 都必须真的生效】上一轮盘点时发现前 8 位里有 6 条是空承诺
   * （文案印在面板上、代码里没有实现）。所以这一批每条都先想清楚落在哪一行代码，
   * 再写文案，最后用双向断言锁住——写不出落点的就不写这条 perk。
   *
   * 【为什么这 7 位有 portId 而上面 8 位没有】上面 8 位是"行会介绍所里挂着的名字"，
   * 哪个港都问得到（既有体验，不动）。这 7 位是具体的人：某个港口的药剂师、
   * 某个环礁长大的向导。全挂在每个港口，面板会变成 15 张卡片的长列表；
   * 而"跑到某处才遇得见"本身是探索的回报。
   * ====================================================================== */
  {
    id: 'navigator',
    name: '巴托洛梅乌',
    title: '航海士',
    icon: Compass,
    hireCost: 230,
    portId: 11,
    perk: '靠港补给半价（60 → 30 金，粮水份量不变）',
    origin: '在果阿的季风里泡了十二年。抬眼看云，他就知道三天后哪片海域会下雨——比罗盘准。',
    quote: '“罗盘告诉你北在哪，云告诉你今晚会不会死。”',
  },
  {
    id: 'medic',
    name: '药剂师莱昂',
    title: '航医',
    icon: Stethoscope,
    hireCost: 260,
    portId: 7,
    perk: '缺粮断水时，船员病死的概率减半',
    origin: '在南特开了二十年药铺，把铺子盘掉换了一只药箱。他说岸上死的人比船上多，只是没人记账。',
    quote: '“先给他一口淡水，再谈药。顺序错了，药就是毒。”',
  },
  {
    id: 'carpenter',
    name: '木匠马蒂亚斯',
    title: '船匠',
    icon: Hammer,
    hireCost: 240,
    portId: 15,
    perk: '靠港修理费 -40%（自己动手，只算料钱）',
    origin: '给荷兰东印度公司修过十七条船。木槌在船肋上敲三下，他就知道哪一根断了。',
    quote: '“船不会突然沉。它先裂，再响，最后才沉——你得听得见前两声。”',
  },
  {
    id: 'interpreter',
    name: '伊斯梅尔',
    title: '翻译官',
    icon: Languages,
    hireCost: 300,
    portId: 16,
    perk: '事件里的派系好感 +50%（话说对了，人情才记在你名下）',
    origin: '会七种语言，其中最流利的一门是红海沿岸没有文字的土话。',
    quote: '“他们说‘慷慨的船长’。字面意思是‘愿意分水的首领’——差别很大。”',
  },
  {
    id: 'guide',
    name: '塔内',
    title: '向导',
    icon: Footprints,
    hireCost: 280,
    portId: 19,
    perk: '高危航段（危险度 ≥4）不再掉忠诚',
    origin: '在土阿莫土环礁长大，靠涌浪的方向认得出三十海里外的陆地。',
    quote: '“陆地会推水。你看不见它，水替它说话。”',
  },
  {
    id: 'merchant',
    name: '多娜·贝亚特丽丝',
    title: '商人',
    icon: Coins,
    hireCost: 320,
    portId: 6,
    perk: '委托赏金 +25%（她替你谈价）',
    origin: '接手亡夫的丝绸行与三条船，把行会的老规矩改了两条——改完，那两条就成了新规矩。',
    quote: '“价钱不是数字，是对方有多急。你先问这个。”',
  },
  {
    id: 'pathfinder',
    name: '赫罗尼莫学士',
    title: '探险家',
    icon: Telescope,
    hireCost: 360,
    portId: 20,
    perk: '探索类事件的金币与声望收益 +30%',
    origin: '四十年前随麦哲伦的旧部画过南纬四十度的海岸线。此后再没人肯出钱让他往南。',
    quote: '“海图上没有写‘到此为止’——是我们自己写上去的。”',
  },
]

export const CREW_CHAR_MAP = new Map(CREW_CHARS.map(c => [c.id, c]))

export function getCrewChar(id: CrewCharId): CrewCharDef | undefined {
  return CREW_CHAR_MAP.get(id)
}
