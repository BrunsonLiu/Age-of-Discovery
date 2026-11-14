import { useMemo, useState } from 'react'
import { BookOpen, X, Compass, Trophy, Newspaper, Calendar, ChevronDown, Lock } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore, type LogTab } from '@/store/useMapStore'
import { ports } from '@/data/ports'
import { achievements } from '@/data/achievements'
import { UI_ASSETS } from '@/data/uiAssets'
import { tasks } from '@/data/tasks'
import { goods } from '@/data/goods'
import { taskGold } from '@/utils/crewPerks'
import { ScrollText as ScrollIcon, CheckCircle2, Package, Coins } from 'lucide-react'
import VoyageNextCard from '@/components/panels/VoyageNextCard'
import { useFxStore as useFx } from '@/store/useFxStore'
import { rivalPortrait } from '@/data/portraits'
import { Ship } from 'lucide-react'
import type { Rival } from '@/types'
import { groupJournal } from '@/utils/captainLog'
import { EVENT_TYPE_COLORS, renderEventIcon } from '@/utils/eventTypeStyles'
import { AtlasView, SightingsView } from '@/components/panels/LogbookViews'
import ScrollFade from '@/components/ui/ScrollFade'

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
      style={{ backgroundColor: '#0d1116' }}
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
          <span className="hidden md:block text-xs tracking-[0.32em] text-gold-600/80 font-serif mb-0.5">LOG OF THE VOYAGE</span>
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
        {/* 标签列：桌面竖排，移动端横排可横滚 */}
        <nav
          className="shrink-0 flex md:flex-col gap-1 px-3 md:px-4 py-2 md:py-4
            overflow-x-auto md:overflow-visible border-b md:border-b-0 md:border-r border-gold-700/25
            md:w-56 scrollbar-none"
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
                className={`group shrink-0 md:w-full flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-left transition-colors
                  ${on
                    ? 'bg-gold-700/20 text-gold-200 shadow-[inset_2px_0_0_0_rgba(212,168,56,0.9)]'
                    : 'text-gold-600 hover:text-gold-400 hover:bg-gold-700/10'}`}
              >
                <span className="shrink-0 self-start mt-0.5">{t.icon}</span>
                {/*
                  两行：第一行中文 + 计数，第二行英文。
                  原来三者挤在一行，208px 宽的导航里「COMMISSIONS」与「12 在办」
                  互相压字（实测截图上 "COMMIS2 在办 SIONS"）——
                  页签是这本册子的目录，读不清就不像目录了。
                */}
                <span className="flex-1 min-w-0 leading-tight">
                  <span className="flex items-baseline gap-2 min-w-0">
                    <span className="font-serif text-sm whitespace-nowrap">{t.label}</span>
                    {counts[t.key] && (
                      <span className={`ml-auto shrink-0 text-xs font-mono tabular-nums ${on ? 'text-gold-400' : 'text-gold-700'}`}>
                        {counts[t.key]}
                      </span>
                    )}
                  </span>
                  <span className="hidden md:block text-xs tracking-[0.14em] text-gold-700/70 truncate mt-0.5">{t.en}</span>
                </span>
              </button>
            )
          })}
        </nav>

        {/* 内容区：一张大纸。max-w 限制的是**阅读行宽**，不是"窄卡片" */}
        <div className="flex-1 min-h-0 relative">
          <ScrollFade className="h-full">
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
  const gold = (g: number) => taskGold(g, hasMerchant)
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
    const goldGot = gold(t.reward.gold)
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
                <Reward gold={gold(t.reward.gold)} fame={t.reward.fame} />
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
                  <Reward gold={gold(t.reward.gold)} fame={t.reward.fame} />
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
                  <span className="shrink-0 text-xs font-serif text-gold-700 whitespace-nowrap">到港再交付</span>
                )}
              </Row>
            )
          })}
        </Section>

        {locked.length > 0 && (
          <Section title="还没到火候" count={locked.length} hint="天数或港口不满足">
            {locked.map(t => (
              <Row key={t.id} dim>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Tag>{TYPE_LABEL[t.type] ?? t.type}</Tag>
                    <h3 className="font-serif text-[15px] text-gold-500 truncate">{t.title}</h3>
                  </div>
                  <p className="text-[12px] font-serif text-gold-700 mt-1">
                    {t.minDay !== undefined && fleet.day < t.minDay ? `第 ${t.minDay} 天才有人提起这单` : ''}
                    {t.portId != null && fleet.currentPortId !== t.portId ? `在${ports.find(p => p.id === t.portId)?.nameCn ?? '别处'}接` : ''}
                  </p>
                </div>
              </Row>
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
          <div className="flex items-center justify-between text-[13px] font-serif text-gold-400">
            <span className="flex items-center gap-1.5"><CheckCircle2 size={13} /> 冒险进度</span>
            <span className="font-mono text-gold-200 tabular-nums">{completedTasks.length}/{tasks.length}</span>
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
  /*
   * 记事来自 `eventLog`（每天一行的那种），不是 `logbook`（带回的整页见闻）。
   * 两者是两本账：`logbook` 的 kind 只有 arrival/title/echo/legend/tribute，
   * 一页一页的"带回了什么"；`eventLog` 才是流水账。
   *
   * 【为什么按天折叠、而不是把所有条目摊开】
   * 摊开之后一屏里是十几条"我选了…／于是…"，像调试日志；而日志是这游戏里
   * 唯一能成为"回忆"的地方。一天一行（≤24 字），点开才是当天的账；
   * 默认展开最新一天 —— 翻开日志的人通常想知道"刚才那次到底怎么回事"。
   */
  const eventLog = useGameStore(s => s.eventLog)
  const fleetName = useGameStore(s => s.fleet.name)
  const days = groupJournal(eventLog)
  const [openDays, setOpenDays] = useState<number[]>(() => (days.length ? [days[0].day] : []))
  const toggle = (day: number) =>
    setOpenDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]))

  return (
    /*
     * 两栏：左边是"带回来的那一页"（见闻卡本来就该像册子的一页），
     * 右边是按天折叠的流水账。
     * 之前在整屏里上下堆：见闻挤在上方一行、记事被拉成 1000px 长条 ——
     * 12px 的字铺满整屏，眼睛要横着跑，读两行就累了。
     */
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-8 xl:gap-10">
      <div className="min-w-0">
        <SightingsView />
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline gap-3 mb-3 pb-2 border-b border-gold-700/30">
          <h2 className="font-serif text-lg text-gold-300">记事</h2>
          <span className="text-gold-200 text-[13px] font-serif">{fleetName}</span>
          <span className="ml-auto text-gold-600 text-xs font-serif">
            {days.length > 0 ? `共 ${days.length} 天有记载` : '还没写下第一页'}
          </span>
        </div>

        {days.length === 0 ? (
          <Empty>出海吧，笔在后面追着你。</Empty>
        ) : (
          <div className="space-y-1.5">
            {days.map(({ day, headline, entries }) => {
              const open = openDays.includes(day)
              return (
                <div key={day} className="rounded-sm border border-gold-700/20 bg-black/15 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggle(day)}
                    aria-expanded={open}
                    data-testid={`journal-day-${day}`}
                    className="w-full min-h-[40px] flex items-start gap-2.5 px-3 py-2 text-left press hover:bg-gold-700/10 transition-colors"
                  >
                    <Calendar size={13} className="mt-1 shrink-0 text-gold-600" aria-hidden="true" />
                    <span className="shrink-0 text-gold-500 text-xs font-serif tabular-nums w-14">第 {day} 天</span>
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
                    <div className="px-3 pb-3 pt-2 space-y-2.5 border-t border-gold-700/20">
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
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────── 成就 ────────────────────────── */

function AchievementPage() {
  const earned = useGameStore(s => s.achievements)
  const stats = useGameStore(s => s.stats)
  const got = new Set(earned)
  const pct = Math.round((earned.length / Math.max(1, achievements.length)) * 100)

  return (
    <div className="space-y-7">
      {/* 门面 + 总进度 */}
      <div className="flex items-center gap-5">
        <img
          src={UI_ASSETS.medal}
          alt=""
          aria-hidden="true"
          className="h-14 w-auto object-contain shrink-0 drop-shadow-[0_0_14px_rgba(212,168,56,0.4)]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3">
            <h2 className="font-serif text-lg text-gold-300">
              已得 <span className="font-mono text-gold-100">{earned.length}</span>
              <span className="text-gold-700"> / {achievements.length}</span>
            </h2>
            <span className="text-xs font-serif text-gold-600">生涯里程碑，判定都在你做过的事上</span>
          </div>
          <div className="mt-2 h-1 rounded-full bg-gold-700/20 overflow-hidden max-w-[420px]">
            <div className="h-full bg-gold-500/80" style={{ width: `${pct}%` }} />
          </div>
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

      {/* 网格：宽屏 4~5 列，一眼能看到"还差几格" */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3">
        {achievements.map(a => {
          const on = got.has(a.id)
          const Icon = a.icon
          return (
            <div
              key={a.id}
              data-testid={`achievement-${a.id}`}
              data-earned={on ? '1' : '0'}
              className={`relative rounded-sm p-3.5 border overflow-hidden transition-colors
                ${on ? 'border-gold-600/55 bg-gold-700/12' : 'border-gold-700/20 bg-black/20'}`}
            >
              {/* 已获得：左缘一道金竖条（"盖了章"）。未获得一个亮元素都不留。 */}
              {on && (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-0 bottom-0 w-[3px]"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(240,216,138,0) 0%, rgba(240,216,138,0.95) 26%, rgba(240,216,138,0.95) 74%, rgba(240,216,138,0) 100%)',
                  }}
                />
              )}
              <div className={`flex items-center justify-between ${on ? 'text-gold-300' : 'text-gold-700'}`}>
                <Icon size={18} />
                {on
                  ? <span className="text-xs tracking-wider text-gold-500">已得</span>
                  : <Lock size={12} className="text-gold-700" />}
              </div>
              <h3 className={`mt-2.5 font-serif text-sm ${on ? 'text-gold-200' : 'text-gold-600'}`}>{a.title}</h3>
              <p className={`mt-1 text-xs font-serif leading-relaxed ${on ? 'text-gold-500' : 'text-gold-700'}`}>
                {a.description}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─────────────────────── 同代船长 ─────────────────────── */

function RivalPage() {
  const fleet = useGameStore(s => s.fleet)
  const discoveredPorts = useGameStore(s => s.discoveredPorts)
  const rivals = useGameStore(s => s.rivals)
  const news = useGameStore(s => s.rivalNews)

  const myPorts = discoveredPorts.length
  const bestRivalGold = Math.max(fleet.gold, ...rivals.map(r => r.gold))
  const bestRivalFame = Math.max(fleet.fame, ...rivals.map(r => r.fame))
  const bestRivalPorts = Math.max(myPorts, ...rivals.map(r => r.portsFound))

  return (
    <div className="space-y-8">
      <p className="text-gold-500 font-serif text-[13px] italic -mt-2">
        酒馆的传闻比海风跑得快——这几个人和你抢着同一片海。
      </p>

      {/* 三位竞争船长：宽屏并排三张，头像保留（脸比数字更快被认出来） */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {rivals.map(r => {
          const badge = STYLE_BADGE[r.style]
          const portrait = rivalPortrait(r.id)
          return (
            <div key={r.id} className="rounded-sm border border-gold-700/25 bg-black/20 p-3">
              <div className="flex items-start gap-3">
                {portrait && (
                  <img
                    src={portrait}
                    alt=""
                    aria-hidden="true"
                    className="w-12 h-16 object-cover object-top rounded-sm shrink-0"
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
                  <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                    <div>
                      <div className="text-gold-600 text-xs font-serif">金币</div>
                      <div className={`text-[13px] font-serif tabular-nums ${r.gold >= fleet.gold ? 'text-gold-200' : 'text-gold-500'}`}>
                        {r.gold}
                      </div>
                    </div>
                    <div>
                      <div className="text-gold-600 text-xs font-serif">声望</div>
                      <div className={`text-[13px] font-serif tabular-nums ${r.fame >= fleet.fame ? 'text-gold-200' : 'text-gold-500'}`}>
                        {r.fame}
                      </div>
                    </div>
                    <div>
                      <div className="text-gold-600 text-xs font-serif">探索</div>
                      <div className={`text-[13px] font-serif tabular-nums ${r.portsFound >= myPorts ? 'text-gold-200' : 'text-gold-500'}`}>
                        {/* 分母来自 ports.length：加了广州之后写死 /20 就是错的 */}
                        {r.portsFound}/{ports.length}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-gold-500 text-xs font-serif italic mt-2">「{r.lastAction}」</p>
            </div>
          )
        })}
      </div>

      {/* 你的座次 + 传闻，两栏 */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-8">
        <div className="rounded-sm border border-gold-700/25 bg-black/20 p-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <Ship size={13} className="text-gold-500" />
            <span className="text-gold-300 font-serif text-[13px]">你的座次</span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-center">
            <div>
              <div className="text-gold-600 text-xs font-serif">财富</div>
              <div className="text-gold-200 text-[13px] font-serif tabular-nums">{fleet.gold}<span className="text-gold-700"> / {bestRivalGold}</span></div>
            </div>
            <div>
              <div className="text-gold-600 text-xs font-serif">声望</div>
              <div className="text-gold-200 text-[13px] font-serif tabular-nums">{fleet.fame}<span className="text-gold-700"> / {bestRivalFame}</span></div>
            </div>
            <div>
              <div className="text-gold-600 text-xs font-serif">探索</div>
              <div className="text-gold-200 text-[13px] font-serif tabular-nums">{myPorts}<span className="text-gold-700"> / {bestRivalPorts}</span></div>
            </div>
          </div>
          <p className="text-gold-600 text-[12px] font-serif mt-2 leading-relaxed">
            斜线后为同代最强。落后不可怕——可怕的是停下。
          </p>
        </div>

        <div>
          <div className="flex items-baseline gap-3 mb-2 pb-1.5 border-b border-gold-700/25">
            <h2 className="font-serif text-[15px] text-gold-300">酒馆里传的话</h2>
            <span className="font-mono text-xs text-gold-600 tabular-nums">{news.length}</span>
          </div>
          {news.length === 0 ? (
            <Empty>还没人提起这一代的船长。等几天，传闻自己会飘过来。</Empty>
          ) : (
            <div className="space-y-1.5">
              {[...news].reverse().slice(0, 14).map(n => {
                const rival = rivals.find(r => r.id === n.rivalId)
                return (
                  <div key={n.id} className="rounded-sm border border-gold-700/20 border-l-2 border-l-gold-700/60 bg-black/15 px-3 py-2">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-gold-500 text-xs font-serif">{rival?.name ?? '某位船长'}</span>
                      <span className="text-gold-700 text-xs font-serif tabular-nums">第 {n.day} 天</span>
                    </div>
                    <p className="text-gold-400 text-[13px] font-serif leading-snug">{n.text}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ────────────────────────── 小件 ────────────────────────── */

function Section({ title, count, hint, children }: {
  title: string; count?: number; hint?: string; children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="font-serif text-lg text-gold-300">{title}</h2>
        {count !== undefined && <span className="font-mono text-xs text-gold-600 tabular-nums">{count}</span>}
        {hint && <span className="text-xs font-serif text-gold-700 truncate">{hint}</span>}
        <span className="flex-1 h-px bg-gold-700/25" />
      </div>
      <div className="space-y-2">{children}</div>
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
  return <p className="text-xs font-serif text-gold-700 py-4 leading-relaxed">{children}</p>
}
