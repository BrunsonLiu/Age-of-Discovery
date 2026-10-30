/**
 * 船况的两条配色规则：耐久、载重。
 *
 * 【为什么单独成一个文件】
 * 同一套规则在 `ShipCard`（详情卡）和 `BottomBar`（常驻船况）各需要一次。
 * 各写一份的历史教训在这个项目里出现过好几回（贸易报价曾经面板一套、结算一套，
 * fame=100 时差出 67 金）。凡是"同一个数在两处显示"的地方，判据必须是同一份代码。
 *
 * 【为什么耐久要到 30% 才红】
 * 正常航行每天都在掉耐久，如果 60% 就飘红，玩家会全程看着一片红，
 * 反而对真正的危险麻木。30% 是"该找港口修船了"的阈值。
 */
export const DANGER_COLOR = '#b8432e'
export const WARN_COLOR = '#c9a96e'
export const SAFE_COLOR = '#5f9440'

/** 耐久条的配色：≤30% 危险、≤60% 提醒、否则正常 */
export function durabilityColor(pct: number): string {
  if (pct <= 0.3) return DANGER_COLOR
  if (pct <= 0.6) return WARN_COLOR
  return SAFE_COLOR
}

/**
 * 载重条的配色。
 *
 * 与耐久不同，载重**没有中间警戒档**：空着跑和装到八成都没有任何后果，
 * 唯一要提醒的是"满了买不进货"。所以只有 ≥95% 一档变红。
 */
export function loadColor(pct: number): string {
  return pct >= 0.95 ? DANGER_COLOR : WARN_COLOR
}
