/**
 * 甲板 draw call 归因探针：把单帧的提交分摊到「祖先链上第一个具名对象」，
 * 找出到底是谁在提交、谁可以合并。
 *
 * 【为什么不读 renderer.info】info.render.calls 只有一个总数，看不到分布；
 * 且两帧连读会翻倍（上一轮踩过）。这里直接遍历场景自己算：可见的
 * Mesh/Points/Line 每个算 1 次（数组材质算材质数），InstancedMesh 仍算 1 次。
 *
 * 跑法：先起 dev server（5174），再 `node test/e2e/drawcount-src.mjs`
 */
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] })
const ctx = await browser.createBrowserContext()
const page = await ctx.newPage()
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await page.waitForFunction(() => !!window.__mapStore, { timeout: 30000 })
await page.evaluate(() => window.__mapStore.setState({ viewMode: '3d' }))
await sleep(2500)
await page.evaluate(() => document.querySelector('[data-testid=deck-view-toggle]')?.click())
await page.waitForFunction(() => !!window.__deckScene, { timeout: 60000 })
await sleep(2500)

const rep = await page.evaluate(() => {
  const scene = window.__deckScene
  const rows = new Map()
  const meshes = []
  const ownerOf = (o) => {
    let p = o
    let best = '(root)'
    while (p && p !== scene) { if (p.name) best = p.name; p = p.parent }
    return best
  }
  const parentOf = (o) => {
    let p = o.parent
    while (p && p !== scene) { if (p.name) return p.name; p = p.parent }
    return '(root)'
  }
  const tri = (o) => {
    const g = o.geometry
    if (!g) return 0
    const idx = g.getIndex()
    const cnt = idx ? idx.count : (g.getAttribute('position')?.count ?? 0)
    return (cnt / 3) * (o.isInstancedMesh ? o.count : 1)
  }
  scene.traverseVisible((o) => {
    const isDraw = o.isMesh || o.isPoints || o.isLine
    if (!isDraw) return
    const n = Array.isArray(o.material) ? o.material.length : 1
    const owner = ownerOf(o)
    rows.set(owner, (rows.get(owner) ?? 0) + n)
    meshes.push({ owner, parent: parentOf(o), name: o.name || '', type: o.type, n, tris: tri(o), mat: (o.material?.type ?? '') })
  })
  const sorted = [...rows.entries()].sort((a, b) => b[1] - a[1])
  const pmap = new Map()
  const pmat = new Map()
  for (const m of meshes) {
    if (m.name) continue
    pmap.set(m.parent, (pmap.get(m.parent) ?? 0) + m.n)
    if (!pmat.has(m.parent)) pmat.set(m.parent, new Set())
    pmat.get(m.parent).add(m.mat)
  }
  return {
    total: sorted.reduce((s, r) => s + r[1], 0),
    drawables: meshes.length,
    tris: Math.round(meshes.reduce((s, m) => s + m.tris, 0)),
    sorted,
    byParent: [...pmap.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v, pmat.get(k).size]),
    namedShip: meshes.filter((m) => m.name).sort((a, b) => b.tris - a.tris),
    unnamed: meshes.filter((m) => !m.name),
    named: meshes.filter((m) => m.name).length,
  }
})

console.log(`\n甲板单帧提交合计 ${rep.total} 次 / 可绘制对象 ${rep.drawables} 个 / 三角形 ${rep.tris}`)
console.log(`具名 ${rep.named}、无名 ${rep.unnamed.length}\n`)
console.log('按祖先名分摊：')
for (const [k, v] of rep.sorted) console.log(`  ${String(v).padStart(4)}  ${k}`)

console.log('\n无名对象的直接父级（可合潜力）：')
for (const [k, v, mats] of rep.byParent) console.log(`  ${String(v).padStart(4)}  ${k}   材质种类 ${mats}`)

console.log('\n有名字的 deck-ship 子对象（逐个）：')
for (const row of rep.namedShip) console.log(`  ${String(row.n).padStart(3)}  ${row.name}   ${row.type}  ${row.mat}  tris=${Math.round(row.tris)}`)


// ── 追加：无名 Group 里装了什么（合并只遍历直接子级，进不去）──
const mats = await page.evaluate(() => {
  const g = window.__deckScene.getObjectByName('deck-ship')
  const out = []
  const walk = (node, path) => {
    for (const c of node.children) {
      if (c.name) continue
      if (c.isMesh) continue
      let n = 0, kinds = new Set()
      c.traverse((o) => { if (o.isMesh || o.isLine || o.isPoints) { n++; kinds.add(o.material?.type ?? '?') } })
      const kids = []
      const mu = new Map()
      c.traverse((o) => {
        if (!(o.isMesh || o.isLine) || !o.visible) return
        const u = o.material?.uuid ?? '?'
        mu.set(u, (mu.get(u) ?? 0) + 1)
        kids.push((o.material?.color ? '#' + o.material.color.getHexString() : '-') + ':' + Math.round((o.geometry?.getIndex()?.count ?? o.geometry?.getAttribute('position')?.count ?? 0) / 3))
      })
      out.push({ path, type: c.type, n, kinds: [...kinds].join(','), kids, matInst: mu.size })
      walk(c, path + '/' + c.type)
    }
  }
  walk(g, 'deck-ship')
  return out.sort((a, b) => b.n - a.n)
})
console.log('\ndeck-ship 下的无名组（合并够不到的地方）：')
for (const m of mats) console.log(`   ${String(m.n).padStart(3)} 个可绘制 / ${m.matInst} 份材质  ${m.kinds}   @ ${m.path}\n        ${m.kids.join('  ')}`)
await browser.close()
