import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { useDialogueStore } from '@/store/useDialogueStore'
import { onUiCommand } from '@/utils/uiBus'
import { STANCES, STANCE_ORDER, stanceLedgers, type StanceId } from '@/utils/segment'
import { calculateDailyConsumption, dailyDistanceNm } from '@/utils/navigation'
import { WEATHER_INFO, weatherFavorFactor } from '@/utils/weather'
import { useRolledNumber } from '@/hooks/useRolledNumber'
import { DURATION, EASE_SPRING, prefersReducedMotion } from '@/utils/motion'
import { useFxStore as useFx } from '@/store/useFxStore'

/**
 * 航段抉择（把连续决策引入航海的核心）。
 *
 * 每段航程结束时弹出，玩家必须为**下一段**选一个航行方针。
 * 三张卡并排放，每个数字都直接可比：
 *
 *     方针          天数      粮水      磨损     遇事     士气
 *     抢行         3 天    省 11 份   多 1.6   多 0.5   -3
 *     按部就班      5 天     基准      基准     基准      0
 *     谨慎         8 天    多 22 份   少 2.0   少 0.7   +3
 *
 * 设计要点：
 * 1. **选之前就能看见全部后果**——不藏任何乘数，不让玩家心算。
 * 2. **三选一，没有纯赚**——快的更险，稳的更贵，这正是取舍。
 * 3. **数字滚动入场**——数字从 0 滚到目标值（easeOutQuint），
 *    眼睛跟得上变化，而不是"啪"地跳过去。
 * 4. **键盘 1/2/3**——三张卡有明确的序号提示，不用鼠标也能选。
 */

const TONE_STYLES: Record<'hot' | 'even' | 'calm', { border: string; glow: string; text: string }> = {
  hot: { border: 'border-danger-700/60', glow: 'shadow-[0_0_24px_-6px_rgba(220,80,60,0.55)]', text: 'text-danger-300' },
  even: { border: 'border-gold-600/50', glow: 'shadow-[0_0_24px_-8px_rgba(212,175,55,0.45)]', text: 'text-gold-300' },
  calm: { border: 'border-safe-600/50', glow: 'shadow-[0_0_24px_-8px_rgba(90,180,140,0.45)]', text: 'text-safe-300' },
}

/** 差异标签：正数=更多/更坏，负数=更少/更好 */
function DeltaTag({ value, unit, goodWhenNegative }: { value: number; unit: string; goodWhenNegative?: boolean }) {
  if (value === 0) {
    return <span className="font-mono text-[10px] text-gold-700">±0</span>
  }
  const good = goodWhenNegative ? value < 0 : value > 0
  return (
    <span className={`font-mono text-[10px] tabular-nums ${good ? 'text-safe-400' : 'text-danger-400'}`}>
      {value > 0 ? '+' : ''}{value}{unit}
    </span>
  )
}

/** 一张方针卡 */
function StanceCard({
  id,
  index,
  days,
  food,
  water,
  wear,
  events,
  morale,
  delta,
  onPick,
  disabled,
  affordable,
}: {
  id: StanceId
  index: number
  days: number
  food: number
  water: number
  wear: number
  events: number
  morale: number
  delta: { days: number; food: number; water: number; wear: number; events: number }
  onPick: (id: StanceId) => void
  disabled: boolean
  affordable: boolean
}) {
  const s = STANCES[id]
  const tone = TONE_STYLES[s.tone]

  // 数字滚动：从 0 滚到目标值
  const rollDays = useRolledNumber(days, DURATION.grand)
  const rollFood = useRolledNumber(food, DURATION.grand)
  const rollWater = useRolledNumber(water, DURATION.grand)
  const rollWear = useRolledNumber(wear, DURATION.grand)
  const rollEvents = useRolledNumber(events, DURATION.grand)

  const rows: { label: string; value: string; delta: React.ReactNode }[] = [
    {
      label: '航程',
      value: `${Math.round(rollDays)} 天`,
      delta: <DeltaTag value={delta.days} unit=" 天" goodWhenNegative />,
    },
    {
      label: '食物',
      value: `${Math.round(rollFood)} 份`,
      delta: <DeltaTag value={delta.food} unit=" 份" goodWhenNegative />,
    },
    {
      label: '淡水',
      value: `${Math.round(rollWater)} 份`,
      delta: <DeltaTag value={delta.water} unit=" 份" goodWhenNegative />,
    },
    {
      label: '船损',
      value: `${Math.round(rollWear)} 点`,
      delta: <DeltaTag value={delta.wear} unit=" 点" goodWhenNegative />,
    },
    {
      label: '遇事',
      value: `${rollEvents.toFixed(1)} 次`,
      delta: <DeltaTag value={delta.events} unit=" 次" goodWhenNegative />,
    },
  ]

  return (
    <button
      onClick={() => onPick(id)}
      disabled={disabled}
      className={`relative w-full md:flex-1 md:w-auto min-w-0 text-left rounded-lg border ${tone.border} ${tone.glow}
        bg-ocean-800/70 backdrop-blur-sm px-3 py-3 press
        transition-all duration-[90ms] ease-out
        hover:bg-ocean-700/70 hover:-translate-y-0.5
        focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/70
        disabled:opacity-45 disabled:hover:translate-y-0 disabled:cursor-not-allowed`}
      style={{ animation: prefersReducedMotion() ? undefined : `fade-in-up 380ms ${EASE_SPRING} both` }}
      aria-label={`${s.name}方针，${days} 天，食物 ${food} 份，淡水 ${water} 份，船损 ${wear} 点，遇事 ${events} 次`}
    >
      {/* 键盘序号 */}
      <span className="absolute top-1.5 right-2 w-5 h-5 rounded border border-gold-700/40 bg-ocean-900/70
        text-gold-400 font-mono text-[10px] flex items-center justify-center">
        {index + 1}
      </span>

      <div className="flex items-center gap-2 mb-1">
        <span className={`text-base leading-none ${tone.text}`}>{s.icon}</span>
        <span className="font-serif text-sm text-gold-200">{s.name}</span>
      </div>
      <p className="text-gold-600 font-serif text-[10px] leading-snug mb-2 h-7">{s.hint}</p>

      {/* 主数字：这一段要走几天 */}
      <div className="flex items-baseline gap-1.5 mb-2 pb-2 border-b border-gold-700/20">
        <span className="font-serif text-2xl text-gold-100 tabular-nums leading-none">
          {Math.round(rollDays)}
        </span>
        <span className="text-gold-500 font-serif text-[10px]">天</span>
        <span className="ml-auto">
          <DeltaTag value={delta.days} unit=" 天" goodWhenNegative />
        </span>
      </div>

      {/* 明细账 */}
      <div className="space-y-0.5">
        {rows.slice(1).map(r => (
          <div key={r.label} className="flex items-baseline justify-between text-[11px]">
            <span className="text-gold-600 font-serif">{r.label}</span>
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono text-gold-200 tabular-nums">{r.value}</span>
              {r.delta}
            </span>
          </div>
        ))}
      </div>

      {/* 士气变化 */}
      <div className="flex items-center justify-between text-[11px] mt-1.5 pt-1.5 border-t border-gold-700/20">
        <span className="text-gold-600 font-serif">士气</span>
        <span className={`font-mono tabular-nums ${morale > 0 ? 'text-safe-400' : morale < 0 ? 'text-danger-400' : 'text-gold-700'}`}>
          {morale > 0 ? '+' : ''}{morale}
        </span>
      </div>

      {/* 补给不足警告 */}
      {!affordable && (
        <div className="mt-1.5 text-[10px] font-serif text-danger-400 text-center">
          补给不足，可能断粮断水
        </div>
      )}
    </button>
  )
}

export default function SegmentDecision() {
  const gamePhase = useGameStore((s) => s.gamePhase)
  const pending = useGameStore((s) => s.pendingSegment)
  const chooseStance = useGameStore((s) => s.chooseStance)
  const fleet = useGameStore((s) => s.fleet)
  const officers = useGameStore((s) => s.officers)
  const weather = useGameStore((s) => s.weather)
  const currentRoute = useGameStore((s) => s.currentRoute)
  const crewRoster = useGameStore((s) => s.crewRoster)
  const fx = useFx((s) => s.fx)

  const [picked, setPicked] = useState<StanceId | null>(null)
  const pickedRef = useRef<StanceId | null>(null)

  // 每次进入新的航段抉择时清空「已选」状态。
  //
  // 这个坑很隐蔽：组件在航段之间**不会卸载**（面板只是隐藏），
  // 于是 picked 一直留着上一段的值。第二个航段打开时，
  // 所有按钮都是 disabled —— 玩家面对一个按不动的面板，彻底死锁。
  useEffect(() => {
    if (!pending) return
    pickedRef.current = null
    setPicked(null)
  }, [pending])

  // 抉择面板是**阻塞**决策：若此刻有致辞在播（出航后开场致辞正好开始播），
  // 立绘与对话框会压在面板下面，玩家看着半遮半掩的界面做决定。
  // 这里主动把致辞收掉——抉择优先，叙事可以之后再补。
  useEffect(() => {
    if (gamePhase === 'segment') {
      const dlg = useDialogueStore.getState()
      if (dlg.scriptId) dlg.skip()
    }
  }, [gamePhase])

  const handlePick = useCallback((id: StanceId) => {
    // 用 ref 判重：picked 是 state，若 handlePick 依赖它，
    // uiBus 的订阅回调就得跟着重建，容易漏掉一次按键。
    if (pickedRef.current) return
    pickedRef.current = id
    setPicked(id)
    const s = STANCES[id]
    // 兑现层的横幅：让"我选了什么"立刻有回声
    fx({
      kind: 'banner',
      tone: s.tone === 'hot' ? 'danger' : s.tone === 'calm' ? 'safe' : 'gold',
      text: `${s.icon} ${s.name}`,
      sub: s.hint,
    }, 'sail')
    // 延迟一帧再切换阶段：让横幅先出现，抉择面板再退场
    setTimeout(() => chooseStance(id), 120)
  }, [chooseStance, fx])

  // 键盘通道：1/2/3 选方针（见 hooks/useKeyboardControls 的 'segment' 优先级分支）
  useEffect(() => {
    const off = onUiCommand((cmd) => {
      if (cmd.type === 'segment:choose') {
        const idx = STANCE_ORDER.indexOf(cmd.stance)
        if (idx >= 0) handlePick(cmd.stance)
      }
    })
    return off
  }, [handlePick])

  // 本段总账：三个方针各走完这一段要付出什么
  const ledgers = useMemo(() => {
    if (!pending) return []
    const consumption = calculateDailyConsumption(fleet)
    const cookRelief = crewRoster.some(m => m.id === 'cook') ? 0.8 : 1
    const weatherMul = WEATHER_INFO[weather.kind].sailMul * weatherFavorFactor(weather.kind)
    const baseNmPerDay = dailyDistanceNm(fleet, officers, currentRoute?.windFavor ?? 1, 1, weatherMul)
    const dailyEventProb = 0.25 * WEATHER_INFO[weather.kind].eventBias
    return stanceLedgers({
      distanceNm: pending.segmentNm,
      baseNmPerDay,
      dailyFood: consumption.food,
      dailyWater: consumption.water,
      cookRelief,
      dailyEventProb,
      durabilityCarry: fleet.durabilityCarry,
    })
  }, [pending, fleet, officers, weather, currentRoute, crewRoster])

  if (gamePhase !== 'segment' || !pending) return null

  const byId = (id: StanceId) => ledgers.find(l => l.stance.id === id)

  return (
    <div
      className="fixed inset-0 flex items-start justify-center bg-black/60 backdrop-blur-[2px] px-3 md:px-4 py-3 md:py-4 overflow-y-auto"
      style={{ zIndex: 85 }}
    >
      <div
        className="my-auto w-[46rem] max-w-[94vw] rounded-lg border border-gold-700/40 bg-ocean-900/95
          shadow-2xl overflow-hidden"
        style={{ animation: prefersReducedMotion() ? undefined : `fade-in-scale 420ms ${EASE_SPRING} both` }}
      >
        {/* 标题区 */}
        <div className="px-5 py-3 border-b border-gold-700/30 bg-ocean-800/60 flex items-center gap-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <h2 className="pirate-title text-base text-gold-200">航行方针</h2>
              <span className="text-gold-500 font-serif text-[11px] tabular-nums">
                第 {pending.index + 1} / {pending.total} 段
              </span>
            </div>
            <p className="text-gold-500 font-serif text-[11px] mt-0.5">
              下一段 · <span className="text-gold-300">{pending.hazard}</span>
              {' · '}距港 {Math.round(pending.remainingNm)} 海里
              {' · '}约 {pending.daysLeft} 天
            </p>
          </div>
          <div className="ml-auto text-right shrink-0 hidden md:block">
            <p className="text-gold-600 font-serif text-[10px] leading-tight">
              选之前，账都摊在你面前
            </p>
            <p className="text-gold-700 font-serif text-[10px] leading-tight">
              数字按「按部就班」为基准
            </p>
          </div>
        </div>

        <div className="p-4">
        {/* 三张方针卡：
            桌面并排（每张卡的账要能横向比较）；
            移动端竖排——三张 320px 宽的卡并排在 360px 屏上，
            每张只剩 110px，"食物 32 份"这种数字全被挤成两行，
            玩家根本没法比较。竖排后每张卡都是整行宽，账照样看得清。 */}
          <div className="flex flex-col md:flex-row gap-2 md:gap-3">
            {STANCE_ORDER.map((id, i) => {
              const l = byId(id)
              if (!l) return null
              const affordable =
                fleet.food >= l.food && fleet.water >= l.water
              return (
                <StanceCard
                  key={id}
                  id={id}
                  index={i}
                  days={l.days}
                  food={l.food}
                  water={l.water}
                  wear={l.wear}
                  events={l.events}
                  morale={l.morale}
                  delta={l.delta}
                  onPick={handlePick}
                  disabled={picked !== null}
                  affordable={affordable}
                />
              )
            })}
          </div>

          {/* 当前库存 */}
          <div className="mt-3 pt-2.5 border-t border-gold-700/20 flex items-center justify-between text-[11px] font-serif">
            <span className="text-gold-600">
              船上现有：粮 <span className="text-gold-300 tabular-nums">{fleet.food}</span>
              {' · '}水 <span className="text-gold-300 tabular-nums">{fleet.water}</span>
              {' · '}士气 <span className="text-gold-300 tabular-nums">{fleet.morale}</span>
            </span>
            <span className="text-gold-700 text-[10px]">按 1 / 2 / 3 选择方针</span>
          </div>
        </div>
      </div>
    </div>
  )
}
