// 3D 漂流物回归：2.5D 下看得见、点得准、结算对、与 2D 同一份数据
//
// 专治两个"以为好了其实没好"：
//   ① DOM 数量对了但投影挤成一团 → 点木桶捞到零钱（elementFromPoint 抓得到）
//   ② 只测了 2D 就宣称两边一致（切回 2D 那步必须真的做）
let puppeteer
try { puppeteer = (await import('puppeteer-core')).default } catch { puppeteer = (await import('file:///C:/Users/Brunson/.workbuddy/binaries/node/workspace/node_modules/puppeteer-core/lib/puppeteer/puppeteer.js')).default }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox'] })
const p = await b.newPage()
await p.setViewport({ width: 1440, height: 900 })
let pass = 0, fail = 0
const check = (ok, msg) => { if (ok) { pass++; console.log('  ✓ ' + msg) } else { fail++; console.log('  ✗ FAIL ' + msg) } }
const clickIn = (o, t) => p.evaluate((o, t) => {
  const ov = [...document.querySelectorAll('div.fixed.inset-0, div[role=dialog]')].find(x => new RegExp(o).test(x.textContent || ''))
  const btn = ov && [...ov.querySelectorAll('button')].find(x => new RegExp(t).test(x.textContent || ''))
  if (btn) btn.click()
}, o, t)

await p.goto(process.env.GAME_URL ?? 'http://localhost:5174/Age-of-Discovery/', { waitUntil: 'networkidle2', timeout: 90000 })
await p.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
await p.reload({ waitUntil: 'networkidle2', timeout: 90000 })
await sleep(2600)
for (const [a, c] of [['翻开日志', '翻开日志'], ['塞维利亚港', '继续']]) { await clickIn(a, c); await sleep(400) }
await p.evaluate(() => document.querySelector('button[data-mode="captain"]')?.click()); await sleep(400)
await clickIn('你想怎么玩', '继续'); await sleep(650)
await p.evaluate(() => {
  const o = [...document.querySelectorAll('div.fixed.inset-0')].find(x => /选择你的天赋/.test(x.textContent || ''))
  o && [...o.querySelectorAll('button')].filter(x => /商界血脉|铁壁舰长|魅力领袖|天生探险家|随船医生/.test(x.textContent || '')).at(0)?.click()
}); await sleep(400)
await clickIn('选择你的天赋', '启航'); await sleep(1500)
await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /跳过引导/.test(x.textContent || ''))?.click()); await sleep(450)
await p.keyboard.press('Escape'); await sleep(350)
await p.keyboard.press('Escape'); await sleep(650)

// 注入 3 个（塞维利亚外海，跨度比真实生成大，仍会在 3D 远景下挤成 <25px）
await p.evaluate(() => {
  const day = window.__gameStore.getState().fleet.day
  window.__gameStore.setState({
    activePanel: null,
    debrisSpots: [
      { id: 'e3d-barrel', kind: 'barrel', lat: 36.4, lng: -7.6, bornDay: day },
      { id: 'e3d-crate', kind: 'crate', lat: 33.5, lng: -10.5, bornDay: day },
      { id: 'e3d-coins', kind: 'coins', lat: 39.0, lng: -12.0, bornDay: day },
    ],
  })
})

// 切 2.5D，轮询等就绪（不用固定 sleep）
await p.evaluate(() => document.querySelector('[data-testid="map-mode-toggle"]')?.click())
let ready = false
for (let i = 0; i < 50; i++) {
  ready = await p.evaluate(() => {
    const c = document.querySelector('canvas')
    return window.__mapStore?.getState?.().renderMode === '3d'
      && !!c && c.width > 100
      && document.querySelectorAll('.debris3d-icon').length === 3
  })
  if (ready) break
  await sleep(250)
}
check(ready, '切到 2.5D 后，3 个漂流物都渲染出来')
await sleep(1200)

const geom = () => p.evaluate(() => [...document.querySelectorAll('.debris3d-icon')]
  .filter(e => getComputedStyle(e).display !== 'none')
  .map(e => {
    const r = e.getBoundingClientRect()
    const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2)
    const hit = document.elementFromPoint(cx, cy)
    return {
      id: e.dataset.debrisId, cx, cy, w: Math.round(r.width),
      hitId: hit?.closest?.('[data-debris-id]')?.dataset?.debrisId ?? null,
    }
  }))

const g = await geom()
check(g.length === 3 && new Set(g.map(x => x.id)).size === 3,
  `3 个 id 各不相同（实得 ${g.map(x => x.id).join(',')}）`)
check(g.every(x => x.w >= 44), '每个热区 ≥44px（手机手指点得到）')

let minGap = Infinity
for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
  minGap = Math.min(minGap, Math.hypot(g[i].cx - g[j].cx, g[i].cy - g[j].cy))
}
check(minGap >= 44, `两两中心距 ≥44px，热区不互相盖住（最小 ${Math.round(minGap)}px）`)
check(g.every(x => x.hitId === x.id),
  `每个图标的中心都命中自己（点谁捞谁）${g.filter(x => x.hitId !== x.id).map(x => `：${x.id}→${x.hitId}`).join('')}`)

// 真实鼠标点击，验证结算的是**看见的那一个**
for (let k = 0; k < 2; k++) {
  const before = await p.evaluate(() => ({
    ids: window.__gameStore.getState().debrisSpots.map(d => d.id),
    gold: window.__gameStore.getState().fleet.gold,
    food: window.__gameStore.getState().fleet.food,
  }))
  const cur = await geom()
  const target = cur[0]
  await p.mouse.click(target.cx, target.cy)
  await sleep(500)
  const after = await p.evaluate(() => ({
    ids: window.__gameStore.getState().debrisSpots.map(d => d.id),
    gold: window.__gameStore.getState().fleet.gold,
    food: window.__gameStore.getState().fleet.food,
    dom: [...document.querySelectorAll('.debris3d-icon')].filter(e => getComputedStyle(e).display !== 'none').length,
  }))
  const expect = before.ids.filter(id => id !== target.id)
  check(!after.ids.includes(target.id) && after.ids.length === expect.length && after.ids.every(id => expect.includes(id)),
    `真实点击 ${target.id} → 只结算了它（剩 ${after.ids.join(',')}）`)
  check(after.dom === after.ids.length, `结算后 3D DOM 同步移除（剩 ${after.dom} 个）`)
  check(after.gold !== before.gold || after.food !== before.food,
    `打捞有即时回执（金 ${before.gold}→${after.gold} / 粮 ${before.food}→${after.food}）`)
}

// 视野外的点必须隐藏，不能画到屏幕外还占一个可点区域
await p.evaluate(() => {
  const st = window.__gameStore, s = st.getState()
  st.setState({ debrisSpots: [...s.debrisSpots, { id: 'e3d-far', kind: 'bottle', lat: -45, lng: 160, bornDay: s.fleet.day }] })
})
await sleep(700)
const far = await p.evaluate(() => {
  const e = [...document.querySelectorAll('.debris3d-icon')].find(x => x.dataset.debrisId === 'e3d-far')
  return e ? { display: getComputedStyle(e).display, rect: e.getBoundingClientRect().toJSON() } : null
})
check(far !== null && far.display === 'none', '视野外的漂流物被隐藏（不会飘在屏幕外）')

// resize：width/height 改成 let 之后，投影要跟着新视口走，图标仍可点
await p.setViewport({ width: 1024, height: 768 })
await sleep(1200)
const afterResize = await geom()
check(afterResize.length > 0 && afterResize.every(x => x.cx > 0 && x.cx < 1024 && x.cy > 0 && x.cy < 768),
  `resize 到 1024×768 后图标仍在新视口内（${afterResize.map(x => `${x.cx},${x.cy}`).join(' / ')}）`)
check(afterResize.every(x => x.hitId === x.id), 'resize 后中心仍命中自己')

// 切回 2D：同一份 debrisSpots，Leaflet 也要把剩下的画出来
await p.evaluate(() => document.querySelector('[data-testid="map-mode-toggle"]')?.click())
await sleep(1800)
const back = await p.evaluate(() => ({
  mode: window.__mapStore?.getState?.().renderMode,
  storeN: window.__gameStore.getState().debrisSpots.length,
  domN: document.querySelectorAll('.debris-icon:not(.debris3d-icon)').length,
  stray3d: document.querySelectorAll('.debris3d-icon').length,
}))
check(back.mode === '2d' && back.domN === back.storeN,
  `切回 2D 后数量一致（store ${back.storeN} / DOM ${back.domN}）`)
check(back.stray3d === 0, '切回 2D 后 3D 层已销毁，没有残留节点')

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
await b.close()
if (fail > 0) process.exit(1)
