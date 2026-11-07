import { ports } from './ports'

/**
 * 航路里程碑：把"往哪走"变成一个可读的目标。
 *
 * 【为什么需要这个】
 * 原来的目标全是**数量型**的（金币 1000/5000/20000、发现 5/10/20 港、交易 N 次），
 * 它们回答"我做到了多少"，但不回答"我下一步该往哪开"。
 * 实测玩家打开面板看到的是"0/22 委托、3/16 成就"，没有一句话告诉他
 * "横渡大西洋是有意义的、值得为此准备 40 天的水和粮"。
 *
 * 于是整局的表现是：在最近的两个港口之间倒货，因为那是唯一被界面确认过的事。
 *
 * 【为什么是里程碑而不是线性章节】
 * 历史上"向西横渡"和"南下绕好望角"是两条真实航线，玩家应该能自选。
 * 线性章节会强迫"必须先加勒比后开普敦"，那是设计者的顺序，不是航海者的。
 * 五个里程碑各自独立判定、各自有奖励，先做哪个都算数。
 */

export interface VoyageMilestone {
  id: string
  /** 短名，HUD 与日志用 */
  title: string
  /** 一句话说清"为什么值得去" */
  why: string
  /**
   * 判定：只要 `discoveredPorts` 里出现这些港口中的**任意一个**即达成。
   * 用"到达过"而不是"当前停在那"，因为里程碑一旦达成不该因为离港而回退。
   */
  atPorts: number[]
  reward: { gold: number; fame: number }
}

export const voyageMilestones: VoyageMilestone[] = [
  {
    id: 'beyond_pillars',
    title: '出了海格力斯之柱',
    why: '地中海是自家后院。真正的生意在直布罗陀之外——黄金、象牙、胡椒，都从那儿往北走。',
    // 埃尔米纳（黄金海岸）/ 开普敦
    atPorts: [9, 10],
    reward: { gold: 250, fame: 8 },
  },
  {
    id: 'new_world',
    title: '看见新大陆',
    why: '向西顺信风，四十天能看到一片没人画过的海岸。哥伦布去年刚回来，他的账本还没人敢信。',
    // 加勒比七港任意一个
    atPorts: [1, 2, 3, 4, 5, 13, 14],
    reward: { gold: 600, fame: 16 },
  },
  {
    id: 'cape_of_storms',
    title: '绕过好望角',
    why: '非洲最南端。迪亚士叫它"风暴角"，葡萄牙国王改成了"好望角"——改名的那个更有商业头脑。',
    atPorts: [10],
    reward: { gold: 700, fame: 18 },
  },
  {
    id: 'indian_ocean',
    title: '进入印度洋',
    why: '过了好望角，风向就变了。这里的香料不用经过威尼斯人的手，价钱只有他们的十分之一。',
    // 果阿 / 马六甲 / 巴达维亚 / 澳门 / 蒙巴萨 / 桑给巴尔
    atPorts: [11, 12, 19, 18, 16, 17],
    reward: { gold: 900, fame: 22 },
  },
  {
    id: 'far_east',
    title: '抵达东方',
    why: '澳门与巴达维亚——地图的最东边。到这里，你就走完了一张海图能走的最远的那条线。',
    atPorts: [18, 19],
    reward: { gold: 1400, fame: 30 },
  },
]

/**
 * 当前该追哪一个里程碑。
 *
 * 规则：**按定义顺序**取第一个尚未达成的。
 * 为什么不是"最近的那个"——因为"最近"会让玩家在做完新大陆之后被指回非洲西岸，
 * 而那时候他已经在加勒比了，退回去两千里只为拿一个 250 金的里程碑，是坏建议。
 * 顺序固定，就成了一条清晰的推进线；顺序之外玩家想怎么绕都行。
 */
export function nextMilestone(discovered: readonly number[]): VoyageMilestone | null {
  const got = new Set(discovered)
  for (const m of voyageMilestones) {
    if (!m.atPorts.some(id => got.has(id))) return m
  }
  return null
}

/**
 * 给"下一步"配一个具体的目的港。
 *
 * 里程碑只说"去非洲"，玩家还得自己在一张 20 港的地图上找。
 * 这个函数在里程碑的目标港里挑**离玩家最近**的一个（还没去过的），
 * 于是提示可以写成"→ 埃尔米纳"，而不只是"往南"。
 *
 * 【这里的距离是大圆距离，只用来排序】
 * `gcDistanceNm` = haversine 大圆距离。**它不是玩家看到的航程**——
 * 船实际走的是避陆弧线（见 utils/voyage.routeFacts），塞维利亚→埃尔米纳
 * 大圆 1956 海里、实际 2917 海里，差 49%。
 * 所以这个函数只负责「挑哪一个」，显示用的里程由调用方用航线弧长覆盖。
 * 排序用大圆也够准：同一批候选港的绕行代价量级相近，不改变先后。
 *
 * @param from 玩家当前坐标（纬度、经度）
 */
export function suggestPortFor(
  milestone: VoyageMilestone,
  discovered: readonly number[],
  from: readonly [number, number] | null,
): { id: number; nameCn: string; gcDistanceNm: number } | null {
  const got = new Set(discovered)
  const pool = ports.filter(p => milestone.atPorts.includes(p.id) && !got.has(p.id))
  if (pool.length === 0) return null
  if (!from) return { id: pool[0].id, nameCn: pool[0].nameCn, gcDistanceNm: 0 }
  let best = pool[0]
  let bestD = Infinity
  for (const p of pool) {
    const d = haversineNm(from[0], from[1], p.latitude, p.longitude)
    if (d < bestD) { bestD = d; best = p }
  }
  return { id: best.id, nameCn: best.nameCn, gcDistanceNm: Math.round(bestD) }
}

/** 大圆距离（海里）。与 utils/navigation 的同名算法保持一致的口径。 */
function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065 // 地球半径（海里）
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** 本次到港新达成的里程碑（可能一次达成多个：从塞维利亚直航哈瓦那会跨两级） */
export function newlyReached(discoveredBefore: readonly number[], discoveredAfter: readonly number[]): VoyageMilestone[] {
  const before = new Set(discoveredBefore)
  const after = new Set(discoveredAfter)
  return voyageMilestones.filter(m =>
    !m.atPorts.some(id => before.has(id)) && m.atPorts.some(id => after.has(id)),
  )
}
