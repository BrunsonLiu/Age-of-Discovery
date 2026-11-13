/**
 * 舰船精灵清单：ChatGPT 生成的精绘帆船图（public/assets/ships/）。
 * 由 scripts/slice_ships.py 从「六艘帆船航海图鉴」与单船图切分去底生成，
 * 全部透明背景、船艏朝上（正北），地图标记旋转 = 方位角 - 90。
 *
 * 【格式：WebP 320²，不是原来的 PNG 512²】屏幕上最大只用 96px（HelmModal 的
 * `h-24`），地图上 84px、NPC 46px、卡面 40px —— 1 倍屏 96px、3 倍屏 288px，
 * 512² 是纯浪费。冷启动实测（slow4g）：`caravel.png` **190KB** 是首屏第 4 大资源。
 * 重编码成 320² 带 alpha 的 lossy WebP 后 190KB → **20KB**（整套 1918KB → 207KB）。
 * 生成脚本：`scripts/shrink_images.mjs --only=ships`（用浏览器 canvas 编码，本机没有 PIL/sharp）。
 * 注意 `scripts/slice_ships.py` 仍输出 PNG —— 切完图要再跑一遍 shrink。
 */

// import.meta.env 仅在 Vite 环境存在（node 单测直跑时为 undefined），需兜底
const BASE =
  (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/'

/** 船型 -> 精灵图（地图标记 / 面板缩略图共用） */
export const SHIP_SPRITES: Record<string, string> = {
  caravel: `${BASE}assets/ships/caravel.webp`,
  galleon: `${BASE}assets/ships/galleon.webp`,
  sloop: `${BASE}assets/ships/sloop.webp`,
  frigate: `${BASE}assets/ships/frigate.webp`,
}

/** 特殊船只（事件 / 对手用） */
export const SPECIAL_SPRITES = {
  ghost: `${BASE}assets/ships/ghost.webp`,
  pirate: `${BASE}assets/ships/pirate.webp`,
  galleonWar: `${BASE}assets/ships/galleon_war.webp`,
  galleonRoyal: `${BASE}assets/ships/galleon_royal.webp`,
  frigateWar: `${BASE}assets/ships/frigate_war.webp`,
  frigateLine: `${BASE}assets/ships/frigate_line.webp`,
} as const

/** 取船型精灵，未知船型回退盖伦 */
export function shipSprite(type: string): string {
  return SHIP_SPRITES[type] || SHIP_SPRITES.galleon
}
