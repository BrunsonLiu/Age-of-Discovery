import { useState } from 'react'
import { Scroll, Calendar, ChevronDown } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { EVENT_TYPE_COLORS, renderEventIcon } from '@/utils/eventTypeStyles'
import { groupJournal } from '@/utils/captainLog'
import ScrollFade from '@/components/ui/ScrollFade'
import ParchmentCard from '@/components/ui/ParchmentCard'

/**
 * 航海日志（船长日志）。
 *
 * 【为什么改成"每天一行、点开看细节"】
 * 原来是按事件逐条堆卡片：日期 + 事件名 + 「选择: xxx」+ 结果描述 + 一段史实注。
 * 一屏只放得下两条，读起来像事件调试记录 —— 而日志是这个游戏里唯一能成为
 * "回忆"的地方，它该像一个人写下的东西。
 *
 * 现在：每天一行（≤24 字、不带数字、船长的语气），点开才是当天的账。
 * 数字留给底栏、贸易面板和结算屏 —— 日志的价值恰恰是它不记账。
 * 没有条目的一天不出现（凑数的"今天风平浪静"会让真正的平静失去分量）。
 */
export default function EventLog() {
  const eventLog = useGameStore(s => s.eventLog)
  const fleetName = useGameStore(s => s.fleet.name)
  const setActivePanel = useGameStore(s => s.setActivePanel)

  const days = groupJournal(eventLog)
  /*
   * 默认展开**最新一天**：玩家点开日志，通常是想知道"刚才那次到底怎么回事"。
   * 更早的日子折叠成一行 —— 那才是"日记"的读法：先看目录，再翻某一天。
   */
  const [openDays, setOpenDays] = useState<number[]>(() => (days.length ? [days[0].day] : []))
  const toggle = (day: number) =>
    setOpenDays(prev => (prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]))

  return (
    <div className="w-full md:w-80 animate-slide-in-left">
      <ParchmentCard title="航海日志" onClose={() => setActivePanel(null)}>
        {days.length === 0 ? (
          <div className="text-center py-6">
            <Scroll size={32} className="mx-auto text-gold-500/50 mb-2" />
            <p className="text-gold-400 text-[13px] font-serif">还没写下第一页</p>
            <p className="text-gold-500 text-[13px] font-serif mt-1">出海吧，笔在后面追着你</p>
          </div>
        ) : (
          <>
            {/* 页眉：这本日志是谁的。原来整本没有署名，翻十页也不知道在记谁的账 */}
            <div className="flex items-baseline gap-2 mb-2 pb-2 border-b border-gold-700/30">
              <span className="text-gold-200 text-[13px] font-serif">{fleetName}</span>
              <span className="text-gold-500 text-[12px] font-serif ml-auto">
                共 {days.length} 天有记载
              </span>
            </div>

            <ScrollFade className="max-h-80 overflow-y-auto scroll-parchment">
              <div className="space-y-1.5">
                {days.map(({ day, headline, entries }) => {
                  const open = openDays.includes(day)
                  return (
                    <div key={day} className="inlay--flat rounded overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggle(day)}
                        aria-expanded={open}
                        className="w-full flex items-start gap-2 px-2.5 py-2 text-left press"
                      >
                        <Calendar size={12} className="mt-1 shrink-0 text-gold-500" aria-hidden="true" />
                        <span className="shrink-0 text-gold-400 text-[12px] font-serif tabular-nums">
                          第 {day} 天
                        </span>
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
                              {/*
                                「我选了：」而不是「选择：」。
                                一个字的差别：前者是写日记的人在回顾自己的决定，
                                后者是系统在打印日志字段。
                              */}
                              <p className="text-gold-300 text-[13px] font-serif mt-0.5 leading-snug">
                                我选了：{entry.event.choices[entry.choiceIndex]?.text}
                              </p>
                              <p className="text-gold-400 text-[13px] font-serif leading-snug mt-0.5">
                                {entry.outcome.description}
                              </p>
                              {/*
                                史实注降级成**页边小注**：左侧一道细线、无图标、无底色。
                                它属于"抄写员在页边补的一句"，不属于船长的正文；
                                原来那个带图标带底色的方框，读起来像博物馆标签贴在日记本里。
                              */}
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
            </ScrollFade>
          </>
        )}
      </ParchmentCard>
    </div>
  )
}
