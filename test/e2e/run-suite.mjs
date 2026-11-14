/**
 * 串行跑一组 e2e 套件，汇总「N 通过 / M 失败」。
 *
 * 【为什么需要它】75 个脚本里混着探针（probe-*）、剖析器（profile-*）、工具
 * （serve-gzip、shot）。人肉一个个跑既慢又容易漏；而这次改动横跨合并递归、
 * 撒点分片、空闲调度、字体拆分、组件挂载条件 —— 正是最该整组回归的时候。
 *
 * 【为什么必须串行】每个套件都会自己起无头 Edge、抢 CPU。并行跑会互相把帧率
 * 压下来，于是"看起来卡"的断言随机红（记忆里踩过）。
 *
 * 用法：
 *   node test/e2e/run-suite.mjs                 # 默认那组（受本轮改动影响的）
 *   node test/e2e/run-suite.mjs --all           # 除了需要特殊环境的全部
 *   node test/e2e/run-suite.mjs a.mjs b.mjs     # 指定
 *   node test/e2e/run-suite.mjs --port=5203 ... # 指到生产预览
 */
import { spawn } from 'node:child_process'
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs'

const args = process.argv.slice(2)
const port = (args.find((a) => a.startsWith('--port=')) ?? '--port=5174').split('=')[1]
const ALL = args.includes('--all')
const picked = args.filter((a) => a.endsWith('.mjs')).map((a) => (a.includes('/') ? a.split('/').pop() : a))

/**
 * 默认组：这条性能线里被改到的东西 ——
 * 甲板合并递归 / 3D 撒点分片 / 空闲调度 / 字体拆分 / DeckView 条件挂载 / 启动屏 / CSS。
 */
const DEFAULT = [
  'deck-view.mjs', 'deck-harbor.mjs',
  'map3d-check.mjs', 'map3d-legends.mjs',
  'map-legibility.mjs', 'map-grid.mjs', 'map-climate.mjs', 'map-rings.mjs',
  'map-scale.mjs', 'map-surf.mjs', 'map-sealayers.mjs',
  'font-coverage.mjs', 'intro-check.mjs', 'first-run.mjs',
  'clickable-audit.mjs', 'layout-audit.mjs', 'small-text-audit.mjs',
  'harbor-mood.mjs', 'harbor-life.mjs',
  'event-result.mjs', 'arrival-receipt.mjs', 'logbook.mjs',
  'voyage-smoke.mjs', 'trade-quote.mjs', 'mobile-layout.mjs',
]

/** 需要特殊环境的（生产包 / 线上 / 缺资源），默认跳过，避免把工具问题记成产品问题 */
const NEEDS_SPECIAL = [
  'live-smoke.mjs',        // 打线上
  'mobile-prod.mjs',       // 要生产包
  'scene-missing-prod.mjs', // 要故意缺资源的包
  'font-actual.mjs',
]

const list = picked.length
  ? picked
  : ALL
    ? readdirSync('test/e2e')
        .filter((f) => f.endsWith('.mjs') && !f.startsWith('_') && !NEEDS_SPECIAL.includes(f))
        /* 探针与工具没有断言，跑它们只会让汇总失真 */
        .filter((f) => !/^(serve-gzip|probe-|profile-|shot\.mjs|drawcount-src|measure-|map-diag|run-suite)/.test(f))
    : DEFAULT

mkdirSync('.workbuddy/shots', { recursive: true })
const results = []
const t0 = Date.now()

for (const f of list) {
  const started = Date.now()
  const out = await new Promise((resolve) => {
    const p = spawn(process.execPath, [`test/e2e/${f}`, `--port=${port}`], {
      env: { ...process.env, NO_PROXY: '*', GAME_URL: `http://127.0.0.1:${port}/Age-of-Discovery/` },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let buf = ''
    p.stdout.on('data', (d) => { buf += d.toString() })
    p.stderr.on('data', (d) => { buf += d.toString() })
    /* 单个套件超过 5 分钟就是卡死，别让整轮停在那儿 */
    const timer = setTimeout(() => { p.kill('SIGKILL'); buf += '\n[超时 300s，已强杀]' }, 300000)
    p.on('exit', (code) => { clearTimeout(timer); resolve({ code, buf }) })
  })
  const m = out.buf.match(/结果：\s*(\d+)\s*通过\s*\/\s*(\d+)\s*失败(?:\s*\/\s*(\d+)\s*跳过)?/)
  const pass = m ? Number(m[1]) : 0
  const fail = m ? Number(m[2]) : (out.code === 0 ? 0 : 1)
  const skip = m ? Number(m[3] ?? 0) : 0
  const secs = ((Date.now() - started) / 1000).toFixed(0)
  results.push({ f, pass, fail, skip, secs: Number(secs), ok: fail === 0 && out.code === 0 })
  console.log(
    `${fail === 0 && out.code === 0 ? '✓' : '✗'} ${f.padEnd(26)} ` +
    `${m ? `${pass} 通过 / ${fail} 失败${skip ? ` / ${skip} 跳过` : ''}` : `无汇总行（exit ${out.code}）`}  ${secs}s`,
  )
  if (fail > 0 || !m) {
    /* 只把失败行留档，别把整份 stdout 灌进屏幕 */
    const lines = out.buf.split('\n').filter((l) => /✗|FAIL|Error|错误|超时/.test(l)).slice(0, 12)
    for (const l of lines) console.log('     ' + l.trim().slice(0, 160))
  }
}

const bad = results.filter((r) => !r.ok)
const total = results.reduce((s, r) => s + r.pass, 0)
const totalFail = results.reduce((s, r) => s + r.fail, 0)
console.log(
  `\n===== ${results.length} 个套件 / ${((Date.now() - t0) / 1000 / 60).toFixed(1)} 分钟 =====\n` +
  `断言合计 ${total} 通过 / ${totalFail} 失败` +
  (bad.length ? `\n失败套件：${bad.map((r) => r.f) .join(', ')}` : '\n全部通过'),
)
writeFileSync('.workbuddy/e2e-suite.json', JSON.stringify({ port, results, at: new Date().toISOString() }, null, 1))
if (bad.length) process.exitCode = 1
