import { useEffect, useMemo, useState } from 'react'
import { Anchor, ArrowLeft, BookOpen, Hammer, MapPin, Package, Scroll } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports, portGoods } from '@/data/ports'
import { goods } from '@/data/goods'
import { harborBackdrop } from '@/data/portImages'
import { REGION_CN, echoForPort } from '@/data/logbook'
import { UI_ASSETS } from '@/data/uiAssets'
import { arrivalCountAt, clueCenter, hasAnyService, latestArrivalAt, previousArrivalAt } from '@/utils/harbor'
import { QUAY_LAMPS, QUAY_POSTS, starFieldCss } from '@/utils/harborMood'
import { DURATION, EASE_STANDARD, prefersReducedMotion } from '@/utils/motion'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useHarborAmbience } from './useHarborAmbience'
import { quayGulls, quayWalkers } from './quayLife'
import { QUAY_BOTTOM_Y, QUAY_EDGE_Y, quayPaving, quayProjectX, quayProps, type QuayProp } from './quayDeck'
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
 * 石面色阶（由暗到亮）。上限压在 #372a1a：再亮就"贴"在画前面，
 * 但第一版用的 #140f09~#241a10 又太黑 —— 实测那一带 mean 18~23、相邻梯度 0.27，
 * 屏幕上是一块暗板。现在是 mean 30 上下、石缝与块间色差都读得出来。
 */
const SLAB_TONE = ['#241a10', '#2b2013', '#312516', '#372a1a', '#2e2214', '#281d11']

/**
 * 摆件主体颜色：**必须比石面暗**。
 * 第一版与石面同色（#1c1209~#2c1f12 vs 石面 #241a10~#372a1a），
 * 结果箱体整个消失、屏幕上只剩两个斜撑 —— 读成"地面上画了两个 X"。
 * 光从城那边（我们背后偏上）来，朝我们的这一面本来就在暗部。
 */
const PROP_TONE = ['#0f0b06', '#120d07', '#151009', '#18120a']

function QuayPropShape({ kind, x, y, w, h, tone }: QuayProp) {
  const fill = PROP_TONE[Math.min(PROP_TONE.length - 1, Math.floor(tone * PROP_TONE.length))]
  // 横向走与石面同一份透视：桶底必须落在它那排砖的缝上
  const px = (dx: number) => quayProjectX(x + dx, y + h)
  const ptop = (dx: number) => quayProjectX(x + dx, y)
  const gx = Math.min(px(0), ptop(0))
  const gw = Math.max(px(w), ptop(w)) - gx
  if (kind === 'coil') {
    // 盘好的缆绳：三圈同心椭圆。俯视看是环，侧看是几条弧 —— 画成环最省
    const cx = (gx + gw / 2)
    return (
      <g stroke="#3a2c1a" fill="none" strokeWidth={2.6} strokeLinecap="round">
        {/*
          压得很扁（ry = h*0.34）才像"盘在地上的一堆绳"：
          正圆的三层同心椭圆读成**井盖**（截图里就是这样）。
          再补一个散开的绳头，它才是"绳"而不是"环"。
        */}
        <ellipse cx={cx} cy={y + h * 0.6} rx={gw / 2} ry={h * 0.34} />
        <ellipse cx={cx} cy={y + h * 0.56} rx={gw * 0.34} ry={h * 0.22} />
        <ellipse cx={cx} cy={y + h * 0.52} rx={gw * 0.16} ry={h * 0.1} />
        <path d={`M${cx + gw * 0.46} ${y + h * 0.62} q ${gw * 0.2} ${h * 0.2} ${gw * 0.3} ${-h * 0.05}`} />
      </g>
    )
  }
  if (kind === 'barrel') {
    return (
      <g>
        {/* 接地影：没有它，桶像贴纸浮在石面上 */}
        <ellipse cx={gx + gw / 2} cy={y + h - 1} rx={gw * 0.58} ry={4} fill="#0a0603" opacity={0.55} />
        <rect x={gx} y={y} width={gw} height={h} rx={gw * 0.26} fill={fill} />
        {/* 两道铁箍：桶的辨识度全在箍上，圆角矩形本身读成"罐子" */}
        <path d={`M${gx + 1} ${y + h * 0.3} H${gx + gw - 1}`} stroke="#3a2c1a" strokeWidth={2} />
        <path d={`M${gx + 1} ${y + h * 0.68} H${gx + gw - 1}`} stroke="#3a2c1a" strokeWidth={2} />
        {/* 顶盖：一个扁椭圆，桶才是立着的圆柱 */}
        <ellipse cx={gx + gw / 2} cy={y + 1} rx={gw / 2} ry={gw * 0.16} fill="#33281b" />
      </g>
    )
  }
  // 木箱：正面 + 顶面（受光）+ 两道斜撑
  const topY = y + h * 0.2
  return (
    <g>
      <ellipse cx={gx + gw / 2} cy={y + h - 1} rx={gw * 0.62} ry={4.5} fill="#0a0603" opacity={0.55} />
      <rect x={gx} y={topY} width={gw} height={h - h * 0.2} fill={fill} />
      <path d={`M${gx} ${topY} L${gx + gw * 0.16} ${y} H${gx + gw} L${gx + gw * 0.84} ${topY} Z`} fill="#33281b" />
      <path d={`M${gx + 3} ${topY + 2} L${gx + gw - 3} ${y + h - 2}`} stroke="#1d1509" strokeWidth={2.2} />
      <path d={`M${gx + gw - 3} ${topY + 2} L${gx + 3} ${y + h - 2}`} stroke="#1d1509" strokeWidth={2.2} />
      <path d={`M${gx} ${y + h * 0.58} H${gx + gw}`} stroke="#1d1509" strokeWidth={2.4} />
    </g>
  )
}

/**
 * 前景：**我们脚下的码头**。石砌铺装 + 系缆桩 + 缆绳 + 货物 + 四盏灯。
 *
 * 【它替换掉的是什么】上一版前景是一块**纯黑的矩形**（`#0b0704`，y=122 平铺到 164），
 * 上面摞四个系缆桩和两道缆绳。实测证据：那一带整行亮度 **7.6、标准差 0.00** ——
 * 屏幕上是一条 42px 高、横贯全宽的纯色带，而且它**压在画的中间**
 * （画的下沿 18% 还露在它下面）。读起来不是"我们站在码头上"，
 * 是"画被一条黑胶带从中间勒断"。
 *
 * 【为什么改到贴底】"近景"必须挡在**一切**前面，包括画的下沿。现在它
 * `bottom-0`、高 30%，水线固定在视口 82% 处（见 `QUAY_EDGE_SCREEN_Y`）：
 * 画从 0 到 82% 完整可见，82% 以下是我们的石面（底栏再压掉最下面 6%）。
 *
 * 【为什么 `preserveAspectRatio="none"`】石面是横铺的，横向拉伸看不出来；
 * 而 16:9 屏幕上 x 与 y 的缩放比几乎相同（1440×900 是 1.0 / 1.125，
 * 1920×1080 是 1.33 / 1.35），人不会被拉变形。
 * 用 `slice` 反而会把两侧的灯裁掉（1440 宽的画面在更高的盒子里必须放大）。
 */
function HarborForeground({ lampRef, deckRef, reduced }: {
  lampRef: React.RefObject<SVGGElement | null>
  deckRef: React.RefObject<SVGRectElement | null>
  reduced: boolean
}) {
  const slabs = quayPaving()
  const props = quayProps()
  return (
    <svg
      className="absolute bottom-0 left-0 w-full h-[30%] pointer-events-none select-none"
      viewBox={`0 0 1440 ${QUAY_BOTTOM_Y}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="harbor-quay"
    >
      <defs>
        {/* 灯的光晕：中心近白、外圈暖橙到透明。用梯度而不是 blur，
            软渲染下 filter 很贵，而且像素化后梯度比 blur 干净 */}
        <radialGradient id="harbor-lamp-halo">
          <stop offset="0%" stopColor="#ffe3ae" stopOpacity="0.92" />
          <stop offset="38%" stopColor="#ffbe6c" stopOpacity="0.36" />
          <stop offset="100%" stopColor="#ff9d3c" stopOpacity="0" />
        </radialGradient>
        {/* 湿石面靠水那一带的冷光（水在反光，石面是湿的） */}
        <linearGradient id="harbor-deck-wet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#93a8ad" stopOpacity="0.15" />
          <stop offset="34%" stopColor="#6b7a7e" stopOpacity="0.045" />
          <stop offset="100%" stopColor="#5a6a6e" stopOpacity="0" />
        </linearGradient>
        {/* 水线正下方的一道暗影：画的下沿是**硬切口**，不压一道阴影就看得见一条直线 */}
        <linearGradient id="harbor-deck-edge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#050302" stopOpacity="0.88" />
          <stop offset="42%" stopColor="#050302" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#050302" stopOpacity="0" />
        </linearGradient>
        {/* 越靠近我们越暗：光在城那边，脚底下是背光的 */}
        <linearGradient id="harbor-deck-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#050302" stopOpacity="0" />
          <stop offset="52%" stopColor="#050302" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#050302" stopOpacity="0.70" />
        </linearGradient>
      </defs>

      {/* ── 码头面：石砌铺装（逐块）+ 湿光 + 近处压暗 ─────────────── */}
      <rect x="0" y={QUAY_EDGE_Y} width="1440" height={QUAY_BOTTOM_Y - QUAY_EDGE_Y} fill="#100b06" />
      {slabs.map((b, i) => {
        // 梯形而不是矩形：竖缝朝消失点收，石面才是"地面"而不是"砖墙"
        const x0 = quayProjectX(b.x, b.y)
        const x1 = quayProjectX(b.x + b.w, b.y)
        const x2 = quayProjectX(b.x + b.w, b.y + b.h)
        const x3 = quayProjectX(b.x, b.y + b.h)
        return (
          <g key={i}>
            <path
              d={`M${x0.toFixed(1)} ${b.y} L${x1.toFixed(1)} ${b.y} L${x2.toFixed(1)} ${b.y + b.h} L${x3.toFixed(1)} ${b.y + b.h} Z`}
              fill={SLAB_TONE[Math.min(SLAB_TONE.length - 1, Math.floor(b.tone * SLAB_TONE.length))]}
            />
            {/* 竖缝：只有横缝时整片读成"木板/台阶"，加上竖缝才是砌石 */}
            <path
              d={`M${x3.toFixed(1)} ${b.y + b.h} L${x0.toFixed(1)} ${b.y}`}
              stroke="#080502" strokeWidth={1.4} opacity={0.5}
            />
            {/* 上棱受光：光从城那边来，每块石头靠水的一侧亮一点。
                没有这道边，五排石头会读成"五条横线"（砌筑感丢失） */}
            <path
              d={`M${x0.toFixed(1)} ${b.y} L${x1.toFixed(1)} ${b.y} L${(x1 - 1).toFixed(1)} ${b.y + 1.6} L${(x0 + 1).toFixed(1)} ${b.y + 1.6} Z`}
              fill="#5a462c" opacity={0.28}
            />
          </g>
        )
      })}
      <rect x="0" y={QUAY_EDGE_Y} width="1440" height="34" fill="url(#harbor-deck-edge)" />
      {/* 整体压一档：石面比画的近景亮一点就会"浮"在画前面（伦敦那张画的下沿是暗水） */}
      <rect x="0" y={QUAY_EDGE_Y} width="1440" height={QUAY_BOTTOM_Y - QUAY_EDGE_Y} fill="#050302" opacity="0.16" />
      <rect x="0" y={QUAY_EDGE_Y} width="1440" height={QUAY_BOTTOM_Y - QUAY_EDGE_Y} fill="url(#harbor-deck-wet)" />
      <rect x="0" y={QUAY_EDGE_Y} width="1440" height={QUAY_BOTTOM_Y - QUAY_EDGE_Y} fill="url(#harbor-deck-shade)" />

      {/* 水线：湿石的亮边 + 一道暗缝（没有它，石面直接切进画里的水） */}
      <rect x="0" y={QUAY_EDGE_Y - 2} width="1440" height="2" fill="#6f5a36" opacity="0.22" />
      <rect x="0" y={QUAY_EDGE_Y + 1} width="1440" height="1.6" fill="#050302" opacity="0.7" />
      {/* 水浸过的那一带更深（潮线） */}
      <rect x="0" y={QUAY_EDGE_Y + 3} width="1440" height="9" fill="#070503" opacity="0.32" />

      {/*
        码头上走动的影子。
        【为什么是剪影】画里的人影我们不知道在哪儿，贴上去会踩在水里或浮在半空；
        前景这块是本项目自己画的 SVG，坐标是我们自己的 —— "人在码头上"才是真的。
        两层嵌套：外层走 X（来回），内层颠一下 Y（走路的重心起伏）。
        一个元素挂两条 transform 动画会只剩后一条，所以必须分开两层。
        脚下是水线（96）：身体整段衬在画的水与城上，比衬在石面上立得住。
      */}
      <g className="quay-walkers" aria-hidden="true">
        {quayWalkers().map((w, i) => (
          <g key={i} transform={`translate(${w.x} ${w.y})`}>
            <g
              className={reduced ? undefined : 'quay-walk'}
              style={reduced ? undefined : {
                ['--span' as string]: `${w.span}px`,
                animationDuration: `${w.sec}s`,
                animationDelay: `${w.delay}s`,
              }}
            >
              <g className={reduced ? undefined : 'quay-bob'} style={reduced ? undefined : { animationDelay: `${(i * 0.37).toFixed(2)}s` }}>
                {/*
                  人形必须**分段**画：腿（两条竖条）+ 躯干（上宽下窄）+ 头（圆）。
                  第一版是一个"下宽上窄"的斗篷楔形 + 一颗头 —— 那个形状在 30px 上
                  读出来是**钉子/黑刺**，不是人。人的辨识度全在"腿分开、肩比胯宽、
                  脖子细"这三处比例上。
                */}
                <g fill="#0c0805">
                  <rect x={-w.h * 0.085} y={-w.h * 0.46} width={w.h * 0.062} height={w.h * 0.46} rx={w.h * 0.02} />
                  <rect x={w.h * 0.023} y={-w.h * 0.46} width={w.h * 0.062} height={w.h * 0.46} rx={w.h * 0.02} />
                  <path
                    d={`M${-w.h * 0.12} ${-w.h * 0.44} L${-w.h * 0.17} ${-w.h * 0.74}
                        L${w.h * 0.17} ${-w.h * 0.74} L${w.h * 0.12} ${-w.h * 0.44} Z`}
                  />
                  <rect x={-w.h * 0.035} y={-w.h * 0.82} width={w.h * 0.07} height={w.h * 0.1} />
                  <circle cx={0} cy={-w.h * 0.86} r={w.h * 0.078} />
                  {/*
                    手臂：两条细的、略离开躯干。
                    没有手臂的人形在 50px 上读成**保龄球瓶**（腿一合并就是一根柱子）——
                    人的轮廓里最先认出来的是"肩两侧垂下来的两条"。
                  */}
                  <rect x={-w.h * 0.215} y={-w.h * 0.72} width={w.h * 0.055} height={w.h * 0.3} rx={w.h * 0.027} />
                  <rect x={w.h * 0.16} y={-w.h * 0.72} width={w.h * 0.055} height={w.h * 0.3} rx={w.h * 0.027} />
                </g>
                {/* 灯在左边：左侧留一道暖边（只在躯干上）。没有它，夜里就是一坨纯黑 */}
                <path
                  d={`M${-w.h * 0.12} ${-w.h * 0.44} L${-w.h * 0.17} ${-w.h * 0.74}`}
                  stroke="#c9a96e" strokeOpacity={0.40} strokeWidth={1.3} fill="none"
                />
              </g>
            </g>
          </g>
        ))}
      </g>

      {/* ── 货：木箱 / 木桶 / 盘好的缆绳（都在近处，给影子一个参照） ── */}
      {props.map((p2, i) => <QuayPropShape key={i} {...p2} />)}

      {/* ── 系缆桩（描边 + 实底）：压住水线，是"码头"最直接的符号 ──── */}
      <g>
        {QUAY_POSTS.map(x => (
          <g key={x}>
            <rect x={x} y={112} width={22} height={36} rx={3} fill="#0d0805" stroke="#a8864c" strokeOpacity="0.42" strokeWidth="1.5" />
            <rect x={x - 6} y={106} width={34} height={9} rx={4} fill="#0d0805" stroke="#a8864c" strokeOpacity="0.42" strokeWidth="1.5" />
          </g>
        ))}
        {/* 右侧那根斜桅（原来就有）：从石面斜出画外，给右边一个"挡" */}
        <path d="M1310 240 L1368 44 L1380 44 L1332 240 Z" fill="#0b0704" />
        <path d="M1368 46 L1256 150 L1263 150 L1374 52 Z" fill="#0b0704" />
      </g>
      {/* 缆绳：桩头垂到石面上（垂度 46 —— 太浅读成"直线"） */}
      <path d="M107 112 Q 213 160 329 112" stroke="#0b0704" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M107 112 Q 213 160 329 112" stroke="#a8864c" strokeOpacity="0.24" strokeWidth="1" fill="none" />
      <path d="M1139 112 Q 1240 162 1353 112" stroke="#0b0704" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M1139 112 Q 1240 162 1353 112" stroke="#a8864c" strokeOpacity="0.24" strokeWidth="1" fill="none" />

      {/*
        夜色暗罩：与 `harbor-night-veil` 同一份 veil（见 useHarborAmbience）。
        放在**所有近景物件之后、灯之前**：人/货/桩/缆跟整座城一起天黑，
        只有灯画在它上面（否则"灯照亮脚下"会被这层盖掉）。
      */}
      <rect
        ref={deckRef}
        x="0" y={QUAY_EDGE_Y} width="1440" height={QUAY_BOTTOM_Y - QUAY_EDGE_Y}
        /*
         * 用 multiply 而不是"盖一层深蓝"：盖色会把石缝与块间色差一起抹平
         * （实测深夜下整片变成一条纯蓝带，石头完全消失）。
         * multiply 按比例压暗，明暗关系保住 —— 与黄昏那层「染色 vs 叠加」
         * 是同一个道理（见 data 里 warm 两层）。
         */
        fill="#7e88a8"
        style={{ opacity: 0, mixBlendMode: 'multiply' }}
      />

      {/*
        四盏码头灯 —— 夜里岸上唯一的暖光，也是"这里有人"的唯一证据。
        位置直接取 `QUAY_LAMPS`（与上面那四根系缆桩同一份数据），不在这里另写一遍坐标。
        整组的 opacity 由 `useHarborAmbience` 按日相写（白天真值 0，e2e 断言它）。
        灯芯自带 `scene-flicker`，四盏相位错开 0.53 秒 —— 同步闪会读成"呼吸灯"。
      */}
      <g ref={lampRef} data-testid="harbor-lamps" style={{ opacity: 0 }}>
        {QUAY_LAMPS.map((l, i) => (
          <g key={l.x}>
            {/* 光池：落在石面上，压扁的椭圆（e2e 取它的包围盒量"灯下亮度"） */}
            <ellipse data-testid={i === 0 ? 'harbor-lamp-pool' : undefined} cx={l.x} cy={122} rx={46} ry={11} fill="url(#harbor-lamp-halo)" opacity={0.56} />
            {/* 湿石面上的反光：灯正下方那一道竖向的暖影 */}
            <ellipse cx={l.x} cy={130} rx={14} ry={18} fill="url(#harbor-lamp-halo)" opacity={0.30} />
            {/* 灯杆：从桩头伸上去，让灯"挂"在桩上而不是浮着 */}
            <path d={`M${l.x} 112 L${l.x} 80`} stroke="#1a1108" strokeWidth={2} />
            <path d={`M${l.x - 5} 80 H${l.x + 5}`} stroke="#1a1108" strokeWidth={2} />
            <circle cx={l.x} cy={l.y} r={30} fill="url(#harbor-lamp-halo)" />
            <circle
              cx={l.x} cy={l.y} r={2.6} fill="#ffe8bc"
              className="scene-flicker" style={{ animationDelay: `${(-i * 0.53).toFixed(2)}s` }}
            />
          </g>
        ))}
      </g>
    </svg>
  )
}

/**
 * 白天的海鸥：三只，在水面那一条上慢慢飘。
 *
 * 【为什么放在水面而不是天空】画里的云是静态的贴图，鸟飞在静止的云里更假；
 * 水面本来就有碎光在动，鸟从上面掠过是自洽的。
 * 翅膀用 scaleY 压扁来"扇"——10px 宽的鸟读不出关节，只需要看出在动。
 * 天黑之后它们自然消失：深色的鸟压在深色的海上，本来就看不见（不必额外藏）。
 */
function QuayGulls({ reduced }: { reduced: boolean }) {
  return (
    <div className="absolute inset-0 pointer-events-none" data-testid="harbor-gulls" aria-hidden="true">
      {quayGulls().map((g, i) => (
        <svg
          key={i}
          className={reduced ? 'absolute' : 'absolute quay-gull'}
          style={{
            left: `${((g.x / 1440) * 100).toFixed(2)}%`,
            top: `${(g.y * 100).toFixed(2)}%`,
            width: 22 * g.s,
            height: 12 * g.s,
            ...(reduced ? {} : { animationDuration: `${g.sec}s`, animationDelay: `${g.delay}s` }),
          }}
          viewBox="-11 -6 22 12"
        >
          <path
            className={reduced ? undefined : 'quay-gull-wing'}
            d="M-9 1 Q -4.5 -4 0 0.5 Q 4.5 -4 9 1"
            /* 深褐 + 0.8：压在蓝灰海面上要 0.8 才读得出是鸟（0.5 时是水面上的一点脏）。
               天黑后它自己就没了 —— 深色的鸟压深色的海，不必额外去藏。 */
            stroke="#1c1308"
            strokeOpacity="0.8"
            strokeWidth="1.9"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      ))}
    </div>
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

  /* 天光/天候两层：所有 opacity 由 useHarborAmbience 按 4Hz 直接写 ref，
     不进 React（日相每帧都在变，走 state 就是每秒 60 次重渲染整棵岸上树） */
  const amb = useHarborAmbience()
  // 雨/雾只在真出现时挂载：一块全屏透明层也要占一次合成
  const wet = useGameStore(s => s.weather.kind === 'rain' || s.weather.kind === 'storm')
  const misty = useGameStore(s => s.weather.kind === 'fog')
  // 星图只算一次：两层不同种子，相位错开，叠起来才不像一块网格
  const starsA = useMemo(() => starFieldCss(0x51a7d3, 46), [])
  const starsB = useMemo(() => starFieldCss(0x2c9f41, 32), [])

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
            //
            // 【2026-11-14 第二次收】上一次只改了这条 filter，没动下面三层渐变。
            // 净屏实测（test/e2e/probe-harbor-net.mjs，藏掉面板与码头后逐区取样）：
            //   天空只剩原图 46~51%、近水 34~37%；彩度掉得更狠，天空 0.12~0.22 → 0.05~0.09。
            // 也就是"诊断对了、只修了一半"——filter 是小数，真正吃光的是叠层。
            // 现在 filter 基本不再压暗，只留一点点退后感；
            // 面板是不透明的深色块，背景亮一档不影响读数（对比度审计实测过）。
            filter: 'brightness(0.97) saturate(1.02) contrast(1.05)',
          }}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        data-testid="harbor-vignette-band"
        style={{
          // 上下压暗：只压到"远景退后"的量。原来顶部 0.52、底部 0.62，
          // 加上暗角与 filter 之后天空只剩原图一半亮度 —— 港口是蓝天、晚霞还是雾，
          // 玩家根本看不出来，等于 21 张图白接。
          // 顶部只留 0.12 且 14% 就收干净：最上面那条深色是顶栏自己（不透明），
          // 0.30 的褐色渐变会顺带把天空染成茶色（哈瓦那天空彩度只剩 47%）。
          // 染色也从暖褐 (18,12,6) 改成近中性 (14,12,9)。
          background: 'linear-gradient(180deg, rgba(14,12,9,0.12) 0%, rgba(14,12,9,0.03) 14%, rgba(14,12,9,0.22) 66%, rgba(10,8,5,0.44) 100%)',
        }}
      />

      {/*
        接缝暗带：把画的下沿"化"进我们的码头。
        【为什么需要】水线固定在视口 82%，可 13 张画各自的近景码头位置并不一样：
        伦敦那张自己的石阶就在 0.75~0.82，于是屏幕上出现**两个码头叠着**
        （画里的远码头 + 我们脚底下的近码头，中间没有水面，读成双层甲板）。
        逐张给每条画配一条专属切割线才对，但那要 13 个手工定标的数；
        这里先做与图无关的一层：把画的下沿 0.74~0.82 压进阴影，
        远码头沉进暗部，接缝就不再是一条直线。
      */}
      <div
        className="absolute left-0 right-0 pointer-events-none"
        data-testid="harbor-seam"
        style={{
          bottom: '18%', height: '12%',
          /*
           * 用 multiply 压，不是盖一层近黑。
           * 盖黑的版本实测把 0.76~0.81 那一条压成 std 2~3 的**平条**
           * （广州 12.6 / 蒙巴萨 20.1）—— 又变回"横在画上的一条带子"，
           * 只是没上一版那么黑。multiply 按比例压暗，水纹与岸线还在。
           */
          background: 'linear-gradient(180deg, rgba(120,100,74,0) 0%, rgba(120,100,74,0.50) 55%, rgba(104,86,62,0.92) 100%)',
          mixBlendMode: 'multiply',
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
        data-testid="harbor-vignette-edge"
        style={{
          // 暗角是"退后"的主要手段，但 0.92 的收口把四角压成纯黑，
          // 而两块面板已经盖住画面中间——玩家能看见的景恰好全在边缘。
          // 现在收到 0.56：边缘仍有退后的收口感，但天空与水面不再是黑的。
          background: 'radial-gradient(ellipse at 50% 38%, rgba(20,13,6,0.04) 0%, rgba(20,13,6,0.26) 72%, rgba(10,7,3,0.56) 100%)',
          // 顶部 22% 不受暗角影响。
          // 【为什么】暗角的椭圆中心在 38%，上沿离中心近，于是天空两角被压得最狠：
          // 净屏实测天空彩度只剩原图 43~52%（哈瓦那/澳门），而中景还有 83~90%。
          // 天空的色相（蓝 / 晚霞 / 雾）正是"这是哪片海"的第一信息，
          // 左右两侧的收口让给下面的水面就够了。
          maskImage: 'linear-gradient(180deg, transparent 0%, #000 22%)',
          WebkitMaskImage: 'linear-gradient(180deg, transparent 0%, #000 22%)',
        }}
      />

      {/* ── 天光：夜 / 黄昏 / 星 / 水面碎光 / 雨 / 雾 ────────────────────
          全部排在中景内容板**之前**：它们只能压暗那张画，不能压暗面板上的字。
          顺序也有讲究 —— 夜幕在下、星在上（星要透出夜幕），
          碎光与雨雾再往上（它们贴着水面与空气，不是天空）。 */}
      <div
        ref={amb.veilRef}
        className="absolute inset-0 pointer-events-none"
        data-testid="harbor-night-veil"
        style={{
          // 混向具体的深蓝而不是乘一个系数：乘法会把舱影、桅杆压成纯黑，
          // 整块画塌成一个剪影；混色至少保住轮廓（深夜最暗处仍有 ~0.09 亮度）。
          opacity: 0,
          // 上浅下深：天顶最蓝、城市带稍亮（那里的灯与墙还在反光），
          // 底部回到近黑（画的下沿本来就是压暗的前景）。
          background: 'linear-gradient(180deg, #0b1226 0%, #101a33 38%, #1a2a45 66%, #0e1526 100%)',
        }}
      />
      {/*
        黄昏 = 两层，一层染色、一层辉光。

        【为什么不能只用一个 screen 层】第一版就是：一整片 `screen` 的橙盖上去，
        A/B 实测确实变暖了（+28 级），但同一片区域的**纹理**从 0.030 掉到 0.012 ——
        水面、船、人群全被"加亮到接近橙色"，对比度被拉平，读起来是一层橙色的雾。
        加法混合只抬高亮度，不保留比值。
        【为什么 multiply 染色能保住细节】它按比值缩放每个通道：
        橙色 (1,0.63,0.35) 的乘子只压绿与蓝，红不动 → 整体偏暖，
        而"亮处仍亮、暗处仍暗"这个**关系**没变，所以纹理还在。
        辉光单独一层只留着海平线上方一小条，那里才该真亮。
      */}
      <div
        ref={amb.warmRef}
        className="absolute inset-0 pointer-events-none"
        data-testid="harbor-dusk-warm"
        style={{
          opacity: 0,
          mixBlendMode: 'multiply',
          // 从水面一直暖到海平线之上：日落不是天上一条线，是"天空 + 水面一起烧"。
          background: 'linear-gradient(0deg, rgba(255,150,84,0.62) 0%, rgba(255,152,88,0.62) 38%, rgba(255,170,104,0.50) 54%, rgba(255,186,132,0.30) 68%, rgba(255,200,160,0.12) 82%, rgba(255,210,180,0.04) 100%)',
        }}
      />
      <div
        ref={amb.warmGlowRef}
        className="absolute inset-0 pointer-events-none"
        data-testid="harbor-dusk-glow"
        style={{
          opacity: 0,
          mixBlendMode: 'screen',
          // 只留海平线上方一条：这是"日头本身"的余晖，宽度窄才像落日而不是晚霞滤镜
          background: 'linear-gradient(0deg, rgba(255,132,44,0) 0%, rgba(255,132,44,0) 44%, rgba(255,150,62,0.50) 53%, rgba(255,186,118,0.18) 62%, rgba(255,200,150,0) 72%)',
        }}
      />
      <div
        ref={amb.starsRef}
        className="absolute inset-x-0 top-0 h-[38%] pointer-events-none"
        data-testid="harbor-stars"
        style={{ opacity: 0 }}
      >
        {/* 星是静的，动的只有一颗流星。
            第一版给整层挂 scene-twinkle：那是**整片天一起眨眼**（分层脉动），
            捕获到低谷那一帧时天上什么都没有。真实的星在这个尺度不闪，
            "天在动"交给每 9.5 秒一颗的流星。 */}
        <div className="absolute inset-0" style={{ backgroundImage: starsA, backgroundRepeat: 'no-repeat' }} />
        <div className="absolute inset-0" style={{ backgroundImage: starsB, backgroundRepeat: 'no-repeat', opacity: 0.75 }} />
        <span className="harbor-meteor" />
      </div>
      <div
        ref={amb.glintRef}
        className="absolute pointer-events-none"
        data-testid="harbor-glint"
        style={{
          /*
           * 水面在下半屏的左侧那一大片（e2e 统计"水面船队"取 x 0.55~0.88 / y 0.50~0.66）。
           * 第一版把碎光铺到 x 0.34~1.0 / y 0.44~0.74、点距 37×23px：
           * 屏幕上是一片**雪粒**，还盖在船帆与人群身上（暗光下 screen 混合把点全顶出来）。
           * 现在点距放大到 76×49（密度降到 1/4），遮罩收到真的水域，
           * 整体再乘一个上限 —— 碎光该是"水在反光"，不该是"下雪"。
           */
          left: '4%', right: '14%', top: '50%', height: '24%',
          opacity: 0,
          mixBlendMode: 'screen',
          // 软边：没有这道椭圆遮罩，碎光就是屏幕上的一块矩形
          WebkitMaskImage: 'radial-gradient(ellipse 58% 52% at 44% 52%, #000 0%, rgba(0,0,0,0.42) 56%, transparent 84%)',
          maskImage: 'radial-gradient(ellipse 58% 52% at 44% 52%, #000 0%, rgba(0,0,0,0.42) 56%, transparent 84%)',
        }}
      >
        <div
          className="absolute inset-0 scene-sparkle"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,241,214,0.7) 0 1px, rgba(255,241,214,0) 1.5px)',
            backgroundSize: '76px 49px',
            animationDuration: '2.1s',
            opacity: 0.55,
          }}
        />
        <div
          className="absolute inset-0 scene-sparkle"
          style={{
            backgroundImage: 'radial-gradient(circle, rgba(255,232,196,0.7) 0 0.9px, rgba(255,232,196,0) 1.4px)',
            backgroundSize: '57px 37px',
            animationDuration: '3.3s',
            animationDelay: '-1.4s',
            opacity: 0.4,
          }}
        />
      </div>
      <QuayGulls reduced={reduced} />
      {wet && (
        <div
          ref={amb.rainRef}
          className="absolute inset-0 pointer-events-none harbor-rain"
          data-testid="harbor-rain"
          style={{ opacity: 0 }}
        />
      )}
      {misty && (
        <div
          ref={amb.fogRef}
          className="absolute inset-0 pointer-events-none"
          data-testid="harbor-fog"
          style={{
            opacity: 0,
            // 雾要**换目标色**而不是压低对比：白障把远处推成一片灰白
            // 峰值压在城市带（34%），近处与天顶都留薄一点：雾是"看不见远处"，
            // 不是"整屏盖一层白纸"。0.20/0.52 时实测只像"有点灰"，远处没被吞掉。
            background: 'linear-gradient(180deg, rgba(214,226,232,0.24) 0%, rgba(216,228,234,0.74) 32%, rgba(214,226,232,0.44) 58%, rgba(206,218,226,0.16) 100%)',
          }}
        >
          <div
            className="absolute inset-0 scene-fog"
            style={{
              background: 'radial-gradient(ellipse 30% 20% at 30% 52%, rgba(232,240,244,0.55) 0%, rgba(232,240,244,0) 70%)',
              animationDuration: '22s',
            }}
          />
        </div>
      )}

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
      {!isMobile && <HarborForeground lampRef={amb.lampsRef} deckRef={amb.deckRef} reduced={reduced} />}
    </div>
  )
}
