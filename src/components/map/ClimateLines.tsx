import { useEffect, useMemo, useState } from 'react'
import { Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import {
  CLIMATE_LABEL_FRAC, CLIMATE_LABEL_PAD, CLIMATE_LINES,
  climateGapCenter, climateLabelPx, climateRuns, type ClimateLine,
} from '@/utils/climateLines'

/**
 * 2D 海图的气候线：北回归线 / 南回归线 / 北极圈 / 南极圈。
 *
 * 【和经纬网的分工】经纬网给的是"我在多少度"，气候线给的是"我在哪个带"。
 * 两者都在海面上、都是线，所以必须**一眼就能分开**：
 *   · 网格用冷色实线（`#9dc2d8`，0.15~0.46），气候线用暖色虚线（金 0.5）；
 *   · 网格的度数贴左边缘排队，气候线的名字**写在线上**（嵌在线的断口里）。
 * 上一版的教训是"再来一种虚线就只是又一条虚线"——所以这里不只是换虚线，
 * 是换了整套语义：颜色（暖/冷）、位置（面上/边缘）、内容（带名/度数）。
 *
 * 【层级】自建两个 pane：
 *   · 线 `climate` z=345 —— 比网格(340)高一点（同屏时压在网格之上），
 *     但仍在陆地填色(400)之下，所以压在陆地上的半截被自动盖住，只留海面；
 *   · 名字 `climateLabels` z=522 —— 压在陆地与网格度数(520)之上、
 *     港口标记(600)之下。名字是带底板的，压住别人就不好看了，
 *     所以它得尽量贴着自己那条线，而不是去抢最上层。
 *
 * 【为什么每条线是两段】名字的位置上把线**真的断开**（不是盖白条）：
 * 海图上"字嵌在线里"就是这么做出来的。断口的宽度 = 标签宽度 + 两侧各 18px，
 * 由 `climateLabelPx` 估出来再换算成经度。墨卡托的经度在屏幕上是线性的，
 * 所以这个换算是准确的，不是凑的。
 */

const CLIMATE_PANE = 'climate'
const CLIMATE_LABEL_PANE = 'climateLabels'

/* 与 Graticule 同一套边缘避让（顶部木梁 48 / 底栏 52 / 标签带 56..h-62） */
const LABEL_EDGE_TOP = 56
const LABEL_EDGE_BOTTOM = 62

/** 断口两侧至少留这么多像素的线头，短于这个的碎段不画 */
const MIN_RUN_PX = 8

interface ClimateItem {
  line: ClimateLine
  /** 断口之后剩下的经度区间（可能 1~2 段） */
  runs: [number, number][]
  /** 名字挂在哪条经线上（`null` = 这条线在画面上但名字不放） */
  gapCenter: number | null
}

function buildClimate(map: L.Map): ClimateItem[] {
  const size = map.getSize()
  if (size.x < 40 || size.y < 40) return []
  const c = map.getCenter()
  const b = map.getBounds()
  // 两端各外扩 4°：线不要正好停在画面边上（缩放动画里会露出线头）
  const west = Math.max(-180, b.getWest() - 4)
  const east = Math.min(180, b.getEast() + 4)
  if (!(east > west)) return []

  const x0 = map.latLngToContainerPoint([c.lat, 0]).x
  const x1 = map.latLngToContainerPoint([c.lat, 1]).x
  const pxPerLng = Math.abs(x1 - x0)

  const out: ClimateItem[] = []
  for (const line of CLIMATE_LINES) {
    const y = map.latLngToContainerPoint([line.lat, c.lng]).y
    /*
     * 纬线是水平的：它要么整条在画面里，要么整条在画面外（没有"半截"）。
     * 所以出画面直接不画 —— 留下一条 y=-300 的 path 只会让 SVG 白变大。
     */
    if (y < -8 || y > size.y + 8) continue
    const canLabel = y >= LABEL_EDGE_TOP && y <= size.y - LABEL_EDGE_BOTTOM && pxPerLng > 0
    if (!canLabel) {
      out.push({ line, runs: [[west, east]], gapCenter: null })
      continue
    }
    const halfGap = (climateLabelPx(line.name) / 2 + CLIMATE_LABEL_PAD) / pxPerLng
    const gapCenter = climateGapCenter(west, east, CLIMATE_LABEL_FRAC)
    const runs = climateRuns(west, east, gapCenter, halfGap, MIN_RUN_PX / pxPerLng)
    out.push({ line, runs, gapCenter })
  }
  return out
}

function climateIcon(name: string) {
  /*
   * 底板是必要的：这条线会穿过撒哈拉、穿过阿拉伯半岛（回归线本来就从那儿过），
   * 而陆地是浅沙色的亮面 —— 金字直接放到沙上，对比度只剩 1.2:1，等于没写。
   * 深色底板 + 金字在两种底色上都能读（海面深蓝、陆地浅沙）。
   * 底板不做成整条通栏，只包住四个字 —— 它是线的一个断口，不是一条带子。
   */
  const html = `<span style="display:inline-block;transform:translate(-50%,-50%);
    font-family:var(--font-serif, Georgia, serif);font-size:12px;line-height:1.1;
    letter-spacing:0.12em;white-space:nowrap;
    color:#ecd2a0;background:rgba(8,22,30,0.50);
    padding:2px 3px 3px 6px;border-radius:2px;
    text-shadow:0 1px 2px rgba(4,12,18,0.85);">${name}</span>`
  return L.divIcon({ html, className: 'climate-label', iconSize: [0, 0], iconAnchor: [0, 0] })
}

export function ClimateLines() {
  const map = useMap()
  const [tick, setTick] = useState(0)

  const panesReady = useMemo(() => {
    if (!map.getPane(CLIMATE_PANE)) {
      const pane = map.createPane(CLIMATE_PANE)
      pane.style.zIndex = '345'
      pane.style.pointerEvents = 'none'
    }
    if (!map.getPane(CLIMATE_LABEL_PANE)) {
      const pane = map.createPane(CLIMATE_LABEL_PANE)
      pane.style.zIndex = '522'
      pane.style.pointerEvents = 'none'
    }
    return true
  }, [map])

  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    map.on('moveend', bump)
    map.on('zoomend', bump)
    map.on('resize', bump)
    bump()
    return () => {
      map.off('moveend', bump)
      map.off('zoomend', bump)
      map.off('resize', bump)
    }
  }, [map])

  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick 是重算触发器
  const items = useMemo(() => (panesReady ? buildClimate(map) : []), [map, panesReady, tick])

  if (!panesReady || items.length === 0) return null

  return (
    <>
      {items.map((it) => it.runs.map((r, i) => (
        <Polyline
          key={`cl-${it.line.key}-${i}`}
          positions={[[it.line.lat, r[0]], [it.line.lat, r[1]]]}
          pane={CLIMATE_PANE}
          pathOptions={{
            className: 'climate-line',
            /*
             * 金色虚线。0.5 是量出来的：网格是 0.28 的冷色实线，两者同屏时
             * 眼能把它们分成两类；低于 0.4 就和网格混成一片（第 93 轮
             * 虚线 0.17 那次"线在画但读不出来"的教训）。
             */
            color: '#d8bd8a',
            weight: 1.3,
            opacity: 0.5,
            dashArray: '7 6',
            lineCap: 'butt',
            interactive: false,
          }}
        />
      )))}
      {items.filter((it) => it.gapCenter !== null).map((it) => (
        <Marker
          key={`cl-lbl-${it.line.key}`}
          position={[it.line.lat, it.gapCenter as number]}
          icon={climateIcon(it.line.name)}
          pane={CLIMATE_LABEL_PANE}
          interactive={false}
          keyboard={false}
        />
      ))}
      <style>{`
        .climate-label { background: none !important; border: none !important; }
        .climate-label, .climate-label * { pointer-events: none !important; }
      `}</style>
    </>
  )
}

export default ClimateLines
