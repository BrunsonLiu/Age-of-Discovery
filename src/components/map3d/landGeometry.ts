import * as THREE from 'three'
import { lonToWorldX, latToWorldZ, mercNorm } from '@/utils/mapProjection'

/**
 * 把 land.geojson 挤成「浮雕板块」几何（2.5D 海图的陆地层）。
 *
 * 做法与 Age of Sail 一致：**陆地是平的**，靠"沿海岸挤出一圈薄边 + 羊皮纸贴图"
 * 表达立体感，而不是真实地形起伏。真实地形在这个尺度上露馅得很难看
 * （近景每格 40px 的方块台阶、悬崖式直落的海岸线），
 * 而贴图路线在战略尺度上完全够用。
 *
 * 【本文件踩过的两个坑，都写在这里免得再犯】
 *
 * 1) 绕向（winding）
 *    GeoJSON 规范要求外环逆时针，但本项目的 land.geojson 实测 1421/1421
 *    全是**顺时针**（有向面积为负）。而 (lon,lat) → (X,Z) 是镜像变换，
 *    绕向效应与源绕向耦合，最终地表法线会朝下 → 背面剔除 → 画面全黑
 *    （实测亮度只剩无光照版的 3%）。
 *    这里**不假设源绕向**：构建完直接测量地表法线，朝下就整体翻转绕向。
 *    这样无论上游数据怎么变，结果都一定对。
 *
 * 2) 平滑法线
 *    几何是非索引的，computeVertexNormals 只能给逐面法线，
 *    海岸侧壁会因 50m 级折线的锯齿出现"梳齿"感。
 *    这里按位置焊接顶点后平均法线，把侧壁变成一条连续的悬崖带。
 */

/** 板块厚度：陆地顶面 y=0，海平面 y=-PLATE_THICKNESS */
export const PLATE_THICKNESS = 0.085

/** 一环 = 若干 [lon, lat]；一个多边形 = 外环 + 若干洞 */
type Ring = number[][]
type Poly = Ring[]
/** land.geojson 的最小结构（只用到 geometry.type 与 coordinates） */
type GeoJsonLike = {
  features: {
    geometry: {
      type: string
      coordinates: Poly | Poly[]
    }
  }[]
}

export interface LandGeometry {
  /** 顶面（贴羊皮纸贴图） */
  lid: THREE.BufferGeometry
  /** 侧壁（海岸薄边） */
  wall: THREE.BufferGeometry
  polyCount: number
  triangles: number
}

/**
 * 交换每个三角形的第 2、3 顶点 → 翻转绕向。
 *
 * 【必须交换**所有**顶点属性，不能只管 position/uv】
 * 侧壁后来加了 `color`（垂直明暗渐变的顶点色）。这个函数原先只换 position 与 uv，
 * 颜色留在原位——于是翻转绕向后，每个顶点的颜色对到了**另一个顶点**的位置上。
 * 一条四边形的两个三角形颜色互相错位，渲染出来就是海岸立面上一圈规则的
 * 竖条纹（像瓦楞纸／一排板缝）。排查时依次排除了法线合并、阴影自遮挡、
 * 背面剔除（分别改 eps、关 receiveShadow、设 DoubleSide，条纹都不动），
 * 最后才定位到"漏交换一个属性"。
 *
 * 所以这里改成按 attributes 遍历：以后再加任何顶点属性（tangent / ao …）都不会漏。
 */
function flipWinding(geo: THREE.BufferGeometry): void {
  const attrs = Object.values(geo.attributes) as THREE.BufferAttribute[]
  const nVerts = geo.attributes.position.count
  for (const attr of attrs) {
    const arr = attr.array as Float32Array
    const n = attr.itemSize
    for (let t = 0; t + 2 < nVerts; t += 3) {
      const i1 = (t + 1) * n, i2 = (t + 2) * n
      for (let c = 0; c < n; c++) {
        const s = arr[i1 + c]; arr[i1 + c] = arr[i2 + c]; arr[i2 + c] = s
      }
    }
    attr.needsUpdate = true
  }
  geo.computeVertexNormals()
}

/** 按位置焊接顶点后平均法线，把侧壁的"梳齿"抹平 */
function smoothNormalsByPosition(geo: THREE.BufferGeometry, eps = 1e-4): number {
  const pos = geo.attributes.position.array as Float32Array
  const nrm = geo.attributes.normal.array as Float32Array
  const map = new Map<string, number[]>()
  for (let i = 0; i < pos.length / 3; i++) {
    const k = `${Math.round(pos[i * 3] / eps)},${Math.round(pos[i * 3 + 1] / eps)},${Math.round(pos[i * 3 + 2] / eps)}`
    let a = map.get(k)
    if (!a) { a = []; map.set(k, a) }
    a.push(i)
  }
  let merged = 0
  for (const idxs of map.values()) {
    if (idxs.length < 2) continue
    let nx = 0, ny = 0, nz = 0
    for (const i of idxs) { nx += nrm[i * 3]; ny += nrm[i * 3 + 1]; nz += nrm[i * 3 + 2] }
    const len = Math.hypot(nx, ny, nz)
    if (len < 1e-9) continue
    for (const i of idxs) { nrm[i * 3] = nx / len; nrm[i * 3 + 1] = ny / len; nrm[i * 3 + 2] = nz / len }
    merged += idxs.length - 1
  }
  geo.attributes.normal.needsUpdate = true
  return merged
}

function makeGeometry(pos: number[], uv: number[] | null, col: number[] | null = null): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2))
  if (col) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3))
  g.computeVertexNormals()
  return g
}

export function buildLandGeometry(geojson: GeoJsonLike): LandGeometry {
  const shapes: THREE.Shape[] = []
  for (const f of geojson.features) {
    const g = f.geometry
    const polys: Poly[] = g.type === 'Polygon'
      ? [g.coordinates as Poly]
      : (g.coordinates as Poly[])
    for (const poly of polys) {
      const rings = poly.map(r => r.map(c => new THREE.Vector2(c[0], c[1])))
      if (!rings.length || rings[0].length < 3) continue
      const shape = new THREE.Shape(rings[0])
      for (let i = 1; i < rings.length; i++) shape.holes.push(new THREE.Path(rings[i]))
      shapes.push(shape)
    }
  }

  const lidPos: number[] = [], lidUv: number[] = []
  const wallPos: number[] = []
  const wallCol: number[] = []

  /*
   * 侧壁的垂直明暗（顶点色）。
   *
   * 【为什么需要】侧壁原本是**一整片纯色 0xa89066、没有贴图也没有渐变**。
   * 近景下它变成一圈又厚又亮的均匀色带——看起来是纸板切出来的蛋糕盒，
   * 而不是有深度的岩层，是整个 2.5D 里最廉价的一处。
   *
   * 真实板块的侧壁有三段：靠近顶面的棱受天光（最亮）、中段是岩土本色、
   * 贴近水面的一段被水影吃掉（最暗）。所以按深度做一条三段渐变：
   *   t=1（顶棱）   #c9b083
   *   t=0.45（中段）#6f5738
   *   t=0（水线）   #241a10
   * 用顶点色而不是贴图：侧壁几何本来就没有 UV（只有顶面有），
   * 补 UV 要按周长展开，成本高且会随多边形变形拉伸；顶点色只要看 y 就能算。
   */
  /*
   * 【三段色为什么整体压暗 ~30%】
   * 侧壁是不受光材质（下面 wallMat 的注释里说明了原因），所以它的明暗
   * **完全**由这三个数决定，和光的方向无关。而原来顶棱 150/123/80 经 ACES
   * 渲染出来是 rgb(176,161,121)、亮度 161 —— 比旁边的陆地顶面（~110）、
   * 甚至比贴图里烘焙的沙滩带（141）都亮。
   *
   * 垂直面比水平面亮，方向是反的：这张图的光从左上打下来，顶面吃到最多光，
   * 立面只能吃到掠射，水线附近还被水体压暗。真实浮雕的立面应该落在
   * 「沙滩 141 → 顶棱 ~118 → 中段 ~70 → 水线 ~35」这条线上。
   *
   * 正确做法是换成受光材质让光照自己算，但那会在相邻墙面的法线不连续处
   * 长出一圈瓦楞（上一轮排查过四轮才定位到）。所以这里改成手算配色。
   */
  const WALL_TOP: [number, number, number] = [108 / 255, 88 / 255, 56 / 255]
  const WALL_MID: [number, number, number] = [64 / 255, 51 / 255, 32 / 255]
  /*
   * 水线色：从 26/18/10 抬到 52/36/20。
   * 原来那档渲染出来是 rgb(12,6,3)——纯黑。远看像水面下的阴影没问题，
   * 但近景（港口就在岸边）时侧壁占很大面积，那一片直接读成**黑洞**，
   * 而且它的边界是海岸多边形的锯齿，看起来像模型破了个口。
   * 抬到约 rgb(24,15,8) 就够：仍然明显暗于顶棱，但不再吃掉细节。
   */
  const WALL_LOW: [number, number, number] = [52 / 255, 36 / 255, 20 / 255]
  /*
   * 【必须先转线性】顶点色在 three 里属于**工作色彩空间（线性）**，
   * 直接塞 sRGB 的百分比会被当成线性值，再经 ACES 一提亮就发白浮起来——
   * 实测第一版侧壁比陆地表面还亮，像贴了一条白纸。
   * 这里把设计时用的 sRGB 值转成线性再写入。
   */
  const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const wallShade = (t: number): [number, number, number] => {
    const k = Math.min(1, Math.max(0, t))
    if (k >= 0.45) {
      const u = (k - 0.45) / 0.55
      return [
        srgbToLinear(WALL_MID[0] + (WALL_TOP[0] - WALL_MID[0]) * u),
        srgbToLinear(WALL_MID[1] + (WALL_TOP[1] - WALL_MID[1]) * u),
        srgbToLinear(WALL_MID[2] + (WALL_TOP[2] - WALL_MID[2]) * u),
      ]
    }
    const u = k / 0.45
    return [
      srgbToLinear(WALL_LOW[0] + (WALL_MID[0] - WALL_LOW[0]) * u),
      srgbToLinear(WALL_LOW[1] + (WALL_MID[1] - WALL_LOW[1]) * u),
      srgbToLinear(WALL_LOW[2] + (WALL_MID[2] - WALL_LOW[2]) * u),
    ]
  }

  /*
   * 侧壁厚度按**岛屿自身的尺寸**缩放，而不是全图统一 0.085。
   *
   * 【为什么必须这样】
   * 0.085 世界单位 ≈ 96km（1 单位 ≈ 2000km）。对欧亚大陆这是恰当的"板块厚度"，
   * 但对加那利那种几百米宽的小岛，就等于给一块石头配了 96km 高的墙——
   * 放大后海面上会立着一排薄片，像栅栏。实测截图在伊比利亚西南外海非常明显。
   *
   * 用 bbox 对角线做尺度：大陆（>8°）取满厚度，越小的岛越薄，
   * 最小保留 12%（再薄会和海面穿插）。顶面仍在 y=0，所以岛屿高度不变。
   */
  const thicknessFor = (diagDeg: number) => PLATE_THICKNESS * Math.min(1, Math.max(0.12, diagDeg / 8))

  const pushTri = (dst: number[], uvDst: number[] | null, raw: number[], thick: number, colDst: number[] | null = null) => {
    const nV = raw.length / 3
    for (let t = 0; t + 2 < nV; t += 3) {
      for (let k = t; k <= t + 2; k++) {
        const lon = raw[k * 3], lat = raw[k * 3 + 1], dz = raw[k * 3 + 2]
        dst.push(lonToWorldX(lon), (dz - 1) * thick, latToWorldZ(lat))
        if (uvDst) uvDst.push((lon + 180) / 360, mercNorm(lat))
        // dz 本身就是明暗参数：1 = 顶棱（贴 y=0），0 = 水线（y=-thick）
        if (colDst) {
          const sh = wallShade(dz)
          colDst.push(sh[0], sh[1], sh[2])
        }
      }
    }
  }

  for (const s of shapes) {
    // 用外环 bbox 对角线判断"这块陆地有多大"
    const pts = s.getPoints(0)
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity
    for (const p of pts) {
      if (p.x < mnx) mnx = p.x
      if (p.x > mxx) mxx = p.x
      if (p.y < mny) mny = p.y
      if (p.y > mxy) mxy = p.y
    }
    const diagDeg = Math.hypot(mxx - mnx, mxy - mny)
    const thick = thicknessFor(diagDeg)

    const geo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false })
    const pos = geo.attributes.position.array as Float32Array
    const gLid = geo.groups.find(g => g.materialIndex === 0)
    const gWall = geo.groups.find(g => g.materialIndex === 1)
    for (const [grp, isLid] of [[gLid, true], [gWall, false]] as const) {
      if (!grp) continue
      const raw: number[] = []
      for (let i = grp.start; i < grp.start + grp.count; i++) {
        raw.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
      }
      if (isLid) pushTri(lidPos, lidUv, raw, thick)
      else pushTri(wallPos, null, raw, thick, wallCol)
    }
    geo.dispose()
  }

  const lid = makeGeometry(lidPos, lidUv)
  const wall = makeGeometry(wallPos, null, wallCol)

  // 自动定向：测地表法线，朝下就整体翻转绕向（见文件头说明）
  const n = lid.attributes.normal.array as Float32Array
  const p = lid.attributes.position.array as Float32Array
  let sum = 0, cnt = 0
  for (let i = 0; i < n.length; i += 3) {
    if (Math.abs(p[i + 1]) < 1e-6) { sum += n[i + 1]; cnt++ }
  }
  if (cnt && sum / cnt < 0) { flipWinding(lid); flipWinding(wall) }
  smoothNormalsByPosition(wall)

  const triangles = (lidPos.length + wallPos.length) / 9
  return { lid, wall, polyCount: shapes.length, triangles }
}
