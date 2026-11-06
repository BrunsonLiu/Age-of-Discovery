import { useState } from 'react'
import { BookOpen, Calendar, ChevronDown, Map, Scroll, ScrollText } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { EVENT_TYPE_COLORS, renderEventIcon } from '@/utils/eventTypeStyles'
import { groupJournal } from '@/utils/captainLog'
import ParchmentCard from '@/components/ui/ParchmentCard'
import { AtlasView, SightingsView } from './LogbookViews'

/**
 * 航海日志：一本会自己变厚的册子。
 *
 * 【为什么是三页而不是再开一个新面板】
 * 侧栏本来就有一个「日志」入口，玩家已经知道去哪儿翻。再挂一块「图鉴」
 * 只会把同一个动作拆到两个地方。现在一进来先看到「见闻」——刚靠岸带回来的
 * 那一页；往右是「图鉴」（点亮的格子），再往右是原来的「记事」（每天一行）。
 *
 * 【为什么默认停在见闻】
 * 每趟航行以前是全闭合的：结算完数字清零，没有任何东西指向下一趟。
 * 现在到港必带回一页见闻 + 一句不过期的线索，日志的入口就是那个"回来的理由"。
 */

type LogbookTab = 'sightings' | 'atlas' | 'journal'

const TABS: { key: LogbookTab; label: string; icon: React.ReactNode }[] = [
  { key: 'sightings', label: '见闻', icon: <ScrollText size={13} /> },
  { key: 'atlas', label: '图鉴', icon: <Map size={13} /> },
  { key: 'journal', label: '记事', icon: <BookOpen size={13} /> },
]

export default function EventLog() {
  const [tab, setTab] = useState<LogbookTab>('sightings')
  const setActivePanel = useGameStore(s => s.setActivePanel)
  const unread = useGameStore(s => s.logbook.filter(e => !e.read).length)

  return (
    <div className="w-full md:w-80 animate-slide-in-left">
      <ParchmentCard title="航海日志" onClose={() => setActivePanel(null)}>
        <div role="tablist" aria-label="航海日志分页" className="grid grid-cols-3 gap-1 mb-3">
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={`min-h-[40px] flex items-center justify-center gap-1 rounded border press text-[12px] font-serif transition-colors ${
                  active
                    ? 'border-gold-400/60 bg-gold-700/30 text-gold-100'
                    : 'border-gold-700/30 text-gold-400 hover:text-gold-200'
                }`}
              >
                {t.icon}
                {t.label}
                {t.key === 'sightings' && unread > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-gold-300 shrink-0" aria-label={`${unread} 页未读`} />
                )}
              </button>
            )
          })}
        </div>

        {tab === 'sightings' && <SightingsView />}
        {tab === 'atlas' && <AtlasView />}
        {tab === 'journal' && <JournalView />}
      </ParchmentCard>
    </div>
  )
}

/**
 * 记事：按天一行、点开才是当天的账。
 *
 * 原来按事件逐条堆卡片，读起来像事件调试记录；而日志是这游戏里唯一能成为
 * "回忆"的地方。一天一行、≤24 字、不带数字，数字留给底栏和面板。
 * 没有条目的一天不出现（凑数的"今天风平浪静"会让真正的平静失去分量）。
 */
function JournalView() {
  const eventLog = useGameStore(s => s.eventLog)
  const fleetName = useGameStore(s => s.fleet.name)

  const days = groupJournal(eventLog)
  /* 默认展开最新一天：点开日志通常想知道"刚才那次到底怎么回事" */
  const [openDays, setOpenDays] = useState<number[]>(() => (days.length ? [days[0].day] : []))
  const toggle = (day: number) =>
    setOpenDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]))

  if (days.length === 0) {
    return (
      <div className="text-center py-6">
        <Scroll size={32} className="mx-auto text-gold-500/50 mb-2" />
        <p className="text-gold-400 text-[13px] font-serif">还没写下第一页</p>
        <p className="text-gold-500 text-[13px] font-serif mt-1">出海吧，笔在后面追着你</p>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-baseline gap-2 mb-2 pb-2 border-b border-gold-700/30">
        <span className="text-gold-200 text-[13px] font-serif">{fleetName}</span>
        <span className="text-gold-500 text-[12px] font-serif ml-auto">共 {days.length} 天有记载</span>
      </div>

      <div className="space-y-1.5">
        {days.map(({ day, headline, entries }) => {
          const open = openDays.includes(day)
          return (
            <div key={day} className="inlay--flat rounded overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(day)}
                aria-expanded={open}
                className="w-full min-h-[40px] flex items-start gap-2 px-2.5 py-2 text-left press"
              >
                <Calendar size={12} className="mt-1 shrink-0 text-gold-500" aria-hidden="true" />
                <span className="shrink-0 text-gold-400 text-[12px] font-serif tabular-nums">第 {day} 天</span>
                <span className="flex-1 text-gold-200 text-[13px] font-serif leading-snug">
                  {headline ?? '（这一天没有记载）'}
                </span>
                <ChevronDown
                  size={13}
                  aria-hidden="true"
                  className={`shrink-0 mt-0.5 text-gold-500 transition-transform ${open ? 'rotate-180' : ''}`}
                />
              </button>

              {open && (
                <div className="px-2.5 pb-2.5 space-y-2 border-t border-gold-700/20 pt-2">
                  {entries.map((entry, i) => (
                    <div
                      key={`${entry.day}-${entry.event.id}-${entry.choiceIndex}-${i}`}
                      className={`pl-2 border-l-2 ${EVENT_TYPE_COLORS[entry.event.type] || 'border-l-gold-500/50'}`}
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
    </>
  )
}
