import { Trophy, Lock } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { achievements } from '@/data/achievements'
import { UI_ASSETS } from '@/data/uiAssets'
import ParchmentCard from '@/components/ui/ParchmentCard'

export default function AchievementPanel() {
  const earned = useGameStore(s => s.achievements)
  const setActivePanel = useGameStore(s => s.setActivePanel)
  const stats = useGameStore(s => s.stats)

  const unlockedCount = earned.length
  const total = achievements.length

  return (
    <div className="w-full md:w-80 animate-slide-in-left">
      <ParchmentCard
        title="成就殿堂"
        onClose={() => setActivePanel(null)}
        subtitle={`${unlockedCount} / ${total}`}
      >
        {/* 桂冠勋章（F6）：殿堂的门面 */}
        <div className="flex justify-center mb-2">
          <img
            src={UI_ASSETS.medal}
            alt=""
            aria-hidden="true"
            className="h-12 w-auto object-contain drop-shadow-[0_0_12px_rgba(212,168,56,0.35)]"
          />
        </div>

        {/* 生涯统计 */}
        <div className="grid grid-cols-2 gap-1.5 mb-3">
          {[
            { label: '航行天数', value: stats.daysSailed },
            { label: '交易笔数', value: stats.trades },
            { label: '经历事件', value: stats.eventsSurvived },
            { label: '击退海盗', value: stats.pirateWins },
            { label: '最大单笔', value: `${stats.bestDeal} 金` },
            { label: '历史目击', value: stats.historySeen },
          ].map(item => (
            <div key={item.label} className="bg-ocean-800/40 rounded px-2 py-1.5 border border-gold-700/20">
              <div className="text-gold-600 text-[10px] font-serif">{item.label}</div>
              <div className="text-gold-300 text-sm font-serif font-semibold">{item.value}</div>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 max-h-[46vh] overflow-y-auto scrollbar-thin pr-1">
          {achievements.map(a => {
            const isUnlocked = earned.includes(a.id)
            return (
              <div
                key={a.id}
                className={`rounded p-2 border transition-colors ${
                  isUnlocked
                    ? 'bg-gold-700/20 border-gold-500/40'
                    : 'bg-ocean-800/25 border-gold-700/15 opacity-60'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={isUnlocked ? '' : 'grayscale opacity-50'}>{a.icon}</span>
                  <span className={`text-xs font-serif font-semibold ${isUnlocked ? 'text-gold-200' : 'text-gold-600'}`}>
                    {a.title}
                  </span>
                  {isUnlocked ? (
                    <Trophy size={11} className="ml-auto text-gold-400" />
                  ) : (
                    <Lock size={11} className="ml-auto text-gold-700" />
                  )}
                </div>
                <p className={`text-xs font-serif mt-0.5 leading-relaxed ${isUnlocked ? 'text-gold-400' : 'text-gold-700'}`}>
                  {a.description}
                </p>
              </div>
            )
          })}
        </div>
      </ParchmentCard>
    </div>
  )
}
