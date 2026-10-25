import type { CrewCharId } from '@/types'

export interface CrewCharDef {
  id: CrewCharId
  name: string
  /** 身份头衔 */
  title: string
  icon: string
  /** 一次性招募费（金币） */
  hireCost: number
  /** 特长效果描述 */
  perk: string
  /** 来历一句话 */
  origin: string
  /** 口头禅：低士气时出现在航海日志的引言 */
  quote: string
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
    icon: '🧔',
    hireCost: 200,
    perk: '船员流失减半（战斗/坏血病/绝望离船的 crew 损失打五折）',
    origin: '在英王麾下当了二十年水手长，据说他记得每一艘沉没的船的名字。',
    quote: '“船长，绳结要在干燥时打好，人要在吃饱时留住。”',
  },
  {
    id: 'gunner',
    name: '独眼玛格',
    title: '炮手',
    icon: '💥',
    hireCost: 300,
    perk: '击退海盗时的缴获 +50%（战胜结局的金币收益）',
    origin: '曾在皇家港的炮台上轰碎过三艘缉私船，左眼换来的军衔。',
    quote: '“别跟海盗讲道理，先把炮弹塞进他们水线以下。”',
  },
  {
    id: 'purser',
    name: '小王',
    title: '账房先生',
    icon: '🧮',
    hireCost: 250,
    perk: '所有港口买卖价再降 2%（叠加天赋与声望优惠）',
    origin: '泉州钱庄出来的少年，算盘打得比教堂钟声还准。',
    quote: '“买入价差两成，卖出时差的就是两成人心。”',
  },
  {
    id: 'chaplain',
    name: '费尔南神甫',
    title: '随船神甫',
    icon: '✝️',
    hireCost: 280,
    perk: '低士气（<45）时的每日衰减减半；船员离船概率下降',
    origin: '主动请缨上船的苦修者，随身只有一本翻烂的圣经和一副铁十字架。',
    quote: '“恐惧会传染，希望也会——只是后者需要有人先开口。”',
  },
  {
    id: 'scholar',
    name: '伊莲',
    title: '随船学者',
    icon: '📖',
    hireCost: 350,
    perk: '发现类事件触发率 +20%；航线情报半价',
    origin: '为考证"南方大陆"传闻偷偷上船的比利时女学者，箱子里是标本和星图。',
    quote: '“每一处没有画进海图的海角，都是尚未写下的一个词。”',
  },
  {
    id: 'cook',
    name: '胖厨子班',
    title: '厨子',
    icon: '🍲',
    hireCost: 180,
    perk: '航行中食物消耗 -20%（坏血病来得更晚）',
    origin: '拿骚酒馆的招牌厨子，据说能用咸肉和豆子做出让人不想家的一餐。',
    quote: '“胃满了，叛乱就少一半。”',
  },
  {
    id: 'midshipman',
    name: '阿尔芒少爷',
    title: '见习航海士',
    icon: '🎻',
    hireCost: 400,
    perk: '发现新港口的声望 +50%（贵族的身份让发现更受瞩目）',
    origin: '布列塔尼没落贵族的三子，为逃避安排的婚姻偷跑上船，连航海绳结都还打不利索。',
    quote: '“等回到瑟堡，我要把这张海图挂在家族厅里——用我自己的名字命名海角。”',
  },
  {
    id: 'corsair',
    name: '退役海盗胡安',
    title: '黑旗向导',
    icon: '🗺️',
    hireCost: 320,
    perk: '海盗遭遇率 -15%；走私交易收益 +20%',
    origin: '悬赏令上挂了十五年的人物，如今只想找个肯付钱的船长，把安全航道再卖一遍。',
    quote: '“这一带的海盗我都认识——认识的方式是他们都欠我钱。”',
  },
]

export const CREW_CHAR_MAP = new Map(CREW_CHARS.map(c => [c.id, c]))

export function getCrewChar(id: CrewCharId): CrewCharDef | undefined {
  return CREW_CHAR_MAP.get(id)
}
