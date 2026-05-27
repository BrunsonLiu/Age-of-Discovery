import { GameEvent } from '@/types'

export const events: GameEvent[] = [
  /* ============ 正面事件 ============ */
  {
    id: 101,
    type: 'discovery',
    title: '顺风而行',
    description: '一阵强劲而平稳的信风从后方吹来，帆布饱满如满月。水手长兴奋地报告——这是航海者梦寐以求的完美风向！船只在浪尖上轻盈滑行，舷边飞溅的浪花在阳光下折射出彩虹。',
    triggerCondition: { probability: 0.18 },
    choices: [
      {
        text: '满帆借风，全速前进',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: -2, waterChange: -1, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '信风推动船只在海面上飞驰，速度之快让水手们欢呼雀跃。航线进度大幅提前，远超预期。老水手说这是海神在眷顾你们。' },
          { probability: 0.3, goldChange: 0, foodChange: -1, waterChange: 0, moraleChange: 10, durabilityChange: -3, crewChange: 0, description: '满帆航行让船只轻微晃动，但总体非常顺利。水手们在甲板上唱歌跳舞，士气高涨，这段航程将成为愉快的回忆。' }
        ]
      },
      {
        text: '保持航速，趁机修补船帆',
        outcomes: [
          { probability: 0.8, goldChange: 0, foodChange: -2, waterChange: -1, moraleChange: 8, durabilityChange: 5, crewChange: 0, description: '利用平稳的航行窗口，工匠们修补了几处帆布磨损和绳索老化。船只状态比出发时更好了，船员们为未雨绸缪的智慧感到安心。' },
          { probability: 0.2, goldChange: 0, foodChange: -3, waterChange: -2, moraleChange: 5, durabilityChange: 3, crewChange: 0, description: '修补工作消耗了些许时间，但成效显著。船帆焕然一新，只是多消耗了一点补给。' }
        ]
      }
    ]
  },
  {
    id: 102,
    type: 'discovery',
    title: '海豚护航',
    description: '成群的银白色海豚从船首跃出水面，在船头两侧编队游动，仿佛在为你们护航引路。它们优美的身姿在碧波中时隐时现，偶尔跃出水面在空中旋转，引得水手们阵阵欢呼。',
    triggerCondition: { probability: 0.16 },
    choices: [
      {
        text: '在船头欣赏，感谢大海的礼物',
        outcomes: [
          { probability: 0.9, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 20, durabilityChange: 0, crewChange: 0, description: '海豚群陪伴你们航行了整整一天，这是航海者最美好的记忆之一。水手们相信海豚是幸运的象征，每个人的脸上都洋溢着久违的笑容。', historicalNote: '从古希腊时代起，海豚就被视为海神波塞冬的使者。水手们相信看到海豚意味着好运和安全的航程。' },
          { probability: 0.1, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 25, durabilityChange: 0, crewChange: 0, description: '一只小海豚甚至在船头表演了一连串的后空翻！全船欢呼雷动，几个老水手激动得热泪盈眶。这是他们航海生涯中最美妙的时刻。' }
        ]
      },
      {
        text: '尝试与海豚互动，投喂食物',
        outcomes: [
          { probability: 0.8, goldChange: 0, foodChange: -2, waterChange: 0, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '水手们把一些小鱼投向水面，海豚们灵巧地接住了食物。一只大胆的海豚甚至游到船舷边，任由水手抚摸它光滑的皮肤。这是人与大海和谐共处的最美画面。' },
          { probability: 0.2, goldChange: 0, foodChange: -3, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, description: '海豚们并不需要你们的食物——它们本来就是这片海域的主宰。但它们愉快地接受了这份心意，又玩耍了一会儿才离去。' }
        ]
      }
    ]
  },
  {
    id: 103,
    type: 'discovery',
    title: '丰饶渔获',
    description: '船附近的海面上突然沸腾起来——一大群金枪鱼正在捕食小鱼，整个海域变成了银色的漩涡！这样的鱼群规模极为罕见，不用渔网都能捕到。厨师摩拳擦掌，船员们已经架起了烧烤架。',
    triggerCondition: { probability: 0.15 },
    choices: [
      {
        text: '全船出动，大肆捕捞',
        outcomes: [
          { probability: 0.7, goldChange: 5, foodChange: 20, waterChange: 0, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '这一网下去，捞上来的鱼多到甲板都堆不下！厨师用香料腌制后烤出金黄色的鱼排，全船人享用了一顿丰盛的海鲜盛宴。未来多日的食物不再发愁。' },
          { probability: 0.3, goldChange: 0, foodChange: 15, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, description: '虽然鱼群散得比预想快，但你们还是收获了足够多的鲜鱼。腌制后的鱼干可以保存很久，厨房充满了让人垂涎的香气。' }
        ]
      },
      {
        text: '只取所需，让鱼群继续前行',
        outcomes: [
          { probability: 0.9, goldChange: 0, foodChange: 10, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, description: '你克制地只捕捞了够用的量。大海慷慨地馈赠了你们，而你们的克制也赢得了自然的尊重。水手们享用了一顿鲜美的鱼汤，内心充满了感恩。' },
          { probability: 0.1, goldChange: 2, foodChange: 5, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '老水手说这种堪称奇迹的鱼群是海神的祝福。虽然只取了少量，但这份幸运本身就是无价的。' }
        ]
      }
    ]
  },
  {
    id: 104,
    type: 'historical',
    title: '海上商队',
    description: '前方出现了一支悬挂葡萄牙国旗的商船队，甲板上堆满了来自东方的货物。更令人惊喜的是，船队指挥官发来了友好的信号——他们希望与你们进行贸易！',
    triggerCondition: { minDay: 10, probability: 0.12 },
    choices: [
      {
        text: '友好上前，进行互利贸易',
        outcomes: [
          { probability: 0.6, goldChange: 40, foodChange: 5, waterChange: 3, moraleChange: 12, durabilityChange: 0, crewChange: 0, description: '商队指挥官对你的商品赞不绝口，用香料和丝绸交换了你们的货物。这笔交易获利颇丰，双方都满意而归。临别时对方还赠送了上好的葡萄牙葡萄酒。', historicalNote: '16-17世纪，葡萄牙和荷兰商船队经常在海上相遇进行贸易。这种"海上集市"是航海时代独特的商业文化。' },
          { probability: 0.3, goldChange: 25, foodChange: 3, waterChange: 2, moraleChange: 8, durabilityChange: 0, crewChange: 0, description: '虽然交易规模不大，但你们用一些本地特产交换了急需的航海补给和几件东方工艺品。这次相遇让船员们见识了异域风情。' },
          { probability: 0.1, goldChange: 10, foodChange: 2, waterChange: 1, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '商队的大部分货物已经售罄，但他们仍然慷慨地分享了一些食物和饮水。即使是小额的交易也让人心情愉快。' }
        ]
      },
      {
        text: '交换航海情报，了解前方海域信息',
        outcomes: [
          { probability: 0.8, goldChange: 5, foodChange: 0, waterChange: 0, moraleChange: 8, durabilityChange: 0, crewChange: 0, description: '商队分享了前方海域的详细情报：哪些港口补给充足、哪里暗礁密布、最近的天气趋势。这些信息能让你们避开不少麻烦，比金币更有价值。' },
          { probability: 0.2, goldChange: 2, foodChange: 0, waterChange: 0, moraleChange: 12, durabilityChange: 0, crewChange: 0, description: '在与商队的交谈中，你还意外得知了一个潜在的商机——前方的港口急需某种商品，价格高得离谱。这个消息让你眼中闪烁起商人的光芒。' }
        ]
      }
    ]
  },
  {
    id: 105,
    type: 'discovery',
    title: '鲸群邂逅',
    description: '海面上突然喷起了数道高高的水柱——是鲸群！巨大的鲸鱼在船只周围缓缓游动，发出低沉而悠扬的歌声。它们的体型如此庞大，却优雅而宁静。水手们屏息凝神，被眼前的壮观景象深深震撼。',
    triggerCondition: { minDay: 10, probability: 0.12 },
    choices: [
      {
        text: '停船观赏，记录这罕见的景观',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 20, durabilityChange: 0, crewChange: 0, description: '绘图师疯狂地素描着鲸鱼的姿态，航海日志上增添了珍贵的记录。一头母鲸带着幼鲸游近船边，喷出的水雾在阳光下形成了一道小小的彩虹。这是大自然最震撼的演出。', historicalNote: '大航海时代的船只在远洋中经常遇到鲸群。许多航海日志中都记载了这些壮观场面，被视为航行中的吉兆。' },
          { probability: 0.3, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '鲸群在船旁嬉戏了许久才缓缓潜入深海，留下渐渐消散的涟漪。水手们久久伫立在甲板上，回味着刚才那一幕——在这残酷的航海生涯中，这样的美好时刻值得珍藏一生。' }
        ]
      },
      {
        text: '跟随鲸群，它们可能引导至丰富的渔场',
        outcomes: [
          { probability: 0.5, goldChange: 8, foodChange: 12, waterChange: 0, moraleChange: 12, durabilityChange: 0, crewChange: 0, description: '鲸群果然将你们带到了一片渔产丰富的海域！跟随大海中最智慧的生物，你们的收获远超预期。水手们将这一天称为"鲸鱼指引的盛宴日"。' },
          { probability: 0.3, goldChange: 3, foodChange: 6, waterChange: 0, moraleChange: 8, durabilityChange: 0, crewChange: 0, description: '跟随鲸群偏离了预定航线，但收获了一些不错的渔获。虽然比不上一次大丰收，但水手们仍然觉得这次跟随是值得的。' },
          { probability: 0.2, goldChange: 0, foodChange: 2, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '鲸群很快就消失在了深海中，你们没能找到渔场。但仅仅是追随这些海洋巨兽的体验，就已让船员们心满意足。' }
        ]
      }
    ]
  },
  {
    id: 106,
    type: 'discovery',
    title: '海岛补给站',
    description: '前方出现了一座美丽的无人小岛——椰子树在微风中摇曳，清澈的溪流从山涧中流淌而下，沙滩上点缀着五彩的贝壳。最重要的是：这里有丰富的淡水和野果，正是远航中最需要的补给。',
    triggerCondition: { minDay: 15, probability: 0.13 },
    choices: [
      {
        text: '登岛补给，充分修整',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: 10, waterChange: 15, moraleChange: 15, durabilityChange: 3, crewChange: 0, description: '水手们在岛上度过了一天愉快的时光——补充淡水、采集椰子、在溪流中洗澡、在沙滩上烤鱼。船上的木匠修补了船板，所有人都得到了充分的休息。这简直是大海中的天堂。' },
          { probability: 0.3, goldChange: 5, foodChange: 8, waterChange: 12, moraleChange: 10, durabilityChange: 2, crewChange: 0, description: '在岛上发现了土著人留下的草棚，里面有一些干鱼和贝壳饰品。补给充足，船只也得到了休整。水手们精神状态焕然一新。' }
        ]
      },
      {
        text: '快速取水后继续航行，保持进度',
        outcomes: [
          { probability: 0.8, goldChange: 0, foodChange: 3, waterChange: 10, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '你命令船队快速补充淡水后立即出发。虽然休息时间不长，但充足的淡水储备让后续航程轻松了许多。水手们理解你的效率优先，但心里还是有点遗憾。' },
          { probability: 0.2, goldChange: 0, foodChange: 5, waterChange: 8, moraleChange: 7, durabilityChange: 0, crewChange: 0, description: '负责取水的小队在岛上发现了一片野生菠萝！虽然你急于出发，但这点意外收获让所有人都在晚餐时露出了笑容。' }
        ]
      }
    ]
  },
  {
    id: 107,
    type: 'discovery',
    title: '流星雨之夜',
    description: '晴朗的夜空忽然被无数流星点亮——一场壮观的流星雨正在上演！银色的轨迹划破天穹，密集得如同天神洒落的金粉。水手们纷纷涌上甲板，对着星空赞叹不已。这可是难得一遇的天文奇观。',
    triggerCondition: { minDay: 20, probability: 0.1 },
    choices: [
      {
        text: '全船放假，共同欣赏星空',
        outcomes: [
          { probability: 0.8, goldChange: 0, foodChange: -1, waterChange: -1, moraleChange: 25, durabilityChange: 0, crewChange: 0, description: '这个夜晚后来被水手们称为"星光之夜"。大家在甲板上席地而坐，分享着珍藏的美酒和故事。领航员趁机教年轻水手认星座，老水手则讲述着与流星有关的古老传说。这一夜的记忆会温暖他们整个航程。' },
          { probability: 0.2, goldChange: 2, foodChange: -1, waterChange: -1, moraleChange: 20, durabilityChange: 0, crewChange: 0, description: '流星雨持续了整整两个小时，密集时每分钟有数十颗。水手们许下的愿望加起来估计都能填满船舱了。这场天象奇观让所有人都感受到了航海的浪漫。' }
        ]
      },
      {
        text: '利用星光校准航向，更新星图',
        outcomes: [
          { probability: 0.6, goldChange: 10, foodChange: 0, waterChange: 0, moraleChange: 10, durabilityChange: 0, crewChange: 0, description: '领航员在流星的背景下重新校准了六分仪和星图，意外发现你们的航线可以大幅优化。修正后的航线更加安全高效。水手们既欣赏了美景又实现了导航升级。' },
          { probability: 0.4, goldChange: 5, foodChange: 0, waterChange: 0, moraleChange: 8, durabilityChange: 0, crewChange: 0, description: '虽然星光观测条件极佳，但领航员认为现有航线已是最优。不过这份精确的星图数据在未来航行中一定有用武之地。' }
        ]
      }
    ]
  },

  /* ============ 原事件（概率调低） ============ */
  {
    id: 1,
    type: 'storm',
    title: '加勒比飓风',
    description: '天色骤变，乌云翻涌如墨，海面上升起诡异的绿色荧光。老水手们面色惨白——这是加勒比海最可怕的飓风前兆。巨浪已经开始拍打船舷，桅杆在狂风中发出令人心悸的呻吟。',
    triggerCondition: { region: 'caribbean', dangerLevelMin: 2, probability: 0.12 },
    choices: [
      {
        text: '降帆收桅，全力抗击风暴',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: 5, durabilityChange: -10, crewChange: 0, description: '船只在风暴中剧烈颠簸，但凭借坚固的船体和船员的勇气，你们成功穿越了飓风。水手们对您的决断力更加信服。' },
          { probability: 0.35, goldChange: 0, foodChange: -10, waterChange: -5, moraleChange: -5, durabilityChange: -25, crewChange: -2, description: '风暴的威力超乎想象，一根主桅被狂风折断，两名水手被巨浪卷入深海。船只受损严重，但总算保住了性命。' },
          { probability: 0.15, goldChange: 0, foodChange: -15, waterChange: -8, moraleChange: -15, durabilityChange: -40, crewChange: -5, description: '飓风将船只推向礁石群，船底被撕裂，大量物资被海水吞噬。幸存者在残破的船上瑟瑟发抖，祈祷风暴早日停歇。', historicalNote: '加勒比飓风是16-17世纪航海者的噩梦，无数西班牙珍宝船队在此葬身海底。1591年，一支西班牙船队在飓风中损失了超过30艘船。' }
        ]
      },
      {
        text: '改变航向，尝试绕过风暴区',
        outcomes: [
          { probability: 0.45, goldChange: 0, foodChange: -8, waterChange: -5, moraleChange: 0, durabilityChange: -5, crewChange: 0, description: '绕行消耗了额外补给，但成功避开了飓风中心。远处的天际线依然被乌云笼罩，而你们已驶入平静海域。' },
          { probability: 0.4, goldChange: 0, foodChange: -12, waterChange: -8, moraleChange: -5, durabilityChange: -15, crewChange: -1, description: '风暴范围超出预期，绕行途中仍遭遇强风。一名瞭望手受伤，补给消耗超出预算。' },
          { probability: 0.15, goldChange: 0, foodChange: -20, waterChange: -12, moraleChange: -10, durabilityChange: -20, crewChange: -3, description: '绕行路线将你们带入了另一片危险海域，暗礁划破了船底。大量补给被海水浸泡，损失惨重。' }
        ]
      },
      {
        text: '满帆顺风，试图冲出风暴',
        outcomes: [
          { probability: 0.35, goldChange: 0, foodChange: -3, waterChange: -2, moraleChange: 10, durabilityChange: -5, crewChange: 0, description: '大胆的策略奏效了！船只如离弦之箭冲出风暴区，水手们欢呼雀跃，对您的胆识佩服得五体投地。' },
          { probability: 0.45, goldChange: 0, foodChange: -8, waterChange: -5, moraleChange: -10, durabilityChange: -30, crewChange: -4, description: '狂风撕裂了帆布，桅杆倾斜，数名水手被抛入大海。船只失控旋转后勉强脱险，代价惨重。' },
          { probability: 0.2, goldChange: -50, foodChange: -15, waterChange: -10, moraleChange: -20, durabilityChange: -50, crewChange: -8, description: '满帆冲入飓风无异于自寻死路。船只被巨浪抛起又重重摔下，甲板上的货物和人一同被甩入大海。' }
        ]
      }
    ]
  },
  {
    id: 2,
    type: 'pirate',
    title: '黑旗飘扬',
    description: '瞭望手的声音从桅顶传来："右舷发现船只！挂着黑旗！"一艘海盗船正从地平线上快速逼近，骷髅旗在风中猎猎作响。对方船只轻快灵活，显然是专为追击而造。海盗们已经在甲板上列队。',
    triggerCondition: { dangerLevelMin: 2, probability: 0.08 },
    choices: [
      {
        text: '战斗准备！全舰迎敌',
        outcomes: [
          { probability: 0.45, goldChange: 30, foodChange: 0, waterChange: 0, moraleChange: 10, durabilityChange: -15, crewChange: -2, description: '激烈的接舷战后，你们击退了海盗！还缴获了敌船上的部分财宝。水手们虽然负伤，但士气高昂。', historicalNote: '17世纪的加勒比海盗经常袭击西班牙宝船队。最著名的海盗如黑胡子和亨利·摩根都曾令整个加勒比闻风丧胆。' },
          { probability: 0.35, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: -5, durabilityChange: -25, crewChange: -5, description: '海盗战斗力超出预期，虽然最终击退，但船只受损严重，多名水手负伤。这是一场惨胜。' },
          { probability: 0.2, goldChange: -100, foodChange: -10, waterChange: -5, moraleChange: -20, durabilityChange: -40, crewChange: -10, description: '海盗登船后势如破竹，洗劫了货舱后扬长而去，留下满目疮痍的船只和受伤的船员。' }
        ]
      },
      {
        text: '全速逃跑，利用航线技巧摆脱',
        outcomes: [
          { probability: 0.5, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: 5, durabilityChange: -5, crewChange: 0, description: '凭借精湛的驾驶技术，你带领船只穿过浅滩区，海盗船不敢冒险追击，只能望洋兴叹。' },
          { probability: 0.35, goldChange: 0, foodChange: -8, waterChange: -5, moraleChange: -5, durabilityChange: -10, crewChange: -1, description: '追逐持续数小时，虽然最终甩掉了海盗，但消耗了大量补给。' },
          { probability: 0.15, goldChange: -50, foodChange: -10, waterChange: -8, moraleChange: -15, durabilityChange: -20, crewChange: -3, description: '海盗船更快，追上后进行短暂炮击。损失部分货物和船员，趁着夜色勉强逃脱。' }
        ]
      },
      {
        text: '升起白旗，尝试谈判',
        outcomes: [
          { probability: 0.4, goldChange: -60, foodChange: -5, waterChange: -3, moraleChange: -10, durabilityChange: 0, crewChange: 0, description: '海盗头目接受了赎金，放你们安然离去。虽损失一笔财富，但保全了船只和船员。', historicalNote: '许多海盗遵循"投降不杀"的规矩。但像黑胡子这样残暴的海盗则从不留活口。' },
          { probability: 0.4, goldChange: -100, foodChange: -10, waterChange: -8, moraleChange: -15, durabilityChange: -10, crewChange: -3, description: '海盗收了赎金后依然洗劫了货舱，还掳走了几名水手。示弱换来了更多屈辱。' },
          { probability: 0.2, goldChange: -150, foodChange: -15, waterChange: -10, moraleChange: -25, durabilityChange: -20, crewChange: -6, description: '海盗头目狞笑着拒绝了谈判，下令全面进攻。失去防备的你们被打得措手不及。' }
        ]
      }
    ]
  },
  {
    id: 3,
    type: 'disease',
    title: '坏血病的阴影',
    description: '最近几周，越来越多水手出现令人不安的症状：牙龈肿胀出血，皮肤布满紫色淤斑，旧伤重新裂开。这是所有水手最恐惧的敌人——坏血病。如果不及时处理，整艘船都会被这个无声的杀手吞噬。',
    triggerCondition: { minDay: 30, probability: 0.08 },
    choices: [
      {
        text: '改变航线前往最近的港口求医',
        outcomes: [
          { probability: 0.65, goldChange: -30, foodChange: 5, waterChange: 5, moraleChange: 5, durabilityChange: 0, crewChange: -1, description: '你果断改变航向，在最近的港口找到医生和新鲜蔬果。大部分病患开始恢复，只有一名病情过重的水手没能挺过来。', historicalNote: '坏血病是大航海时代最致命的杀手，超过200万水手死于此病。直到18世纪才证明柑橘类水果的疗效。' },
          { probability: 0.35, goldChange: -50, foodChange: 5, waterChange: 5, moraleChange: -5, durabilityChange: -5, crewChange: -4, description: '绕行花费太多时间，几名重症水手途中去世。剩余病患得到救治，但代价沉重。' }
        ]
      },
      {
        text: '在海上搜寻新鲜食物来源',
        outcomes: [
          { probability: 0.4, goldChange: 0, foodChange: 10, waterChange: 5, moraleChange: 5, durabilityChange: 0, crewChange: -1, description: '幸运地发现一座无人小岛，水手们采集大量椰子和野果。新鲜的果蔬让病患开始恢复，简直是上天的恩赐。' },
          { probability: 0.4, goldChange: 0, foodChange: 0, waterChange: -3, moraleChange: -5, durabilityChange: -5, crewChange: -3, description: '搜寻好几天也没找到岛屿，白白消耗了补给和时间。几名重症水手在等待中离世。' },
          { probability: 0.2, goldChange: 0, foodChange: -5, waterChange: -5, moraleChange: -15, durabilityChange: -10, crewChange: -6, description: '搜寻过程中船只撞上暗礁，虽然勉强脱困但船底受损。坏血病继续蔓延，双重打击让士气跌至谷底。' }
        ]
      }
    ]
  },
  {
    id: 4,
    type: 'discovery',
    title: '未知岛屿',
    description: '清晨薄雾中，一座从未在航海图上标注过的岛屿出现在眼前。翠绿山峦从海面升起，瀑布从悬崖倾泻而下，白色沙滩上散落着奇异的贝壳。远处似乎有炊烟升起——岛上可能有人居住！',
    triggerCondition: { dangerLevelMin: 1, probability: 0.1 },
    choices: [
      {
        text: '登岛探索，与岛民接触',
        outcomes: [
          { probability: 0.5, goldChange: 50, foodChange: 15, waterChange: 10, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '岛上原住民热情好客，用热带水果和淡水款待了你们。酋长赠送了一箱珍贵的珍珠作为友谊的象征。这是一次美好的邂逅。', historicalNote: '大航海时代的探险家经常在未知岛屿上遇到原住民。有些接触是友好的，如哥伦布在巴哈马的初次相遇。' },
          { probability: 0.35, goldChange: 20, foodChange: 5, waterChange: 5, moraleChange: 0, durabilityChange: -5, crewChange: -1, description: '岛民对陌生人抱有戒心，但经过小心翼翼的沟通，他们允许你们补充淡水和食物。一名水手误食有毒浆果而生病。' },
          { probability: 0.15, goldChange: -20, foodChange: 0, waterChange: 0, moraleChange: -10, durabilityChange: -15, crewChange: -3, description: '岛民将你们视为入侵者发动袭击。几名水手被毒箭射中，你们仓皇逃回船上，船只也在撤退中受损。' }
        ]
      },
      {
        text: '绕岛航行，寻找可利用的资源',
        outcomes: [
          { probability: 0.6, goldChange: 20, foodChange: 10, waterChange: 8, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '在岛屿背风面发现隐蔽的海湾，那里有清澈溪流和丰富的椰子。水手们趁机补充补给，还捡到漂木用于修补船只。' },
          { probability: 0.4, goldChange: 0, foodChange: 3, waterChange: 3, moraleChange: 0, durabilityChange: -5, crewChange: 0, description: '绕岛航行耗费了时间，只找到少量资源。岛周围的暗礁让船只轻微受损，但至少补充了淡水。' }
        ]
      }
    ]
  },
  {
    id: 5,
    type: 'historical',
    title: '西班牙珍宝船队',
    description: '海平线上出现一支庞大的船队——那是西班牙珍宝船队！数十艘满载新大陆金银的盖伦大帆船，在战舰护卫下缓缓行驶。这是世界上最富有的船队，也是所有海盗梦寐以求的猎物。',
    triggerCondition: { region: 'caribbean', minDay: 10, probability: 0.06 },
    choices: [
      {
        text: '保持距离，礼貌地远远跟随',
        outcomes: [
          { probability: 0.7, goldChange: 0, foodChange: -3, waterChange: -2, moraleChange: 0, durabilityChange: 0, crewChange: 0, description: '西班牙护卫舰发现你们，看到没有敌意后便不再理会。你远远观察了船队的航线，这些情报在未来大有用处。', historicalNote: '西班牙珍宝船队从1566年开始，每年将新大陆财富运回西班牙。这是当时世界上最重要的财富通道。' },
          { probability: 0.3, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: -5, durabilityChange: -5, crewChange: 0, description: '西班牙战舰将你们视为威胁，发了一发警告炮弹。你们不得不改变航向，白白绕路消耗了补给。' }
        ]
      },
      {
        text: '尝试与船队进行贸易',
        outcomes: [
          { probability: 0.4, goldChange: 30, foodChange: 5, waterChange: 5, moraleChange: 10, durabilityChange: 0, crewChange: 0, description: '船队指挥官对你们的商品很感兴趣，双方进行了友好贸易。你用朗姆酒换到优质航海仪器和银币，获利颇丰。' },
          { probability: 0.4, goldChange: 0, foodChange: -3, waterChange: -2, moraleChange: -5, durabilityChange: 0, crewChange: 0, description: '西班牙人傲慢地拒绝了贸易请求。水手们对这种轻蔑的态度感到愤怒。' },
          { probability: 0.2, goldChange: -30, foodChange: -5, waterChange: -3, moraleChange: -10, durabilityChange: -10, crewChange: 0, description: '西班牙人将靠近视为挑衅，护卫舰开炮驱赶。一发炮弹击中船尾，你们狼狈逃离。' }
        ]
      }
    ]
  },
  {
    id: 6,
    type: 'accident',
    title: '暗礁危机',
    description: '船底传来一声令人毛骨悚然的撕裂声——触礁了！海水正从裂缝涌入底舱，如果不在短时间内堵住漏洞，船只将会沉没。水手们惊慌失措，有人已经开始准备救生艇。',
    triggerCondition: { dangerLevelMin: 1, probability: 0.1 },
    choices: [
      {
        text: '组织全体船员紧急堵漏',
        outcomes: [
          { probability: 0.55, goldChange: 0, foodChange: -3, waterChange: -2, moraleChange: 5, durabilityChange: -10, crewChange: 0, description: '在你的指挥下，水手们用帆布和木板成功堵住漏洞。虽然船底受损但保住了船只。这次危机让船员们更加团结。' },
          { probability: 0.3, goldChange: 0, foodChange: -5, waterChange: -5, moraleChange: -5, durabilityChange: -25, crewChange: -1, description: '堵漏工作异常艰难，一名水手在底舱被海水冲走。虽然最终控制住进水，但船只需要尽快进港大修。' },
          { probability: 0.15, goldChange: -30, foodChange: -8, waterChange: -5, moraleChange: -15, durabilityChange: -40, crewChange: -3, description: '裂缝比预想更大，海水不断涌入。你们不得不抛弃部分货物减轻重量，拼命抽水搏斗一整夜才勉强保住船。' }
        ]
      },
      {
        text: '抛弃部分货物减轻重量，驶向浅滩搁浅',
        outcomes: [
          { probability: 0.5, goldChange: -40, foodChange: -5, waterChange: -3, moraleChange: -5, durabilityChange: -15, crewChange: 0, description: '忍痛抛弃大量货物后，船只勉强驶到浅滩。虽然搁浅但不会沉没，等潮水上涨后重新浮起。损失的货物令人心痛。' },
          { probability: 0.35, goldChange: -60, foodChange: -8, waterChange: -5, moraleChange: -10, durabilityChange: -20, crewChange: -1, description: '抛弃速度不够快，海水淹没了底舱大部分物资。虽然保住船但经济损失惨重，一名水手落水。' },
          { probability: 0.15, goldChange: -80, foodChange: -10, waterChange: -8, moraleChange: -20, durabilityChange: -30, crewChange: -4, description: '即使抛弃货物船只还是开始倾斜。多名水手被海水吞没，船只严重受损需大修才能继续航行。' }
        ]
      }
    ]
  },
  {
    id: 7,
    type: 'storm',
    title: '赤道无风带',
    description: '风停了。完全停了。帆布无力地垂挂在桅杆上，海面如镜面般平静得令人窒息。烈日当空，船舱内如同蒸笼。这是水手们最恐惧的赤道无风带——没有风，没有方向，只有无尽的等待。',
    triggerCondition: { region: 'africa', probability: 0.1 },
    choices: [
      {
        text: '耐心等待，节约补给',
        outcomes: [
          { probability: 0.45, goldChange: 0, foodChange: -10, waterChange: -12, moraleChange: -10, durabilityChange: 0, crewChange: 0, description: '经过数日煎熬，微风终于重新吹起。虽然补给消耗严重但你们挺过来了。', historicalNote: '赤道无风带（Doldrums）是大西洋低压区域，帆船曾在此滞留数周，许多船只耗尽补给。' },
          { probability: 0.35, goldChange: 0, foodChange: -15, waterChange: -15, moraleChange: -15, durabilityChange: -5, crewChange: -2, description: '无风带持续了整整两周，补给几近耗尽。几名体弱水手因中暑和脱水倒下。' },
          { probability: 0.2, goldChange: 0, foodChange: -20, waterChange: -20, moraleChange: -25, durabilityChange: -10, crewChange: -5, description: '烈日烤干最后一桶淡水，水手们喝海水解渴结果更加虚弱。当风终于来临时，已有人永远等不到了。' }
        ]
      },
      {
        text: '放下小艇，用划桨拖动大船',
        outcomes: [
          { probability: 0.4, goldChange: 0, foodChange: -8, waterChange: -8, moraleChange: 5, durabilityChange: 0, crewChange: 0, description: '水手们轮流划桨拖船，虽然进展缓慢但至少在移动。团结协作的精神让士气反而有所提升，最终划出无风带。' },
          { probability: 0.45, goldChange: 0, foodChange: -12, waterChange: -10, moraleChange: -5, durabilityChange: -5, crewChange: -1, description: '划桨拖船极其消耗体力，水手们很快精疲力竭。虽然移动了一些距离但效果有限。' },
          { probability: 0.15, goldChange: 0, foodChange: -15, waterChange: -12, moraleChange: -10, durabilityChange: -5, crewChange: -3, description: '烈日下划桨简直是酷刑，多名水手中暑倒下。小艇绳索断裂，差点造成人员伤亡。' }
        ]
      }
    ]
  },
  {
    id: 8,
    type: 'historical',
    title: '好望角的风暴',
    description: '船只好望角附近遭遇了世界上最猛烈的风暴之一。两大洋交汇之处，洋流碰撞产生数十尺巨浪，狂风如万兽咆哮。葡萄牙水手称其为"风暴角"，因为过了这里就是通往东方的希望。',
    triggerCondition: { region: 'africa', minDay: 40, probability: 0.08 },
    choices: [
      {
        text: '迎风而上，穿越好望角',
        outcomes: [
          { probability: 0.4, goldChange: 0, foodChange: -8, waterChange: -5, moraleChange: 10, durabilityChange: -15, crewChange: -1, description: '在惊涛骇浪中，你凭借过人的航海技术和勇气成功穿越好望角！水手们欢呼着将你抛向空中——你做到了无数人做不到的事！', historicalNote: '1488年，迪亚士成为第一个绕过好望角的欧洲人。他最初将其命名为"风暴角"。' },
          { probability: 0.4, goldChange: 0, foodChange: -12, waterChange: -8, moraleChange: -5, durabilityChange: -30, crewChange: -4, description: '风暴猛烈超乎想象，船只几乎被掀翻。一根桅杆折断，数名水手被卷走。虽然最终穿越但代价惨重。' },
          { probability: 0.2, goldChange: -30, foodChange: -15, waterChange: -10, moraleChange: -20, durabilityChange: -45, crewChange: -8, description: '好望角给了你们毁灭性打击，船只严重受损，大量物资被卷走，多名水手葬身海底。' }
        ]
      },
      {
        text: '退回开普敦港湾避风',
        outcomes: [
          { probability: 0.65, goldChange: -20, foodChange: 5, waterChange: 5, moraleChange: 0, durabilityChange: -5, crewChange: 0, description: '退回开普敦是明智选择，在港湾等待风暴平息。虽支付停泊费和补给费，但保全了船只和船员。' },
          { probability: 0.35, goldChange: -30, foodChange: 3, waterChange: 3, moraleChange: -5, durabilityChange: -10, crewChange: -1, description: '返航途中也遭遇强风，船只受损。在开普敦修理和补给花费不菲，但比在风暴中冒险安全得多。' }
        ]
      }
    ]
  },
  {
    id: 9,
    type: 'pirate',
    title: '东方海域的海盗',
    description: '马六甲海峡附近，一艘涂着诡异红漆的帆船突然从岛屿后方冲出！这是南洋海盗——比加勒比海盗更凶残，在这片海域横行霸道数百年。船上挂着绣着骷髅的旗帜，海盗们手持弯刀发出战吼。',
    triggerCondition: { region: 'asia', dangerLevelMin: 2, probability: 0.08 },
    choices: [
      {
        text: '利用海峡地形设伏反击',
        outcomes: [
          { probability: 0.45, goldChange: 40, foodChange: 0, waterChange: 0, moraleChange: 15, durabilityChange: -10, crewChange: -2, description: '你巧妙地将船驶入狭窄水道，海盗船追入后无法展开队形。火炮发挥了最大威力，击沉了海盗船！', historicalNote: '马六甲海峡自古海盗出没。明代郑和下西洋时在此遭遇海盗，著名海盗陈祖义被郑和擒获斩首。' },
          { probability: 0.35, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: -5, durabilityChange: -20, crewChange: -4, description: '设伏计划被海盗识破，他们从侧翼包抄。狭窄水域中的战斗异常惨烈，双方都有伤亡。' },
          { probability: 0.2, goldChange: -80, foodChange: -10, waterChange: -5, moraleChange: -20, durabilityChange: -35, crewChange: -7, description: '海盗对水域比你熟悉得多，利用暗礁和浅滩将你引入陷阱。船只搁浅后海盗蜂拥而上。' }
        ]
      },
      {
        text: '向最近的港口全速撤退',
        outcomes: [
          { probability: 0.55, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: 0, durabilityChange: -5, crewChange: 0, description: '你熟悉航线，在岛屿间穿梭自如。海盗在接近港口时不得不放弃追击，港口的炮台让他们望而却步。' },
          { probability: 0.45, goldChange: -20, foodChange: -8, waterChange: -5, moraleChange: -10, durabilityChange: -15, crewChange: -2, description: '海盗船速更快，在追击中不断炮击。你的船只受损，部分货物被摧毁。最终在港口炮台掩护下脱险。' }
        ]
      }
    ]
  },
  {
    id: 10,
    type: 'discovery',
    title: '沉船宝藏',
    description: '在浅海区域，瞭望手发现水下有异常阴影。降低航速后仔细观察，竟是一艘沉没的盖伦大帆船！船体保存完好，透过清澈海水可以看到船舱中隐约闪烁的金色光芒——可能是数十年前遇难的西班牙宝船！',
    triggerCondition: { dangerLevelMin: 2, probability: 0.06 },
    choices: [
      {
        text: '派水手潜水打捞',
        outcomes: [
          { probability: 0.4, goldChange: 100, foodChange: 0, waterChange: 0, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '水手们轮流下潜，从沉船中打捞大量金银币和宝石！这是一笔惊人财富，每个水手都分到丰厚奖赏。士气空前高涨！', historicalNote: '加勒比海底散布着数百艘西班牙沉船。2015年哥伦比亚发现1708年沉没的"圣何塞号"，财宝价值约170亿美元。' },
          { probability: 0.4, goldChange: 40, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: 0, crewChange: -1, description: '打捞不太顺利，大部分船舱被泥沙堵塞。只打捞到部分财宝，一名水手潜水时受伤。但总体值得。' },
          { probability: 0.2, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -10, durabilityChange: 0, crewChange: -3, description: '沉船比预想更深，水压和暗流让潜水极其危险。三名水手溺水身亡，财宝远不如想象丰富。' }
        ]
      },
      {
        text: '记录位置，留待日后装备更好时再来',
        outcomes: [
          { probability: 0.8, goldChange: 5, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, description: '你谨慎记录了沉船精确坐标和深度。虽然放弃眼前利益，但这份信息本身就是有价值资产。' },
          { probability: 0.2, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, description: '就在记录坐标时另一艘船出现在地平线。你不得不匆忙离开，这个秘密可能保不住了。' }
        ]
      }
    ]
  },
  {
    id: 12,
    type: 'historical',
    title: '达伽马的航迹',
    description: '在印度洋上航行时，你发现一串奇特的水纹——那是洋流交汇的痕迹。领航员激动地告诉你，这和达伽马当年记录的航线特征完全吻合！你们可能发现了通往印度的重要航道标记。',
    triggerCondition: { region: 'asia', minDay: 20, probability: 0.06 },
    choices: [
      {
        text: '沿着航迹深入探索',
        outcomes: [
          { probability: 0.6, goldChange: 60, foodChange: 5, waterChange: 5, moraleChange: 15, durabilityChange: 0, crewChange: 0, description: '沿着达伽马航迹，你们发现一座隐蔽的葡萄牙补给站遗址！里面保存着完好的航海日志和珍贵香料样本。这些发现对未来的航行价值连城。', historicalNote: '达伽马于1498年到达印度卡利卡特，开辟了欧洲到印度的海上航线，改变了世界贸易格局。' },
          { probability: 0.3, goldChange: 20, foodChange: 0, waterChange: 0, moraleChange: 5, durabilityChange: -5, crewChange: 0, description: '航迹在暗礁区消失，没找到传说标记，但你们收集了宝贵的洋流数据，对未来航行大有裨益。' },
          { probability: 0.1, goldChange: 0, foodChange: -5, waterChange: -3, moraleChange: -5, durabilityChange: -10, crewChange: -1, description: '航迹将你们引入危险海域，暗礁和漩涡让船只受损。达伽马的秘密也许永远埋藏于此。' }
        ]
      },
      {
        text: '记录位置，继续原定航线',
        outcomes: [
          { probability: 0.8, goldChange: 10, foodChange: 0, waterChange: 0, moraleChange: 0, durabilityChange: 0, crewChange: 0, description: '你将发现详细记录在航海日志中，继续按计划航行。虽然错过深入探索的机会，但安全永远第一。' },
          { probability: 0.2, goldChange: 0, foodChange: 0, waterChange: 0, moraleChange: -5, durabilityChange: 0, crewChange: 0, description: '水手们对放弃探索感到失望，觉得你过于谨慎。但你知道在未知海域冒险往往意味着灾难。' }
        ]
      }
    ]
  }
]