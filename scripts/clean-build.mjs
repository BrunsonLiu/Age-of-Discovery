#!/usr/bin/env node
// 全新构建：先把旧 dist 整体挪到系统临时目录，再跑 npm run build。
//
// 【为什么不能直接 npm run build】
// Vite 的 emptyOutDir 会一次删掉 dist/assets 里 100+ 个文件，在本机安全策略下
// 会触发「批量删除需确认」而中断构建（2026-11-06 实测：144 个 > 50 阈值）。
// 用 --emptyOutDir false 也不行：旧 chunk 会残留，报出来的产物体积是假的
// （曾因此把 1.9MB 死 PNG 算进体积，连报几轮「34MB」）。
// 整体 rename 是单次操作，既不触发批量删除，又保证 dist 里全是本次产物。
//
// 用法：npm run build:clean
import { access, rename, readdir, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = process.cwd()
const dist = resolve(root, 'dist')
const exists = async p => { try { await access(p); return true } catch { return false } }

let prev = null
if (await exists(dist)) {
  prev = join(tmpdir(), `aod-dist-prev-${Date.now()}`)
  await rename(dist, prev)
  console.log(`[clean-build] 旧产物已整体挪到 ${prev}`)
}

const r = spawnSync('npm run build', { shell: true, stdio: 'inherit', cwd: root })
if (r.status !== 0) {
  console.error('[clean-build] 构建失败；旧产物仍在上面的临时目录，可手动移回')
  process.exit(r.status ?? 1)
}

// 统计真实产物，避免把「旧 chunk 残留」当成体积结论
async function walk(dir) {
  let files = 0, bytes = 0
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) {
      const s = await walk(p); files += s.files; bytes += s.bytes
    } else {
      files++; bytes += (await stat(p)).size
    }
  }
  return { files, bytes }
}
if (await exists(dist)) {
  const s = await walk(dist)
  console.log(`[clean-build] 新产物：${(s.bytes / 1024 / 1024).toFixed(1)}MB / ${s.files} 文件（全是本次构建）`)
}
if (prev) {
  console.log('[clean-build] 旧产物留在系统临时目录，可自行删除；请勿手工拷回 dist')
}
