/**
 * 生成海陆掩码（二进制位图）+ 港口航道。
 *
 * 【为什么需要】
 *
 * 航路规划要在「海」上找一条绕开陆地的路，最自然的做法是网格 A*。
 * 但 A* 要反复查询「这个格子是海还是陆」——若每次都跑一遍多边形射线法，
 * 1421 个多边形会让单次规划慢到几百毫秒。
 *
 * 所以在**构建期**把海陆判定烤成一张位图：
 *   - 分辨率 0.1°（约 6 海里）
 *   - 1 bit/格，全球共 3600×1800 = 6,480,000 格 ≈ 791 KB
 *   - 运行时查询是 O(1) 的位运算，A* 可以跑得飞快
 *
 * 【为什么是 0.1° 而不是 0.25°】
 *
 * 0.25°（27 km）太粗，会把**窄水道**整个抹掉：
 *   - 多佛尔海峡（英吉利海峡最窄处 ~34 km）——伦敦↔阿姆斯特丹直接无路
 *   - 马六甲海峡最窄处 ~65 km——马六甲↔巴达维亚会绕到爪哇岛东边
 * 而这些正是本作 20 个港口之间真实存在的航线。
 * 0.1°（6 海里）能让 34 km 的海峡落下 3 个格子，格心落在水里，
 * 判为海洋——于是海路找得到，玩家也能真的走「伦敦→阿姆斯特丹」这条航线。
 *
 * 【判定语义：格心】
 *
 * 每格按**格心**（该格经纬度的中心）判定海陆，不是「有任何陆地就算陆地」。
 * 原因：格心判定让窄水道自然成为海洋，让小岛不至于把整片海封死。
 * 代价是极小的岛（<6 海里）可能测不出来——在这个尺度上无所谓。
 *
 * 【港口航道：为什么要在陆地里挖一条河】
 *
 * 塞维利亚在瓜达尔基维尔河畔、伦敦在泰晤士河畔、里斯本在塔霍河口——
 * 按 50m 陆地数据，它们都在「陆地」上。船一离港就撞岸。
 *
 * 三种处理方式：
 *   (a) 改港口坐标到海边  → 篡改历史数据，且地图上港口图标会漂走
 *   (b) 运行时港口豁免圈  → 豁免圈是方的、直径 66km，掩码与判定仍是两套口径
 *   (c) **构建期挖航道**  → 掩码里从港口挖一条通向大洋的通道，
 *                           运行时 A* 规划与触礁判定读的是**同一张掩码**，
 *                           口径天然统一。船溯河而上到港，正是史实。
 *
 * 选 (c)。航道宽度取 ±1 格（≈18 km），够船走、也不会把内陆挖穿。
 *
 * 用法：node scripts/gen_sea_mask.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

/** 掩码分辨率（度） */
const STEP = 0.1
const WIDTH = Math.round(360 / STEP)   // 3600
const HEIGHT = Math.round(180 / STEP)   // 1800

console.log(`掩码分辨率 ${STEP}°，尺寸 ${WIDTH}×${HEIGHT} = ${(WIDTH * HEIGHT / 8 / 1024).toFixed(1)} KB`)

// --- 读陆地多边形 ---
const landPath = path.join(ROOT, 'public', 'data', 'land.geojson')
const geo = JSON.parse(fs.readFileSync(landPath, 'utf8'))

/** @type {number[][][]} 每个多边形是若干环（环 = 点数组 [lng, lat]） */
const polygons = []
for (const f of geo.features) {
  const t = f.geometry?.type
  if (t === 'Polygon') polygons.push(f.geometry.coordinates)
  else if (t === 'MultiPolygon') for (const c of f.geometry.coordinates) polygons.push(c)
}
console.log(`陆地多边形 ${polygons.length} 个`)

const toRad = Math.PI / 180
const toDeg = 180 / Math.PI

function haversineNm(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * toRad
  const dLon = (lng2 - lng1) * toRad
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 0.539957
}

/** 大圆插值 */
function greatCircleAt(from, to, f) {
  const la1 = from[0] * toRad, lo1 = from[1] * toRad
  const la2 = to[0] * toRad, lo2 = to[1] * toRad
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
  return [Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg, Math.atan2(y, x) * toDeg]
}

// --- 扫描线填充（格心语义）---
//
// 对每一行（0.1° 纬度带），算出该带中心纬度上与多边形相交的所有经度区间，
// 然后只标记**格心落在区间内**的格子。
//
// 区间配对用 even-odd：外环与内环（洞）的交点混在一起排序后两两配对，
// 洞自然被挖空（里海、维多利亚湖等会正确地变成海）。

/** 掩码：1 = 陆地，0 = 海 */
const mask = new Uint8Array(WIDTH * HEIGHT)

const gxOf = lng => Math.floor((lng + 180) / STEP)
const rowOf = lat => Math.floor((lat + 90) / STEP)

/**
 * 把一个多边形的所有环的边，按它跨越的行做桶。
 * 这样每行只需检查「这一行上确实存在的边」，而不是扫全部边。
 */
function buildEdgeBuckets(rings) {
  /** @type {Map<number, number[][]>} 行 → 该行的边 [x0,y0,x1,y1] */
  const buckets = new Map()
  for (const ring of rings) {
    const n = ring.length
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [x0, y0] = ring[j]
      const [x1, y1] = ring[i]
      if (y0 === y1) continue
      const r0 = rowOf(Math.min(y0, y1))
      const r1 = rowOf(Math.max(y0, y1))
      for (let r = r0; r <= r1; r++) {
        let arr = buckets.get(r)
        if (!arr) { arr = []; buckets.set(r, arr) }
        arr.push([x0, y0, x1, y1])
      }
    }
  }
  return buckets
}

for (const rings of polygons) {
  const buckets = buildEdgeBuckets(rings)
  for (const [r, edges] of buckets) {
    const lat = -90 + (r + 0.5) * STEP
    const xs = []
    for (const [x0, y0, x1, y1] of edges) {
      if ((y0 > lat) !== (y1 > lat)) {
        const t = (lat - y0) / (y1 - y0)
        xs.push(x0 + t * (x1 - x0))
      }
    }
    if (xs.length < 2) continue
    xs.sort((a, b) => a - b)
    // even-odd 配对：相邻两个交点之间是「在多边形内」
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // 只标记格心落在区间内的格子
      let gx0 = Math.ceil((xs[k] + 180) / STEP - 0.5)
      let gx1 = Math.floor((xs[k + 1] + 180) / STEP - 0.5)
      if (gx0 < 0) gx0 = 0
      if (gx1 > WIDTH - 1) gx1 = WIDTH - 1
      for (let gx = gx0; gx <= gx1; gx++) mask[r * WIDTH + gx] = 1
    }
  }
}
console.log('扫描线填充完成')

// --- 统计 ---
let land = 0
for (let i = 0; i < mask.length; i++) if (mask[i]) land++
console.log(`陆地格 ${land} / ${mask.length} = ${(land / mask.length * 100).toFixed(1)}%`)

const isLandCell = (gx, gy) => {
  if (gx < 0 || gx >= WIDTH || gy < 0 || gy >= HEIGHT) return false
  return mask[gy * WIDTH + gx] === 1
}

// --- 海洋连通性（洪水填充）---
//
// 从一个确定的外海格子（南大西洋中部）出发，把所有连通的「非陆地」格子标为 ocean。
// 用来区分「真正的海」和「被陆地围住的内陆水体/河道」——
// 塞维利亚那截瓜达尔基维尔河就与海不连通，不能拿它当作出海口。
console.log('正在计算与大洋连通的格子…')
const ocean = new Uint8Array(WIDTH * HEIGHT)
{
  const stack = []
  const seedId = rowOf(-30) * WIDTH + gxOf(-30) // 南大西洋中部
  stack.push(seedId)
  ocean[seedId] = 1
  let count = 1
  while (stack.length) {
    const id = stack.pop()
    const y = (id / WIDTH) | 0
    const x = id % WIDTH
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0)
      const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0)
      if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue
      const nid = ny * WIDTH + nx
      if (ocean[nid]) continue
      if (isLandCell(nx, ny)) continue
      ocean[nid] = 1
      count++
      stack.push(nid)
    }
  }
  let notConnected = 0
  for (let i = 0; i < mask.length; i++) if (!mask[i] && !ocean[i]) notConnected++
  console.log(`大洋连通格 ${count}；不连通的水体格 ${notConnected}（内陆湖/河道）`)
}

// --- 港口航道 ---
//
// 港口坐标从 src/data/ports.ts 解析（避免手抄两处不一致）。
const portsSrc = fs.readFileSync(path.join(ROOT, 'src', 'data', 'ports.ts'), 'utf8')
const portList = []
const portRe = /\{\s*id:\s*(\d+),\s*name:\s*'([^']+)',\s*nameCn:\s*'([^']+)',\s*latitude:\s*(-?[\d.]+),\s*longitude:\s*(-?[\d.]+)/g
let m
while ((m = portRe.exec(portsSrc)) !== null) {
  portList.push({ id: Number(m[1]), name: m[2], nameCn: m[3], lat: Number(m[4]), lng: Number(m[5]) })
}
console.log(`解析到 ${portList.length} 个港口`)

/**
 * 找最近的、且与大洋连通的格子（螺旋外扩）。
 * 螺旋按**格子 Chebyshev 距离**扩圈，但候选用测地距离挑最优——
 * 同一圈里靠边角的方向在高纬会明显更远。
 */
function findOceanAccess(lat, lng, maxRing = 150) {
  const r0 = rowOf(lat), c0 = gxOf(lng)
  let best = null
  let bestNm = Infinity
  for (let r = 0; r <= maxRing; r++) {
    const rMin = Math.max(0, r0 - r), rMax = Math.min(HEIGHT - 1, r0 + r)
    for (let gy = rMin; gy <= rMax; gy++) {
      if (Math.abs(gy - r0) !== r) continue
      // 圈上所有列：dy = ±r 时 x 从 c0-r 到 c0+r，否则只有两端
      const cMin = r === 0 ? c0 : c0 - r
      const cMax = r === 0 ? c0 : c0 + r
      for (let gx = cMin; gx <= cMax; gx++) {
        if (r !== 0 && Math.abs(gy - r0) !== r && gx !== cMin && gx !== cMax) continue
        const nx = ((gx % WIDTH) + WIDTH) % WIDTH
        const id = gy * WIDTH + nx
        if (!ocean[id]) continue
        const cellLat = -90 + (gy + 0.5) * STEP
        const cellLng = -180 + (nx + 0.5) * STEP
        const nm = haversineNm(lat, lng, cellLat, cellLng)
        if (nm < bestNm) { bestNm = nm; best = [cellLat, cellLng] }
      }
    }
    // 下一圈的最短可能距离已超过当前最优 → 停
    if (best) {
      const nextMinNm = haversineNm(lat, lng, lat, lng + (r + 1) * STEP)
      if (nextMinNm > bestNm) break
    }
  }
  return best
}

/** 把一段地理线上的格子挖成海（航道） */
function carveChannel(a, b, halfWidthCells) {
  const nm = haversineNm(a[0], a[1], b[0], b[1])
  const steps = Math.max(2, Math.ceil(nm / (STEP * 60)))
  for (let i = 0; i <= steps; i++) {
    const [cl, cg] = greatCircleAt(a, b, i / steps)
    const gy = rowOf(cl), gx = gxOf(cg)
    for (let dy = -halfWidthCells; dy <= halfWidthCells; dy++) {
      for (let dx = -halfWidthCells; dx <= halfWidthCells; dx++) {
        if (dx * dx + dy * dy > halfWidthCells * halfWidthCells + halfWidthCells) continue
        const ny = gy + dy
        if (ny < 0 || ny >= HEIGHT) continue
        const nx = (((gx + dx) % WIDTH) + WIDTH) % WIDTH
        mask[ny * WIDTH + nx] = 0
      }
    }
  }
}

const CHANNEL_HALF_WIDTH = 1 // ±1 格 ≈ 18 km 宽
const channels = []
for (const p of portList) {
  const access = findOceanAccess(p.lat, p.lng)
  if (!access) {
    console.log(`  ✗ ${p.nameCn} 附近找不到连通大洋的格子`)
    continue
  }
  const nm = haversineNm(p.lat, p.lng, access[0], access[1])
  // 挖航道：港口 → 出海口
  carveChannel([p.lat, p.lng], access, CHANNEL_HALF_WIDTH)
  channels.push({ id: p.id, nameCn: p.nameCn, from: [p.lat, p.lng], to: access, nm })
  const flag = nm > 30 ? '  ← 内陆，挖了航道' : ''
  console.log(`  ${p.nameCn.padEnd(6)} (${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}) → 出海口 (${access[0].toFixed(3)}, ${access[1].toFixed(3)})  ${nm.toFixed(1)} nm${flag}`)
}

// 挖完航道后重算海洋连通性——航道把港口接到了海里
{
  const stack = []
  const seedId = rowOf(-30) * WIDTH + gxOf(-30)
  ocean.fill(0)
  stack.push(seedId)
  ocean[seedId] = 1
  while (stack.length) {
    const id = stack.pop()
    const y = (id / WIDTH) | 0
    const x = id % WIDTH
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0)
      const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0)
      if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue
      const nid = ny * WIDTH + nx
      if (ocean[nid]) continue
      if (isLandCell(nx, ny)) continue
      ocean[nid] = 1
      stack.push(nid)
    }
  }
  // 检查每个港口格现在是否与大洋连通
  for (const ch of channels) {
    const id = rowOf(ch.from[0]) * WIDTH + gxOf(ch.from[1])
    if (!ocean[id]) console.log(`  ⚠ ${ch.nameCn} 港口格仍不与大洋连通`)
  }
  console.log('航道挖掘完成，已重算海洋连通性')
}

fs.writeFileSync(
  path.join(ROOT, 'public', 'data', 'port-channels.json'),
  JSON.stringify(
    channels.map(c => ({ id: c.id, nameCn: c.nameCn, from: c.from.map(v => Number(v.toFixed(4))), to: c.to.map(v => Number(v.toFixed(4))) })),
    null, 2,
  ),
)
console.log('已写出 port-channels.json')

// --- 抽检 ---
const checks = [
  ['加勒比海面', 12, -72, false],
  ['委内瑞拉以北', 11.5, -68, false],
  ['大西洋中部', 25, -45, false],
  ['撒哈拉内陆', 23, 12, true],
  ['巴西内陆', -10, -50, true],
  ['马德里内陆', 40.4, -3.7, true],
  ['撒哈拉腹地', 25, 10, true],
  ['好望角外海', -34.5, 18.5, false],
  ['澳大利亚内陆', -25, 133, true],
  ['西伯利亚', 62, 100, true],
  ['太平洋中部', 0, -160, false],
  ['英吉利海峡中央', 50.8, 1.0, false],
  ['多佛尔海峡', 51.05, 1.4, false],
  ['马六甲海峡', 2.5, 101.0, false],
  ['波斯湾', 27.0, 52.0, false],
  ['红海中部', 20.0, 38.5, false],
  ['直布罗陀', 35.95, -5.6, false],
  ['苏伊士运河口', 30.0, 32.5, false],
  ['塞维利亚（已挖航道）', 37.3886, -5.9823, false],
  ['伦敦（已挖航道）', 51.5074, -0.1278, false],
]
let bad = 0
for (const [n, la, lo, exp] of checks) {
  const got = isLandCell(gxOf(lo), rowOf(la))
  if (got !== exp) { bad++; console.log(`  ✗ ${n}: 判${got ? '陆地' : '海洋'} 期望${exp ? '陆地' : '海洋'}`) }
  else console.log(`  ✓ ${n}`)
}
console.log(`抽检误判 ${bad}/${checks.length}`)

// --- 写出（1 bit/格 位压缩）---
const out = Buffer.alloc(Math.ceil(mask.length / 8))
for (let i = 0; i < mask.length; i++) {
  if (mask[i]) out[i >> 3] |= 1 << (i & 7)
}

const outPath = path.join(ROOT, 'public', 'data', 'sea-mask.bin')
fs.writeFileSync(outPath, out)
console.log(`\n已写出 ${outPath}（${(out.length / 1024).toFixed(1)} KB，1 bit/格）`)

fs.writeFileSync(
  path.join(ROOT, 'public', 'data', 'sea-mask.json'),
  JSON.stringify({ step: STEP, width: WIDTH, height: HEIGHT }, null, 2),
)
console.log('已写出 sea-mask.json')
