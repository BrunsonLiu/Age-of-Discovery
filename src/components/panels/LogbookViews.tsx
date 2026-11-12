import { useEffect, useState } from 'react'
import { Anchor, Compass, Flag, Lock, MapPin, Package, ScrollText, Sparkles } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports } from '@/data/ports'
import { achievements } from '@/data/achievements'
import { DEBRIS_INFO } from '@/data/debris'
import { RELICS, relicDistanceNm, relicInSeason } from '@/data/relics'
import { ALL_SEASONS } from '@/utils/season'
import { REGION_CN, countEchoes, echoDayFor } from '@/data/logbook'
import { logbookArt } from '@/data/logbookArt'
import { clueCenter } from '@/utils/harbor'
import { legendDistanceNm, nationById, storyStep } from '@/data/nations'
import type { DebrisKind } from '@/data/debris'

/**
 * 航海日志的三页内容：见闻 / 图鉴 / 记事（记事在 EventLog.tsx）。
 *
 * 【为什么把「见闻」放在第一页】
 * 玩家点开日志通常是刚靠岸，想看"这趟带回了什么"。
 * 把累计统计放第一页会立刻变成第二张报表——日志的价值是它不记账。
 *
 * 【为什么每个格子都能点】
 * 最初的反馈就是"点了没反应"。图鉴里未点亮的格子如果按下去毫无回执，
 * 玩家会以为是坏的。所以统一给一条详情行：要么讲这是什么，要么把地图移过去。
 */

/** 点击详情行的统一回执文案 */
function useDetail() {
  const [detail, setDetail] = useState<string | null>(null)
  return { detail, setDetail }
}

export function SightingsView() {
  const logbook = useGameStore(s => s.logbook)
  const markLogbookRead = useGameStore(s => s.markLogbookRead)
  const setActivePanel = useGameStore(s => s.setActivePanel)
  const setCenter = useMapStore(s => s.setCenter)

  /*
   * mount 那一刻记下哪些是新的：effect 马上会把 read 标成 true，
   * 但不该让"这次刚带回的那一页"在玩家眼前瞬间失去高亮。
   */
  const [fresh] = useState(() => new Set(logbook.filter(e => !e.read).map(e => e.id)))
  useEffect(() => {
    if (logbook.some(e => !e.read)) markLogbookRead()
  }, [logbook, markLogbookRead])

  const followClue = (targetPortId: number | null) => {
    // 与岸上视角的「在地图上看看」共用 clueCenter：
    // 只把地图移过去，不替玩家出航、不承诺奖励、不设期限
    const center = clueCenter(targetPortId)
    if (!center) return
    setCenter(center)
    setActivePanel(null)
  }

  return (
    <div className="space-y-2">
      {logbook.length === 0 ? (
        /* 空册子也要说清"接下来会发生什么"，不能只摆一个图标 */
        <div className="text-center py-6">
          <ScrollText size={30} className="mx-auto text-gold-500/60 mb-2" />
          <p className="text-gold-300 text-[13px] font-serif">这本册子还是空的</p>
          <p className="text-gold-400 text-[13px] font-serif mt-1 leading-relaxed">
            每靠一次岸，就多一页见闻和一句去处。<br />不赶时间，也没人催。
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2 pb-1.5 border-b border-gold-700/30">
            <span className="text-gold-300 text-[13px] font-serif">共 {logbook.length} 页</span>
            <span className="text-gold-500 text-[12px] font-serif ml-auto">新的一页在最上面</span>
          </div>

          <div className="space-y-2">
            {logbook.map((entry, idx) => {
              const isFresh = fresh.has(entry.id)
              // 旧页不改写：那句话当时确实"没人催"。只在下面补一行真实的下文，
              // 天数从应验页读（不是拿今天算），册子才不会自己改口。
              const echoDay = echoDayFor(logbook, entry.targetPortId)
              /*
               * 只有最上面那一页配画。
               *
               * 理由不是省流量，是"层级"：每页都配图会变成一本画册在滚动，
               * 反而没有重点；只给最新一页，玩家翻开就知道"这趟从哪儿回来"，
               * 往下翻是旧账，本来就只需要字。
               *
               * 72px 高是量出来的：面板内容宽约 296，296/72≈4.1:1，与港口图的
               * 3.6:1 只差一点上下裁切；再高就开始抢正文，再矮看不出是哪个城。
               */
              const art = idx === 0 ? logbookArt(entry.portId) : undefined
              return (
                <article
                  key={entry.id}
                  data-testid={entry.kind === 'echo' ? 'echo-entry' : undefined}
                  className={`rounded-md px-2.5 py-2 border ${
                    entry.kind === 'title' || entry.kind === 'echo'
                      ? 'border-gold-400/60 bg-gold-700/15'
                      : isFresh
                        ? 'border-gold-400/45 bg-gold-700/10'
                        : 'border-gold-700/25'
                  }`}
                >
                  {art && (
                    <div
                      className="relative -mx-2.5 -mt-2 mb-2 h-[72px] overflow-hidden rounded-t-[5px]"
                      style={{
                        // 与港口面板同一套"装裱"：外金线 + 内暗卡纸 + 内侧暗角。
                        // 不装裱的话，这张写实油画贴在羊皮纸上会读成"贴图"，
                        // 而不是"舱壁上挂着的一幅画"。
                        boxShadow:
                          'inset 0 0 0 1px rgba(206,172,108,0.5), inset 0 0 0 3px rgba(18,12,5,0.82), inset 0 0 16px rgba(0,0,0,0.42)',
                      }}
                    >
                      <img
                        src={art}
                        alt=""
                        aria-hidden="true"
                        data-testid="logbook-art"
                        className="w-full h-full object-cover"
                        style={{ objectPosition: 'center 42%' }}
                        onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {entry.kind === 'title'
                      ? <Sparkles size={13} className="text-gold-300 shrink-0" aria-hidden="true" />
                      : entry.kind === 'echo'
                        ? <MapPin size={13} className="text-gold-300 shrink-0" aria-hidden="true" />
                        : <Anchor size={13} className="text-gold-400 shrink-0" aria-hidden="true" />}
                    <h4 className="text-gold-200 text-[14px] font-serif tracking-wide">{entry.title}</h4>
                    {isFresh && (
                      <span className="text-xs text-gold-300 border border-gold-500/40 rounded px-1 leading-4">新</span>
                    )}
                    <span className="ml-auto text-gold-500 text-[12px] font-serif tabular-nums">第 {entry.day} 天</span>
                  </div>

                  <p className="text-gold-300 text-[13px] font-serif leading-relaxed mt-1.5">{entry.text}</p>
                  <p className="text-gold-500 text-[12px] font-serif italic mt-1 pl-2 border-l border-gold-700/40">
                    {entry.aside}
                  </p>

                  {entry.hint && (
                    <div className="mt-2 pt-2 border-t border-gold-700/25">
                      <p className="text-gold-400 text-[12px] font-serif leading-relaxed">{entry.hint}</p>
                      {echoDay != null && (
                        <p data-testid="clue-fulfilled" className="text-gold-200 text-[12px] font-serif mt-1.5">
                          这句已应验 · 第 {echoDay} 天到的
                        </p>
                      )}
                      {entry.targetPortId != null && (
                        <button
                          type="button"
                          onClick={() => followClue(entry.targetPortId)}
                          className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-serif text-gold-200 hover:text-gold-100 border border-gold-600/40 rounded px-2 py-1 press"
                        >
                          <MapPin size={12} aria-hidden="true" />
                          在地图上看看
                        </button>
                      )}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * 图鉴的一格：视觉可以分大小，命中区域统一 ≥40px。
 *
 * 【heard 是"双轨"的分界】没找到的东西不是一回事：
 *   · 港口、成就、漂流物、遗物 —— 玩家**没见过**，名字必须藏起来（`？`），
 *     否则等于剧透"西边还有个岛"；
 *   · 传说 —— 开局在国别介绍里就**听说过**它（`rumor`），地图上还钉着一个标记。
 *     这时候再把它写成 `？`，等于把玩家已经知道的事瞒起来。
 * 所以 `heard` 的格子：名字照写、状态写"还没到过那片海"，图标用罗盘不用锁。
 */
function AtlasCell({
  label, sub, found, onClick, icon, heard = false,
}: {
  label: string
  sub: string
  found: boolean
  onClick: () => void
  icon?: React.ReactNode
  /** 玩家已经听说过它（传说）：名字照写，只是标"未寻见" */
  heard?: boolean
}) {
  const showName = found || heard
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={found ? label : heard ? `${label} · ${sub}` : `${sub} · 还没见过`}
      data-found={found ? '1' : '0'}
      className={`min-h-[44px] w-full text-left rounded px-2 py-1.5 border press transition-colors ${
        found
          ? 'border-gold-500/45 bg-gold-700/15 hover:bg-gold-700/25'
          : heard
            ? 'border-gold-600/40 bg-black/20 hover:border-gold-500/60'
            : 'border-gold-700/25 hover:border-gold-600/40'
      }`}
    >
      <span className="flex items-center gap-1.5">
        <span className={`shrink-0 ${found ? 'text-gold-300' : heard ? 'text-gold-400' : 'text-gold-500/70'}`}>
          {found || heard ? (icon ?? <Compass size={13} />) : <Lock size={13} />}
        </span>
        <span className={`text-[12px] font-serif truncate ${found ? 'text-gold-200' : heard ? 'text-gold-300' : 'text-gold-500'}`}>
          {showName ? label : '？'}
        </span>
      </span>
      <span className="block text-xs font-serif text-gold-500 mt-0.5 truncate">{sub}</span>
    </button>
  )
}

function SectionTitle({ children, right }: { children: React.ReactNode; right?: string }) {
  return (
    <div className="flex items-baseline gap-2 pt-1">
      <h4 className="text-gold-300 text-[13px] font-serif tracking-wide">{children}</h4>
      {right && <span className="ml-auto text-gold-500 text-[12px] font-serif tabular-nums">{right}</span>}
    </div>
  )
}

export function AtlasView() {
  const discoveredPorts = useGameStore(s => s.discoveredPorts)
  const earned = useGameStore(s => s.achievements)
  const collected = useGameStore(s => s.collectedDebris)
  const collectedRelics = useGameStore(s => s.collectedRelics)
  const collectedLegends = useGameStore(s => s.collectedLegends)
  const shipPosition = useGameStore(s => s.shipPosition)
  const stats = useGameStore(s => s.stats)
  const logbook = useGameStore(s => s.logbook)
  const setActivePanel = useGameStore(s => s.setActivePanel)
  const setCenter = useMapStore(s => s.setCenter)
  const { detail, setDetail } = useDetail()

  const gotPorts = new Set(discoveredPorts)
  const gotAchievements = new Set(earned)
  const gotDebris = new Set(collected)
  const gotRelics = new Set(collectedRelics)
  const gotLegends = new Set(collectedLegends ?? [])
  /*
   * 航路：只有选了国别的这一局才有。老存档 / 参观模式 `nation` 是 null，
   * 这一段就整块不出现 —— 缺省不显示，好过显示一个空的三格。
   */
  const nation = useGameStore(s => s.nation)
  const storyDone = useGameStore(s => s.storyDone)
  const gotStory = new Set(storyDone ?? [])
  const routesNation = nationById(nation)
  const step = storyStep(nation, storyDone ?? [])
  const storyLen = nation ? routesNation.story.length : 0
  // 航季：图鉴要如实标「此季在 / 此季不在」
  const day = useGameStore(s => s.fleet.day)
  const debrisKinds = Object.keys(DEBRIS_INFO) as DebrisKind[]

  const litCount = discoveredPorts.length + earned.length + collected.length + gotRelics.size
  const totalCount = ports.length + achievements.length + debrisKinds.length + RELICS.length

  return (
    <div className="space-y-2">
      {/* 只给一个"点亮了多少"的完成感，不做进度考核、不写任何差额计算 */}
      <div className="flex items-baseline gap-2 pb-1.5 border-b border-gold-700/30">
        <span className="text-gold-300 text-[13px] font-serif">已点亮</span>
        <span className="text-gold-100 text-[16px] font-serif tabular-nums">{litCount}</span>
        <span className="text-gold-500 text-[12px] font-serif">/ {totalCount} 格</span>
        <span className="ml-auto text-gold-500 text-[12px] font-serif">缺的格子慢慢来</span>
      </div>

      {/*
        【航路】三段是**国别故事线**（见 data/nations 的 story）：
        每一格是一个目的地港，走到那一格才点亮；点已点亮的那格，它会说出当时那句话。
        把故事线放进册子而不是飘在屏幕上，是因为它的性质与遗物、成就一样——
        "这一局我真的做过"。
      */}
      {nation && (
        <>
          <SectionTitle right={`${step}/${storyLen}`}>航路</SectionTitle>
          <div className="grid grid-cols-3 gap-1.5">
            {routesNation.story.map((c, i) => {
              const got = gotStory.has(c.id)
              const port = ports.find(p => p.id === c.portId)
              return (
                <AtlasCell
                  key={c.id}
                  label={c.name}
                  /* 格子只有三列宽（约 170px）：「第 N 段 · 港口」会被截成
                     「第 1 段 · 马…」，所以副标题只放目的地港名（4 字内一定放得下），
                     段号与来历放到点击后的详情行里 */
                  sub={port?.nameCn ?? ''}
                  found={got}
                  icon={<Flag size={13} />}
                  onClick={() => setDetail(
                    got
                      ? c.line
                      : `第 ${i + 1} 段：${c.name}（${port?.nameCn ?? '那座港'}）。开过去，靠上码头才算过。`,
                  )}
                />
              )
            })}
          </div>
        </>
      )}

      {/*
        【传说】国别故事线是"走到哪"，传说是"听说过什么"。
        这两件事在玩家脑子里是一起的（同一个国别介绍里说出来的），
        所以在册子里也挨着放。

        【为什么它不并进上面那个"已点亮 N / M 格"】那一行数的是**可收集的格子**；
        传说每国只有一条、且"没寻见"时名字也必须写出来（见 AtlasCell 的 heard），
        与"藏起名字的格子"不是一类。航路也是这样处理的（自己带 3 段的进度）。
        判据：全局那一行只数 ports/achievements/debris/relics，不数 legend。
      */}
      {nation && (
        <>
          <SectionTitle right={gotLegends.has(routesNation.legend.id) ? '已应验' : '未应验'}>传说</SectionTitle>
          <div className="grid grid-cols-1 gap-1.5">
            <AtlasCell
              label={routesNation.legend.name}
              heard
              sub={gotLegends.has(routesNation.legend.id)
                ? `传说 · ${routesNation.short}人说的那件事，你亲眼见到了`
                : '传说 · 还没到过那片海'}
              found={gotLegends.has(routesNation.legend.id)}
              icon={<Compass size={13} />}
              onClick={() => {
                const lg = routesNation.legend
                if (gotLegends.has(lg.id)) {
                  setDetail(lg.line)
                  setCenter([lg.lat, lg.lng])
                  return
                }
                /*
                 * 没应验的传说：给**真实距离**并把海图挪过去，但不关册子
                 * （与未拾到的遗物同一套回执，见下方 relic 分支）。
                 * 距离是玩家判断"这趟值不值得绕"的那个数，必须给。
                 */
                const pos = shipPosition
                const nm = pos ? Math.round(legendDistanceNm(pos[0], pos[1], lg)) : null
                setDetail(nm != null
                  ? `传说还在那片海上。离你 ${nm.toLocaleString('zh-CN')} 海里。`
                  : '传说还在那片海上——开过去，进 90 海里就能看见。')
                setCenter([lg.lat, lg.lng])
              }}
            />
          </div>
        </>
      )}

      <SectionTitle right={`${discoveredPorts.length}/${ports.length}`}>港口</SectionTitle>
      <div className="grid grid-cols-2 gap-1.5">
        {ports.map(p => (
          <AtlasCell
            key={p.id}
            label={p.nameCn}
            sub={REGION_CN[p.region] ?? ''}
            found={gotPorts.has(p.id)}
            icon={<Anchor size={13} />}
            onClick={() => {
              if (!gotPorts.has(p.id)) {
                setDetail(`${REGION_CN[p.region] ?? '那片海'}还有没靠过的岸。去了自然就点亮，不去也没关系。`)
                return
              }
              setCenter([p.latitude, p.longitude])
              setActivePanel(null)
            }}
          />
        ))}
      </div>

      <SectionTitle right={`${earned.length}/${achievements.length}`}>成就</SectionTitle>
      <div className="grid grid-cols-2 gap-1.5">
        {achievements.map(a => {
          const Icon = a.icon
          return (
            <AtlasCell
              key={a.id}
              label={a.title}
              sub="成就"
              found={gotAchievements.has(a.id)}
              icon={<Icon size={13} />}
              onClick={() => setDetail(gotAchievements.has(a.id) ? a.description : '还没发生的事，册子先空着一格。')}
            />
          )
        })}
      </div>

      <SectionTitle right={`${collected.length}/${debrisKinds.length}`}>海上拾遗</SectionTitle>
      <div className="grid grid-cols-2 gap-1.5">
        {debrisKinds.map(kind => (
          <AtlasCell
            key={kind}
            label={DEBRIS_INFO[kind].label}
            sub="漂流物"
            found={gotDebris.has(kind)}
            icon={<Package size={13} />}
            onClick={() => setDetail(gotDebris.has(kind) ? DEBRIS_INFO[kind].hint : '海面上还会漂来东西，看见捞起来就是。')}
          />
        ))}
      </div>

      {/*
        海上遗物：历史与神话在册子里的位置。
        点开写的是那件东西的来历（note），不是一段通用说明——
        没拾到的格子只说一句"还没路过那里"，不剧透、也不催促。
      */}
      <SectionTitle right={`${gotRelics.size}/${RELICS.length}`}>海上遗物</SectionTitle>
      <div className="grid grid-cols-2 gap-1.5">
        {RELICS.map(r => (
          <AtlasCell
            key={r.id}
            label={r.name}
            /*
             * 不在此季的遗物：格子里写「此季不在」。
             * 这不是提示语，是事实——海面上此刻真的没有它（换季才回来）。
             */
            sub={r.seasons && r.seasons.length > 0
              ? `${r.lore === 'history' ? '史迹' : '传说'} · ${relicInSeason(r, day) ? '此季在' : '此季不在'}`
              : (r.lore === 'history' ? '史迹' : '传说')}
            found={gotRelics.has(r.id)}
            icon={<Compass size={13} />}
            onClick={() => {
              if (!gotRelics.has(r.id)) {
                if (!relicInSeason(r, day)) {
                  // 换季才有它：说清"什么时候回来"，比一句"还没路过"诚实
                  const names = (r.seasons ?? []).map(id => ALL_SEASONS.find(x => x.id === id)?.name ?? '').join('、')
                  setDetail(`这一季的海面上没有它。${names}才会出现——那时再来这片海。`)
                  setCenter([r.lat, r.lng])
                  return
                }
                /*
                 * 没拾到的：告诉玩家它**还在原处、离你多远**，
                 * 并把海图挪过去——但**不关掉册子**，
                 * 否则这句距离提示刚写出来就跟着面板一起没了。
                 * 拾取有半径（RELIC_PICKUP_NM），所以"还差多少海里"是玩家
                 * 能不能去、值不值得去的那个数，必须给。
                 */
                const pos = shipPosition
                const nm = pos ? Math.round(relicDistanceNm(pos[0], pos[1], r)) : null
                setDetail(nm != null
                  ? `它还在原处。离你 ${nm.toLocaleString('zh-CN')} 海里。`
                  : '它还在原处等着——路过那片海的时候，认准它。')
                setCenter([r.lat, r.lng])
                return
              }
              setCenter([r.lat, r.lng])
              setActivePanel(null)
            }}
          />
        ))}
      </div>

      {/*
       * 个人纪录只陈列、不比较、不排名：这是从 4399 那套"破自己纪录"借来的钩子，
       * 纯本地、零算术、零服务器，也不制造"明天必须回来"的债务。
       */}
      <SectionTitle>个人纪录</SectionTitle>
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { k: '靠过的岸', v: `${discoveredPorts.length} 座` },
          { k: '海上的日子', v: `${stats.daysSailed} 天` },
          { k: '最大一笔买卖', v: `${stats.bestDeal} 金` },
          { k: '经历过的风浪', v: `${stats.eventsSurvived} 回` },
          // 只陈列已经写进册子的事，不设目标、不显示"还差多少"
          { k: '应验的线索', v: `${countEchoes(logbook)} 句` },
          { k: '册子攒下', v: `${logbook.length} 页` },
        ].map(r => (
          <div key={r.k} className="rounded border border-gold-700/25 px-2 py-1.5">
            <span className="block text-xs font-serif text-gold-500">{r.k}</span>
            <span className="block text-gold-200 text-[15px] font-serif tabular-nums mt-0.5">{r.v}</span>
          </div>
        ))}
      </div>

      {detail && (
        <p className="text-gold-300 text-[12px] font-serif px-2 py-1.5 rounded bg-gold-700/15">{detail}</p>
      )}
    </div>
  )
}
