import { useRef, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import FullScreenPanel from '@/components/ui/FullScreenPanel'
import { Anchor, Coins, RotateCcw, Compass, Download, Droplets, Flame, Globe, Heart, HelpCircle, Keyboard, Moon, Newspaper, Package, Shield, Ship, Sparkles, Tag, Trophy, Upload, Users, Utensils, Wind } from 'lucide-react'
import { applySaveText, downloadSave, parseSaveText } from '@/utils/saveFile'
import { achievements } from '@/data/achievements'

/**
 * 帮助里用了 `**强调**` 当内联标记，但渲染时一直原样输出星号。
 * 中文只有 400 字重，font-bold 会变成合成假粗体（同一行两种质感），
 * 所以强调靠**明度 + 字距**，不靠字重。
 */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <span key={i} className="text-gold-200 tracking-wide">{part.slice(2, -2)}</span>
      : <span key={i}>{part}</span>,
  )
}

/**
 * 一条说明。
 *
 * 【为什么不用 `• {文字}` 一行流】
 * 中文一条说明常有 40-60 字，在 13px 下必然折成两行。原来圆点是**行内字符**，
 * 第二行就退回行首、正好落在圆点底下 —— 截图里读作「一个圆点孤零零挂在段落外」，
 * 整节 10 条排下来是一面墙。改成左侧 1rem 定宽栏放标记，文字从同一列开始、
 * 也回到同一列：折行时第二行与第一行首字对齐，眼睛才有"条目"的边界。
 * 图标类条目（资源说明）也走同一个栏，于是圆点与图标共用一条竖线。
 */
function Row({ marker, children }: { marker: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className="shrink-0 w-4 h-[1.85em] flex items-center justify-center text-gold-600"
      >
        {marker}
      </span>
      <span className="min-w-0 flex-1 text-gold-500 text-[13px] font-serif leading-[1.85]">{children}</span>
    </li>
  )
}

const DOT = <span className="block w-[3px] h-[3px] rounded-full bg-gold-600/80" />

const sections = [
  {
    title: '玩法模式',
    icon: <HelpCircle size={14} />,
    items: [
      '**船长模式**：完整玩法。有十步教学、任务传闻、实时操舵；真翻了船，也可以不清进度接着看海。',
      '**参观模式**：只看世界。没有教学、没有任务、不会输；操舵可以交给水手，遇事可以袖手旁观。',
      '没有强制任务：任务面板里的传闻**只是建议**，不接、不做都不影响你把船开到任何地方。',
      '操舵永远可以跳过：跳过的唯一代价是那一段拿不到操舵奖励（不省里程、不加士气）。',
      '想换模式？在「帮助」面板底部点「换个玩法」即可重开一局。',
    ],
  },
  {
    title: '游戏目标',
    icon: <Globe size={14} />,
    items: [
      '自由航行于大航海时代的世界，探索你感兴趣的每一个角落。没有天数上限，也不催你通关。',
      '发现新港口、做完全部传闻、攒够家底——三条路各写下一页**称号**进日志，写完游戏照常继续。',
      '每靠一次岸，航海日志就多一页见闻和一句去处；那句话**不过期**，不理它也不扣任何东西。',
      '酒馆传闻和港口行情速报会告诉你哪里高价收货，低买高卖致富；不想算就照掮客推荐点一下。',
      '“黑帆”杰克、“白银”玛丽亚、“星眸”迭戈也在同一片海上讨生活——航海志的「船长」页能看座次与传闻。',
    ],
  },
  {
    title: '出航计划',
    icon: <Anchor size={14} />,
    items: [
      '点击地图不再立即起航——先弹「出航计划」：距离、危险、风向、补给够不够，一目了然',
      '计划顶部会直接给一句结论：补给够不够、大概几天到。不够就说清楚只够几天',
      '三种方针的细账可以展开看，但**不在这时选**——每到一段航程的起点才选（见下方「航段方针」）',
      '买「航线情报」看天气/海盗/风暴三条风险再决定冲还是稳；随船学者或学者公会 30 档半价',
      '补给不足会红字警告：断粮断水那天，士气会开始崩',
    ],
  },
  {
    title: '航段方针',
    icon: <Compass size={14} />,
    items: [
      '一次远航被切成 2-8 个航段，每段开始时你必须选一个方针——这是游戏里**唯一**的速度旋钮',
      '抢行 ▲：航速×1.7，长航段通常更省粮水；代价是船损×2.2、遇事×1.8、事态烈度×1.45，且立刻掉 3 点士气',
      '按部就班 ■：什么都不额外发生',
      '谨慎 ▼：航速×0.6，船损×0.3、遇事×0.3，士气 +3；长航段多待几天，粮水反而更费',
      '三张卡的账在选之前就摊开（天数/粮/水/磨损/遇事/士气），按 1/2/3 即可选定',
      /*
       * 【为什么删掉「谨慎的总粮水一定比抢行多」】那句话是写死的方向，
       * 实测 100 海里段：抢行 1 天 / 3 粮 5 水，按部就班 1 天 / 2 粮 3 水，
       * 谨慎 1 天 / 2 粮 3 水 —— 三档天数被 ceil 压成同一个数，抢行的
       * supplyMul×1.5 照旧生效，于是抢行既不快又费粮水，谨慎反而没多花。
       * 静态文案不可能同时说对短段和长段，只能把「以账为准」写进帮助。
       */
      '**短航段例外**：三档天数可能被取整压成一样，那时抢行既不快又费粮水——**以卡片上摊开的实际账为准**，别照这一段说明备水',
    ],
  },
  {
    title: '船长天赋',
    icon: <Sparkles size={14} />,
    items: [
      '开局选择的天赋伴随整个生涯：商界血脉（价格-5%）、铁壁舰长（耐久损-15%）、魅力领袖（士气增益+25%）、天生探险家（发现类事件+30%）、随船医生（船员损-25%）。',
      '声望达到 40/100 后，所有港口买卖价额外优惠 5%/10%——完成合约、发现港口、善待岛民都能提升声望。',
    ],
  },
  {
    title: '军官团',
    icon: <Users size={14} />,
    items: [
      /*
       * 【2026-11-26 修】原来写「船医（坏血病脚步放慢、每日士气衰减 -2）」——
       * 两半都不对：① 本作**没有每日士气衰减**（实测：粮水充足推进一天，士气一点不掉；
       * 只有断粮断水那天才扣，船医/神甫各减 2）；② 船医的第二半是"疾病类事件率减半"，
       * 没有"坏血病脚步"这种东西。`data/officers.ts` 里早就改对了，帮助页没跟上 ——
       * 同一件事两处说法，一处是假话。数字仍然手写（帮助页要短句），
       * 单测钉住它必须与 officers.ts 的三个数一致。
       */
      '港口酒馆可招募三名军官：老领航员（航速 +15%）、大副（士气打击减半）、船医（断粮断水时少掉 2 点士气、疾病类事件率减半）',
      '军官一次性招募费 + 每日工资——是长期投资，也是长期开销',
      '金币不够发工资时，军官会按顺序离船——养团队就要养得起',
    ],
  },
  {
    title: '天候系统',
    icon: <Wind size={14} />,
    items: [
      '天气按海域生成、持续 1-3 天：晴（全速）/ 阴（×0.95）/ 雨（×0.85）/ 暴风雨（×0.55，每日啃 1 点耐久、压 1 点士气）/ 浓雾（×0.75，瞭望半径减半）',
      '暴风雨与浓雾天事件概率更高——风险和收益都在同一片云底下',
      '罗盘下方的天气徽章常驻显示当前天候、风速与航速影响，点击展开未来三天预报',
      '出航计划里也有三日预报：等一个顺风天再走，比闷头满帆聪明',
      '赤道无风带多雾、中纬度多暴风雨——跨洋航线值得为天气绕行',
    ],
  },
  {
    title: '基本操作',
    icon: <Ship size={14} />,
    items: [
      /*
       * 【2026-11-16 更正】原文写"左侧：舰队 / 任务 / 日志 / 成就 / 见闻"。
       * 第五个按钮早就是「船长」（同代座次），"见闻"只是册子里的一栏；
       * 而右侧三个入口（港口 / 贸易 / 造船）一个字都没提 —— 新手照着这段找，
       * 会在左边找不到贸易、在右边找不到"见闻"。
       */
      '左侧一列：舰队 / 任务 / 日志 / 成就 / 船长（后四个点开的是同一本「航海志」）；右侧一列：港口 / 贸易 / 造船——每个都带中文名，不用猜图标',
      '「航海志」分五页：任务（在办与可接）、日志（左边是这趟带回的见闻，右边是按天写的记事）、图鉴（点亮的港口与拾遗）、成就、船长（同代座次，以及你正在成为哪种船长）',
      '右侧一列最上方是「上岸走走」（已经在岸上时变成「回海图」）；手机把它放在底部导航第一格：一直都在，随时来回切；还在海上时会变灰',
      '靠港后点「上岸走走」：收起海图，走进港口近景，翻这趟带回的见闻，或直接去商行、船厂、酒馆',
      '到港会有一条 9 秒自动收起的小提示，不理它也不挡路；见闻里的线索不过期，不做也不罚',
      '点击地图设定航向后，在「出航计划」里确认才升起旗帜',
      /*
       * 【2026-11-18 补两条新机制】面板顶部页签、面板打开时暂停。
       * 这两件都是这一轮才有的行为，说明里不提，玩家只能自己撞见 ——
       * 尤其是"暂停"：不写的话，他会担心挑货的这几秒船自己开走。
       * 只加一句 40 字（copy-density 的上界还剩 50 字），两件事合并写。
       */
      '面板顶部有页签可互切（港口/贸易/造船/舰队）；打开面板时海面暂停，合上继续',
      /*
       * 【2026-11-16 更正】原文写"每段航程…再进操舵挑战"。实际早就改成：
       * 第 0 段必弹一次（保证人人都试过），之后**不再自动弹**，改由船上的
       * 「亲手掌舵」按钮随时召唤，不想玩的人不会被每段拦一次。
       * 照着旧文案找"每段必有操舵"的玩家会以为后面几段坏了。
       */
      '起航后每段航程开始时先选一次「航段方针」——这是唯一的速度旋钮；第一段会带你走一次「操舵挑战」（可交给水手跳过），之后想玩就点船上的「亲手掌舵」，不点也不会拦你',
      '底部速度档（⏸/1x/3x/8x）控制**模拟快慢**（游戏跑得多快），"+1天"直接推进一天',
      '顺风方向航行更快——低纬度向东、中纬度向西，开风带图层查看',
    ],
  },
  {
    title: '四方势力',
    icon: <Globe size={14} />,
    items: [
      '王室 / 商人商会 / 学者公会 / 海盗兄弟会——各有一本记你功过的账',
      '同一个行为，两副面孔：击退海盗，王室赏识你、兄弟会记恨你；走私赚钱，兄弟会引为知己、王室贴出通缉',
      /*
       * 【这里原来写着"王家合约、商会折扣、免费情报、黑市与护航"】
       * 逐条对过代码：只有商会折扣（30 档 1% / 60 档 3%）、王室 90 档全港 3%、
       * 学者 30 档情报半价、兄弟会 30 档自家港口 4% 是真的。
       * 王家合约、黑市、护航三样一条都没实现，免费情报其实是半价。
       * 帮助面板是新手唯一照着玩的东西，写没做的事比不写更糟。
       */
      '声望到档解锁势力特权（舰队面板会写"还差几点"）：商会买卖优惠与滞销回收、学者情报半价与古海图与报呈发现物、王室护送与港口折扣、兄弟会黑市与少遇海盗',
      '任一派系敌对（≤-30）时，该派系的折扣全部失效——账是要还的',
      '（十二档势力特权现在都有实现；面板上出现的就是能用的）',
      '舰队面板看四方态度星级；港口面板顶部显示"本港由谁话事"',
    ],
  },
  {
    title: '名船员',
    icon: <Users size={14} />,
    items: [
      '码头可寻访八位常驻船员：水手长、炮手、账房、神甫、学者、厨子、见习航海士、黑旗向导',
      '另有七位只在特定港口露面的人——果阿的航海士、里斯本的药剂师、阿姆斯特丹的船匠、蒙巴萨的翻译官、巴达维亚的向导、塞维利亚的丝绸商、加的斯的探险家',
      '每人有自己的特长（账房降价 2%、船匠省四成修理费、翻译官让派系好感 +50%……）与来历故事',
      '忠诚度会掉：低士气每天 -3、高危航段每天 -1；跌破 25 就可能离船，断粮的日子可能死亡',
      '每人都有一桩个人事件等着你——老汤姆的旧账、独眼玛格的仇人、少爷的家信……',
      '善待他们，他们会在航海志里、在战斗中记着这份情',
    ],
  },
  {
    title: '海上人称',
    icon: <Tag size={14} />,
    items: [
      '你的两难选择会累积五种取向：冷酷 / 仁慈 / 贪婪 / 鲁猛 / 守秘',
      '任一取向达到 3 点，海上开始用一个称号称呼你：铁腕者、慈悲心、海上赌徒、守秘人、贪婪者',
      /*
       * 只写真的：贪婪者的毛利 +4% 实现在 data/traits.priceMultiplier，
       * 而"赌徒好结局 +4%""贪婪声望 -20%"两个常量（BOLD_LUCK_BONUS / GREED_FAME_PENALTY）
       * 定义了却没人读。称号的设计本意是"后世怎么记载你"，不该被讲成数值堆叠。
       */
      '称号只带一点很轻的永久效果（如贪婪者的毛利 +4%），它主要是"后世怎么记载你"',
      /*
       * 【"生涯回顾"这个界面并不存在】帮助里点了三处，玩家会去找一个不存在的屏。
       * 称号与四方账目在「舰队」面板，成就与生涯统计在航海志的「成就」页。
       * 文案改成指路，指到真的地方。
       */
      '后世如何记载你，写在航海志里：称号与四方账目在「舰队」面板，生涯统计在「成就」页',
    ],
  },
  {
    title: '键盘操作',
    icon: <Keyboard size={14} />,
    items: [
      '1-8：快速开关舰队/任务/日志/成就/见闻/港口/贸易/船厂面板',
      'Space：暂停 / 恢复时间（恢复回 3x）',
      'Esc：一层层退——先关面板，再关帮助，最后离开岸上；? 或 /：打开帮助',
      'A：停泊时在「海图」与「岸上」之间切换（航行中与操舵时 A 仍是转向，互不影响）',
      '事件界面：数字键 1-9 直接选选项，Enter/Space 看结果并继续',
      '剧情致辞：Enter/Space 推进台词（打字机进行中按 = 立即显示整句），Esc 跳过整段',
      '出航计划：Enter 确认出航，Esc 再想想',
      '航段抉择：数字键 1/2/3 直接选方针（抢行/按部就班/谨慎）',
      '操舵时：A/D（←/→）转向，W/S（↑/↓）收帆/松帆，Enter 提前收舵',
    ],
  },
  {
    title: '操舵挑战（可跳过）',
    icon: <Compass size={14} />,
    items: [
      '每段起航后弹出：15 秒实时掌舵，船会停下等你',
      '让船首向尽量对准风向，待在仪表盘绿色风区里；风向会摆，阵风不定期来袭',
      '帆收得紧（W）舵响应更快；评级越高，本段少走的航程越多（至多省 15%）',
      '传奇舵手还提振士气、小幅涨声望；操作太莽会在浪里颠掉旗舰耐久',
      '按 Enter 可提前收舵（至少掌舵 3 秒）——手起风落，各安其位',
      '不想玩就点「交给水手」（或按 Esc）跳过：唯一的代价是**本段拿不到操舵奖励**，不扣士气、不磨损船',
    ],
  },
  {
    title: '资源说明',
    icon: <Coins size={14} />,
    items: [
      /*
       * 七种资源原来是「图标 + 一整句」，词条名混在句子里（"金币：购买商品…"），
       * 折行后找不到这一条从哪个词开始。拆成 name/desc 两个字段，名用亮一档的色，
       * 读起来是**词条**而不是七个句子。
       */
      { icon: <Coins size={12} />, name: '金币', desc: '购买商品、修理、补给、招募、购船、发工资' },
      { icon: <Utensils size={12} />, name: '食物', desc: '航行中每日消耗，耗尽后士气下降' },
      { icon: <Droplets size={12} />, name: '淡水', desc: '航行中每日消耗，耗尽后士气下降' },
      { icon: <Heart size={12} />, name: '士气', desc: '低于 45 有哗变风险，降至 0 则游戏结束（参观模式不会结束）' },
      { icon: <Shield size={12} />, name: '耐久', desc: '船只生命值，全部归零则游戏结束（参观模式不会结束）' },
      { icon: <Users size={12} />, name: '船员', desc: '人手不足会掉速，死亡会削弱舰队' },
      { icon: <Trophy size={12} />, name: '声望', desc: '港口交易优惠的源头，也是部分结局的门槛' },
    ],
  },
  {
    title: '港口休整',
    icon: <Anchor size={14} />,
    items: [
      '休整一日：消耗少量补给，士气 +10，时间推进一天',
      '甲板盛宴：150 金币 + 食物淡水，士气 +30、声望 +2',
      '长途航行前把士气养满——海上的事件对低士气舰队更狠',
    ],
  },
  {
    title: '贸易技巧',
    icon: <Package size={14} />,
    items: [
      '每个港口都有便宜的特产和高价的渴求品',
      '绿色价格 = 该货在全港买价最低，红色 = 全港最高（金色是居中）',
      '大额买入会推高当地价格，看准库存再下手',
      '跨洲贸易利润最高：加勒比的糖酒、东方的香料丝绸',
    ],
  },
  {
    title: '事件与收集',
    icon: <Flame size={14} />,
    items: [
      '每个事件都配有场景插图，你的每个选择都会写进航海日志',
      '海上偶遇的"海图残片"散落于加勒比/非洲/亚洲，集齐三块可解锁"完整的藏宝图"（成就：寻宝猎人）',
      '幽灵船登船探查会引来后续事件；走私交易同样有下文——有些选择会生根',
      `成就殿堂记录你的生涯统计，${achievements.length} 项成就等待解锁`,
    ],
  },
  {
    title: '航海见闻',
    icon: <Newspaper size={14} />,
    items: [
      '左侧「见闻」面板实时追踪三位竞争船长的财富、声望与探索',
      '每隔几天就有他们的新传闻飘进酒馆——有人暴富，有人触礁',
      '斜线后的数字是同代最强：被追上就加把劲，甩开了也别松懈',
    ],
  },
  {
    title: '航行提示',
    icon: <Moon size={14} />,
    items: [
      '危险等级越高，遇到奇遇和灾难的概率都越大，海图也会随之风雨交加',
      '出发前备足补给、补满船员，旅途会更从容',
      '开风带图层看风向：顺风能省下近一半时间',
      '随时可以在港口休整，不必赶路',
    ],
  },
]

export default function HelpPanel() {
  const setShowHelp = useGameStore(s => s.setShowHelp)
  const resetGame = useGameStore(s => s.resetGame)
  const gameMode = useGameStore(s => s.gameMode)
  // 19 节帮助一次全摊开是 2762 字、要滚四屏。玩家打开帮助是来找某一件事，
  // 不是通读手册：默认只给目录，点哪节开哪节，一次只开一节。
  // 内容一条不删，只是「此刻不看的先不摆出来」。
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState('')
  /** 两阶段导入：先读文件给玩家看清是哪一天的存档，再让他确认覆盖 */
  const [pendingImport, setPendingImport] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许连续选同一个文件
    if (!file) return
    const text = await file.text()
    const parsed = parseSaveText(text)
    if (parsed.ok === false) {
      setPendingImport(null)
      setSaveMsg(parsed.error)
      return
    }
    const fleet = parsed.value.state.fleet as Record<string, unknown> | undefined
    const day = typeof fleet?.day === 'number' ? fleet.day : '?'
    setPendingImport(text)
    setSaveMsg(`读到第 ${day} 天的存档。确认后会覆盖当前进度，建议先导出一份。`)
  }

  const doImport = () => {
    if (!pendingImport) return
    const result = applySaveText(pendingImport)
    if (result.ok === false) {
      setSaveMsg(result.error)
      return
    }
    // reload 走的是 persist 的 rehydrate + migrate，和刷新页面完全同一条读档路径
    window.location.reload()
  }

  return (
    /*
     * 【整屏手册，不是侧板】
     * 这块原来和四个操作面板一样是 320px 的右侧浮窗（手机上是底部抽屉）。
     * 2026-11-17 四个面板统一成整屏之后，侧栏那一列按钮里就只剩「帮助」
     * 还会弹一个窄窗 —— 同一列按钮，形态又分了两种。
     *
     * 改成整屏时顺手把结构也换了：19 节折叠目录原来竖着堆在正文里，
     * 展开一节就把下面的目录全部挤下去；1024 宽下正文被拉成长长的一列。
     * 现在目录固定在左栏（19 节两行就能排完），正文在右栏替换显示 ——
     * 它更接近"一本手册"，而不是"一条很长的手风琴"。
     */
    <FullScreenPanel
      testId="help-panel"
      /*
       * 宽度档从 lg(1024) 降到 md(768) —— 与「舰队」「造船」同一档。
       * 实测 1440 下：lg 的正文栏 800px、13px 中文一行排 61 个字，读起来是一"面"
       * 字而不是一条一条；收成 wide(896) 后正文 544（41 字/行）是对的，
       * 但右侧空出 590px，整屏读作"页面没写完"。md 把内容收成 688 的居中栏：
       * 目录 240 + 正文 416（32 字/行，等于一本中文书的一栏），
       * 两侧留白由"没填满"变成"居中的一页纸"——这是 FullScreenPanel 里
       * 已经写下的分档规则（读文类 768 / 账本类 1024），帮助过去是唯一越档的。
       */
      width="md"
      title="航海指南"
      subtitle="十九节 · 点左边任一节展开"
      footer="存档只在这台设备的浏览器里，不上传、不关联账号"
      onClose={() => setShowHelp(false)}
    >
      <div className="grid gap-5 md:gap-8 md:grid-cols-[15rem_minmax(0,1fr)] items-start">
        {/* 左栏：目录 */}
        <nav aria-label="目录" className="min-w-0 md:sticky md:top-0">
          <div className="grid grid-cols-2 md:grid-cols-1 gap-x-2 gap-y-0.5">
            {sections.map((section) => {
              const open = openSection === section.title
              return (
                <button
                  key={section.title}
                  type="button"
                  aria-expanded={open}
                  data-testid={`help-section-${section.title}`}
                  onClick={() => setOpenSection(open ? null : section.title)}
                  className={`w-full min-h-[34px] flex items-center gap-1.5 px-2 py-1.5 rounded-sm
                    text-left font-serif text-[13px] press transition-colors ${
                      open
                        ? 'side-plate--active text-gold-100'
                        : 'text-gold-400 hover:text-gold-200 hover:bg-gold-700/15'
                    }`}
                >
                  {/*
                    这里原来每一行右端都挂一个 ChevronDown（19 个一模一样的 ∨）：
                    它既不是菜单（不会弹出）、也不是手风琴组（一次只开一节），
                    19 个箭头只是把目录读成一列下拉框。选中态由左侧金条 +
                    亮一档的字说明，箭头不再承担任何信息。
                  */}
                  <span className="shrink-0 opacity-80" aria-hidden="true">{section.icon}</span>
                  <span className="truncate min-w-0">{section.title}</span>
                </button>
              )
            })}
          </div>
        </nav>

        {/* 右栏：展开的那一节 + 存档 + 换模式 */}
        <div className="min-w-0">
          {openSection ? (
            <div data-testid="help-section-body">
              {/*
                节头三件事按关系排：图标与节名是同一件（这一节叫什么），
                条数是"这一节能读多久"的预告，靠右单独一列。
                字号从 15 提到 17：原来只比正文大 2px，在 800px 宽的一列里
                节名与第一条几乎连成一段（截图里"基本操作"像个粗一点的行首）。
              */}
              <h3 className="flex items-baseline gap-2 pb-2.5 mb-3.5 border-b border-gold-700/30">
                <span aria-hidden="true" className="text-gold-500 shrink-0">{sections.find(s => s.title === openSection)?.icon}</span>
                <span className="text-gold-200 font-serif text-[17px] tracking-[0.02em]">{openSection}</span>
                <span className="ml-auto shrink-0 text-[12px] font-serif text-gold-600 tabular-nums">
                  {(sections.find(s => s.title === openSection)?.items ?? []).length} 条
                </span>
              </h3>
              {/* 条目间距 10px：行高提到 1.85 之后，8px 会让两条的末行与首行黏成一段 */}
              <ul className="space-y-2.5">
                {(sections.find(s => s.title === openSection)?.items ?? []).map((item, i) => {
                  if (typeof item === 'string') {
                    return <Row key={i} marker={DOT}>{inline(item)}</Row>
                  }
                  return (
                    <Row key={i} marker={item.icon}>
                      <span className="text-gold-300">{item.name}</span>
                      <span className="text-gold-600">：</span>
                      {item.desc}
                    </Row>
                  )
                })}
              </ul>
            </div>
          ) : (
            /*
             * 空态原来是一个带边框的小方框（416×90），和下面的存档框长得
             * 一模一样 —— 两个同材质的框上下叠着，一个"等你挑一节"、
             * 一个"能点按钮"，读起来像两件事并列。空态不是一块**内容**，
             * 是这一栏还没翻到某一页：去掉边框与底，只留一个图标和一句话，
             * 那它就不会跟下面那块真正可操作的区域抢分量。
             */
            <div className="py-12 text-center">
              <Compass size={22} className="mx-auto text-gold-600/60" aria-hidden="true" />
              <p className="text-gold-400 font-serif text-[13px] mt-2.5">挑一节看看</p>
            </div>
          )}

          {/*
            存档：零服务端、无账号，进度只在这台设备的浏览器里。
            一旦游戏承诺「日志会一页页变厚」，就得同时给一个能带走它的办法，
            否则清一次缓存，承诺就成了假话。不写"我们不收集任何数据"——
            托管平台本来就会记录访问日志，能说清的只有"存档不上传"。

            【为什么收进一块凹陷的框里】
            右栏上面是"手册正文"，下面是"能对这个存档做的事"——两种内容原来
            只隔一条 1px 线，字一样大、一样色，读起来像是第 20 节。
            框（inlay：凹底 + 细边、不投影）在这个项目里的语义是"清单/操作区"
            （舰队面板同款），一眼就能把"读的"与"做的"分开。
          */}
          <section
            aria-label="存档与开局"
            className="mt-8 rounded-sm border border-gold-700/25 bg-black/25 px-4 py-3.5"
          >
            <h4 className="text-gold-300 font-serif text-[13px] mb-1.5 flex items-center gap-1.5">
              <Download size={13} aria-hidden="true" /> 把这本日志带走
            </h4>
            <p className="text-gold-500 text-[12px] font-serif leading-relaxed">
              存档只在浏览器里，清缓存或换设备都会丢；导出的 JSON 可读回来。
            </p>
            <div className="grid grid-cols-2 gap-1.5 mt-2">
              <button
                type="button"
                onClick={() => setSaveMsg(downloadSave() ? '已导出一份存档文件，收好它。' : '本机还没有存档可以导出。')}
                className="min-h-[40px] px-1 py-2 text-[12px] font-serif text-gold-300 hover:text-gold-100 border border-gold-600/40 rounded-lg press transition-all"
                data-testid="save-export"
              >
                <Download size={12} className="inline -mt-0.5 mr-1" aria-hidden="true" />
                导出存档
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="min-h-[40px] px-1 py-2 text-[12px] font-serif text-gold-400 hover:text-gold-200 border border-gold-700/25 rounded-lg press transition-all"
                data-testid="save-import"
              >
                <Upload size={12} className="inline -mt-0.5 mr-1" aria-hidden="true" />
                导入存档
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={onPickFile}
              data-testid="save-import-input"
            />
            {pendingImport && (
              <button
                type="button"
                onClick={doImport}
                className="w-full min-h-[40px] mt-1.5 py-2 text-[12px] font-serif text-danger-300 hover:text-danger-200 border border-danger-500/45 rounded-lg press transition-all"
                data-testid="save-import-confirm"
              >
                确认覆盖当前进度并读入
              </button>
            )}
            {saveMsg && (
              <p className="text-gold-300 text-[12px] font-serif mt-1.5 leading-relaxed" role="status">{saveMsg}</p>
            )}

            {/* 换模式：重开一局会清掉当前进度，所以话说在前面 */}
            <div className="mt-3 pt-3 border-t border-gold-700/25">
              <button
                onClick={() => { setShowHelp(false); resetGame() }}
                className="w-full py-2 text-[12px] font-serif text-gold-400 hover:text-gold-200 border border-gold-700/25 rounded-lg press transition-all"
              >
                <RotateCcw size={11} className="inline -mt-0.5 mr-1" aria-hidden="true" />
                换个玩法（重开一局 · 当前进度会清空）
              </button>
              <p className="text-gold-400 text-[12px] font-serif text-center mt-1">
                当前：{gameMode === 'visitor' ? '参观模式' : '船长模式'}
              </p>
            </div>
          </section>
        </div>
      </div>
    </FullScreenPanel>
  )
}
