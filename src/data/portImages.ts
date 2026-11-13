import { ports } from '@/data/ports'
import type { Port } from '@/types'

/**
 * 港口场景插图（C 组，GPT 生成 1600×900，来自 A-H 全集包）。
 * 五张图按"区域+建筑风格"对位到 20 个港口——同名港用专属图，
 * 同区域其他港共用区域图（伊比利亚三港共用塞维利亚场景，北欧两港共用北欧场景）：
 *
 *   port_seville         塞维利亚(6)/里斯本(7)/加的斯(20)——伊比利亚母港，大教堂钟楼
 *   port_northern_europe 伦敦(8)/阿姆斯特丹(15)——雪山北欧港
 *   port_caribbean       哈瓦那/皇家港/拿骚/托尔图加/圣胡安/卡塔赫纳/韦拉克鲁斯——热带加勒比
 *   port_west_africa     埃尔米纳/开普敦/蒙巴萨/桑给巴尔——沙漠城堡商站
 *   port_southeast_asia  果阿/马六甲/澳门/巴达维亚——东方帆船与金顶
 *
 * ⚠️ 质量声明（README）：测试级放大裁切，有历史/地貌偏差；非各港口实景。
 */

const BASE = (import.meta.env?.BASE_URL as string | undefined) || '/'

const PORT_BY_ID = new Map(ports.map(p => [p.id, p]))

/** 区域 → 场景图（region 见 data/ports.ts：europe/africa/asia/caribbean） */
const REGION_IMAGES: Record<string, string> = {
  caribbean: `${BASE}assets/ports/port_caribbean.webp`,
  africa: `${BASE}assets/ports/port_west_africa.webp`,
  asia: `${BASE}assets/ports/port_southeast_asia.webp`,
}

/** 欧洲按建筑风格再分：伊比利亚（塞维利亚场景）vs 北欧（北欧场景） */
const IBERIA_IDS = new Set([6, 7, 20])      // 塞维利亚/里斯本/加的斯
const NORTHERN_EUROPE_IDS = new Set([8, 15]) // 伦敦/阿姆斯特丹

/**
 * 第四批：8 个港口的**专属**立绘（GPT 生成，1792×1024）。
 *
 * 【为什么先做这 8 个】上一轮巡检（`.workbuddy/port-shot-all.mjs`）数出来的结果：
 * 20 个港口实际只有 5 张画——加勒比 7 港共用一张，等于跑完一圈只看过 5 张图。
 * 这 8 个是"同一张图被最多港口共用"的那几组里的代表：
 * 加勒比（哈瓦那/皇家港/拿骚/卡塔赫纳/韦拉克鲁斯）、非洲（开普敦）、
 * 亚洲（果阿/澳门）。做完之后 5 张变 13 张。
 *
 * ⚠️ 素材说明书自己标注了：生成器输出的原图约 800×220，1792×1024 是插值放大，
 * 不是原生分辨率。面板里只显示 96px 高的一条，实测观感没问题；
 * 但**放大看会软**，将来有原生尺寸时应直接替换同名文件。
 */
const PORT_SPECIFIC: Record<number, string> = {
  1: 'port_havana',        // 哈瓦那
  2: 'port_port_royal',    // 皇家港
  3: 'port_nassau',        // 拿骚
  10: 'port_cape_town',    // 开普敦
  11: 'port_goa',          // 果阿
  13: 'port_cartagena',    // 卡塔赫纳
  14: 'port_veracruz',     // 韦拉克鲁斯
  18: 'port_macau',        // 澳门
  /*
   * 广州（大明母港）单独一张。
   *
   * 【为什么必须单独做】它原来落到 `port_southeast_asia` —— 那是**泰式**港口
   * （金色佛塔、红瓦寺庙、阿瑜陀耶式的尖顶），大明的市舶司被画成了暹罗。
   * 这是史实错误，而广州是选大明时**第一眼看到的地方**。
   * 新图是 2026-11-13 生成的明代广州（城墙城门楼 + 山上砖塔 + 灰瓦硬山屋面
   * + 红帆沙船 + 栈桥货堆），1600×900、q72、147KB。
   * ⚠️ 生成图右下角原带水印，导出时切掉了底部 104px（那一带在游戏里也被前景码头压住）。
   */
  21: 'port_guangzhou',
  /*
   * 马六甲 / 巴达维亚：马来河港（2026-11-13 生成）。
   *
   * 【为什么不再用 `port_southeast_asia`】那张画的是**泰式**港口（金色佛塔、
   * 红瓦寺庙、chofa 弯檐）—— 马来半岛与爪哇的河口港不长那样。
   * 新图是 15 世纪马来河口：高脚屋 + 直脊茅顶 + prahu 与沙船 + 椰林雨林。
   * 巴达维亚（雅加达）在 1492 年的语境里也是巽他王国的河口港，共用这张
   * 比"泰式寺庙"近得多；真要分开，得再补一张荷兰运河城（那是 17 世纪的事，
   * 与本作 1492 的开局本来就错位）。
   */
  12: 'port_malay_river',   // 马六甲
  19: 'port_malay_river',   // 巴达维亚
}

/** 取港口场景图：传港口 id 或港口对象均可（传 id 时自动反查区域） */
export function portImage(port: number | Pick<Port, 'id' | 'region'>): string | undefined {
  const id = typeof port === 'number' ? port : port.id
  const region = typeof port === 'number' ? (PORT_BY_ID.get(id)?.region ?? '') : port.region
  const specific = PORT_SPECIFIC[id]
  if (specific) return `${BASE}assets/ports/${specific}.webp`
  if (IBERIA_IDS.has(id)) return `${BASE}assets/ports/port_seville.webp`
  if (NORTHERN_EUROPE_IDS.has(id)) return `${BASE}assets/ports/port_northern_europe.webp`
  return REGION_IMAGES[region]
}

/**
 * 岸上视角的**整屏**背景，与上面那套 96px 缩略图分开取。
 *
 * 【为什么必须分开】面板里那张图只显示 96px 高，原生 800×220 插值到 1600×900
 * 也看不出问题；可岸上视角是 `object-cover` 铺满整屏，同一张图会被放大到
 * 1500~2500px 宽，观感就是一团涂抹——玩家连"这地方长什么样"都看不出来，
 * 岸上这一屏就白做了。
 *
 * 现在只有欧洲这张是真·原生全景（1672×941，无上采样，q0.72 有损 391KB）。
 * 素材方的 README 标注"未达 2560×1440，不可当 production approved"——
 * 对浏览器背景来说 1440 屏下是 0.86 倍、不放大，只有 2K/4K 屏才会放大 1.2~1.5 倍；
 * 所以可用于游戏，但**不能对外声称达到 2560 原生**，等原生大图到位再同名替换。
 *
 * 其余港口暂回落到缩略图（现有行为不变），补到哪张就加哪张。
 */
const HARBOR_BACKDROP_BY_ID: Record<number, string> = {
  6: 'harbor_europe',  // 塞维利亚
  7: 'harbor_europe',  // 里斯本
  20: 'harbor_europe', // 加的斯

}

export function harborBackdrop(port: number | Pick<Port, 'id' | 'region'>): string | undefined {
  const id = typeof port === 'number' ? port : port.id
  const backdrop = HARBOR_BACKDROP_BY_ID[id]
  if (backdrop) return `${BASE}assets/ports/${backdrop}.webp`
  return portImage(port)
}
