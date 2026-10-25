import { Coins, Utensils, Droplets, Heart, Shield, Users, Scroll, Star, Globe, Compass } from 'lucide-react'
import ActionButton from '@/components/ui/ActionButton'
import Badge from '@/components/ui/Badge'
import { FACTION_MAP } from '@/data/factions'
import {
  MINI_GAME_GRADE_COLOR,
  MINI_GAME_GRADE_LABEL,
  describePerformance,
  miniGameGrade,
} from '@/utils/miniGame'
import type { EventOutcome } from '@/types'

interface EventResultProps {
  outcome: EventOutcome
  /** 本次小游戏的表现分（0..1）。有值则展示"操作如何影响结果" */
  performance?: number | null
  onContinue: () => void
}

const NOTORIETY_LABELS: Record<string, string> = {
  cruel: '冷酷',
  mercy: '仁慈',
  greed: '贪婪',
  bold: '鲁猛',
  secret: '守秘',
}

function ChangeIndicator({ value, icon, label }: { value: number; icon: React.ReactNode; label: string }) {
  if (value === 0) return null
  const isPositive = value > 0
  return (
    <div className={`flex items-center gap-1 text-xs font-serif ${isPositive ? 'text-safe-400' : 'text-danger-400'}`}>
      {icon}
      <span>{label}</span>
      <span className="font-mono">{isPositive ? '+' : ''}{value}</span>
    </div>
  )
}

export default function EventResult({ outcome, performance, onContinue }: EventResultProps) {
  const grade = performance != null ? miniGameGrade(performance) : null

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="pirate-title text-xl mb-2">结果</h3>
        <p className="text-gold-200 font-serif text-sm leading-relaxed">{outcome.description}</p>
      </div>

      {/* 操作表现：让玩家看见"我的手劲"如何改写了概率，而不是黑箱 */}
      {performance != null && grade && (
        <div className="rounded-lg border border-gold-700/25 bg-gold-900/10 px-3 py-2 space-y-1">
          <div className="flex items-center justify-between text-xs font-serif">
            <span className="text-gold-500">操作评分</span>
            <span style={{ color: MINI_GAME_GRADE_COLOR[grade] }}>
              {MINI_GAME_GRADE_LABEL[grade]} · {performance.toFixed(2)}
            </span>
          </div>
          <p className="text-[11px] font-serif text-gold-500 leading-relaxed">
            {describePerformance(performance)}
          </p>
        </div>
      )}

      <div className="bg-ocean-800/40 rounded-lg p-3 space-y-1.5">
        <h4 className="text-gold-400 font-serif text-xs mb-1">资源变化</h4>
        <ChangeIndicator value={outcome.goldChange} icon={<Coins size={12} />} label="金币" />
        <ChangeIndicator value={outcome.foodChange} icon={<Utensils size={12} />} label="食物" />
        <ChangeIndicator value={outcome.waterChange} icon={<Droplets size={12} />} label="淡水" />
        <ChangeIndicator value={outcome.moraleChange} icon={<Heart size={12} />} label="士气" />
        <ChangeIndicator value={outcome.durabilityChange} icon={<Shield size={12} />} label="耐久" />
        <ChangeIndicator value={outcome.crewChange} icon={<Users size={12} />} label="船员" />
        <ChangeIndicator value={outcome.fameChange ?? 0} icon={<Star size={12} />} label="声望" />
        {outcome.goldChange === 0 && outcome.foodChange === 0 && outcome.waterChange === 0 &&
         outcome.moraleChange === 0 && outcome.durabilityChange === 0 && outcome.crewChange === 0 && (outcome.fameChange ?? 0) === 0 && (
          <p className="text-gold-600 text-xs font-serif">无资源变化</p>
        )}
      </div>

      {outcome.historicalNote && (
        <div className="scroll-parchment rounded-lg">
          <div className="flex items-start gap-2">
            <Scroll size={14} className="text-gold-400 mt-0.5 flex-shrink-0" />
            <p className="text-gold-300 text-xs font-serif leading-relaxed">{outcome.historicalNote}</p>
          </div>
        </div>
      )}

      {/* 第二条线：派系态度变化——世界上有人记住了你的所作所为 */}
      {outcome.factionChange && Object.keys(outcome.factionChange).length > 0 && (
        <div className="bg-ocean-800/40 rounded-lg p-3 space-y-1.5">
          <h4 className="text-gold-400 font-serif text-xs mb-1 flex items-center gap-1">
            <Globe size={12} /> 四方态度
          </h4>
          {Object.entries(outcome.factionChange).map(([fid, delta]) => {
            const f = FACTION_MAP.get(fid as 'crown' | 'guild' | 'scholars' | 'brethren')
            const d = delta ?? 0
            if (d === 0 || !f) return null
            return (
              <div key={fid} className="flex items-center justify-between text-xs font-serif">
                <span className="text-gold-400 flex items-center gap-1.5">
                  <Badge kind="faction" id={fid} fallback={f.icon} size={15} />
                  {f.name}
                </span>
                <span className={`font-mono ${d > 0 ? 'text-safe-400' : 'text-danger-400'}`}>
                  {d > 0 ? '+' : ''}{d}
                </span>
              </div>
            )
          })}
          <p className="text-gold-600 text-[10px] font-serif">
            {Object.values(outcome.factionChange).some(v => (v ?? 0) > 0) && Object.values(outcome.factionChange).some(v => (v ?? 0) < 0)
              ? '有人记住了你的好处，也有人记住了你的坏处——海上没有只赚不赔的选择。'
              : Object.values(outcome.factionChange).some(v => (v ?? 0) > 0)
                ? '你的名字进了某本好账簿。'
                : '你的名字进了某本坏账簿。'}
          </p>
        </div>
      )}

      {/* 第二条线：身份取向——你正在成为哪种船长 */}
      {outcome.notoriety && Object.keys(outcome.notoriety).length > 0 && (
        <div className="bg-ocean-800/40 rounded-lg p-3 space-y-1.5">
          <h4 className="text-gold-400 font-serif text-xs mb-1 flex items-center gap-1">
            <Compass size={12} /> 海上人称
          </h4>
          {Object.entries(outcome.notoriety).map(([axis, delta]) => {
            const d = delta ?? 0
            if (d === 0) return null
            return (
              <div key={axis} className="flex items-center justify-between text-xs font-serif">
                <span className="text-gold-400">{NOTORIETY_LABELS[axis] ?? axis}</span>
                <span className="font-mono text-gold-300">+{d}</span>
              </div>
            )
          })}
          <p className="text-gold-600 text-[10px] font-serif">
            酒馆里的传闻正在成形：他们开始用一个词来形容你。
          </p>
        </div>
      )}

      {/* 第二条线：名船员个人事件的回响 */}
      {outcome.crewEvent && (
        <div className="bg-ocean-800/40 rounded-lg p-3">
          <p className="text-gold-500 text-[10px] font-serif">
            {outcome.crewEvent.dies
              ? '⚰️ 全舰默哀。'
              : outcome.crewEvent.leaves
                ? '🚪 有人收拾了行李。'
                : (outcome.crewEvent.loyaltyChange ?? 0) > 0
                  ? '⚓ 有人把这条船当成了自己的船。'
                  : '⚓ 有人在心里记下了一笔。'}
          </p>
        </div>
      )}

      <div className="text-center pt-2">
        <ActionButton onClick={onContinue} className="px-8">
          继续
        </ActionButton>
      </div>
    </div>
  )
}
