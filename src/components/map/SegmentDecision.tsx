import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { useDialogueStore } from '@/store/useDialogueStore'
import { onUiCommand } from '@/utils/uiBus'
import { STANCES, STANCE_ORDER, stanceLedgers, describeStanceTradeoff, type StanceId } from '@/utils/segment'
import { calculateDailyConsumption, dailyDistanceNm } from '@/utils/navigation'
import { WEATHER_INFO, weatherFavorFactor } from '@/utils/weather'
import { useRolledNumber } from '@/hooks/useRolledNumber'
import { DURATION, EASE_SPRING, prefersReducedMotion } from '@/utils/motion'
import { useFxStore as useFx } from '@/store/useFxStore'

/**
 * 航段抉择（把连续决策引入航海的核心）。
 *
 * 每段航程结束时弹出，玩家必须为**下一段**选一个航行方针。
 *
 * ## 设计原则：一行一个选择，细账按需展开
 *
 * 重构前这里是三张竖排卡片，每张列 5 行明细（航程/食物/淡水/船损/遇事）
 * 再士气一行，三张卡合计 **33 个数字**。玩家要做的事是"快 / 正常 / 稳"三选一，
 * 却得先读三张账本、横向比 15 组差值。
 *
 * 更关键的是：**三个方针在每个维度上都是同序的**——
 * 抢行永远最快、最省粮水、最伤船、最易遇事、士气 -3；
 * 谨慎永远相反。所以摊开 5 个维度并不增加信息量，只是把同一个取舍
 * （快而险 / 稳而贵）重复了五遍。
 *
 * 现在每张卡只留 **天数（唯一真正要权衡的量）** 和一行人话代价，
 * 完整账本收进下方一张表格——表格比三张竖排卡片更好横向比较，
 * 想精算的玩家点一下就有。
 *
 * 保留的设计要点：
 * 1. **选之前就能看见后果**——天数和"会断粮"直接标在卡上，不藏。
 * 2. **三选一，没有纯赚**——快的更险，稳的更贵。
 * 3. **数字滚动入场**——天数从 0 滚到目标值，眼睛跟得上变化。
 * 4. **键盘 1/2/3**——三张卡有明确序号。
 */

const TONE_STYLES: Record<'hot' | 'even' | 'calm', { border: string; glow: string; text: string }> = {
  hot: { border: 'border-danger-700/60', glow: 'shadow-[0_0_24px_-6px_rgba(220,80,60,0.55)]', text: 'text-danger-300' },
  even: { border: 'border-gold-600/50', glow: 'shadow-[0_0_24px_-8px_rgba(212,175,55,0.45)]', text: 'text-gold-300' },
  calm: { border: 'border-safe-600/50', glow: 'shadow-[0_0_24px_-8px_rgba(90,180,140,0.45)]', text: 'text-safe-300' },
}

/** 一张方针卡：天数为主，代价一行 */
function StanceCard({
  id,
  index,
  days,
  deltaDays,
  tradeoff,
  onPick,
  disabled,
  affordable,
}: {
  id: StanceId
  index: number
  days: number
  deltaDays: number
  /** 从真实账本算出的代价文案（见 utils/segment.describeStanceTradeoff） */
  tradeoff: string
  onPick: (id: StanceId) => void
  disabled: boolean
  affordable: boolean
}) {
  const s = STANCES[id]
  const tone = TONE_STYLES[s.tone]
  const rollDays = useRolledNumber(days, DURATION.grand)

  return (
    <button
      onClick={() => onPick(id)}
      disabled={disabled}
      className={`relative w-full text-left rounded-lg border ${tone.border} ${tone.glow}
        bg-ocean-800/70 backdrop-blur-sm px-3 py-2.5 press
        transition-all duration-[90ms] ease-out
        hover:bg-ocean-700/70 hover:-translate-y-0.5
        focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/70
        disabled:opacity-45 disabled:hover:translate-y-0 disabled:cursor-not-allowed`}
      style={{ animation: prefersReducedMotion() ? undefined : `fade-in-up 380ms ${EASE_SPRING} both` }}
      aria-label={`${s.name}方针，${days} 天${affordable ? '' : '，补给不足'}`}
    >
      <div className="flex items-center gap-3">
        {/* 键盘序号 */}
        <span className="w-5 h-5 rounded border border-gold-700/40 bg-ocean-900/70
          text-gold-400 font-mono text-[10px] flex items-center justify-center shrink-0">
          {index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-sm leading-none ${tone.text}`}>{s.icon}</span>
            <span className="font-serif text-sm text-gold-200">{s.name}</span>
            {!affordable && (
              <span className="font-serif text-[10px] text-danger-400">· 补给不足</span>
            )}
          </div>
          <p className="text-gold-600 font-serif text-[10px] leading-snug mt-0.5 truncate">
            {tradeoff}
          </p>
        </div>

        {/* 主数字：这一段要走几天 —— 唯一真正要权衡的量 */}
        <div className="text-right shrink-0">
          <div className="flex items-baseline justify-end gap-0.5">
            <span className="font-serif text-2xl text-gold-100 tabular-nums leading-none">
              {Math.round(rollDays)}
            </span>
            <span className="text-gold-500 font-serif text-[10px]">天</span>
          </div>
          {deltaDays !== 0 && (
            <div className={`font-mono text-[10px] tabular-nums ${deltaDays < 0 ? 'text-safe-400' : 'text-danger-400'}`}>
              {deltaDays < 0 ? '快' : '慢'} {Math.abs(deltaDays)} 天
            </div>
          )}
        </div>
      </div>
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
  /** 细账表格是否展开。默认收起——多数玩家只需要"几天"，不需要五个维度 */
  const [showLedger, setShowLedger] = useState(false)

  // 每次进入新的航段抉择时清空「已选」状态。
  //
  // 这个坑很隐蔽：组件在航段之间**不会卸载**（面板只是隐藏），
  // 于是 picked 一直留着上一段的值。第二个航段打开时，
  // 所有按钮都是 disabled —— 玩家面对一个按不动的面板，彻底死锁。
  useEffect(() => {
    if (!pending) return
    pickedRef.current = null
    setPicked(null)
    setShowLedger(false)
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
        className="my-auto w-[32rem] max-w-[94vw] rounded-lg border border-gold-700/40 bg-ocean-900/95
          shadow-2xl overflow-hidden"
        style={{ animation: prefersReducedMotion() ? undefined : `fade-in-scale 420ms ${EASE_SPRING} both` }}
      >
        {/* 标题区 */}
        <div className="px-4 py-2.5 border-b border-gold-700/30 bg-ocean-800/60">
          <div className="flex items-baseline gap-2">
            <h2 className="pirate-title text-base text-gold-200">航行方针</h2>
            <span className="text-gold-500 font-serif text-[11px] tabular-nums">
              第 {pending.index + 1} / {pending.total} 段
            </span>
          </div>
          <p className="text-gold-500 font-serif text-[11px] mt-0.5 truncate">
            <span className="text-gold-300">{pending.hazard}</span>
            {' · '}距港 {Math.round(pending.remainingNm)} 海里
            {' · '}约 {pending.daysLeft} 天
          </p>
        </div>

        <div className="p-3">
          {/* 三张方针卡：竖排（每张一行，天数在右） */}
          <div className="space-y-1.5">
            {STANCE_ORDER.map((id, i) => {
              const l = byId(id)
              if (!l) return null
              const affordable = fleet.food >= l.food && fleet.water >= l.water
              return (
                <StanceCard
                  key={id}
                  id={id}
                  index={i}
                  days={l.days}
                  deltaDays={l.delta.days}
                  tradeoff={describeStanceTradeoff(l)}
                  onPick={handlePick}
                  disabled={picked !== null}
                  affordable={affordable}
                />
              )
            })}
          </div>

          {/* 细账：一张表，比三张卡各列 5 行更好横向比较 */}
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowLedger(v => !v)}
              aria-expanded={showLedger}
              className="w-full flex items-center gap-2 px-1 py-1 text-left press"
            >
              <span className="font-serif text-[11px] text-gold-500">
                粮水 / 船损 / 遇事 / 士气 细账
              </span>
              {!showLedger && (
                <span className="font-serif text-[10px] text-gold-700 truncate flex-1">
                  抢行省粮但伤船
                </span>
              )}
              <span className="ml-auto font-serif text-[10px] text-gold-700 shrink-0">
                {showLedger ? '收起 ▴' : '▾'}
              </span>
            </button>

            {showLedger && (
              <div className="mt-1 bg-ocean-800/40 border border-gold-700/20 rounded px-2.5 py-2">
                <div className="grid grid-cols-6 gap-1 font-serif text-[10px] text-gold-600 mb-1">
                  <span />
                  <span className="text-right">食物</span>
                  <span className="text-right">淡水</span>
                  <span className="text-right">船损</span>
                  <span className="text-right">遇事</span>
                  <span className="text-right">士气</span>
                </div>
                {ledgers.map(l => (
                  <div key={l.stance.id} className="grid grid-cols-6 gap-1 font-mono text-[10px] tabular-nums text-gold-300 py-0.5">
                    <span className="font-serif text-gold-500 truncate">{l.stance.name}</span>
                    <span className="text-right">{l.food}</span>
                    <span className="text-right">{l.water}</span>
                    <span className="text-right">{l.wear}</span>
                    <span className="text-right">{l.events.toFixed(1)}</span>
                    <span className={`text-right ${l.morale > 0 ? 'text-safe-400' : l.morale < 0 ? 'text-danger-400' : 'text-gold-600'}`}>
                      {l.morale > 0 ? '+' : ''}{l.morale}
                    </span>
                  </div>
                ))}
                <p className="font-serif text-[10px] text-gold-700 mt-1.5 leading-relaxed">
                  三个方针在每个维度上都是同序的：快的永远省粮水但伤船、代价更重；稳的永远相反。
                  所以只需要决定一件事——要多快。
                </p>
                <p className="font-serif text-[10px] text-gold-700 mt-1 leading-relaxed">
                  「遇事」是次数。快慢走同一段路的总暴露时间差不多，所以次数差别不大；
                  真正的差别在<strong className="text-gold-500">单次事件的后果</strong>
                  ——抢行放大到 1.45 倍，谨慎只有 0.5 倍。
                </p>
              </div>
            )}
          </div>

          {/* 当前库存 */}
          <div className="mt-2 pt-2 border-t border-gold-700/20 flex items-center justify-between text-[11px] font-serif">
            <span className="text-gold-600">
              船上：粮 <span className="text-gold-300 tabular-nums">{fleet.food}</span>
              {' · '}水 <span className="text-gold-300 tabular-nums">{fleet.water}</span>
              {' · '}士气 <span className="text-gold-300 tabular-nums">{fleet.morale}</span>
            </span>
            <span className="text-gold-700 text-[10px]">按 1 / 2 / 3 选择</span>
          </div>
        </div>
      </div>
    </div>
  )
}
