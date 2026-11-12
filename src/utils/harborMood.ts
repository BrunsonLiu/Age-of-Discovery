/**
 * 岸上的天光 —— 「同一座港，白天和夜里是两张画」。
 *
 * 【为什么这一层必须有】岸上那张远景是**画**，画里的光是固定的：正午。
 * 而游戏里一昼夜 8 分钟实时推进，玩家会在岸上看着日落。之前不管几点上岸，
 * 屏幕上永远是同一个正午 —— 这是全项目最后一块"不随世界变化"的画面
 * （海图有 VintageMapOverlay、甲板有 litK、3D 海图有日相调灯，只有岸上没接）。
 * 玩家在海上熬到天黑、一上岸天又亮了，比"没有昼夜"更假。
 *
 * 【为什么是纯函数】同一条规则要能被单测按数值钉住（0 点是白天、1 点是深夜、
 * 黄昏在一片序号里只有一个峰），也要能一眼看出"哪个量管哪一层"。渲染侧
 * 只负责把返回值写到 opacity 上，不自己算。
 *
 * 【为什么不用 CSS 滤镜做夜】`filter: brightness()` 挂在那张 1600×900 的
 * 全景图上，每一帧改一次 = 每一帧重算一次全屏滤镜（这条坑在甲板的自适应
 * 分辨率里踩过）。改成一层纯色/渐变 div 盖上去：只在合成器上混合，不重绘贴图，
 * 4Hz 更新一次就够（日相 480 秒走完一圈，4Hz 的位移小到看不见）。
 *
 * 【为什么夜是"混向深蓝"而不是"乘 0.4"】乘法会把画面里本来就暗的舱影、
 * 桅杆压成纯黑，整块画塌成一个剪影；混向一个具体颜色至少保住轮廓。
 * 目标是深夜下最暗的可见带仍有 0.07~0.09 的亮度（e2e 量过），
 * 灯笼与星点因此有对比可站。
 */

import type { WeatherKind } from './weather'

export interface HarborMood {
  /** 夜幕（往深蓝里混）。白天 0，深夜 0.86 */
  veil: number
  /** 低日暖光：黎明/黄昏在水平线附近加一层橙。两侧归零，不是整夜都暖 */
  warm: number
  /** 星点 */
  stars: number
  /** 岸上灯火（含灯下的光池）。雾天要打掉四成——隔着白障看不清灯 */
  lamps: number
  /** 水面碎光：白天是阳光的鳞，夜里剩下月光 */
  shimmer: number
  /** 雨幕 */
  rain: number
  /** 雾幕 */
  fog: number
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)

/** 平滑阶跃。用它而不是线性：线性会在阈值处"啪"一下亮起来，像开关 */
function smooth(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/**
 * 计算当前该有多暗、多暖。
 *
 * @param night 夜色 0~1（= `1 - skyAt().lit`，日相的唯一来源）
 * @param kind 天候。岸上只关心"会不会让人看不远"，不参与玩法数值
 */
export function harborMood(night: number, kind: WeatherKind = 'clear'): HarborMood {
  const n = clamp01(night)
  // lit 是太阳高度：0.34 附近是"日头贴着海平线"，也就是黎明与黄昏
  const lit = 1 - n
  const wet = kind === 'rain' || kind === 'storm'
  /*
   * 阴天的"灰"不能靠 night 表达：晚上 8 点下不下雨一样黑。
   * 所以另加一个与日相无关的浑浊量，直接叠进夜幕。
   */
  const gloom =
    kind === 'clear' ? 0
      : kind === 'cloudy' ? 0.10
        : kind === 'fog' ? 0.14
          : kind === 'storm' ? 0.34
            : 0.18 // rain

  // 暖光用三角窗：峰值在 lit=0.34，两侧在 lit=0 与 lit=0.68 处严格归零。
  // 用 sin 的话"暖"会跟着夜色走，日落后一整夜陆地都发橙。
  const warm = Math.max(0, 1 - Math.abs(lit - 0.34) / 0.34) * (wet ? 0.40 : 0.62)

  return {
    /*
     * 曲线从 0.42 起、0.86 到顶（不是 0.22~0.72）：
     * 太阳正贴海平线（night=0.5）时长夜还没落下来，画面该是"暖而亮"的，
     * 用 0.22~0.72 会在日落那一刻就把画面压成和半夜一样黑 ——
     * 实测黄昏那帧 veil 已经 0.80、暖光再叠上去就是一整片橙雾，
     * 水面与人都糊掉了（grain 0.012）。上限 0.80 是量出来的：
     * 0.86 时最暗的可见带只剩 0.13，城的轮廓开始糊；0.80 时约 0.16。
     */
    veil: Math.min(1, 0.80 * smooth(0.42, 0.86, n) + gloom),
    // 峰值 0.62：这一层是"染色"（multiply，保住对比）不是"加亮"（screen 会洗平）
    warm,
    // 阴雨天星星要藏：云底之下没有星
    stars: smooth(0.55, 0.85, n) * (kind === 'clear' ? 1 : kind === 'cloudy' ? 0.18 : 0),
    // 灯比天黑得早：太阳一贴海平线（n≈0.35）就该点灯了
    lamps: smooth(0.30, 0.55, n) * (kind === 'fog' ? 0.6 : 1),
    // 碎光白天由太阳给，夜里只剩月亮，所以下限不归零
    shimmer: (0.30 + 0.70 * lit) * (wet ? 0.45 : 1) * (kind === 'fog' ? 0.5 : 1),
    rain: kind === 'rain' ? 0.40 : kind === 'storm' ? 0.60 : 0,
    fog: kind === 'fog' ? 0.55 : 0,
  }
}

/* ── 星点：一张贴图顶一群元素 ────────────────────────────────────────
 * 60 颗星的 SVG 就是 60 个节点 + 60 个动画，而它们只是背景。这里改成一个 div，
 * 用 60 段 radial-gradient 拼成 background-image：一次绘制、零节点。
 * 缺点是个体不能单独动，所以做两层（不同种子 + 不同动画相位），
 * 图层叠加读起来就是"疏密不一、各闪各的"。
 */

/** 与项目其他程序化纹理同一套（见 utils/paperTexture.ts），固定种子可复现 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 星点背景（多个 radial-gradient 拼成的 CSS 值）。
 * 坐标是百分比，所以铺在任意尺寸的容器里都成立；半径是像素，
 * 目视 1~2px 是"星"、4px 就成"雪"了。
 */
export function starFieldCss(seed: number, count: number): string {
  const rnd = mulberry32(seed)
  const parts: string[] = []
  for (let i = 0; i < count; i++) {
    // 上密下疏：星都在天顶，靠近地平线那条不撒（那里是城市与山）
    const y = Math.pow(rnd(), 1.5) * 88
    const x = rnd() * 100
    const r = 0.55 + rnd() * 0.85
    const a = 0.5 + rnd() * 0.45
    parts.push(
      `radial-gradient(circle at ${x.toFixed(2)}% ${y.toFixed(2)}%,` +
      ` rgba(233,241,255,${a.toFixed(2)}) 0 ${r.toFixed(2)}px,` +
      ` rgba(233,241,255,0) ${(r + 1.15).toFixed(2)}px)`,
    )
  }
  return parts.join(',')
}

/**
 * 岸上的四盏灯，坐标是**前景剪影那个 SVG 的 viewBox 空间**（1440×164）。
 *
 * 【为什么和剪影写在同一套坐标里】灯的杆就是剪影里那四根系缆桩。
 * 分两个坐标系各写一遍位置，屏幕一缩放就会错开（项目里"两处各算一次、
 * 靠系数互相抵消碰巧对上"的坑踩过：船首斜桅）。这里两边读同一份数据。
 */
export const QUAY_LAMPS: readonly { x: number; y: number }[] = [
  { x: 107, y: 69 },
  { x: 329, y: 69 },
  { x: 1139, y: 69 },
  { x: 1353, y: 69 },
]

/** 系缆桩（剪影里那四根柱子）的 x，灯就挂在上头 */
export const QUAY_POSTS: readonly number[] = [96, 318, 1128, 1342]

/** 海鸥/水面碎光的层数：两层不同速度的闪，叠起来才不像一块网格 */
export const SHIMMER_LAYERS = 2
