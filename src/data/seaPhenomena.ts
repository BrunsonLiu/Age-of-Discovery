/**
 * 季节性海上现象：海图上**按时令出现的一片水**。
 *
 * 【这一层要解决什么】
 * 上一轮「季节」已经能看见（海色、陆色、雪线、季风箭头、时令遗物），
 * 但那些要么是颜色、要么是离船很远的东西。玩家真正能感到季节的，
 * 是**这一季的这片海不好走**——这也是大航海时代水手的实际经验：
 * 不是"海变蓝了"，而是"这个季节别去那片水"。
 *
 * 【为什么不写一段说明】
 * 用户的方向是「融入历史地理神话，但不要只用文字」。所以这里的三层全是实的：
 *   ① 地图上一片按时令出现的区域（看得见）；
 *   ② 航线穿过去，天数真的变多（算得出）；
 *   ③ 区域内的天候事件率真的变高（遇得上）。
 * 文案只负责注脚，不承担叙事。
 *
 * 【四条都钉在真实海域，且都在主航线上】
 * 选址不是凭印象：每条都拿 `public/data/sea-mask.bin` 验过圆心在海上，
 * 并拿真 A* 几何量过「主航线确实穿过」——摆在没人走的洋面上等于没做
 * （海上遗物那一轮就踩过一次：两件遗物离任何航线 150 海里以上）。
 * 实测穿过点数（真 A*）：春 50 / 夏 65 / 秋 81 / 冬 49。
 *
 * 【为什么用圆不用矩形】
 * 天气区没有直角。而且圆在 2D 与 3D 里都只要一段环上的点
 * （见 `phenomenonRing`），两边画出来必然一致；
 * 矩形还要处理"盖住大陆的一个角"这种难看的情况。
 * 秋季的风暴带刻意盖住好望角半岛（圆内陆地 15%）——
 * "风暴角"本来就该把那个角罩住。
 */

import { haversineNm } from '@/utils/navigation'
import { seasonAt, type SeasonId } from '@/utils/season'

/** 视觉类别（决定颜色与描边，不是玩法分类） */
export type PhenomenonKind = 'fog' | 'calm' | 'storm' | 'surge'

export interface SeaPhenomenon {
  id: string
  name: string
  kind: PhenomenonKind
  /** 只在哪个航季出现 */
  season: SeasonId
  /** 圆心（真实海域，掩码验过在海上） */
  lat: number
  lng: number
  /**
   * 半径（纬度方向的角度数）。
   * 经度方向会自动按 `1/cos(lat)` 拉长，于是它在球面上是个**正圆**，
   * 在等距圆柱/墨卡托底图上也是圆的——2D 与 3D 用同一段点。
   */
  radiusDeg: number
  /**
   * 每天航程的乘数（<1 = 变慢）。
   *
   * 【为什么作用在 speed 而不是"直接加天数"】天数只有一条链：
   * `routeFacts → windFavor → dailyDistanceNm → daysForDistance`。
   * 这个乘数乘进 `windFavor` 之后，**玩家看到的"约 N 天可达"与船实际的日推进
   * 是同一个数**——否则屏幕上的数字和实际变化会对不上，那是本项目最忌讳的事。
   */
  speedMul: number
  /**
   * 天候类事件（风暴 / 海难 / 火山）的概率乘数。
   * 只乘这三类：它们由天候直接驱动。货价、招募、传闻跟这片水没有因果，
   * 乘上去就是编造（这条判断在 `eventEngine` 里已有先例）。
   */
  eventBias: number
  /** 描边色（2D 与 3D 共用） */
  color: string
  /** 一句注脚，出现在悬停提示与通知里 */
  note: string
}

export const SEA_PHENOMENA: SeaPhenomenon[] = [
  {
    id: 'cold_wall_fog',
    name: '冷墙的浓雾',
    kind: 'fog',
    season: 'spring',
    lat: 42.5,
    lng: -48.0,
    radiusDeg: 5.0,
    speedMul: 0.85,
    eventBias: 1.3,
    color: '#b9c6c9',
    note: '暖流与寒流在这条线上撞上，海面整天起雾。前后桅互相看不见，只能靠测深锤和钟声走。',
  },
  {
    id: 'sargasso_calm',
    name: '马尾藻的无风带',
    kind: 'calm',
    season: 'summer',
    lat: 27.0,
    lng: -55.0,
    radiusDeg: 6.5,
    // 无风带是这四条里最狠的一条：真被压住过的人记的是「几周」，不是「两成」
    speedMul: 0.6,
    eventBias: 0.65,
    color: '#c9a55e',
    note: '一片漂满马尾藻的静水。帆垂下来，船在原地打转；坏血病总是从这种地方开始。',
  },
  {
    id: 'cape_storm_belt',
    name: '风暴角的风暴带',
    kind: 'storm',
    season: 'autumn',
    lat: -36.5,
    lng: 21.5,
    radiusDeg: 6.0,
    speedMul: 0.78,
    eventBias: 1.6,
    color: '#7b5a86',
    note: '迪亚士把它叫「风暴角」。秋季的西风带在这里最凶，帆要收得只剩前桅的一小块。',
  },
  {
    id: 'biscay_swell',
    name: '比斯开湾的涌浪',
    kind: 'surge',
    season: 'winter',
    // 比西侧那版略往西挪：旧的圆心环上有 5 个点在布列塔尼陆地上
    lat: 45.0,
    lng: -10.5,
    radiusDeg: 4.0,
    speedMul: 0.85,
    eventBias: 1.3,
    color: '#8fa9bf',
    note: '冬季的大西洋涌浪在比斯开湾堆起来。船首一沉就是半天，甲板上什么都系不住。',
  },
]

/** 当前航季的现象（四季各一条，UI 与渲染都读这一份） */
export function activePhenomena(day: number): SeaPhenomenon[] {
  const id = seasonAt(day).id
  return SEA_PHENOMENA.filter(p => p.season === id)
}

/** 该点在不在这个现象里（球面正圆，单位海里换算） */
export function inPhenomenon(p: SeaPhenomenon, lat: number, lng: number): boolean {
  return haversineNm(p.lat, p.lng, lat, lng) <= p.radiusDeg * 60
}

/** 该点落在哪个现象里；没有则 null */
export function phenomenonAt(lat: number, lng: number, day: number): SeaPhenomenon | null {
  for (const p of activePhenomena(day)) {
    if (inPhenomenon(p, lat, lng)) return p
  }
  return null
}

/** 该点的航程乘数（多条重叠时连乘，目前不会重叠） */
export function phenomenonSpeedAt(lat: number, lng: number, day: number): number {
  let k = 1
  for (const p of activePhenomena(day)) {
    if (inPhenomenon(p, lat, lng)) k *= p.speedMul
  }
  return k
}

/** 该点的天候事件概率乘数 */
export function phenomenonEventBias(lat: number, lng: number, day: number): number {
  let k = 1
  for (const p of activePhenomena(day)) {
    if (inPhenomenon(p, lat, lng)) k *= p.eventBias
  }
  return k
}

/**
 * 一条航线被现象拖慢后的整体乘数。
 *
 * 按**航段长度加权**：在风暴带里走 300 海里与擦过 20 海里，
 * 平均下来当然不一样。几何点本身就是等距加密过的（routePath 的 densify），
 * 所以直接把每段的长度加起来即可，不用再插值。
 *
 * 没有任何现象时返回 1——调用方不必自己判断。
 */
export function routePhenomenonFactor(
  points: { lat: number; lng: number }[],
  day: number,
): number {
  const act = activePhenomena(day)
  if (act.length === 0 || points.length < 2) return 1
  let totalNm = 0
  let slowedNm = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const seg = haversineNm(a.lat, a.lng, b.lat, b.lng)
    if (seg <= 0) continue
    totalNm += seg
    // 取航段中点判定：段长已经密到 8 海里以内，端点判定与中点判定不会差出结论
    const midLat = (a.lat + b.lat) / 2
    const midLng = (a.lng + b.lng) / 2
    for (const p of act) {
      if (inPhenomenon(p, midLat, midLng)) {
        slowedNm += seg * (1 - p.speedMul)
        break
      }
    }
  }
  if (totalNm <= 0) return 1
  return +(1 - slowedNm / totalNm).toFixed(4)
}

/**
 * 现象边界的环上取样点（闭合）。
 *
 * 经度方向除以 `cos(lat)`：这样每一段到圆心的球面距离都等于 `radiusDeg`，
 * 2D 的折线与 3D 的线用的是**同一段点**，两个视图不会各画一个形状。
 * `segments=48` 是为了在 3D 近景下也看不出折角（半径 4° 时每段约 30 海里）。
 */
export function phenomenonRing(p: SeaPhenomenon, segments = 48): [number, number][] {
  const k = Math.max(0.15, Math.cos(p.lat * Math.PI / 180))
  const out: [number, number][] = []
  for (let i = 0; i < segments; i++) {
    const th = (i / segments) * Math.PI * 2
    out.push([
      p.lat + Math.cos(th) * p.radiusDeg,
      p.lng + (Math.sin(th) * p.radiusDeg) / k,
    ])
  }
  /*
   * 闭合点**复制第一个点**，不要用 `i <= segments` 再算一遍 θ=2π：
   * `sin(2π)` 是 -2.4e-16 而不是 0，算出来的经度与首点差一个浮点末位，
   * 3D 的 Line2 会因此留下一条 1e-16 长的尾巴（不致命），
   * 但更重要的是**2D 与 3D 必须读完全相同的点**——差一位就没法用
   * 「首尾坐标相等」来守这件事了（实测过滤后 4 条里 2 条不闭合）。
   */
  out.push([out[0][0], out[0][1]])
  return out
}
