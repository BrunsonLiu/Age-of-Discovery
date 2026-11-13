/**
 * 程序化地形符号：给大块陆地撒「山丘 / 树丛」，模仿古地图的画法。
 *
 * ## 为什么不在数据里写死地形
 * 参考图那种山脉、森林、沙漠是**手绘世界底图**的一部分，我们没有那张图。
 * 但古地图本来就不用写实地形——它用符号：一簇三角形表示山脉，几个小圆锥表示
 * 林地。这套画法跟我们的羊皮纸底子是一路的，而且**可以由程序生成**。
 *
 * ## 为什么只给大块陆地撒
 * land.geojson 有 1420 个多边形，绝大多数是几公里的小岛。给小岛撒符号既没有
 * 信息量，还会把 2000+ 个 DOM 节点压进地图。所以按 bbox 面积排序取前 N 块，
 * 小岛一个不撒。
 *
 * ## 为什么符号是固定像素大小（用 divIcon 而不是多边形）
 * 用地理坐标画三角形，缩到 zoom 2 会退化成一条线、放到 zoom 8 又会撑满屏幕。
 * 固定像素的符号在整条缩放范围里都稳定可读，代价是它不"贴"在地面上——
 * 对地形标识来说这个代价可以接受（港口标记也是这么做的）。
 *
 * ## 为什么用固定种子
 * 每次渲染随机撒点的话，切一下视图山就全挪位置了。mulberry32 + 固定 seed
 * 保证同一个多边形永远撒在同一处。
 */

export type TerrainKind = 'peak' | 'tree'

/**
 * 雪线：|纬度| ≥ 48° 才画雪顶。
 *
 * 【为什么这条要抽出来】原来绘制层是**无条件**给每座山画雪帽的，
 * 于是撒哈拉、阿拉伯、印度的山尖上全是一撮白——5 倍放大下一眼能看见，
 * 而且是事实错误（热带石灰岩山不会有永久积雪），不只是不好看。
 * 抽成纯函数是为了能单测：绘制层在 canvas 里，断言不到像素级的"有没有雪"。
 */
/**
 * 每个缩放级别画到哪一档 rank。**拉远稀、拉近密**。
 *
 * 【为什么需要它】符号是"1.1° 一格"撒出来的，屏幕上的间距 = 步长 × 该缩放的
 * 像素/度。zoom 2 时一屏能装下几千格，全画会糊成一片；zoom 6 时格子被拉开，
 * 不画就只剩十几座山。所以按 rank（0~1 的随机值）过滤，而且是**嵌套**的：
 * 阈值单调不减 → 拉近之后原地那些符号还在，只是周围多了新的，山不会跟着跳。
 *
 * 【数值怎么定的】总符号约 5000 个。低缩放那几档乘了 0.26 的系数，
 * 让"画出来的数量"和步长还是 2.2° 时保持一致（曾经 0.18/0.30/0.48/0.68）；
 * zoom 6 起才把多出来的密度放出来（0.45 → 0.72 → 1.0）。
 */
const RANK_TABLE: Record<number, number> = {
  1: 0.04, 2: 0.05, 3: 0.08, 4: 0.13, 5: 0.19,
  6: 0.45, 7: 0.72, 8: 1, 9: 1, 10: 1,
}

export function rankMaxForZoom(z: number): number {
  if (!Number.isFinite(z)) return 1
  const clamped = Math.max(1, Math.min(10, Math.round(z)))
  return RANK_TABLE[clamped] ?? 1
}

export const SNOW_LAT = 48

export function hasSnow(latDeg: number): boolean {
  return Math.abs(latDeg) >= SNOW_LAT
}

export interface TerrainSymbol {
  lat: number
  lng: number
  kind: TerrainKind
  /** 局部缩放（0.8~1.25），让符号大小不整齐划一 */
  scale: number
  /**
   * 0~1 的稳定随机值，供绘制层做 zoom 分级：
   * 拉远只画 rank 小的那一部分，符号位置不变、只是稀一些。
   * 没有它就只能按数量截断，而数组顺序是按纬度排的 —— 一截就截掉整个高纬。
   */
  rank: number
}

interface Ring { pts: [number, number][]; bbox: BBox }
interface BBox { minLng: number; maxLng: number; minLat: number; maxLat: number }

function bboxOf(pts: [number, number][]): BBox {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity
  for (const [lng, lat] of pts) {
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
  }
  return { minLng, maxLng, minLat, maxLat }
}

/**
 * 射线法（**参照实现**）。经度相同的边跳过（分母为 0，那种边不产生穿越）。
 *
 * 运行时走 `pointInRingBanded`（同语义、快几十倍）。这一份留在导出里是给单测
 * 当**参照物**的：两条路径必须对同一个点多边形给出完全一样的答案，
 * 否则地图上的山会挪位置 —— 那是历史上踩过两次的坑。
 */
export function pointInRingNaive(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const lngI = ring[i][0], latI = ring[i][1]
    const lngJ = ring[j][0], latJ = ring[j][1]
    if (lngI === lngJ) continue
    const hit = (lngI > lng) !== (lngJ > lng) &&
      lat < ((latJ - latI) * (lng - lngI)) / (lngJ - lngI) + latI
    if (hit) inside = !inside
  }
  return inside
}

/**
 * 环的**经度分带**索引：把每条边按它跨越的经度区间放进桶里。
 *
 * 【为什么要这个】射线法对每个查询点都要遍历**整圈**顶点。欧亚那块海岸线上千个
 * 顶点，而撒点是"每个候选格 5 次查询（含 4 个内缩点）"—— 实测 `pointInRing`
 * 占冷启动主线程 **39%**（2048ms），全花在这上面。
 *
 * 【分带要分在哪个轴上，是由判据决定的】这里的射线法判的是
 * `(x1 > lng) !== (x2 > lng)` —— 射线**沿经线**（固定经度、向南北打）。
 * 所以一次查询真正可能穿过的，只有"经度区间盖住这个点"的那些边；
 * 两端都在同侧的边恒不计数。**按经度分桶**才对（第一版按纬度分了，
 * 正方形大陆直接撒出 0 个符号 —— 单测当场抓到）。
 * 分桶后每次查询从上千条降到几十条，**输出逐位相同**。
 */
export interface RingIndex {
  minLng: number
  bandH: number
  bandCount: number
  /** 边 i 的四个端点分量在 edges 里的偏移是 4*i */
  edges: Float64Array
  /** 每个桶里的边索引（紧凑存储 + 前缀和） */
  bucketStart: Int32Array
  bucketEdges: Int32Array
}

/**
 * 顶点数组 → 索引。顶点数组是不可变数据，用 WeakMap 缓存，同一块陆地只建一次
 * （同一块陆地在一个会话里会被查询上万次，建索引的 O(n) 完全可以摊掉）。
 */
const ringIndexCache = new WeakMap<readonly [number, number][], RingIndex>()

export function ringIndexForTest(pts: readonly [number, number][]): RingIndex {
  return ringIndex(pts as [number, number][])
}

function ringIndex(pts: readonly [number, number][]): RingIndex {
  const hit = ringIndexCache.get(pts)
  if (hit) return hit
  const n = pts.length
  const edges = new Float64Array(n * 4)
  const b = bboxOf(pts as [number, number][])
  /*
   * 桶数按纬度跨度取 32~128：跨度小的岛（1°）用 32 个桶就等于不用，跨度大的
   * 大陆（100°+）用 128 个桶才把"每桶边数"压到几十。桶太多反而让建索引变贵。
   */
  const span = Math.max(1e-6, b.maxLng - b.minLng)
  const bandCount = Math.max(4, Math.min(128, Math.round(span)))
  const bandH = span / bandCount

  // 每桶计数 → 前缀和 → 填充（计数排序，避免每个桶一个数组带来的分配）
  const counts = new Int32Array(bandCount + 1)
  const lo = new Float64Array(n)
  const hi = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const j = (i + n - 1) % n
    const x1 = pts[j][0], y1 = pts[j][1], x2 = pts[i][0], y2 = pts[i][1]
    edges[4 * i] = x1; edges[4 * i + 1] = y1; edges[4 * i + 2] = x2; edges[4 * i + 3] = y2
    // 按**经度**区间分桶（射线沿经线打，见上方说明）
    const a = Math.min(x1, x2), z = Math.max(x1, x2)
    lo[i] = a; hi[i] = z
    let b0 = Math.floor((a - b.minLng) / bandH)
    let b1 = Math.floor((z - b.minLng) / bandH)
    if (b0 < 0) b0 = 0
    if (b1 >= bandCount) b1 = bandCount - 1
    // 两端相等的退化边（水平边）只放一个桶
    if (b1 < b0) b1 = b0
    for (let k = b0; k <= b1; k++) counts[k]++
  }
  const bucketStart = new Int32Array(bandCount + 1)
  for (let k = 0; k < bandCount; k++) bucketStart[k + 1] = bucketStart[k] + counts[k]
  const cursor = Int32Array.from(bucketStart)
  const bucketEdges = new Int32Array(bucketStart[bandCount])
  for (let i = 0; i < n; i++) {
    let b0 = Math.floor((lo[i] - b.minLng) / bandH)
    let b1 = Math.floor((hi[i] - b.minLng) / bandH)
    if (b0 < 0) b0 = 0
    if (b1 >= bandCount) b1 = bandCount - 1
    if (b1 < b0) b1 = b0
    for (let k = b0; k <= b1; k++) bucketEdges[cursor[k]++] = i
  }
  const idx: RingIndex = { minLng: b.minLng, bandH, bandCount, edges, bucketStart, bucketEdges }
  ringIndexCache.set(pts, idx)
  return idx
}

/**
 * 与 `pointInRing` **语义完全相同**的分带版本。
 *
 * 【为什么保留朴素版】`landCheck.ts` 有自己的实现；这里的分带版只在撒点路径用。
 * 两份算法必须给出同一个答案 —— 单测拿真实多边形逐点对比过。
 */
export function pointInRingBanded(lat: number, lng: number, pts: readonly [number, number][]): boolean {
  const idx = ringIndex(pts)
  let band = Math.floor((lng - idx.minLng) / idx.bandH)
  if (band < 0) band = 0
  if (band >= idx.bandCount) band = idx.bandCount - 1
  const e = idx.edges
  const from = idx.bucketStart[band]
  const to = idx.bucketStart[band + 1]
  let inside = false
  for (let q = from; q < to; q++) {
    const i = idx.bucketEdges[q]
    const x1 = e[4 * i], y1 = e[4 * i + 1], x2 = e[4 * i + 2], y2 = e[4 * i + 3]
    /*
     * 与朴素版**逐字对齐**：经度相同的边跳过（分母为 0）；比的是两个端点的
     * **经度**是否跨过查询点的经线，再插值出交点的纬度、看它是否在查询点北边。
     *
     * 【这里踩过一次】我先把它写成了教科书里的"水平射线"版本
     * （比 `y > lat`、插值 lng），跟参照实现的轴**不一样** —— 于是真实海岸线上
     * 有 3 个点 naive 说在内、分带说在外。分带只负责减少候选边，判据一个字都不能改。
     */
    if (x1 === x2) continue
    if ((x1 > lng) !== (x2 > lng) && lat < ((y2 - y1) * (lng - x1)) / (x2 - x1) + y1) inside = !inside
  }
  return inside
}

/** 点是否落在环的包围盒内（含边界）。**纯剪枝**：盒外必定不在环内。 */
function inBBox(lat: number, lng: number, r: Ring): boolean {
  const b = r.bbox
  return lng >= b.minLng && lng <= b.maxLng && lat >= b.minLat && lat <= b.maxLat
}

/**
 * 外环内、且不在任何内环（湖泊/岛屿）里。
 *
 * 【为什么每个内环都要先判包围盒】这是一处**纯剪枝**，输出完全不变，
 * 但省掉了大量无用功：欧亚那块陆地带着几十上百个内环（湖、内陆海、飞地），
 * 而每个候选点原本要对**每一个**内环跑一遍全量射线法（几千个顶点）。
 * 一个候选点 5 次调用（含 4 个内缩点）× 上百个内环 × 上千顶点 = 千万级。
 * 实测这一处占冷启动主线程时间的 46%（`pointInRings` 自时间）。
 *
 * 包围盒判定是精确的：点不在盒内，就绝不可能在环内 —— 不会改变任何一个符号。
 */
function pointInRings(lat: number, lng: number, rings: Ring[]): boolean {
  if (!rings.length) return false
  if (!inBBox(lat, lng, rings[0])) return false
  if (!pointInRingBanded(lat, lng, rings[0].pts)) return false
  for (let i = 1; i < rings.length; i++) {
    // 先盒后环：绝大多数内环在一个小盒子里，一步就跳出
    if (!inBBox(lat, lng, rings[i])) continue
    if (pointInRingBanded(lat, lng, rings[i].pts)) return false
  }
  return true
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 由整数格坐标直接算出 0~1 的稳定随机值（不消耗 rand 序列）。
 *
 * 【为什么不直接用 rand()】
 * 团簇判断要按"粗格"取值，而粗格里每个细格都会各查一次——用 rand() 就等于
 * 每次查询都推进序列，一旦某处条件分支变化（比如 inset 过滤掉一个点），
 * 后面所有符号的位置都会整体错位，山会"整片跳走"。
 * 用格坐标哈希则与遍历顺序、与别处消耗多少随机数都无关：
 * 同一个粗格永远得到同一个值，加不加团簇都不影响已有符号的坐标。
 */
function hashCell(x: number, y: number, seed: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ (seed | 0)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function extractRings(geojson: GeoJSON.GeoJsonObject): Ring[][] {
  const out: Ring[][] = []
  const pushPoly = (coords: [number, number][][]) => {
    const rings = coords.map(pts => ({ pts, bbox: bboxOf(pts) }))
    if (rings.length) out.push(rings)
  }
  const walk = (g: GeoJSON.Geometry | null | undefined) => {
    if (!g) return
    if (g.type === 'Polygon') pushPoly(g.coordinates as [number, number][][])
    else if (g.type === 'MultiPolygon') {
      for (const p of g.coordinates) pushPoly(p as [number, number][][])
    }
  }
  if (geojson.type === 'FeatureCollection') {
    (geojson as GeoJSON.FeatureCollection).features.forEach(f => walk(f.geometry))
  } else if (geojson.type === 'Feature') {
    walk((geojson as GeoJSON.Feature).geometry)
  } else {
    walk(geojson as GeoJSON.Geometry)
  }
  return out
}

export interface BuildTerrainOptions {
  /** 只给面积最大的前 N 块陆地撒（默认 14） */
  topBlocks?: number
  /** 网格步长（度）。越小越密，直接决定"每 2 度左右一个符号"的观感 */
  stepDeg?: number
  /** 总点数上限，防止极端数据把内存撑爆 */
  maxSymbols?: number
  /**
   * 海岸 inset 系数（相对 stepDeg，默认 0.16）：
   * 符号离海岸至少 stepDeg × 该系数的距离，否则会压在海岸描边上。
   * 暴露成参数是为了测试能做敏感度断言——系数变大时符号数必须变少。
   */
  insetMul?: number
  /**
   * 团簇强度 0~1（默认 1）：让山脉成簇、平原留白，而不是均匀铺满。
   * 0 = 退回"等距麻点"的旧观感——留这个口子是为了能做 A/B，
   * 也为了测试在"必须按格数精确断言"时可以关掉这个随机因素。
   */
  clusterStrength?: number
  /**
   * 高程采样器（返回 0~1 相对高度，采样不到返回负数）。
   *
   * 【为什么要有】原来 `kind` 是纯随机的：`rand() < 0.62 ? 'peak' : 'tree'`。
   * 结果**撒哈拉、亚马逊、西伯利亚低地里都长着山**，而阿特拉斯、阿尔卑斯、
   * 安第斯这些真山脉的符号密度和别处一样。地图上的地形符号和真实地形无关，
   * 那它就只是装饰，而且是会说谎的装饰。
   *
   * 注入成参数而不是在函数里读图片：这样纯逻辑仍可单测
   * （测试传一个假的采样器，断言"高地出山、平地不出山"）。
   * 不传时行为与旧版完全一致（退回纯随机）。
   */
  elevationAt?: (lat: number, lng: number) => number
  seed?: number
}

/**
 * "高峰"的最低相对高度（归一化亮度，在格内取 ±0.5° 最大值之后实测）：
 *   阿尔卑斯 0.11~0.37 ／ 安第斯 0.57 ／ 喜马拉雅 0.66
 *   撒哈拉腹地 0.10 ／ 法国平原 0.04
 *
 * 取 0.12 是**保守**的选择：它只保证"法国平原、撒哈拉腹地不会长出山"，
 * 不承诺"阿尔卑斯一定有山"——因为这份高程图在 1.1° 的格子里分不开
 * 阿尔卑斯山谷（0.106）和撒哈拉腹地（0.102）。要让山脉走向真的对上，
 * 需要更细的高程数据，不是调阈值能解决的。
 */
export const PEAK_MIN_ELEV = 0.12

/**
 * 副热带干旱带的纬度范围（绝对值，度）。这一带不出树 —— 见撒点循环里那段说明。
 *
 * 15°~35°：撒哈拉（20~30）、阿拉伯（15~30）、伊朗（25~35）、澳洲内陆（20~30）、
 * 阿塔卡马（20~25）都在里面；刚果（0~10）、亚马逊（0~10）、西伯利亚（55+）在外面。
 * 已知误伤：中国江南、日本南部、美国南部、印度北部同在这一带，会跟着变秃。
 */
export const ARID_BAND: readonly [number, number] = [15, 35]

/**
 * 生成地形符号。
 *
 * 【为什么用「固定地理步长」而不是「每块按面积分摊固定数量」】
 * 第一版是后者：`count = 面积 × 系数`，然后把 count 个点均匀撒在这块的 bbox 里。
 * 结果在真实数据上出了个大问题——**欧亚非是同一块要素**
 * （bbox 经度 -18~180、纬度 -35~78，10297 个顶点，面积 22226 度²）。
 * 378 个点摊到 22226 度² 上，间距就是 7.7 度。于是玩家在伊比利亚半岛
 * （约 12×8 度）看到的符号数量是……4 个。
 * 换句话说：**大陆越大，局部越空**。这跟"地形要铺满"的目标完全相反。
 *
 * 改成固定步长后，密度只跟地理空间有关、与"这块陆地多大"无关：
 * 每个 STEP×STEP 的格子最多撒一个符号，落在陆地上的留下。
 * 欧亚非因此自动获得 198/2.2 × 113/2.2 ≈ 4600 个候选格子。
 *
 * 【rank 是给绘制层做 zoom 分级用的】
 * 每个符号带一个 0~1 的 rank，绘制时按当前 zoom 决定阈值：
 * 拉远只画 rank 小的（稀疏，不糊成一团），拉近全画（有细节）。
 * 关键是**符号位置固定**——低 zoom 画的那批，在高 zoom 里仍在原处，
 * 只是周围多了新符号，不会出现"山跟着跳"。
 *
 * 【为什么步长在经度方向要按纬度补偿】
 * 同样的 2.2 度经度，在赤道是 245km，在 60°N 只有 122km。不补偿的话
 * 高纬会挤成两倍密。按 1/cos(lat) 放大经度步长，让地面距离大致一致。
 */
/**
 * 山峰符号的「山脊」判据（3D 用）。
 *
 * 【为什么不能只用绝对高程】实测这份 2048×1024 高程图**分不开沙漠与低山**：
 * 撒哈拉腹地中位 0.114、p90 0.231，阿尔卑斯中位 0.298 —— 区间重叠。
 * 绝对阈值 0.25 的命中率是：阿尔卑斯 79%／落基山 82%／喜马拉雅 94%，
 * 但**伊比利亚只有 2%**（那里真有条系统山），地中海一带反而最空。
 *
 * 【改成「比邻域高」就对上了】山脊的定义本来就是相对高度。取 8 个方向
 * 1.5° 邻域的**均值**，本站点高出它 0.02 即算山脊，再加 0.18 的绝对下限。
 * 实测命中率（采样网格 0.4°）：
 *   阿尔卑斯 88% ／ 安第斯 60% ／ 喜马拉雅 57% ／ 伊比利亚 39%
 *   阿特拉斯 43% ／ 落基山 48% ／ 戈壁 23% ／ 撒哈拉腹地 19%
 *   法国平原 0% ／ 亚马逊 0% ／ 澳洲内陆 0% ／ 东欧平原 0%
 * 也就是：**平原一个不出、真山脉密集、沙漠只剩岩台**（撒哈拉确实有
 * 提贝斯提、阿哈加尔、塔西里这些高块，19% 比任何真山脉都低）。
 *
 * 【为什么用均值而不是"高于邻域最大值"】后者看着更严，实测方向是反的：
 * 高程图经过 ±3 texel 取最大值的平滑，邻域最大值几乎总比本站点高一点，
 * 于是阿尔卑斯只剩 27%、落基山 3% —— 真山反而被删光。
 * 而"等于邻域均值"这种平坦高原会被自然排除（差值 0 < 0.02）。
 *
 * 抽成纯函数：预处理，可单测；也避免把判据埋进 useEffect。
 * 非 peak 的符号**原样保留**（树仍交给 2D；3D 侧在调用处只取 peak）。
 */
export const RIDGE_MIN_ELEV = 0.18
/** 邻域半径（度）。1.5° ≈ 符号间距，正好是"比周围一圈高" */
export const RIDGE_RADIUS_DEG = 1.5
/** 高出邻域均值多少算山脊。0.02 是实测：再小则高原也过关，再大则真山被删 */
export const RIDGE_DELTA = 0.02

export function filterPeaksByElevation(
  symbols: TerrainSymbol[],
  elev: ((lat: number, lng: number) => number) | null | undefined,
  minElev: number = RIDGE_MIN_ELEV,
  ridgeDelta: number = RIDGE_DELTA,
): TerrainSymbol[] {
  if (!elev) return symbols
  const D = RIDGE_RADIUS_DEG
  return symbols.filter(s => {
    if (s.kind !== 'peak') return true
    const v = elev(s.lat, s.lng)
    // 采样失败（负数）时保留：宁可多一座山，也不要因为图没加载好让地形整片消失
    if (v < 0) return true
    if (v < minElev) return false
    // 经度方向的步长要按纬度补偿，否则高纬的邻域会窄一半
    const dLng = D / Math.max(0.25, Math.cos((s.lat * Math.PI) / 180))
    let sum = 0
    for (const [dla, dln] of [
      [D, 0], [-D, 0], [0, D], [0, -D],
      [D, D], [D, -D], [-D, D], [-D, -D],
    ] as const) {
      const n = elev(s.lat + dla, s.lng + dln * dLng)
      // 邻域采样失败时按"很低"处理：只会让这座山更容易留下
      sum += n < 0 ? 0 : n
    }
    return v >= sum / 8 + ridgeDelta
  })
}

/**
 * 分批版：撒点的计算量按**行**切开，调用方每片只跑一小会儿。
 *
 * 【为什么要切】实测切到 3D 海图时，这一个函数在主线程上**连续跑 868ms**
 * （`pointInRings` 自时间，Intel UHD 630 那台机器）。它每个候选格要做 5 次
 * 多边形内外判断，每次都要遍历一整圈海岸线（欧亚那块有上千个顶点）；
 * 一次切 14 块大陆、步长 1.1°，总量就是千万级的循环。
 *
 * 冻 0.87 秒和"分 30 片、每片 30ms"在总耗时上一模一样，但后者玩家感觉不到：
 * 3D 海图先出来，山与树在接下来半秒里陆续补上（符号是装饰，晚到不影响可读）。
 *
 * 【为什么用生成器而不是回调】同步入口 `buildTerrainSymbols` 直接把它抽干，
 * 两条路径跑的是**同一份代码**——切分不会让 2D 与 3D 的符号位置跑偏。
 * 每个 yield 都在"一行格子跑完"之后，`rand` 的消耗顺序完全不变。
 */
export function* buildTerrainSymbolsChunked(
  geojson: GeoJSON.GeoJsonObject,
  opts: BuildTerrainOptions = {},
): Generator<void, TerrainSymbol[], void> {
  const topBlocks = opts.topBlocks ?? 14
  /*
   * 撒点步长。2.2° → 1.1°：**近景陆地不再空**。
   *
   * 【为什么改】符在屏幕上的间距 = 步长 × 当前缩放的像素/度。2.2° 在 zoom 6
   * 下约 100px，而符号本身只有 26px 宽——伊比利亚整块内陆只剩十来座山，
   * 放大之后反而更空。步长减半 → 全局符号数 ×4（约 5200 个），
   * 低缩放由 rank 阈值筛掉大部分（见 rankMaxForZoom），观感不变；
   * 高缩放才把多出来的那几层放出来。
   */
  const stepDeg = opts.stepDeg ?? 1.1
  const maxSymbols = opts.maxSymbols ?? 26000
  /*
   * 离岸内缩：采样点必须离海岸有这么远，否则不出符号。
   *
   * 【为什么从 0.16 提到 0.3】符号是**屏幕固定像素**（约 26px 宽），
   * 而内缩是按度数算的。0.16 × 2.2° ≈ 0.35°，在 zoom 4 下只有 ~4px，
   * 远小于符号的半宽 13px —— 海岸边的山会把一只角伸进海里。
   * 提到 0.3（≈0.66°，zoom 4 下约 7px）能削减一半的溢出。
   * 步长改成 1.1° 之后系数同步翻倍到 0.6 —— 内缩是"步长 × 系数"，
   * 不跟着改的话实际内缩会缩回 0.33°，海岸溢出又回来了。
   *
   * 【为什么没有提到 0.5】试过：0.5 = 1.1°，挪威那种窄半岛上**一个符号都不剩了**
   * （实测整个斯堪的纳维亚北端变空白）。海岸线附近的符号比偶尔一只角伸进海里
   * 重要得多，所以折回 0.3。
   *
   * 这是近似不是根治：根治要把符号裁剪到陆地多边形里，得每帧重建 1400+
   * 个多边形的 Path2D，代价远大于收益。
   */
  const insetMul = opts.insetMul ?? 0.6
  /** 团簇：0 = 均匀铺满（旧观感），1 = 极端起伏。见下方 CLUSTER 注释 */
  const clusterStrength = opts.clusterStrength ?? 1
  const elevationAt = opts.elevationAt
  const rand = mulberry32(opts.seed ?? 20261030)

  const polys = extractRings(geojson)
  if (!polys.length) return []

  // 按 bbox 面积排序——bbox 面积不等于真实面积，但用来排"哪些是大陆"足够
  const scored = polys
    .map(rings => {
      const b = rings[0].bbox
      return { rings, area: (b.maxLng - b.minLng) * (b.maxLat - b.minLat) }
    })
    .sort((a, b) => b.area - a.area)
    .slice(0, topBlocks)

  const out: TerrainSymbol[] = []

  for (const { rings } of scored) {
    const b = rings[0].bbox
    const wDeg = b.maxLng - b.minLng
    const hDeg = b.maxLat - b.minLat
    if (wDeg <= 0 || hDeg <= 0) continue

    // 纬度跨度大于 3 度时逐行补偿经度步长（见上方注释）
    const latRows = Math.max(1, Math.ceil(hDeg / stepDeg))

    for (let r = 0; r < latRows; r++) {
      const rowLat = b.minLat + (r + 0.5) * (hDeg / latRows)
      const cos = Math.max(0.25, Math.cos((rowLat * Math.PI) / 180))
      const lngStep = stepDeg / cos
      const lngCols = Math.max(1, Math.round(wDeg / lngStep))

      for (let c = 0; c < lngCols; c++) {
        if (out.length >= maxSymbols) break
        // 格内抖动：纯网格会排成阵列，抖动半个格子才自然
        const lng = b.minLng + (c + 0.25 + rand() * 0.5) * (wDeg / lngCols)
        const lat = b.minLat + (r + 0.25 + rand() * 0.5) * (hDeg / latRows)
        const rank = rand()
        if (!pointInRings(lat, lng, rings)) continue

        // 海岸附近不撒：贴着海岸线的符号会压到海面上去。
        // 只查左右/上下各一小步，等价于"离边界至少 inset 度"。
        const inset = stepDeg * insetMul
        if (!pointInRings(lat + inset, lng, rings) || !pointInRings(lat - inset, lng, rings)
          || !pointInRings(lat, lng + inset, rings) || !pointInRings(lat, lng - inset, rings)) continue

        /*
         * 【随机数消耗必须先于任何"可能 continue"的判断】
         *
         * kind 的 rand() 原本写在团簇判断之后。团簇会 continue 掉一批点，
         * 被 continue 的点就不消耗那一次 rand() → 后面的 rand 序列整体错位
         * → 保留下来的山虽然"位置公式一样"，实测却有 2/3 挪到了别处
         * （单测「团簇只能择掉符号、不能挪动位置」抓到）。
         *
         * 所以先无条件决定 kind，再做团簇取舍。丢弃一点计算，换"地形不跳位"。
         */
        // 高纬度出雪峰，其余按 2:1 混山与树
        const snowy = Math.abs(lat) > 55
        let kind: TerrainKind = snowy ? 'peak' : (rand() < 0.62 ? 'peak' : 'tree')
        const scale = 0.8 + rand() * 0.45

        /*
         * 按真实高程改判 kind。
         *
         * 【顺序很关键】必须在 `rand()` **已经消耗完**之后再改判。
         * 若把"高程不达标就 continue"写在前面，被跳过的格子就少消耗两次随机数，
         * 后面所有格子的 kind/scale 会整体错位——团簇那次踩过一模一样的坑
         * （实测挪了 2/3 的符号位置）。这里只覆盖结果，不动随机序列。
         */
        if (elevationAt) {
          const elev = elevationAt(lat, lng)
          /*
           * 高程只做**否决**，不做指定：
           *   低于 PEAK_MIN_ELEV 的地方不出山峰（改成树）
           * 高于阈值的地方仍然按原来的 62% 概率出山 —— 不去"指定山顶在哪"。
           *
           * 【为什么不指定】试过按高程强制放山（elev≥阈值 → peak），实测阿尔卑斯
           * 一带只剩一两座、撒哈拉腹地反而更多：这份 2048 宽的高程图在 1.1° 的格子里
           * 取到最大值后，阿尔卑斯山谷 0.106、撒哈拉腹地 0.102 —— **两者重叠**。
           * 数据分不开的东西，判据再花哨也只是把它随机化，反而让山脉走向消失。
           * 做否决是安全的：只会删掉"平原上的山"，不会把山搬到别处。
           */
          if (elev >= 0 && elev < PEAK_MIN_ELEV && kind === 'peak') kind = 'tree'
        }

        /*
         * 团簇：古地图的山脉是"一簇一簇"的，中间隔着大片留白的平原。
         *
         * 【为什么要加这一步】均匀撒点是第一版的观感问题：符号等距铺满整块陆地，
         * 远看是一片均匀的麻点，既不像地形、又抢注意力。加团簇后同一块陆地上
         * 出现「密山区 / 空平原」的对比，与手绘地图的疏密节奏一致。
         *
         * 粗格 = CLUSTER × CLUSTER 个细格（2×2，约 4.4° 见方）。
         * 先用格坐标哈希判定这一块是山区还是平原，再在块内按密度取舍：
         *   · 山区留 85%（成片）
         *   · 平原留 12%（零星几座孤峰，不是完全没有）
         * 两次取值都用 hashCell 而不是 rand()——见 hashCell 的注释。
         */
        if (clusterStrength > 0) {
          // 粗格 = CLUSTER × CLUSTER 个细格。步长从 2.2° 减半到 1.1° 之后，
          // CLUSTER 要跟着翻倍，团簇的**物理尺寸**才不变（仍约 4.4° 见方），
          // 否则山会碎成一堆小簇。
          const CLUSTER = 4
          const region = hashCell(Math.floor(c / CLUSTER), Math.floor(r / CLUSTER), 0x5eed)
          const clustered = region > 0.42 ? 0.85 : 0.12
          const density = 1 - clusterStrength + clusterStrength * clustered
          if (hashCell(c, r, 0x1234) > density) continue
        }

        /*
         * ---- 副热带干旱带不出树 ----
         *
         * 【这是「撒哈拉长树」的真正根因，不是撒点算法】
         * 上面那段高程改判写的是「低于 PEAK_MIN_ELEV 就不出山 → **改成树**」。
         * 而撒哈拉腹地的高程实测只有 0.10，刚好在阈值下面 ——
         * 于是整片沙漠的山全被改成了树。修的时候容易误以为是随机撒点的问题，
         * 其实是「不是山就是树」这个二选一把「不该有符号」的地方填满了。
         *
         * 【为什么用纬度带而不是植被图】
         * painted-land.png 的颜色里其实有植被信息（撒哈拉沙黄 / 刚果深绿），
         * 但它是 1024×512 的全球图，2D 渲染路径没有加载它（会给首屏 +500KB），
         * 而且用颜色判植被要被光照/昼夜调色污染。现有的诚实的替代判据只有纬度：
         * 南北纬 15°~35° 是副热带干旱带 —— 撒哈拉、阿拉伯、伊朗、澳洲内陆都在里面。
         *
         * 【已知误伤，写在这里不装作没有】
         * 同纬度带里也有非沙漠：中国江南、日本南部、美国南部、印度北部。
         * 这些地方会跟着变秃。等真正的植被图（128×64 就够）来了，把这个判据换掉即可。
         *
         * 【为什么是 continue 而不是改成别的 kind】
         * 沙漠本来就该留白（古地图上撒哈拉是空的）。改成山是撒谎，改成别的符号也是。
         * 这里的 continue 不会打乱随机序列 —— rand() 在上面已经无条件消耗完了。
         */
        if (kind === 'tree' && Math.abs(lat) >= ARID_BAND[0] && Math.abs(lat) <= ARID_BAND[1]) continue

        out.push({ lat, lng, kind, scale, rank })
      }
      /* 一行跑完让出一次：欧亚那种大块一行约 5~15ms，正好是一片的上限 */
      yield
    }
  }

  return out
}

/**
 * 同步版：把分批版一次抽干。
 *
 * 2D 海图（`TerrainDecor` 的 useMemo）继续用它 —— 那份数据在首屏就要，
 * 而且 2D 实测只花 116ms 量级，没必要改成异步。**输出与分批版逐项相同**。
 */
export function buildTerrainSymbols(
  geojson: GeoJSON.GeoJsonObject,
  opts: BuildTerrainOptions = {},
): TerrainSymbol[] {
  const it = buildTerrainSymbolsChunked(geojson, opts)
  let step = it.next()
  while (!step.done) step = it.next()
  return step.value
}

/**
 * 取出面积最大的若干块陆地，用于画"浅滩光晕"。
 *
 * 【为什么不画全部 1420 块】
 * 浅滩要在陆地**下面**叠 3 层不同粗细的描边，1420 块 × 3 层 = 4260 个 SVG path，
 * 缩放时每次重设 d 属性会明显掉帧。实际视觉上只有大陆的海岸需要这层过渡，
 * 几公里的小岛自己带一圈描边就够了。
 */
export function buildMajorLand(
  geojson: GeoJSON.GeoJsonObject,
  topBlocks = 14,
): GeoJSON.FeatureCollection {
  const feats: GeoJSON.Feature[] = []
  const collect = (g: GeoJSON.GeoJsonObject) => {
    if (g.type === 'FeatureCollection') {
      (g as GeoJSON.FeatureCollection).features.forEach(collect)
    } else if (g.type === 'Feature') {
      const f = g as GeoJSON.Feature
      if (f.geometry) feats.push(f)
    } else if (g.type === 'Polygon' || g.type === 'MultiPolygon') {
      feats.push({ type: 'Feature', properties: {}, geometry: g as GeoJSON.Geometry })
    }
  }
  collect(geojson)

  const areaOf = (f: GeoJSON.Feature) => {
    const geom = f.geometry
    if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') return 0
    const rings = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
    let best = 0
    for (const poly of rings) {
      const outer = (poly as [number, number][][])[0] ?? []
      if (!outer.length) continue
      const b = bboxOf(outer)
      const a = (b.maxLng - b.minLng) * (b.maxLat - b.minLat)
      if (a > best) best = a
    }
    return best
  }

  const picked = feats
    .map(f => ({ f, a: areaOf(f) }))
    .sort((x, y) => y.a - x.a)
    .slice(0, topBlocks)
    .map(x => x.f)

  return { type: 'FeatureCollection', features: picked }
}

/**
 * 单块陆地的「外接矩形面积（度²）」。
 *
 * 【为什么用 bbox 面积而不是真实面积】
 * 真实多边形面积要鞋带公式，但这里的用途只有**分档**（大块大陆 / 中等岛 / 小岛），
 * bbox 已经足够区分——1420 块陆地里 60% 的 bbox 面积 < 0.1 度²，
 * 而三大洲是 9000~22000 度²，差两个数量级，不存在判错的可能。
 *
 * 同 MultiPolygon 取最大的一块：一块要素里常同时含主岛和附属小岛，
 * 决定描边粗细的应该是主岛。
 */
export function featureArea(feature: GeoJSON.Feature): number {
  const geom = feature.geometry
  if (!geom) return 0
  if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') return 0
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  let best = 0
  for (const poly of polys) {
    const outer = (poly as [number, number][][])[0] ?? []
    if (!outer.length) continue
    const b = bboxOf(outer)
    const a = (b.maxLng - b.minLng) * (b.maxLat - b.minLat)
    if (a > best) best = a
  }
  return best
}
