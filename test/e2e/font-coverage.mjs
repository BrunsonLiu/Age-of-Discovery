// 中文子集字体覆盖：界面文案里每个字，是不是真的由 **webfont** 画出来的。
//
// 跑法：先起 dev server，再 `node test/e2e/font-coverage.mjs`
//
// 【为什么需要这条检查】自托管字体是按文案现切的子集（`.workbuddy/make_font_subset.py`）。
// 文案一长就会漏字，漏字**不报错**：浏览器静默回退到本机的另一个衬线体，
// 同一句话里出现两种字形。实测旧子集漏了 41 个字，全在事件正文与对白里
// （啊/梅/鸡/酸/饼/舢/啐…），而**本机恰好装了同款 Noto Serif SC**，
// 所以肉眼和截图都看不出差别 —— 这类 bug 只能靠"字形来自哪个字体文件"来判。
//
// 【两个失败过的判据，别再用】
//   ① `document.fonts.check('16px "Noto Serif SC"', ch)` —— **恒为 true**：
//      它把系统回退字体也算成"这个字体族能画"，查不出缺字。
//   ② 画布位图对比（webfont vs `serif` 各画一次，比像素）—— 本机装了同款字体，
//      缺字时"回退"出来的字形几乎一样（航 diff=3 像素、龘 diff=0），无法区分。
//
// 【可用的判据】CDP `CSS.getPlatformFontsForNode` 返回**实际参与绘制**的字体，
// 每个条目带 `isCustomFont`（webfont = true，本机装 = false）。所以：
//   把全部界面用字塞进一个节点 → 只要有一笔来自非 webfont，就是缺字。
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

let puppeteer
try { puppeteer = (await import('puppeteer-core')).default }
catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js')).default }

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const SHOTS = process.env.SHOTS_DIR ?? '.workbuddy/shots'
mkdirSync(SHOTS, { recursive: true })

/** 收集 src 里「界面文案」用到的字：去掉注释，只取字符串字面量与 JSX 文本节点 */
function collectUsedChars() {
  const walk = dir => readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
  const used = new Set()
  // 与 make_font_subset.py 同一套判据（正则一致），否则两边会各说一套
  const lit = /'([^'\\\n]*)'|"([^"\\\n]*)"|`([^`\\]*)`|>([^<>{}]*)</gs
  for (const p of walk('src').filter(f => /\.(ts|tsx|css|html)$/.test(f))) {
    let s = readFileSync(p, 'utf8')
    s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const m of s.matchAll(lit)) {
      for (const g of m.slice(1)) {
        if (!g) continue
        for (const ch of g) if (ch >= '\u3000' && ch <= '\u9fff') used.add(ch)
      }
    }
  }
  return [...used].sort()
}

const chars = collectUsedChars()
console.log('\n===== 中文子集字体覆盖 =====')
console.log(`界面文案用到的字：${chars.length} 个（含中文标点）`)

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => document.fonts.ready)

let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log('  ✓', msg) } else { fail++; console.log('  ✗ FAIL:', msg) } }
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 用**游戏真实的字体栈**（从 body 上取），而不是自己编一个 —— 否则测的是另一套 CSS
const stack = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
console.log(`  正文字体栈：${stack.slice(0, 80)}`)

/** 摆一个节点（用给定字体栈），返回 CDP 报告的实际字体 */
async function fontsOf(text, fontFamily) {
  const { root } = await page.evaluateHandle((t, fam) => {
    document.getElementById('__fontprobe')?.remove()
    const d = document.createElement('div')
    d.id = '__fontprobe'
    d.style.cssText = `position:fixed;left:0;top:0;width:1100px;font-size:20px;line-height:1.6;`
      + `color:#000;background:#fff;z-index:99999;font-family:${fam}`
    d.textContent = t
    document.body.appendChild(d)
    return d
  }, text, fontFamily).then(h => h.asElement())
  await sleep(350)
  const cdp = await page.createCDPSession()
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
  const { root: domRoot } = await cdp.send('DOM.getDocument', { depth: -1 })
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: domRoot.nodeId, selector: '#__fontprobe' })
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
  await cdp.detach()
  await page.evaluate(() => document.getElementById('__fontprobe')?.remove())
  return fonts
}

// ---- 1. 全部界面用字：每一笔都必须来自 webfont ----
const all = chars.join('')
const fonts = await fontsOf(all, stack)
const total = fonts.reduce((a, f) => a + f.glyphCount, 0)
console.log(`  实际绘制字体：${fonts.map(f => `${f.familyName}×${f.glyphCount}${f.isCustomFont ? '(webfont)' : '(本机)'}`).join('  ')}`)
const local = fonts.filter(f => !f.isCustomFont)
check(fonts.length > 0 && total > chars.length * 0.9,
  `节点里的字确实被画出来了（${total} 个字形 / ${chars.length} 个字）`)
check(local.length === 0,
  `全部由 webfont 绘制，没有回退到本机字体${local.length ? ' → 来自本机：' + local.map(f => `${f.familyName}×${f.glyphCount}`).join(',') : ''}`)

// ---- 2. 对照组：判据必须能抓到"缺字" ----
// 故意用一队确定不在子集里的生僻字（龘齉爨），配合一个**只写 webfont、不带回退**的字体栈：
// 这种情况下浏览器只能去本机找字形，报告里必然出现 isCustomFont=false。
// 如果这一步也报"全 webfont"，说明判据失灵，上面那条通过也不算数。
const ctrlFonts = await fontsOf('龘齉爨', "'Noto Serif SC'")
const ctrlLocal = ctrlFonts.filter(f => !f.isCustomFont)
check(ctrlLocal.length > 0,
  `判据有区分力：生僻字「龘齉爨」被认出是由本机字体补的（${ctrlFonts.map(f => f.familyName).join(',')}）`)

// ---- 3. 抽真实句子目检（截图给人看） ----
const sample = '你焐开火漆，用铜片压出暗记。一条小舢板靠上你的船，有人朝你的背影啐了一口。'
const sampleFonts = await fontsOf(sample, stack)
console.log(`  样例句字体：${sampleFonts.map(f => `${f.familyName}×${f.glyphCount}${f.isCustomFont ? '(webfont)' : '(本机)'}`).join('  ')}`)
check(sampleFonts.every(f => f.isCustomFont), '含生僻字的真实句子也是全 webfont 绘制')
await page.evaluate((t, fam) => {
  const d = document.createElement('div')
  d.id = 'font-sample'
  d.style.cssText = `position:fixed;inset:0;z-index:99998;background:#f5ecd8;color:#2b1e0e;`
    + `font-family:${fam};padding:36px;line-height:2;font-size:26px`
  d.textContent = t
  document.body.appendChild(d)
}, sample, stack)
await page.screenshot({ path: `${SHOTS}/font-sample.png` })
await page.evaluate(() => document.getElementById('font-sample')?.remove())

writeFileSync('.workbuddy/font-coverage.json', JSON.stringify({ chars: chars.length, fonts, ctrlFonts, sampleFonts, errors }, null, 1))
check(errors.length === 0, `全程运行时错误 0 条${errors.length ? ' → ' + errors.slice(0, 2).join(' | ') : ''}`)

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
await browser.close()
process.exit(fail > 0 ? 1 : 0)
