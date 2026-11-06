import type { LogbookEntry } from '@/types'
import { ports } from '@/data/ports'

/**
 * 岸上视角的纯规则。
 *
 * 抽出来是为了让「日志面板里的线索」和「岸上视角里的线索」走同一份判定：
 * 两处都只把地图移过去，不替玩家出航、不承诺奖励。以前踩过"注释描述的
 * 行为 ≠ 实现"的坑，这种跨组件一致的规则不该复制两遍。
 */

/** 该港最新一页到港见闻。logbook 是「新 → 旧」，所以 find 的第一个就是最新 */
export function latestArrivalAt(logbook: readonly LogbookEntry[], portId: number): LogbookEntry | null {
  return logbook.find(e => e.kind === 'arrival' && e.portId === portId) ?? null
}

/** 该港累计写下几页（只数到港见闻，称号页不算）。岸上铭牌靠它把"又来了一趟"说出口 */
export function arrivalCountAt(logbook: readonly LogbookEntry[], portId: number): number {
  return logbook.reduce((n, e) => n + (e.kind === 'arrival' && e.portId === portId ? 1 : 0), 0)
}

/**
 * 上一次到这一港写下的那页。
 * 第二趟回来时让玩家看见"上一趟留下了什么"，而不是每次都只显示一页新见闻、
 * 旧页沉进列表里再也想不起来 —— 累积资产必须看得见才有留存价值。
 */
export function previousArrivalAt(logbook: readonly LogbookEntry[], portId: number): LogbookEntry | null {
  let seen = 0
  for (const e of logbook) {
    if (e.kind !== 'arrival' || e.portId !== portId) continue
    seen++
    if (seen === 2) return e
  }
  return null
}

/**
 * 线索指向的地图中心。
 * 返回 null 表示"这张海图已经没有空白了"——调用方只回海图，不编一个假港口。
 */
export function clueCenter(targetPortId: number | null): [number, number] | null {
  if (targetPortId == null) return null
  const p = ports.find(x => x.id === targetPortId)
  return p ? [p.latitude, p.longitude] : null
}

/** 港口确实提供这项服务时才给入口：说了能修船，点进去就必须真能修 */
export function hasAnyService(services: readonly string[], keys: readonly string[]): boolean {
  return keys.some(k => services.includes(k))
}
