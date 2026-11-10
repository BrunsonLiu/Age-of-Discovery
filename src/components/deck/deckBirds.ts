import { hash01 } from './deckCoast'

/**
 * 船上视角的海鸟。
 *
 * 【为什么值得做】甲板视角原本没有任何"活物"：天、海、船、岸，全是静物。
 * 但海鸟在大航海时代是**真实的导航线索** —— 水手看到成群的海鸟就知道陆地不远，
 * 顺着鸟飞的方向找过去往往能看见陆地。这条正好符合这个项目的方向：
 * 历史与地理靠**机制与画面**落地，不靠往日志里加段落。
 *
 * 【规则不是随便定的】
 *  · 只在**能看见陆地**（`findCoast` 有结果）并且距离 ≤26 海里时出现 —— 远洋没有
 *    近岸鸟，26 海里是海鸟日常的觅食半径量级；
 *  · 群飞的方向就是最近陆地的方位（与 HUD、瞭望台同一个数）；
 *  · 夜里消失（海鸟归巢）、暴风雨与浓雾里消失。
 *
 * 【为什么是纯函数】"鸟在哪、翅膀抬多少"要能被单测直接验（8 只鸟不能叠在一点、
 * 不能飞进船舱、不能低于海面）。渲染端每帧只是把结果抄进顶点。
 */

/** 同时出现的最大鸟数（顶点缓冲按它开） */
export const BIRD_MAX = 12

export interface BirdFlock {
  /** 0 = 这一帧没有鸟 */
  count: number
  /** 整群的中心方位（相对船首，度）—— 就是最近陆地的方位 */
  headingDeg: number
  /** 整群离船的距离（世界单位；1 单位 ≈ 20 米） */
  dist: number
}

/**
 * 这一帧该有几只鸟。
 *
 * @param sightingNm 最近陆地的距离（海里），null = 视野里没有陆地
 * @param lit 天光 0..1（`skyAt().lit`）
 * @param weatherKind 当前天候
 */
export function deckBirdFlock(
  sightingNm: number | null,
  lit: number,
  weatherKind: string | undefined,
  headingDeg = 0,
): BirdFlock {
  const none: BirdFlock = { count: 0, headingDeg, dist: 0 }
  if (sightingNm == null || !Number.isFinite(sightingNm)) return none
  if (sightingNm > 26) return none
  // 夜里归巢：天光低于 0.3（黄昏之后）就不该有鸟在飞
  if (lit < 0.3) return none
  if (weatherKind === 'storm' || weatherKind === 'fog') return none
  /*
   * 越近越多：26 海里 5 只、10 海里 9 只、贴岸 12 只。
   * 用线性插值而不是分档 —— 分档在跨过阈值时会"啪"地多出四只鸟。
   */
  const k = Math.max(0, Math.min(1, (26 - sightingNm) / 16))
  const count = Math.round(5 + 7 * k)
  // 群心在船与岸之间偏岸一侧：0.55 × 距离，这样鸟读作"在我们与陆地之间"
  const dist = Math.max(7, Math.min(20, sightingNm * 0.55 + 5))
  return { count: Math.min(BIRD_MAX, count), headingDeg, dist }
}

export interface BirdPose {
  x: number
  y: number
  z: number
  /** 翅膀上抬量（−1..1），乘翼展系数就是翼尖高低 */
  wing: number
  /** 半翼展（世界单位；0.09 ≈ 1.8 米） */
  span: number
}

/**
 * 第 i 只鸟的姿态。
 *
 * 【为什么给每只鸟自己的相位与半径】同一相位 = 一群"同步振翅的机器"。三组互不
 * 相关的哈希（相位、半径、高度）就够了，不需要真的 flocking 模型。
 */
export function deckBirdPose(i: number, t: number, flock: BirdFlock): BirdPose {
  const s1 = hash01(i * 3.7 + 1.3)
  const s2 = hash01(i * 7.9 + 5.1)
  const s3 = hash01(i * 11.3 + 2.7)
  const rad = (flock.headingDeg * Math.PI) / 180
  // 朝陆地的前向与侧向（与 coastScenePos 同一套方位约定：右舷 = −x）
  const fx = -Math.sin(rad)
  const fz = Math.cos(rad)
  const sx = Math.cos(rad)
  const sz = Math.sin(rad)

  // 群心：朝陆地 0.55 距离处（deckBirdFlock 的 dist 已经是这个含义）
  const cx = fx * flock.dist
  const cz = fz * flock.dist

  /*
   * 每只鸟沿侧向散开 ±(2..8)，并沿前向慢慢来回漂 —— 整群看起来在"盘旋觅食"。
   * 侧向范围比前向大：横向散开的一群鸟从甲板看过去是"一片"，纵向排开会读作"一队"。
   */
  /*
   * 侧向散开 ±(1.2~3.2) 而不是原来的 ±(3~8)：第一版在 9 单位（180 米）距离上
   * 铺开了 ±41°，12 只鸟横跨整个画面，读作"天上几粒灰点"而不是一群鸟。
   * 鸟群应该是一个**能一眼看成一个整体**的团。
   */
  const spread = (s1 - 0.5) * 2 * (1.2 + 2.0 * s2)
  const drift = Math.sin(t * 0.21 + s2 * 6.28) * 3.0 + Math.cos(t * 0.13 + s3 * 3.1) * 2.0
  const x = cx + sx * spread + fx * drift
  const z = cz + sz * spread + fz * drift
  /*
   * 高度 0.55~1.7 世界单位（11~34 米）。
   * 【别贴着海面】眼睛在 0.27 单位（≈5 米）高处，原来的 0.32~0.99 只比视线高
   * 0.05~0.7 单位 —— 在 180 米外那只差 0.3°~4°，12 只鸟全部挤在地平线上，
   * 看起来像"海平线上的一排黑点"（实测截图）。抬高之后它们才在天空里。
   */
  const y = 0.55 + 1.15 * s3 + Math.sin(t * 0.55 + s1 * 6.28) * 0.15
  // 振翅：频率 3.4~5.6 Hz 的视觉量，相位各不同
  const wing = Math.sin(t * (3.4 + 2.2 * s1) * 2 + s2 * 6.28)
  const span = 0.10 + 0.05 * s3
  return { x, y, z, wing, span }
}
