import { Coins, Star, Map as MapIcon, Ship } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import ParchmentCard from '@/components/ui/ParchmentCard'
import { rivalPortrait } from '@/data/portraits'
import type { Rival } from '@/types'

const STYLE_BADGE: Record<Rival['style'], { label: string; cls: string }> = {
  aggressive: { label: '亡命徒', cls: 'text-danger-400 border-danger-700/40' },
  steady: { label: '稳健派', cls: 'text-safe-400 border-safe-700/40' },
  explorer: { label: '探险家', cls: 'text-blue-400 border-blue-700/40' },
}

/**
 * 航海见闻：竞争船长的实时状态与传闻。
 * 让玩家始终知道"别人也在海上"——财富、声望、探索都可以被追上或被甩开。
 */
export default function RivalPanel() {
  const fleet = useGameStore(s => s.fleet)
  const discoveredPorts = useGameStore(s => s.discoveredPorts)
  const rivals = useGameStore(s => s.rivals)
  const rivalNews = useGameStore(s => s.rivalNews)
  const setActivePanel = useGameStore(s => s.setActivePanel)

  const myPorts = discoveredPorts.length
  const bestRivalGold = Math.max(fleet.gold, ...rivals.map(r => r.gold))
  const bestRivalFame = Math.max(fleet.fame, ...rivals.map(r => r.fame))
  const bestRivalPorts = Math.max(myPorts, ...rivals.map(r => r.portsFound))

  return (
    <div className="w-80 animate-slide-in-right">
      <ParchmentCard title="航海见闻" subtitle="竞争船长" onClose={() => setActivePanel(null)}>
        <div className="space-y-3">
          <p className="text-gold-500 font-serif text-xs italic">
            酒馆的传闻比海风跑得快——这三个人和你抢着同一片海。
          </p>

          {/* 玩家 vs 竞争船长 */}
          <div className="space-y-2">
            {rivals.map(r => {
              const badge = STYLE_BADGE[r.style]
              const portrait = rivalPortrait(r.id)
              return (
                <div key={r.id} className="bg-ocean-800/40 border border-gold-700/20 rounded p-2.5">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    {portrait && (
                      <img
                        src={portrait}
                        alt=""
                        aria-hidden="true"
                        className="w-10 h-14 object-cover object-top rounded border border-gold-700/30 shrink-0"
                        onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
                      />
                    )}
                    <div className="flex items-center justify-between flex-1 min-w-0">
                      <span className="text-gold-200 font-serif text-sm">{r.name}</span>
                      <span className={`text-[10px] font-serif px-1.5 py-0.5 rounded border ${badge.cls}`}>
                        {r.title} · {badge.label}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div>
                      <div className="text-gold-500 text-[10px] font-serif flex items-center justify-center gap-0.5">
                        <Coins size={9} /> 金币
                      </div>
                      <div className={`text-xs font-serif ${r.gold >= fleet.gold ? 'text-gold-300' : 'text-gold-500'}`}>
                        {r.gold}
                      </div>
                    </div>
                    <div>
                      <div className="text-gold-500 text-[10px] font-serif flex items-center justify-center gap-0.5">
                        <Star size={9} /> 声望
                      </div>
                      <div className={`text-xs font-serif ${r.fame >= fleet.fame ? 'text-gold-300' : 'text-gold-500'}`}>
                        {r.fame}
                      </div>
                    </div>
                    <div>
                      <div className="text-gold-500 text-[10px] font-serif flex items-center justify-center gap-0.5">
                        <MapIcon size={9} /> 探索
                      </div>
                      <div className={`text-xs font-serif ${r.portsFound >= myPorts ? 'text-gold-300' : 'text-gold-500'}`}>
                        {r.portsFound}/20
                      </div>
                    </div>
                  </div>
                  <p className="text-gold-600 text-[10px] font-serif italic mt-1.5">
                    「{r.lastAction}」
                  </p>
                </div>
              )
            })}
          </div>

          {/* 你的座次 */}
          <div className="bg-ocean-800/30 border border-gold-700/20 rounded p-2.5">
            <div className="flex items-center gap-1 mb-1.5">
              <Ship size={11} className="text-gold-400" />
              <span className="text-gold-300 font-serif text-xs">你的座次</span>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center text-xs font-serif">
              <div>
                <div className="text-gold-500 text-[10px]">财富</div>
                <div className="text-gold-200">{fleet.gold} / {bestRivalGold}</div>
              </div>
              <div>
                <div className="text-gold-500 text-[10px]">声望</div>
                <div className="text-gold-200">{fleet.fame} / {bestRivalFame}</div>
              </div>
              <div>
                <div className="text-gold-500 text-[10px]">探索</div>
                <div className="text-gold-200">{myPorts} / {bestRivalPorts}</div>
              </div>
            </div>
            <p className="text-gold-600 text-[10px] font-serif mt-1">
              斜线后为同代最强。落后不可怕——可怕的是停下。
            </p>
          </div>

          {/* 见闻流 */}
          <div>
            <div className="text-gold-300 font-serif text-xs mb-1.5">📜 最新见闻</div>
            {rivalNews.length === 0 ? (
              <p className="text-gold-600 text-xs font-serif text-center py-3">
                还没有传闻。每隔几天，酒馆里就会有新消息。
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                {rivalNews.map(n => {
                  const rival = rivals.find(r => r.id === n.rivalId)
                  return (
                    <div key={n.id} className="bg-ocean-800/20 rounded p-2 border-l-2 border-gold-700/40">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-gold-400 text-[10px] font-serif">{rival?.name ?? '某位船长'}</span>
                        <span className="text-gold-600 text-[10px] font-serif">第 {n.day} 天</span>
                      </div>
                      <p className="text-gold-300 text-xs font-serif">{n.text}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </ParchmentCard>
    </div>
  )
}
