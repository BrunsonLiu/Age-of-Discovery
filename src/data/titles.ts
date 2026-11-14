import type { NotorietyAxis } from '@/types'

export interface CaptainTitle {
  id: string
  name: string
  /** 主导取向轴 */
  axis: NotorietyAxis
  /** 该轴累积达到此值即授予称号 */
  threshold: number
  /** 称号效果（简述） */
  effect: string
  /** 结局时的"海上人怎么说" */
  epithet: string
}

/**
 * 海上人称谓：玩家的每一个两难选择都在累积"你是哪种船长"。
 * 称号不是属性加成，而是"后世怎么记载你"——效果刻意小而叙事优先。
 *
 * ⚠️ 【2026-11-14 逐条对过代码】`effect` 这个字段会显示在**舰队面板**上
 * （`{captainTitle.name} · {captainTitle.effect}`），所以它不能写没做的事。
 * 实际情况：
 *   · hoarder（贪婪者）的「贸易毛利 +4%」是真的 —— data/traits.ts 的 priceMultiplier
 *     里读 GAME_BALANCE.GREED_PROFIT_BONUS；
 *   · 其余四条原本写着"好结局概率 +4%""走私不掉王室声望""情报永远半价"
 *     "坏血病概率下降"，对应常量 BOLD_LUCK_BONUS / GREED_FAME_PENALTY 定义了没人读，
 *     另外两条连常量都没有 —— 全是空承诺。
 * 现在把它们改回**叙事**（称号本来就该是"后世怎么记你"），只留一条真加成。
 * 将来真要做数值，先实现、再改文案，别反过来。
 */
export const TITLES: CaptainTitle[] = [
  {
    id: 'ironhand',
    name: '铁腕者',
    axis: 'cruel',
    threshold: 3,
    effect: '水手们在甲板上说话，会先看你一眼',
    epithet: '酒馆里人们压低声音说：别惹那条船上的船长，他连自己人也不放过。',
  },
  {
    id: 'mercyful',
    name: '慈悲心',
    axis: 'mercy',
    threshold: 3,
    effect: '病号会先想到你舱里那箱柠檬',
    epithet: '每个受过他接济的水手都会在胸前画十字：那是会为你掉头回来的船长。',
  },
  {
    id: 'gambler',
    name: '海上赌徒',
    axis: 'bold',
    threshold: 3,
    effect: '每次升帆，都有人等着看你押哪一边',
    epithet: '他的一生是一连串"再张一张帆"——最后一张帆恰好赶上了顺风。',
  },
  {
    id: 'keeper',
    name: '守秘人',
    axis: 'secret',
    threshold: 3,
    effect: '有些航线，只有你知道它存在',
    epithet: '没人见过他的航海日志第二页。人们只记得他总能带回"说不清的货"。',
  },
  {
    id: 'hoarder',
    name: '贪婪者',
    axis: 'greed',
    threshold: 3,
    effect: '贸易毛利 +4%（唯一实装的称号加成）',
    epithet: '他死于满舱的金币中间，账本上最后一页写着：还可以再多一点。',
  },
]

export const TITLE_MAP = new Map(TITLES.map(t => [t.id, t]))

/** 当前称号：取累积值最高且过阈值的轴；并列时取先达成者 */
export function currentTitle(notoriety: Record<NotorietyAxis, number>): CaptainTitle | null {
  let best: CaptainTitle | null = null
  let bestVal = 0
  for (const t of TITLES) {
    const v = notoriety[t.axis] ?? 0
    if (v >= t.threshold && v > bestVal) {
      best = t
      bestVal = v
    }
  }
  return best
}

/** 主导取向（用于 UI 显示"你正在成为……"） */
export function dominantAxis(notoriety: Record<NotorietyAxis, number>): { axis: NotorietyAxis; value: number } | null {
  let axis: NotorietyAxis | null = null
  let val = 0
  for (const [k, v] of Object.entries(notoriety)) {
    if (v > val) {
      axis = k as NotorietyAxis
      val = v
    }
  }
  return axis ? { axis, value: val } : null
}
