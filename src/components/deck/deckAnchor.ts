/**
 * 锚：抛锚 / 收锚两种状态下的位置与姿态（纯函数，可单测）。
 *
 * 【为什么这条船需要锚】它是"这条船在干什么"最省笔画的一笔：**锚垂在水里 = 停着**，
 * 锚收在舷边 = 在走。甲板上已经有舵轮、舱口、瞭望台三个可点物，但它们表达的是
 * "接下来要做什么"；锚表达的是**此刻的状态**，而且是全船唯一与 `fleet.isSailing`
 * 直接挂钩的实体 —— 玩家看见锚收起来了，就知道这条船真的在动。
 *
 * 【为什么不做"锚沉到海底"】模型里没有海床：锚拖到 -10 米只会变成水下一团黑影，
 * 反而看不出是什么。真实船抛锚后锚链是**斜着入水**的，画面上能读到的只有
 * "链子从锚链孔一直伸进水里"这一段 —— 所以把锚放在水线上方一点（半个锚在水里），
 * 链子从锚链孔斜下去，这才是"抛了锚"的样子。
 *
 * 单位：模型米（船体局部系，x 右舷为正、z 船首为正、水线在 `WATERLINE_Y_M`）。
 */
import { WATERLINE_Y_M } from './deckWake'
import { shipHalfWidthAt } from './shipShape'

/** 锚挂在**左舷**（−x）船首：船上视角的外景机位在左舷，锚才进得了画 */
export const ANCHOR_SIDE = -1
/** 锚链孔在 z=15.55 处（比锚略靠后，链子才有斜度） */
export const HAWSE_Z = 15.55
/** 锚挂在 z=16.35（船首柱之后、前桅之前） */
export const ANCHOR_Z = 16.35
/** 锚链孔的高度（舷墙顶下方一点） */
export const HAWSE_Y = 1.72
/** 锚的尺寸：长 2.4、横杆 2.2（真实 36 米商船的比例） */
export const ANCHOR_LEN = 2.4
export const ANCHOR_STOCK = 2.2

export interface AnchorPose {
  /** 锚杆顶（挂环）在船体局部系里的位置 */
  x: number
  y: number
  z: number
  /** 绕 x 的前后倾（弧度，正 = 锚爪朝船尾方向摆） */
  tilt: number
  /** 锚链的垂度（米）：抛出时绷直、收起时松垮 */
  cableSag: number
  /** 是否在水里（渲染端据此把水下部分压暗/加涟漪） */
  wet: boolean
}

/**
 * 两种状态。
 *
 * · **抛锚（moored）**：挂环降到水线上 1.1 米，锚爪没进水里 —— 从船外看，
 *   链子从锚链孔一路斜进海面，这是"停着"最清楚的信号。
 * · **航行（sailing）**：挂环吊到**舷墙顶之上**（1.72 + 1.35 = 3.07）。真实的锚
 *   收在猫头（cathead）上正好在舷墙顶那一线，所以从甲板越过舷墙能看到横杆。
 *   【为什么这一点很重要】第一版把收起的锚放在 2.34（舷墙顶 2.74 之下），
 *   于是**两种状态在甲板视角里都看不见**（舷墙把锚完全挡住），
 *   "锚告诉玩家船在不在走"这件事就落空了。
 */
export function anchorPose(moored: boolean): AnchorPose {
  /*
   * 外伸 0.55 米（不是贴着船壳）：
   * 锚爪向两侧各张开 0.3 米，贴着船壳挂时**内侧那只爪会插进木板里**
   * （实测截图：船壳外壁上多出一个黑疙瘩）。真实船的锚本来就吊在猫头外伸梁上。
   */
  const x = ANCHOR_SIDE * (shipHalfWidthAt(ANCHOR_Z) + 0.55)
  if (moored) {
    return {
      x,
      y: WATERLINE_Y_M + 1.1,
      z: ANCHOR_Z,
      tilt: 0.12,
      // 抛出后链子被船拉直（船在锚上摆），只留一点点垂
      cableSag: 0.25,
      wet: true,
    }
  }
  return {
    x,
    y: HAWSE_Y + 1.35,
    z: ANCHOR_Z,
    /*
     * 收起时**几乎垂直**（−0.08）：第一版给它 −0.42（"翻起来贴住船壳"），
     * 结果锚杆下段随倾角往船尾方向倒了 1 米，而那一带的船壳更宽 ——
     * 锚的下半截**插进船壳里**，只剩锚爪从木板上戳出来（实测截图两个黑疙瘩）。
     * 船首是往前收窄的，垂直悬着才一路都在船壳外面。
     */
    tilt: -0.08,
    // 收起来时链子盘在舷边，垂得多
    cableSag: 0.9,
    wet: false,
  }
}

/**
 * 锚链从锚链孔到锚挂环的**中点垂度**（米）。
 * 直接给 `cableSag`：渲染端的贝塞尔控制点要取 2 倍（见 deckRigging 的注释）。
 */
export function cableSagOf(moored: boolean): number {
  return anchorPose(moored).cableSag
}

/** 锚爪最低点（判据用：抛锚时应该在水里，收锚时应该在舷墙之上） */
export function anchorFootY(moored: boolean): number {
  const p = anchorPose(moored)
  return p.y - ANCHOR_LEN
}
