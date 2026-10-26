import { ChevronRight, Coins, Droplets, Heart, Shield, Star, Users, Utensils } from 'lucide-react'
import type { EventChoice as EventChoiceType } from '@/types'
import { MINI_GAME_COPY } from '@/utils/miniGame'
import { RESOURCE_LABEL, type ChoiceSummary, type ResourceKey, type RiskGrade } from '@/utils/eventSummary'

interface EventChoiceProps {
  choice: EventChoiceType
  index: number
  summary?: ChoiceSummary
  onSelect: (index: number) => void
}

/** 芯片图标：与结算屏（EventResult）同一套 lucide 图标，避免同一资源两张脸 */
const CHIP_ICONS: Record<ResourceKey, React.ReactNode> = {
  gold: <Coins size={10} />,
  food: <Utensils size={10} />,
  water: <Droplets size={10} />,
  morale: <Heart size={10} />,
  durability: <Shield size={10} />,
  crew: <Users size={10} />,
  fame: <Star size={10} />,
}

const RISK_META: Record<RiskGrade, { label: string; className: string; hint: string }> = {
  steady: { label: '稳', className: 'text-safe-400', hint: '基本只赚不赔，或代价很小' },
  gamble: { label: '搏', className: 'text-gold-400', hint: '有真实的坏结局，但期望仍站得住' },
  risky: { label: '险', className: 'text-danger-400', hint: '期望就差、尾部太重，或可能掉人——想清楚再选' },
}

export default function EventChoice({ choice, index, summary, onSelect }: EventChoiceProps) {
  // 角标文案与小游戏面板共用一份（MINI_GAME_COPY），避免两处维护导致对不上
  const tag = choice.miniGame
    ? { icon: MINI_GAME_COPY[choice.miniGame].icon, label: MINI_GAME_COPY[choice.miniGame].tag }
    : null

  const risk = summary ? RISK_META[summary.risk] : null
  // 芯片全部上屏，不截断：|期望| ≥ CHIP_MIN_EV 的资源都是玩家的赌注，
  // 藏掉第 4、第 5 项就是藏代价。行宽不够时 flex-wrap 自然换行——
  // 「处处都在失血」的选项本来就该长得比别人高。
  const chips = summary?.chips ?? []

  return (
    <button
      onClick={() => onSelect(index)}
      className="w-full group relative overflow-hidden rounded-lg border border-gold-700/40 bg-ocean-800/50 px-4 py-3 text-left press transition-all hover:border-gold-500/60 hover:bg-ocean-700/50"
    >
      <div className="absolute inset-0 bg-gradient-to-r from-gold-700/0 via-gold-700/5 to-gold-700/0 opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-gold-200 font-serif text-sm">{choice.text}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {tag && (
            /* 要动手的选项：给出明确标记，玩家知道选了就得操作 */
            <span
              className="flex items-center gap-1 rounded-full border border-gold-600/50 bg-gold-900/40 px-2 py-0.5 text-[10px] font-serif text-gold-300"
              title="选这一项会进入一段实时操作小游戏"
            >
              <span aria-hidden="true">{tag.icon}</span>
              {tag.label}
            </span>
          )}
          <ChevronRight size={16} className="text-gold-600 group-hover:text-gold-400 transition-colors" />
        </span>
      </div>

      {/* 结构化摘要：把藏起来的代价表翻出来，压成一行可扫读的芯片。
          期望值带 ~ 前缀（是加权估算不是承诺）；小游戏选项只说明因果，不给数字。 */}
      {summary && (
        <div className="relative mt-1.5 flex items-center justify-between gap-2">
          <span
            className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5"
            title={choice.miniGame
              ? '结局概率由你的操作表现决定——玩完才知道落在哪一格'
              : '按各结局概率加权的估算值，实际结果仍看运气'}
          >
            {summary.plain ? (
              <span className="text-[10px] font-serif text-gold-600">
                {choice.miniGame ? '操作定成败 · 评分改写概率' : '影响甚微'}
              </span>
            ) : (
              chips.map(chip => (
                <span
                  key={chip.key}
                  className={`flex items-center gap-1 font-mono text-[10px] tabular-nums ${
                    chip.ev > 0 ? 'text-safe-400' : 'text-danger-400'
                  }`}
                >
                  <span className="opacity-70">{CHIP_ICONS[chip.key]}</span>
                  {RESOURCE_LABEL[chip.key]} ~{chip.ev > 0 ? '+' : ''}{chip.ev}
                </span>
              ))
            )}
          </span>
          {/* 小游戏选项不显示风险档：它的结局概率会被操作改写，
              硬挂一个「搏」再配上「期望就差、尾部太重」这种断言，
              等于凭空编造一个根本没算过的结论——左侧那句因果说明已经够了。 */}
          {risk && !choice.miniGame && (!summary.plain || summary.risk !== 'steady') && (
            <span
              className={`shrink-0 font-serif text-[10px] ${risk.className}`}
              title={risk.hint}
              data-risk={summary.risk}
            >
              [{risk.label}]
            </span>
          )}
        </div>
      )}
    </button>
  )
}
