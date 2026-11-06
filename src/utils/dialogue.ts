/**
 * 剧情对白数据与纯逻辑——"疯狂的戴夫"式角色致辞。
 *
 * 数据与表现分离：这里只定义「谁来说、说什么」，
 * 滑入 / 打字机 / 键盘交互在 components/ui/DialogueOverlay.tsx。
 * 立绘直接复用 E 组肖像（src/data/portraits.ts 的槽位），零新增素材。
 *
 * 新增一段剧情 = 在 DIALOGUE_SCRIPTS 里加一条数据 + 在触发点调 open(id)，
 * 组件、键盘、防重播机制全部自动就位。
 */
import { crewPortrait, officerPortrait, rivalPortrait } from '@/data/portraits'
import { CREW_CHARS } from '@/data/crewChars'
import { OFFICERS } from '@/data/officers'
import { RIVALS } from '@/data/rivals'

const BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/'

export interface Speaker {
  id: string
  /** 名牌上的名字 */
  name: string
  /** 名牌下的身份小字 */
  title: string
  /** 立绘路径；槽位取不到时为 undefined（组件不渲染立绘，只留对话框） */
  portrait: string | undefined
  /** 从屏幕哪侧入场 */
  side: 'left' | 'right'
}

/**
 * 说话人登记表。
 *
 * 【为什么从数据表生成，而不是手抄一遍】
 * 14 张立绘早就躺在 assets/portraits/ 里，但这里曾经**只登记了老领航员一个**：
 * 其余 13 张脸即使写了台词也调不出来（getSpeaker 返回 undefined，组件只会
 * 渲染一个没有立绘的对话框）。名字/头衔本来就在 crewChars / officers / rivals
 * 里，手抄一份迟早和原表对不上（改名只改一处 → 对话里还是旧名）。
 * 所以这里按 id 生成，portrait 也走同一套 portraits 映射。
 *
 * 阵营分边：自己人从左入场，对手从右——这是纯粹的舞台调度，
 * 不需要玩家学，但能让他们一眼分清"谁在说话"。
 */
const crewSpeakers: Record<string, Speaker> = Object.fromEntries(
  CREW_CHARS.map((c) => [c.id, {
    id: c.id,
    name: c.name,
    title: c.title,
    portrait: crewPortrait(c.id),
    side: 'left' as const,
  }]),
)

const officerSpeakers: Record<string, Speaker> = Object.fromEntries(
  OFFICERS.map((o) => [o.id, {
    id: o.id,
    name: o.name,
    title: o.title,
    portrait: officerPortrait(o.id),
    side: 'left' as const,
  }]),
)

const rivalSpeakers: Record<string, Speaker> = Object.fromEntries(
  RIVALS.map((r) => [r.id, {
    id: r.id,
    name: r.name,
    title: r.title,
    portrait: rivalPortrait(r.id),
    side: 'right' as const,
  }]),
)

export const SPEAKERS: Record<string, Speaker> = {
  // 老领航员的头衔在官员表里只是"引航人"，开场致辞需要更具体的身份
  pilot: {
    id: 'pilot',
    name: '老领航员',
    title: '塞维利亚 · 引路人',
    portrait: officerPortrait('pilot'),
    side: 'left',
  },
  ...crewSpeakers,
  ...officerSpeakers,
  ...rivalSpeakers,
}

export interface DialogueScript {
  id: string
  speakerId: string
  /**
   * 逐句的立绘覆盖（可选）。
   *
   * 台词的情绪是变的：宽慰 → 严肃 → 期许，用同一张脸说三句话，
   * 感染力就丢了一半。老领航员的三张表情差分（calm/serious/hope）
   * 早就画好了，只是从没接进来——这个字段就是给它们用的。
   * 未指定的句子沿用 speaker.portrait。
   */
  lines: string[]
  /** 与 lines 等长：每句用哪张立绘（下标对应）。空缺表示用默认立绘 */
  portraits?: (string | undefined)[]
}

export const DIALOGUE_SCRIPTS: DialogueScript[] = [
  {
    id: 'opening_pilot',
    speakerId: 'pilot',
    lines: [
      '风向西南，潮信未起——今天是出海的好日子，船长。',
      '记住：罗盘指向野心，而帆指向风。这两样，从来不是一回事。',
      '去吧。等你的故事传回这条海岸，我会第一个登上灯塔望你。',
    ],
    // 三句对应三种表情：宽慰 → 严肃 → 期许。
    // 立绘差分素材（第二批 P3）在 assets/portraits/ 下，早已存在但一直没用上。
    portraits: [
      `${BASE}assets/portraits/officer_pilot_calm.webp`,
      `${BASE}assets/portraits/officer_pilot_serious.webp`,
      `${BASE}assets/portraits/officer_pilot_hope.webp`,
    ],
  },

  /*
   * ---- 下面这些是"彩蛋"：与主线无关，只在特定处境下出现一次 ----
   *
   * 【写作规矩（定下来免得以后越写越多、越写越像说明书）】
   * 1) 每段 2~3 句，每句 ≤ 40 字。弹对话层是**打断**玩家的，
   *    信息量必须小、笑点必须短；长段落在"第一分钟"里就是灾难。
   * 2) 不承诺任何数值效果。"喝了朗姆酒士气+5"这种话一旦写进台词，
   *    玩家就会去找那个效果，找不到就是不诚实。
   * 3) 每段必须能看出是谁在说：水手长粗、账房算计、学者爱反驳、
   *    厨子满嘴吃的、少爷天真、对手挑衅。换个说话人还能成立 = 没写好。
   * 4) 彩蛋要"擦边不走题"：可以调侃时代（复式记账、地圆说、贵族少爷），
   *    但不能出现游戏里不存在的东西，否则玩家会去找。
   */
  {
    id: 'egg_low_water',
    speakerId: 'cook',
    lines: [
      '水桶见底了，船长。现在每人口粮一杯——我按滴数。',
      '别问我怎么数到一滴的。说起来我又渴了。',
    ],
  },
  {
    id: 'egg_low_morale',
    speakerId: 'boatswain',
    lines: [
      '他们已经三顿没见着热的东西了，船长。',
      '人心跟索具一样：绷太紧会断，松太久会烂。',
    ],
  },
  {
    id: 'egg_damaged',
    speakerId: 'surgeon',
    lines: [
      '船身上的口子比船员还多。我能缝人，船长。',
      '船得你自己找人缝。',
    ],
  },
  {
    id: 'egg_broke_cook',
    speakerId: 'cook',
    lines: [
      '今晚三道菜：咸肉、咸鱼、咸饼干。',
      '我知道听起来很咸。可它确实是三道菜。',
    ],
  },
  {
    id: 'egg_shipyard',
    speakerId: 'quartermaster',
    lines: [
      '船坞就在那儿。你要是打算让它继续漏水，我就当没看见。',
      '不过我建议修——沉了的船不给发军饷。',
    ],
  },
  {
    id: 'egg_rich_blackjack',
    speakerId: 'blackjack',
    lines: [
      '听说你发财了。别慌，我只是听说。',
      '我这人不抢朋友。问题是我朋友不多。',
    ],
  },
  {
    id: 'egg_fame_maria',
    speakerId: 'maria',
    lines: [
      '别把我当对手，船长。把我当账期。',
      '账期到了，事情就变得很难看。',
    ],
  },
  {
    id: 'egg_many_ports',
    speakerId: 'scholar',
    lines: [
      '六座港口了。可还有人坚持说西边是海的尽头。',
      '我量过三次。他们的尺子，三次都比我的短。',
    ],
  },
  {
    id: 'egg_storm_midshipman',
    speakerId: 'midshipman',
    lines: [
      '我父亲说，大西洋不过是个大池塘。',
      '他从没出过海。他现在还在客厅里，量我的航程。',
    ],
  },
  {
    id: 'egg_long_voyage',
    speakerId: 'chaplain',
    lines: [
      '我为顺风祈祷过，也为逆风祈祷过。',
      '老实说，后者更灵。人一害怕，就记得祈祷了。',
    ],
  },
  {
    id: 'egg_stars_diego',
    speakerId: 'diego',
    lines: [
      '你数星星，我数船。',
      '反正我们都在等同一个天亮。',
    ],
  },
  {
    id: 'egg_veteran',
    speakerId: 'corsair',
    lines: [
      '我年轻时也抢过船。现在我只抢时间。',
      '……还有酒。酒也算。',
    ],
  },
  {
    id: 'egg_night_helm',
    speakerId: 'pilot',
    lines: [
      '夜里别盯着罗盘看，船长。看星。',
      '罗盘只告诉你北在哪，星星会告诉你自己在哪。',
    ],
  },
  {
    id: 'egg_storm_chaplain',
    speakerId: 'chaplain',
    lines: [
      '别发誓，也别许愿。风暴不听这些。',
      '把帆收了、把人绑好——这才是今天该做的祷告。',
    ],
  },
  {
    id: 'egg_no_crew',
    speakerId: 'boatswain',
    lines: [
      '船长，船上除了你我，没人了。',
      '帆我可以一个人升。可风向变了，我一个人看不全。',
    ],
  },
  {
    id: 'egg_full_crew',
    speakerId: 'quartermaster',
    lines: [
      '人满得连吊床都得轮着睡。',
      '好事——至少下次打架，我们不是被追着跑的那一方。',
    ],
  },
  {
    id: 'egg_first_task',
    speakerId: 'quartermaster',
    lines: [
      '委托结了。钱进账，名声也进账。',
      '商会那帮人现在会记得你的名字——这是好事，也是麻烦。',
    ],
  },
  {
    id: 'egg_ten_ports',
    speakerId: 'scholar',
    lines: [
      '十座港口。地图上你走过的地方，已经比很多船长一辈子都多。',
      '可地图也快画满了……剩下的空白，才是我想去的地方。',
    ],
  },
  {
    id: 'egg_rich_maria',
    speakerId: 'maria',
    lines: [
      '你现在的身家，够买下半条街了。',
      '我不眼红。我只是想知道——你打算用它换什么。',
    ],
  },
  {
    id: 'egg_fame_jack',
    speakerId: 'blackjack',
    lines: [
      '到处都在传你的名字。传得比我的还响。',
      '我年轻时也想过要这个。后来发现，名字越响，越有人想试你。',
    ],
  },
  {
    id: 'egg_stocked',
    speakerId: 'cook',
    lines: [
      '舱里塞满了。面粉、咸肉、一桶酸菜。',
      '我这辈子第一次不知道该做什么——那就都做一遍。',
    ],
  },
  {
    id: 'egg_day50',
    speakerId: 'diego',
    lines: [
      '五十天了。你数日子，我数你还剩几根桅杆。',
      '别生气。我押的是你——三根都还在。',
    ],
  },
  {
    id: 'egg_first_dock',
    speakerId: 'purser',
    lines: [
      '船长，账本我立了新规矩：一笔进，记两笔。',
      '他们说我多此一举。等哪天两边的数自己撞上了，多此一举的就是他们。',
    ],
  },
]

/** 开局致辞的剧本 id（MainMap 开局触发点用） */
export const OPENING_SCRIPT_ID = 'opening_pilot'

export function getScript(id: string): DialogueScript | undefined {
  return DIALOGUE_SCRIPTS.find(s => s.id === id)
}

export function getSpeaker(script: DialogueScript): Speaker | undefined {
  return SPEAKERS[script.speakerId]
}

/**
 * 推进一句：返回下一句下标；已在末句则返回 -1（表示整段结束）。
 * total<=0 的防御性返回 -1，避免空剧本把界面卡在"永远打不完"状态。
 */
export function advanceDialogueIndex(current: number, total: number): number {
  if (total <= 0) return -1
  return current + 1 < total ? current + 1 : -1
}
