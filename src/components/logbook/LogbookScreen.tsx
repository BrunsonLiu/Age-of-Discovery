import { useMemo, useState } from 'react'
import { BookOpen, X, Compass, Trophy, Newspaper, Calendar, ChevronDown } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore, type LogTab } from '@/store/useMapStore'
import { ports } from '@/data/ports'
import { achievements, ACHIEVEMENT_GROUPS } from '@/data/achievements'
import { UI_ASSETS } from '@/data/uiAssets'
import { tasks } from '@/data/tasks'
import { goods } from '@/data/goods'
import { taskGold, escortRewardMul } from '@/utils/crewPerks'
import { ScrollText as ScrollIcon, CheckCircle2, Package, Coins } from 'lucide-react'
import VoyageNextCard from '@/components/panels/VoyageNextCard'
import { useFxStore as useFx } from '@/store/useFxStore'
import { rivalPortrait } from '@/data/portraits'
import type { Rival, Achievement } from '@/types'
import type { LucideIcon } from 'lucide-react'
import { groupJournal, heaviestEntry } from '@/utils/captainLog'
import { standings } from '@/utils/rivalRank'
import { TITLES, currentTitle, dominantAxis } from '@/data/titles'
import { sceneImage } from '@/data/sceneImages'
import { EVENT_TYPE_COLORS, renderEventIcon } from '@/utils/eventTypeStyles'
import { AtlasView, SightingsView } from '@/components/panels/LogbookViews'
import ScrollFade from '@/components/ui/ScrollFade'
import { PageHead, PageSection } from '@/components/logbook/PageParts'

/**
 * 航海志：任务 / 日志 / 图鉴 / 成就 / 同代船长的**整屏界面**。
 *
 * 【为什么不再做侧板】
 * 这五样原来是 320px 宽的侧边浮窗 —— 一条窄柱，塞进十几项成就、
 * 二十几条任务、几十页日志，看起来像临时夹在侧栏的便条。
 * 它们是"长期积累、反复翻阅"的资料，不需要边看边点地图；
 * 与港口/贸易/造船（必须边看边操作海图）是两类东西。
 * 给它们一整个屏，才有版式可讲：成就铺成网格、任务分成三段、图鉴按轨道排。
 *
 * 【为什么像一张摊开的册子而不是暗色面板】
 * 项目里"看画"的屏（岸上）是暖色的，"算数字"的屏（面板）是深海的。
 * 航海志是"翻阅"，压一层羊皮纸色，与海图的深蓝分开，又不至于像弹窗。
 */

const TABS: { key: LogTab; label: string; en: string; icon: React.ReactNode }[] = [
  { key: 'task', label: '任务', en: 'COMMISSIONS', icon: <ScrollIcon size={16} /> },
  { key: 'journal', label: '日志', en: 'JOURNAL', icon: <BookOpen size={16} /> },
  { key: 'atlas', label: '图鉴', en: 'ATLAS', icon: <Compass size={16} /> },
  { key: 'achievement', label: '成就', en: 'HONOURS', icon: <Trophy size={16} /> },
  { key: 'rival', label: '船长', en: 'CAPTAINS', icon: <Newspaper size={16} /> },
]

export default function LogbookScreen() {
  const tab = useMapStore(s => s.logTab)
  const setLogTab = useMapStore(s => s.setLogTab)
  const closeRecords = useMapStore(s => s.closeRecords)
  const fleet = useGameStore(s => s.fleet)
  const discoveredPorts = useGameStore(s => s.discoveredPorts)
  const earned = useGameStore(s => s.achievements)
  const activeTasks = useGameStore(s => s.activeTasks)
  const logbook = useGameStore(s => s.logbook)

  const counts: Record<LogTab, string> = useMemo(() => ({
    task: `${activeTasks.length} 在办`,
    journal: `${logbook.length} 页`,
    atlas: `${discoveredPorts.length}/${ports.length}`,
    achievement: `${earned.length}/${achievements.length}`,
    rival: '',
  }), [activeTasks.length, logbook.length, discoveredPorts.length, earned.length])

  const close = () => closeRecords()

  /*
   * Esc 不在这里监听。
   * 全站的退路都在 hooks/useKeyboardControls 那一个 window 监听里排队
   * （面板 → 帮助 → 岸上 → …），册子只是其中一层。各挂一个监听时，
   * stopPropagation 拦不住同一节点上的其他监听，结果就是"关册子"和
   * "退出岸上"同时发生 —— 在岸上翻一次日志就被扔回海图。
   */

  return (
    <div
      className="absolute inset-0 flex flex-col"
      data-testid="logbook-screen"
      role="region"
      aria-label="航海志"
      style={{ backgroundColor: 'var(--panel-bg)' }}
    >
      {/* 底纹：一层极淡的羊皮纸，让整屏不是一块纯色 */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.07]"
        style={{
          backgroundImage: 'radial-gradient(circle at 30% 20%, #e8d5a8 0%, transparent 55%), radial-gradient(circle at 75% 80%, #c9a96e 0%, transparent 60%)',
        }}
      />

      {/* ── 顶部：标题与退出 ─────────────────────────────────── */}
      <header className="relative shrink-0 flex items-end justify-between px-6 md:px-10 pt-5 pb-3 border-b border-gold-700/30">
        <div className="flex items-end gap-3">
          <h1 className="pirate-title text-2xl md:text-[28px] text-gold-300 leading-none">航海志</h1>
          <span className="hidden md:block text-xs tracking-[0.32em] text-gold-600 font-serif mb-0.5">LOG OF THE VOYAGE</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:block text-xs font-serif text-gold-500">
            {fleet.name} · 第 {fleet.day} 天 · {discoveredPorts.length}/{ports.length} 港
          </span>
          <button
            onClick={close}
            data-testid="logbook-close"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-gold-700/40 text-gold-300 hover:bg-gold-700/15 transition-colors font-serif text-sm"
            title="回到海图（Esc）"
          >
            <X size={14} /> <span className="hidden sm:inline">回海图</span>
          </button>
        </div>
      </header>

      {/* ── 主体：左标签 + 右内容 ─────────────────────────────── */}
      <div className="relative flex-1 min-h-0 flex flex-col md:flex-row">
        {/*
         * 标签列：桌面竖排（w-56），移动端**等分五列**。
         *
         * 原来移动端是"横排 + overflow-x-auto"，实测总宽 **577px / 视口 390**：
         * 「成就 0/17」被切掉一半，「船长」整个在屏幕外（rect.x=487）。
         * 而横滚没有任何视觉提示 —— 手机上玩家根本不知道还有第五页。
         * 入口看不见就等于没有（底部标签栏当初就是因为同样的理由改成两行）。
         *
         * 等分五列 = 每列 ~74px，放得下「图标 + 两个字」；计数与英文在
         * 手机上收起（点进去就看得到，而且竖排没地方放）。
         */}
        <nav
          className="shrink-0 grid grid-cols-5 gap-0.5 px-2 py-2
            md:flex md:flex-col md:gap-1 md:px-4 md:py-4 md:w-56
            border-b md:border-b-0 md:border-r border-gold-700/25"
          aria-label="航海志页签"
          role="tablist"
        >
          {TABS.map(t => {
            const on = t.key === tab
            return (
              <button
                key={t.key}
                onClick={() => setLogTab(t.key)}
                data-testid={`logbook-tab-${t.key}`}
                role="tab"
                aria-selected={on}
                className={`group flex flex-col md:flex-row items-center md:items-start gap-1 md:gap-2.5
                  px-1 md:px-3 py-1.5 md:py-2.5 rounded-sm text-center md:text-left transition-colors
                  md:w-full
                  ${on
                    ? 'bg-gold-700/20 text-gold-200 md:shadow-[inset_2px_0_0_0_rgba(212,168,56,0.9)]'
                    : 'text-gold-600 hover:text-gold-400 hover:bg-gold-700/10'}`}
              >
                <span className="shrink-0 md:self-start md:mt-0.5">{t.icon}</span>
                {/*
                  两行：第一行中文 + 计数，第二行英文。
                  原来三者挤在一行，208px 宽的导航里「COMMISSIONS」与「12 在办」
                  互相压字（实测截图上 "COMMIS2 在办 SIONS"）——
                  页签是这本册子的目录，读不清就不像目录了。
                */}
                <span className="min-w-0 leading-tight md:flex-1">
                  <span className="flex items-baseline justify-center md:justify-start gap-2 min-w-0">
                    <span className="font-serif text-xs md:text-sm whitespace-nowrap">{t.label}</span>
                    {/* 计数只在桌面上显示：手机五等分每列 ~74px，塞不下「0 在办 / 1/21」，
                        而且点进去第一行就是它 */}
                    {counts[t.key] && (
                      <span className={`hidden md:inline ml-auto shrink-0 text-xs font-mono tabular-nums ${on ? 'text-gold-400' : 'text-gold-600'}`}>
                        {counts[t.key]}
                      </span>
                    )}
                  </span>
                  <span className="hidden md:block text-xs tracking-[0.14em] text-gold-600 truncate mt-0.5">{t.en}</span>
                </span>
              </button>
            )
          })}
        </nav>

        {/* 内容区：一张大纸。max-w 限制的是**阅读行宽**，不是"窄卡片" */}
        <div className="flex-1 min-h-0 relative">
          {/*
            内容区必须自己滚（wrapperClassName="contents" 让 ScrollFade 那层不生成盒子，
            滚动区直接是 flex-1 的子元素，h-full 才有确定高度）。
            在这里踩过两次：内层 `h-full` 若相对 `height:auto` 的 wrapper，等于没设，
            内容按自身高度（实测 1054px）铺开、滚到底会露出根节点的 #0d1116 ——
            视觉上就是"页面下半截突然变蓝"。
          */}
          <ScrollFade wrapperClassName="contents" className="h-full overflow-y-auto">
            <div className="max-w-[1080px] mx-auto px-5 md:px-10 py-6 md:py-8" data-testid={`logbook-page-${tab}`}>
              {tab === 'task' && <TaskPage />}
              {tab === 'journal' && <JournalPage />}
              {tab === 'atlas' && <AtlasView />}
              {tab === 'achievement' && <AchievementPage />}
              {tab === 'rival' && <RivalPage />}
            </div>
          </ScrollFade>
        </div>
      </div>

      {/*
        脚注条：与另外六块整屏面板（FullScreenPanel）同一位置、同一高度。
        册子原来到这里就直接结束了，屏幕最下方是一条空底 —— 因为它的内容
        本来就不满（新开一局时「日志」只有一句「还没写下第一页」）。
        一条固定的底边让"空"读作留白，而不是"这页没渲染完"。
      */}
      <div className="relative shrink-0 h-9 md:h-10 flex items-center justify-between gap-3 px-6 md:px-10 border-t border-gold-700/25 bg-black/25">
        <span className="text-[12px] font-serif text-gold-600 truncate">
          每靠一次岸，这册子就多一页
        </span>
        <span className="hidden md:flex items-center gap-3 text-[12px] font-serif text-gold-600 tabular-nums shrink-0">
          <span>1–8 换面板</span>
          <span className="text-gold-600">·</span>
          <span>Esc 回海图</span>
        </span>
      </div>
    </div>
  )
}

/* ────────────────────────── 任务 ────────────────────────── */

/*
 * 徽章文字色用 .ink-bad / .ink-good，不用 danger-400 / safe-400：
 * 那两个是**色块**色，压在深褐底上只有 2.8~4.2:1 —— 11px 的小标签再暗一档就废了。
 */
const STYLE_BADGE: Record<Rival['style'], { label: string; cls: string }> = {
  aggressive: { label: '亡命徒', cls: 'ink-bad border-danger-700/40' },
  steady: { label: '稳健派', cls: 'ink-good border-safe-700/40' },
  explorer: { label: '探险家', cls: 'text-ocean-200 border-ocean-700/50' },
}

const TYPE_LABEL: Record<string, string> = {
  main: '主线', trade: '送货', escort: '护送', treasure: '寻宝', rescue: '救援',
}

function TaskPage() {
  const fleet = useGameStore(s => s.fleet)
  const activeTasks = useGameStore(s => s.activeTasks)
  const completedTasks = useGameStore(s => s.completedTasks)
  const acceptTask = useGameStore(s => s.acceptTask)
  const completeTask = useGameStore(s => s.completeTask)
  const gameMode = useGameStore(s => s.gameMode)
  const crewRoster = useGameStore(s => s.crewRoster)
  const hasMerchant = crewRoster.some(m => m.id === 'merchant')
  // 王室声望 ≥30 的护送委托 +25%：与港口面板、store 结算同一个倍率函数
  const crownRep = useGameStore(s => s.factionRep.crown ?? 0)
  const gold = (g: number, type: string) => taskGold(g, hasMerchant, escortRewardMul(type, crownRep))
  const cargoOf = (goodId: number) => fleet.cargo.find(c => c.goodId === goodId)?.quantity ?? 0

  const available = tasks.filter(t => {
    if (t.status !== 'available') return false
    if (activeTasks.some(at => at.id === t.id)) return false
    if (completedTasks.includes(t.id)) return false
    if (t.minDay !== undefined && fleet.day < t.minDay) return false
    if (t.portId !== null && t.portId !== undefined && fleet.currentPortId !== t.portId) return false
    return true
  })
  const locked = tasks.filter(t => {
    if (t.status !== 'available') return false
    if (activeTasks.some(at => at.id === t.id)) return false
    if (completedTasks.includes(t.id)) return false
    return !available.includes(t)
  })

  /*
   * 「交付领赏」的判定必须和 TaskPanel 当年一模一样：到了目标港、且该带的货带够。
   * 侧板版本删掉之后，这个按钮一度在界面上消失了 —— 玩家把货送到港口，
   * 却只能看着任务挂在「手上这单」里不动。整屏改版最容易丢的就是这种"动作"。
   */
  const canComplete = (t: (typeof activeTasks)[number]) => {
    const target = t.targetPortId ?? t.portId
    if (fleet.currentPortId !== target) return false
    if (t.requiredGoods) {
      for (const req of t.requiredGoods) if (cargoOf(req.goodId) < req.quantity) return false
    }
    return true
  }

  const handIn = (t: (typeof activeTasks)[number]) => {
    const before = completedTasks.includes(t.id)
    completeTask(t.id)
    if (before) return
    const goldGot = gold(t.reward.gold, t.type)
    useFx.getState().fx({ kind: 'banner', tone: 'safe', text: '✦ 冒险达成 ✦', sub: t.title }, 'task')
    useFx.getState().fx({
      kind: 'float', tone: 'gold', text: `+${goldGot}`,
      sub: t.reward.fame ? `声望 +${t.reward.fame}` : undefined,
    })
  }

  return (
    /* 两栏：左边是委托清单，右边是"往哪开 / 进度 / 这一局的口径"三块常驻信息。
       整屏最容易犯的错是把一条窄列拉满 —— 一张卡横向铺 1000px，读起来眼睛要跑马拉松。 */
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-8 xl:gap-10">
      <div className="space-y-8 min-w-0">
        <Section title="眼下能接" count={available.length} hint="只在能接单的港口列出">
          {available.length === 0 ? (
            <Empty>这个港口此刻没有可接的委托。换个港，或者先把手上这单跑完。</Empty>
          ) : available.map(t => (
            <Row key={t.id}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Tag>{TYPE_LABEL[t.type] ?? t.type}</Tag>
                  <h3 className="font-serif text-[15px] text-gold-200 truncate">{t.title}</h3>
                </div>
                <p className="text-[13px] font-serif text-gold-500 mt-1 leading-relaxed">{t.description}</p>
                <Reward gold={gold(t.reward.gold, t.type)} fame={t.reward.fame} />
              </div>
              <button
                onClick={() => acceptTask(t.id)}
                className="shrink-0 px-4 py-2 rounded-sm border border-gold-600/50 text-gold-200 font-serif text-sm hover:bg-gold-700/20 transition-colors"
              >
                接下
              </button>
            </Row>
          ))}
        </Section>

        <Section title="手上这单" count={activeTasks.length} hint="到目标港才算完">
          {activeTasks.length === 0 ? (
            <Empty>勾当还没开张。到港口翻这一页，总能找到活。</Empty>
          ) : activeTasks.map(t => {
            const done = canComplete(t)
            return (
              <Row key={t.id}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Tag>{TYPE_LABEL[t.type] ?? t.type}</Tag>
                    <h3 className="font-serif text-[15px] text-gold-200 truncate">{t.title}</h3>
                  </div>
                  <p className="text-[13px] font-serif text-gold-500 mt-1">
                    目的地：{ports.find(p => p.id === (t.targetPortId ?? t.portId))?.nameCn ?? '—'}
                  </p>
                  {/* 需带的货逐件标出"现有 / 需要"：只写"需带 3 件火药"，
                      玩家还得自己去贸易面板数一遍 */}
                  {t.requiredGoods?.length ? (
                    <div className="mt-1 space-y-0.5">
                      {t.requiredGoods.map(req => {
                        const have = cargoOf(req.goodId)
                        const ok = have >= req.quantity
                        return (
                          <p key={req.goodId} className={`text-[12px] font-serif flex items-center gap-1 ${ok ? 'text-safe-400' : 'text-gold-600'}`}>
                            <Package size={11} /> {goods.find(g => g.id === req.goodId)?.nameCn ?? ''} {req.quantity} 件（现有 {have}）
                          </p>
                        )
                      })}
                    </div>
                  ) : null}
                  <Reward gold={gold(t.reward.gold, t.type)} fame={t.reward.fame} />
                </div>
                {done ? (
                  <button
                    onClick={() => handIn(t)}
                    data-testid={`task-deliver-${t.id}`}
                    className="shrink-0 px-4 py-2 rounded-sm border border-safe-500/60 text-safe-300 font-serif text-sm hover:bg-safe-500/15 transition-colors"
                  >
                    ✓ 交付领赏
                  </button>
                ) : (
                  <span className="shrink-0 text-xs font-serif text-gold-600 whitespace-nowrap">到港再交付</span>
                )}
              </Row>
            )
          })}
        </Section>

        {locked.length > 0 && (
          <Section title="还没到火候" count={locked.length} hint="天数或港口不满足">
            {/*
              【不能接的单，不要给它和能接的一样大的卡】
              原来这一组用与「眼下能接」完全相同的 Row（15px 标题 + 说明占两行、
              上下各 12px 内距），22 条排下来是 1400px 的一堵暗墙 ——
              玩家滚三屏都滚不到底，而这三屏里没有一件是他现在能做的事。
              密度就是层级：**能动手的用大卡、还不能动的用一行**。
              现在标题与"几时/在哪能接"同排、右对齐，每条 40px，22 条 = 880px。
            */}
            {locked.map(t => (
              <div
                key={t.id}
                data-testid={`task-locked-${t.id}`}
                className="flex items-center gap-2.5 rounded-sm border border-gold-700/15 bg-black/10 px-3 py-2"
              >
                <span className="shrink-0 rounded-sm border border-gold-700/30 px-1.5 py-px text-[12px] font-serif text-gold-600">
                  {TYPE_LABEL[t.type] ?? t.type}
                </span>
                <h3 className="min-w-0 truncate font-serif text-[13px] text-gold-500">{t.title}</h3>
                <span className="ml-auto shrink-0 text-[12px] font-serif text-gold-600 tabular-nums">
                  {t.minDay !== undefined && fleet.day < t.minDay ? `第 ${t.minDay} 天` : ''}
                  {t.portId != null && fleet.currentPortId !== t.portId
                    ? `${t.minDay !== undefined && fleet.day < t.minDay ? ' · ' : ''}在${ports.find(p => p.id === t.portId)?.nameCn ?? '别处'}接`
                    : ''}
                </span>
              </div>
            ))}
          </Section>
        )}

        {completedTasks.length > 0 && (
          <Section title="已经交差" count={completedTasks.length}>
            <div className="flex flex-wrap gap-2">
              {completedTasks.map(id => {
                const t = tasks.find(x => x.id === id)
                if (!t) return null
                return (
                  <span key={id} className="px-2.5 py-1 rounded-sm border border-gold-700/30 text-xs font-serif text-gold-600">
                    ✓ {t.title}
                  </span>
                )
              })}
            </div>
          </Section>
        )}
      </div>

      {/* 右栏：常驻信息。窄屏（<1280）落到清单下方，不挤掉正文 */}
      <aside className="space-y-4 xl:pt-1">
        <VoyageNextCard />
        <div className="rounded-sm border border-gold-700/30 bg-black/20 p-3.5">
          {/* 两张右栏卡：标题行同字号同色、计数同落右端、下面都有同一条进度槽 */}
          <div className="flex items-center justify-between text-[13px] font-serif text-gold-200">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={13} /> 冒险进度</span>
            <span className="text-[12px] font-serif text-gold-500 tabular-nums">
              {completedTasks.length}/{tasks.length}
            </span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-gold-700/20 overflow-hidden">
            <div
              className="h-full bg-gold-500/80"
              style={{ width: `${Math.round((completedTasks.length / Math.max(1, tasks.length)) * 100)}%` }}
            />
          </div>
          <p className="mt-2.5 text-[12px] font-serif text-gold-600 leading-relaxed">
            {gameMode === 'visitor'
              ? '参观模式：这些都是听说过的事，不接也没关系——船照开，世界照走。'
              : '这些只是建议，你可以自由探索任何地方。'}
          </p>
          {hasMerchant && (
            <p className="mt-2 flex items-center gap-1 text-[12px] font-serif text-safe-400">
              <Coins size={11} /> 商人在船：赏金 +25%（上面的数字已含）
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}

/* ────────────────────────── 日志 ────────────────────────── */

function JournalPage() {
  /**
   * 记事来自 `eventLog`（每天一行的那种），不是 `logbook`（带回的整页见闻）。
   * 两者是两本账：`logbook` 的 kind 只有 arrival/title/echo/legend/tribute，
   * 一页一页的「带回了什么」；`eventLog` 才是流水账。
   *
   * 【为什么按天折叠、而不是把所有条目摊开】
   * 摊开之后一屏里是十几条「我选了…／于是…」，像调试日志；而日志是这游戏里
   * 唯一能成为「回忆」的地方。一天一行（≤24 字），点开才是当天的账；
   * 默认展开最新一天 —— 翻开日志的人通常想知道「刚才那次到底怎么回事」。
   *
   * 【为什么排成时间轴】原来是一列卡片，卡片自己写「第 63 天」。整屏之后
   * 它只是「一堆卡」，看不出日子在走。现在日期挪到左边成一列，中间一条竖线
   * 串起来（当天展开时那个点会亮），读起来才像一本按天翻的册子。
   *
   * 【为什么展开时配一张场景图】项目里有 25 张事件插图（`data/sceneImages`，
   * 63 个事件里 64 处带 `sceneKey`），原来只在事件弹窗里出现一次，进册子就没了。
   * 展开那天在顶部放一条 400:140 的横幅（与事件卡同一个裁切比例，零二次裁剪），
   * 用的是**当天最重那条**的场景 —— 这一天到底怎么回事，一张图就说清了。
   */
  const eventLog = useGameStore(s => s.eventLog)
  const fleetName = useGameStore(s => s.fleet.name)
  const logbook = useGameStore(s => s.logbook)
  const days = groupJournal(eventLog)
  const [openDays, setOpenDays] = useState<number[]>(() => (days.length ? [days[0].day] : []))
  const toggle = (day: number) =>
    setOpenDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]))
  /*
   * 没有见闻时不要留一根 420px 的空柱：左栏整块收掉，让记事占满整屏。
   * 判据用 logbook.length —— SightingsView 自己也是从这本账里挑页的。
   */
  const hasSightings = logbook.length > 0

  const journal = (
    <div className="min-w-0">
      <PageHead
        title="记事"
        note={<span className="text-gold-500">{fleetName}</span>}
        right={days.length > 0 ? `共 ${days.length} 天有记载` : '还没写下第一页'}
      />

      {days.length === 0 ? (
        <Empty>出海吧，笔在后面追着你。</Empty>
      ) : (
        <div className="relative">
          {/* 贯穿整条时间轴的竖线 */}
          <span
            aria-hidden="true"
            data-testid="journal-axis"
            className="absolute left-[2.9rem] top-3 bottom-3 w-[1.5px] bg-gradient-to-b from-gold-500/55 via-gold-600/30 to-transparent"
          />
          <div className="space-y-2">
            {days.map(({ day, headline, entries }) => {
              const open = openDays.includes(day)
              const top = heaviestEntry(entries)
              const scene = sceneImage(top?.event.sceneKey)
              return (
                <div key={day} className="relative">
                  {/* 左边一列只有日子 */}
                  <span className="absolute left-0 top-[0.6rem] w-11 text-right font-serif leading-none">
                    <span className="text-[15px] tabular-nums text-gold-300">{day}</span>
                    <span className="text-xs text-gold-600 ml-0.5">天</span>
                  </span>
                  {/* 竖线上的点：当天展开时亮起来 */}
                  <span
                    aria-hidden="true"
                    className={`absolute left-[2.72rem] top-[0.72rem] h-[7px] w-[7px] rounded-full ring-2 ring-[#0d0f11]
                      ${open ? 'bg-gold-300' : 'bg-gold-600'}`}
                  />
                  <div className="ml-14 rounded-sm border border-gold-700/20 bg-black/15 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggle(day)}
                      aria-expanded={open}
                      data-testid={`journal-day-${day}`}
                      className="w-full min-h-[40px] flex items-start gap-2.5 px-3 py-2 text-left press hover:bg-gold-700/10 transition-colors"
                    >
                      <Calendar size={13} className="mt-1 shrink-0 text-gold-600" aria-hidden="true" />
                      <span className="flex-1 text-gold-200 text-[13px] font-serif leading-snug">
                        {headline ?? '（这一天没有记载）'}
                      </span>
                      <ChevronDown
                        size={14}
                        aria-hidden="true"
                        className={`shrink-0 mt-0.5 text-gold-600 transition-transform ${open ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {open && (
                      <>
                        {scene && (
                          <div className="relative aspect-[400/140] w-full overflow-hidden border-y border-gold-700/20">
                            <img
                              src={scene}
                              alt=""
                              aria-hidden="true"
                              loading="lazy"
                              decoding="async"
                              data-testid={`journal-scene-${day}`}
                              className="h-full w-full object-cover"
                            />
                            <span
                              aria-hidden="true"
                              className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent"
                            />
                            <span className="absolute left-3 bottom-1.5 text-gold-200 text-xs font-serif">
                              {top?.event.title}
                            </span>
                          </div>
                        )}
                        <div className="px-3 pb-3 pt-2 space-y-2.5">
                          {entries.map((entry, i) => (
                            <div
                              key={`${entry.day}-${entry.event.id}-${entry.choiceIndex}-${i}`}
                              className={`pl-2.5 border-l-2 ${EVENT_TYPE_COLORS[entry.event.type] || 'border-l-gold-500/50'}`}
                            >
                              <div className="flex items-center gap-1.5">
                                {renderEventIcon(entry.event.type, 13)}
                                <span className="text-gold-200 text-[13px] font-serif">{entry.event.title}</span>
                              </div>
                              <p className="text-gold-300 text-[13px] font-serif mt-0.5 leading-snug">
                                我选了：{entry.event.choices[entry.choiceIndex]?.text}
                              </p>
                              <p className="text-gold-400 text-[13px] font-serif leading-snug mt-0.5">
                                {entry.outcome.description}
                              </p>
                              {entry.outcome.historicalNote && (
                                <p className="mt-1 pl-2 border-l border-gold-700/40 text-[12px] leading-relaxed text-gold-500 font-serif">
                                  {entry.outcome.historicalNote}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  /*
   * 两栏：左边是「带回来的那一页」（见闻卡本来就该像册子的一页），
   * 右边是按天折叠的流水账。没有见闻时不排两栏 —— 否则左栏是一根 420px
   * 宽的空柱，里面只有一句「这本册子还是空的」，整屏左边三分之一是空的。
   */
  if (!hasSightings) {
    return (
      <div className="space-y-8">
        {journal}
        {/*
          【这里原来是一个"盒子里装着空态"】
          外层 border + 标题行 + 里面又是 SightingsView 自己的图标 + 三行字 ——
          一个空格子套一个空格子，读起来像"这块没加载出来"。
          现在只有一段标题 + 一句空话，与页面上其它段落同一个规矩（PageSection）：
          标题在上、底下一道线，内容在下面。
        */}
        {/*
          【段头不许缩进】原来整块套了 ml-14（与时间轴的日期列对齐）——
          于是「见闻」这一行比上面的「记事」右移 56px，看着像缩进错了。
          缩进只属于**内容**（时间轴上让出日期那一列），标题永远是页边。
        */}
        <div>
          <PageSection title="见闻" hint="靠了岸，才多一页" right={`${logbook.length} 页`} />
          <div className="ml-14">
            <SightingsView />
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-8 xl:gap-10">
      <div className="min-w-0">
        <SightingsView />
      </div>
      {journal}
    </div>
  )
}
/* ────────────────────────── 成就 ────────────────────────── */

/**
 * 一枚勋章：圆盘 + 绶带。已得是实心金环，未得是暗铜虚线环。
 *
 * 【为什么画 SVG 而不是用图片】项目里没有 17 张勋章素材，而成就这一页
 * 的视觉重心本来就该是"章"，不是一段描述文字。圆盘 + 绶带用几何画出来，
 * 零素材、任意 DPR 不糊，而且"已得/未得"只改两个颜色就能一眼分开。
 *
 * 尺寸：56×64 的框，盘心 (28,26) r=24，绶带从盘底垂到 y=58。
 * 图标必须落在盘心 —— 所以它被单独绝对定位在 `top-0 h-[52px]` 那一格里
 * （盘心正好是 26），不是塞进 svg 里（lucide 是 React 组件，不能当 svg 子节点）。
 */
function AchievementMedal({ icon: Icon, earned }: { icon: LucideIcon; earned: boolean }) {
  return (
    <span className="relative block h-16 w-14 shrink-0" aria-hidden="true">
      <svg
        viewBox="0 0 56 64"
        className="absolute inset-0 h-full w-full"
        style={earned ? { filter: 'drop-shadow(0 0 7px rgba(230,198,122,0.42))' } : undefined}
      >
        {/* 绶带：两条带子 + 剪口。先画，压在盘下面 */}
        <path
          d="M19 38 H37 L34 58 L28 54 L22 58 Z"
          fill={earned ? 'rgba(198,156,64,0.85)' : 'rgba(58,46,28,0.75)'}
        />
        {/* 盘面：已得带一点暖光，未得是个凹进去的暗圆 */}
        <circle cx="28" cy="26" r="24" fill={earned ? 'rgba(232,200,120,0.13)' : 'rgba(0,0,0,0.45)'} />
        <circle
          cx="28" cy="26" r="24" fill="none"
          stroke={earned ? '#e6c67a' : 'rgba(122,94,44,0.5)'}
          strokeWidth={earned ? 2 : 1.2}
          strokeDasharray={earned ? undefined : '3 4'}
        />
        <circle
          cx="28" cy="26" r="18.5" fill="none"
          stroke={earned ? 'rgba(230,198,122,0.32)' : 'rgba(122,94,44,0.2)'}
          strokeWidth="1"
        />
      </svg>
      <span className="absolute inset-x-0 top-0 grid h-[52px] place-items-center">
        <Icon size={24} className={earned ? 'text-gold-100' : 'text-gold-600'} />
      </span>
    </span>
  )
}

function AchievementCard({ a, earned }: { a: Achievement; earned: boolean }) {
  return (
    <div
      data-testid={`achievement-${a.id}`}
      data-earned={earned ? '1' : '0'}
      className={`flex items-start gap-3 rounded-sm border p-3 transition-colors
        ${earned ? 'border-gold-600/55 bg-gold-700/12' : 'border-gold-700/20 bg-black/20'}`}
    >
      <AchievementMedal icon={a.icon} earned={earned} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className={`font-serif text-[13px] ${earned ? 'text-gold-200' : 'text-gold-600'}`}>{a.title}</h3>
          {earned && <span className="ml-auto shrink-0 text-xs tracking-wider text-gold-500">已得</span>}
        </div>
        <p className={`mt-1 text-xs font-serif leading-relaxed ${earned ? 'text-gold-500' : 'text-gold-600'}`}>
          {a.description}
        </p>
      </div>
    </div>
  )
}

function AchievementPage() {
  const earned = useGameStore(s => s.achievements)
  const stats = useGameStore(s => s.stats)
  const got = new Set(earned)
  const pct = Math.round((earned.length / Math.max(1, achievements.length)) * 100)

  return (
    <div className="space-y-7">
      {/*
        门面 + 总进度。
        标题那一行与其它页的页头**同一条基线**：18px 标题在左、计数在最右端、
        底下一道 30% 金线（这里那道线由进度条自己担任 —— 它是同一条水平线，
        不必再加一根）。
      */}
      {/*
        页头那一道线由**进度条自己担任**：其它四页的页头是 30% 金线，
        这里换成同一条位置的空槽（0% 时就是一根极淡的线），多出来的信息只有"填了多少"。
        原来线在 y、条在 y-8，两条并排 8px —— 一条是"分隔"、一条是"进度"，
        同一条水平位置上不该有两条线。
      */}
      <div className="pb-3">
      <div className="flex items-center gap-5">
        {/*
          门面那张 ui_medal 是红色缎带勋章，和下面自绘的金色圆盘勋章**不是一套**。
          不换素材（换了它就成了孤儿资源，审计会红），而是把它压成同一色系：
          去饱和 → 上棕金 → 提亮，读起来像同一块铜。
        */}
        <img
          src={UI_ASSETS.medal}
          alt=""
          aria-hidden="true"
          className="h-14 w-auto object-contain shrink-0 drop-shadow-[0_0_14px_rgba(212,168,56,0.4)]"
          style={{ filter: 'grayscale(1) sepia(0.62) saturate(1.7) brightness(1.12)' }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <h2 className="shrink-0 font-serif text-[18px] leading-none text-gold-300">已得</h2>
            <span className="min-w-0 truncate text-[12px] font-serif text-gold-600">
              生涯里程碑，判定都在你做过的事上
            </span>
            {/* 计数与下面三面墙的「0 / 7」落在同一个右端 */}
            <span
              data-testid="ach-head-count"
              className="ml-auto shrink-0 text-[12px] font-serif tabular-nums text-gold-500"
            >
              {earned.length} / {achievements.length}
            </span>
          </div>
        </div>
      </div>
      {/*
        进度槽放在**整行下方、通栏**：它同时是这一页页头那道分隔线。
        原来它在右侧文字块里（max-w-420），线从勋章右边才开始 ——
        别的四页那道线都是从页面左边界拉到右边界，唯独这一页从中途起笔，
        读作"标题下面划了一道下划线"而不是"这一页从这里开始"。
      */}
      <div className="mt-3 h-[2px] rounded-full bg-gold-700/25 overflow-hidden">
        <div className="h-full bg-gold-500/80" style={{ width: `${pct}%` }} />
      </div>
      </div>

      {/* 生涯统计：原来在侧板里是两列小格，整屏铺成六格正好一行 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        {[
          { label: '航行天数', value: stats.daysSailed },
          { label: '交易笔数', value: stats.trades },
          { label: '经历事件', value: stats.eventsSurvived },
          { label: '击退海盗', value: stats.pirateWins },
          { label: '最大单笔', value: `${stats.bestDeal} 金` },
          { label: '历史目击', value: stats.historySeen },
        ].map(item => (
          <div key={item.label} className="rounded-sm border border-gold-700/20 bg-black/20 px-2.5 py-2">
            <div className="text-gold-600 text-xs font-serif">{item.label}</div>
            <div className="text-gold-200 text-[15px] font-serif tabular-nums leading-tight">{item.value}</div>
          </div>
        ))}
      </div>

      {/*
        【三面墙】17 枚勋章平铺成一片网格时，玩家只看得见"还差 11 个"，
        看不出还差**哪一类** —— 是生意没做大，还是海没走远，还是见闻太少。
        分组之后每面墙自己带进度；三个数加起来必须等于 17（单测里对账）。
        分组与顺序都从 ACHIEVEMENT_GROUPS 来，不在这里写死中文。
      */}
      {ACHIEVEMENT_GROUPS.map(g => {
        const list = achievements.filter(a => a.group === g.key)
        const on = list.filter(a => got.has(a.id)).length
        return (
          <section key={g.key} data-testid={`ach-group-${g.key}`} className="space-y-2.5">
            <PageSection
              title={g.label}
              en={g.en}
              right={<span data-testid={`ach-group-count-${g.key}`}>{on} / {list.length}</span>}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {list.map(a => (
                <AchievementCard key={a.id} a={a} earned={got.has(a.id)} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/* ─────────────────────── 同代船长 ─────────────────────── */

/** 座次表一行里，除数字之外要显示的身份：谁、叫什么、是不是你 */
interface RivalSeat {
  key: string
  name: string
  you: boolean
}

function RivalPage() {
  const fleet = useGameStore(s => s.fleet)
  const discoveredPorts = useGameStore(s => s.discoveredPorts)
  const rivals = useGameStore(s => s.rivals)
  const news = useGameStore(s => s.rivalNews)
  const notoriety = useGameStore(s => s.notoriety)

  const myPorts = discoveredPorts.length
  /*
   * 座次表：你 + 三位对手，三项各自算名次（规则见 utils/rivalRank）。
   *
   * 【为什么行序是金币】排名本身没法"不排序"—— 排行榜就是给人看顺序的。
   * 既然一定要有顺序，就把这条规则**写在表头上**（"按金币排"），
   * 而不是留在代码里让玩家猜。同分按声望、再按探索。
   */
  const board = standings<RivalSeat>([
    { item: { key: 'you', name: '你', you: true }, gold: fleet.gold, fame: fleet.fame, ports: myPorts },
    ...rivals.map(r => ({
      item: { key: r.id, name: r.name, you: false },
      gold: r.gold, fame: r.fame, ports: r.portsFound,
    })),
  ])
  const total = board.length
  /* 取向：主导轴只用来点亮一格「正在成为」，不给玩家编一个加权总分 */
  const lead = dominantAxis(notoriety)
  const leadTitle = currentTitle(notoriety)

  return (
    <div className="space-y-7">
      <p className="text-gold-500 font-serif text-[13px] italic -mt-2">
        酒馆的传闻比海风跑得快——这几个人和你抢着同一片海。
      </p>

      {/* ── 座次表 ── */}
      <section data-testid="rival-standings">
        <PageSection
          title="座次"
          hint="按金币排 · 三项各自算名次，同分并列"
          right={`${total} 位船长`}
        />
        <div className="mt-2" />
        <div className="rounded-sm border border-gold-700/25 bg-black/20 overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_5.6rem_4.4rem_6.2rem_5rem] gap-4 px-3 py-1.5 border-b border-gold-700/20 text-xs font-serif text-gold-600">
            <span>船长</span>
            <span className="text-right pr-[26px]">金币</span>
            <span className="text-right pr-[26px]">声望</span>
            <span className="text-right pr-[26px]">探索</span>
            <span className="text-right">比你</span>
          </div>
          {board.map(b => {
            /*
             * 「比你」这一列只给金币差：玩家真正要的那个数是"还差多少"，
             * 不是"他有多少" —— 后者表里已经有，前者要他心算。
             * 正数 = 他比你多。你自己那一行没有"比你自己"，写一道撇。
             */
            const gap = b.gold - fleet.gold
            return (
              <div
                key={b.item.key}
                data-testid={`standing-${b.item.key}`}
                data-you={b.item.you ? '1' : '0'}
                className={`grid grid-cols-[minmax(0,1fr)_5.6rem_4.4rem_6.2rem_5rem] items-center gap-4 px-3 py-1.5 text-[13px] font-serif
                  ${b.item.you ? 'bg-gold-700/15 border-l-2 border-l-gold-500' : 'border-l-2 border-l-transparent'}`}
              >
                <span className={`truncate ${b.item.you ? 'text-gold-100' : 'text-gold-300'}`}>
                  {b.item.you && <span className="text-gold-500 mr-1">▶</span>}
                  {b.item.name}
                </span>
                {/*
                  【名次紧挨数字右侧，表头右缩一个名次格】
                  先试过把名次挪到数字左边（数字右边界就能和表头齐），
                  但那样「#2」离前一列的 600 比离自己的 10 更近 —— 读起来串列。
                  真正要同时满足两条：
                    · 数字右边紧跟着它的名次（邻近性）；
                    · 表头压在它那一列的数字上（对齐）。
                  做法是给三个数字列的表头加 `pr-[26px]`（= ml-1.5 的 6px + 名次格 20px），
                  于是「表头右边界 = 数字右边界」，名次仍在数字右侧。
                  ⚠️ 改名次格宽度（w-5）或间距（ml-1.5）时，这个 pr 必须同步改。
                */}
                <span className="text-right tabular-nums text-gold-200">
                  {b.gold}
                  <span className={`ml-1.5 inline-block w-5 text-right text-xs ${b.goldRank === 1 ? 'text-gold-300' : 'text-gold-600'}`}>
                    #{b.goldRank}
                  </span>
                </span>
                <span className="text-right tabular-nums text-gold-200">
                  {b.fame}
                  <span className={`ml-1.5 inline-block w-5 text-right text-xs ${b.fameRank === 1 ? 'text-gold-300' : 'text-gold-600'}`}>
                    #{b.fameRank}
                  </span>
                </span>
                <span className="text-right tabular-nums text-gold-200">
                  {b.ports}/{ports.length}
                  <span className={`ml-1.5 inline-block w-5 text-right text-xs ${b.portsRank === 1 ? 'text-gold-300' : 'text-gold-600'}`}>
                    #{b.portsRank}
                  </span>
                </span>
                <span className={`text-right tabular-nums text-xs ${b.item.you ? 'text-gold-600' : gap > 0 ? 'text-gold-400' : 'text-gold-600'}`}>
                  {b.item.you ? '—' : gap === 0 ? '持平' : gap > 0 ? `+${gap}` : `${gap}`}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── 三位竞争船长：脸比数字更快被认出来 ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {rivals.map(r => {
          const badge = STYLE_BADGE[r.style]
          const portrait = rivalPortrait(r.id)
          const rk = board.find(x => x.item.key === r.id)
          const items = [
            { k: '金', n: rk?.goldRank ?? 0 },
            { k: '声', n: rk?.fameRank ?? 0 },
            { k: '探', n: rk?.portsRank ?? 0 },
          ]
          return (
            <div key={r.id} data-testid={`rival-card-${r.id}`} className="rounded-sm border border-gold-700/25 bg-black/20 p-3">
              <div className="flex items-start gap-3">
                {portrait && (
                  <img
                    src={portrait}
                    alt=""
                    aria-hidden="true"
                    className="w-14 h-[72px] object-cover object-top rounded-sm shrink-0"
                    style={{
                      // 与港口面板的立绘同一套装裱：1px 金线 + 2px 暗卡纸 + 内侧暗角
                      boxShadow:
                        'inset 0 0 0 1px rgba(206,172,108,0.6), inset 0 0 0 2px rgba(18,12,5,0.88), 0 1px 4px rgba(0,0,0,0.5)',
                    }}
                    onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-gold-200 font-serif text-sm truncate">{r.name}</span>
                    <span className={`shrink-0 text-xs font-serif px-1.5 py-0.5 rounded border ${badge.cls}`}>
                      {r.title} · {badge.label}
                    </span>
                  </div>
                  {/*
                    卡里只写**三项各自的座次**，不重复座次表里的数字：
                    表回答"多少"，卡回答"这人哪项强"。
                  */}
                  <div className="mt-2 flex items-center gap-2 text-xs font-serif">
                    {items.map(it => (
                      <span
                        key={it.k}
                        className={`px-1.5 py-0.5 rounded-sm border tabular-nums
                          ${it.n === 1
                            ? 'border-gold-500/60 bg-gold-700/20 text-gold-200'
                            : 'border-gold-700/30 text-gold-600'}`}
                      >
                        {it.k} 第 {it.n}
                      </span>
                    ))}
                    <span className="ml-auto text-gold-600">共 {total}</span>
                  </div>
                </div>
              </div>
              <p className="text-gold-500 text-xs font-serif italic mt-2.5 leading-relaxed">「{r.lastAction}」</p>
            </div>
          )
        })}
      </div>

      {/* ── 酒馆里传的话 ── */}
      <div>
        <PageSection title="酒馆里传的话" right={`${news.length}`} />
        <div className="mt-2" />
        {news.length === 0 ? (
          <Empty>还没人提起这一代的船长。等几天，传闻自己会飘过来。</Empty>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-1.5">
            {[...news].reverse().slice(0, 14).map(n => {
              const rival = rivals.find(r => r.id === n.rivalId)
              return (
                <div key={n.id} className="rounded-sm border border-gold-700/20 border-l-2 border-l-gold-700/60 bg-black/15 px-3 py-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-gold-500 text-xs font-serif">{rival?.name ?? '某位船长'}</span>
                    <span className="text-gold-600 text-xs font-serif tabular-nums">第 {n.day} 天</span>
                  </div>
                  <p className="text-gold-400 text-[13px] font-serif leading-snug">{n.text}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/*
        ── 你会被记成哪种船长 ──
        【为什么这一页需要有它】取向值（`notoriety`）从第 29 轮起就在累积：
        每个两难选项都会往某一轴加 1（events.ts 里 30 多处 `notoriety:{...}`）。
        但玩家只在**舰队面板**上看到最终的称号 —— 中途是完全看不见的，
        于是"我这一路选了什么"没有回看的地方，称号也像是凭空掉下来的。

        这里给五条并排的路，每条走到头就是那个称号（`TITLES.threshold`）。
        三条规则：
        · 只说"再走一格"，不写"好结局概率+4%"那种没实现的承诺（titles.ts 的教训）；
        · 主导轴（`dominantAxis`）只标一个「正在成为」，不替他算加权；
        · 一格都没走时明说"还没定"——不编造一个默认性格。
      */}
      <section data-testid="captain-leanings" className="pt-2">
        <PageSection
          title="你会被记成哪种船长"
          hint="每个两难选择往某一栏里加一格"
          right={leadTitle ? `正在成为 · ${leadTitle.name}` : '还没定'}
        />
        <p className="text-gold-500 font-serif text-[12px] italic mb-3">
          后世的记载只留一条。你还能改。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
          {TITLES.map(t => {
            const v = notoriety[t.axis] ?? 0
            const done = v >= t.threshold
            const isLead = lead?.axis === t.axis && lead.value > 0
            return (
              <div
                key={t.id}
                data-testid={`leaning-${t.axis}`}
                data-done={done ? '1' : '0'}
                data-lead={isLead ? '1' : '0'}
                data-value={v}
                className={`rounded-sm border px-3 py-2.5 transition-colors ${
                  done
                    ? 'border-gold-600/60 bg-gold-700/15'
                    : isLead
                      ? 'border-gold-600/40 bg-black/20'
                      : 'border-gold-700/20 bg-black/15'
                }`}
              >
                <div className="flex items-baseline justify-between gap-1">
                  <span className={`font-serif text-[13px] truncate ${done ? 'text-gold-200' : 'text-gold-400'}`}>
                    {t.name}
                  </span>
                  <span className={`shrink-0 text-xs font-serif tabular-nums ${done ? 'text-gold-300' : 'text-gold-600'}`}>
                    {done ? '已成' : `${v}/${t.threshold}`}
                  </span>
                </div>
                {/* 点阵：一格 = 一次选择。满格即授称号，比"还差 2"更快读。 */}
                <div className="flex gap-1 mt-1.5" aria-hidden="true">
                  {Array.from({ length: t.threshold }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 flex-1 rounded-full ${
                        i < v
                          ? done ? 'bg-gold-300' : 'bg-gold-500'
                          : 'bg-black/45 ring-1 ring-inset ring-gold-700/40'
                      }`}
                    />
                  ))}
                </div>
                <p className={`mt-1.5 text-[12px] font-serif leading-snug ${done ? 'text-gold-500' : 'text-gold-600'}`}>
                  {t.effect}
                </p>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

/* ────────────────────────── 小件 ────────────────────────── */

/*
 * 任务页的三段（眼下能接 / 手上这单 / 还没到火候）。
 *
 * 【为什么它不再自己画一套标题】这里是全书唯一还在用 18px 段落标题的地方 ——
 * 而 18px 在这一册里是**页头**的字号（记事 / 已点亮 / 已得 / 座次）。
 * 于是"任务"这一页的段落比别的页大一号，翻页时层级会跳。
 * 现在它只是 PageSection 的薄壳：13px + 底部金线 + 计数在右端。
 * 卡片里的 15px 委托名才是内容，段落只是标签 —— 标签比内容小是对的。
 */
function Section({ title, count, hint, children }: {
  title: string; count?: number; hint?: string; children: React.ReactNode
}) {
  return (
    <section>
      <PageSection
        title={title}
        hint={hint}
        right={count === undefined ? undefined : `${count}`}
      />
      <div className="mt-2.5 space-y-2">{children}</div>
    </section>
  )
}

function Row({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <div className={`flex items-center gap-4 rounded-sm border px-4 py-3
      ${dim ? 'border-gold-700/15 bg-black/10' : 'border-gold-700/25 bg-black/20'}`}>
      {children}
    </div>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 px-1.5 py-0.5 rounded-sm border border-gold-700/40 text-xs font-serif text-gold-500">
      {children}
    </span>
  )
}

function Reward({ gold, fame }: { gold: number; fame?: number }) {
  return (
    <div className="mt-1.5 flex items-center gap-3 text-xs font-serif text-gold-400">
      <span className="font-mono tabular-nums">{gold} 金</span>
      {!!fame && <span className="font-mono tabular-nums">+{fame} 声望</span>}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-serif text-gold-600 py-4 leading-relaxed">{children}</p>
}
