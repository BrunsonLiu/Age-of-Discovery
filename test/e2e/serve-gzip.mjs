/**
 * 像 GitHub Pages 一样提供 dist：**按扩展名 gzip**，不缓存。
 *
 * 【为什么需要它】本地 `vite preview` 不压缩任何资源，实测 `data/land.geojson`
 * 传输 1244KB / 解压 1244KB（一比一）；而线上 GitHub Pages 是
 * `Content-Encoding: gzip` + 382KB —— 同一份文件差 3 倍。
 * 用 preview 量"玩家在 4G 下多久看到地图"会**严重高估**数据成本，
 * 进而把优化力气花错地方（差点去改 geojson 精度）。
 *
 * 用法：
 *   node test/e2e/serve-gzip.mjs            # 默认 5190
 *   node test/e2e/serve-gzip.mjs --port=5191
 * 然后 `GAME_URL=http://127.0.0.1:5190/Age-of-Discovery/ node test/e2e/probe-cold-start.mjs`
 */
import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, extname, normalize } from 'node:path'

const port = Number((process.argv.find((a) => a.startsWith('--port=')) ?? '--port=5190').split('=')[1])
/* 默认 dist；Windows 上 dist 目录常被别的进程占住（rename 会 EPERM），
 * 所以允许 `--root=dist-live` 指到另一份构建产物。 */
const ROOT = join(process.cwd(), (process.argv.find((a) => a.startsWith('--root=')) ?? '--root=dist').split('=')[1])
const BASE = '/Age-of-Discovery'

/* 与 GitHub Pages 一致：文本类压缩，图片/字体（本身已压缩）不压 */
const COMPRESS = new Set(['.js', '.css', '.json', '.geojson', '.bin', '.svg', '.txt', '.html', '.map', '.webmanifest'])
const TYPES = {
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json',
  '.bin': 'application/octet-stream',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0])
  if (p === BASE) { res.writeHead(301, { Location: BASE + '/' }); res.end(); return }
  if (!p.startsWith(BASE + '/')) { res.writeHead(404); res.end('not found'); return }
  p = p.slice(BASE.length)
  if (p === '/' || p === '') p = '/index.html'
  const file = join(ROOT, normalize(p).replace(/^([/\\])+/, ''))
  let st
  try { st = statSync(file) } catch { res.writeHead(404); res.end('not found'); return }
  if (!st.isFile()) { res.writeHead(404); res.end('not found'); return }

  const ext = extname(file).toLowerCase()
  const type = TYPES[ext] ?? 'application/octet-stream'
  const acceptGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '')
  /* 小于 1KB 的不压（与线上一致：压了反而更大） */
  const shouldGzip = acceptGzip && COMPRESS.has(ext) && st.size > 1024

  if (!shouldGzip) {
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': 'no-store' })
    createReadStream(file).pipe(res)
    return
  }
  const chunks = []
  const rs = createReadStream(file)
  rs.on('data', (c) => chunks.push(c))
  rs.on('end', () => {
    const body = gzipSync(Buffer.concat(chunks), { level: 9 })
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Encoding': 'gzip',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    })
    res.end(body)
  })
}).listen(port, '127.0.0.1', () => {
  console.log(`gzip 静态服务：http://127.0.0.1:${port}${BASE}/  根 ${ROOT}`)
})
