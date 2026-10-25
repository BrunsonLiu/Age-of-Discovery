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
  caribbean: `${BASE}assets/ports/port_caribbean.png`,
  africa: `${BASE}assets/ports/port_west_africa.png`,
  asia: `${BASE}assets/ports/port_southeast_asia.png`,
}

/** 欧洲按建筑风格再分：伊比利亚（塞维利亚场景）vs 北欧（北欧场景） */
const IBERIA_IDS = new Set([6, 7, 20])      // 塞维利亚/里斯本/加的斯
const NORTHERN_EUROPE_IDS = new Set([8, 15]) // 伦敦/阿姆斯特丹

/** 取港口场景图：传港口 id 或港口对象均可（传 id 时自动反查区域） */
export function portImage(port: number | Pick<Port, 'id' | 'region'>): string | undefined {
  const id = typeof port === 'number' ? port : port.id
  const region = typeof port === 'number' ? (PORT_BY_ID.get(id)?.region ?? '') : port.region
  if (IBERIA_IDS.has(id)) return `${BASE}assets/ports/port_seville.png`
  if (NORTHERN_EUROPE_IDS.has(id)) return `${BASE}assets/ports/port_northern_europe.png`
  return REGION_IMAGES[region]
}
