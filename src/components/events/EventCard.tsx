import { useState, useEffect, useMemo } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { selectOutcome } from '@/utils/eventEngine'
import { EVENT_TYPE_BG, renderEventIcon } from '@/utils/eventTypeStyles'
import { onUiCommand } from '@/utils/uiBus'
import { UI_ASSETS } from '@/data/uiAssets'
import { GAME_BALANCE } from '@/data/gameConfig'
import { STANCES } from '@/utils/segment'
import { adjustOutcome, clampOutcomeToFleet, outcomeAdjustDelta } from '@/utils/outcomeAdjust'
import { summarizeChoice, type ChoiceSummary } from '@/utils/eventSummary'
import EventChoiceComponent from './EventChoice'
import EventResult from './EventResult'
import EventScene from './EventScene'
import MiniGameOverlay from './MiniGameOverlay'
import { useFxStore as useFx } from '@/store/useFxStore'
import type { EventOutcome, MiniGameId } from '@/types'

export default function EventCard() {
  const currentEvent = useGameStore(s => s.currentEvent)
  const fleet = useGameStore(s => s.fleet)
  const stance = useGameStore(s => s.stance)
  const officers = useGameStore(s => s.officers)
  const applyEventOutcome = useGameStore(s => s.applyEventOutcome)
  const addEventLog = useGameStore(s => s.addEventLog)
  const clearCurrentEvent = useGameStore(s => s.clearCurrentEvent)
  const gameMode = useGameStore(s => s.gameMode)

  const [outcome, setOutcome] = useState<EventOutcome | null>(null)
  const [choiceIndex, setChoiceIndex] = useState<number | null>(null)
  const [bannerFailed, setBannerFailed] = useState(false)
  /** 待玩的小游戏：选了带 miniGame 的选项后，先玩再结算 */
  const [miniGame, setMiniGame] = useState<{ id: MiniGameId; choice: number } | null>(null)
  /** 本次操作的表现分（0..1），用于结算提示 */
  const [performance, setPerformance] = useState<number | null>(null)

  // 键盘通道：1-9 选择选项，Enter/Space 继续（见 hooks/useKeyboardControls）
  // 钩子先于提前 return 注册；闭包在渲染完成后才执行，引用下方 const 安全
  useEffect(() => {
    const off = onUiCommand((cmd) => {
      if (cmd.type === 'event:choice' && !outcome && !miniGame) {
        handleSelectChoice(cmd.index)
      } else if (cmd.type === 'event:continue' && outcome) {
        handleContinue()
      }
    })
    return off
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEvent, outcome, choiceIndex, miniGame])

  // 结构化摘要：每个选项的期望值芯片 + 风险等级。
  // 走的是与 resolveOutcome **完全相同**的调整流水线（姿态/特质/大副/截断），
  // 所以芯片上的数字就是掷骰后可能落到的数字的加权平均——
  // 预览与实际分裂是这个世界最忌讳的事，这里不例外。
  const summaries: ChoiceSummary[] = useMemo(() => {
    if (!currentEvent) return []
    const ctx = {
      stanceMagnitudeMul: STANCES[stance].eventMagnitudeMul,
      trait: fleet.trait,
      hasQuartermaster: officers.includes('quartermaster'),
    }
    return currentEvent.choices.map(c => summarizeChoice(c, ctx, fleet, GAME_BALANCE.MORALE_MAX))
  }, [currentEvent, stance, fleet, officers])

  if (!currentEvent) return null

  const handleSelectChoice = (index: number) => {
    const choice = currentEvent.choices[index]
    if (!choice) return
    setChoiceIndex(index)

    // 带小游戏的选项：先上手操作，玩完再据表现分掷结果。
    // 这样"选项"不再等价于"点一下然后看天意"。
    if (choice.miniGame) {
      setMiniGame({ id: choice.miniGame, choice: index })
      return
    }
    resolveOutcome(choice.outcomes, undefined)
  }

  /** 掷出最终结果；给了performance 就按操作表现修正概率 */
  const resolveOutcome = (outcomes: EventOutcome[], perf: number | undefined) => {
    const raw = selectOutcome(outcomes, perf)

    // 「什么」由随机数决定，「有多惨」由玩家的航段姿态决定。
    // 这一步在这里做（而不是等到结算），是为了让结算屏显示的数字
    // 与实际扣掉的数字完全一致——显示与实际不符会摧毁本作的因果承诺。
    const adjusted = adjustOutcome(raw, {
      stanceMagnitudeMul: STANCES[stance].eventMagnitudeMul,
      trait: fleet.trait,
      hasQuartermaster: officers.includes('quartermaster'),
    })
    // 库存不足时按实际能扣的量显示（例如只剩 3 罐水，事件要 10 罐 → 显示 -3）
    const effective = clampOutcomeToFleet(adjusted, fleet, GAME_BALANCE.MORALE_MAX)

    setOutcome(effective)

    // 结算即兑现：把"掷骰落地"这一刻做成可感知的瞬间。
    // 用加权伤害判断好坏——耐久最贵（修理 5 金币/点），其次掉人。
    const harm = effective.durabilityChange * 5 + effective.crewChange * 10 + effective.moraleChange + effective.goldChange
    if (harm <= -30) {
      useFx.getState().fx({ kind: 'flash', tone: 'danger', text: '' }, 'impact')
    } else if (harm >= 30) {
      useFx.getState().fx({ kind: 'flash', tone: 'safe', text: '' }, 'task')
    }

    // 姿态把结果放大了多少？值得让玩家知道——这正是"选择有代价"的可见化。
    const delta = outcomeAdjustDelta(raw, effective)
    if (delta.changed && STANCES[stance].eventMagnitudeMul !== 1) {
      useFx.getState().fx({
        kind: 'banner',
        tone: STANCES[stance].tone === 'hot' ? 'danger' : 'safe',
        text: `${STANCES[stance].icon} ${STANCES[stance].name}`,
        sub: STANCES[stance].eventMagnitudeMul > 1
          ? `这一段的风险被放大到 ${STANCES[stance].eventMagnitudeMul} 倍`
          : `这一段的风险只有 ${STANCES[stance].eventMagnitudeMul} 倍`,
      }, 'sail')
    }
  }

  /** 小游戏结束：带着表现分结算 */
  const handleMiniGameFinish = (perf: number) => {
    if (!miniGame) return
    const choice = currentEvent.choices[miniGame.choice]
    setPerformance(perf)
    setMiniGame(null)
    if (choice) resolveOutcome(choice.outcomes, perf)
  }

  const handleContinue = () => {
    if (!outcome || choiceIndex === null) return
    applyEventOutcome(outcome)
    addEventLog({
      event: currentEvent,
      choiceIndex,
      outcome,
      day: fleet.day,
    })
    setOutcome(null)
    setChoiceIndex(null)
    setPerformance(null)
    clearCurrentEvent()
  }

  /**
   * 袖手旁观：什么都不做，让这件事过去。
   *
   * 只在参观模式下提供。船长模式里每个事件都必须做个决定——
   * 那正是航海的核心张力；参观模式的人只是路过看风景，
   * 凭什么非得替一条陌生的商船做道德抉择？
   *
   * 旁观**不结算任何得失**（不加不减），也不写进航海日志——
   * 你没参与，就不该有战绩。
   */
  const handleObserve = () => {
    setOutcome(null)
    setChoiceIndex(null)
    setPerformance(null)
    clearCurrentEvent()
  }

  const bgGradient = EVENT_TYPE_BG[currentEvent.type] || 'from-gold-900/30 to-slate-900/30'

  return (
    <>
      <div className="fixed inset-0 flex items-start justify-center bg-black/70 backdrop-blur-sm animate-fade-in-scale p-3 md:p-4 overflow-y-auto"
        style={{ zIndex: 80 }}
      >
        {/* my-auto：内容比视口高时从顶部开始排（flex 居中会把超出部分裁到屏幕外，
            玩家就看不到事件标题了） */}
        <div className={`my-auto w-[26rem] max-w-[92vw] bg-gradient-to-b ${bgGradient} animate-fade-in-scale overflow-hidden`}
          style={{
            animationDelay: '0.05s',
            // 金质华丽边框（F2）：border-image 九宫格切片随卡片伸缩。
            // 用治愈版切片源（ui_frame_gold_slice）——原图的船徽/贝壳在上下边条带正中，
            // 9-slice 横向拉伸时会被拉长铺进内容区盖住选项按钮，治愈版已把中央填平。
            borderWidth: '22px',
            borderStyle: 'solid',
            borderImage: `url(${UI_ASSETS.frameGoldSlice}) ${UI_ASSETS.frameGoldSliceSize} / 22px / 0 stretch`,
          }}
        >
          {/* 场景插图：事件被"看见"，而不只是被读到 */}
          <EventScene sceneKey={currentEvent.sceneKey} />

          {/* 边框中央装饰（船徽/贝壳）：从原画框切出后独立叠加，
              绝对定位在边框上，不占据内容空间，因此不会压住选项文字。
              船徽落在场景图上沿，位置略偏上以避开插图主体。 */}
          <img
            src={UI_ASSETS.frameCrest}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 select-none"
            style={{ top: '-10px', width: '48px', zIndex: 2 }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
          <img
            src={UI_ASSETS.frameShell}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 select-none"
            style={{ bottom: '-14px', width: '26px', zIndex: 2 }}
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />

          <div className="p-5 pt-3">
            <div className="flex flex-col items-center mb-3">
              <div className="mb-2 opacity-80">{renderEventIcon(currentEvent.type, 34)}</div>
              {bannerFailed ? (
                <h2 className="pirate-title text-2xl text-center">{currentEvent.title}</h2>
              ) : (
                /* 横幅缎带（F4）托标题：绸带上是深棕墨字，像通缉令/号外 */
                <div className="relative w-[19rem] max-w-full">
                  <img
                    src={UI_ASSETS.banner}
                    alt=""
                    aria-hidden="true"
                    className="w-full h-auto block drop-shadow-lg"
                    onError={() => setBannerFailed(true)}
                  />
                  <h2
                    className="pirate-title absolute inset-0 flex items-center justify-center text-center px-12 text-lg leading-tight"
                    style={{ color: '#3a2410', textShadow: '0 1px 0 rgba(255, 240, 200, 0.35)' }}
                  >
                    {currentEvent.title}
                  </h2>
                </div>
              )}
            </div>

            {!outcome ? (
              <>
                <p className="text-gold-200 font-serif text-sm leading-relaxed text-center mb-5">
                  {currentEvent.description}
                </p>
                <div className="space-y-2">
                  {currentEvent.choices.map((choice, idx) => (
                    <EventChoiceComponent
                      key={idx}
                      choice={choice}
                      index={idx}
                      summary={summaries[idx]}
                      onSelect={handleSelectChoice}
                    />
                  ))}
                  {/* 参观模式：一条"我不管"的路。站着看热闹也是参与世界的方式。 */}
                  {gameMode === 'visitor' && (
                    <button
                      onClick={handleObserve}
                      className="w-full mt-1 py-2 text-xs font-serif text-gold-500 hover:text-gold-300 border border-gold-700/25 rounded-lg press transition-all"
                    >
                      🚶 站在一边看（不参与，也不结算得失）
                    </button>
                  )}
                </div>
              </>
            ) : (
              <EventResult outcome={outcome} performance={performance} onContinue={handleContinue} />
            )}
          </div>
        </div>
      </div>

      {/* 小游戏覆盖层：选中有 miniGame 的选项后弹出，玩完才结算 */}
      {miniGame && (
        <MiniGameOverlay gameId={miniGame.id} onFinish={handleMiniGameFinish} />
      )}
    </>
  )
}
