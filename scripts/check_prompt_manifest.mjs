// 核对第三批清单与代码的一致性：
//   1) 清单 11 条的 sceneKey → 文件名，与 SCENE_IMAGES 映射表是否一一对应
//   2) 清单里的事件标题，与 events.ts 里的真实标题是否一致
//   3) 清单里的 prompt 段落数与条目数是否匹配（防止漏写 prompt）
import fs from 'node:fs'

const md = fs.readFileSync('视觉资产Prompt清单_第三批.md', 'utf8')
const si = fs.readFileSync('src/data/sceneImages.ts', 'utf8')
const ev = fs.readFileSync('src/data/events.ts', 'utf8')

const heads = [...md.matchAll(/^## \d+\. (\w+) (.+?)（`(d\d+)\.png`）/gm)].map(m => ({
  key: m[1], title: m[2], file: m[3],
}))
console.log('清单条目数：' + heads.length)

const map = {}
for (const m of si.matchAll(/^\s*(\w+): `\$\{BASE\}([^`]+)`/gm)) {
  map[m[1]] = m[2].replace('assets/scenes/', '')
}

console.log('\n① 文件名 ↔ 映射表')
let bad = 0
for (const h of heads) {
  const mf = map[h.key]
  const ok = mf === h.file + '.png'
  if (!ok) bad++
  console.log((ok ? '  ✓ ' : '  ✗ ') + h.key.padEnd(10) + (h.file + '.png').padEnd(10) +
    (ok ? '' : '← 映射表是 ' + (mf || '无')))
}
console.log(bad ? '❌ ' + bad + ' 处对不上' : '✅ 11 条 prompt 与映射表完全对应')

console.log('\n② 事件标题 ↔ events.ts')
for (const h of heads) {
  const re = new RegExp("sceneKey: '" + h.key + "',\\s*\\n\\s*title: '([^']+)'")
  const m = ev.match(re)
  const real = m ? m[1] : '未找到'
  const ok = real === h.title
  if (!ok) bad++
  console.log((ok ? '  ✓ ' : '  ✗ ') + h.key.padEnd(10) +
    '清单:' + h.title.padEnd(12) + '实际:' + real)
}

console.log('\n③ prompt 代码块数量（场景 prompt 应为 11）')
// 全文共 13 个围栏块：11 条场景 prompt + 2 个说明块（流水线示意、负面提示）
// 只统计真正的场景 prompt：以场景描述开头的那些
const allBlocks = []
{
  const lines = md.split('\n')
  let inBlock = false, cur = '', start = 0
  lines.forEach((L, i) => {
    if (L.trim() === '```') {
      if (!inBlock) { inBlock = true; cur = ''; start = i + 1 }
      else { inBlock = false; allBlocks.push({ line: start, text: cur }) }
      return
    }
    if (inBlock) cur += L + '\n'
  })
}
const sceneBlocks = allBlocks.filter(b => /^(Wide|The|An?|A )/.test(b.text.trimStart()))
const infoBlocks = allBlocks.filter(b => !/^(Wide|The|An?|A )/.test(b.text.trimStart()))
console.log('  场景 prompt ' + sceneBlocks.length + ' 条 + 说明块 ' + infoBlocks.length + ' 个' +
  (sceneBlocks.length === 11 ? ' ✓' : ' ✗'))
if (sceneBlocks.length !== 11) bad++
infoBlocks.forEach(b => console.log('    说明块（行 ' + b.line + '）：' + b.text.trim().split('\n')[0].slice(0, 50)))

console.log('\n④ 每条是否含风格锚点 + 底部压暗已剔除')
const ANCHOR = '16th-century hand-engraved copperplate nautical chart aesthetic'
const sections = md.split(/^## \d+\. /m).slice(1)
for (const s of sections) {
  const key = (s.match(/^(\w+)/) || [])[1]
  if (!key) continue
  const hasAnchor = s.includes(ANCHOR)
  const hasOldReq = /bottom quarter darker/i.test(s)
  if (!hasAnchor || hasOldReq) bad++
  console.log((hasAnchor && !hasOldReq ? '  ✓ ' : '  ✗ ') + key.padEnd(10) +
    '锚点:' + (hasAnchor ? '有' : '无') + '  旧压暗要求:' + (hasOldReq ? '仍在 ←' : '已剔除'))
}

console.log('\n' + (bad ? '❌ 共 ' + bad + ' 处不一致' : '✅ 清单与代码完全一致'))
process.exit(bad ? 1 : 0)
