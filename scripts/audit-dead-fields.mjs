// 数据表「死字段」审计：写进 data/*.ts 却从没被任何界面读过的东西。
//
// 为什么值得查：这个项目的历史坑是「字段写了、界面没接」——
// `enemyShip` 写完没人读、`kind` 加进 NPC_LEGS 前船型全写死 caravel。
// 这些字段不报错、不显形，只有靠"谁读了它"才能发现。
//
// 判据：字段名在 data/ 与 types/ 之外的 src 文件里出现 0 次 → 可疑。
// 排除静态数据自身的字段（id/name/nameCn/…）与 TS 关键字。
import fs from 'node:fs'
import path from 'node:path'

const SRC = 'src'
const DATA = path.join(SRC, 'data')

function walk(dir, acc = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(p)) acc.push(path.relative(SRC, p).split(path.sep).join('/'))
  }
  return acc
}

const all = walk(SRC)
const dataFiles = all.filter(f => f.startsWith('data/'))

/*
 * 消费方 = 除「定义它的那个文件」以外的所有 src 文件。
 *
 * 第一版把整个 data/ 与 types/ 都排除了，于是 `GREED_PROFIT_BONUS`
 * 被报成死字段 —— 其实它就用在 `data/traits.ts` 的 priceMultiplier 里。
 * data/ 里既有纯数据也有逻辑函数（traits/titles/nations 都有计算），
 * 按目录排除会漏掉这类"同一层里的消费"。按**文件**排除才对。
 * types/ 仍排除：那里只有接口声明，出现字段名不代表有人读。
 */
const typeFiles = new Set(all.filter(f => f.startsWith('types/')))
const fileText = new Map(all.map(f => [f, fs.readFileSync(path.join(SRC, f), 'utf8')]))
const typeText = [...typeFiles].map(f => fileText.get(f)).join('\n')

const countIn = (txt, key) => {
  const re = new RegExp(`(?<![A-Za-z0-9_])${key}(?![A-Za-z0-9_])`, 'g')
  return (txt.match(re) ?? []).length
}

// 通用字段/类型关键字：这些在任何数据表里都有，不代表"没接线"
const COMMON = new Set([
  'id', 'name', 'nameCn', 'title', 'text', 'desc', 'description', 'label', 'value', 'key',
  'type', 'kind', 'icon', 'color', 'image', 'img', 'src', 'url', 'path', 'order', 'day',
  'difficulty', 'region', 'latitude', 'longitude', 'level', 'tier', 'weight', 'chance',
  'gain', 'loss', 'cost', 'price', 'amount', 'gold', 'fame', 'score', 'min', 'max',
  'enabled', 'visible', 'hidden', 'note', 'notes', 'tags', 'group', 'category', 'subtitle',
  'iconName', 'accent', 'tone', 'variant', 'size', 'width', 'height', 'ratio', 'alpha',
])

const rows = []
for (const f of dataFiles) {
  const txt = fs.readFileSync(path.join(SRC, f), 'utf8')
  // 行首缩进 + key: —— 只认对象字面量的键，不认三元/参数
  const keys = new Map()
  for (const m of txt.matchAll(/^\s{2,}([A-Za-z_][A-Za-z0-9_]*)\s*:/gm)) {
    const k = m[1]
    keys.set(k, (keys.get(k) ?? 0) + 1)
  }
  for (const [k, count] of keys) {
    if (COMMON.has(k)) continue
    if (k.startsWith('_')) continue
    let used = 0
    for (const [g, txt] of fileText) {
      if (g === f || typeFiles.has(g)) continue
      used += countIn(txt, k)
    }
    if (used === 0) {
      rows.push({ file: f.replace('data/', ''), key: k, count, inTypes: typeText.includes(k) })
    }
  }
}

rows.sort((a, b) => b.count - a.count)
console.log(`data/ 下 ${dataFiles.length} 个表，可疑死字段 ${rows.length} 个（消费方 0 次引用）\n`)
console.log('表'.padEnd(24), '字段'.padEnd(26), '出现 类型里?')
for (const r of rows) {
  console.log(r.file.padEnd(24), r.key.padEnd(26), String(r.count).padStart(4), r.inTypes ? '  是' : '  —')
}
