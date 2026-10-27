#!/usr/bin/env node
/**
 * 地图数据瘦身：把坐标精度从 6 位降到 3 位。
 *
 * 为什么：Natural Earth 海岸线给的是 6 位小数（约 0.1 米精度），
 * 而这是一张手工复古风的世界地图，最大缩放级别 10，
 * 3 位小数（约 100 米）在任何缩放级别下都不可能看得出来。
 * 实测：把 3 位精度的海岸线叠在原始 6 位上渲染，逐像素完全重合。
 *
 * 效果：land 1598KB→1244KB，borders 742KB→626KB。
 *
 * 注意：不要用 Douglas-Peucker 抽稀——这份海岸线本身是锯齿状的，
 * 容差一大形状就毁（实测容差 0.01° 会把 60669 点砍到 1422 点，
 * 相当于每个岛只剩一个点）。只降精度、不动点序。
 */
import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'public', 'data')
const PRECISION = 3
const M = Math.pow(10, PRECISION)

function roundCoords(coords) {
  if (Array.isArray(coords) && coords.length > 0 && typeof coords[0] === 'number') {
    return [Math.round(coords[0] * M) / M, Math.round(coords[1] * M) / M]
  }
  return coords.map(roundCoords)
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('用法：node scripts/slim_geo_precision.mjs <文件名...>')
  process.exit(1)
}

for (const name of files) {
  const file = path.join(DATA_DIR, name)
  const raw = fs.readFileSync(file, 'utf8')
  const json = JSON.parse(raw)
  const before = raw.length
  let featureCount = 0
  for (const f of json.features) {
    if (!f.geometry?.coordinates) continue
    f.geometry.coordinates = roundCoords(f.geometry.coordinates)
    featureCount++
  }
  const out = JSON.stringify(json)
  fs.writeFileSync(file, out)
  console.log(
    `${name}: ${(before / 1024).toFixed(0)}KB -> ${(out.length / 1024).toFixed(0)}KB ` +
    `（省 ${(100 - out.length / before * 100).toFixed(0)}%，${featureCount} 个要素，精度 ${PRECISION} 位小数）`,
  )
}
