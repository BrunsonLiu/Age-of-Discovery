import { useEffect, useState } from 'react'
import { Anchor, ArrowLeft, BookOpen, Hammer, MapPin, Package, Scroll } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports, portGoods } from '@/data/ports'
import { goods } from '@/data/goods'
import { harborBackdrop } from '@/data/portImages'
import { REGION_CN, echoForPort } from '@/data/logbook'
import { UI_ASSETS } from '@/data/uiAssets'
import { arrivalCountAt, clueCenter, hasAnyService, latestArrivalAt, previousArrivalAt } from '@/utils/harbor'
import { DURATION, EASE_STANDARD, prefersReducedMotion } from '@/utils/motion'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { PanelType } from '@/types'

/**
 * 岸上视角：游戏的第二个空间。
 *
 * 【为什么需要它】实测 1440×900 下地图容器占屏 100%，8 个面板全是同一个
 * ParchmentCard / 同一个 320px / 同一个滑入动画；13 张 1600×900 的港口图
 * 被压成 294×96（原面积 1.96%）。玩家从第 1 分钟到第 30 分钟看到的是
 * 同一个景别、同一个尺度、同一个容器 —— 这才是"单调"的来源，不是内容不够。
 *
 * 这里做两件事：
 * 1. 空间分层：海图（船上看世界）/ 岸上（走入港口），一次明确的景别切换；
 * 2. 画面分层：远景港口大图 → 中景见闻与服务 → 前景码头剪影。
 *
 * 【三条克制】
 * · 不自动进入。到港只在港口面板里给一个入口，玩家不点就一直留在海图。
 *   全屏视图一旦自动弹出就成了新的"打断"，与「不累」相冲突。
 * · 不锁玩家。侧栏 / 底栏 / 时间轴的 z 都高于本层，所有面板照常能开；
 *   面板浮在岸上画面上，正好是第三层，不需要另写一套交互。
 * · 不编内容。见闻取日志里该港最新一页，没有就直说"还没写下第一页"；
 *   服务入口按 port.services 过滤，说了能修船，点进去就必须真能修。
 *
 * 【素材硬约束】port_images.ts 自己写明：这批图约 800×220 插值放大到
 * 1600×900，放大看会软。所以只把它铺成**被压暗的中景**、主体占上半屏，
 * 下半屏由深褐渐变与前景剪影吃掉，绝不做贴脸全屏。原生大图到位后
 * 直接换同名文件即可，本组件不用改。
 */

type ServiceKey = 'trade' | 'port' | 'shipyard' | 'tavern' | 'logbook'

interface HarborService {
  key: ServiceKey
  label: string
  sub: string
  icon: typeof Package
  /** null = 任何港口都有（酒馆、日志不看港口设施） */
  needs: readonly string[] | null
  panel: NonNullable<PanelType>
}

const SERVICES: readonly HarborService[] = [
  { key: 'trade', label: '商行', sub: '看行情 · 买卖货物', icon: Package, needs: ['trade'], panel: 'trade' },
  { key: 'port', label: '港务', sub: '补给 · 修理 · 招募', icon: Anchor, needs: ['supply', 'repair', 'recruit'], panel: 'port' },
  { key: 'shipyard', label: '造船厂', sub: '修船 · 添置新船', icon: Hammer, needs: ['shipyard'], panel: 'shipyard' },
  { key: 'tavern', label: '酒馆', sub: '听听最近的传闻', icon: Scroll, needs: null, panel: 'task' },
  { key: 'logbook', label: '航海日志', sub: '翻翻带回的见闻', icon: BookOpen, needs: null, panel: 'event' },
]

const PLATE_STYLE: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(46,33,19,0.95) 0%, rgba(27,19,10,0.97) 100%)',
  border: '1px solid rgba(206,172,108,0.55)',
  boxShadow: [
    'inset 0 0 0 3px rgba(18,12,5,0.88)',
    'inset 0 1px 0 rgba(255,246,214,0.22)',
    '0 18px 46px rgba(0,0,0,0.72)',
  ].join(', '),
}

/**
 * 前景：码头剪影。纯几何，不接点击，也不随内容滚动。
 *
 * 【颜色别和背景同色】第一版整块用 #160e07，而背景渐变末尾压到 0.96 的近黑，
 * 剪影和背景几乎同一个值 → 截图里完全读不出来（项目里已经犯过四次
 * "同色画实心块"的坑）。现在剪影压到近黑，但**边缘给一道赭石高光线**，
 * 并把背景渐变末尾收到 0.78，让轮廓靠明度差显形。
 */
function HarborForeground() {
  /* bottom 18%：剪影要压在**还亮着的**城市上才有对比。
     第一版贴 bottom-0，落在已经压到近黑的下缘，桩和背景差值太小，
     截图里等于没有——"前景"不是"贴屏幕底"，是"挡在画面前面"。 */
  return (
    <svg
      className="absolute bottom-[18%] left-0 w-full h-[164px] pointer-events-none select-none"
      viewBox="0 0 1440 164"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <g fill="#0b0704">
        <path d="M0 122 H1440 V164 H0 Z" />
        {[96, 318, 1128, 1342].map(x => (
          <g key={x}>
            <rect x={x} y={82} width={22} height={48} rx={3} stroke="#a8864c" strokeOpacity="0.38" strokeWidth="1.5" />
            <rect x={x - 6} y={77} width={34} height={10} rx={4} stroke="#a8864c" strokeOpacity="0.38" strokeWidth="1.5" />
          </g>
        ))}
        <path d="M1316 164 L1368 32 L1380 32 L1334 164 Z" />
        <path d="M1368 34 L1248 122 L1255 122 L1374 40 Z" />
      </g>
      <path d="M0 122 H1440" stroke="#a8864c" strokeOpacity="0.5" strokeWidth="2.5" fill="none" />
      <path d="M107 86 Q 208 136 318 86" stroke="#0b0704" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M107 86 Q 208 136 318 86" stroke="#a8864c" strokeOpacity="0.28" strokeWidth="1" fill="none" />
      <path d="M1139 86 Q 1240 138 1342 86" stroke="#0b0704" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M1139 86 Q 1240 138 1342 86" stroke="#a8864c" strokeOpacity="0.28" strokeWidth="1" fill="none" />
      <path d="M1368 34 L1280 118" stroke="#0b0704" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

export default function HarborView() {
  // 前景剪影是纯装饰：手机屏幕几乎被两块内容板占满，底部又有多行底栏，
  // 剪影放在那儿永远被盖住。按项目纪律用 JS 条件渲染，不用 CSS 藏一个空容器。
  const isMobile = useIsMobile()
  const fleet = useGameStore(s => s.fleet)
  const logbook = useGameStore(s => s.logbook)
  const setActivePanel = useGameStore(s => s.setActivePanel)
  const setViewMode = useMapStore(s => s.setViewMode)
  const setDeckView = useMapStore(s => s.setDeckView)
  const setCenter = useMapStore(s => s.setCenter)
  const setSelectedPortId = useMapStore(s => s.setSelectedPortId)

  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (prefersReducedMotion()) { setShown(true); return }
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // 键盘退路（Esc 一层层退 / A 切换）统一在 useKeyboardControls 里，
  // 这里不再自己监听：否则面板开着按 Esc 会同时关面板又回海图。

  const port = ports.find(p => p.id === fleet.currentPortId)
  const entry = port ? latestArrivalAt(logbook, port.id) : null
  const visits = port ? arrivalCountAt(logbook, port.id) : 0
  const previous = port ? previousArrivalAt(logbook, port.id) : null
  // 曾经指向这座港的线索若已应验，把那一页摆回岸上：回来时有个东西在等你，
  // 而且这次是"上回那句话有了下文"，不是又一张新面板。文案直接取应验页，
  // 不在两处各拼一句（日志、通知、岸上必须说的是同一件事）。
  const echo = echoForPort(logbook, port?.id ?? null)
  // 只报风物名，不报价：岸上这一屏是"这地方什么样"，不是让玩家算账。
  // 口径是「本港比基准便宜」(modifier < 1)，不是贸易面板的 localSpecialties(<=0.75)：
  // 后者是"全港最低价档"，塞维利亚/里斯本这类集散中心的特产全是 0.85，
  // 会被判成"无特产"落到「以转运为业」，和它们产火炮火枪丝绸的设定对不上。
  const specialties = port
    ? portGoods
        .filter(pg => pg.portId === port.id && pg.priceModifier < 1)
        .slice(0, 3)
        .map(pg => goods.find(g => g.id === pg.goodId)?.nameCn)
        .filter((x): x is string => !!x)
    : []
  // 整屏背景取全景图，不拿面板缩略图放大（见 data/portImages.ts 的 harborBackdrop）
  const backdrop = port ? harborBackdrop(port) : undefined
  const reduced = prefersReducedMotion()
  const enterStyle: React.CSSProperties = reduced
    ? { opacity: 1 }
    : {
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(14px)',
        transition: `opacity ${DURATION.grand}ms ${EASE_STANDARD}, transform ${DURATION.grand}ms ${EASE_STANDARD}`,
      }

  const backToChart = () => setViewMode('chart')

  const followClue = () => {
    const center = clueCenter(entry?.targetPortId ?? null)
    if (center) {
      // 与日志面板里的「在地图上看看」同一套判定：只移地图，不替玩家出航
      setCenter(center)
      setSelectedPortId(entry?.targetPortId ?? null)
    }
    backToChart()
  }

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ ...enterStyle, backgroundColor: '#140d06' }}
      data-testid="harbor-view"
      role="region"
      aria-label="岸上视角"
    >
      {/* ── 远景：港口大图 + 天光 + 暗角 ───────────────────────────── */}
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          aria-hidden="true"
          data-testid="harbor-backdrop"
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            objectPosition: 'center 38%',
            transform: 'scale(1.03)',
            // 压暗要留住"这是什么地方"。原来 brightness .82 + saturate .72 再把
            // 边缘暗角叠到 0.73，实测右下水面亮度只剩 0.08（素材本身 0.49），
            // 等于花钱接了一张高清全景、屏幕上却是一块褐糊。
            // 现在只做"远景退后"该有的那点压暗：文字都坐在不透明面板里，
            // 背景亮一档并不影响读数（对比度审计实测过）。
            filter: 'brightness(0.88) saturate(0.85) contrast(1.04)',
          }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(18,12,6,0.52) 0%, rgba(18,12,6,0.04) 30%, rgba(18,12,6,0.38) 66%, rgba(12,8,4,0.62) 100%)',
        }}
      />
      {/* 远/中景之间的一层天光：把地平线附近提亮一点，城市才不会和
          压暗的天空糊成一张平面。用大半径径向渐变，不产生可见接缝。 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 70% 42% at 50% 26%, rgba(226,196,140,0.13) 0%, rgba(226,196,140,0) 72%)',
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          // 暗角是"退后"的主要手段，但 0.92 的收口把四角压成纯黑，
          // 而两块面板已经盖住画面中间——玩家能看见的景恰好全在边缘。
          background: 'radial-gradient(ellipse at 50% 38%, rgba(20,13,6,0.06) 0%, rgba(20,13,6,0.40) 72%, rgba(10,7,3,0.74) 100%)',
        }}
      />

      {/* ── 中景：地点铭牌 / 见闻 / 服务入口 ──────────────────────── */}
      {/*
            滚动区在移动端必须**止于底栏顶部**（249px = 底部木梁 138 + 标签栏 111）。
            原来铺到 inset-0、只靠 pb-60 让位：最后一块服务（harbor-service-logbook，
            实测 y=568..632）正好藏在木梁（y 从 595 起）后面 —— elementFromPoint
            命中的是 `DIV.wood-beam--foot`，玩家点不到，而且**不滚动就不知道它在**。
            桌面端仍铺满（底部只有 52px 的底栏，pb-40 已经够）。
          */}
          <div className="absolute inset-x-0 top-0 bottom-[249px] md:bottom-0 overflow-y-auto overscroll-contain px-4 md:px-28 pt-12 md:pt-16 pb-8 md:pb-40">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-start justify-between gap-3 mb-4 md:mb-6">
            <div className="flex items-center gap-2 text-gold-300 font-serif text-[13px]">
              <Anchor size={15} aria-hidden="true" />
              <span>岸上 · 第 {fleet.day} 天</span>
              <span className="text-gold-500">/</span>
              <span className="text-gold-400">已靠岸</span>
            </div>
            <button
              onClick={backToChart}
              data-testid="harbor-back-to-chart"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[13px] font-serif
                text-gold-100 border border-gold-600/55 bg-black/45 hover:bg-gold-700/35 press transition-colors"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              回海图 · 准备出航
            </button>
          </div>

          {/* 两档要分开：
              · 手机（column）：交叉轴是宽度，必须 stretch 才撑满，否则服务板
                会缩到内容宽（实测 358px 屏上只占 270px，右边露出一条背景）；
              · 桌面（row）：交叉轴是高度，必须 items-start 才各自按内容取高。
                之前一律 stretch，见闻板被拉到和服务板等高，凭空多出 100px 空白。 */}
          <div className="flex flex-col md:flex-row items-stretch md:items-start gap-4 md:gap-6">
            {/* 见闻板：这趟带回的那一页，直接接上航海日志 */}
            <section
              className="relative rounded-lg p-4 md:p-6 md:w-[54%] shrink-0"
              style={PLATE_STYLE}
              data-testid="harbor-arrival-plate"
            >
              <div
                className="absolute inset-0 pointer-events-none rounded-lg"
                style={{ backgroundImage: `url(${UI_ASSETS.parchment})`, backgroundSize: 'cover', opacity: 0.06 }}
              />
              <div className="relative">
                <p className="text-gold-400 font-serif text-[12px] tracking-[0.2em] mb-1">
                  {port ? (REGION_CN[port.region] ?? port.region) : '未知海域'}
                </p>
                <h1 className="font-pirate text-[28px] md:text-[34px] leading-tight text-gold-100 tracking-wide">
                  {port?.nameCn ?? '无名海岸'}
                </h1>
                <p className="text-gold-400 font-serif text-[13px] mt-0.5">{port?.name}</p>
                {/* 13 张港口图要覆盖 20 港，同区域共用一张。铭牌这几行让"又回到这里"
                    和"这地方产什么"始终有可见差异，不靠换图也能认出是哪座港。 */}
                <p className="text-gold-400 font-serif text-[12px] mt-2">
                  {specialties.length > 0 ? `此地风物 · ${specialties.join('、')}` : '此地以转运为业'}
                  {visits > 1 && <span className="text-gold-300"> · 第 {visits} 次靠岸</span>}
                </p>

                <div className="mt-4 pt-3 border-t border-gold-700/40">
                  {entry ? (
                    <>
                      <p className="text-gold-500 font-serif text-[12px] mb-1.5">
                        第 {entry.day} 天写下的一页 · {entry.title}
                      </p>
                      <p className="text-gold-200 font-serif text-[14px] leading-relaxed">{entry.text}</p>
                      <p className="text-gold-400 font-serif text-[12px] italic mt-2">{entry.aside}</p>
                      {entry.hint && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="text-gold-300 font-serif text-[13px]">{entry.hint}</span>
                          <button
                            onClick={followClue}
                            data-testid="harbor-clue"
                            className="inline-flex items-center gap-1 text-[12px] font-serif text-gold-100
                              border border-gold-600/50 rounded px-2 py-1 press hover:bg-gold-700/30 transition-colors"
                          >
                            <MapPin size={12} aria-hidden="true" />
                            在地图上看看
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-gold-200 font-serif text-[14px] leading-relaxed">
                        {port?.description ?? '这里还没有写下见闻。'}
                      </p>
                      <p className="text-gold-400 font-serif text-[12px] mt-2">
                        下一趟靠岸，日志里就会多一页。
                      </p>
                    </>
                  )}
                  {echo && (
                    <div
                      data-testid="harbor-clue-echo"
                      className="mt-3 rounded border border-gold-400/45 bg-gold-700/15 px-2.5 py-2"
                    >
                      <span className="block text-gold-300 font-serif text-[12px] mb-1">
                        上回那句话，应验了 · 第 {echo.day} 天
                      </span>
                      <p className="text-gold-200 font-serif text-[13px] leading-relaxed">{echo.text}</p>
                    </div>
                  )}
                  {/* 第二趟起，把上一趟留下的那页摆在当前页下面。
                      「日志越来越厚」必须在这里看得见，否则每趟都是一页孤零零的新文字，
                      旧页沉进列表就再也想不起来。只展示标题，不重复长正文。 */}
                  {previous && (
                    <button
                      onClick={() => setActivePanel('event')}
                      data-testid="harbor-previous-visit"
                      className="mt-3 w-full text-left rounded border border-gold-700/45 bg-black/25
                        px-2.5 py-2 press hover:bg-gold-700/20 transition-colors"
                    >
                      <span className="block text-gold-400 font-serif text-[12px]">
                        上一趟 · 第 {previous.day} 天留下的
                      </span>
                      <span className="block text-gold-200 font-serif text-[13px] mt-0.5">
                        {previous.title}
                      </span>
                      <span className="block text-gold-400 font-serif text-[12px] mt-0.5">
                        翻开航海日志看看 →
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </section>

            {/* 服务板：入口按本港真实设施过滤 */}
            <section
              className="relative rounded-lg p-4 md:p-5 flex-1"
              style={PLATE_STYLE}
              data-testid="harbor-services"
            >
              <div
                className="absolute inset-0 pointer-events-none rounded-lg"
                style={{ backgroundImage: `url(${UI_ASSETS.parchment})`, backgroundSize: 'cover', opacity: 0.06 }}
              />
              <div className="relative">
                <h2 className="text-gold-300 font-serif text-[14px] mb-1">在城里</h2>
                <p className="text-gold-500 font-serif text-[12px] mb-3">想去哪儿都可以，也可以直接回船上。</p>
                <div className="grid grid-cols-2 gap-2">
                  {SERVICES.filter(s => s.needs === null || (port && hasAnyService(port.services, s.needs))).map(s => {
                    const Icon = s.icon
                    return (
                      <button
                        key={s.key}
                        onClick={() => setActivePanel(s.panel)}
                        data-testid={`harbor-service-${s.key}`}
                        className="text-left rounded border border-gold-700/45 bg-black/30 px-2.5 py-2.5
                          hover:bg-gold-700/25 hover:border-gold-600/70 press transition-colors"
                      >
                        <span className="flex items-center gap-1.5 text-gold-100 font-serif text-[14px]">
                          <Icon size={15} aria-hidden="true" />
                          {s.label}
                        </span>
                        <span className="block text-gold-400 font-serif text-[12px] mt-1 leading-snug">{s.sub}</span>
                      </button>
                    )
                  })}
                </div>
                {/*
                  【从码头走上船】岸上是画出来的景（素材就是 1600×900 的油画），
                  但"船"的那一头是**真的 3D**。与其把岸也做成立体模型（那批港口
                  素材本身就是远景），不如把两个空间接起来：从这里一步跨到甲板上，
                  空间感就由"船"来承担。
                */}
                <button
                  onClick={() => { setViewMode('chart'); setDeckView(true) }}
                  data-testid="harbor-go-deck"
                  /* 小屏先让位：手机上这张服务板本来就紧，多一块会把最后一个服务入口
                     顶到底栏底下（实测 5 个入口里有一个点不中）。手机上"回船上"走底栏
                     的空间开关，桌面再给这块跳板。 */
                  className="hidden md:block mt-2 w-full text-left rounded border border-gold-600/55 bg-black/30 px-2.5 py-2
                    hover:bg-gold-700/25 press transition-colors"
                >
                  <span className="flex items-center gap-1.5 text-gold-100 font-serif text-[14px]">
                    <Anchor size={15} aria-hidden="true" />
                    上船看看
                  </span>
                  <span className="block text-gold-400 font-serif text-[12px] mt-1 leading-snug">
                    踩着跳板回到甲板 · 从水面上看这座港
                  </span>
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* ── 前景：码头剪影，压住画面下缘，不接任何点击 ─────────────── */}
      {!isMobile && <HarborForeground />}
    </div>
  )
}
