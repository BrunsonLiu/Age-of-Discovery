/**
 * 航季与季风：让「季节」变成一个能改变航行、也能被看见的东西。
 *
 * 【为什么不是日历意义上的四季】
 * 时间轴把 1492–1650 这 158 年压进 150 个游戏日（见 TimelineBar：
 * year = 1492 + (day-1)·158/150），**一个游戏日约等于一年**。
 * 在这种压缩下，"3 月 / 7 月"没有任何意义——今天三月、明天就是明年三月。
 *
 * 所以这里做的是**航季**：一个 30 日一轮的周期，四轮一循环（120 日）。
 * 它不假装自己是日历，它就是"这段时间海上是什么风向、什么颜色"。
 * 这正是大航海时代真正管用的东西：船队等的是季风，不是月份牌。
 *
 * 【为什么季风值得单列】
 * 印度洋的季风是真实的地理硬约束，而且**半年反向**：
 *   - 西南季风（约 5–9 月）：风从西南吹向东北，从非洲/阿拉伯往印度顺风；
 *   - 东北季风（约 11–3 月）：反过来，从印度往非洲顺风。
 * 达·伽马 1498 年能到印度、葡萄牙人后来能维持果阿—里斯本航线，
 * 靠的就是卡在这两个窗口上。谁错过窗口，就在海上多漂几个月。
 *
 * 之前本作的印度洋用的是**和别处一样的信风**（`prevailingWindBearing`
 * 只有"低纬 90 / 中纬 270"两档），也就是一年到头同一个方向——
 * 那条真实存在了几百年的约束，在游戏里根本不存在。
 */

/**
 * 一个航季多少天。
 *
 * 30 天：一次中等航程约 15~20 天，于是**每趟差不多都能感到"这一季"**，
 * 又不会一转身就换季。四个航季 120 天，一局 150 天里会走完一轮多。
 */
export const SEASON_DAYS = 30

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter'

export interface SeasonInfo {
  id: SeasonId
  /** 显示用：春 / 夏 / 秋 / 冬 */
  name: string
  /** 0..3 */
  index: number
  /**
   * 海面色乘数。1 = 不动，>1 提亮该通道。
   *
   * 【为什么是乘数不是色值】3D 的海面颜色走 `setSeaColor` 唯一入口，
   * 那里本来就是"基色 × 天气 × 昼夜"的连乘链。季节只是多乘一项，
   * 不需要在渲染层再开一个分支——2D 那边也在同一个色值上做乘法
   * （见 MapView 的海面容器），两个视图因此永远同步。
   */
  seaTint: [number, number, number]
  /** 陆地色乘数（比海面轻，陆地主要靠贴图，季节只调冷暖） */
  landTint: [number, number, number]
  /**
   * 印度洋季风方向：
   *   +1 = 西南季风（顺东行，往印度去快）
   *   -1 = 东北季风（顺西行，回非洲/阿拉伯快）
   */
  monsoon: 1 | -1
  /** 风暴概率倍率（秋分前后最凶，这也是史实：好望角的风暴季） */
  stormBias: number
  /** UI 上那一颗小圆点的颜色——季节首先是**看**出来的，其次才是读出来的 */
  dot: string
}

/**
 * 四季的色与风。
 *
 * 配色不是随便挑的，每个都对应一个真实的海上观感：
 *   春  海水转青绿（浮游生物与近岸泥沙、北海的春季水华）
 *   夏  明亮的热带蓝（信风稳定、天高云淡）
 *   秋  暖调、偏赭（赤潮与长日照，也是飓风季）
 *   冬  冷灰蓝（北大西洋冬季的低云与灰海）
 *
 * 乘数刻意都落在 0.85~1.18 之间：这套色调要能感到"换了季节"，
 * 但不能让玩家觉得换了游戏。档差再大就会和天气层打架。
 */
const SEASONS: SeasonInfo[] = [
  {
    id: 'spring', name: '春', index: 0,
    seaTint: [0.90, 1.12, 1.04],
    landTint: [0.98, 1.04, 0.96],
    monsoon: 1, stormBias: 1.0, dot: '#7ec8a0',
  },
  {
    id: 'summer', name: '夏', index: 1,
    seaTint: [0.92, 1.04, 1.22],
    landTint: [1.03, 1.02, 0.94],
    monsoon: 1, stormBias: 1.15, dot: '#6fb7e8',
  },
  {
    id: 'autumn', name: '秋', index: 2,
    seaTint: [1.22, 1.02, 0.88],
    landTint: [1.08, 0.99, 0.90],
    monsoon: -1, stormBias: 1.35, dot: '#e0a45c',
  },
  {
    id: 'winter', name: '冬', index: 3,
    seaTint: [0.88, 0.96, 1.16],
    landTint: [0.94, 0.96, 1.02],
    monsoon: -1, stormBias: 1.1, dot: '#9fb4cf',
  },
]

/** 全部航季（UI 图例、测试都用这一份） */
export const ALL_SEASONS = SEASONS

/**
 * 按游戏日取当前航季。
 *
 * `day` 从 1 开始（fleet.day 的语义）。负数或 0 也安全——取模之后再归一到 0..3。
 */
export function seasonAt(day: number): SeasonInfo {
  const d = Math.max(0, Math.floor(day || 0))
  return SEASONS[Math.floor(d / SEASON_DAYS) % SEASONS.length]
}

/**
 * 印度洋季风区。
 *
 * 【为什么是这块矩形】它覆盖阿拉伯海、孟加拉湾与赤道以南的贸易航线，
 * 正是季风翻转最剧烈、史实上决定船期的那片水。
 * 边界取整（不贴着海岸）是刻意的：季风不会在某个海角突然断掉，
 * 而玩家也读不出"这里风变了"——他要的是一段航程整体快慢的差别。
 */
export const MONSOON_ZONE = { latMin: -12, latMax: 26, lngMin: 35, lngMax: 112 }

/** 这个位置是否在季风区 */
export function inMonsoonZone(lat: number, lng: number): boolean {
  return lat >= MONSOON_ZONE.latMin && lat <= MONSOON_ZONE.latMax
    && lng >= MONSOON_ZONE.lngMin && lng <= MONSOON_ZONE.lngMax
}

/**
 * 季风区内的顺风方位。
 *
 * 与 `prevailingWindBearing` 同一套语义（返回"顺风航向"的方位角）：
 *   +1 西南季风 → 90（东行顺）
 *   -1 东北季风 → 270（西行顺）
 *
 * 出了季风区返回 null，调用方回落到纬度带规则。
 */
export function monsoonBearing(lat: number, lng: number, day: number): number | null {
  if (!inMonsoonZone(lat, lng)) return null
  return seasonAt(day).monsoon === 1 ? 90 : 270
}

/**
 * 2D 海面的底色（CSS 颜色）。
 *
 * 【为什么要单独给 2D 一个函数】2D 的海不是"贴图 × 颜色"，而是
 * 「底色定色相 + 贴图提供明暗（luminosity 混合）」。所以季节色调必须
 * 作用在**底色**上，改成 rgb() 直接写进去即可。
 * 3D 那条链是「基色 × 天气 × 昼夜」的连乘（见 Map3DView 的 setSeaColor）——
 * 两条链形状不同，但乘的是同一份 `seaTint`，所以切视图时颜色是一致的。
 *
 * 基准色 #2f4d70 = rgb(47,77,112)，与 MapView 里那个值必须是同一个。
 */
const SEA_CSS_BASE: [number, number, number] = [47, 77, 112]

export function seasonSeaCss(day: number): string {
  const t = seasonAt(day).seaTint
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
  return `rgb(${c(SEA_CSS_BASE[0] * t[0])}, ${c(SEA_CSS_BASE[1] * t[1])}, ${c(SEA_CSS_BASE[2] * t[2])})`
}
