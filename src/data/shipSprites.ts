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

/**
 * 特殊船只（炮战 / 事件用）。
 *
 * 【为什么只剩两张】这里原来有 6 张：ghost / pirate / galleonWar / galleonRoyal /
 * frigateWar / frigateLine。逐张查过引用（`grep SPECIAL_SPRITES.<key>`）：
 * 只有 `frigateWar` 被炮战用过一次，其余 5 张**从做出来到现在没有任何地方显示**。
 * 素材生成了、切好了、写进表了，但没接进游戏 —— 那就是半成品。
 *
 * 这一轮的处理：
 *   · `pirate` 接上了：唯一一场炮战（事件 236「独眼玛格的仇人」）对手是海盗，
 *     原来却画一艘皇家战舰（见 CANNON_ENEMY_SPRITE）。
 *   · 其余 4 张（ghost / galleonWar / galleonRoyal / frigateLine）挪到
 *     `assets-src/ships-parked/`：**不随包发布**，也不再出现在表里。
 *     不是删掉 —— 源图还在仓库（`精灵验收图_10艘.png`），将来有去处（对手旗舰、
 *     幽灵船事件改成插画风）再挪回来。**留在表里却不显示，等于假装它在游戏里。**
 *
 * 单测有一条守着"表里每一项都必须在 src 里被引用"，加新素材时必须同时接进游戏。
 */
export const SPECIAL_SPRITES = {
  pirate: `${BASE}assets/ships/pirate.webp`,
  frigateWar: `${BASE}assets/ships/frigate_war.webp`,
} as const

/**
 * 炮战敌舰：**对面是谁就画谁**。
 *
 * 原来只有一种敌舰（皇家战舰），而唯一一场炮战（事件 236「独眼玛格的仇人」）
 * 的对手是海盗船长 —— 玩家跟海盗开炮，画面上是一艘皇家战舰。
 * 素材表里 `pirate` 一直有，只是没人接。现在由 `EventChoice.enemyShip` 指定，
 * 不写则按海军（保持旧行为）。
 */
export const CANNON_ENEMY_SPRITE: Record<'pirate' | 'navy', string> = {
  pirate: SPECIAL_SPRITES.pirate,
  navy: SPECIAL_SPRITES.frigateWar,
}

/** 取船型精灵，未知船型回退盖伦 */
export function shipSprite(type: string): string {
  return SHIP_SPRITES[type] || SHIP_SPRITES.galleon
}
