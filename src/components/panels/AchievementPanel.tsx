import { Trophy, Lock } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import ScrollFade from '@/components/ui/ScrollFade'
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
            <div key={item.label} className="inlay rounded px-2 py-1.5 border border-gold-700/20">
              <div className="text-gold-400 text-xs font-serif">{item.label}</div>
              <div className="text-gold-200 text-[15px] font-serif tabular-nums">{item.value}</div>
            </div>
          ))}
        </div>

        <ScrollFade className="space-y-1.5 max-h-[46vh] overflow-y-auto scroll-parchment pr-1">
          {achievements.map(a => {
            const isUnlocked = earned.includes(a.id)
            return (
              /*
               * 【已解锁 / 未解锁不能只靠"深浅"】
               * 原来未解锁是 `inlay--flat + opacity-60`：opacity 把**边框和背景**
               * 一起压透明，露出面板底色 —— 结果是"更暗的一块"，而不是"没点亮"。
               * 两块并排看都是深褐，玩家得逐条读描述才知道哪些拿到了。
               *
               * 现在用三个信号叠：
               *   · 左缘一道金竖条（两端渐隐）—— 已获得才"盖了章"；
               *   · 背景暖一档（gold-700/30 vs 挖空的槽）；
               *   · 右侧 Trophy 带光晕。
               * 未解锁那边保持凹槽 + 锁，一个亮元素都不留。
               */
              <div
                key={a.id}
                className={`relative rounded p-2 pl-2.5 border overflow-hidden transition-colors ${
                  isUnlocked
                    ? 'bg-gold-700/30 border-gold-400/55'
                    : 'inlay--flat border-gold-700/15'
                }`}
              >
                {isUnlocked && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-0 bottom-0 w-[3px]"
                    style={{
                      background:
                        'linear-gradient(180deg, rgba(240,216,138,0) 0%, rgba(240,216,138,0.95) 26%, rgba(240,216,138,0.95) 74%, rgba(240,216,138,0) 100%)',
                    }}
                  />
                )}
                <div className="flex items-center gap-1.5">
                  {/* 图标是 lucide 组件（原先存 emoji，靠 grayscale 压掉彩色）；
                      单色描边图标用颜色区分解锁状态，比滤镜更可控 */}
                  <a.icon
                    size={13}
                    strokeWidth={1.7}
                    className={`shrink-0 ${isUnlocked ? 'text-gold-300' : 'text-gold-500'}`}
                    aria-hidden="true"
                  />
                  <span className={`text-[13px] font-serif ${isUnlocked ? 'text-gold-100' : 'text-gold-400'}`}>
                    {a.title}
                  </span>
                  {isUnlocked ? (
                    <Trophy
                      size={11}
                      className="ml-auto text-gold-300"
                      style={{ filter: 'drop-shadow(0 0 4px rgba(229,195,92,0.55))' }}
                    />
                  ) : (
                    <Lock size={11} className="ml-auto text-gold-500" />
                  )}
                </div>
                <p className={`text-[13px] font-serif mt-0.5 leading-relaxed ${isUnlocked ? 'text-gold-400' : 'text-gold-500'}`}>
                  {a.description}
                </p>
              </div>
            )
          })}
        </ScrollFade>
      </ParchmentCard>
    </div>
  )
}
