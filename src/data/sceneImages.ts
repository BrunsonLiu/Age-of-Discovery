/**
 * 事件场景真实插图映射（GPT 生成）。
 * 图内标签编号与《视觉资产Prompt清单.md》D 组一致：
 *   D1 风暴之夜 / D2 海盗接舷战 / D3 海怪 / D4 幽灵船（1200×675，来自事件大图包）
 *   D5 火山海岸 / D6 浓雾海域 / D7 港口庆典 / D8 沙滩藏宝 / D9 塞壬礁石 / D10 走私夜港
 *     （840×315，来自「六幕海上传奇.png」切分）
 *   D11 航海图室 / D12 王家舰队 / D13 新大陆海角 / D14 港口酒馆
 *     （第二批 P1，1200×675，补齐四个高频场景的空缺）
 * 事件数据里的 sceneKey 命中此表时，EventScene 用真实插图替换手绘 SVG。
 * D1-D4 的上下缘为延展模糊背景、底部压暗，正好配合 400:140 容器 object-cover 裁切。
 */
const BASE = (import.meta.env?.BASE_URL as string | undefined) || '/'

export const SCENE_IMAGES: Record<string, string> = {
  storm: `${BASE}assets/scenes/d01.png`,
  pirate: `${BASE}assets/scenes/d02.png`,
  kraken: `${BASE}assets/scenes/d03.png`,
  ghostship: `${BASE}assets/scenes/d04.png`,
  volcano: `${BASE}assets/scenes/d05.png`,
  fog: `${BASE}assets/scenes/d06.png`,
  festival: `${BASE}assets/scenes/d07.png`,
  treasure: `${BASE}assets/scenes/d08.png`,
  siren: `${BASE}assets/scenes/d09.png`,
  smuggle: `${BASE}assets/scenes/d10.png`,
  chart: `${BASE}assets/scenes/d11.png`,
  navy: `${BASE}assets/scenes/d12.png`,
  island: `${BASE}assets/scenes/d13.png`,
  tavern: `${BASE}assets/scenes/d14.png`,
}

export function sceneImage(sceneKey?: string): string | undefined {
  return sceneKey ? SCENE_IMAGES[sceneKey] : undefined
}
