import { GameEvent } from '@/types'

/**
 * 事件库。
 *
 * 设计约定（游戏设计师视角）：
 * - 每个事件绑定一个 sceneKey，由 EventScene 渲染成场景插图（场景化叙事）
 * - triggerCondition.requiresFlags / conflictsWithFlags 支撑事件链与收集线：
 *   · 海图残片 ×3（204/205/206）集齐后解锁"完整的藏宝图"（207）
 *   · 幽灵船（202）登船探查后解锁"幽灵船的谢礼"（203）
 *   · 午夜走私者（208）成交后解锁"走私者的老朋友"（209）
 * - 旗标由事件结果的 setsFlag 写入，requiresFlags 事件触发时自动消耗旗标
 * - maxMorale 用于低士气专属事件（哗变），让"士气管理"成为真玩法
 */
export const events: GameEvent[] = [
  /* ============ 正面事件 ============ */
  {
    id: 101,
    type: 'discovery',
    sceneKey: 'fairwind',
    title: '顺风而行',
    description: '信风从后方稳定吹来，帆布饱满如满月——航海者梦寐以求的风向。',
    triggerCondition: { probability: 0.18 },
    choices: [
      {
        text: '满帆借风，全速前进',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: -2, waterChange: -1, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '船在浪尖上飞驰，进度大幅提前——老水手说这是海神在眷顾。' },
          { probability: 0.3, goldChange: 0, foodChange: -1, waterChange: 0, moraleChange: 10, durabilityChange: -3, crewChange: 0, description: '满帆略有颠簸，总体顺利——水手们在甲板上唱歌，士气高涨。' }
        ]
      },
      {
        text: '保持航速，趁机修补船帆',
        outcomes: [
          { probability: 0.8, goldChange: 0, foodChange: -2, waterChange: -1, moraleChange: 8, durabilityChange: 5, crewChange: 0, description: '工匠趁风平补好了帆布和绳索——未雨绸缪总比临时抱佛脚强。' },
          { probability: 0.2, goldChange: 0, foodChange: -3, waterChange: -2, moraleChange: 5, durabilityChange: 3, crewChange: 0, description: '船帆焕然一新，只多耗了一点补给。' }
        ]
      }
    ]
  },
  {
    id: 102,
    type: 'discovery',
    sceneKey: 'dolphin',
    title: '海豚护航',
    description: '银白色海豚在船头两侧编队护航，不时跃出水面旋转——水手们相信这是好运的兆头。',
    triggerCondition: { probability: 0.16 },
    choices: [
      {
        text: '在船头欣赏，感谢大海的礼物',
        outcomes: [
          { probability: 0.9, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 20, durabilityChange: 0, crewChange: 0, description: '海豚群陪伴你们航行了一整天——每个人的脸上都洋溢着久违的笑容。', historicalNote: '从古希腊时代起，海豚就被视为海神波塞冬的使者。水手们相信看到海豚意味着好运和安全的航程。' },
          { probability: 0.1, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 25, durabilityChange: 0, crewChange: 0, description: '一只小海豚在船头连翻了几个后空翻，全船欢呼雷动。' }
        ]
      },
      {
        text: '尝试与海豚互动，投喂食物',
        outcomes: [
          { probability: 0.8, goldChange: 0, foodChange: -2, waterChange: 0, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '海豚灵巧地接住了小鱼，一只大胆的甚至游到船舷边任由抚摸。' },
          { probability: 0.2, goldChange: 0, foodChange: -3, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, description: '海豚们本来就不需要你们的食物——但它们愉快地接受了心意。' }
        ]
      }
    ]
  },
  {
    id: 103,
    type: 'discovery',
    sceneKey: 'school',
    title: '丰饶渔获',
    description: '一大群金枪鱼在船附近的海面上捕食，整个海域变成了银色的漩涡——不用渔网都能捕到。厨师已经架起了烧烤架。',
    triggerCondition: { probability: 0.15 },
    choices: [
      {
        text: '全船出动，大肆捕捞',
        outcomes: [
          { probability: 0.7, goldChange: 5, foodChange: 20, waterChange: 0, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '这一网捞到甲板都堆不下——未来多日的食物不再发愁。' },
          { probability: 0.3, goldChange: 0, foodChange: 15, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, description: '鱼群散得比预想快，但腌成鱼干也够吃上一阵。' }
        ]
      },
      {
        text: '只取所需，让鱼群继续前行',
        outcomes: [
          { probability: 0.9, goldChange: 0, foodChange: 10, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, description: '你只取了够用的量——大海记住了这份克制，鱼汤一样鲜美。' },
          { probability: 0.1, goldChange: 2, foodChange: 5, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '老水手说这种鱼群是海神的祝福——幸运本身就是无价的。' }
        ]
      }
    ]
  },
  {
    id: 104,
    type: 'historical',
    sceneKey: 'market',
    title: '海上商队',
    description: '前方出现一支悬挂葡萄牙旗的商船队，指挥官发来友好信号——他们希望与你们贸易。',
    triggerCondition: { minDay: 10, probability: 0.12 },
    choices: [
      {
        text: '友好上前，进行互利贸易',
        outcomes: [
          { probability: 0.6, goldChange: 40, foodChange: 5, waterChange: 3, moraleChange: 12, durabilityChange: 0, crewChange: 0, description: '你用货物换到香料和丝绸，临别对方还赠了一瓶上好的葡萄牙葡萄酒。', historicalNote: '16-17世纪，葡萄牙和荷兰商船队经常在海上相遇进行贸易。这种"海上集市"是航海时代独特的商业文化。' },
          { probability: 0.3, goldChange: 25, foodChange: 3, waterChange: 2, moraleChange: 8, durabilityChange: 0, crewChange: 0, description: '交易规模不大，但船员们见识了异域风情。' },
          { probability: 0.1, goldChange: 10, foodChange: 2, waterChange: 1, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '商队货物大半售罄，仍分了些食物饮水——小额交易也让人心情愉快。' }
        ]
      },
      {
        text: '交换航海情报，了解前方海域信息',
        outcomes: [
          { probability: 0.8, goldChange: 5, foodChange: 0, waterChange: 0, moraleChange: 8, durabilityChange: 0, crewChange: 0, description: '商队分享了前方海域的情报：哪里补给充足、哪里暗礁密布——比金币更值钱。' },
          { probability: 0.2, goldChange: 2, foodChange: 0, waterChange: 0, moraleChange: 12, durabilityChange: 0, crewChange: 0, description: '你意外得知一个潜在商机——前方港口急需某种商品，价格高得离谱。' }
        ]
      }
    ]
  },
  {
    id: 105,
    type: 'discovery',
    sceneKey: 'whale',
    title: '鲸群邂逅',
    description: '鲸群在船只周围缓缓游动，喷起数道高高的水柱，发出低沉悠扬的歌声。水手们屏息凝神，被深深震撼。',
    triggerCondition: { minDay: 10, probability: 0.12 },
    choices: [
      {
        text: '停船观赏，记录这罕见的景观',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 20, durabilityChange: 0, crewChange: 0, description: '一头母鲸带着幼鲸游近船边，喷出的水雾在阳光下架起一道小彩虹。', historicalNote: '大航海时代的船只在远洋中经常遇到鲸群。许多航海日志中都记载了这些壮观场面，被视为航行中的吉兆。' },
          { probability: 0.3, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '鲸群嬉戏许久才潜入深海——这样的时刻值得珍藏一生。' }
        ]
      },
      {
        text: '跟随鲸群，它们可能引导至丰富的渔场',
        outcomes: [
          { probability: 0.5, goldChange: 8, foodChange: 12, waterChange: 0, moraleChange: 12, durabilityChange: 0, crewChange: 0, description: '鲸群把你们带到一片渔产丰富的海域——"鲸鱼指引的盛宴日"。' },
          { probability: 0.3, goldChange: 3, foodChange: 6, waterChange: 0, moraleChange: 8, durabilityChange: 0, crewChange: 0, description: '追随鲸群偏离了航线，但收获了几网不错的渔获。' },
          { probability: 0.2, goldChange: 0, foodChange: 2, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '鲸群消失在了深海中——但追随巨兽的体验已让船员心满意足。' }
        ]
      }
    ]
  },
  {
    id: 106,
    type: 'discovery',
    sceneKey: 'island',
    title: '海岛补给站',
    description: '前方出现一座无人小岛——椰林摇曳，溪流清澈，沙滩上满是贝壳。最重要的是：这里有丰富的淡水和野果。',
    triggerCondition: { minDay: 15, probability: 0.13 },
    choices: [
      {
        text: '登岛补给，充分修整',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: 10, waterChange: 15, moraleChange: 15, durabilityChange: 3, crewChange: 0, description: '补水、采椰子、溪流里洗澡、沙滩上烤鱼——简直是大海中的天堂。' },
          { probability: 0.3, goldChange: 5, foodChange: 8, waterChange: 12, moraleChange: 10, durabilityChange: 2, crewChange: 0, description: '岛上有土著留下的草棚，里面有干鱼和贝壳饰品——意外之喜。' }
        ]
      },
      {
        text: '快速取水后继续航行，保持进度',
        outcomes: [
          { probability: 0.8, goldChange: 0, foodChange: 3, waterChange: 10, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '快速补满淡水立即出发——充足的储备让后续航程轻松许多。' },
          { probability: 0.2, goldChange: 0, foodChange: 5, waterChange: 8, moraleChange: 7, durabilityChange: 0, crewChange: 0, description: '取水小队撞见一片野生菠萝——这点甜让所有人都在晚餐时笑了。' }
        ]
      }
    ]
  },
  {
    id: 107,
    type: 'discovery',
    sceneKey: 'meteor',
    title: '流星雨之夜',
    description: '夜空忽然被无数流星点亮，银色的轨迹密得如同天神洒落的金粉——难得一遇的天文奇观。',
    triggerCondition: { minDay: 20, probability: 0.1 },
    choices: [
      {
        text: '全船放假，共同欣赏星空',
        outcomes: [
          { probability: 0.8, goldChange: 0, foodChange: -1, waterChange: -1, moraleChange: 25, durabilityChange: 0, crewChange: 0, description: '这一夜后来被叫作"星光之夜"——领航员趁机教年轻水手认星座。' },
          { probability: 0.2, goldChange: 2, foodChange: -1, waterChange: -1, moraleChange: 20, durabilityChange: 0, crewChange: 0, description: '流星雨持续了两个钟头，水手们许的愿加起来能填满船舱。' }
        ]
      },
      {
        text: '利用星光校准航向，更新星图',
        outcomes: [
          { probability: 0.6, goldChange: 10, foodChange: 0, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, description: '领航员借星光重新校准了六分仪——修正后的航线更安全高效。' },
          { probability: 0.4, goldChange: 5, foodChange: 0, waterChange: 0, moraleChange: 8, durabilityChange: 0, crewChange: 0, description: '现有航线已是最优，但这份精确星图数据未来有用武之地。' }
        ]
      }
    ]
  },

  /* ============ 原事件（概率调低） ============ */
  {
    id: 1,
    type: 'storm',
    sceneKey: 'storm',
    title: '加勒比飓风',
    description: '乌云翻涌如墨，海面升起诡异的绿色荧光——老水手们面色惨白：这是飓风的前兆。巨浪已开始拍打船舷。',
    triggerCondition: { region: 'caribbean', dangerLevelMin: 2, probability: 0.12 },
    choices: [
      {
        text: '降帆收桅，全力抗击风暴',
        miniGame: 'storm',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: 5, durabilityChange: -10, crewChange: 0, description: '船在风暴中剧烈颠簸，但你们成功穿越了飓风——水手们对你的决断更加信服。' },
          { probability: 0.35, goldChange: 0, foodChange: -10, waterChange: -5, moraleChange: -5, durabilityChange: -25, crewChange: -2, description: '一根主桅被狂风折断，两名水手被巨浪卷入深海。' },
          { probability: 0.15, goldChange: 0, foodChange: -15, waterChange: -8, moraleChange: -15, durabilityChange: -40, crewChange: -5, description: '飓风把船推向礁石群，船底被撕裂——幸存者在残破的船上瑟瑟发抖。', historicalNote: '加勒比飓风是16-17世纪航海者的噩梦，无数西班牙珍宝船队在此葬身海底。1591年，一支西班牙船队在飓风中中损失了超过30艘船。' }
        ]
      },
      {
        text: '改变航向，尝试绕过风暴区',
        outcomes: [
          { probability: 0.45, goldChange: 0, foodChange: -8, waterChange: -5, moraleChange: 0, durabilityChange: -5, crewChange: 0, description: '绕行多耗了补给，但成功避开飓风中心——远处的天际仍被乌云笼罩。' },
          { probability: 0.4, goldChange: 0, foodChange: -12, waterChange: -8, moraleChange: -5, durabilityChange: -15, crewChange: -1, description: '风暴范围超出预期，绕行途中仍遇强风，一名瞭望手受伤。' },
          { probability: 0.15, goldChange: 0, foodChange: -20, waterChange: -12, moraleChange: -10, durabilityChange: -20, crewChange: -3, description: '绕行路线带你们闯进另一片危险海域，暗礁划破了船底。' }
        ]
      },
      {
        text: '满帆顺风，试图冲出风暴',
        outcomes: [
          { probability: 0.35, goldChange: 0, foodChange: -3, waterChange: -2, moraleChange: 10, durabilityChange: -5, crewChange: 0, description: '大胆的策略奏效了！船如离弦之箭冲出风暴区，水手们对你佩服得五体投地。' },
          { probability: 0.45, goldChange: 0, foodChange: -8, waterChange: -5, moraleChange: -10, durabilityChange: -30, crewChange: -4, description: '狂风撕裂帆布，数名水手被抛入大海——失控旋转后勉强脱险。' },
          { probability: 0.2, goldChange: -50, foodChange: -15, waterChange: -10, moraleChange: -20, durabilityChange: -50, crewChange: -8, description: '满帆冲入飓风无异于自寻死路——甲板上的货物和人一同被甩入大海。' }
        ]
      }
    ]
  },
  {
    id: 2,
    type: 'pirate',
    sceneKey: 'pirate',
    title: '黑旗飘扬',
    description: '"右舷发现船只——挂着黑旗！"骷髅旗猎猎作响，对方是为追击而造。',
    triggerCondition: { dangerLevelMin: 2, probability: 0.08 },
    choices: [
      {
        text: '战斗准备！全舰迎敌',
        miniGame: 'boarding',
        outcomes: [
          { probability: 0.45, goldChange: 30, foodChange: 0, waterChange: 0, moraleChange: 10, durabilityChange: -15, crewChange: -2, description: '激烈的接舷战后你们击退了海盗，还缴获了部分财宝。', historicalNote: '17世纪的加勒比海盗经常袭击西班牙宝船队。最著名的海盗如黑胡子和亨利·摩根都曾令整个加勒比闻风丧胆。' },
          { probability: 0.35, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: -5, durabilityChange: -25, crewChange: -5, description: '海盗战斗力超出预期——惨胜：船受损严重，多名水手负伤。' },
          { probability: 0.2, goldChange: -100, foodChange: -10, waterChange: -5, moraleChange: -20, durabilityChange: -40, crewChange: -10, description: '海盗登船后势如破竹，洗劫货舱后扬长而去。' }
        ]
      },
      {
        text: '全速逃跑，利用航线技巧摆脱',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: 5, durabilityChange: -5, crewChange: 0, description: '你穿过浅滩区，海盗船不敢冒险追击，只能望洋兴叹。' },
          { probability: 0.35, goldChange: 0, foodChange: -8, waterChange: -5, moraleChange: -5, durabilityChange: -10, crewChange: -1, description: '追逐持续数小时才甩掉海盗——补给消耗远超预算。' },
          { probability: 0.15, goldChange: -50, foodChange: -10, waterChange: -8, moraleChange: -15, durabilityChange: -20, crewChange: -3, description: '海盗船更快，追上后一阵炮击——趁着夜色才勉强逃脱。' }
        ]
      },
      {
        text: '升起白旗，尝试谈判',
        outcomes: [
          { probability: 0.4, goldChange: -60, foodChange: -5, waterChange: -3, moraleChange: -10, durabilityChange: 0, crewChange: 0, description: '海盗头目收了赎金放你们离去——破财，但保全了船和人。', historicalNote: '许多海盗遵循"投降不杀"的规矩。但像黑胡子这样残暴的海盗则从不留活口。' },
          { probability: 0.4, goldChange: -100, foodChange: -10, waterChange: -8, moraleChange: -15, durabilityChange: -10, crewChange: -3, description: '海盗收了赎金仍洗劫货舱，还掳走几名水手——示弱换来更多屈辱。' },
          { probability: 0.2, goldChange: -150, foodChange: -15, waterChange: -10, moraleChange: -25, durabilityChange: -20, crewChange: -6, description: '海盗狞笑着拒绝谈判——失去防备的你们被打得措手不及。' }
        ]
      }
    ]
  },
  {
    id: 3,
    type: 'disease',
    sceneKey: 'disease',
    title: '坏血病的阴影',
    description: '越来越多水手牙龈出血、皮肤布满淤斑——坏血病。这是所有水手最恐惧的敌人，不处理，整艘船都会被它吞噬。',
    triggerCondition: { minDay: 30, probability: 0.08 },
    choices: [
      {
        text: '改变航线前往最近的港口求医',
        outcomes: [
          { probability: 0.65, goldChange: -30, foodChange: 5, waterChange: 5, moraleChange: 5, durabilityChange: 0, crewChange: -1, description: '你在最近的港口找到医生和新鲜蔬果——只有一名病患没能挺过来。', historicalNote: '坏血病是大航海时代最致命的杀手，超过200万水手死于此病。直到18世纪才证明柑橘类水果的疗效。' },
          { probability: 0.35, goldChange: -50, foodChange: 5, waterChange: 5, moraleChange: -5, durabilityChange: -5, crewChange: -4, description: '绕行花了太多时间，几名重症水手途中去世——代价沉重。' }
        ]
      },
      {
        text: '在海上搜寻新鲜食物来源',
        outcomes: [
          { probability: 0.4, goldChange: 0, foodChange: 10, waterChange: 5, moraleChange: 5, durabilityChange: 0, crewChange: -1, description: '幸运地发现一座无人小岛——新鲜果蔬让病患开始恢复。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: -3, moraleChange: -5, durabilityChange: -5, crewChange: -3, description: '搜寻数日一无所获，几名重症水手在等待中离世。' },
          { probability: 0.2, goldChange: 0, foodChange: -5, waterChange: -5, moraleChange: -15, durabilityChange: -10, crewChange: -6, description: '搜寻中船撞上暗礁，坏血病继续蔓延——双重打击。' }
        ]
      }
    ]
  },
  {
    id: 4,
    type: 'discovery',
    sceneKey: 'island',
    title: '未知岛屿',
    description: '薄雾中，一座从未在海图上标注的岛屿出现在眼前。瀑布从悬崖倾泻而下，远处似乎有炊烟——岛上可能有人居住！',
    triggerCondition: { dangerLevelMin: 1, probability: 0.1 },
    choices: [
      {
        text: '登岛探索，与岛民接触',
        miniGame: 'escape',
        outcomes: [
          { probability: 0.5, goldChange: 50, foodChange: 15, waterChange: 10, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '原住民热情好客，酋长还赠了一箱珍珠作为友谊的象征。', historicalNote: '大航海时代的探险家经常在未知岛屿上遇到原住民。有些接触是友好的，如哥伦布在巴哈马的初次相遇。' },
          { probability: 0.35, goldChange: 20, foodChange: 5, waterChange: 5, moraleChange: 0, durabilityChange: -5, crewChange: -1, description: '岛民抱有戒心，但允许你们补充补给——一名水手误食毒浆果生病。' },
          { probability: 0.15, goldChange: -20, foodChange: 0, waterChange: 0, moraleChange: -10, durabilityChange: -15, crewChange: -3, description: '岛民视为入侵者发动袭击——几名水手被毒箭射中，仓皇逃回。' }
        ]
      },
      {
        text: '绕岛航行，寻找可利用的资源',
        outcomes: [
          { probability: 0.6, goldChange: 20, foodChange: 10, waterChange: 8, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '背风面的海湾里有清澈溪流和椰子——还捡到漂木可补船。' },
          { probability: 0.4, goldChange: 0, foodChange: 3, waterChange: 3, moraleChange: 0, durabilityChange: -5, crewChange: 0, description: '绕岛只找到少量资源，暗礁还让船轻微受损。' }
        ]
      }
    ]
  },
  {
    id: 5,
    type: 'historical',
    sceneKey: 'navy',
    title: '西班牙珍宝船队',
    description: '海平线上出现一支庞大船队——满载新大陆金银的盖伦船，有战舰护卫。',
    triggerCondition: { region: 'caribbean', minDay: 10, probability: 0.06 },
    choices: [
      {
        text: '保持距离，礼貌地远远跟随',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: -3, waterChange: -2, moraleChange: 0, durabilityChange: 0, crewChange: 0, description: '护卫舰见你们无敌意便不再理会——船队航线的情报记下了。', historicalNote: '西班牙珍宝船队从1566年开始，每年将新大陆财富运回西班牙。这是当时世界上最重要的财富通道。' },
          { probability: 0.3, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: -5, durabilityChange: -5, crewChange: 0, description: '西班牙战舰发来警告炮弹——你们不得不白白绕路。' }
        ]
      },
      {
        text: '尝试与船队进行贸易',
        miniGame: 'haggle',
        outcomes: [
          { probability: 0.4, goldChange: 30, foodChange: 5, waterChange: 5, moraleChange: 10, durabilityChange: 0, crewChange: 0, description: '你用朗姆酒换到优质航海仪器和银币——获利颇丰。' },
          { probability: 0.4, goldChange: 0, foodChange: -3, waterChange: -2, moraleChange: -5, durabilityChange: 0, crewChange: 0, description: '西班牙人傲慢地拒绝了贸易——水手们对这种轻蔑感到愤怒。' },
          { probability: 0.2, goldChange: -30, foodChange: -5, waterChange: -3, moraleChange: -10, durabilityChange: -10, crewChange: 0, description: '靠近被视为挑衅，护卫舰开炮驱赶——一发炮弹击中船尾。' }
        ]
      }
    ]
  },
  {
    id: 6,
    type: 'accident',
    sceneKey: 'reef',
    title: '暗礁危机',
    description: '船底传来撕裂声——触礁了！海水涌入底舱，不堵住裂缝，船就会沉没。',
    triggerCondition: { dangerLevelMin: 1, probability: 0.1 },
    choices: [
      {
        text: '组织全体船员紧急堵漏',
        outcomes: [
          { probability: 0.55, goldChange: 0, foodChange: -3, waterChange: -2, moraleChange: 5, durabilityChange: -10, crewChange: 0, description: '帆布和木板成功堵住漏洞——这次危机让船员们更加团结。' },
          { probability: 0.3, goldChange: 0, foodChange: -5, waterChange: -5, moraleChange: -5, durabilityChange: -25, crewChange: -1, description: '堵漏异常艰难，一名水手被海水冲走——船需尽快进港大修。' },
          { probability: 0.15, goldChange: -30, foodChange: -8, waterChange: -5, moraleChange: -15, durabilityChange: -40, crewChange: -3, description: '裂缝比预想大，你们抛弃部分货物、抽水搏斗一整夜才保住船。' }
        ]
      },
      {
        text: '抛弃部分货物减轻重量，驶向浅滩搁浅',
        outcomes: [
          { probability: 0.5, goldChange: -40, foodChange: -5, waterChange: -3, moraleChange: -5, durabilityChange: -15, crewChange: 0, description: '抛弃大量货物后船勉强搁上浅滩——等潮水上涨再浮起。' },
          { probability: 0.35, goldChange: -60, foodChange: -8, waterChange: -5, moraleChange: -10, durabilityChange: -20, crewChange: -1, description: '抛弃不够快，海水淹没了底舱大半物资——一名水手落水。' },
          { probability: 0.15, goldChange: -80, foodChange: -10, waterChange: -8, moraleChange: -20, durabilityChange: -30, crewChange: -4, description: '即使弃货船还是开始倾斜——多名水手被海水吞没。' }
        ]
      }
    ]
  },
  {
    id: 7,
    type: 'storm',
    sceneKey: 'doldrums',
    title: '赤道无风带',
    description: '风停了。完全停了。帆布无力地垂挂，海面平静得令人窒息，船舱如同蒸笼——这是水手最恐惧的赤道无风带。',
    triggerCondition: { region: 'africa', probability: 0.1 },
    choices: [
      {
        text: '耐心等待，节约补给',
        outcomes: [
          { probability: 0.45, goldChange: 0, foodChange: -10, waterChange: -12, moraleChange: -10, durabilityChange: 0, crewChange: 0, description: '数日煎熬后微风重新吹起——补给消耗严重，但你们挺过来了。', historicalNote: '赤道无风带（Doldrums）是大西洋低压区域，帆船曾在此滞留数周，许多船只耗尽补给。' },
          { probability: 0.35, goldChange: 0, foodChange: -15, waterChange: -15, moraleChange: -15, durabilityChange: -5, crewChange: -2, description: '无风持续了整整两周——几名体弱水手中暑脱水倒下。' },
          { probability: 0.2, goldChange: 0, foodChange: -20, waterChange: -20, moraleChange: -25, durabilityChange: -10, crewChange: -5, description: '水手喝海水解渴更加虚弱——风终于来时，已有人永远等不到。' }
        ]
      },
      {
        text: '放下小艇，用划桨拖动大船',
        outcomes: [
          { probability: 0.4, goldChange: 0, foodChange: -8, waterChange: -8, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '水手轮流划桨拖船——团结协作反而提振了士气。' },
          { probability: 0.45, goldChange: 0, foodChange: -12, waterChange: -10, moraleChange: -5, durabilityChange: -5, crewChange: -1, description: '划桨极其消耗体力，水手很快精疲力竭——效果有限。' },
          { probability: 0.15, goldChange: 0, foodChange: -15, waterChange: -12, moraleChange: -10, durabilityChange: -5, crewChange: -3, description: '烈日下划桨如同酷刑，多名水手中暑倒下，小艇绳索还断了。' }
        ]
      }
    ]
  },
  {
    id: 8,
    type: 'storm',
    sceneKey: 'cape',
    title: '好望角的风暴',
    description: '好望角附近卷起数十尺巨浪，狂风如万兽咆哮——葡萄牙水手称它为"风暴角"，过了这里就是东方的希望。',
    triggerCondition: { region: 'africa', minDay: 40, probability: 0.08 },
    choices: [
      {
        text: '迎风而上，穿越好望角',
        miniGame: 'storm',
        outcomes: [
          { probability: 0.4, goldChange: 0, foodChange: -8, waterChange: -5, moraleChange: 10, durabilityChange: -15, crewChange: -1, description: '你凭技术与勇气穿越好望角——水手们把你抛向空中欢呼。', historicalNote: '1488年，迪亚士成为第一个绕过好望角的欧洲人。他最初将其命名为"风暴角"。' },
          { probability: 0.4, goldChange: 0, foodChange: -12, waterChange: -8, moraleChange: -5, durabilityChange: -30, crewChange: -4, description: '风暴猛烈超乎想象，桅杆折断、数名水手被卷走——代价惨重。' },
          { probability: 0.2, goldChange: -30, foodChange: -15, waterChange: -10, moraleChange: -20, durabilityChange: -45, crewChange: -8, description: '好望角给了毁灭性打击——多名水手葬身海底。' }
        ]
      },
      {
        text: '退回开普敦港湾避风',
        outcomes: [
          { probability: 0.65, goldChange: -20, foodChange: 5, waterChange: 5, moraleChange: 0, durabilityChange: -5, crewChange: 0, description: '退回开普敦避风是明智选择——花了停泊费，保全了船和人。' },
          { probability: 0.35, goldChange: -30, foodChange: 3, waterChange: 3, moraleChange: -5, durabilityChange: -10, crewChange: -1, description: '返航途中也遇强风，修理补给花费不菲——但比在风暴里冒险安全。' }
        ]
      }
    ]
  },
  {
    id: 9,
    type: 'pirate',
    sceneKey: 'pirate',
    title: '东方海域的海盗',
    description: '马六甲海峡附近，一艘涂着诡异红漆的帆船从岛屿后方冲出——南洋海盗比加勒比海盗更凶残，横行这片海域数百年。',
    triggerCondition: { region: 'asia', dangerLevelMin: 2, probability: 0.08 },
    choices: [
      {
        text: '利用海峡地形设伏反击',
        miniGame: 'boarding',
        outcomes: [
          { probability: 0.45, goldChange: 40, foodChange: 0, waterChange: 0, moraleChange: 15, durabilityChange: -10, crewChange: -2, description: '你诱敌进入狭窄水道，海盗船无法展开队形——火炮击沉了它。', historicalNote: '马六甲海峡自古海盗出没。明代郑和下西洋时在此遭遇海盗，著名海盗陈祖义被郑和擒获斩首。' },
          { probability: 0.35, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: -5, durabilityChange: -20, crewChange: -4, description: '设伏被识破，海盗从侧翼包抄——狭窄水域里的战斗异常惨烈。' },
          { probability: 0.2, goldChange: -80, foodChange: -10, waterChange: -5, moraleChange: -20, durabilityChange: -35, crewChange: -7, description: '海盗用暗礁和浅滩把你引入陷阱——船搁浅后他们蜂拥而上。' }
        ]
      },
      {
        text: '向最近的港口全速撤退',
        outcomes: [
          { probability: 0.55, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: 0, durabilityChange: -5, crewChange: 0, description: '你熟悉航线，在岛屿间穿梭——港口炮台让海盗不敢追进来。' },
          { probability: 0.45, goldChange: -20, foodChange: -8, waterChange: -5, moraleChange: -10, durabilityChange: -15, crewChange: -2, description: '海盗船速更快，追击中不断炮击——好在港口炮台掩护下脱险。' }
        ]
      }
    ]
  },
  {
    id: 10,
    type: 'treasure',
    sceneKey: 'treasure',
    title: '沉船宝藏',
    description: '浅海处瞭望手发现水下有异常阴影——一艘沉没的盖伦大帆船！透过清澈海水，船舱里隐约闪着金色的光。',
    triggerCondition: { dangerLevelMin: 2, probability: 0.06 },
    choices: [
      {
        text: '派水手潜水打捞',
        outcomes: [
          { probability: 0.4, goldChange: 100, foodChange: 0, waterChange: 0, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '水手轮流下潜，打捞出大量金银币和宝石——士气空前高涨！', historicalNote: '加勒比海底散布着数百艘西班牙沉船。2015年哥伦比亚发现1708年沉没的"圣何塞号"，财宝价值约170亿美元。' },
          { probability: 0.4, goldChange: 40, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: -1, description: '大部分船舱被泥沙堵塞，只捞到部分财宝——一名水手潜水时受伤。' },
          { probability: 0.2, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -10, durabilityChange: 0, crewChange: -3, description: '沉船比预想更深——三名水手溺水身亡，财宝也远不如想象丰富。' }
        ]
      },
      {
        text: '记录位置，留待日后装备更好时再来',
        outcomes: [
          { probability: 0.8, goldChange: 5, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, description: '你记下沉船的精确坐标——放弃眼前利益，但这份信息本身有价值。' },
          { probability: 0.2, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, description: '记录时另一艘船出现在地平线——这个秘密可能保不住了。' }
        ]
      }
    ]
  },
  {
    id: 12,
    type: 'historical',
    sceneKey: 'chart',
    title: '达伽马的航迹',
    description: '印度洋上出现一串奇特水纹——那是洋流交汇的痕迹。领航员激动地说，这和达伽马记录的航线特征完全吻合。',
    triggerCondition: { region: 'asia', minDay: 20, probability: 0.06 },
    choices: [
      {
        text: '沿着航迹深入探索',
        outcomes: [
          { probability: 0.6, goldChange: 60, foodChange: 5, waterChange: 5, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '沿航迹找到一座葡萄牙补给站遗址——航海日志和香料样本完好。', historicalNote: '达伽马于1498年到达印度卡利卡特，开辟了欧洲到印度的海上航线，改变了世界贸易格局。' },
          { probability: 0.3, goldChange: 20, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: -5, crewChange: 0, description: '航迹在暗礁区消失，但收集到的洋流数据对未来航行大有裨益。' },
          { probability: 0.1, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: -5, durabilityChange: -10, crewChange: -1, description: '航迹把你们引入危险海域——暗礁和漩涡让船只受损。' }
        ]
      },
      {
        text: '记录位置，继续原定航线',
        outcomes: [
          { probability: 0.8, goldChange: 10, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, description: '发现详细记入航海日志——错过深入探索的机会，但安全第一。' },
          { probability: 0.2, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, description: '水手们觉得你过于谨慎——在未知海域冒险往往意味着灾难。' }
        ]
      }
    ]
  },

  /* ================================================================
   * 新增事件（带场景插图与事件链）
   * ================================================================ */

  /* ---- 海怪 ---- */
  {
    id: 201,
    type: 'kraken',
    sceneKey: 'kraken',
    title: '北海巨妖',
    description: '海面毫无征兆地隆起一座"小山"——那是触手。挪威海怪用覆满吸盘的腕足缠住船舷，船身发出不堪重负的呻吟。',
    triggerCondition: { dangerLevelMin: 3, probability: 0.05 },
    choices: [
      {
        text: '火炮齐射！斩断触手',
        outcomes: [
          { probability: 0.35, goldChange: 80, foodChange: 0, waterChange: 0, moraleChange: 10, durabilityChange: -20, crewChange: -3, description: '最粗的触手应声而断，断腕里竟裹着沉船遗物箱——金银滚落甲板。', historicalNote: '北欧传说中的"克拉肯"很可能源自大王乌贼。19世纪的丹麦生物学家斯滕斯特鲁普首次用科学方法研究了这种巨兽。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: -25, crewChange: -5, description: '断腕的巨妖彻底狂怒，桅杆断裂、舷墙粉碎——整艘船像被巨人揉过一遍。' },
          { probability: 0.25, goldChange: 0, foodChange: -10, waterChange: -5, moraleChange: -15, durabilityChange: -45, crewChange: -8, description: '腕足缠住船底往深海拖——砍断三根触手才挣脱，货舱已经进水。' }
        ]
      },
      {
        text: '抛弃半数货物，引开巨妖',
        outcomes: [
          { probability: 0.5, goldChange: -60, foodChange: -10, waterChange: 0, moraleChange: -5, durabilityChange: -10, crewChange: -1, description: '巨妖卷走货箱就退回了深海——船保住了，但商货沉入黑暗。' },
          { probability: 0.3, goldChange: -100, foodChange: -15, waterChange: -5, moraleChange: -10, durabilityChange: -20, crewChange: -3, description: '巨妖对货物毫无兴趣，它要的是整艘船——你们边弃货边拼命划桨。' },
          { probability: 0.2, goldChange: 0, foodChange: -5, waterChange: 0, moraleChange: 5, durabilityChange: -5, crewChange: 0, description: '你们刚推下两箱货，它就叼走一箱咸鱼扬长而去——老水手直拍大腿。' }
        ]
      },
      {
        text: '熄灯静默，等它自己离开',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: -5, waterChange: -5, moraleChange: -10, durabilityChange: -5, crewChange: 0, description: '全船熄灯、屏息、停桨。漫长的半个夜晚后海面恢复平静——它走了。' },
          { probability: 0.4, goldChange: 0, foodChange: -8, waterChange: -5, moraleChange: -5, durabilityChange: -15, crewChange: -2, description: '静默没骗过它——一根触手缠住尾舵，你们点火把敲脸盆才吓跑它。' }
        ]
      }
    ]
  },

  /* ---- 幽灵船链 ---- */
  {
    id: 202,
    type: 'ghost',
    sceneKey: 'ghostship',
    title: '幽灵船',
    description: '浓雾中，一艘船的轮廓无声滑入视野——没有灯火，没有桨声，帆索破烂如幽灵的衣裙。它径直朝你们漂来。',
    triggerCondition: { minDay: 15, probability: 0.05 },
    choices: [
      {
        text: '系缆登船，看个究竟',
        miniGame: 'lookout',
        outcomes: [
          { probability: 0.5, goldChange: 30, foodChange: 5, waterChange: 3, moraleChange: 10, durabilityChange: 0, crewChange: -1, setsFlag: 'ghost_encounter', description: '那是被遗弃的葡萄牙轻帆船，舱里积满灰尘却整齐码着未开封的淡水和腌肉。' },
          { probability: 0.3, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 15, durabilityChange: 0, crewChange: 0, setsFlag: 'ghost_encounter', description: '船上空无一人，只有一本写满疯癫字句的航海日志，最后一页反复写着："别回答。"' },
          { probability: 0.2, goldChange: 0, foodChange: -5, waterChange: -5, moraleChange: -20, durabilityChange: -10, crewChange: -3, description: '登船瞬间浓雾骤起，缆绳凭空消失！三名水手在雾中失散。' }
        ]
      },
      {
        text: '改变航向，敬而远之',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: -3, waterChange: -2, moraleChange: -5, durabilityChange: 0, crewChange: 0, description: '幽灵船从你们舷侧缓缓漂过，帆布发出叹息般的声响——老水手在胸口画十字。' },
          { probability: 0.3, goldChange: 0, foodChange: -3, waterChange: -2, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '避开之后风平浪静——但没人愿意再回头看第二眼。' }
        ]
      }
    ]
  },
  {
    id: 203,
    type: 'ghost',
    sceneKey: 'ghostship',
    title: '幽灵船的谢礼',
    description: '又是那片雾，还是那艘船。这次它停在原地等你们——船舷边放着一只锁扣严实的铁箱，箱盖上压着一盏熄灭的提灯。',
    triggerCondition: { minDay: 15, requiresFlags: ['ghost_encounter'], probability: 0.5 },
    choices: [
      {
        text: '收起铁箱',
        outcomes: [
          { probability: 0.6, goldChange: 150, foodChange: 0, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, description: '箱中是西班牙金币和一张手绘海图——某座无名小岛被红笔圈出。' },
          { probability: 0.4, goldChange: 80, foodChange: 5, waterChange: 5, moraleChange: 5, fameChange: 5, durabilityChange: 0, crewChange: 0, description: '箱中是旧式银器和一袋没氧化的香料——迷雾散去时，幽灵船降下了残帆。' }
        ]
      },
      {
        text: '将箱子抛回海中',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, fameChange: 15, description: '你向幽灵船敬了一个礼，转身离去——那晚每个人都梦见了平静的大海。', historicalNote: '北欧航海传说中，"死者的礼物"不可轻取。领取幽灵财宝的水手往往会被大海以另一种方式收取代价。' },
          { probability: 0.3, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 8, description: '箱子入水无声。回程一路顺风——仿佛大海记住了你的克制。' }
        ]
      }
    ]
  },

  /* ---- 海图残片收集线 ---- */
  {
    id: 204,
    type: 'treasure',
    sceneKey: 'chart',
    title: '海图残片·加勒比',
    description: '废弃哨塔的木板缝里藏着一卷羊皮纸——古海图的四分之一。边缘写着一行小字："散于三海，集之可启。"',
    triggerCondition: { region: 'caribbean', minDay: 5, conflictsWithFlags: ['map_fragment_1'], probability: 0.05 },
    choices: [
      {
        text: '收好残片，继续航行',
        outcomes: [
          { probability: 0.8, goldChange: 10, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, setsFlag: 'map_fragment_1', description: '你把残片钉在航海日志扉页上——另外两块若能凑齐，这图也许指向一笔财富。' },
          { probability: 0.2, goldChange: 20, foodChange: 0, waterChange: 0, moraleChange: 8, durabilityChange: 0, crewChange: 0, setsFlag: 'map_fragment_1', description: '残片旁还卡着两枚被遗忘的金币——你把它们揣进口袋。' }
        ]
      },
      {
        text: '当场研读，凭记忆背下航线',
        outcomes: [
          { probability: 0.7, goldChange: 5, foodChange: 0, waterChange: 0, moraleChange: 3, durabilityChange: 0, crewChange: 0, setsFlag: 'map_fragment_1', description: '领航员研究了半个钟头，把航线牢牢记在心里——知识比羊皮更耐腐蚀。' },
          { probability: 0.3, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -3, durabilityChange: 0, crewChange: 0, setsFlag: 'map_fragment_1', description: '墨迹晕得太厉害，大半航线已无法辨认——但愿另外两块保存得更好。' }
        ]
      }
    ]
  },
  {
    id: 205,
    type: 'treasure',
    sceneKey: 'chart',
    title: '海图残片·黄金海岸',
    description: '埃尔米纳城堡的石墙上嵌着一张古海图碎片——它与你手中的残片严丝合缝。',
    triggerCondition: { region: 'africa', minDay: 5, conflictsWithFlags: ['map_fragment_2'], probability: 0.05 },
    choices: [
      {
        text: '拓下图案，继续赶路',
        outcomes: [
          { probability: 0.8, goldChange: 10, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, setsFlag: 'map_fragment_2', description: '你用炭笔拓下墙上的图案——看守收下几枚铜板，什么也没说。' },
          { probability: 0.2, goldChange: 25, foodChange: 0, waterChange: 0, moraleChange: 8, durabilityChange: 0, crewChange: 0, setsFlag: 'map_fragment_2', description: '拓完图案，你在墙根踢到一只旧布袋——里面是商人遗落的银币。' }
        ]
      },
      {
        text: '向城堡的老人打听这张图的来历',
        outcomes: [
          { probability: 0.6, goldChange: 5, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, setsFlag: 'map_fragment_2', description: '老看守压低声音：几十年前有个西班牙船长总来此，带着"分成四份藏起来的图"。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, setsFlag: 'map_fragment_2', description: '老人什么都不肯说，只反复叮嘱："别找齐。找齐的人，都走了同一片海。"' }
        ]
      }
    ]
  },
  {
    id: 206,
    type: 'treasure',
    sceneKey: 'chart',
    title: '海图残片·东方',
    description: '马六甲一间华人商行的库房里，老板娘拿旧海图垫茶壶——那羊皮纸的质地，和你收集的两块一模一样。',
    triggerCondition: { region: 'asia', minDay: 5, conflictsWithFlags: ['map_fragment_3'], probability: 0.05 },
    choices: [
      {
        text: '花重金买下这张"茶壶垫"',
        outcomes: [
          { probability: 0.7, goldChange: -20, foodChange: 0, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, setsFlag: 'map_fragment_3', description: '二十金币——一张"包茶的旧纸"。三块残片终于拼合，指向一座未标注的岛屿。' },
          { probability: 0.3, goldChange: -10, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, setsFlag: 'map_fragment_3', description: '老板娘本来只要十个金币，临走还多送了一包上好的武夷茶。' }
        ]
      },
      {
        text: '用一桶朗姆酒交换',
        outcomes: [
          { probability: 0.8, goldChange: 0, foodChange: -5, waterChange: 0, moraleChange: 8, durabilityChange: 0, crewChange: 0, setsFlag: 'map_fragment_3', description: '朗姆酒在这里是稀罕物——老板娘眉开眼笑地把海图让给了你。' },
          { probability: 0.2, goldChange: 0, foodChange: -5, waterChange: 0, moraleChange: 3, durabilityChange: 0, crewChange: 0, setsFlag: 'map_fragment_3', description: '成交。老板娘嘟囔了一句闽南语，学徒翻译说："四十年前也有人这样拼过一张图。"' }
        ]
      }
    ]
  },
  {
    id: 207,
    type: 'treasure',
    sceneKey: 'treasure',
    title: '完整的藏宝图',
    description: '三块残片在船长室的灯下拼合，缝隙严丝合缝——一幅完整的古海图！"×"落在加勒比海深处一座无名小岛旁。',
    triggerCondition: { minDay: 10, requiresFlags: ['map_fragment_1', 'map_fragment_2', 'map_fragment_3'], probability: 0.6 },
    choices: [
      {
        text: '按图出航，直取宝藏',
        outcomes: [
          { probability: 0.55, goldChange: 500, foodChange: 0, waterChange: 0, moraleChange: 20, durabilityChange: 0, crewChange: 0, fameChange: 25, setsFlag: 'treasure_found', description: '沙丘下挖出三口密封橡木箱——金币、祖母绿、整箱银币！水手们一致要求今晚狂欢。' },
          { probability: 0.3, goldChange: 300, foodChange: 0, waterChange: 0, moraleChange: 15, durabilityChange: 0, crewChange: 0, fameChange: 20, setsFlag: 'treasure_found', description: '宝藏是真的，但比图上标的少了一半——显然有人先来过。' },
          { probability: 0.15, goldChange: 100, foodChange: -5, waterChange: -5, moraleChange: 5, durabilityChange: -15, crewChange: -2, setsFlag: 'treasure_found', description: '返航时遇暗礁，抛弃部分财宝才保住船——水手们为扔哪几箱差点打起来。' }
        ]
      },
      {
        text: '献给王室，换取特许与名望',
        outcomes: [
          { probability: 0.6, goldChange: 200, foodChange: 0, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, fameChange: 40, setsFlag: 'treasure_found', description: '王室赏赐之外还特许你独家使用新大陆的两条贸易航线——官员看你的眼神多了敬畏。', historicalNote: '西班牙王室常以"特许状（Cédula Real）"奖励航海成就，持证人享有指定港口的贸易垄断权。' },
          { probability: 0.4, goldChange: 150, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 30, setsFlag: 'treasure_found', description: '赏赐中规中矩，但"献宝船长"的名号随宫廷典礼传遍了塞维利亚。' }
        ]
      }
    ]
  },

  /* ---- 走私链 ---- */
  {
    id: 208,
    type: 'smuggle',
    sceneKey: 'smuggle',
    title: '午夜走私者',
    description: '午夜，一艘无旗小船无声贴近船舷。斗笠下露出精明的脸："船长，做笔小买卖？禁运香料，比市价低一半。"',
    triggerCondition: { minDay: 12, probability: 0.07 },
    choices: [
      {
        text: '成交——便宜货没有不做的道理',
        outcomes: [
          { probability: 0.5, goldChange: 120, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: -8, setsFlag: 'smuggler_contact', description: '一箱没交税的肉桂和小豆蔻搬上船——转手一卖三倍利润。他还教了你一句切口。' },
          { probability: 0.3, goldChange: 200, foodChange: 0, waterChange: 0, moraleChange: 8, durabilityChange: 0, crewChange: 0, fameChange: -12, setsFlag: 'smuggler_contact', description: '这次是一整匹禁运的广州绸缎——在黑市上是硬通货。' },
          { probability: 0.2, goldChange: 60, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, fameChange: -4, setsFlag: 'smuggler_contact', description: '货便宜但数量有限——走私者记下了你的船名和航线。' }
        ]
      },
      {
        text: '向最近的港口举报他们',
        outcomes: [
          { probability: 0.6, goldChange: 40, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 12, description: '港务官按你的线报截住小船，分给你一笔赏金——"守法船长"的名声传开了。', historicalNote: '17世纪欧洲各国海关对走私的打击极其严厉，举报者可获得货值一定比例的赏金。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, fameChange: 8, description: '小船闻风先逃了——没有赏金，但港务官记住了你的正直。' }
        ]
      },
      {
        text: '拒绝并加速离开',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: -3, waterChange: -3, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '你以"船上已满"为由拒绝，连夜改变航向——水手们对你的谨慎表示理解。' },
          { probability: 0.4, goldChange: 0, foodChange: -5, waterChange: -5, moraleChange: -5, durabilityChange: 0, crewChange: 0, description: '你总觉得那艘船在暗处跟着，索性多绕了一夜——虚惊一场。' }
        ]
      }
    ]
  },
  {
    id: 209,
    type: 'smuggle',
    sceneKey: 'smuggle',
    title: '走私者的老朋友',
    description: '暗礁湾，无旗小船等在落日里。斗笠人搬出包铁大箱："一整箱禁运广东瓷器，运到阿姆斯特丹值十倍价。"',
    triggerCondition: { minDay: 12, requiresFlags: ['smuggler_contact'], probability: 0.5 },
    choices: [
      {
        text: '接货——富贵险中求',
        outcomes: [
          { probability: 0.45, goldChange: 300, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: -15, description: '瓷器在阿姆斯特丹黑市被疯抢——只是官员看你的眼神多了些意味深长。' },
          { probability: 0.35, goldChange: 400, foodChange: 0, waterChange: 0, moraleChange: 8, durabilityChange: 0, crewChange: 0, fameChange: -25, description: '箱里还有几件官窑珍品——够你下半生衣食无忧，但"与走私贩过从甚密"开始流传。' },
          { probability: 0.2, goldChange: 150, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, fameChange: -5, description: '平安无事，利润照拿——有些线，踩一次是运气，踩两次是命。' }
        ]
      },
      {
        text: '反手将他举报给港务官',
        outcomes: [
          { probability: 0.55, goldChange: 100, foodChange: 0, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, fameChange: 20, description: '港务官端掉这个走私巢点——缴获货值让你分到丰厚赏金。' },
          { probability: 0.45, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 25, description: '走私者当场被捕——他盯着你看了很久，忽然笑了："好演技。"' }
        ]
      },
      {
        text: '假装从未相识',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, description: '你目不斜视地驶过暗礁湾——有些钱赚过一次就够了。' },
          { probability: 0.4, goldChange: 0, foodChange: -3, waterChange: -3, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '你主动绕开了那片海域——跟走私贩划清界限，睡觉都踏实。' }
        ]
      }
    ]
  },

  /* ---- 庆典 ---- */
  {
    id: 210,
    type: 'festival',
    sceneKey: 'festival',
    title: '甲板狂欢',
    description: '厨子翻出珍藏的朗姆酒，提琴手拉起一支故乡舞曲，有人敲着木桶打拍子——今晚没有风暴、没有海盗。',
    triggerCondition: { minDay: 8, probability: 0.1 },
    choices: [
      {
        text: '加入狂欢，不醉不归',
        miniGame: 'gamble',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: -10, waterChange: -8, moraleChange: 30, durabilityChange: 0, crewChange: 0, description: '这一夜后来被写进航海日志扉页——明天的补给会紧张，但值了。' },
          { probability: 0.25, goldChange: 0, foodChange: -6, waterChange: -5, moraleChange: 25, durabilityChange: 0, crewChange: 0, description: '酒到好处，话也到好处——有人笑着笑着就哭了。这支船队真正成了一个整体。' },
          { probability: 0.15, goldChange: 0, foodChange: -12, waterChange: -10, moraleChange: 35, durabilityChange: -3, crewChange: 0, description: '狂欢过头——有人把酒桶滚下了海。补给超标，但士气史无前例。' }
        ]
      },
      {
        text: '独自守夜，趁机检修船只',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: -2, waterChange: -2, moraleChange: 10, durabilityChange: 5, crewChange: 0, description: '你端着热茶在舵轮旁值夜，顺手换掉两截老化的帆索。' },
          { probability: 0.3, goldChange: 0, foodChange: -2, waterChange: -2, moraleChange: 5, durabilityChange: 8, crewChange: 0, description: '你借月光把整艘船检查了一遍——松动的钉锤、磨短的缆绳，全都记进了工单。' }
        ]
      }
    ]
  },

  /* ---- 哗变（低士气专属） ---- */
  {
    id: 211,
    type: 'accident',
    sceneKey: 'mutiny',
    title: '叛乱的阴霾',
    description: '深夜甲板传来压低嗓门的争吵。水手分成两拨举刀握桨，只争一件事：还要不要跟你走。',
    triggerCondition: { minDay: 20, maxMorale: 45, probability: 0.08 },
    choices: [
      {
        text: '当众平息叛乱，承诺改善待遇',
        outcomes: [
          { probability: 0.5, goldChange: -50, foodChange: 0, waterChange: 0, moraleChange: 15, durabilityChange: 0, crewChange: -1, description: '你把私囊金币倒在甲板上："双倍口粮，提前分红。"骚动平息了，但有人看你的眼神像看认输的人。' },
          { probability: 0.3, goldChange: -30, foodChange: 0, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, description: '你减免三成口粮税、许诺到港放假——第二天清晨有人在你门前放了瓶朗姆酒。' },
          { probability: 0.2, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -10, durabilityChange: 0, crewChange: -2, description: '承诺没兑现到每个人心里——裂痕留在了甲板上。' }
        ]
      },
      {
        text: '追究首领，以正纲纪',
        outcomes: [
          { probability: 0.45, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: -3, description: '首领被当场拿下，按海律打了二十鞭、关进货舱——甲板上只剩服从，没有了笑声。' },
          { probability: 0.3, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -10, durabilityChange: 0, crewChange: -5, description: '几名死党连夜带着补给逃走了——你只捞回半袋咸肉。船稳了，人心散了。' },
          { probability: 0.25, goldChange: 20, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: -1, description: '首领供出一小袋私藏金币——他早给自己留了后路。' }
        ]
      },
      {
        text: '分赃安抚，用财富买忠诚',
        outcomes: [
          { probability: 0.55, goldChange: -100, foodChange: -5, waterChange: -5, moraleChange: 10, durabilityChange: 0, crewChange: 0, description: '金币和朗姆酒堆在甲板上，人群的眼睛亮了——忠诚有时候确实标着价码。' },
          { probability: 0.45, goldChange: -150, foodChange: -5, waterChange: -5, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '你几乎掏空了钱箱，换来一夜太平和一张按满手印的"效忠书"。' }
        ]
      }
    ]
  },

  /* ---- 天灾与奇遇 ---- */
  {
    id: 212,
    type: 'volcano',
    sceneKey: 'volcano',
    title: '火山岛喷发',
    description: '地平线上的岛屿毫无征兆地喷出火柱——整座山在燃烧！岩浆淌进大海，灰烬像黑雪落在你们的帆上。',
    triggerCondition: { minDay: 18, probability: 0.04 },
    choices: [
      {
        text: '全速撤离，能跑多远跑多远',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: -10, waterChange: -8, durabilityChange: -10, moraleChange: 5, crewChange: 0, description: '连夜掉头满帆逃亡。三天后清点损失：几块被岩浆碎屑烧穿的帆布。' },
          { probability: 0.35, goldChange: 0, foodChange: -15, waterChange: -12, durabilityChange: -20, moraleChange: -5, crewChange: -1, description: '风向不利只能顶风绕行——火山灰落满甲板，一名水手被烫伤。' },
          { probability: 0.15, goldChange: 0, foodChange: -5, waterChange: -5, durabilityChange: -5, moraleChange: -5, crewChange: 0, description: '撤离及时，几乎毫发无伤——老水手说这是海神在提醒你们。' }
        ]
      },
      {
        text: '冒险靠近，采集珍贵的硫磺',
        outcomes: [
          { probability: 0.4, goldChange: 80, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: -15, crewChange: -2, description: '顶着落石抢收了两筐硫磺——军火商那里是硬通货。', historicalNote: '硫磺是火药三大原料之一。16世纪的火山岛（如伊斯基亚）是欧洲最重要的硫磺来源。' },
          { probability: 0.3, goldChange: 40, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: -10, crewChange: -1, description: '硫磺成色一般，勉强卖出个价钱——人人一身焦臭。' },
          { probability: 0.3, goldChange: 0, foodChange: -5, waterChange: -5, moraleChange: -10, durabilityChange: -25, crewChange: -3, description: '火山二次喷发——采硫的筐和三个动作慢的水手留在了焦土上。' }
        ]
      }
    ]
  },
  {
    id: 213,
    type: 'siren',
    sceneKey: 'siren',
    title: '海妖的歌声',
    description: '黄昏，礁石群方向飘来一阵缠绵的歌声。舵手的手松了，整艘船朝礁石偏去。大副嘶吼："堵住耳朵！"',
    triggerCondition: { dangerLevelMin: 3, probability: 0.05 },
    choices: [
      {
        text: '堵耳齐航，硬闯过去',
        outcomes: [
          { probability: 0.65, goldChange: 0, foodChange: -5, waterChange: -5, moraleChange: -5, durabilityChange: 0, crewChange: 0, description: '全船用蜡封耳、蒙眼，凭罗盘一寸寸挪出礁石区——歌声在身后追了很久。' },
          { probability: 0.35, goldChange: 0, foodChange: -5, waterChange: -5, moraleChange: 10, durabilityChange: 0, crewChange: 0, description: '你的意志比歌声更硬——扯下耳塞那一刻，海风简直像天籁。' }
        ]
      },
      {
        text: '循声探索那座礁岛',
        outcomes: [
          { probability: 0.4, goldChange: 120, foodChange: 5, waterChange: 5, moraleChange: 10, durabilityChange: -5, crewChange: -2, description: '礁岛背面藏着一艘遇难船的残骸，舱室里竟有完好的财货箱——歌声你们再没听到过。' },
          { probability: 0.35, goldChange: 60, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: -10, crewChange: -4, description: '岛上一无所获，两名水手在礁洞里失踪半日——回来时反复念叨着听不懂的旋律。' },
          { probability: 0.25, goldChange: 0, foodChange: -8, waterChange: -8, moraleChange: -15, durabilityChange: -20, crewChange: -6, description: '礁石比海图上密得多——船底被划开一道长口子，返航时歌声又出现了。' }
        ]
      },
      {
        text: '鸣炮驱邪，以火制声',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: -2, waterChange: -2, moraleChange: 10, durabilityChange: -5, crewChange: 0, description: '炮声撕裂了黄昏——歌声戛然而止，只剩海鸥的尖叫。' },
          { probability: 0.4, goldChange: 0, foodChange: -2, waterChange: -2, moraleChange: 5, durabilityChange: -10, crewChange: -1, description: '炮声驱散歌声，也震松了自己的帆索——但安静的海比任何歌声都金贵。' }
        ]
      }
    ]
  },
  {
    id: 214,
    type: 'fog',
    sceneKey: 'fog',
    title: '迷雾深处',
    description: '雾来得毫无征兆，三丈之外不见海水。你命人敲钟吹号点灯——但声音像被吸走，灯光只照出一团昏黄。',
    triggerCondition: { probability: 0.09 },
    choices: [
      {
        text: '鸣号慢行，以测深锤探路',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: -5, waterChange: -5, moraleChange: -5, durabilityChange: 0, crewChange: 0, description: '你们以每小时一海里龟行，测深锤一刻钟探一次底——两天后雾散，航线只差几海里。' },
          { probability: 0.4, goldChange: 0, foodChange: -8, waterChange: -8, moraleChange: -5, durabilityChange: -5, crewChange: 0, description: '龟行付出代价——补给多耗了两天，但全船平安，这账怎么算都划算。' }
        ]
      },
      {
        text: '凭罗盘大胆穿雾',
        outcomes: [
          { probability: 0.4, goldChange: 0, foodChange: -3, waterChange: -3, moraleChange: -5, durabilityChange: -15, crewChange: -1, description: '罗盘靠得住，暗礁不是——船底被擦出长痕，一名水手抢修时摔断胳膊。' },
          { probability: 0.35, goldChange: 40, foodChange: -3, waterChange: -3, moraleChange: 5, durabilityChange: -5, crewChange: 0, description: '穿雾后撞上一艘被遗弃的轻帆船——舱里有能用的补给和工具。' },
          { probability: 0.25, goldChange: -30, foodChange: -5, waterChange: -5, moraleChange: -10, durabilityChange: -25, crewChange: -3, description: '与暗礁群擦肩而过，船尾被撕掉一块——此后没人再提"大胆"两个字。' }
        ]
      }
    ]
  },
  {
    id: 215,
    type: 'storm',
    sceneKey: 'storm',
    title: '雷霆一击',
    description: '一道闪电劈在你们的主桅上！碗口粗的桅杆从中间裂开，焦木的糊味混着雨腥味灌满全船。',
    triggerCondition: { dangerLevelMin: 2, probability: 0.04 },
    choices: [
      {
        text: '全力护住主桅',
        miniGame: 'storm',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: -3, waterChange: -3, moraleChange: 5, durabilityChange: -10, crewChange: 0, description: '备用帆布和缆绳把开裂的主桅捆成"木乃伊"——这一夜全船无人入睡。' },
          { probability: 0.3, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: 0, durabilityChange: -20, crewChange: -1, description: '加固来得及，人没来得及——一名水手被桅索抽中摔断了腿。' },
          { probability: 0.2, goldChange: 0, foodChange: -3, waterChange: -3, moraleChange: -5, durabilityChange: -5, crewChange: 0, description: '闪电劈中的是空桅——工匠宣布：换三块木板的事，虚惊一场。' }
        ]
      },
      {
        text: '弃桅保船，现场改制',
        outcomes: [
          { probability: 0.45, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: -5, durabilityChange: -15, crewChange: 0, description: '砍断焦黑的主桅改挂应急帆——速度大减，但船身轻了反而更稳。' },
          { probability: 0.35, goldChange: 0, foodChange: -3, waterChange: -3, moraleChange: -10, durabilityChange: -25, crewChange: -1, description: '弃桅时一片混乱，断裂的帆索抽倒两人——接下来只能龟速前进。' },
          { probability: 0.2, goldChange: 0, foodChange: -3, waterChange: -3, moraleChange: 5, durabilityChange: -8, crewChange: 0, description: '弃桅果断而正确——工匠甚至从焦木里抢救出几根能用的硬木。' }
        ]
      }
    ]
  },
  {
    id: 216,
    type: 'historical',
    sceneKey: 'chart',
    title: '漂流瓶的密信',
    description: '墨绿漂流瓶撞上船舷，蜜蜡封口。信上字迹急促："若拾得此信，请按附图坐标寻访南礁——愿以半数相赠。"',
    triggerCondition: { minDay: 5, probability: 0.07 },
    choices: [
      {
        text: '按坐标前往寻访',
        outcomes: [
          { probability: 0.45, goldChange: 80, foodChange: 5, waterChange: 3, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '南礁的老榕树下挖出一只锈铁盒——你按信中地址寄出了应得的一半。' },
          { probability: 0.3, goldChange: 30, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: -5, crewChange: 0, description: '坐标附近暗礁密布，只找到半只空箱子——有人捷足先登，但夹层里还有几枚金币。' },
          { probability: 0.25, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '铁盒里只有一瓶朗姆酒和一张字条："请喝了这瓶酒，就当赴了我家的约。"' }
        ]
      },
      {
        text: '将瓶子抛回海里，让它继续漂流',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 3, description: '你在瓶中塞回一张字条："信已阅，坐标已抄录，原瓶奉还。"' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -3, durabilityChange: 0, crewChange: 0, description: '水手们觉得你疯了——但你已经把坐标背下来了。' }
        ]
      }
    ]
  },
  {
    id: 217,
    type: 'historical',
    sceneKey: 'navy',
    title: '宝船队的影子',
    description: '印度洋晨雾中，一支庞大船队驶过——九桅宝船、马船与粮船，旌旗遮天。船头雕着龙头。',
    triggerCondition: { region: 'asia', minDay: 25, probability: 0.05 },
    choices: [
      {
        text: '降半帆，遥致敬意',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, fameChange: 15, description: '对方也降帆回礼——通译与你互赠礼物，你得到一方景德镇瓷盘。', historicalNote: '郑和七下西洋（1405-1433），船队规模远超半个世纪后的哥伦布。这是人类大航海史上最壮观的远航之一。' },
          { probability: 0.3, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 10, description: '致敬后各自航行——望着那支巨舰编队消失在海平线上，半晌没人说话。' }
        ]
      },
      {
        text: '尝试靠近交流',
        outcomes: [
          { probability: 0.45, goldChange: 60, foodChange: 10, waterChange: 5, moraleChange: 8, durabilityChange: 0, crewChange: 0, fameChange: 8, description: '宝船队用丝绸、瓷器和茶叶换走你的火药与朗姆酒——临别共饮一杯米酒。' },
          { probability: 0.35, goldChange: 20, foodChange: 5, waterChange: 3, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '语言不通但生意照做——几件换几件，双方都觉得自己占了便宜。' },
          { probability: 0.2, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: -5, crewChange: 0, description: '宝船队保持警戒距离，只派小艇换了淡水——他们的航程比你的野心还长。' }
        ]
      }
    ]
  },
  {
    id: 218,
    type: 'pirate',
    sceneKey: 'pirate',
    title: '黑胡子的传说',
    description: '三角帽、黑胡子、插在头发里的引信——加勒比海最恐怖的噩梦就站在对面船尾，他的船切断了你们的水路。',
    triggerCondition: { region: 'caribbean', minDay: 25, probability: 0.04 },
    choices: [
      {
        text: '传奇也是用来击败的——迎战！',
        miniGame: 'boarding',
        outcomes: [
          { probability: 0.35, goldChange: 150, foodChange: 0, waterChange: 0, moraleChange: 15, durabilityChange: -25, crewChange: -4, fameChange: 20, description: '你亲手砍断了黑胡子的旗绳——缴获的财宝装了三箱，从此海盗听到你的船名都要先问风往哪边吹。', historicalNote: '黑胡子（爱德华·蒂奇）是1718年前后最臭名昭著的海盗，最终在北卡罗来纳外海被英国海军击杀。' },
          { probability: 0.35, goldChange: 60, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: -35, crewChange: -8, fameChange: 10, description: '惨烈舷炮对轰后，黑胡子笑着退走——"今天风大，改天再收你的税"。' },
          { probability: 0.3, goldChange: -80, foodChange: -10, waterChange: -5, moraleChange: -15, durabilityChange: -45, crewChange: -10, fameChange: -5, description: '黑胡子的炮火撕开侧舷——丢下两箱货和一群伤员才逃出射程。' }
        ]
      },
      {
        text: '献上"买路钱"，破财免灾',
        outcomes: [
          { probability: 0.5, goldChange: -80, foodChange: -5, waterChange: -3, moraleChange: -10, durabilityChange: 0, crewChange: 0, fameChange: -5, description: '你亲自送上金币和朗姆——黑胡子掂着钱袋哈哈大笑，那笑声像砂纸。' },
          { probability: 0.3, goldChange: -120, foodChange: -8, waterChange: -5, moraleChange: -15, durabilityChange: -5, crewChange: -1, fameChange: -8, description: '黑胡子收了钱，又"借"走一箱货和一名舵手——"利息。"' },
          { probability: 0.2, goldChange: -50, foodChange: -3, waterChange: -2, moraleChange: -5, durabilityChange: 0, crewChange: 0, description: '五十金币加一船"故事"——黑胡子摆摆手："滚吧，讲得还不错。"' }
        ]
      },
      {
        text: '利用浅滩甩掉这艘重船',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: -8, waterChange: -5, moraleChange: 5, durabilityChange: -10, crewChange: 0, description: '你对这片浅滩了如指掌，像泥鳅一样在礁石间穿行——黑胡子的重船只能在界外跳脚。' },
          { probability: 0.35, goldChange: 0, foodChange: -12, waterChange: -8, moraleChange: -5, durabilityChange: -20, crewChange: -2, description: '暗礁比记忆中多，船底吃了两道擦伤才甩开追兵。' },
          { probability: 0.15, goldChange: -40, foodChange: -10, waterChange: -8, moraleChange: -10, durabilityChange: -30, crewChange: -3, description: '黑胡子派出小艇追击——浅滩里且战且走，丢了一箱货才摆脱。' }
        ]
      }
    ]
  },
  {
    id: 219,
    type: 'discovery',
    sceneKey: 'island',
    title: '岛民的宴席',
    description: '沙滩上忽然响起鼓声——岛民不是来战斗的，而是来"赴宴"的。他们指着你们的铁锅和刚烤好的鱼：一起吃！',
    triggerCondition: { minDay: 10, probability: 0.06 },
    choices: [
      {
        text: '入席赴宴，以酒会友',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: 20, waterChange: 10, moraleChange: 15, durabilityChange: 0, crewChange: 0, fameChange: 5, description: '你用铁锅、绳子和几枚玻璃珠换来一整场盛宴——岛民教你跳丰收舞。' },
          { probability: 0.3, goldChange: 0, foodChange: 15, waterChange: 8, moraleChange: 10, durabilityChange: 0, crewChange: 0, fameChange: 3, description: '宴席朴素但真诚——酋长把一条贝壳项链挂在你脖子上。' },
          { probability: 0.2, goldChange: 0, foodChange: 10, waterChange: 8, moraleChange: 5, durabilityChange: 0, crewChange: 2, description: '宴后两名年轻岛民执意上船"看看外面的世界"——从此船上有了一双最会爬桅杆的眼睛。' }
        ]
      },
      {
        text: '以物易物，公平交易',
        outcomes: [
          { probability: 0.55, goldChange: 40, foodChange: 10, waterChange: 5, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 5, description: '铁器、玻璃珠和小镜子是这里的硬通货——岛民拿出鱼干、椰子油和紫色染料交换。' },
          { probability: 0.3, goldChange: 20, foodChange: 8, waterChange: 5, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '交易顺利得惊人——一位会葡萄牙语的老者当中间人，临走提醒："南边有礁，走外海。"' },
          { probability: 0.15, goldChange: 60, foodChange: 12, waterChange: 5, moraleChange: 8, durabilityChange: 0, crewChange: 0, fameChange: 8, description: '你们谈成"长期供应"——老酋长给你取了个名字，意思是"守信用的海上来客"。' }
        ]
      }
    ]
  },
  {
    id: 220,
    type: 'accident',
    sceneKey: 'chart',
    title: '腐朽的船板',
    description: '船匠的敲击声越来越响。他爬上来脸色难看：三根肋材蛀空了，"再拖一个礼拜就得说再见。"',
    triggerCondition: { minDay: 12, probability: 0.05 },
    choices: [
      {
        text: '停船抢修，磨刀不误砍柴工',
        outcomes: [
          { probability: 0.55, goldChange: 0, foodChange: -5, waterChange: -5, moraleChange: 5, durabilityChange: 15, crewChange: 0, description: '两天停船全员上工：换麻絮、补船板、加固肋材——船匠说"老伙计还能再撑三年"。' },
          { probability: 0.3, goldChange: 0, foodChange: -8, waterChange: -8, moraleChange: -5, durabilityChange: 8, crewChange: 0, description: '备用木材不够，只好拆掉一只旧水箱——修好了，但工期拖了一天，补给见底。' },
          { probability: 0.15, goldChange: 0, foodChange: -5, waterChange: -5, moraleChange: 0, durabilityChange: 20, crewChange: 0, description: '船匠索性把该换的都换了，还顺手改良了舵轮轴承——因祸得福。' }
        ]
      },
      {
        text: '带伤赶路，到港再修',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: -3, waterChange: -3, moraleChange: -5, durabilityChange: -10, crewChange: 0, description: '麻絮和沥青塞进船板缝继续赶路——每一道浪都让人心头一紧，但船撑住了。' },
          { probability: 0.3, goldChange: 0, foodChange: -3, waterChange: -3, moraleChange: -5, durabilityChange: -5, crewChange: 0, description: '有惊无险。临时修补像创可贴——进港那天，船匠抱着船身亲了一口。' },
          { probability: 0.2, goldChange: -20, foodChange: -5, waterChange: -5, moraleChange: -10, durabilityChange: -20, crewChange: -1, description: '半路上一块船板彻底崩开——被迫荒滩搁浅抢修，一名水手扭伤了腰。' }
        ]
      }
    ]
  },
  {
    id: 221,
    type: 'historical',
    sceneKey: 'navy',
    title: '无敌舰队的余晖',
    description: '英吉利海峡漂浮着碎船板和半沉的甲板，远处几艘缺帆的盖伦船正在下沉——你们只赶上大海收拾战场。',
    triggerCondition: { region: 'europe', minDay: 30, probability: 0.05 },
    choices: [
      {
        text: '打捞漂流物，发一笔"战争财"',
        outcomes: [
          { probability: 0.5, goldChange: 120, foodChange: 5, waterChange: 3, moraleChange: -5, durabilityChange: 0, crewChange: 0, description: '酒桶、铜钉、还能用的帆布——捞了个盆满钵满。只是没人说话了。', historicalNote: '1588年，西班牙无敌舰队在英吉利海峡惨败于英格兰，130艘战舰只有一半返回西班牙。此战标志着西班牙海上霸权开始衰落。' },
          { probability: 0.3, goldChange: 60, foodChange: 3, waterChange: 3, moraleChange: -5, durabilityChange: -5, crewChange: 0, description: '捞到的东西有限，海雾里还撞见一艘半沉的船影——水手们画着十字加快动作。' },
          { probability: 0.2, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, fameChange: 10, description: '你们什么也没捞，只在海面放下了一只花圈——老水手说大海认得敬畏它的人。' }        ]
      },
      {
        text: '记录战场位置与洋流，情报比黄金贵',
        outcomes: [
          { probability: 0.6, goldChange: 20, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 12, description: '领航员连夜绘制战场海图：沉船坐标、洋流、风向——里斯本商人专程来买副本。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, fameChange: 8, description: '你站在船尾看了很久——航海日志里从此多了一页谁也抢不走的注脚。' }
        ]
      }
    ]
  },
  /* ================================================================
   * 第二条线：派系声望事件（王室的密令、学者的委托、兄弟会的请柬、通缉令、商会仲裁）
   * ================================================================ */
  {
    id: 230,
    type: 'faction',
    sceneKey: 'navy',
    title: '王室的密令',
    description: '塞维利亚宫务官递来火漆羊皮筒——国王要你把密函送到里斯本，期限十四天。擅启者，绞。',
    triggerCondition: { factionMin: { crown: 30 }, minDay: 15, probability: 0.10 },
    choices: [
      {
        text: '接下密令，日夜兼程',
        outcomes: [
          { probability: 0.6, goldChange: 200, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, fameChange: 5, factionChange: { crown: 15 }, description: '第十三天清晨里斯本塔影出现在海平线上——火漆完好，宫务官用红笔记下你的名字。' },
          { probability: 0.4, goldChange: 50, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, fameChange: 2, factionChange: { crown: 8 }, description: '一场无名风暴耽误三天——火漆终究没破，但狼狈的样子也被记住了。' },
        ],
      },
      {
        text: '婉拒：你的船不做王室的影子',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, factionChange: { crown: -10, brethren: 5 }, description: '宫务官的脸沉了下来。当夜酒馆里多了几个"打听你航线"的生面孔。' },
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, factionChange: { crown: -5 }, description: '你推说舱位已满、航期已定——宫务官笑了笑，那笑容让你后半程都没睡好。' },
        ],
      },
      {
        text: '私拆密函，看完再决定',
        outcomes: [
          { probability: 0.5, goldChange: 150, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, notoriety: { secret: 1 }, factionChange: { crown: -5 }, description: '你焐开火漆，用铜片压出暗记——有些知识，看见了就回不去了。' },
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, factionChange: { crown: -12 }, description: '火漆里有防拆暗线——你骗过了所有人，除了镜子里那个不敢直视自己的船长。' },
        ],
      },
    ],
  },
  {
    id: 231,
    type: 'faction',
    sceneKey: 'chart',
    title: '学者的委托',
    description: '里斯本的学者公会托人带来一只檀木盒：三百金币，换南方航线上一种"羽纹会随星图转动"的鸟的标本。',
    triggerCondition: { factionMin: { scholars: 30 }, minDay: 20, probability: 0.09 },
    choices: [
      {
        text: '接下委托，去南方航线找它',
        outcomes: [
          { probability: 0.5, goldChange: 300, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, fameChange: 5, factionChange: { scholars: 12 }, description: '合恩角外一座无名孤岛上找到了那种鸟——你的名字写进了学会答辩的附录。' },
          { probability: 0.3, goldChange: 100, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, factionChange: { scholars: 6 }, description: '鸟没找到，但带回一册潮汐笔记和一串珊瑚标本——"否证也是发现。"' },
          { probability: 0.2, goldChange: 50, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, factionChange: { scholars: 3 }, description: '标本被盐雾蚀坏了羽纹——"海上的事，本来就没有几次圆满。"' },
        ],
      },
      {
        text: '只收定金，把星图卖给出价更高的人',
        outcomes: [
          { probability: 0.6, goldChange: 250, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, notoriety: { secret: 1 }, factionChange: { scholars: -10, brethren: 5 }, description: '买家数金币时压低声音问："还有没有？"——那半张星图从此有了两个主人。' },
          { probability: 0.4, goldChange: 120, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, factionChange: { scholars: -5 }, description: '此后三年再没人向你托付檀木盒——知识的世界，记性比商界好。' },
        ],
      },
      {
        text: '分文不取，连星图一起送回去',
        outcomes: [
          { probability: 1.0, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 10, factionChange: { scholars: 15 }, notoriety: { mercy: 1 }, description: '老学者用羽毛笔在航海日志扉页上写了一句："海图会骗人，风骨不会。"' },
        ],
      },
    ],
  },
  {
    id: 232,
    type: 'faction',
    sceneKey: 'festival',
    title: '兄弟会的请柬',
    description: '皇家港沙滩上搭起篝火，独眼龙们举着朗姆酒碗喊："黑旗请客！"你的名字上了兄弟会的宾客册。',
    triggerCondition: { factionMin: { brethren: 30 }, minDay: 20, probability: 0.09 },
    choices: [
      {
        text: '入席，听他们谈下一票',
        outcomes: [
          { probability: 0.5, goldChange: 250, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, notoriety: { bold: 1 }, factionChange: { brethren: 15, crown: -5 }, description: '一场"丰收"：三艘商船，一个晚上，没有一个人受伤。' },
          { probability: 0.3, goldChange: 80, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: -10, crewChange: 0, factionChange: { brethren: 10 }, description: '巡夜的双桅船撞见了你们——逃是逃掉了，龙骨记下了这一夜。' },
          { probability: 0.2, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -10, durabilityChange: 0, crewChange: 0, factionChange: { brethren: 5 }, description: '官府闻风而至，你们空手而散——篝火被踩灭时没人敢回头看。' },
        ],
      },
      {
        text: '只喝酒，不谈买卖',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, factionChange: { brethren: 8 }, description: '你在角落里跟一个老海盗聊了一夜风向——"干净的船，走不远，但走得久。"' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, factionChange: { brethren: -5 }, description: '兄弟会敬酒，你不接招——黑旗的世界里，客气就是疏远。' },
        ],
      },
      {
        text: '向官府告密这场宴会',
        outcomes: [
          { probability: 0.6, goldChange: 300, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, factionChange: { crown: 15, brethren: -20 }, description: '王室按缴获的三成赏你——领赏那天，有人朝你的背影啐了一口。' },
          { probability: 0.4, goldChange: 100, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, factionChange: { crown: 8, brethren: -15 }, description: '突袭扑空，有人提前透了风——从此你不再单独上岸。' },
        ],
      },
    ],
  },
  {
    id: 233,
    type: 'faction',
    sceneKey: 'pirate',
    title: '通缉令',
    description: '告示柱上贴出你的画像：悬赏五百金币，"活捉或击毙"。画师没见过你——有人给画像添了顶滑稽的帽子。',
    triggerCondition: { factionMax: { crown: -30 }, minDay: 25, probability: 0.15 },
    choices: [
      {
        text: '交罚金，谋求和解',
        outcomes: [
          { probability: 0.6, goldChange: -300, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, factionChange: { crown: 20 }, description: '宫务官数着金币，指尖在桌面上敲了三下——告示当晚就被石灰覆盖。' },
          { probability: 0.4, goldChange: -300, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, factionChange: { crown: 10 }, description: '罚金收下了，通缉照旧——王室的账可以算清，王室的记性不行。' },
        ],
      },
      {
        text: '继续走货，把通缉令当招牌',
        outcomes: [
          { probability: 0.5, goldChange: 400, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, notoriety: { bold: 1 }, factionChange: { brethren: 10, crown: -5 }, description: '通缉令成了最好的广告——码头上开始有人喊你"那个值五百块的人"。' },
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: -20, crewChange: -3, factionChange: { crown: -10 }, description: '一艘缉私船咬住了你——炮战后三个水手挂了彩，但货舱里的东西一件没少。' },
        ],
      },
      {
        text: '戴假发上岸，亲手撕了告示',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, notoriety: { secret: 1 }, factionChange: { crown: 5 }, description: '没人认出那个往告示上抹浆糊的驼背老头——第二天全港都在传：通缉令被鬼撕了。' },
          { probability: 0.5, goldChange: -100, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, factionChange: { crown: -8 }, description: '浆糊是假的，胡子是假的，赏金猎人的眼睛是真的——你破财消灾，连夜换了泊位。' },
        ],
      },
    ],
  },
  {
    id: 234,
    type: 'faction',
    sceneKey: 'tavern',
    title: '商会的仲裁',
    description: '两艘商船的船长在酒馆里为你争执：一舱丝绸，一舱火药，都要抢同一艘货船的舱位。阿姆斯特丹行商会请你仲裁。',
    triggerCondition: { minDay: 25, probability: 0.08 },
    choices: [
      {
        text: '按行规裁：先订舱先得',
        outcomes: [
          { probability: 0.7, goldChange: 80, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, factionChange: { guild: 10 }, description: '双方心服口服。仲裁书抄送三地行会——从此行商的船看见你的旗，都会鸣笛致意。' },
          { probability: 0.3, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, factionChange: { guild: -5 }, description: '输的那方摔了杯子。行规是行规，人心是人心——这一条你裁得对，却裁得没人情。' },
        ],
      },
      {
        text: '裁给更急需的一方：让火药船先走',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 8, notoriety: { mercy: 1 }, factionChange: { guild: 8 }, description: '老船长脱帽向你鞠躬。后来你的船在风暴里收到他的信号灯：三短三长三短，左满舵，前方暗礁。' },
          { probability: 0.4, goldChange: 50, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, factionChange: { guild: -3 }, description: '另一方骂骂咧咧地走了。行商的世界里，人情不像账目那样一笔一笔算得清。' },
        ],
      },
      {
        text: '两头收仲裁费，再两头卖好',
        outcomes: [
          { probability: 0.6, goldChange: 200, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, notoriety: { secret: 1 }, factionChange: { guild: -2 }, description: '两份"公正"的裁定书，墨迹未干，两袋金币已进铜箱——只是行商酒桌上开始有人打听它的来历。' },
          { probability: 0.4, goldChange: 80, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, factionChange: { guild: -10 }, description: '行规第三十七条：仲裁舞弊者，除名。三地行会同时把你的名字从宾客册上划了去。' },
        ],
      },
    ],
  },

  /* ================================================================
   * 第二条线：名船员个人事件（每个人都有自己的过去）
   * ================================================================ */
  {
    id: 235,
    type: 'crew',
    sceneKey: 'tavern',
    title: '老汤姆的旧账',
    description: '拿骚酒馆里，穿军服的瘦子盯着老汤姆看，然后出门——普利茅斯军需官，二十年前"借"走的火药还挂在海军黑账上。',
    triggerCondition: { requiresCrew: ['boatswain'], minDay: 15, probability: 0.12 },
    choices: [
      {
        text: '替汤姆了结：替他连本带利还上',
        outcomes: [
          { probability: 0.7, goldChange: -150, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'boatswain', loyaltyChange: 25 }, description: '汤姆把那张欠条折成一只小船，放进海里。从此他守你的后舱像守自己的家门。' },
          { probability: 0.3, goldChange: -150, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'boatswain', loyaltyChange: 15 }, description: '钱收下了，军需官也收下了。旧账清了，旧伤还在——汤姆的背从此更驼了一点，话更少了一点。' },
        ],
      },
      {
        text: '让汤姆自己面对',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'boatswain', loyaltyChange: 10 }, description: '他们在后舱谈了一夜。清晨汤姆红着眼说："船长，账还在，人没跑。"' },
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'boatswain', loyaltyChange: -20 }, description: '汤姆三天没有说话。有些信任，你选择不伸手，他就当你在袖手。' },
        ],
      },
      {
        text: '送汤姆上岸避一阵风头',
        outcomes: [
          { probability: 1.0, goldChange: -50, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'boatswain', loyaltyChange: 20 }, description: '你在下一个港口把他接上船。他带回一袋普利茅斯的腌鲱鱼，和一句"算我看对了人"。' },
        ],
      },
    ],
  },
  {
    id: 236,
    type: 'crew',
    sceneKey: 'pirate',
    title: '独眼玛格的仇人',
    description: '追击者的旗号玛格一眼就认出来了——“红发”拉斐尔。十年前在皇家港炮台上，她丢了一只左眼，他丢了一只右耳。',
    triggerCondition: { requiresCrew: ['gunner'], minDay: 20, probability: 0.10 },
    choices: [
      {
        text: '掉头迎战：她的仇，也是全船的仇',
        miniGame: 'cannon',
        outcomes: [
          { probability: 0.6, goldChange: 180, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'gunner', loyaltyChange: 30 }, factionChange: { crown: 6, brethren: -8 }, description: '三轮齐射之后，拉斐尔的船降了旗。玛格亲手接收了俘虏——她的炮位从此没人再敢质疑。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: -15, crewChange: 0, crewEvent: { member: 'gunner', loyaltyChange: 15 }, factionChange: { crown: 3, brethren: -5 }, description: '拉斐尔跑了，跑前朝玛格甲板扔了一只血淋淋的耳朵。她大笑着挂帆——只有你知道，她回舱后吐了。' },
        ],
      },
      {
        text: '避战：全速脱离',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'gunner', loyaltyChange: -10 }, description: '玛格盯着罗盘一言不发。追兵没讨到便宜，但她的沉默压得整舱发闷。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'gunner', loyaltyChange: -5 }, description: '她半夜独自擦炮。"跑得掉船，跑不掉名声。"她这么解释自己的失眠。' },
        ],
      },
      {
        text: '替她传话：问问能不能化敌为友',
        outcomes: [
          { probability: 0.5, goldChange: 100, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'gunner', loyaltyChange: 20 }, description: '拉斐尔回赠了一只酒杯。下一次风暴里，你的船收到过他的信号："左满舵，暗礁。"' },
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'gunner', loyaltyChange: -15 }, description: '拉斐尔的回信只有四个字："不死不休。"玛格读完把信烧了，炮位擦了三天。' },
        ],
      },
    ],
  },
  {
    id: 237,
    type: 'crew',
    sceneKey: 'smuggle',
    title: '小王的亏空',
    description: '月底盘账，铜箱少了四十金币。小王的名字签得端端正正——数字字迹都对得上，只有他解释不清那个夜晚。',
    triggerCondition: { requiresCrew: ['purser'], minDay: 18, probability: 0.10 },
    choices: [
      {
        text: '当面质问，给他解释的机会',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'purser', loyaltyChange: 15 }, description: '小王的眼泪在眶里转了三圈没有掉下来："给我三天。"' },
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'purser', loyaltyChange: -20 }, description: '他攥着拳头说不出话。有些羞辱，比冤枉更难咽下去。' },
        ],
      },
      {
        text: '暗中查他的行囊',
        outcomes: [
          { probability: 0.5, goldChange: 40, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, notoriety: { secret: 1 }, crewEvent: { member: 'purser', loyaltyChange: -10 }, description: '铜箱夹层里躺着四十金币——连本带息。他把"保管费"算得清楚，就是没算过你要来查。' },
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'purser', loyaltyChange: -25 }, description: '你什么都没查到，只查到自己在门外的脚印。信任这种东西，查过一次就薄了一层。' },
        ],
      },
      {
        text: '把亏空记在自己账上，什么都不问',
        outcomes: [
          { probability: 0.6, goldChange: -40, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, notoriety: { mercy: 1 }, crewEvent: { member: 'purser', loyaltyChange: 35 }, description: '三天后他带回六十金币和一封家信："先母的药钱。"你的账上从此有了另一种算法——人心的复利。' },
          { probability: 0.4, goldChange: -40, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'purser', loyaltyChange: 20 }, description: '他后来成了全船最较真的人——对自己的账，一笔不饶。' },
        ],
      },
    ],
  },
  {
    id: 238,
    type: 'crew',
    sceneKey: 'island',
    title: '伊莲的求证',
    description: '伊莲摊开星图：一座没人标名的珊瑚岛，传说有"会自己长出纹路的木头"。绕三天——淡水只够单程。',
    triggerCondition: { requiresCrew: ['scholar'], minDay: 20, probability: 0.10 },
    choices: [
      {
        text: '拨给她三天粮水：学问值得绕路',
        outcomes: [
          { probability: 0.5, goldChange: 150, foodChange: -10, waterChange: -10, moraleChange: 0, durabilityChange: 0, crewChange: 0, fameChange: 8, crewEvent: { member: 'scholar', loyaltyChange: 30 }, factionChange: { scholars: 10 }, description: '带回的木块纹路与星图暗合。里斯本的学会为它专门开了一场辩论，你的船名出现在致谢名单里。' },
          { probability: 0.3, goldChange: 0, foodChange: -10, waterChange: -10, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'scholar', loyaltyChange: 15 }, factionChange: { scholars: 5 }, description: '岛找到了，木头没找到。她在航海日志上画下岛形，标注：留待后人。' },
          { probability: 0.2, goldChange: 0, foodChange: -15, waterChange: -10, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'scholar', loyaltyChange: 10 }, description: '空手而归还赶上了顶头风。伊莲抱着湿透的笔记道歉——你递给她一杯热汤。' },
        ],
      },
      {
        text: '拒绝：舰队不为一张星图改道',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'scholar', loyaltyChange: -10 }, description: '她默默卷起星图。夜里舱板下传来翻来覆去的声音，持续了三天。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'scholar', loyaltyChange: 5 }, description: '"合理的决定。"她说，然后真的不再提——这种明理，反而更让你不安。' },
        ],
      },
      {
        text: '提议：返程时再来',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'scholar', loyaltyChange: 20 }, description: '她把星图折好收进胸前："这句话，我记在航海日志的第一页。"' },
          { probability: 0.3, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'scholar', loyaltyChange: -5 }, description: '"船长的『以后』，是海上最不可靠的风向。"她把这句话也说进了日志。' },
        ],
      },
    ],
  },
  {
    id: 239,
    type: 'crew',
    sceneKey: 'festival',
    title: '胖厨子班的配方',
    description: '班在厨房门口堵住了你：想买一小袋藏红花和锡兰肉桂，"给弟兄们做一顿不一样的"。价钱够他半年工钱。',
    triggerCondition: { requiresCrew: ['cook'], minDay: 15, probability: 0.10 },
    choices: [
      {
        text: '自掏腰包满足他',
        outcomes: [
          { probability: 0.7, goldChange: -60, foodChange: 5, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'cook', loyaltyChange: 30 }, description: '那晚全船吃到了一顿有香料的炖肉。三年后，还有人在酒馆里提起那个味道。' },
          { probability: 0.3, goldChange: -60, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'cook', loyaltyChange: 20 }, description: '香料买到假的。班气得剁了两天砧板，骂遍了整条街的奸商。' },
        ],
      },
      {
        text: '让他从公共账户走账',
        outcomes: [
          { probability: 0.6, goldChange: -60, foodChange: 5, waterChange: 0, moraleChange: 3, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'cook', loyaltyChange: 15 }, description: '班在账簿上工工整整写下四个字：船员福祉。管账的小王看了你一眼，什么也没说。' },
          { probability: 0.4, goldChange: -60, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'cook', loyaltyChange: -5 }, description: '公共账户动了一次，就会有人问第二次。班从此再没提过配方的事。' },
        ],
      },
      {
        text: '拒绝：舰上不养嘴馋的人',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -3, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'cook', loyaltyChange: -15 }, description: '班耸耸肩回了厨房。第二天的咸肉照旧，只是餐桌上没人说笑了。' },
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 2, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'cook', loyaltyChange: 5 }, description: '他把罐头里最后一点糖留给了发烧的学徒——"配方可以等，人不能。"' },
        ],
      },
    ],
  },
  {
    id: 240,
    type: 'crew',
    sceneKey: 'chart',
    title: '少爷的家信',
    description: '里斯本驿站转来布列塔尼家信：婚期定在明年春天，男方是当地最老的港务长官。信末一行小字：你的海角命名权，家里不承认。',
    triggerCondition: { requiresCrew: ['midshipman'], minDay: 18, probability: 0.10 },
    choices: [
      {
        text: '帮他写信回绝这门婚事',
        outcomes: [
          { probability: 0.6, goldChange: -20, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 5, crewEvent: { member: 'midshipman', loyaltyChange: 30 }, description: '他念你的信念了三遍，叠好收进贴身的袋子。此后每一次值夜，他都站得格外直。' },
          { probability: 0.4, goldChange: -20, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'midshipman', loyaltyChange: 20 }, description: '信寄出后他闷了一天，然后在晨祷时把腰板挺得笔直——像在参加一场一个人的授勋。' },
        ],
      },
      {
        text: '劝他回去完成婚约',
        outcomes: [
          { probability: 0.5, goldChange: 100, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'midshipman', loyaltyChange: -10 }, description: '他把怀表留给你："等我想通的那天。"——第二天清晨，他还是站在了老位置上。' },
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'midshipman', loyaltyChange: -25 }, description: '他把自己关在舱里三天。出来时胡子拉碴，眼睛里的火换成了冰。' },
        ],
      },
      {
        text: '把家信折成纸船，让他自己选',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 3, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'midshipman', loyaltyChange: 25 }, description: '他盯着纸船漂远，忽然笑了："我家那套，本来就不是海。"' },
          { probability: 0.3, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'midshipman', loyaltyChange: -5 }, description: '他把纸船捞了回来，收进贴身的袋子里——有些岸，是折不断的。' },
        ],
      },
    ],
  },
  {
    id: 241,
    type: 'crew',
    sceneKey: 'smuggle',
    title: '胡安的老关系',
    description: '托尔图加的雾夜里，一条小舢板靠上你的船。船上是胡安全——当年一起挂黑旗的老弟兄，只求借船号一用。',
    triggerCondition: { requiresCrew: ['corsair'], minDay: 20, probability: 0.10 },
    choices: [
      {
        text: '借旗：让你的船号引开缉私船',
        outcomes: [
          { probability: 0.6, goldChange: 250, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'corsair', loyaltyChange: 30 }, factionChange: { brethren: 12, crown: -8 }, description: '缉私船追了你半晚。胡安的老弟兄们在湾里举杯，敬你的尾流。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: -10, crewChange: 0, crewEvent: { member: 'corsair', loyaltyChange: 15 }, factionChange: { brethren: 8, crown: -5 }, description: '追兵没全信，还是撵了上来。摆脱时船身被流弹吻了一口，胡安骂了句"值了"。' },
        ],
      },
      {
        text: '拒绝：你的船号不借人',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'corsair', loyaltyChange: -10 }, description: '胡安没劝你，只说了句"当年我也这么说"——听不出是夸还是贬。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'corsair', loyaltyChange: 5 }, description: '舢板消失在雾里。第二天听说湾里那条船被抄了，人吊在了桅杆上。' },
        ],
      },
      {
        text: '收钱，替他们跑一趟"快递"',
        outcomes: [
          { probability: 0.5, goldChange: 350, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, notoriety: { secret: 1 }, factionChange: { brethren: 10, crown: -12 }, crewEvent: { member: 'corsair', loyaltyChange: 20 }, description: '三箱"不受海关欢迎的货"半夜上了你的船。金币分量很实在——胡安第一次称你"自己人"。' },
          { probability: 0.5, goldChange: 150, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, factionChange: { brethren: 5, crown: -6 }, crewEvent: { member: 'corsair', loyaltyChange: 10 }, description: '缉私船登临检查。你把货沉进了海底——这一晚，鱼都吃了顿好的。' },
        ],
      },
    ],
  },
  {
    id: 242,
    type: 'crew',
    sceneKey: 'ghostship',
    title: '神甫的告解',
    description: '费尔南神甫晨祷后留住你："他们不是怕死，是怕死了没人知道。"舱底有人传：航线尽头有艘专收心里有愧的人的船。',
    triggerCondition: { requiresCrew: ['chaplain'], minDay: 15, probability: 0.12 },
    choices: [
      {
        text: '当众辟谣：摊开罗盘与海图',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'chaplain', loyaltyChange: 20 }, description: '你摊开海图讲了两个钟头。散场时，那个哭过的学徒抬头看了你一眼——那一眼比任何祷告都管用。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 2, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'chaplain', loyaltyChange: 10 }, description: '辟谣了一半。另一半谣言在厨房里活了下来——海上的事，向来辟不干净。' },
        ],
      },
      {
        text: '私下找传谣的人谈谈',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 3, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'chaplain', loyaltyChange: 15 }, description: '传谣的是个想家的十七岁小子。你答应他到了下一港替他寄家信——谣言当晚就止了。' },
          { probability: 0.3, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 2, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'chaplain', loyaltyChange: 5 }, description: '他哭着说了实话：他怕的不是鬼，是信里那句"父病重"。' },
        ],
      },
      {
        text: '办一次集体的告解',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 8, durabilityChange: 0, crewChange: 0, crewEvent: { member: 'chaplain', loyaltyChange: 30 }, description: '那晚全船的人排着队进舱室。出来的时候，每个人的脚步都轻了半寸。' },
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 3, crewEvent: { member: 'chaplain', loyaltyChange: 20 }, description: '有个老水手把藏了十年的罪说了出来。神甫说："大海会替他保守。"' },
        ],
      },
    ],
  },

  /* ================================================================
   * 第二条线：身份抉择（残酷/仁慈/贪婪/鲁猛/守秘——你是哪种船长）
   * ================================================================ */
  {
    id: 243,
    type: 'reckoning',
    sceneKey: 'pirate',
    title: '俘虏的处置',
    description: '一场短促的交战后，你们俘了三个海盗。按惯例该绞死或卖作奴隶；按新颁的教宗法令，他们是"可以悔改的罪人"。',
    triggerCondition: { minDay: 12, probability: 0.07 },
    choices: [
      {
        text: '按惯例处决',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, notoriety: { cruel: 2 }, factionChange: { crown: 5 }, description: '甲板上安静得能听见绳结响动。此后再没人敢在你的船上造次——关于你的传闻，比绞索传得更快。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, notoriety: { cruel: 2 }, description: '有人当场吐了。你维持着站姿，直到绞索停止晃动、帆影消失在海平线下。' },
        ],
      },
      {
        text: '收编为船员：海上缺人手',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 3, notoriety: { bold: 1 }, factionChange: { brethren: 8 }, description: '三个海盗换三把刀。其中一人后来替你挡了一枚流弹——他没说为什么，你也没问。' },
          { probability: 0.3, goldChange: 80, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, notoriety: { bold: 1 }, factionChange: { brethren: 5 }, description: '赎金很快寄到，金币叮当作响。人心却比金币慢——花了两年才认你。' },
          { probability: 0.2, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: -2, notoriety: { bold: 1 }, description: '半夜他们摸向了小艇。你鸣枪示警，权当送别——海不养叛徒，也不喂回头草。' },
        ],
      },
      {
        text: '释放：给他们一条小艇和半袋淡水',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 10, notoriety: { mercy: 2 }, description: '两年后，一艘遇险的商船在暴风里救起了你。船主正是当年小艇上的少年——他认出了你的旗。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, fameChange: 5, notoriety: { mercy: 2 }, description: '他们中活下来的人，从此见了你的旗就鸣笛——是问候，不是警报。' },
        ],
      },
    ],
  },
  {
    id: 244,
    type: 'reckoning',
    sceneKey: 'treasure',
    title: '意外之财',
    description: '风暴过后，海滩上滚着一只未知商船的箱子：两百金币、一袋陌生种子、一本文字古怪的账册。四下无船，无人认领。',
    triggerCondition: { minDay: 12, probability: 0.07 },
    choices: [
      {
        text: '按海规：船员均分一份、船上一份、报港一份',
        outcomes: [
          { probability: 0.6, goldChange: 65, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 5, factionChange: { crown: 5, guild: 3 }, description: '港务官在收据上按了印，船员们分了金。你的名声比金币涨得快——海规不是束缚，是口碑。' },
          { probability: 0.4, goldChange: 65, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, fameChange: 3, description: '报港被登了记，归属却"待查"。账册你留了副本——那才是真正值钱的东西。' },
        ],
      },
      {
        text: '私吞：无船无据，天知地知',
        outcomes: [
          { probability: 0.6, goldChange: 200, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, notoriety: { greed: 2 }, factionChange: { crown: -5 }, description: '箱子进了你的床底。此后每次港务官上船，你的心跳都快半拍——金子有重量，秘密也有。' },
          { probability: 0.4, goldChange: 100, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, notoriety: { greed: 2 }, description: '只拿走了金币。种子和账册你烧了——火光照出同舱人复杂的眼神。' },
        ],
      },
      {
        text: '用这笔钱给船员添过冬物资',
        outcomes: [
          { probability: 0.7, goldChange: -100, foodChange: 0, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, notoriety: { mercy: 2 }, description: '呢子、朗姆酒、新绳。冬天来的时候，全船没有一个人冻掉手指——这是比金币更保值的投资。' },
          { probability: 0.3, goldChange: -100, foodChange: 0, waterChange: 0, moraleChange: 8, durabilityChange: 0, crewChange: 0, notoriety: { mercy: 1 }, description: '物资买贵了。班气得跳脚，骂完还是把账记得一笔不差。' },
        ],
      },
    ],
  },
  {
    id: 245,
    type: 'reckoning',
    sceneKey: 'fog',
    title: '抄近路的诱惑',
    description: '老领航员指着海图上一片雾灰三角区：穿过去能省四天，但"进去的船，一半改道，一半改命"。粮水只够绕行十五天。',
    triggerCondition: { minDay: 12, probability: 0.07 },
    choices: [
      {
        text: '穿雾区：四天值得一赌',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: -10, waterChange: -10, moraleChange: -5, durabilityChange: 0, crewChange: 0, notoriety: { bold: 2 }, description: '第四天清晨，你们冲出雾墙。全船像从另一个世界回来——省下的四天，后来被讲成了四十天。' },
          { probability: 0.3, goldChange: 0, foodChange: -5, waterChange: -5, moraleChange: -5, durabilityChange: -15, crewChange: 0, notoriety: { bold: 2 }, description: '雾里撞了暗礁，船底裂缝用帆布塞住。你连夜抽水，天亮时手指泡得像熟透的枣。' },
          { probability: 0.2, goldChange: 0, foodChange: -20, waterChange: -10, moraleChange: -10, durabilityChange: 0, crewChange: -5, notoriety: { bold: 1, cruel: 1 }, description: '出来时少了五个人。没人问他们去了哪——雾里的事，不问。' },
        ],
      },
      {
        text: '绕远路：十五天就十五天',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: -15, waterChange: -15, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '你在舱壁上每天划一道。划到第十三道，海平线上出现熟悉的塔影——全船欢呼得像发现新大陆。' },
          { probability: 0.4, goldChange: 0, foodChange: -15, waterChange: -15, moraleChange: 3, durabilityChange: 0, crewChange: 0, description: '途中补给见底那两天，班把定量又减了三成。没人抱怨——选择是你做的。' },
        ],
      },
      {
        text: '派小艇探路，大船在雾外等',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: -8, waterChange: -8, moraleChange: 0, durabilityChange: 0, crewChange: 0, notoriety: { mercy: 1 }, description: '小艇带回了一句："能走，跟紧。"——省下的时间，没有一个人沾血。' },
          { probability: 0.4, goldChange: 0, foodChange: -12, waterChange: -12, moraleChange: -3, durabilityChange: 0, crewChange: 0, notoriety: { mercy: 1 }, description: '小艇回来了，探路的三个却发起高热。神甫整夜没睡，你把朗姆酒煮成了热汤。' },
        ],
      },
    ],
  },
  {
    id: 246,
    type: 'reckoning',
    sceneKey: 'chart',
    title: '发现物的归属',
    description: '无名礁石群里捞起一只密封铜匣：一卷异邦文字的海图，一枚看不出年号的印章。行商说值千金，宫务官说归王室。',
    triggerCondition: { minDay: 12, probability: 0.07 },
    choices: [
      {
        text: '献给王室',
        outcomes: [
          { probability: 0.6, goldChange: 300, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, fameChange: 15, notoriety: { bold: 1 }, factionChange: { crown: 15, scholars: 5 }, description: '国王的司库按"三等发现"赏你，铜匣进了塞维利亚皇家陈列室。玻璃柜的铭牌上，刻着你的船名。' },
          { probability: 0.4, goldChange: 150, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, fameChange: 10, notoriety: { bold: 1 }, factionChange: { crown: 10 }, description: '司库挑了三次刺，赏金比你预期少三成。印章倒是被夸了一句："纹样罕见。"' },
        ],
      },
      {
        text: '卖给行商，钱货两讫',
        outcomes: [
          { probability: 0.6, goldChange: 600, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, notoriety: { greed: 1 }, factionChange: { guild: 10 }, description: '行商数钱时手在抖："这一船货，够我退休。"——你数得比他稳。' },
          { probability: 0.4, goldChange: 400, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, notoriety: { greed: 1 }, factionChange: { guild: 5 }, description: '压价压了三分之一。你认了——海上的现钱，不比岸上值钱。' },
        ],
      },
      {
        text: '献给学者公会，只求一份副本',
        outcomes: [
          { probability: 0.6, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, fameChange: 12, notoriety: { mercy: 1 }, factionChange: { scholars: 18 }, description: '公会为你单开了一场"发现讲座"。副本海图的背面，有老学者赠你的四个字：知海者寿。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, fameChange: 8, notoriety: { mercy: 1 }, factionChange: { scholars: 12 }, description: '副本抄到一半，墨水被一阵穿堂风打翻——有些学问，本来就带点残缺。' },
        ],
      },
    ],
  },
]
