/**
 * 舰船精灵清单：ChatGPT 生成的精绘帆船图（public/assets/ships/）。
 * 由 scripts/slice_ships.py 从「六艘帆船航海图鉴」与单船图切分去底生成，
 * 全部 RGBA 透明背景、船艏朝上（正北），地图标记旋转 = 方位角 - 90。
 */

// import.meta.env 仅在 Vite 环境存在（node 单测直跑时为 undefined），需兜底
const BASE =
  (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL || '/'

/** 船型 -> 精灵图（地图标记 / 面板缩略图共用） */
export const SHIP_SPRITES: Record<string, string> = {
  caravel: `${BASE}assets/ships/caravel.png`,
  galleon: `${BASE}assets/ships/galleon.png`,
  sloop: `${BASE}assets/ships/sloop.png`,
  frigate: `${BASE}assets/ships/frigate.png`,
}

/** 特殊船只（事件 / 对手用） */
export const SPECIAL_SPRITES = {
  ghost: `${BASE}assets/ships/ghost.png`,
  pirate: `${BASE}assets/ships/pirate.png`,
  galleonWar: `${BASE}assets/ships/galleon_war.png`,
  galleonRoyal: `${BASE}assets/ships/galleon_royal.png`,
  frigateWar: `${BASE}assets/ships/frigate_war.png`,
  frigateLine: `${BASE}assets/ships/frigate_line.png`,
} as const

/** 取船型精灵，未知船型回退盖伦 */
export function shipSprite(type: string): string {
  return SHIP_SPRITES[type] || SHIP_SPRITES.galleon
}
