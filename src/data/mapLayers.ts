/**
 * 地图叠加图层的**唯一数据源**。
 *
 * 【为什么要抽出来】
 * 2D（Leaflet）和 2.5D（three.js）是同一张地图的两种视图。
 * 如果洋流、海盗区、洋名各写一份，切到 3D 时就会出现
 * "2D 有洋流、3D 没有"这种**承诺不兑现**的问题——
 * 底栏的图层开关在 3D 模式下依然可见可点，按下去却什么都不会发生。
 *
 * 所以这里只放数据，两种视图都从这里取。
 * 任何"要显示的东西"都必须有一处定义。
 *
 * 【数据口径】
 * 坐标一律 [纬度, 经度]（与 Leaflet 一致），
 * 只有渲染层（Leaflet / three.js）负责转到各自的世界坐标。
 */

import { prevailingWindBearing } from '@/utils/navigation'

/** 主要洋流（史实简化）：暖流红色、寒流蓝色 */
export interface OceanCurrent {
  name: string
  /** 折线节点，[lat, lng] */
  points: [number, number][]
  /** 暖流（红）还是寒流（蓝） */
  warm: boolean
}

export const OCEAN_CURRENTS: OceanCurrent[] = [
  { name: '湾流', warm: true, points: [[24, -80], [30, -75], [37, -65], [43, -50], [48, -35]] },
  { name: '北赤道流', warm: true, points: [[12, -60], [15, -45], [18, -30], [20, -18]] },
  { name: '加那利寒流', warm: false, points: [[45, -20], [35, -14], [25, -12], [14, -16]] },
  { name: '本格拉寒流', warm: false, points: [[-30, 12], [-22, 10], [-12, 8], [-2, 6]] },
  { name: '阿古拉斯暖流', warm: true, points: [[-36, 20], [-28, 26], [-20, 32], [-12, 40]] },
  { name: '南赤道流', warm: true, points: [[-8, 30], [-10, 55], [-12, 75], [-14, 90]] },
  { name: '季风漂流', warm: true, points: [[8, 60], [10, 72], [13, 82], [15, 92]] },
]

/** 海盗威胁区域（史实据点周边海域） */
export interface PirateZone {
  name: string
  /** 圆心 [lat, lng] */
  center: [number, number]
  /** 半径（度） */
  radiusDeg: number
}

export const PIRATE_ZONES: PirateZone[] = [
  { name: '加勒比海盗水域', center: [18, -74], radiusDeg: 7 },
  { name: '马六甲海峡', center: [3, 101], radiusDeg: 5 },
  { name: '几内亚湾', center: [2, 4], radiusDeg: 5 },
]

/** 风带箭头网格步长（度） */
export const WIND_GRID_STEP = 15

/** 风带分界纬度（信风带与西风带的界线） */
export const WIND_BAND_LATS = [30, -30]

/**
 * 风带箭头的落点与朝向。
 *
 * 【为什么要共用】
 * 2.5D 立体海图要显示同一批风带箭头。
 * 两边各算一次，就可能出现"2D 有 135 个箭头、3D 只有 120 个"——
 * 底栏的图层开关在两个视图里都可见可点，指向的必须是同一件事。
 *
 * 风向来自 `prevailingWindBearing`——与航行速度计算同源，
 * 玩家看到的箭头方向就是顺风方向。
 */
export interface WindArrowSite {
  lat: number
  lng: number
  /** 罗盘方位角（0=北，90=东） */
  bearing: number
}

export function windArrowSites(): WindArrowSite[] {
  const list: WindArrowSite[] = []
  for (let lat = -60; lat <= 60; lat += WIND_GRID_STEP) {
    for (let lng = -100; lng <= 120; lng += WIND_GRID_STEP) {
      list.push({ lat, lng, bearing: prevailingWindBearing(lat) })
    }
  }
  return list
}

/** 海洋名（斜体，浮在海面上） */
export interface OceanLabel {
  name: string
  lat: number
  lng: number
}

export const OCEAN_LABELS: OceanLabel[] = [
  { name: '大西洋', lat: 25, lng: -35 },
  { name: '加勒比海', lat: 16, lng: -72 },
  { name: '太平洋', lat: 5, lng: -130 },
  { name: '印度洋', lat: -15, lng: 75 },
  { name: '地中海', lat: 37, lng: 18 },
  { name: '北海', lat: 57, lng: 3 },
  { name: '几内亚湾', lat: 3, lng: 5 },
  { name: '好望角海域', lat: -34, lng: 19 },
  { name: '马六甲海峡', lat: 4, lng: 100 },
  { name: '莫桑比克海峡', lat: -16, lng: 42 },
  { name: '英吉利海峡', lat: 50, lng: -2 },
  { name: '波罗的海', lat: 60, lng: 20 },
  { name: '黑海', lat: 43, lng: 35 },
  { name: '红海', lat: 22, lng: 38 },
  { name: '阿拉伯海', lat: 15, lng: 63 },
  { name: '南海', lat: 12, lng: 113 },
  { name: '日本海', lat: 40, lng: 135 },
  { name: '墨西哥湾', lat: 25, lng: -90 },
]

/** 洲名（正体，压在陆地上） */
export const REGION_LABELS: OceanLabel[] = [
  { name: '欧 洲', lat: 52, lng: 15 },
  { name: '非 洲', lat: 5, lng: 22 },
  { name: '亚 洲', lat: 45, lng: 85 },
  { name: '北 美 洲', lat: 48, lng: -100 },
  { name: '南 美 洲', lat: -15, lng: -55 },
  { name: '澳大利亚', lat: -25, lng: 135 },
  { name: '格陵兰', lat: 72, lng: -40 },
  { name: '印度半岛', lat: 22, lng: 78 },
  { name: '阿拉伯半岛', lat: 23, lng: 48 },
  { name: '西伯利亚', lat: 62, lng: 100 },
]

/**
 * 把海盗区圆转成一圈多边形顶点（[lat, lng]）。
 *
 * 【为什么要自己算而不是用固定点数】
 * 高纬度上 1° 经度的实际距离比 1° 纬度短得多，
 * 所以圆在经纬度空间里必须按 cos(lat) 修正经度半径，
 * 否则在北欧会变成一个横向拉扁的椭圆。
 *
 * @param steps 顶点数，越多越圆
 */
export function pirateZonePolygon(zone: PirateZone, steps = 36): [number, number][] {
  const pts: [number, number][] = []
  const cosLat = Math.max(0.3, Math.cos((zone.center[0] * Math.PI) / 180))
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    const dLat = Math.sin(a) * zone.radiusDeg
    const dLng = (Math.cos(a) * zone.radiusDeg) / cosLat
    pts.push([zone.center[0] + dLat, zone.center[1] + dLng])
  }
  return pts
}
