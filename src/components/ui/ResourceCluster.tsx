import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Drumstick, Droplets, Heart } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { useRolledNumber } from '@/hooks/useRolledNumber'
import { DURATION, EASE_STANDARD } from '@/utils/motion'
import {
  LOW_MORALE,
  dailyRates,
  daysToDestination,
  formatSupplyDays,
  moraleLevel,
  supplyDaysRemaining,
  supplyLevel,
  type SupplyLevel,
} from '@/utils/voyage'
import { STANCES } from '@/utils/segment'

/**
 * 常驻资源条（粮 / 水 / 士气）。
 *
 * ## 为什么值得占这一条屏幕
 *
 * 在它之前，底栏只显示三个裸数字：`食物 68`。这个数字是**不可行动**的——
 * 玩家不知道 68 份粮意味着什么，不知道船上有多少人每天吃多少，
 * 更不知道按这个吃法还能撑几天、够不够走到下一个港口。
 * 于是「断粮」不是一次决策失误，而是一次**信息缺席导致的意外死亡**
 * （断粮当天士气开始崩，且每天 12% 概率死船员）。
 *
 * 这违反好玩四指标里的「状态可见性」：玩家必须随时能回答
 * 「我现在离出事还有多远」。
 *
 * ## 三条设计原则
 *
 * 1. **口径必须同源。** 「还能撑几天」用的消耗公式与 store.advanceDay
 *    实际扣的公式是同一个函数（utils/voyage.dailyRates）。
 *    界面说的天数 = 实际会发生的天数，否则又是数字在骗人。
 *
 * 2. **预警要说清差多少。** 不只是变红，而是直接写「差 2 天」——
 *    红色只说明「有问题」，差额才说明「该怎么办」（就地补给 / 改抢行）。
 *
 * 3. **变化要看得见。** 数值滚动 + 增减瞬间的方向闪烁。
 *    粮水每天都在扣，玩家却完全看不出在扣——这是「反馈延迟」失衡：
 *    输入（过了一天）与输出（少了粮）之间没有任何可感知的连接。
 */

type Level = SupplyLevel
/** 与 tailwind 调色板对齐：safe-400 / gold-400 / danger-400 */
const LEVEL_COLOR: Record<Level, string> = {
  ok: '#4a9e38',
  warn: '#d4a838',
  critical: '#b8432e',
}

/** 数值变动时闪烁的底色（绿=增加，红=减少） */
const FLASH_COLOR = { up: 'rgba(74,158,56,0.55)', down: 'rgba(184,67,46,0.55)' } as const

/** 统一过渡曲线与时长——单一来源在 utils/motion.ts，别处再抄一遍就会有两种手感 */
const TRANSITION = `width ${DURATION.quick}ms ${EASE_STANDARD}, background-color ${DURATION.quick}ms ${EASE_STANDARD}`

/**
 * 记录数值的增减方向，供闪烁动画使用。
 *
 * 返回 0 表示当前没有变动（或变动已展示完）。
 */
function useDelta(value: number, holdMs = 650): 1 | -1 | 0 {
  const prevRef = useRef(value)
  const [dir, setDir] = useState<1 | -1 | 0>(0)

  useEffect(() => {
    if (value === prevRef.current) return
    const next = value > prevRef.current ? 1 : -1
    prevRef.current = value
    setDir(next)
    const timer = window.setTimeout(() => setDir(0), holdMs)
    return () => window.clearTimeout(timer)
  }, [value, holdMs])

  return dir
}

interface ChipProps {
  label: string
  icon: ReactNode
  value: number
  /** 条的填充百分比 0~100 */
  barPct: number
  level: Level
  /** 每天消耗多少；null = 不按天计（士气） */
  perDay: number | null
  /** 按当前速率还能撑几天；null = 不按天计 */
  days: number | null
  /** 到目的港还需几天；0 = 不在航行 */
  needDays: number
  tip: string
  onClick?: () => void
}

function ResourceChip({
  label, icon, value, barPct, level, perDay, days, needDays, tip, onClick,
}: ChipProps) {
  const rolled = useRolledNumber(value)
  const delta = useDelta(value)
  const color = LEVEL_COLOR[level]

  // 天数文案：撑不到目的港时直接说「差 N 天」，比单纯标红更可行动
  let daysText = ''
  if (days != null && perDay != null && perDay > 0) {
    if (needDays > 0 && days < needDays) {
      daysText = `差${Math.ceil(needDays - days)}天`
    } else {
      daysText = `${formatSupplyDays(days)}天`
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={tip}
      aria-label={`${label} ${Math.round(value)}${daysText ? `，${daysText}` : ''}`}
      className="flex items-center gap-1 md:gap-1.5 rounded px-1 md:px-1.5 py-1 transition-colors hover:bg-ocean-700/60 focus:outline-none focus-visible:ring-1 focus-visible:ring-gold-500/60 min-w-[62px] md:min-w-[86px]"
    >
      {/* 图标：危急时脉冲——不需要玩家去读数字就知道出事了 */}
      <span
        className={`flex shrink-0 ${level === 'critical' ? 'animate-res-pulse' : ''}`}
        style={{ color }}
      >
        {icon}
      </span>

      {/* 数值：等宽右对齐——三个片的条才能落在同一条竖线上，
          否则 46 / 88 / 52 会左冲右突，看起来像没排过版。 */}
      <span
        className="min-w-[20px] md:min-w-[22px] text-right font-mono text-[11px] leading-none tabular-nums"
        style={{ color: level === 'critical' ? color : '#e5c35c' }}
      >
        {Math.round(rolled)}
      </span>

      {/* 迷你条：宽度即余量，颜色即水位 */}
      <span className="relative h-1 w-8 md:w-10 shrink-0 overflow-hidden rounded-full bg-ocean-900/80">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${barPct}%`, background: color, transition: TRANSITION }}
        />
        {delta !== 0 && (
          <span
            className="absolute inset-0"
            style={{ background: delta > 0 ? FLASH_COLOR.up : FLASH_COLOR.down }}
          />
        )}
      </span>

      {daysText && (
        <>
          {/* 桌面：完整的天数说明（含"还剩 N 天"） */}
          <span
            className="hidden md:inline min-w-[30px] font-serif text-[10px] leading-none tabular-nums"
            style={{ color }}
          >
            {daysText}
          </span>
          {/* 移动端：只在危急时露出"差 N 天"——底栏太窄，
              但"撑不到目的港"这句话绝不能丢。 */}
          {level === 'critical' && (
            <span
              className="md:hidden font-serif text-[10px] leading-none tabular-nums whitespace-nowrap"
              style={{ color }}
            >
              {daysText}
            </span>
          )}
        </>
      )}
    </button>
  )
}

export default function ResourceCluster() {
  const fleet = useGameStore((s) => s.fleet)
  const stance = useGameStore((s) => s.stance)
  const crewRoster = useGameStore((s) => s.crewRoster)
  const officers = useGameStore((s) => s.officers)
  const currentRoute = useGameStore((s) => s.currentRoute)
  const routeProgress = useGameStore((s) => s.routeProgress)
  const weather = useGameStore((s) => s.weather)
  const addNotification = useGameStore((s) => s.addNotification)
  const setSelectedPortId = useMapStore((s) => s.setSelectedPortId)

  const hasCook = crewRoster.some((m) => m.id === 'cook')
  const rates = dailyRates(fleet, stance, hasCook)
  const sailing = fleet.isSailing

  const needDays = currentRoute
    ? daysToDestination({
        routeDistanceNm: currentRoute.distance,
        progress: routeProgress,
        fleet,
        officers,
        windFavor: currentRoute.windFavor,
        stance,
        weather,
      })
    : 0

  const foodDays = supplyDaysRemaining(fleet.food, rates.foodPerDay)
  const waterDays = supplyDaysRemaining(fleet.water, rates.waterPerDay)

  const foodLevel: Level = supplyLevel(fleet.food, rates.foodPerDay, needDays)
  const waterLevel: Level = supplyLevel(fleet.water, rates.waterPerDay, needDays)
  const moraleLevelValue = moraleLevel(fleet.morale)

  /**
   * 点击粮/水时打开港口面板——把「发现问题」和「解决问题」压缩成一次点击。
   * 在海上则明确告知无处补给：沉默的按钮比没有按钮更糟。
   */
  const handleSupplyClick = (what: '食物' | '淡水') => {
    if (!fleet.currentPortId) {
      addNotification({
        id: `no-supply-${what}-${Date.now()}`,
        type: 'warning',
        title: `海上无处补给${what}`,
        message: `${what}只能在港口补充。出航计划的顶部会直接告诉你补给够不够走到——不够就回港补，别硬走。`,
      })
      return
    }
    setSelectedPortId(fleet.currentPortId)
  }

  const stanceName = STANCES[stance].name
  const supplyNote = sailing ? `（${stanceName} ×${STANCES[stance].supplyMul}）` : '（港内自给）'
  const cookNote = hasCook ? '，胖厨子班 ×0.8' : ''

  const foodTip = [
    `食物 ${fleet.food} 份`,
    rates.foodPerDay > 0
      ? `每天吃 ${rates.foodPerDay} 份${supplyNote}${cookNote} → 还能撑 ${formatSupplyDays(foodDays)} 天`
      : '船上没有船员，不消耗食物',
    needDays > 0
      ? foodLevel === 'critical' && foodDays < needDays
        ? `到目的港还需 ${needDays} 天 · 差 ${Math.ceil(needDays - foodDays)} 天，必须补给`
        : `到目的港还需 ${needDays} 天 · 余量充足`
      : '点击打开港口补给（+20 食物 +20 淡水，60 金币）',
  ].join('\n')

  const waterTip = [
    `淡水 ${fleet.water} 份`,
    rates.waterPerDay > 0
      ? `每天喝 ${rates.waterPerDay} 份${supplyNote} → 还能撑 ${formatSupplyDays(waterDays)} 天`
      : '船上没有船员，不消耗淡水',
    needDays > 0
      ? waterLevel === 'critical' && waterDays < needDays
        ? `到目的港还需 ${needDays} 天 · 差 ${Math.ceil(needDays - waterDays)} 天，必须补给`
        : `到目的港还需 ${needDays} 天 · 余量充足`
      : '点击打开港口补给（+20 食物 +20 淡水，60 金币）',
  ].join('\n')

  const moraleTip = [
    `士气 ${fleet.morale} / 100`,
    fleet.morale < LOW_MORALE
      ? '低于 45：忠诚度每天掉 3，且断粮断水时士气崩得更快'
      : '通过事件、港口休整、甲板盛宴与谨慎方针回升',
    '点击打开港口休整',
  ].join('\n')

  return (
    <div className="flex items-center gap-1">
      <ResourceChip
        label="食物"
        icon={<Drumstick size={11} />}
        value={fleet.food}
        barPct={Math.min(100, (fleet.food / Math.max(100, fleet.food)) * 100)}
        level={foodLevel}
        perDay={rates.foodPerDay}
        days={foodDays}
        needDays={needDays}
        tip={foodTip}
        onClick={() => handleSupplyClick('食物')}
      />
      <ResourceChip
        label="淡水"
        icon={<Droplets size={11} />}
        value={fleet.water}
        barPct={Math.min(100, (fleet.water / Math.max(100, fleet.water)) * 100)}
        level={waterLevel}
        perDay={rates.waterPerDay}
        days={waterDays}
        needDays={needDays}
        tip={waterTip}
        onClick={() => handleSupplyClick('淡水')}
      />
      <ResourceChip
        label="士气"
        icon={<Heart size={11} />}
        value={fleet.morale}
        barPct={fleet.morale}
        level={moraleLevelValue}
        perDay={null}
        days={null}
        needDays={0}
        tip={moraleTip}
        onClick={() => {
          if (fleet.currentPortId) setSelectedPortId(fleet.currentPortId)
        }}
      />
    </div>
  )
}
