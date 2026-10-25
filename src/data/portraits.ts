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
 * ⚠️ 质量声明（GPT README）：全部为 AI 合成画面裁切放大，非原生高清；E1-E12 有插值放大，
 *    E13/E14 由 ~752×940 双人图下采样。属"测试占位"级，正式发布前需逐张精修，尤其：
 *    - E10 大副：清单设定为 30 多岁女性大副（海军制服+金纽扣+传声筒），现为女性船医造型占位
 *    - E8 黑旗向导：年长海盗三角帽男性，与 E1 老汤姆造型接近，辨识度低
 *    - E13 玛丽亚：武器与三角帽偏海盗风，缺账簿封印/珍珠项链
 *    - E14 迭戈：手持望远镜而非六分仪，缺黄铜单眼镜
 *    另 E1-E9 各有小道具偏差（见 batch_notes）。
 *
 * 备用：图鉴切片 e01-e14.png 仍在 public/assets/portraits/（那是按"职能视觉对位"的旧映射，
 *    GPT 在合成图里改了角色名）。想回退只需把路径改回 e 编号。
 * 想换肖像只改本文件，组件不动。
 */

const BASE = (import.meta.env?.BASE_URL as string | undefined) || '/'

/** 八位名船员 */
export const CREW_PORTRAITS: Partial<Record<CrewCharId, string>> = {
  boatswain: `${BASE}assets/portraits/crew_boatswain.png`,
  gunner: `${BASE}assets/portraits/crew_gunner.png`,
  purser: `${BASE}assets/portraits/crew_purser.png`,
  chaplain: `${BASE}assets/portraits/crew_chaplain.png`,
  scholar: `${BASE}assets/portraits/crew_scholar.png`,
  cook: `${BASE}assets/portraits/crew_cook.png`,
  midshipman: `${BASE}assets/portraits/crew_midshipman.png`,
  corsair: `${BASE}assets/portraits/crew_blackflag_guide.png`,
}

/** 三位军官 */
export const OFFICER_PORTRAITS: Partial<Record<OfficerId, string>> = {
  pilot: `${BASE}assets/portraits/officer_pilot.png`,
  quartermaster: `${BASE}assets/portraits/officer_first_mate.png`,
  surgeon: `${BASE}assets/portraits/officer_surgeon.png`,
}

/** 三位竞争船长（rival.id 见 data/rivals.ts：blackjack / maria / diego） */
export const RIVAL_PORTRAITS: Record<string, string> = {
  blackjack: `${BASE}assets/portraits/rival_black_sail_jack.png`,
  maria: `${BASE}assets/portraits/rival_silver_maria.png`,
  diego: `${BASE}assets/portraits/rival_stareyed_diego.png`,
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
