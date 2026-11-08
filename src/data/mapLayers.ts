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

import { prevailingWindBearingAt } from '@/utils/navigation'
import { seasonAt } from '@/utils/season'

/** 主要洋流（史实简化）：暖流红色、寒流蓝色 */
export interface OceanCurrent {
  name: string
  /**
   * 流速（节）。
   *
   * 真实量级：湾流 2 节、阿古拉斯 2~2.5 节、赤道流 1~1.5 节。
   * 这个数**直接进航程计算**（见 utils/seaCurrents），不再是装饰。
   */
  knots: number
  /** 折线节点，[lat, lng]。**点序就是流向**（3D 的虚线沿点序流动） */
  points: [number, number][]
  /** 暖流（红）还是寒流（蓝） */
  warm: boolean
  /**
   * 是否随季风反向。
   *
   * 【为什么这一条单独标出来】印度洋的季风漂流是**半年一次掉头**的真实洋流：
   * 西南季风期往东北走，东北季风期往西南走。别的洋流（湾流、本格拉……）
   * 常年一个方向，标了就是错的。
   * 渲染端拿 `currentFlowPoints()` 取点序，反向时把数组倒过来——
   * 3D 的虚线是沿点序推进的，倒过来就是"水往回流"，
   * 不需要为季节写第二套渲染。
   */
  monsoonReverses?: boolean
}

export const OCEAN_CURRENTS: OceanCurrent[] = [
  // 湾流：佛罗里达外海往东北，2 节。点序 = 流向，下同。
  { name: '湾流', knots: 2.0, warm: true, points: [[24, -80], [30, -75], [37, -65], [43, -50], [48, -35]] },
  /*
   * 【2026-11-09 修方向】北赤道流与南赤道流**都向西流**（信风推的），
   * 原来这两条的点序是从西往东，方向反了。以前没人用量方向，所以看不出来；
   * 一旦洋流进航程计算，"逆流"和"顺流"就整个颠倒。
   */
  { name: '北赤道流', knots: 1.2, warm: true, points: [[20, -18], [18, -30], [15, -45], [12, -60]] },
  { name: '加那利寒流', knots: 1.0, warm: false, points: [[45, -20], [35, -14], [25, -12], [14, -16]] },
  { name: '本格拉寒流', knots: 1.0, warm: false, points: [[-30, 12], [-22, 10], [-12, 8], [-2, 6]] },
  // 阿古拉斯：沿南非东南岸向**西南**冲（2.2 节）。原先点序是东北向，也反了。
  { name: '阿古拉斯暖流', knots: 2.2, warm: true, points: [[-28, 32], [-32, 26], [-36, 20]] },
  { name: '南赤道流', knots: 1.2, warm: true, points: [[-14, 90], [-12, 75], [-10, 55], [-8, 30]] },
  // 季风漂流：唯一会掉头的洋流（见 monsoonReverses）
  { name: '季风漂流', knots: 1.4, warm: true, monsoonReverses: true, points: [[8, 60], [10, 72], [13, 82], [15, 92]] },
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
 * 风向来自 `prevailingWindBearingAt`——与航行速度计算同源，
 * 玩家看到的箭头方向就是顺风方向。
 *
 * 【为什么要传 day】印度洋的箭头必须跟着季风半年掉一次头。
 * 不传 day 时退回纯纬度带规则（旧行为），2D/3D 都走这一个函数，
 * 于是"海上箭头指哪儿"在两个视图里永远一致。
 */
export interface WindArrowSite {
  lat: number
  lng: number
  /** 罗盘方位角（0=北，90=东） */
  bearing: number
}

export function windArrowSites(day?: number): WindArrowSite[] {
  const list: WindArrowSite[] = []
  for (let lat = -60; lat <= 60; lat += WIND_GRID_STEP) {
    for (let lng = -100; lng <= 120; lng += WIND_GRID_STEP) {
      // 季风区内按季风给，区外是纬度带规则（见 season.ts 的 monsoonBearing）
      list.push({ lat, lng, bearing: prevailingWindBearingAt(lat, lng, day ?? 0) })
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

/**
 * 洋流的**当前流向点序**。
 *
 * 会随季风掉头的那条（季风漂流）在东北季风期把点序倒过来——
 * 3D 的虚线沿点序推进、2D 的画的是同一条折线，
 * 于是两个视图的流向会跟着季节一起反过来，不需要两套渲染。
 *
 * `day` 缺省时按"第一个航季"处理（春/夏 → 西南季风），
 * 这样不关心季节的调用方行为不变。
 */
export function currentFlowPoints(cur: OceanCurrent, day?: number): [number, number][] {
  if (!cur.monsoonReverses) return cur.points
  const flip = day === undefined ? false : seasonAt(day).monsoon === -1
  return flip ? [...cur.points].reverse() : cur.points
}
