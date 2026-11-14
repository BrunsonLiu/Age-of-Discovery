import type { CrewCharId, OfficerId } from '@/types'

/**
 * 人物肖像映射（2026-10-24 第三批：E1-E14 独立单人像全集，512×640 RGBA）。
 *
 * 编号与《视觉资产Prompt清单.md》E 组一一对应（这也是 GPT 生成时使用的规范编号）：
 *   E1  crew_boatswain        水手长 老汤姆
 *   E2  crew_gunner           炮手 独眼玛格
 *   E3  crew_purser           账房先生
 *   E4  crew_chaplain         随船神甫
 *   E5  crew_scholar          学者 伊莲
 *   E6  crew_cook             厨子 大班
 *   E7  crew_midshipman       见习航海士 小少爷
 *   E8  crew_blackflag_guide  黑旗向导
 *   E9  officer_pilot         老领航员
 *   E10 officer_first_mate    大副（女性）
 *   E11 officer_surgeon       船医
 *   E12 rival_black_sail_jack "黑帆"杰克
 *   E13 rival_silver_maria    "白银"玛丽亚
 *   E14 rival_stareyed_diego  "星眸"迭戈
 *
 * 【2026-11-14 逐张复核】下面这段曾经抄着素材源 README 的旧质量声明，
 * 而图早在第三批就换过一轮了 —— 声明一直在说"占位"，差点让人（我自己）去重画一张
 * 本来已经对的图。看过之后逐条结论：
 *
 *   原文「E10 大副现为女性船医造型占位」→ **不成立**。现图是 30 多岁女性，
 *       深蓝海军制服、金纽扣、黄铜传声筒，与清单设定一致。
 *   原文「E8 黑旗向导与老汤姆造型接近，辨识度低」→ **不成立**。现图是热带向导：
 *       彩纹头巾、串珠项链、长矛、腋下夹海图，与欧洲水手长完全两种形象。
 *   原文「E13 玛丽亚缺账簿封印/珍珠项链」→ **不成立**。现图有珍珠项链、
 *       摊开的账簿与羽毛笔，帽上是羽饰而非海盗三角帽。
 *   原文「E14 迭戈手持望远镜而非六分仪」→ **不成立**。手上是黄铜六分仪（弧形刻度架）。
 *       唯一仍成立的小偏差：没有黄铜单眼镜 —— 属可选饰品，不值得为它重画。
 *
 * 仍成立的部分只有一句：这批是 AI 合成后裁切/放大到 512×640，不是原生高清。
 * 在这个尺寸下（面板里最大 96px 高）看不出差别；真要换只改本文件，组件不动。
 */

const BASE = (import.meta.env?.BASE_URL as string | undefined) || '/'

/** 十五位名船员（8 位常驻 + 7 位只在特定港口露面） */
export const CREW_PORTRAITS: Partial<Record<CrewCharId, string>> = {
  boatswain: `${BASE}assets/portraits/crew_boatswain.webp`,
  gunner: `${BASE}assets/portraits/crew_gunner.webp`,
  purser: `${BASE}assets/portraits/crew_purser.webp`,
  chaplain: `${BASE}assets/portraits/crew_chaplain.webp`,
  scholar: `${BASE}assets/portraits/crew_scholar.webp`,
  cook: `${BASE}assets/portraits/crew_cook.webp`,
  midshipman: `${BASE}assets/portraits/crew_midshipman.webp`,
  corsair: `${BASE}assets/portraits/crew_blackflag_guide.webp`,
  // 第二批：从 e 系列（带铭牌的成品卡）裁掉底部铭牌得到的无铭牌版。
  // 铭牌占底部约 21%，详见 .workbuddy/gen-crew-portraits.mjs 的映射表。
  navigator: `${BASE}assets/portraits/crew_navigator.webp`,
  medic: `${BASE}assets/portraits/crew_medic.webp`,
  carpenter: `${BASE}assets/portraits/crew_carpenter.webp`,
  interpreter: `${BASE}assets/portraits/crew_interpreter.webp`,
  guide: `${BASE}assets/portraits/crew_guide.webp`,
  merchant: `${BASE}assets/portraits/crew_merchant.webp`,
  pathfinder: `${BASE}assets/portraits/crew_pathfinder.webp`,
}

/** 三位军官 */
export const OFFICER_PORTRAITS: Partial<Record<OfficerId, string>> = {
  pilot: `${BASE}assets/portraits/officer_pilot.webp`,
  quartermaster: `${BASE}assets/portraits/officer_first_mate.webp`,
  surgeon: `${BASE}assets/portraits/officer_surgeon.webp`,
}

/** 三位竞争船长（rival.id 见 data/rivals.ts：blackjack / maria / diego） */
export const RIVAL_PORTRAITS: Record<string, string> = {
  blackjack: `${BASE}assets/portraits/rival_black_sail_jack.webp`,
  maria: `${BASE}assets/portraits/rival_silver_maria.webp`,
  diego: `${BASE}assets/portraits/rival_stareyed_diego.webp`,
}

export function crewPortrait(id: CrewCharId): string | undefined {
  return CREW_PORTRAITS[id]
}

export function officerPortrait(id: OfficerId): string | undefined {
  return OFFICER_PORTRAITS[id]
}

export function rivalPortrait(id: string): string | undefined {
  return RIVAL_PORTRAITS[id]
}
