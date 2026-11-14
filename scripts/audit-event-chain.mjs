// 事件链审计：找出「写了但玩家永远碰不到」的事件。
//
// 为什么值得查：事件表 236 条、23 处 setsFlag、5 处 requiresFlags。
// 只要有一个旗标没人设置、或者 requiresFlags 与 conflictsWithFlags 自相矛盾，
// 那条事件就是死内容 —— 不报错、不显形，只有靠"把链梳一遍"才发现。
//
// 检查项：
//   1. id 唯一
//   2. requiresCrew 里的船员 id 存在
//   3. sceneKey 在场景注册表里
//   4. miniGame 在 7 个已知玩法里；enemyShip 只用于 cannon
//   5. 每个选项的 outcome probability 和 = 1
//   6. requiresFlags 引用的旗标一定有人 setsFlag（全 src 范围）
//   7. 同一条事件 requiresFlags ∩ conflictsWithFlags = ∅（否则永不触发）
//   8. 同一派系 factionMin > factionMax（否则永不触发）
//
// 跑法：node scripts/audit-event-chain.mjs
import * as esbuild from 'esbuild'
import { pathToFileURL } from 'node:url'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const OUT = 'node_modules/.cache/audit-events.mjs'

await esbuild.build({
  stdin: {
    contents: `
      export { events } from './src/data/events'
      export { CREW_CHARS } from './src/data/crewChars'
      export { SCENE_KEYS } from './src/components/events/EventScene'
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: OUT,
  alias: { '@': resolve('src') },
  logLevel: 'warning',
})

const { events, CREW_CHARS, SCENE_KEYS } = await import(pathToFileURL(resolve(OUT)).href)

const MINIGAMES = ['cannon', 'boarding', 'escape', 'lookout', 'gamble', 'haggle', 'storm']
const crewIds = new Set(CREW_CHARS.map(c => c.id))
const sceneKeys = new Set(SCENE_KEYS)

// 旗标设置方：events 里的 setsFlag + 代码里直接写 eventFlags 的地方
const srcFiles = (function walk(dir, acc = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(p)) acc.push(p)
  }
  return acc
})('src')
const allSrc = srcFiles.map(f => readFileSync(f, 'utf8')).join('\n')

const setters = new Set()
for (const e of events) {
  for (const c of e.choices) for (const o of c.outcomes ?? []) {
    if (o.setsFlag) setters.add(o.setsFlag)
  }
}
// 代码里可能直接 setState({ eventFlags: { xxx: 1 } }) —— 把这种也认进来
for (const m of allSrc.matchAll(/eventFlags:\s*\{[^}]*\}/g)) {
  for (const k of m[0].matchAll(/([a-zA-Z0-9_]+)\s*:/g)) setters.add(k[1])
}
for (const m of allSrc.matchAll(/eventFlags\[['"]([a-zA-Z0-9_]+)['"]\]/g)) setters.add(m[1])

const problems = []
const push = (kind, id, msg) => problems.push({ kind, id, msg })

const seenIds = new Set()
for (const e of events) {
  if (seenIds.has(e.id)) push('重复 id', e.id, `id ${e.id} 出现了两次`)
  seenIds.add(e.id)

  const tc = e.triggerCondition ?? {}

  for (const c of tc.requiresCrew ?? []) {
    if (!crewIds.has(c)) push('船员不存在', e.id, `requiresCrew: '${c}' 不在 crewChars 里`)
  }
  if (e.sceneKey && !sceneKeys.has(e.sceneKey)) {
    push('场景不存在', e.id, `sceneKey: '${e.sceneKey}' 不在 EventScene 注册表里`)
  }

  const req = tc.requiresFlags ?? []
  const conf = tc.conflictsWithFlags ?? []
  for (const f of req) {
    if (!setters.has(f)) push('断链', e.id, `requiresFlags: '${f}' 没有任何地方 setsFlag —— 这条永远触发不了`)
  }
  for (const f of conf) {
    if (!setters.has(f)) push('断链', e.id, `conflictsWithFlags: '${f}' 没有任何地方设置 —— 这条判据是摆设`)
  }
  const both = req.filter(f => conf.includes(f))
  if (both.length) push('自相矛盾', e.id, `同时 requires 和 conflicts: ${both.join(',')} —— 永远触发不了`)

  for (const [fid, min] of Object.entries(tc.factionMin ?? {})) {
    const max = (tc.factionMax ?? {})[fid]
    if (max != null && min > max) push('区间为空', e.id, `factionMin.${fid}=${min} > factionMax.${fid}=${max}`)
  }

  e.choices.forEach((c, ci) => {
    if (c.miniGame && !MINIGAMES.includes(c.miniGame)) {
      push('玩法不存在', e.id, `选项 ${ci + 1} 的 miniGame: '${c.miniGame}' 不在 7 个玩法里`)
    }
    if (c.enemyShip && c.miniGame !== 'cannon') {
      push('冗余字段', e.id, `选项 ${ci + 1} 写了 enemyShip 但 miniGame 不是 cannon`)
    }
    const outs = c.outcomes ?? []
    if (!outs.length) { push('空结果', e.id, `选项 ${ci + 1} 没有 outcomes`); return }
    const sum = outs.reduce((s, o) => s + (o.probability ?? 0), 0)
    if (Math.abs(sum - 1) > 0.001) {
      push('概率和≠1', e.id, `选项 ${ci + 1} 的概率和 = ${sum.toFixed(3)}`)
    }
  })
}

// 反向：设置了但没有任何事件消费的旗标（不是错误，但值得知道）
const consumed = new Set()
for (const e of events) for (const f of e.triggerCondition?.requiresFlags ?? []) consumed.add(f)
const unusedFlags = [...setters].filter(f => !consumed.has(f))

console.log(`事件 ${events.length} 条 · 场景键 ${sceneKeys.size} 个 · 船员 ${crewIds.size} 位`)
console.log(`旗标：设置方 ${setters.size} 种，被 requiresFlags 消费 ${consumed.size} 种`)
console.log(`\n问题 ${problems.length} 条：`)
const byKind = {}
for (const p of problems) (byKind[p.kind] ??= []).push(p)
for (const [kind, list] of Object.entries(byKind)) {
  console.log(`\n[${kind}] ${list.length}`)
  for (const p of list.slice(0, 12)) console.log(`  #${p.id}  ${p.msg}`)
  if (list.length > 12) console.log(`  …余 ${list.length - 12} 条`)
}
if (unusedFlags.length) {
  console.log(`\n[只设置、没人消费的旗标] ${unusedFlags.length}：${unusedFlags.join(', ')}`)
  console.log('  （不一定是错：可能是给日志/结局用的。但如果是设计的事件链，说明后半段没写）')
}
process.exit(problems.length ? 1 : 0)
