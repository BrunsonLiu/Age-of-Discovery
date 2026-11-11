/**
 * 船首：斜桅的两个端点、船首柱、船首像（**唯一来源**）。
 *
 * 【为什么这个文件必须存在】斜桅的端点在 `shipModel` 里原来被写了**两遍**：
 *   · 实体斜桅：`new V(0, 6.1, 26.2).sub(new V(0, 0.95, 15.8))` 求方向，再摆到
 *     `bowBase`（y = shipDeckAt(17)+0.95）上；
 *   · 索具：`bowTip = new V(0, shipDeckAt(17) + 6.1, 26.2)`。
 * 实测两者**碰巧完全重合**（y 都是 7.96）：方向里少算的 0.95 与底端多算的 0.95
 * 正好抵消。所以这里不是在修一个看得见的错，而是**拆掉一颗定时炸弹** ——
 * 只要有人改其中一个数（比如把底端从甲板抬 0.95 改成 1.2），前支索、艏三角帆的
 * 拉索就会立刻系在离杆头一截的空气里，而远景里那只是几根细线，几乎抓不到。
 * 现在端点只有一份，改哪都是同一处。
 *
 * 单位是模型米（与 `shipShape` 一致，整体 ×SHIP_SCALE 进场景）。
 */
import { shipDeckAt } from './shipShape'

/**
 * 斜桅的两个端点。
 *
 * 【为什么底端不在 z=18（船首柱）而在 15.8】真实帆船的斜桅是从**前桅前方的甲板上**
 * 斜穿出去、压过船首柱的：它要有一段压在甲板上，才吃得下前支索的拉力。
 * 端点定在这里，斜桅与前甲板的夹角约 26°，与同级商船的照片接近。
 */
export const BOWSPRIT_BASE = { y: shipDeckAt(17) + 0.95, z: 15.8 } as const
export const BOWSPRIT_TIP = { y: shipDeckAt(17) + 6.1, z: 26.2 } as const

/** 斜桅端头那个铜帽的高度（帽长 0.34，套在端头往里 0.25 处） */
export const BOWSPRIT_CAP_INSET = 0.25

/** 斜桅轴线在某个 z 处的高度（船首像不能捅进斜桅里，判据要用它） */
export function bowspritYAt(z: number): number {
  const t = (z - BOWSPRIT_BASE.z) / (BOWSPRIT_TIP.z - BOWSPRIT_BASE.z)
  return BOWSPRIT_BASE.y + (BOWSPRIT_TIP.y - BOWSPRIT_BASE.y) * t
}

/** 船首柱（stem post）的 z：船体放样到 ±18 收成一条边，柱子就贴在这条边上 */
export const STEM_Z = 17.95
/**
 * 船首柱顶（船首像的挂点）。
 *
 * 【为什么是甲板面往上 1.12 米，而不是贴着甲板】第一版挂在甲板 +0.22 处，
 * 结果整个船首像**躲在舷墙后面**：站在甲板上只看到舷墙顶上冒出一个金球，
 * 从侧面看又被舷墙的暗面压住（实测截图）。真实帆船的船首像挂在"头部"，
 * 大致与舷墙顶齐平或略高 —— 它在**船壳外面**，剪影是压在水面上的。
 * 抬到 1.12（舷墙 0.95 之上一点），船首像才既有剪影、又能在甲板上看见。
 */
export function stemTopY(): number {
  return shipDeckAt(STEM_Z) + 0.95
}

/**
 * 船首像的姿态：从船首柱顶**向前下方**斜伸出去。
 *
 * 【为什么是"向前下方"而不是直立】船首像在真实船上是顺着船首柱的曲度伸出去的，
 * 让它在船首剪影里形成一条连续的曲线；立着摆会读作"船头站了个人"。
 * `pitch` 是脊柱相对水平面的下俯角（弧度，正 = 朝下）。
 */
export const FIGUREHEAD = {
  pitch: 0.42,
  /** 伸出船首柱之外多远（模型米） */
  reach: 1.95,
} as const

/**
 * 船首像的脊柱：从肩到尾尖的一段，每点给"沿伸出的距离 u（0..1）、半径、抬升"。
 *
 * 【为什么是数据而不是几何代码】形状要能被单测（半径单调收细、不能没入水下、
 * 不能捅穿斜桅），而 three 的球体不该进单测。渲染端按这张表摆一串球，
 * 于是"改船首像"只改这张表。
 */
export const FIGUREHEAD_SPINE: readonly { u: number; r: number; lift: number }[] = [
  { u: 0.00, r: 0.34, lift: 0.22 }, // 肩：从柱子后面探出来
  { u: 0.22, r: 0.30, lift: 0.18 },
  { u: 0.44, r: 0.24, lift: 0.06 },
  { u: 0.64, r: 0.17, lift: -0.10 },
  { u: 0.82, r: 0.11, lift: -0.26 },
  { u: 1.00, r: 0.07, lift: -0.40 }, // 尾尖
]

/**
 * 头冠（crest）：肩部往上收出的一个尖，剪影里最像"头"的那一笔。
 *
 * 【为什么要把它单独写出来】它是整个船首像**最高**的部件：脊柱的球都经过
 * "不许捅进斜桅"的判据，头冠却建在脊柱之外 —— 第一版就是它捅进了斜桅
 * （顶 3.85 vs 斜桅轴线 3.80，实测 e2e）。放在这里，判据才能把它一起算。
 */
export const FIGUREHEAD_CREST = { lift: 0.24, height: 0.42, radius: 0.14 } as const

/**
 * 把脊柱换算成**船体局部坐标**里的一串球（x 恒为 0，船首像在中线上）。
 *
 * 横向前伸 + 下俯：z 增加 reach·u，y 由 `lift` 与 pitch 共同决定。
 * 注意 y 是**绝对高度**（船体局部系），已经加了船首柱顶。
 */
export function figureheadPoints(): { x: number; y: number; z: number; r: number }[] {
  const z0 = STEM_Z - 0.18
  const y0 = stemTopY()
  return FIGUREHEAD_SPINE.map((p) => ({
    x: 0,
    y: y0 + p.lift - Math.sin(FIGUREHEAD.pitch) * FIGUREHEAD.reach * p.u * 0.5,
    z: z0 + FIGUREHEAD.reach * p.u,
    r: p.r,
  }))
}

/** 船首像的尾尖（世界判据里"船最前端"就是它） */
export function figureheadTip(): { y: number; z: number } {
  const pts = figureheadPoints()
  const last = pts[pts.length - 1]
  return { y: last.y, z: last.z }
}
