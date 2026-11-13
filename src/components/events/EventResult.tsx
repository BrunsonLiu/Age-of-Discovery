import { Coins, Utensils, Droplets, Heart, Shield, Users, Scroll, Star, Globe, Compass, DoorOpen, Skull } from 'lucide-react'
import ActionButton from '@/components/ui/ActionButton'
import Badge from '@/components/ui/Badge'
import { FACTION_MAP } from '@/data/factions'
import {
  MINI_GAME_GRADE_COLOR,
  MINI_GAME_GRADE_LABEL,
  describePerformance,
  miniGameGrade,
} from '@/utils/miniGame'
import { RESOURCE_LABEL, outcomeChanges, type ResourceKey } from '@/utils/eventSummary'
import type { EventOutcome } from '@/types'

interface EventResultProps {
  outcome: EventOutcome
  /** 本次小游戏的表现分（0..1）。有值则展示"操作如何影响结果" */
  performance?: number | null
  /**
   * 天赋这一次具体做了什么，例如「铁壁舰长 · 少损 4 点耐久」。
   * 由 EventCard 用**反事实**（把天赋摘掉再算一遍）得出，见 utils/outcomeAdjust。
   * null = 这个天赋在本次结算里没生效，不显示。
   */
  traitNote?: string | null
  onContinue: () => void
}

const NOTORIETY_LABELS: Record<string, string> = {
  cruel: '冷酷',
  mercy: '仁慈',
  greed: '贪婪',
  bold: '鲁猛',
  secret: '守秘',
}

/**
 * 资源图标。中文名不在这里写 —— 一律取 `RESOURCE_LABEL`（`utils/eventSummary`），
 * 与选项预览芯片用的是同一份。两处各写一遍「金币/食物/淡水」，
 * 改一个词就会在"选之前"和"选之后"出现两种叫法。
 */
const RESOURCE_ICON: Record<ResourceKey, React.ReactNode> = {
  gold: <Coins size={13} />,
  food: <Utensils size={13} />,
  water: <Droplets size={13} />,
  morale: <Heart size={13} />,
  durability: <Shield size={13} />,
  crew: <Users size={13} />,
  fame: <Star size={13} />,
}

export default function EventResult({ outcome, performance, traitNote, onContinue }: EventResultProps) {
  const grade = performance != null ? miniGameGrade(performance) : null
  const changes = outcomeChanges(outcome)

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
          <p className="text-xs font-serif text-gold-500 leading-relaxed">
            {describePerformance(performance)}
          </p>
        </div>
      )}

      <div className="inlay rounded-lg p-3 space-y-2">
        <h4 className="text-gold-400 font-serif text-xs mb-1">资源变化</h4>
        {/*
          【数字是这一屏唯一要读的东西】原来一行是 `text-xs`（12px）的等宽数字，
          标着"金币 +20"—— 全场最重要的数字用了全屏最小的字号，读起来像一张收据。
          现在数值 17px、等宽、正负分色，标签留在 12px：先看清"掉了多少"，再看是哪一项。
          【顺序按变化量从大到小】见 utils/eventSummary 的 outcomeChanges。
          试过按"份量"排（船员比金币重），结果 -1 排在 -12 上面 —— 规则玩家看不见，
          屏幕上就像排序坏了。掉人这件事由上面那句文字负责，数字这边只管大小。
        */}
        {changes.map(c => (
          <div
            key={c.key}
            data-testid="event-delta"
            data-key={c.key}
            data-value={c.value}
            className="flex items-baseline justify-between gap-2"
          >
            <span className="flex items-center gap-1.5 text-gold-400 font-serif text-[12px]">
              {RESOURCE_ICON[c.key]}
              {RESOURCE_LABEL[c.key]}
            </span>
            <span className={`font-mono text-[17px] leading-none tabular-nums ${c.value > 0 ? 'ink-good' : 'ink-bad'}`}>
              {c.value > 0 ? '+' : ''}{c.value}
            </span>
          </div>
        ))}
        {changes.length === 0 && (
          <p className="text-gold-400 text-xs font-serif">无资源变化</p>
        )}
        {/*
          天赋的痕迹：紧跟在"资源变化"下面，因为它解释的正是上面那些数字。
          用 Ink-good 而不是金色 —— 它是一条"你占了便宜"的说明，
          与损失项的红色形成对照；同时字色独立于金色主题，不会被当成标题。
        */}
        {traitNote && (
          <p className="pt-1.5 mt-1 border-t border-gold-700/25 text-[12px] font-serif ink-good">
            {traitNote}
          </p>
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
        <div className="inlay rounded-lg p-3 space-y-1.5">
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
                <span className={`font-mono ${d > 0 ? 'ink-good' : 'ink-bad'}`}>
                  {d > 0 ? '+' : ''}{d}
                </span>
              </div>
            )
          })}
          <p className="text-gold-400 text-xs font-serif">
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
        <div className="inlay rounded-lg p-3 space-y-1.5">
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
          <p className="text-gold-400 text-xs font-serif">
            酒馆里的传闻正在成形：他们开始用一个词来形容你。
          </p>
        </div>
      )}

      {/* 第二条线：名船员个人事件的回响 */}
      {outcome.crewEvent && (
        <div className="inlay rounded-lg p-3">
          <p className="flex items-center gap-1.5 text-gold-500 text-xs font-serif">
            {outcome.crewEvent.dies ? (
              <><Skull size={11} className="shrink-0 text-danger-400" aria-hidden="true" />全舰默哀。</>
            ) : outcome.crewEvent.leaves ? (
              <><DoorOpen size={11} className="shrink-0" aria-hidden="true" />有人收拾了行李。</>
            ) : (outcome.crewEvent.loyaltyChange ?? 0) > 0 ? (
              '有人把这条船当成了自己的船。'
            ) : (
              '有人在心里记下了一笔。'
            )}
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
