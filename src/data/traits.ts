import type { Fleet, FactionId, OfficerId, CrewCharId } from '@/types'
import { GAME_BALANCE } from '@/data/gameConfig'
import { currentTitle, type CaptainTitle } from '@/data/titles'

/**
 * 船长特质：开局三选一（实际五选一），为不同玩家提供差异化玩法。
 *
 * 设计原则：
 * - 每个特质改变一类核心决策的权重，而不是单纯加数值
 * - 效果全部集中在两处生效：价格计算（merchant）与事件结算（bulwark/leader/surgeon）
 *   /事件触发（explorer），保证可解释、可测试
 */
export interface Trait {
  id: string
  name: string
  /** 称号/风格描述 */
  title: string
  desc: string
  /** 给玩家看的效果说明 */
  effect: string
  /** 特质图标（emoji） */
  icon: string
}

export const traits: Trait[] = [
  {
    id: 'merchant',
    name: '商界血脉',
    title: '银行家的私生子',
    desc: '你从小在交易所的钟声里长大，看得懂价目表背后的人心。金币在你手里似乎总比在别人手里经用。',
    effect: '所有港口买卖价格优惠 5%',
    icon: '💰',
  },
  {
    id: 'bulwark',
    name: '铁壁舰长',
    title: '风浪炼出来的硬骨头',
    desc: '船匠们说你的船"格外经撞"。其实你只是比别人更清楚哪一块船板能多挨一炮。',
    effect: '事件中船只耐久损失降低 15%',
    icon: '🛡️',
  },
  {
    id: 'leader',
    name: '魅力领袖',
    title: '甲板上的太阳',
    desc: '你记得每个水手的名字和家乡。叛乱前夕，总有人愿意为你再撑一个航次。',
    effect: '事件中士气增益提升 25%',
    icon: '✨',
  },
  {
    id: 'explorer',
    name: '天生探险家',
    title: '罗盘指向未知',
    desc: '别人的航海图止于已知海岸，你的好奇心止于——不，你的好奇心没有止境。',
    effect: '发现类事件触发率提升 30%',
    icon: '🧭',
  },
  {
    id: 'surgeon',
    name: '随船医生',
    title: '柳叶刀与柑橘',
    desc: '你在医学院读过三年，登船时带了一箱柠檬和一本翻烂的《航海医学》。',
    effect: '事件中船员损失降低 25%',
    icon: '⚕️',
  },
]

export const DEFAULT_TRAIT = 'merchant'

export function getTrait(id: string | null | undefined): Trait | undefined {
  return traits.find(t => t.id === id)
}

/** 声望/特质/名船员/派系/称号合成的价格系数：<1 = 买方优惠 / 卖方加价 */
export function priceMultiplier(
  fleet: Pick<Fleet, 'fame' | 'trait'> | undefined,
  opts?: {
    officers?: OfficerId[]
    crewRoster?: CrewCharId[]
    factionRep?: Partial<Record<FactionId, number>>
    title?: CaptainTitle | null
  },
): number {
  const fame = fleet?.fame ?? 0
  let m = 1
  if (fame >= 100) m -= 0.10
  else if (fame >= 40) m -= 0.05
  if (fleet?.trait === 'merchant') m -= 0.05
  // 名船员：账房先生精于算计
  if (opts?.crewRoster?.includes('purser')) m -= 0.02
  // 派系：商会的朋友享大宗优惠
  if ((opts?.factionRep?.guild ?? 0) >= 60) m -= 0.03
  else if ((opts?.factionRep?.guild ?? 0) >= 30) m -= 0.01
  // 王室授勋
  if ((opts?.factionRep?.crown ?? 0) >= 90) m -= 0.03
  // 称号：贪婪者更会榨取每一枚铜板
  if (opts?.title?.id === 'hoarder') m -= GAME_BALANCE.GREED_PROFIT_BONUS
  return Math.max(0.5, m)
}

/** 身份称号：由恶名取向推导（传入完整 notoriety 记录） */
export function titleFromNotoriety(notoriety: Record<string, number> | undefined): CaptainTitle | null {
  return currentTitle(notoriety as Parameters<typeof currentTitle>[0])
}

/** 事件结算时按特质修正结果数值（返回新对象，不改原值） */
export interface RawOutcome {
  goldChange: number
  foodChange: number
  waterChange: number
  moraleChange: number
  durabilityChange: number
  crewChange: number
}

export function applyTraitToOutcome<T extends RawOutcome>(outcome: T, trait: string | null | undefined): T {
  const next = { ...outcome }
  if (trait === 'bulwark' && next.durabilityChange < 0) {
    next.durabilityChange = Math.round(next.durabilityChange * 0.85)
  }
  if (trait === 'leader' && next.moraleChange > 0) {
    next.moraleChange = Math.round(next.moraleChange * 1.25)
  }
  if (trait === 'surgeon' && next.crewChange < 0) {
    next.crewChange = Math.round(next.crewChange * 0.75)
  }
  return next
}
