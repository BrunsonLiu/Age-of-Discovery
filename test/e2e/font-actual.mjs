// 中文实际渲染字体取证：CSS 里写的 font-family 不等于浏览器真正用的字体
//
// 跑法：`node test/e2e/font-actual.mjs`
//
// 【为什么不能看 cssText】
// 字体栈是 `Crimson Text, "Noto Serif SC", serif` 这类多级回落。Crimson Text 没有中文字形，
// 所以屏幕上每个汉字其实由**回落链里第一个含中文字形的字体**绘制。CSS 里写了什么完全不说明
// 屏幕上长什么样。Windows 上常见的坏结果是落到「宋体 / SimSun」——12px 下笔画粘连，
// 观感廉价，而且 max 字号下也不长肉。
//
// 唯一可信的取证是 CDP 的 `CSS.getPlatformFontsForNode`：它返回浏览器**实际用于绘制**
// 的字体族名与字形数。用它逐节点核对。

let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = process.env.GAME_URL ?? 'http://127.0.0.1:5174/Age-of-Discovery/'
const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2500)

const clickIn = (ov, bt) => page.evaluate((o, b) => {
  const ovl = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')].find(x => new RegExp(o).test(x.textContent || ''))
  const btn = ovl && [...ovl.querySelectorAll('button')].find(x => new RegExp(b).test(x.textContent || ''))
  if (btn) btn.click()
}, ov, bt)
for (const [a, b] of [['翻开日志', '翻开日志'], ['塞维利亚港', '继续']]) { await clickIn(a, b); await sleep(450) }
await page.evaluate(() => document.querySelector('button[data-mode="captain"]')?.click()); await sleep(400)
await clickIn('你想怎么玩', '继续'); await sleep(700)
await page.evaluate(() => {
  const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /选择你的天赋/.test(x.textContent || ''))
  if (!o) return
  ;[...o.querySelectorAll('button')].filter(b => /商界血脉|铁壁舰长|魅力领袖|天生探险家|随船医生/.test(b.textContent || ''))[0]?.click()
}); await sleep(400)
await clickIn('扬帆起航', '扬帆起航'); await sleep(700)
await clickIn('第一次出航', '启航'); await sleep(1500)
await clickIn('跳过引导', '跳过引导'); await sleep(400)
await page.keyboard.press('Escape'); await sleep(400)
await page.keyboard.press('Escape'); await sleep(700)

// 等 webfont 落地，否则量到的是后备字体
await page.evaluate(() => document.fonts.ready)

const cdp = await page.createCDPSession()
await cdp.send('DOM.enable')
await cdp.send('CSS.enable')
const { root } = await cdp.send('DOM.getDocument', { depth: -1 })

// 挑 12 个代表性中文节点（各区域、各字号各一）
const picks = await page.evaluate(() => {
  const want = [
    { sel: 'button', re: /舰队/, label: '左栏·舰队' },
    { sel: 'button', re: /见闻/, label: '左栏·见闻' },
    { sel: '*', re: /^晴朗$/, label: '左栏·天气' },
    { sel: '*', re: /^粮$/, label: '底栏·粮标签' },
    { sel: '*', re: /^士气$/, label: '底栏·士气标签' },
    { sel: '*', re: /塞维利亚/, label: '港口名' },
    { sel: 'button', re: /3D 海图/, label: '右上·3D 按钮' },
    { sel: '*', re: /买进并起航/, label: '掮客卡·按钮' },
    { sel: '*', re: /加的斯/, label: '掮客卡·航线' },
    { sel: '*', re: /哥伦布发现新大陆/, label: '顶栏·事件名' },
  ]
  const out = []
  for (const w of want) {
    const cands = [...document.querySelectorAll(w.sel)].filter(el => {
      let t = ''
      for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent
      const r = el.getBoundingClientRect()
      return w.re.test(t.trim()) && r.width > 1 && r.height > 1
    })
    if (cands[0]) out.push({ label: w.label, html: cands[0].outerHTML.slice(0, 90) })
  }
  return out
})

const resolve = async (nodeId) => {
  try {
    const { node } = await cdp.send('DOM.describeNode', { backendNodeId: nodeId })
    return node
  } catch { return null }
}

// 用 Runtime 里挂一个临时钩子拿 DOM 节点，再交给 CSS.getPlatformFontsForNode
const results = []
for (const p of picks) {
  const res = await page.evaluate(async (html) => {
    const els = [...document.querySelectorAll('body *')].filter(e => e.outerHTML.slice(0, 90) === html)
    const el = els[0]
    if (!el) return null
    el.setAttribute('data-fontprobe', '1')
    const cs = getComputedStyle(el)
    let t = ''
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.textContent
    return { text: t.trim(), size: cs.fontSize, weight: cs.fontWeight, family: cs.fontFamily, ls: cs.letterSpacing }
  }, p.html)
  if (!res) { results.push({ label: p.label, err: 'node gone' }); continue }
  try {
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '[data-fontprobe="1"]' })
    const fonts = nodeId ? await cdp.send('CSS.getPlatformFontsForNode', { nodeId }) : { fonts: [] }
    await page.evaluate(() => document.querySelector('[data-fontprobe="1"]')?.removeAttribute('data-fontprobe'))
    results.push({ label: p.label, ...res, fonts: fonts.fonts.map(f => `${f.familyName}×${f.glyphCount}${f.isCustomFont ? '(webfont)' : ''}`) })
  } catch (e) {
    await page.evaluate(() => document.querySelector('[data-fontprobe="1"]')?.removeAttribute('data-fontprobe'))
    results.push({ label: p.label, ...res, err: e.message.slice(0, 60) })
  }
}

console.log('\n=== 中文实际渲染字体（CDP getPlatformFontsForNode）===')
for (const r of results) {
  console.log(`\n[${r.label}] ${r.size} / w${r.weight} / ls ${r.ls}`)
  console.log(`  文本: ${r.text}`)
  console.log(`  CSS : ${(r.family || '').slice(0, 110)}`)
  console.log(`  实际: ${r.fonts ? r.fonts.join('  ') : r.err}`)
}

// 另外确认 index.css 的字体栈与 webfont 加载状态
const cssInfo = await page.evaluate(() => {
  const body = getComputedStyle(document.body)
  const faces = [...document.fonts].map(f => `${f.family}/${f.weight}/${f.status}`)
  return { bodyFamily: body.fontFamily, size: body.fontSize, faces }
})
console.log(`\n=== body ===\n  family: ${cssInfo.bodyFamily}\n  size: ${cssInfo.size}`)
console.log(`  @font-face: ${cssInfo.faces.join(' | ') || '(无)'}`)

await browser.close()
