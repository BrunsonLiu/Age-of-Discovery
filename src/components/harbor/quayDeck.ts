import { mulberry32 } from '@/utils/rng'

/**
 * 近景码头面：石砌铺装 + 摆件（纯函数，不碰 DOM）。
 *
 * 【它替换掉的是什么】上一版前景是一块**纯黑的矩形**（`#0b0704`，从 y=122
 * 平铺到 164），上面摞四个系缆桩和两道缆绳。量出来的证据：那一带整行
 * 亮度 **7.6、标准差 0.00** —— 屏幕上是一条 42px 高、横贯全宽的纯色横带，
 * 而且它**压在画的中间**（画的下沿 18% 还露在它下面），
 * 读起来是"画被一条黑胶带从中间勒断"，不是"我们站在码头上"。
 *
 * 【为什么用石块而不是一条渐变】同色实心块 + 一条渐变，在这个项目里
 * 已经踩过四次（墙、甲板、海面）。石面的辨识度全在**缝**与**块间色差**上，
 * 所以这里是逐块生成：行高按透视递加（远处 17、近处 38），
 * 块宽 58~134 抖动，色阶五档。判据也不是"画了没有"，而是
 * `harbor-view` e2e 量那一带的**相邻像素梯度**（纯色横带是 0）。
 *
 * 【坐标系】SVG viewBox `0 0 1440 240`，与 `HarborForeground` 同一份：
 * 水线在 y=96，码头面铺到 y=240（屏幕最底，被底栏压住一截）。
 */

/** 水线（画的下沿 ↔ 码头面交界）：以上是画里的水与城，以下是我们的码头 */
export const QUAY_EDGE_Y = 96
/** 码头面下沿（= viewBox 底） */
export const QUAY_BOTTOM_Y = 240

/** 消失点（画里那条地平线的正中；石面的竖缝都朝它收） */
const VP_X = 720

/**
 * 把"平面坐标"里的 x 按纵深投影到屏幕上。
 *
 * 【为什么必须有这一步】第一版的石块竖缝全是**竖直**的 —— 五排等宽的砖，
 * 读出来是一面**墙**（截图里就是砌体墙面），不是脚下的地。
 * 地面的竖缝必须朝消失点收：远处（y=96）收窄到 0.82，近处（y=240）放到 1.24。
 * 这个函数是纯函数，石面与摆件共用同一份投影 —— 否则桶会"站"在错误的砖缝上。
 */
export function quayProjectX(x: number, y: number): number {
  const t = (y - QUAY_EDGE_Y) / (QUAY_BOTTOM_Y - QUAY_EDGE_Y)
  const k = 0.82 + 0.42 * t
  return VP_X + (x - VP_X) * k
}

export interface QuaySlab {
  /** 左上角（平面坐标，画的时候要过 quayProjectX；x 可以为负：边缘留余量给透视收分） */
  x: number
  y: number
  w: number
  h: number
  /** 色阶 0~1，组件按它取一档颜色 */
  tone: number
}

/**
 * 五排石面。行高 **17 / 21 / 26 / 30 / 38**：由远及近递加。
 *
 * 【行高必须递加】等行高 + 等块宽 = 地砖贴图（这个项目里叫"方格布"）。
 * 近处的石块在屏幕上本来就该更大 —— 透视不是滤镜，是尺寸。
 * 缝宽固定 2（viewBox 单位）：缝太宽会读成"一块块分开的木头"，
 * 太窄（<1）在 1.125 倍缩放下会被抗锯齿糊掉、缝消失于纯色。
 */
const ROWS: readonly { y: number; h: number }[] = [
  { y: 100, h: 17 },
  { y: 119, h: 21 },
  { y: 142, h: 26 },
  { y: 170, h: 30 },
  { y: 202, h: 38 },
]

const GAP = 2

export function quayPaving(seed = 815): QuaySlab[] {
  const rnd = mulberry32(seed)
  const out: QuaySlab[] = []
  for (const row of ROWS) {
    // 每行从负偏移开始：错缝（running bond）是砌筑的基本特征
    let x = -320 - Math.round(rnd() * 60)
    while (x < 1760) {
      const w = Math.round(58 + rnd() * 76)
      out.push({
        x,
        y: row.y,
        w,
        h: row.h,
        // 0.10~0.95：留一点极端值，让某一两块明显更深（湿的）
        tone: +(0.10 + rnd() * 0.85).toFixed(3),
      })
      x += w + GAP
    }
  }
  return out
}

export type QuayPropKind = 'crate' | 'barrel' | 'coil'

export interface QuayProp {
  kind: QuayPropKind
  /** 左上角 */
  x: number
  y: number
  w: number
  h: number
  tone: number
}

/**
 * 码头上的货：木箱、木桶、盘好的缆绳。
 *
 * 【为什么一定要在近景放东西】石面是**平**的：一整片只有缝的斜面。
 * 真实的码头永远堆着东西 —— 有立起来的东西才有"近处"的纵深，
 * 也给那几个走动的人一个参照（人是高的还是矮的，得旁边有桶比）。
 *
 * 【摆位三条约束】（单测守着）
 *  · 都在**看得见的那一带**（y+h ≤ 194）：底栏从视口 94.3% 起，
 *    再往下画就是画给状态栏看的（第一版写在 186~242，截图里一件都看不见）；
 *  · 水线（96）以下才算"站在石面上"，所以 y ≥ 100；靠近水线的那几件更小
 *    （远处的桶就是比近处的小），这是纵深，不是随手摆的；
 *  · 离系缆桩 ≥34：桩是描边的，桶压上去会读成"桩穿桶而过"；
 *  · 两件之间 ≥24：挤在一起是"一堆杂物"，分开才认得出分别是什么。
 */
const PROP_SLOTS: readonly Omit<QuayProp, 'tone'>[] = [
  /*
   * 水线（96）到第一排货之间那 40 个单位原本是空的 —— 宽屏上是一大片平甲板。
   * 三件"远处的小货"填在这条带上（它们比近处的小 30%，因为更远）。
   */
  { kind: 'barrel', x: 372, y: 106, w: 30, h: 38 },
  { kind: 'crate', x: 730, y: 108, w: 40, h: 34 },
  { kind: 'coil', x: 1076, y: 112, w: 38, h: 15 },
  { kind: 'coil', x: 206, y: 160, w: 46, h: 18 },
  { kind: 'crate', x: 462, y: 134, w: 50, h: 44 },
  { kind: 'barrel', x: 596, y: 142, w: 34, h: 44 },
  { kind: 'barrel', x: 660, y: 148, w: 34, h: 44 },
  { kind: 'crate', x: 892, y: 138, w: 46, h: 42 },
  { kind: 'coil', x: 1002, y: 164, w: 44, h: 17 },
  { kind: 'barrel', x: 1232, y: 140, w: 34, h: 46 },
]

export function quayProps(seed = 917): QuayProp[] {
  const rnd = mulberry32(seed)
  return PROP_SLOTS.map(s => ({
    ...s,
    // ±6 的横向抖动：位置写死会读成"复制粘贴"，抖太多又会互相压住
    x: Math.round(s.x + (rnd() - 0.5) * 12),
    tone: +(0.15 + rnd() * 0.7).toFixed(3),
  }))
}

/**
 * 码头面在屏幕上的**水线**位于视口高度的百分比。
 *
 * 前景 SVG 是 `bottom-0 h-[30%]` + viewBox 高 240，水线在 96/240 处 ——
 * 所以水线固定在 `1 - 0.30 + 0.30*(96/240) = 0.82`。
 * 这个数被 `harbor-mood` 用来取样"灯下的地面"，写成一个函数是为了
 * 将来改高度时取样跟着走，而不是又出现一个写死的 0.82。
 */
export const QUAY_EDGE_SCREEN_Y = 1 - 0.3 + 0.3 * (QUAY_EDGE_Y / QUAY_BOTTOM_Y)
