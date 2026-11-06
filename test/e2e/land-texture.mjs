/**
 * 陆地纹理审计：羊皮纸的颗粒到底看不看得见，以及有没有平铺接缝。
 *
 * 【为什么需要这个脚本】
 * 陆地在默认视角下占屏约 40%，是屏幕上**面积最大的一块材质**。
 * 但它曾经是「加了纹理却看不见」：pattern 里叠了一张羊皮纸位图，上面再盖
 * 一层 0.42 的平色把它压暗回目标色，结果横向采样只有 ±3/255 的波动
 * ——和木纹那次一样，代码里有、屏幕上看不出。
 *
 * 更糟的是位图平铺：240px 的 pattern 单元用 preserveAspectRatio="slice"
 * 把 360px 的图裁成中心 240px，左右边缘来自图的不同位置，于是每 240px
 * 出现一道矩形接缝（7 倍放大下能看出一条硬边）。
 *
 * 指标只有一个：**grain** —— 陆地像素的亮度标准差（纹理幅度）。
 * 判据 ≥ 6；低于 4 就是「有纹理但看不见」（改前实测 3.21，改后 7.13）。
 *
 * 【为什么没有"接缝"断言】
 * 这一层测不了。旧的位图 pattern 确实有接缝（落在 x=960 / y=480，正好是单元
 * 240 的整数倍），但台阶只有 1.8 个亮度级——比纸张自身斑驳的起伏还小。
 * 我试过两个统计判据都不行：
 *   · 「最大相邻列差 / 中位差」：纹理一加幅度就误报（抓到的是斑驳边缘，
 *     位置随机、彼此不相差同一周期）；
 *   · 「相邻列差的自相关在 lag=P 处偏高」：拿改前的截图跑 r=0.184，**照样通过**。
 * 一份不会失败的判据比没有更糟，因为它给的是"已验证"的错觉。
 * 接缝改成在构造层断言（test/logic.test.ts：图片尺寸必须精确等于单元、不许 slice），
 * 那里是确定性的，注入旧写法立刻 FAIL。
 *
 * 用法：node test/e2e/land-texture.mjs [--shot=路径]   （给 --shot 则只分析已有截图）
 */
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default } catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default }
const { readFileSync, writeFileSync, existsSync } = await import('node:fs')
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const argOf = (k) => { const h = process.argv.find((a) => a.startsWith(`--${k}=`)); return h ? h.split('=')[1] : undefined }

const VW = 1440, VH = 900
const SHOT = argOf('shot') ?? '.workbuddy/shots/land-tex.png'

if (!existsSync(SHOT) || !argOf('shot')) {
  // 没有现成截图就现截一张（桌面默认视野，地图常态）
  const b = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
  const p = await b.newPage()
  await p.setViewport({ width: VW, height: VH })
  await p.goto('http://127.0.0.1:5174/Age-of-Discovery/', { waitUntil: 'networkidle2', timeout: 60000 })
  await p.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await p.reload({ waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(2500)
  const clickIn = (o, t) => p.evaluate((o, t) => {
    const ov = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')].find((x) => new RegExp(o).test(x.textContent || ''))
    const btn = ov && [...ov.querySelectorAll('button')].find((x) => new RegExp(t).test(x.textContent || ''))
    if (btn) btn.click()
  }, o, t)
  for (const [a, c] of [['翻开日志', '翻开日志'], ['塞维利亚港', '继续']]) { await clickIn(a, c); await sleep(450) }
  await p.evaluate(() => document.querySelector('button[data-mode="captain"]')?.click()); await sleep(400)
  await clickIn('你想怎么玩', '继续'); await sleep(700)
  await p.evaluate(() => {
    const o = [...document.querySelectorAll('div.fixed.inset-0')].find((x) => /选择你的天赋/.test(x.textContent || ''))
    if (!o) return
    ;[...o.querySelectorAll('button')].filter((b) => /商界血脉|铁壁舰长|魅力领袖|天生探险家|随船医生/.test(b.textContent || ''))[0]?.click()
  }); await sleep(400)
  await clickIn('选择你的天赋', '启航'); await sleep(1500)
  await clickIn('跳过引导', '跳过引导'); await sleep(400)
  await p.keyboard.press('Escape'); await sleep(400)
  await p.keyboard.press('Escape'); await sleep(800)
  await p.screenshot({ path: SHOT })
  await b.close()
}

const b2 = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const p2 = await b2.newPage()
const b64 = readFileSync(SHOT).toString('base64')

const result = await p2.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  const g = c.getContext('2d'); g.drawImage(img, 0, 0)
  const W = img.width, H = img.height
  const full = g.getImageData(0, 0, W, H)

  /** 羊皮纸陆地：暖、亮、R 明显高于 B。海是冷色（B ≥ R）。 */
  const isLand = (i) => {
    const r = full.data[i], gg = full.data[i + 1], bb = full.data[i + 2]
    return r > 175 && r - bb > 40 && gg > 150
  }

  // 取样框：右侧大陆内部。刻意跨过 700 与 940 两个 pattern 单元边界
  const R = { x: 700, y: 380, w: 500, h: 380 }

  /** grain：只统计陆地像素，且先扣掉列均值与行均值（把大片明暗当"构图"去掉） */
  const vals = []
  const colSum = new Float64Array(R.w), colN = new Int32Array(R.w)
  const rowSum = new Float64Array(R.h), rowN = new Int32Array(R.h)
  const grid = new Float64Array(R.w * R.h).fill(NaN)
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      const i = ((R.y + y) * W + (R.x + x)) * 4
      if (!isLand(i)) continue
      const L = 0.2126 * full.data[i] + 0.7152 * full.data[i + 1] + 0.0722 * full.data[i + 2]
      grid[y * R.w + x] = L
      colSum[x] += L; colN[x]++
      rowSum[y] += L; rowN[y]++
      vals.push(L)
    }
  }
  const colMean = [], rowMean = []
  for (let x = 0; x < R.w; x++) colMean.push(colN[x] ? colSum[x] / colN[x] : NaN)
  for (let y = 0; y < R.h; y++) rowMean.push(rowN[y] ? rowSum[y] / rowN[y] : NaN)

  let s2 = 0, n = 0
  for (let y = 0; y < R.h; y++) {
    for (let x = 0; x < R.w; x++) {
      const v = grid[y * R.w + x]
      if (Number.isNaN(v) || Number.isNaN(colMean[x]) || Number.isNaN(rowMean[y])) continue
      // 去掉列/行均值再算标准差：只留"颗粒"，不把地形明暗算进去
      s2 += (v - colMean[x] - rowMean[y] + (vals.reduce((a, b) => a + b, 0) / vals.length)) ** 2
      n++
    }
  }
  const grain = Math.sqrt(s2 / n)

  /**
   * seam：相邻列的列均值差。接缝是某一列突然跳一下。
   *
   * 【必须只统计"整列都是陆地"的列】
   * 第一版没有这条过滤，最强的"接缝"落在 x=764~781（21.43，137× 中位差）——
   * 那是海岸线：那些列里只有薄薄一条陆地，另一半是海，虽然海像素已被 isLand
   * 剔除，但剩下来的陆地像素本身就在描边与抗锯齿的过渡带上，均值自然跳变。
   * 把海岸线的跳变当成"贴图接缝"会让人去改一个根本没坏的东西。
   * 判据用 60%（而不是 95%）：山丘符号是棕色，已被 isLand 剔除，但一座山只占
   * 一列里的十几像素；95% 会把绝大部分列都排除掉，反而测不出东西。
   * 60% 足以排除海岸线那种"只剩一条窄边"的列。
   */
  const FULL = 0.6
  const colOk = (x) => colN[x] >= R.h * FULL
  const rowOk = (y) => rowN[y] >= R.w * FULL
  const colDiff = [], rowDiff = []
  for (let x = 1; x < R.w; x++) {
    if (!colOk(x) || !colOk(x - 1) || Number.isNaN(colMean[x]) || Number.isNaN(colMean[x - 1])) continue
    colDiff.push({ at: R.x + x, d: Math.abs(colMean[x] - colMean[x - 1]) })
  }
  for (let y = 1; y < R.h; y++) {
    if (!rowOk(y) || !rowOk(y - 1) || Number.isNaN(rowMean[y]) || Number.isNaN(rowMean[y - 1])) continue
    rowDiff.push({ at: R.y + y, d: Math.abs(rowMean[y] - rowMean[y - 1]) })
  }
  const med = (arr) => { const s = arr.map((o) => o.d).sort((a, b) => a - b); return s[s.length >> 1] }
  const top = (arr, k) => [...arr].sort((a, b) => b.d - a.d).slice(0, k)
  const cm = med(colDiff), rm = med(rowDiff)
  const colTop = top(colDiff, 4)
  const rowTop = top(rowDiff, 4)

  /*
   * 【为什么不能只看"最大相邻差 / 中位差"】
   * 那个比值分不清两种完全不同的东西：
   *   · 贴图单元边界 —— 每 P 像素**必定**出现一次，是缺陷；
   *   · 纸浆厚薄的大块斑驳 —— 位置随机，是设计。
   * 第一版用比值，纹理一加幅度就误报（最强列 828/924/908/968，彼此不相差同一个周期，
   * 只是几团斑驳的边缘）。判据挑错，改对了也会判失败。
   *
   * 接缝的**定义性特征**是周期性：它在固定周期 P 上反复出现。
   * 所以算差分序列的自相关 —— 若每 P 像素都有尖峰，lag=P 处的相关系数会显著偏高；
   * 而随机斑驳在任何 lag 上都接近 0。
   * 不写死 P：在 64~512 里扫一遍取最大，报告是哪个 lag（240 和 256 都能抓）。
   */
  const series = (arr) => {
    const lo = arr.length ? arr[0].at : 0
    const out = []
    for (const o of arr) out[o.at - lo] = o.d
    return out
  }
  const autoCorr = (ser) => {
    const n = ser.length
    let best = { lag: 0, r: 0 }
    for (let lag = 64; lag <= Math.min(512, Math.floor(n / 2)); lag++) {
      let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0, k = 0
      for (let i = 0; i + lag < n; i++) {
        const a = ser[i], b = ser[i + lag]
        if (a === undefined || b === undefined) continue
        sx += a; sy += b; sxy += a * b; sxx += a * a; syy += b * b; k++
      }
      if (k < 60) continue
      const cov = sxy / k - (sx / k) * (sy / k)
      const va = sxx / k - (sx / k) ** 2
      const vb = syy / k - (sy / k) ** 2
      const r = va > 1e-9 && vb > 1e-9 ? cov / Math.sqrt(va * vb) : 0
      if (r > best.r) best = { lag, r: +r.toFixed(3) }
    }
    return best
  }
  const colAuto = autoCorr(series(colDiff))
  const rowAuto = autoCorr(series(rowDiff))

  return {
    landPct: +(vals.length / (R.w * R.h) * 100).toFixed(1),
    grain: +grain.toFixed(2),
    colMedianDiff: +cm.toFixed(3),
    rowMedianDiff: +rm.toFixed(3),
    colAuto, rowAuto,
    colRatio: +(colTop[0].d / cm).toFixed(2),
    rowRatio: +(rowTop[0].d / rm).toFixed(2),
    colTop: colTop.map((o) => `${o.at}:${o.d.toFixed(2)}`),
    rowTop: rowTop.map((o) => `${o.at}:${o.d.toFixed(2)}`),
    cols: colDiff.length, rows: rowDiff.length,
  }
}, b64)
await b2.close()

console.log(`\n陆地纹理（取样 ${1440}×${900} 的 x700-1200 / y380-760，陆地占 ${result.landPct}%）`)
console.log(`  颗粒幅度 grain      = ${result.grain}   （判据 ≥ 6，低于 4 = 看不见）`)
// 只作排查用：万一有人重新引入位图接缝，能一眼看出"最强的那一刀在哪"
console.log(`  最强相邻列差（仅供排查，非判据）: ${result.colTop.join('  ')}`)
console.log(`  最强相邻行差（仅供排查，非判据）: ${result.rowTop.join('  ')}`)

const fails = []
if (result.grain < 6) fails.push(`颗粒只有 ${result.grain}，看不见（要 ≥6）`)
if (fails.length) {
  console.log('\n✗ 未通过')
  for (const f of fails) console.log(`   · ${f}`)
  process.exitCode = 1
} else {
  console.log('\n✓ 通过：纸张颗粒可见')
}
