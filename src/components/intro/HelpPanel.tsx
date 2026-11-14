import { useRef, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import ParchmentCard from '@/components/ui/ParchmentCard'
import { Anchor, ChevronDown, Coins, RotateCcw, Compass, Download, Droplets, Flame, Globe, Heart, HelpCircle, Keyboard, Moon, Newspaper, Package, Shield, Ship, Sparkles, Tag, Trophy, Upload, Users, Utensils, Wind } from 'lucide-react'
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
      '“黑帆”杰克、“白银”玛丽亚、“星眸”迭戈也在同一片海上讨生活——生涯回顾里看同代船长座次。',
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
      '港口酒馆可招募三名军官：老领航员（航速 +15%）、大副（士气打击减半）、船医（坏血病脚步放慢、每日士气衰减 -2）',
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
      '左侧一列按钮：舰队 / 任务 / 日志 / 成就 / 见闻——每个按钮都带中文名，不用猜图标',
      '「日志」分三页：见闻（每趟带回的那一页）、图鉴（点亮的港口与拾遗）、记事（按天写的船长日记）',
      '右侧一列最上方是「海图 ↔ 岸上」开关（手机在底部第一格）：一直都在，随时来回切；航行中会变灰',
      '靠港后点「上岸走走」：收起海图，走进港口近景，翻这趟带回的见闻，或直接去商行、船厂、酒馆',
      '到港会有一条 9 秒自动收起的小提示，不理它也不挡路；见闻里的线索不过期，不做也不罚',
      '点击地图设定航向后，在「出航计划」里确认才升起旗帜',
      '起航后每段航程开始时先选一次「航段方针」，再进「操舵挑战」——方针是你唯一的速度旋钮，操舵可以跳过',
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
      '声望到档解锁势力特权（舰队面板会写"还差几点"）：商会买卖优惠、学者情报半价、王室交易优惠、兄弟会自家港口折扣',
      '任一派系敌对（≤-30）时，该派系的折扣全部失效——账是要还的',
      '（势力特权还在补齐：王家合约、黑市、护航尚未实装，面板上不会出现它们）',
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
      '善待他们，他们会在航海日志里、在战斗中、在生涯回顾里回报你',
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
      '称号只带一点很轻的永久效果（目前实装：贪婪者毛利 +4%），它主要是"后世怎么记载你"',
      '生涯回顾会给出"后世如何记载你"：称号、四方账目、与你共度此生的伙伴名单',
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
      { icon: <Coins size={12} />, text: '金币：购买商品、修理、补给、招募、购船、发工资' },
      { icon: <Utensils size={12} />, text: '食物：航行中每日消耗，耗尽后士气下降' },
      { icon: <Droplets size={12} />, text: '淡水：航行中每日消耗，耗尽后士气下降' },
      { icon: <Heart size={12} />, text: '士气：低于 45 有哗变风险，降至 0 则游戏结束（参观模式不会结束）' },
      { icon: <Shield size={12} />, text: '耐久：船只生命值，全部归零则游戏结束（参观模式不会结束）' },
      { icon: <Users size={12} />, text: '船员：人手不足会掉速，死亡会削弱舰队' },
      { icon: <Trophy size={12} />, text: '声望：港口交易优惠的源头，也是部分结局的门槛' },
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
    <div className="w-full md:w-80 animate-slide-in-right" data-testid="help-panel">
      <ParchmentCard
        title="航海指南"
        onClose={() => setShowHelp(false)}
        footer={
          <>
          {/*
            存档：零服务端、无账号，进度只在这台设备的浏览器里。
            一旦游戏承诺「日志会一页页变厚」，就得同时给一个能带走它的办法，
            否则清一次缓存，承诺就成了假话。不写"我们不收集任何数据"——
            托管平台本来就会记录访问日志，能说清的只有"存档不上传"。
          */}
          <div className="mt-3 pt-3 border-t border-gold-700/30">
            <h4 className="text-gold-300 font-serif text-[13px] mb-1.5 flex items-center gap-1.5">
              <Download size={13} /> 把这本日志带走
            </h4>
            <p className="text-gold-500 text-[12px] font-serif leading-relaxed">
              存档只存在这台设备的浏览器里，不上传、不关联账号。清缓存、换设备、无痕模式都会丢，
              导出的 JSON 文件可以在别的设备读回来。
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
          </div>

          {/* 换模式：重开一局会清掉当前进度，所以话说在前面 */}
          <div className="mt-3 pt-3 border-t border-gold-700/30">
            <button
              onClick={() => { setShowHelp(false); resetGame() }}
              className="w-full py-2 text-xs font-serif text-gold-400 hover:text-gold-200 border border-gold-700/25 rounded-lg press transition-all"
            >
              <RotateCcw size={11} className="inline -mt-0.5 mr-1" aria-hidden="true" />
              换个玩法（重开一局 · 当前进度会清空）
            </button>
            <p className="text-gold-400 text-[12px] font-serif text-center mt-1">
              当前：{gameMode === 'visitor' ? '参观模式' : '船长模式'}
            </p>
          </div>
          </>
        }
      >
        <div className="pr-1">
          <p className="text-gold-500 text-[12px] font-serif mb-1.5">点开想看的那一节</p>
          <div>
            {sections.map((section) => {
              const open = openSection === section.title
              return (
                <div key={section.title} className="border-b border-gold-700/20 last:border-b-0">
                  <button
                    type="button"
                    aria-expanded={open}
                    data-testid={`help-section-${section.title}`}
                    onClick={(e) => {
                      const btn = e.currentTarget
                      setOpenSection(open ? null : section.title)
                      if (!open) {
                        // 目录本身也有半屏高，不把展开的这节顶到滚动区开头，
                        // 正文会挤在目录下面只剩一行半（底部还有渐隐），等于点了没展开。
                        requestAnimationFrame(() => {
                          const scroller = btn.closest('.scroll-parchment')
                          if (!scroller) return
                          const delta = btn.getBoundingClientRect().top - scroller.getBoundingClientRect().top
                          scroller.scrollTop += delta - 4
                        })
                      }
                    }}
                    className="w-full min-h-[36px] flex items-center justify-between gap-2 py-1.5 text-left text-gold-300 font-serif text-sm hover:text-gold-100 press transition-colors"
                  >
                    <span className="flex items-center gap-1.5">{section.icon}{section.title}</span>
                    <ChevronDown size={13} aria-hidden="true" className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <div className="space-y-1.5 pl-5 pb-2.5" data-testid="help-section-body">
                      {section.items.map((item, i) => {
                        if (typeof item === 'string') {
                          return (
                            <p key={i} className="text-gold-500 text-xs font-serif leading-relaxed">
                              • {inline(item)}
                            </p>
                          )
                        }
                        return (
                          <p key={i} className="text-gold-500 text-xs font-serif leading-relaxed flex items-start gap-1.5">
                            <span className="text-gold-400 mt-0.5 flex-shrink-0">{item.icon}</span>
                            {item.text}
                          </p>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </ParchmentCard>
    </div>
  )
}
