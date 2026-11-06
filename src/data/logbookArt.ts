/**
 * 航海日志里"这趟带回来一张画"的唯一取图口。
 *
 * 为什么单独抽一层：图标/插图以后会换（`ASSET-PROMPTS.md` P2 的
 * `sighting_<region>.png` 是线描速写，比港口油画更适合当页首插图）。
 * 组件里直接写 `portImage(...)` 的话，换素材要改渲染代码；这里换就只改一处。
 *
 * 现在用港口图：20 港都有（按区域回落），显示在 296px 宽、72px 高的横条里，
 * 源图 3.6:1、显示 4.1:1，只上下裁一点，构图基本不丢。
 */
import { portImage } from '@/data/portImages'
import { ports } from '@/data/ports'

/** 传港口 id；没有港口（称号页/应验页）返回 undefined，调用方据此不出图 */
export function logbookArt(portId: number | null | undefined): string | undefined {
  if (portId == null) return undefined
  if (!ports.some(p => p.id === portId)) return undefined
  return portImage(portId)
}
