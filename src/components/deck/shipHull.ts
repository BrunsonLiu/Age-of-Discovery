import {
  HULL_ARC, HULL_BULWARK, HULL_STATIONS, SHIP_HALF_LENGTH,
  shipDeckAt, shipHalfWidthAt, shipKeelAt,
} from './shipShape'

/**
 * 船壳的放样几何：**纯数组，不碰 three、不碰 canvas**，于是可以在单测里直接验证。
 *
 * 【为什么把它抽出来】原先是写在 `shipModel.ts` 里的一小段循环，其中有一个
 * 差一位的错误：每个站位实际 push 的顶点数是 `ARC + 3`（左舷墙顶点 + ARC+1 个
 * 圆弧点 + 右舷墙顶点），而索引用的步长写成了 `ARC + 2`。于是**整个船壳是错的**：
 * 每一圈的第 0 个顶点其实是上一圈的最后一个，三角形斜着跨过甲板，把甲板切成
 * 一条条深色横带。从远处看（默认机位）它还是个"船形的东西"，只有站到甲板上才
 * 暴露 —— 这就是"近景那条深色带"的真正原因。
 *
 * 现在两条不变量由单测守着（`test/logic.test.ts` 的"船壳放样"一节）：
 *   ① 顶点数必须能被每站顶点数整除；
 *   ② 所有索引必须落在顶点范围内，且每个三角形不与"甲板面"交叉。
 */
export interface HullGeoData {
  positions: number[]
  uvs: number[]
  indices: number[]
  /** 每个站位实际 push 的顶点数（索引步长必须等于它） */
  perStation: number
}

export function buildHullGeo(): HullGeoData {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  // ⚠️ 这个数必须与下面 push 的次数逐一对上（左端 + ARC+1 个圆弧点 + 右端）
  const perStation = HULL_ARC + 3
  for (let i = 0; i <= HULL_STATIONS; i++) {
    const z = -SHIP_HALF_LENGTH + 2 * SHIP_HALF_LENGTH * (i / HULL_STATIONS)
    const w = shipHalfWidthAt(z)
    const depth = shipKeelAt(z)
    const dy = shipDeckAt(z)
    // 左舷墙顶
    positions.push(-w * 0.965, dy + HULL_BULWARK, z)
    uvs.push(0, i / HULL_STATIONS)
    // 横截面圆弧：从 −90° 扫到 +90°，两端正好接上舷墙顶
    for (let k = 0; k <= HULL_ARC; k++) {
      const a = -Math.PI / 2 + (k / HULL_ARC) * Math.PI
      positions.push(w * Math.sin(a), dy - (dy + depth) * Math.cos(a), z)
      uvs.push((k + 1) / (perStation - 1), i / HULL_STATIONS)
    }
    // 右舷墙顶
    positions.push(w * 0.965, dy + HULL_BULWARK, z)
    uvs.push(1, i / HULL_STATIONS)
  }
  for (let i = 0; i < HULL_STATIONS; i++) {
    for (let j = 0; j < perStation - 1; j++) {
      const a = i * perStation + j
      const b = a + perStation
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  // 首尾封板：从截面中心点扇形连到该站位的所有截面点
  const cap = (stationIndex: number, atZ: number) => {
    const base = stationIndex * perStation
    const dy = shipDeckAt(atZ)
    const centerIndex = positions.length / 3
    positions.push(0, dy * 0.1 - shipKeelAt(atZ) * 0.45, atZ)
    uvs.push(0.5, 1)
    for (let j = 0; j < perStation - 1; j++) indices.push(centerIndex, base + j, base + j + 1)
  }
  cap(0, -SHIP_HALF_LENGTH)
  cap(HULL_STATIONS, SHIP_HALF_LENGTH)
  return { positions, uvs, indices, perStation }
}
