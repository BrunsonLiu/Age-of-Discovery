import { build } from 'esbuild'
const r = await build({
  entryPoints: ['src/main.tsx'],
  bundle: true, write: false, metafile: true, splitting: true, format: 'esm', minify: true,
  outdir: 'out',
  jsx: 'automatic', loader: { '.css': 'empty', '.png': 'dataurl', '.webp': 'dataurl', '.woff2': 'empty', '.svg': 'dataurl' },
  define: { 'import.meta.env.PROD': 'true', 'import.meta.env.DEV': 'false' },
  logLevel: 'error',
})
const outs = r.metafile.outputs
const entry = Object.entries(outs).find(([k]) => k.endsWith('main.js'))?.[1]
if (!entry) { console.log(Object.keys(outs)); process.exit(1) }
console.log(`入口 chunk ${(entry.bytes / 1024).toFixed(0)}KB（另有 ${Object.keys(outs).length - 1} 个懒加载块）`)
const rows = Object.entries(entry.inputs).map(([f, v]) => ({ f, b: v.bytesInOutput })).sort((a, b) => b.b - a.b)
for (const x of rows.slice(0, 24)) console.log(String(Math.round(x.b / 1024)).padStart(5) + 'KB  ' + x.f)
/* 懒加载块排行，看哪块最大 */
const chunks = Object.entries(outs).filter(([k]) => !k.endsWith('main.js'))
  .map(([k, v]) => ({ k, kb: Math.round(v.bytes / 1024) })).sort((a, b) => b.kb - a.kb)
console.log('\n最大的懒加载块：' + chunks.slice(0, 6).map((c) => `${c.kb}KB ${c.k.split('/').pop()}`).join('  '))
