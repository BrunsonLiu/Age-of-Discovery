/**
 * 首分钟四屏审计（开场日志 / 模式 / 天赋 / 第一次出航）。
 *
 * 【为什么单独写这个脚本，而不是并进 contrast-audit】
 * contrast-audit 扫的是**主地图**上的 51 段文字。首分钟那几屏是独立的
 * 全屏遮罩（z-9999），不在它的遍历范围内 —— 结果就是这几屏一直没人审：
 * 实测模式页 14 段文字里 10 段低于 4.5（最差 2.25，"· 断粮会掉士气"那几条），
 * 天赋页 18 段里 11 段不达标（最差 2.25）。
 * 而这些恰好是玩家读得最仔细的几屏：他要靠这些字决定怎么玩、选哪个天赋。
 *
 * 【判据怎么量的】拍两次：文字可见 / 文字透明，两帧差分得到**文字掩膜**，
 * 再用掩膜内的像素算对比度。
 * 一开始用的是"取元素矩形、按百分比分位数找笔画"，那是错的：入场动画
 * 还在跑时矩形与截图像素对不齐，12px 的行里一个亮像素都取不到
 * （p95 = rgb(42,30,16)，纯背景），于是报出 2.0x 的假值。
 * 差分掩膜与动画、滚动、对齐全部无关 —— 两帧之间只有文字颜色变了。
 *
 * 判据：
 *   · 正文（<18px）≥ 4.5，大字（≥18px）≥ 3.0（WCAG AA）
 *   · 中文 UI 字号下限 12px
 *   · 面板不得超出视口（1440×900 与 375×812 两种）
 */
let puppeteer
try {
  puppeteer = (await import('puppeteer-core')).default
} catch {
  puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default
}
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = 'http://127.0.0.1:5174/Age-of-Discovery/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const argOf = (k, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${k}=`))
  return h ? h.split('=')[1] : d
}
const VW = Number(argOf('vw', '1440'))
const VH = Number(argOf('vh', VW === 375 ? '812' : '900'))

let passed = 0
let failed = 0
const check = (ok, msg) => {
  if (ok) { passed++; console.log(`  ✓ ${msg}`) } else { failed++; console.log(`  ✗ ${msg}`) }
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)))
await page.setViewport({ width: VW, height: VH })
await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 })
await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 })
await sleep(2600)
await page.evaluate(() => document.fonts.ready)

/** 等入场动画停住：标题位置连续两次采样一致 */
const waitSettled = async () => {
  let prev = null
  for (let i = 0; i < 40; i++) {
    const now = await page.evaluate(() => {
      const h = document.querySelector('h1, h2')
      if (!h) return null
      const r = h.getBoundingClientRect()
      return [Math.round(r.left * 10), Math.round(r.top * 10)]
    })
    if (now && prev && now[0] === prev[0] && now[1] === prev[1]) return
    prev = now
    await sleep(80)
  }
}

/**
 * 当前屏的文字对比度（差分掩膜法）。
 * 返回 [{ t, fs, cr, cover }]
 */
const measure = async (tag) => {
  await waitSettled()
  const rects = await page.evaluate(() => {
    const root = [...document.querySelectorAll('div.fixed.inset-0')].find((x) => x.querySelector('h1, h2'))
    if (!root) return []
    const out = []
    root.querySelectorAll('*').forEach((el) => {
      if (el.children.length) return
      const t = (el.textContent || '').trim()
      if (t.length < 2) return
      const r = el.getBoundingClientRect()
      if (r.width < 8 || r.height < 6) return
      el.setAttribute('data-introprobe', String(out.length))
      out.push({
        t: t.slice(0, 24),
        fs: parseFloat(getComputedStyle(el).fontSize),
        r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      })
    })
    return out
  })
  if (!rects.length) return []

  const shotText = await page.screenshot({ encoding: 'base64' })
  await page.evaluate(() => {
    document.querySelectorAll('[data-introprobe]').forEach((e) => {
      e.style.setProperty('color', 'transparent', 'important')
      e.style.setProperty('text-shadow', 'none', 'important')
      e.style.setProperty('-webkit-text-stroke', '0 transparent', 'important')
    })
  })
  await sleep(220)
  const shotPlain = await page.screenshot({ encoding: 'base64' })
  await page.screenshot({ path: `.workbuddy/shots/introcheck-${tag}.png` })

  return page.evaluate(async (a, b, rects) => {
    const load = async (s) => {
      const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode()
      const c = document.createElement('canvas'); c.width = i.width; c.height = i.height
      const g = c.getContext('2d'); g.drawImage(i, 0, 0)
      return g.getImageData(0, 0, i.width, i.height)
    }
    const A = await load(a); const B = await load(b)
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    const L = (r, g, bl) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl)
    const W = A.width
    return rects.map((o) => {
      const [x, y, w, h] = o.r
      if (x < 0 || y < 0 || x + w > W || y + h > A.height || w < 10 || h < 8) return { ...o, cr: null }
      const fg = []; const bg = []
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        const k = (yy * W + xx) * 4
        const d = Math.abs(A.data[k] - B.data[k]) + Math.abs(A.data[k + 1] - B.data[k + 1]) + Math.abs(A.data[k + 2] - B.data[k + 2])
        if (d > 6) fg.push(L(A.data[k], A.data[k + 1], A.data[k + 2]))
        else bg.push(L(B.data[k], B.data[k + 1], B.data[k + 2]))
      }
      if (fg.length < 12 || bg.length < 12) return { ...o, cr: null }
      fg.sort((p, q) => p - q); bg.sort((p, q) => p - q)
      // 笔画芯：暗字取最暗 20%，亮字取最亮 20%（取离底色更远的那个）
      const lo = fg[Math.floor(fg.length * 0.2)]
      const hi = fg[Math.floor(fg.length * 0.8)]
      const mid = bg[Math.floor(bg.length * 0.5)]
      const core = Math.abs(lo - mid) >= Math.abs(hi - mid) ? lo : hi
      const cr = (Math.max(core, mid) + 0.05) / (Math.min(core, mid) + 0.05)
      return { t: o.t, fs: o.fs, cr: +cr.toFixed(2), cover: +(fg.length / (w * h) * 100).toFixed(0) }
    })
  }, shotText, shotPlain, rects)
}

const clickIn = (re, txt) => page.evaluate((re, txt) => {
  const ov = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')].find((x) => new RegExp(re).test(x.textContent || ''))
  const btn = ov && [...ov.querySelectorAll('button')].find((x) => new RegExp(txt).test(x.textContent || ''))
  if (btn) { btn.click(); return true }
  return false
}, re, txt)

const auditScreen = async (tag, label) => {
  const rows = (await measure(tag)).filter((r) => r.cr !== null)
  console.log(`\n${label}：${rows.length} 段文字（视口 ${VW}×${VH}）`)
  const bad = rows.filter((r) => r.cr < (r.fs >= 18 ? 3.0 : 4.5))
  bad.sort((a, b) => a.cr - b.cr).forEach((r) => console.log(`      ${r.cr} :1  ${r.fs}px  ${r.t}`))
  check(bad.length === 0, `${label}：所有文字达到 AA（未达标 ${bad.length} 段）`)

  const tiny = rows.filter((r) => r.fs < 12)
  check(tiny.length === 0, `${label}：无小于 12px 的中文（实得 ${tiny.length} 段${tiny.length ? '：' + tiny.map((r) => r.t).slice(0, 3).join(' / ') : ''}）`)

  // 面板必须完整落在视口内（auto 滚动的兜底不算通过）
  const fits = await page.evaluate(() => {
    const el = [...document.querySelectorAll('div.fixed.inset-0')].find((x) => x.querySelector('h1, h2'))
    const panel = el && [...el.querySelectorAll('div')].find((d) => /parchment-bg-dark/.test(d.className))
    if (!panel) return null
    const r = panel.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }
  })
  check(fits !== null && fits.top >= 0 && fits.bottom <= VH,
    `${label}：面板完整落在视口内（${fits ? `top ${fits.top} / bottom ${fits.bottom} / 视口 ${VH}` : '未找到面板'}）`)
}

console.log(`\n===== 首分钟四屏 · ${VW}×${VH} =====`)
await auditScreen('log', '① 航海日志')

// 进入模式页
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('翻开日志'))
  b?.click()
})
await sleep(500)
await clickIn('塞维利亚港', '继续')
await sleep(500)
await page.evaluate(() => document.querySelector('button[data-mode="captain"]')?.click())
await sleep(400)
await auditScreen('mode', '② 你想怎么玩')

// 选中态必须可辨识：金环 + 左侧色条（不是靠提亮底色）
const sel = await page.evaluate(() => {
  /*
   * 必须限定在 [data-mode] 上。
   * 第一版写的是 `button[aria-pressed="true"]` —— 那会先命中地图上别的
   * 带 aria-pressed 的按钮（DOM 顺序在遮罩之前），于是"找不到色条"失败。
   * 判据本身没错，是取样取错了对象。
   */
  const card = document.querySelector('button[data-mode][aria-pressed="true"]')
  if (!card) return null
  const bar = [...card.querySelectorAll('span')].find((s) => {
    const r = s.getBoundingClientRect()
    return r.width <= 5 && r.height > 8
  })
  const cs = getComputedStyle(card)
  return {
    accent: !!bar,
    borderColor: cs.borderColor,
    bgImage: cs.backgroundImage.slice(0, 24),
  }
})
check(sel && sel.accent, '③ 选中的模式卡有左侧色条（不只靠边框变色）')

// 天赋页
await clickIn('你想怎么玩', '继续')
await sleep(900)
await auditScreen('trait', '④ 选择你的天赋')

// 五枚天赋徽章必须真的画出来（尺寸 ≥ 40，且加载成功）
const badges = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('img[title]')]
    .filter((i) => /trait_/.test(i.getAttribute('src') || ''))
  return imgs.map((i) => ({
    src: (i.getAttribute('src') || '').split('/').pop(),
    w: Math.round(i.getBoundingClientRect().width),
    loaded: i.complete && i.naturalWidth > 0,
  }))
})
check(badges.length === 5, `⑤ 天赋页有 5 枚徽章（实得 ${badges.length}）`)
check(badges.every((b) => b.loaded), '⑤ 五枚徽章全部加载成功')
check(badges.every((b) => b.w >= 40), `⑤ 徽章边长 ≥ 40px（实得 ${badges.map((b) => b.w).join('/')}）`)

await browser.close()
console.log(`\n结果：${passed} 通过 / ${failed} 失败`)
process.exit(failed ? 1 : 0)
