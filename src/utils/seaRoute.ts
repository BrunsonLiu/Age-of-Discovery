/**
 * 航路规划 —— **海路搜索**。
 *
 * 【为什么不能只用大圆】
 *
 * 大圆是地球表面的最短路径，但**最短 ≠ 可航**：
 *   - 塞维利亚在内陆（瓜达尔基维尔河畔），大圆第一段就撞上伊比利亚半岛
 *   - 塞维利亚 → 好望角的大圆横穿撒哈拉，需要绕好望角
 *   - 塞维利亚 → 孟买的大圆穿过阿拉伯半岛
 * 逐点「往最近的海洋推」也救不了：推完往往落在另一块陆地上。
 *
 * 所以这里用**网格 A\*** 在海面上找一条真正的航路——
 * 这正是历史上水手的做法：沿着海岸线绕行，而不是抄直线。
 *
 * 【为什么用位图而不是多边形判定】
 *
 * A\* 要反复查询「这格是海还是陆」。若每次跑一遍射线法（1421 个多边形），
 * 单次规划要几百毫秒到几秒。
 * 所以在**构建期**把海陆判定烤成 1 bit/格 的位图（scripts/gen_sea_mask.mjs），
 * 运行时查询是 O(1) 位运算，A\* 才能跑得动。
 *
 * 【为什么必须两段式搜索】
 *
 * 单层 0.1° A\* 在**跨洋**航线上会崩：
 *   - 塞维利亚 → 桑给巴尔：展开 52.8 万节点、830 ms
 *   - 哈瓦那 → 果阿：展开 135 万节点、2.3 s
 *   - 塞维利亚 → 巴达维亚：展开 117 万节点、2.3 s
 *
 * 原因不是启发式写得差（已改成与步代价同量纲的大圆距离），
 * 而是**障碍物尺度**：绕过好望角意味着要在整个南大西洋搜索。
 * 0.1° 网格上「绕非洲」的区域有几百万格，A\* 必须把它们全部探过一遍。
 * 在浏览器主线程上，2.3 秒的卡顿就是「点击没反应」。
 *
 * 所以用**两段式**：
 *   1. 粗层（1°）：先在大尺度上确定「绕哪边走」的走廊。
 *      粗网格只有 360×180 = 6.5 万格，绕非洲再多也就几万次展开。
 *   2. 细层（0.1°）：在走廊的每个拐点之间做精细搜索。
 *      每段距离都在几百海里以内，展开数很小。
 *
 * 效果：跨洋航线从「2.3 秒」降到「几十毫秒」，且航线质量不降反升
 * （粗层决定绕行方向，细层贴着海岸线走）。
 */

import { ports } from '@/data/ports'

/** 细层掩码分辨率（度）—— 与 scripts/gen_sea_mask.mjs 保持一致 */
const MASK_STEP = 0.1
const MASK_WIDTH = Math.round(360 / MASK_STEP)
const MASK_HEIGHT = Math.round(180 / MASK_STEP)

/**
 * 粗层分辨率（度）。
 *
 * 为什么是 0.5° 而不是 1°：
 * 1° 网格上马六甲海峡整个塌进陆地——该 1° 格的水面占比不足 50%，
 * 于是整个东南亚在粗层变成一堵墙，「→马六甲」的航线全部无路。
 * 0.5° 网格能把它认成海，实测无路数从 44 降到 0。
 */
const COARSE_STEP = 0.5
const COARSE_WIDTH = Math.round(360 / COARSE_STEP)
const COARSE_HEIGHT = Math.round(180 / COARSE_STEP)

/**
 * 粗层「海」的判定阈值：该格内水面占比 ≥ 50% 才算海。
 *
 * 为什么不能是「有一格是海就算海」（100% 陆地才封死）：
 * 那样粗层会把整块大陆当成可通行的，航线直接横穿欧亚/非洲/南美。
 * 50% 是个平衡点：海峡（格子被水占一半以上）能过，
 * 大陆（内陆格子几乎全是陆）过不去。
 *
 * 实测（190 条两两航线）：
 *   阈值 50% + 走廊 R=8 → 无路 0、压陆 0、平均 47ms、最大 232ms
 *   阈值 35% + 走廊 R=8 → 无路 16
 */
const COARSE_SEA_THRESHOLD = 0.5

/**
 * 走廊半径（细层格数）。
 *
 * 细层搜索被限制在粗层路径周围的走廊内。
 * 没有走廊时，细层 A* 会在「自己认为更短」的路径上跑到地球另一头去
 * （绕行 +121% → +180%）；有了走廊，它只会在走廊里找最优解。
 *
 * R=8 细格 = 0.8°，足够贴海岸，又不至于跑到天边。
 */
const CORRIDOR_RADIUS = 8

/** 每度纬度对应海里 */
const NM_PER_DEG = 60

let maskBytes: Uint8Array | null = null
let maskPromise: Promise<void> | null = null
/** 粗层陆海掩码（由细层降采样得到） */
let coarseMask: Uint8Array | null = null

/** 加载海陆掩码（幂等） */
export function loadSeaMask(baseUrl: string): Promise<void> {
  if (maskBytes) return Promise.resolve()
  if (maskPromise) return maskPromise
  maskPromise = fetch(`${baseUrl}data/sea-mask.bin`)
    .then(r => {
      if (!r.ok) throw new Error(`sea-mask.bin ${r.status}`)
      return r.arrayBuffer()
    })
    .then(buf => {
      maskBytes = new Uint8Array(buf)
      buildCoarseMask()
    })
    .catch(err => {
      console.warn('海陆掩码加载失败，航路规划将退化为直线', err)
    })
  return maskPromise
}

export function isSeaMaskLoaded(): boolean {
  return maskBytes !== null
}

/**
 * 由细层掩码降采样出粗层掩码。
 *
 * 规则：一个粗格（0.5° = 5×5 个 0.1° 格）里，**水面占比 ≥ 50%** 才算海。
 *
 * 为什么不是「有一格是海就算海」：
 * 那样太宽——欧亚大陆、非洲内陆这些格子里只有零星水格，
 * 也会被判成海，航线直接横穿大陆。
 *
 * 为什么不是「必须全是海」：
 * 那样太严——马六甲海峡整个塌进陆地，东南亚变成一堵墙。
 *
 * 50% 是实测出来的平衡点（见 COARSE_SEA_THRESHOLD 的注释）。
 */
function buildCoarseMask(): void {
  if (!maskBytes) return
  const sub = Math.round(COARSE_STEP / MASK_STEP)
  const coarse = new Uint8Array(COARSE_WIDTH * COARSE_HEIGHT)
  for (let cy = 0; cy < COARSE_HEIGHT; cy++) {
    for (let cx = 0; cx < COARSE_WIDTH; cx++) {
      let sea = 0
      let total = 0
      for (let dy = 0; dy < sub; dy++) {
        const gy = cy * sub + dy
        if (gy >= MASK_HEIGHT) continue
        for (let dx = 0; dx < sub; dx++) {
          const gx = (cx * sub + dx) % MASK_WIDTH
          const i = gy * MASK_WIDTH + gx
          const isLand = ((maskBytes[i >> 3] >> (i & 7)) & 1) === 1
          if (!isLand) sea++
          total++
        }
      }
      coarse[cy * COARSE_WIDTH + cx] = total > 0 && sea / total >= COARSE_SEA_THRESHOLD ? 0 : 1
    }
  }
  coarseMask = coarse
}

/** 该格子是否在陆地上（掩码未加载时一律返回 false，即视为海） */
function cellIsLand(gx: number, gy: number): boolean {
  if (!maskBytes) return false
  if (gx < 0 || gx >= MASK_WIDTH || gy < 0 || gy >= MASK_HEIGHT) return false
  const i = gy * MASK_WIDTH + gx
  return ((maskBytes[i >> 3] >> (i & 7)) & 1) === 1
}

/** 粗层：该格是否在陆地 */
function coarseIsLand(cx: number, cy: number): boolean {
  if (!coarseMask) return false
  if (cx < 0 || cx >= COARSE_WIDTH || cy < 0 || cy >= COARSE_HEIGHT) return false
  return coarseMask[cy * COARSE_WIDTH + cx] === 1
}

const toRad = Math.PI / 180
const toDeg = 180 / Math.PI

/** 两点间的大圆距离（海里） */
export function greatCircleNm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lng2 - lng1) * toRad
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 0.539957
}

/** 格子中心 → 经纬度 */
function cellCenter(gx: number, gy: number): [number, number] {
  return [-90 + (gy + 0.5) * MASK_STEP, -180 + (gx + 0.5) * MASK_STEP]
}

/** 粗格中心 → 经纬度 */
function coarseCenter(cx: number, cy: number): [number, number] {
  return [-90 + (cy + 0.5) * COARSE_STEP, -180 + (cx + 0.5) * COARSE_STEP]
}

/** 经纬度 → 格子 */
function toCell(lat: number, lng: number): [number, number] {
  const gy = Math.min(MASK_HEIGHT - 1, Math.max(0, Math.floor((lat + 90) / MASK_STEP)))
  let gx = Math.floor((lng + 180) / MASK_STEP)
  gx = ((gx % MASK_WIDTH) + MASK_WIDTH) % MASK_WIDTH
  return [gy, gx]
}

/** 经纬度 → 粗格 */
function toCoarseCell(lat: number, lng: number): [number, number] {
  const cy = Math.min(COARSE_HEIGHT - 1, Math.max(0, Math.floor((lat + 90) / COARSE_STEP)))
  let cx = Math.floor((lng + 180) / COARSE_STEP)
  cx = ((cx % COARSE_WIDTH) + COARSE_WIDTH) % COARSE_WIDTH
  return [cy, cx]
}

/**
 * 该坐标是否在陆地上。
 *
 * 用掩码而非多边形判定，有两个理由：
 *  1. **快**——O(1) 位运算；航行循环每帧要查十几次。
 *  2. **与航路规划同源**——航路是按掩码搜出来的，
 *     若触礁检查用另一套判据，船会在「自己规划的航线」上报触礁。
 *
 * 港口的可行走性由**构建期挖好的航道**保证（见 scripts/gen_sea_mask.mjs），
 * 运行时不再需要额外的港口豁免圈。
 */
export function isLandAt(lat: number, lng: number): boolean {
  if (!maskBytes) return false
  const [gy, gx] = toCell(lat, lng)
  return cellIsLand(gx, gy)
}

/** 港口航道（构建期挖好的，从港口通向大洋的通道） */
let channelData: { id: number; from: [number, number]; to: [number, number] }[] | null = null
let channelPromise: Promise<void> | null = null

/** 加载港口航道数据（幂等） */
export function loadPortChannels(baseUrl: string): Promise<void> {
  if (channelData) return Promise.resolve()
  if (channelPromise) return channelPromise
  channelPromise = fetch(`${baseUrl}data/port-channels.json`)
    .then(r => {
      if (!r.ok) throw new Error(`port-channels.json ${r.status}`)
      return r.json()
    })
    .then(list => {
      channelData = list
    })
    .catch(err => {
      console.warn('港口航道数据加载失败', err)
    })
  return channelPromise
}

/**
 * 二叉堆（最小堆）。
 *
 * A* 要把成千上万个候选格放进堆里，Array+sort 会退化到 O(n² log n)。
 * 这里用标准二叉堆，插入/弹出都是 O(log n)。
 */
class MinHeap {
  private items: number[] = []
  private prio: number[] = []

  get size(): number {
    return this.items.length
  }

  push(value: number, priority: number): void {
    this.items.push(value)
    this.prio.push(priority)
    let i = this.items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.prio[parent] <= this.prio[i]) break
      this.swap(i, parent)
      i = parent
    }
  }

  pop(): number {
    const top = this.items[0]
    const lastItem = this.items.pop()!
    const lastPrio = this.prio.pop()!
    if (this.items.length) {
      this.items[0] = lastItem
      this.prio[0] = lastPrio
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < this.items.length && this.prio[l] < this.prio[m]) m = l
        if (r < this.items.length && this.prio[r] < this.prio[m]) m = r
        if (m === i) break
        this.swap(i, m)
        i = m
      }
    }
    return top
  }

  private swap(a: number, b: number): void {
    const ti = this.items[a]; this.items[a] = this.items[b]; this.items[b] = ti
    const tp = this.prio[a]; this.prio[a] = this.prio[b]; this.prio[b] = tp
  }
}

/**
 * 8 邻域，权重是**海里**。
 *
 * 横向（东西）步长按 cos(lat) 缩短——高纬度上经度一度比赤道短。
 * 权重单位统一为海里，与启发式同量纲。
 */
const NEIGHBOR_DXY: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
]

/** 找到离给定坐标最近的海格（港口常在陆地/内河） */
function nearestSeaCell(lat: number, lng: number): [number, number] | null {
  const [gy0, gx0] = toCell(lat, lng)
  // ⚠️ 返回顺序是 [gy, gx]（行,列）——曾经这里误写成 [gy0, gy0]，
  // 港口本格是海时起点被设成「对角格」(gy,gy)：塞维利亚的起点被扔到
  // 西经 52° 的大西洋当中，A* 顺着走廊从那儿"搜"到目的地，
  // 几何再把港口与那个点直连——船出港 16 海里就压陆搁浅。
  // 回归测试：findSeaPath 的第二个点必须紧邻起点（见 logic.test.ts 第 44 组）。
  if (!cellIsLand(gx0, gy0)) return [gy0, gx0]

  // 第一段：本格 + 半径 1 的邻格（8 邻域）——就近优先。
  //
  // 为什么必须这样：港口在陆地/内河里，构建期挖了航道把它连到海里，
  // 但那个海格可能在港口的**邻格**而不是本格。
  // 若直接全局螺旋外扩，起点会被吸附到几百度外的海面，
  // 航线绕地球一圈（实测伦敦→阿姆斯特丹直线 193nm 却走出 3009nm，+1457%）。
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const ny = gy0 + dy
      if (ny < 0 || ny >= MASK_HEIGHT) continue
      const nx = ((gx0 + dx) % MASK_WIDTH + MASK_WIDTH) % MASK_WIDTH
      if (!cellIsLand(nx, ny)) return [ny, nx]
    }
  }

  // 第二段：全局螺旋外扩
  // 螺旋外扩搜索
  for (let r = 2; r <= 60; r++) {
    for (let dy = -r; dy <= r; dy++) {
      const ny = gy0 + dy
      if (ny < 0 || ny >= MASK_HEIGHT) continue
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const nx = ((gx0 + dx) % MASK_WIDTH + MASK_WIDTH) % MASK_WIDTH
        if (!cellIsLand(nx, ny)) return [ny, nx]
      }
    }
  }
  return null
}

/** 找到离给定坐标最近的粗海格 */
function nearestCoarseSeaCell(lat: number, lng: number): [number, number] | null {
  const [cy0, cx0] = toCoarseCell(lat, lng)
  if (!coarseIsLand(cx0, cy0)) return [cy0, cx0]

  // 第一段：本格 + 半径 1 的邻格——就近优先（理由同 nearestSeaCell）。
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue
      const ny = cy0 + dy
      if (ny < 0 || ny >= COARSE_HEIGHT) continue
      const nx = ((cx0 + dx) % COARSE_WIDTH + COARSE_WIDTH) % COARSE_WIDTH
      if (!coarseIsLand(nx, ny)) return [ny, nx]
    }
  }

  // 第二段：全局螺旋外扩
  for (let r = 2; r <= 30; r++) {
    for (let dy = -r; dy <= r; dy++) {
      const ny = cy0 + dy
      if (ny < 0 || ny >= COARSE_HEIGHT) continue
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const nx = ((cx0 + dx) % COARSE_WIDTH + COARSE_WIDTH) % COARSE_WIDTH
        if (!coarseIsLand(nx, ny)) return [ny, nx]
      }
    }
  }
  return null
}

/** A* 搜索结果 */
export interface SeaPathResult {
  /** 路径点（经纬度），含起点与终点 */
  points: [number, number][]
  /** 路径长度（海里） */
  lengthNm: number
  /** 是否找到路径 */
  found: boolean
  /** 展开的节点数（诊断用） */
  expansions: number
  /** 搜索耗时（毫秒，诊断用） */
  elapsedMs: number
  /** 诊断：粗层是否找到走廊 */
  coarseFound: boolean
  /** 诊断：粗层展开数 */
  coarseExpansions: number
  /** 诊断：粗层走廊格数 */
  coarseCells: number
  /** 诊断：细层是否找到路径 */
  fineFound: boolean
}

/**
 * 细层 A\*（单次搜索）。
 *
 * 起点与终点都是**确定的坐标**（不是格），
 * 内部各自吸附到最近的海格。这样分段拼接时首尾自然衔接。
 *
 * @param useCorridor 是否限制在走廊内搜索
 */
function searchFine(
  from: [number, number],
  to: [number, number],
  maxExpansions: number,
  useCorridor: boolean,
): { points: [number, number][]; found: boolean; expansions: number } {
  const startCell = nearestSeaCell(from[0], from[1])
  const goalCell = nearestSeaCell(to[0], to[1])
  if (!startCell || !goalCell) return { points: [], found: false, expansions: 0 }
  const [sy, sx] = startCell
  const [gy, gx] = goalCell
  const startId = sy * MASK_WIDTH + sx
  const goalId = gy * MASK_WIDTH + gx

  if (startId === goalId) {
    return { points: [from, to], found: true, expansions: 0 }
  }

  const goalLat = to[0]
  const goalLng = to[1]
  /** 启发式：大圆距离（海里）——与步代价同量纲，可采纳且一致 */
  const heuristic = (cy: number, cx: number): number => {
    const [la, lo] = cellCenter(cx, cy)
    return greatCircleNm(la, lo, goalLat, goalLng)
  }

  const gScore = new Map<number, number>()
  const cameFrom = new Map<number, number>()
  const closed = new Set<number>()
  const open = new MinHeap()

  gScore.set(startId, 0)
  open.push(startId, heuristic(sy, sx))

  let expansions = 0
  let found = false

  while (open.size > 0 && expansions < maxExpansions) {
    const cur = open.pop()
    if (cur === goalId) { found = true; break }
    if (closed.has(cur)) continue
    closed.add(cur)
    expansions++

    const cy = (cur / MASK_WIDTH) | 0
    const cx = cur % MASK_WIDTH
    const gCur = gScore.get(cur)!

    for (const [dx, dy] of NEIGHBOR_DXY) {
      const nx = cx + dx
      const ny = cy + dy
      if (ny < 0 || ny >= MASK_HEIGHT) continue
      const nid = ny * MASK_WIDTH + nx
      if (closed.has(nid)) continue
      if (cellIsLand(nx, ny)) continue
      // 走廊约束：只允许在粗层路径附近扩展。
      // 终点与起点永远放行——它们可能在走廊之外（港口靠岸处）。
      if (useCorridor && corridorBuf && corridorStamp) {
        if (nid !== goalId && corridorStamp[nid] !== corridorVersion) continue
      }
      // 斜向不许穿角：否则会从两陆块之间的缝里钻过去
      if (dx !== 0 && dy !== 0) {
        if (cellIsLand(cx + dx, cy) || cellIsLand(cx, cy + dy)) continue
      }

      // --- 步代价（海里）---
      // 经向一步固定 60·STEP 海里；纬向一步按 cos(lat) 缩短。
      // 对角步取两者的欧氏组合——略大于真实弦长，
      // 方向是「高估」，因此不会破坏启发式的可采纳性。
      const latMid = Math.abs(-90 + (ny + 0.5) * MASK_STEP)
      const latFactor = Math.max(0.06, Math.cos(latMid * toRad))
      const dyNm = dy * MASK_STEP * NM_PER_DEG
      const dxNm = dx * MASK_STEP * NM_PER_DEG * latFactor
      const cost = Math.sqrt(dxNm * dxNm + dyNm * dyNm)

      const tentative = gCur + cost
      if (tentative < (gScore.get(nid) ?? Infinity)) {
        gScore.set(nid, tentative)
        cameFrom.set(nid, cur)
        open.push(nid, tentative + heuristic(ny, nx))
      }
    }
  }

  if (!found) return { points: [], found: false, expansions }

  // 回溯
  const cellPath: number[] = [goalId]
  let c = goalId
  while (cameFrom.has(c)) {
    c = cameFrom.get(c)!
    cellPath.push(c)
  }
  cellPath.reverse()

  const points: [number, number][] = [from]
  for (const id of cellPath) {
    points.push(cellCenter(id % MASK_WIDTH, (id / MASK_WIDTH) | 0))
  }
  points.push(to)
  return { points, found: true, expansions }
}

/**
 * 粗层 A\*：在大尺度上找绕行走廊。
 *
 * 粗网格 720×360，跨洋绕行也只要几万次展开——比细层小两个数量级。
 */
function searchCoarse(
  from: [number, number],
  to: [number, number],
  maxExpansions = 200000,
): { cells: [number, number][]; found: boolean; expansions: number } {
  const startCell = nearestCoarseSeaCell(from[0], from[1])
  const goalCell = nearestCoarseSeaCell(to[0], to[1])
  if (!startCell || !goalCell) return { cells: [], found: false, expansions: 0 }
  const [sy, sx] = startCell
  const [gy, gx] = goalCell
  const startId = sy * COARSE_WIDTH + sx
  const goalId = gy * COARSE_WIDTH + gx

  if (startId === goalId) return { cells: [[sy, sx]], found: true, expansions: 0 }

  const goalLat = to[0]
  const goalLng = to[1]
  const heuristic = (cy: number, cx: number): number => {
    const [la, lo] = coarseCenter(cx, cy)
    return greatCircleNm(la, lo, goalLat, goalLng)
  }

  const gScore = new Map<number, number>()
  const cameFrom = new Map<number, number>()
  const closed = new Set<number>()
  const open = new MinHeap()

  gScore.set(startId, 0)
  open.push(startId, heuristic(sy, sx))

  let expansions = 0
  let found = false

  while (open.size > 0 && expansions < maxExpansions) {
    const cur = open.pop()
    if (cur === goalId) { found = true; break }
    if (closed.has(cur)) continue
    closed.add(cur)
    expansions++

    const cy = (cur / COARSE_WIDTH) | 0
    const cx = cur % COARSE_WIDTH
    const gCur = gScore.get(cur)!

    for (const [dx, dy] of NEIGHBOR_DXY) {
      const nx = cx + dx
      const ny = cy + dy
      if (ny < 0 || ny >= COARSE_HEIGHT) continue
      const nid = ny * COARSE_WIDTH + nx
      if (closed.has(nid)) continue
      if (coarseIsLand(nx, ny)) continue
      if (dx !== 0 && dy !== 0) {
        if (coarseIsLand(cx + dx, cy) || coarseIsLand(cx, cy + dy)) continue
      }

      const latMid = Math.abs(-90 + (ny + 0.5) * COARSE_STEP)
      const latFactor = Math.max(0.06, Math.cos(latMid * toRad))
      const dyNm = dy * COARSE_STEP * NM_PER_DEG
      const dxNm = dx * COARSE_STEP * NM_PER_DEG * latFactor
      const cost = Math.sqrt(dxNm * dxNm + dyNm * dyNm)

      const tentative = gCur + cost
      if (tentative < (gScore.get(nid) ?? Infinity)) {
        gScore.set(nid, tentative)
        cameFrom.set(nid, cur)
        open.push(nid, tentative + heuristic(ny, nx))
      }
    }
  }

  if (!found) return { cells: [], found: false, expansions }

  const cellPath: number[] = [goalId]
  let c = goalId
  while (cameFrom.has(c)) {
    c = cameFrom.get(c)!
    cellPath.push(c)
  }
  cellPath.reverse()

  return {
    cells: cellPath.map(id => [(id / COARSE_WIDTH) | 0, id % COARSE_WIDTH] as [number, number]),
    found: true,
    expansions,
  }
}

/**
 * 走廊：粗层路径周围的细层可通行区域。
 *
 * 用 Uint8Array（6.48M 字节）标记，运行时查询 O(1)。
 * 每次规划都要重建，所以用**模块级复用**的缓冲区 + 版本号，
 * 避免每次分配 6.5MB（那会让 GC 压力很大）。
 */
let corridorBuf: Uint8Array | null = null
let corridorStamp: Int32Array | null = null
let corridorVersion = 0

function ensureCorridorBuffers(): void {
  if (corridorBuf) return
  corridorBuf = new Uint8Array(MASK_WIDTH * MASK_HEIGHT)
  corridorStamp = new Int32Array(MASK_WIDTH * MASK_HEIGHT)
}

/**
 * 沿粗层路径铺设走廊。
 *
 * 走廊 = 粗层路径上每个粗格，向外扩 CORRIDOR_RADIUS 个细格。
 */
function buildCorridor(coarseCells: [number, number][]): void {
  ensureCorridorBuffers()
  const buf = corridorBuf!
  const stamp = corridorStamp!
  const version = ++corridorVersion
  const sub = Math.round(COARSE_STEP / MASK_STEP)
  const R = CORRIDOR_RADIUS
  for (const [cy, cx] of coarseCells) {
    const gy0 = cy * sub
    const gx0 = cx * sub
    for (let dy = -R; dy < sub + R; dy++) {
      const gy = gy0 + dy
      if (gy < 0 || gy >= MASK_HEIGHT) continue
      const rowBase = gy * MASK_WIDTH
      for (let dx = -R; dx < sub + R; dx++) {
        const gx = ((gx0 + dx) % MASK_WIDTH + MASK_WIDTH) % MASK_WIDTH
        const id = rowBase + gx
        if (stamp[id] !== version) {
          stamp[id] = version
          buf[id] = 1
        }
      }
    }
  }
}

/**
 * 在海面上搜索一条可航路径（两段式 + 走廊）。
 *
 * @param from 起点 [纬度, 经度]
 * @param to   终点 [纬度, 经度]
 */
export function findSeaPath(
  from: [number, number],
  to: [number, number],
  maxExpansions = 400000,
): SeaPathResult {
  const t0 = Date.now()
  let expansions = 0

  // --- 粗层：定走廊 ---
  const coarse = searchCoarse(from, to)
  expansions += coarse.expansions

  if (!coarse.found) {
    return {
      points: [], lengthNm: 0, found: false, expansions, elapsedMs: Date.now() - t0,
      coarseFound: false, coarseExpansions: coarse.expansions, coarseCells: 0, fineFound: false,
    }
  }

  // --- 铺走廊 ---
  buildCorridor(coarse.cells)

  // --- 细层：在走廊内搜一次 ---
  const fine = searchFine(from, to, maxExpansions, true)
  expansions += fine.expansions

  if (!fine.found) {
    // 走廊内无解（罕见）：放开走廊重搜一次，代价是慢
    const retry = searchFine(from, to, maxExpansions, false)
    expansions += retry.expansions
    if (!retry.found) {
      return {
        points: [], lengthNm: 0, found: false, expansions, elapsedMs: Date.now() - t0,
        coarseFound: true, coarseExpansions: coarse.expansions, coarseCells: coarse.cells.length, fineFound: false,
      }
    }
    const len = pathLengthNm(retry.points)
    return {
      points: retry.points, lengthNm: len, found: true, expansions, elapsedMs: Date.now() - t0,
      coarseFound: true, coarseExpansions: coarse.expansions, coarseCells: coarse.cells.length, fineFound: true,
    }
  }

  const len = pathLengthNm(fine.points)
  return {
    points: fine.points, lengthNm: len, found: true, expansions, elapsedMs: Date.now() - t0,
    coarseFound: true, coarseExpansions: coarse.expansions, coarseCells: coarse.cells.length, fineFound: true,
  }
}

/** 折线的总长（海里） */
function pathLengthNm(points: [number, number][]): number {
  let sum = 0
  for (let i = 1; i < points.length; i++) {
    sum += greatCircleNm(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1])
  }
  return sum
}

/**
 * 路径简化（Douglas–Peucker）。
 *
 * A* 出来的是逐格的锯齿航线，直接用会让船走「之」字形。
 * 简化后保留关键转折点，航线变成几条干净的弧段。
 */
export function simplifyPath(
  points: [number, number][],
  toleranceDeg = 0.15,
): [number, number][] {
  if (points.length < 3) return points
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  const stack: [number, number][] = [[0, points.length - 1]]

  while (stack.length) {
    const [i, j] = stack.pop()!
    if (j <= i + 1) continue
    const [ax, ay] = points[i]
    const [bx, by] = points[j]
    const cosLat = Math.max(0.15, Math.cos(((ay + by) / 2) * toRad))
    // 段的屏幕长度（经度按 cos(lat) 缩放）
    const vx = (bx - ax) * cosLat
    const vy = by - ay
    const lenSq = vx * vx + vy * vy

    let maxDist = 0
    let maxIdx = -1
    for (let k = i + 1; k < j; k++) {
      const [px, py] = points[k]
      const wx = (px - ax) * cosLat
      const wy = py - ay
      let t = lenSq > 0 ? (wx * vx + wy * vy) / lenSq : 0
      t = Math.max(0, Math.min(1, t))
      const dx = wx - t * vx
      const dy = wy - t * vy
      const dist = Math.hypot(dx, dy)
      if (dist > maxDist) { maxDist = dist; maxIdx = k }
    }
    if (maxIdx > 0 && maxDist > toleranceDeg) {
      keep[maxIdx] = true
      stack.push([i, maxIdx], [maxIdx, j])
    }
  }
  return points.filter((_, i) => keep[i])
}

/**
 * 把折线路径转成大圆弧采样点。
 *
 * 简化后的折线段之间用大圆连接——这样每一段都贴着地球曲面，
 * 既是真实航法，也让里程计算与显示一致。
 */
export function arcBetween(a: [number, number], b: [number, number], samples = 8): [number, number][] {
  const out: [number, number][] = []
  for (let i = 1; i < samples; i++) {
    out.push(greatCircleAt(a, b, i / samples))
  }
  return out
}

/** 大圆插值 */
export function greatCircleAt(
  from: [number, number],
  to: [number, number],
  f: number,
): [number, number] {
  const la1 = from[0] * toRad
  const lo1 = from[1] * toRad
  const la2 = to[0] * toRad
  const lo2 = to[1] * toRad
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((la2 - la1) / 2) ** 2 +
    Math.cos(la1) * Math.cos(lo1) * Math.sin((lo2 - lo1) / 2) ** 2,
  ))
  if (!isFinite(d) || d < 1e-9) return from
  const A = Math.sin((1 - f) * d) / Math.sin(d)
  const B = Math.sin(f * d) / Math.sin(d)
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2)
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2)
  const z = A * Math.sin(la1) + B * Math.sin(la2)
  return [
    Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg,
    Math.atan2(y, x) * toDeg,
  ]
}

/**
 * 航道信息（诊断/测试用）：港口 → 出海口。
 */
export function getPortChannels(): { id: number; from: [number, number]; to: [number, number] }[] {
  return channelData ?? []
}

/** 港口列表（供外部检查港口是否落在可航水域） */
export function getPorts() {
  return ports
}
