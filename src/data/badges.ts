/**
 * 派系徽记与船长特质图标（第二批 P2，9 枚手绘矢量徽章）。
 *
 * 之前这两处用的是 emoji（👑⚖️📜🏴‍☠️ / 💰🛡️✨🧭⚕️），
 * emoji 在不同系统上字形不一、无法与羊皮纸金边风格统一，
 * 这一批换成手绘 SVG 徽章：统一 512×512 viewBox、金属渐变 + 描边 + 投影。
 *
 * ⚠️ 质量说明（素材 README）：这 9 枚是程序绘制的矢量图，不是 AI 生成，
 *    属"对照/预览级"，正式发布前建议由美术复核线条与配色。
 *    SVG 是矢量、可无损缩放，PNG 是同图的位图导出（供不支持 SVG 的场合兜底）。
 */

const BASE = (import.meta.env?.BASE_URL as string | undefined) || '/'

/** 派系徽记：四个势力各一枚 */
export const FACTION_BADGES: Record<string, string> = {
  crown: `${BASE}assets/ui/faction_crown.svg`,
  guild: `${BASE}assets/ui/faction_guild.svg`,
  scholars: `${BASE}assets/ui/faction_scholars.svg`,
  brethren: `${BASE}assets/ui/faction_brethren.svg`,
}

/** 船长特质图标：五选一的五个特质各一枚 */
export const TRAIT_ICONS: Record<string, string> = {
  merchant: `${BASE}assets/ui/trait_merchant.svg`,
  bulwark: `${BASE}assets/ui/trait_bulwark.svg`,
  leader: `${BASE}assets/ui/trait_leader.svg`,
  explorer: `${BASE}assets/ui/trait_explorer.svg`,
  surgeon: `${BASE}assets/ui/trait_surgeon.svg`,
}

/** 取派系徽记；未知 id 回退王室 */
export function factionBadge(id: string | undefined): string {
  return (id && FACTION_BADGES[id]) || FACTION_BADGES.crown
}

/** 取特质图标；未知 id 回退商界血脉 */
export function traitIcon(id: string | null | undefined): string {
  return (id && TRAIT_ICONS[id]) || TRAIT_ICONS.merchant
}
