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

/** 射线法。经度相同的边跳过（分母为 0，那种边不产生穿越） */
function pointInRing(lat: number, lng: number, ring: [number, number][]): boolean {
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

/** 外环内、且不在任何内环（湖泊）里 */
function pointInRings(lat: number, lng: number, rings: Ring[]): boolean {
  if (!rings.length) return false
  const { bbox } = rings[0]
  if (lng < bbox.minLng || lng > bbox.maxLng || lat < bbox.minLat || lat > bbox.maxLat) return false
  if (!pointInRing(lat, lng, rings[0].pts)) return false
  for (let i = 1; i < rings.length; i++) {
    if (pointInRing(lat, lng, rings[i].pts)) return false
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
  seed?: number
}

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
export function buildTerrainSymbols(
  geojson: GeoJSON.GeoJsonObject,
  opts: BuildTerrainOptions = {},
): TerrainSymbol[] {
  const topBlocks = opts.topBlocks ?? 14
  const stepDeg = opts.stepDeg ?? 2.2
  const maxSymbols = opts.maxSymbols ?? 26000
  const insetMul = opts.insetMul ?? 0.16
  /** 团簇：0 = 均匀铺满（旧观感），1 = 极端起伏。见下方 CLUSTER 注释 */
  const clusterStrength = opts.clusterStrength ?? 1
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
        const kind: TerrainKind = snowy ? 'peak' : (rand() < 0.62 ? 'peak' : 'tree')
        const scale = 0.8 + rand() * 0.45

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
          const CLUSTER = 2
          const region = hashCell(Math.floor(c / CLUSTER), Math.floor(r / CLUSTER), 0x5eed)
          const clustered = region > 0.42 ? 0.85 : 0.12
          const density = 1 - clusterStrength + clusterStrength * clustered
          if (hashCell(c, r, 0x1234) > density) continue
        }

        out.push({ lat, lng, kind, scale, rank })
      }
    }
  }

  return out
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
