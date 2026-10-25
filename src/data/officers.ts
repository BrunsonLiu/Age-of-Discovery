import type { OfficerId } from '@/types'

/**
 * 可招募军官：一次性招募费 + 每日工资，效果在 store 集中生效。
 * 工资在 advanceDay 结算；金币不足以支付全部工资时，按列表顺序离职。
 */
export interface OfficerDef {
  id: OfficerId
  name: string
  title: string
  icon: string
  hireCost: number
  dailyWage: number
  effect: string
}

export const OFFICERS: OfficerDef[] = [
  {
    id: 'pilot',
    name: '老领航员',
    title: '引航人',
    icon: '🧭',
    hireCost: 300,
    dailyWage: 3,
    effect: '识风辨流：舰队航行速度 +15%（跨洋航线显著省时）',
  },
  {
    id: 'quartermaster',
    name: '大副',
    title: '甲板上的铁腕',
    icon: '⚓',
    hireCost: 250,
    dailyWage: 2,
    effect: '弹压得住场面：哗变与海盗事件的士气惩罚减半',
  },
  {
    id: 'surgeon',
    name: '船医',
    title: '柠檬汁与柳叶刀',
    icon: '⚕️',
    hireCost: 280,
    dailyWage: 3,
    effect: '每日士气衰减 -2，疾病类事件概率减半',
  },
]

export const OFFICER_MAP = new Map(OFFICERS.map(o => [o.id, o]))
