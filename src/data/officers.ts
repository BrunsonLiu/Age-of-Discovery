import type { OfficerId } from '@/types'
import { Anchor, Compass, Stethoscope, type LucideIcon } from 'lucide-react'

/**
 * 可招募军官：一次性招募费 + 每日工资，效果在 store 集中生效。
 * 工资在 advanceDay 结算；金币不足以支付全部工资时，按列表顺序离职。
 */
export interface OfficerDef {
  id: OfficerId
  name: string
  title: string
  icon: LucideIcon
  hireCost: number
  dailyWage: number
  effect: string
}

export const OFFICERS: OfficerDef[] = [
  {
    id: 'pilot',
    name: '老领航员',
    title: '引航人',
    icon: Compass,
    hireCost: 300,
    dailyWage: 3,
    effect: '识风辨流：舰队航行速度 +15%（跨洋航线显著省时）',
  },
  {
    id: 'quartermaster',
    name: '大副',
    title: '甲板上的铁腕',
    icon: Anchor,
    hireCost: 250,
    dailyWage: 2,
    effect: '弹压得住场面：事件里的士气打击减半',
  },
  {
    id: 'surgeon',
    name: '船医',
    title: '柠檬汁与柳叶刀',
    icon: Stethoscope,
    hireCost: 280,
    dailyWage: 3,
    // 【为什么写「断粮断水时」而不是「每日」】实测：粮水充足、士气 40 时推进一天，
    // 士气一点不掉；`advanceDay` 只在 newFood===0 || newWater===0 时扣 5 点，
    // 船医与神甫各减免 2 点（下限 1）。写「每日衰减 -2」会让玩家以为天天在生效。
    // 后半句「疾病类事件概率减半」由 utils/eventEngine 的 officers 判据兑现。
    effect: '断粮断水时少掉 2 点士气（5 → 3）；疾病类事件触发率减半',
  },
]

export const OFFICER_MAP = new Map(OFFICERS.map(o => [o.id, o]))
