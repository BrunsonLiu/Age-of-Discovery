// 核对：events.ts 里用到的每个 sceneKey 是否都在 SCENE_IMAGES 里有映射
import fs from 'node:fs'

const ev = fs.readFileSync('src/data/events.ts', 'utf8')
const keys = [...new Set([...ev.matchAll(/sceneKey:\s*'([^']+)'/g)].map(m => m[1]))].sort()

const si = fs.readFileSync('src/data/sceneImages.ts', 'utf8')
const mapped = [...si.matchAll(/^\s*(\w+):\s*`/gm)].map(m => m[1])

console.log('事件里用到的 sceneKey（' + keys.length + '）：')
console.log('  ' + keys.join(', '))
console.log('SCENE_IMAGES 映射（' + mapped.length + '）：')
console.log('  ' + mapped.join(', '))

const missing = keys.filter(k => !mapped.includes(k))
const orphan = mapped.filter(k => !keys.includes(k))
console.log(missing.length ? '❌ 未覆盖: ' + missing.join(', ') : '✅ 全部覆盖')
console.log(orphan.length ? '⚠ 映射了但无事件使用: ' + orphan.join(', ') : '✅ 无多余映射')

// 映射对应的文件是否存在（缺图会走 onError 回退 SVG，不白屏）
// 映射写法：  key: `${BASE}assets/scenes/dNN.png`
// BASE 运行时展开为 '/Age-of-Discovery/'，落盘路径是 public/assets/scenes/dNN.png
const missingFiles = []
for (const k of mapped) {
  const m = si.match(new RegExp('^\\s*' + k + ':\\s*`\\$\\{BASE\\}([^`]+)`', 'm'))
  if (!m) { missingFiles.push(k + '(解析失败)'); continue }
  const fp = 'public/' + m[1].replace(/^\//, '')
  if (!fs.existsSync(fp)) missingFiles.push(k + ' → ' + fp)
}
console.log('映射了但文件未交付（' + missingFiles.length + '）：')
if (missingFiles.length) console.log('  ' + missingFiles.join('\n  '))
else console.log('  （无）')
process.exit(missing.length ? 1 : 0)
