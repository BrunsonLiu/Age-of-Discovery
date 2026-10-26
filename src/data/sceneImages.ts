/**
 * 事件场景真实插图映射（GPT 生成）。
 * 图内标签编号与《视觉资产Prompt清单.md》D 组一致：
 *   D1 风暴之夜 / D2 海盗接舷战 / D3 海怪 / D4 幽灵船（1200×675，来自事件大图包）
 *   D5 火山海岸 / D6 浓雾海域 / D7 港口庆典 / D8 沙滩藏宝 / D9 塞壬礁石 / D10 走私夜港
 *     （840×315，来自「六幕海上传奇.png」切分）
 *   D11 航海图室 / D12 王家舰队 / D13 新大陆海角 / D14 港口酒馆
 *     （第二批 P1，1200×675，补齐四个高频场景的空缺）
 *   D15 顺风而行 / D16 海豚护航 / D17 丰饶渔获 / D18 海上商队 / D19 鲸群邂逅
 *   D20 流星雨之夜 / D21 坏血病的阴影 / D22 暗礁危机 / D23 赤道无风带
 *   D24 好望角的风暴 / D25 叛乱的阴霾
 *     （第三批 P1，1200×420，补齐最后 11 个走手绘 SVG 兜底的场景）
 * 事件数据里的 sceneKey 命中此表时，EventScene 用真实插图替换手绘 SVG。
 * D1-D4 的上下缘为延展模糊背景、底部压暗，正好配合 400:140 容器 object-cover 裁切。
 *
 * 尺寸说明：容器是 400:140（2.857:1）。
 *   D1-D14 为 1200×675（1.778:1），浏览器 object-cover 会裁掉上下各 18.9%；
 *   D15-D25 为 1200×420（正好 2.857:1），浏览器零裁切——玩家看到 100% 内容。
 *   两种尺寸在同一容器里观感一致，只是后者不做二次裁剪。
 *
 * 图尚未交付时，<img> 会 404 → onError 触发 imgFailed → 回退手绘 SVG，不会白屏。
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
  /* 第三批：补齐最后 11 个手绘兜底场景 */
  fairwind: `${BASE}assets/scenes/d15.png`,
  dolphin: `${BASE}assets/scenes/d16.png`,
  school: `${BASE}assets/scenes/d17.png`,
  market: `${BASE}assets/scenes/d18.png`,
  whale: `${BASE}assets/scenes/d19.png`,
  meteor: `${BASE}assets/scenes/d20.png`,
  disease: `${BASE}assets/scenes/d21.png`,
  reef: `${BASE}assets/scenes/d22.png`,
  doldrums: `${BASE}assets/scenes/d23.png`,
  cape: `${BASE}assets/scenes/d24.png`,
  mutiny: `${BASE}assets/scenes/d25.png`,
}

export function sceneImage(sceneKey?: string): string | undefined {
  return sceneKey ? SCENE_IMAGES[sceneKey] : undefined
}

/**
 * 判断当前该显示真图还是回退手绘 SVG。
 *
 * 规则只有一条：**失败是 URL 的属性，不是场景的属性**。
 * 所以要记住的是「哪个地址加载不出来」，而不是「哪个场景失败过」——
 * 后者会让一次失败污染所有场景（早期版本用全局布尔值 imgFailed，
 * 风暴那张图一失败，海盗/海怪/幽灵船也一起退化成手绘 SVG）。
 *
 * 按 URL 记还带来两个好处：
 *   · 别的场景用的是别的地址，不受牵连；
 *   · 素材补齐后地址一变，新地址不在失败名单里，真图自动恢复，
 *     玩家不必刷新页面。
 *
 * @param failedSrc 最近一次加载失败的地址（null 表示还没失败过）
 * @param src 当前要加载的地址
 */
export function shouldUseSceneImage(failedSrc: string | null, src?: string): boolean {
  return !!src && failedSrc !== src
}
