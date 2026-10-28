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

/** 交换每个三角形的第 2、3 顶点 → 翻转绕向 */
function flipWinding(geo: THREE.BufferGeometry): void {
  const pos = geo.attributes.position.array as Float32Array
  const uv = geo.attributes.uv ? (geo.attributes.uv.array as Float32Array) : null
  for (let t = 0; t + 2 < pos.length / 3; t += 3) {
    const i1 = (t + 1) * 3, i2 = (t + 2) * 3
    for (let c = 0; c < 3; c++) {
      const s = pos[i1 + c]; pos[i1 + c] = pos[i2 + c]; pos[i2 + c] = s
    }
    if (uv) {
      const u1 = (t + 1) * 2, u2 = (t + 2) * 2
      for (let c = 0; c < 2; c++) {
        const s = uv[u1 + c]; uv[u1 + c] = uv[u2 + c]; uv[u2 + c] = s
      }
    }
  }
  geo.attributes.position.needsUpdate = true
  if (uv) geo.attributes.uv.needsUpdate = true
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

function makeGeometry(pos: number[], uv: number[] | null): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2))
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

  const pushTri = (dst: number[], uvDst: number[] | null, raw: number[]) => {
    const nV = raw.length / 3
    for (let t = 0; t + 2 < nV; t += 3) {
      for (let k = t; k <= t + 2; k++) {
        const lon = raw[k * 3], lat = raw[k * 3 + 1], dz = raw[k * 3 + 2]
        dst.push(lonToWorldX(lon), (dz - 1) * PLATE_THICKNESS, latToWorldZ(lat))
        if (uvDst) uvDst.push((lon + 180) / 360, mercNorm(lat))
      }
    }
  }

  for (const s of shapes) {
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
      if (isLid) pushTri(lidPos, lidUv, raw)
      else pushTri(wallPos, null, raw)
    }
    geo.dispose()
  }

  const lid = makeGeometry(lidPos, lidUv)
  const wall = makeGeometry(wallPos, null)

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
