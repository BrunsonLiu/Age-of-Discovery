/**
 * 岸外两圈颜色的**纯函数**（浅水带 + 碎浪），单位一律是「度」。
 *
 * 【为什么单独抽出来】这两条曲线决定"岸边长什么样"，而它们原来写在
 * 生成贴图的循环里，混着 512/1024 的网格换算。改分辨率的时候，
 * 同一个数字会从"55 海里"悄悄变成"16 海里"，屏幕上浅水带凭空缩一圈，
 * 而且**没有任何报错**（这张贴图没有断言能看出来）。
 * 收成度制的纯函数之后，分辨率只影响锐度，不影响宽度；也能被单测钉住。
 *
 * 【第一格海水的距离不是 0】距离场算的是"离最近陆地格几格"，
 * 贴岸的第一格海水是 1 格（0.35° @1024），斜角 1.414 格。
 * 所以碎浪从 0.35° 起算，不是从 0 起算。
 */

/** 浅水带宽度：1.3 格 @512 = 0.914°，赤道约 55 海里 */
export const SHALLOW_FALLOFF_DEG = 1.3 * (360 / 512)

/** 碎浪带宽度：0.75° ≈ 46 海里（1 格只有一像素，画不出"带"） */
export const FOAM_SPAN_DEG = 0.75

/** 碎浪的下限系数：海岸可以有一段不起浪，但不能整条断掉 */
export const FOAM_MIN = 0.35

/** 贴岸第一格海水的离岸距离（度）：0.35° @1024 */
export const FIRST_SEA_CELL_DEG = 360 / 1024

export const MAX_SHALLOW_ALPHA = 0.42
export const MAX_FOAM_ALPHA = 0.5

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

/**
 * 浅水带的 alpha：离岸越近越亮，1.6 次方让边缘散得快（免得整片海泛白）。
 */
export function shallowAlpha(dDeg: number): number {
  const t = clamp01(dDeg / SHALLOW_FALLOFF_DEG)
  return MAX_SHALLOW_ALPHA * Math.pow(1 - t, 1.6)
}

/**
 * 碎浪的 alpha：贴岸满强度，到 `FIRST_SEA_CELL_DEG + FOAM_SPAN_DEG` 归零。
 *
 * 【指数是 0.7 而不是 2】2 次方让 alpha 一离开岸边就掉到 1/10，
 * 一条几何上 3 格宽的带在屏幕上只剩最里面一格是白的（导出贴图数过：
 * 连续 alpha 段 2~4 格，但只有 1 格看得见）。0.7 次方让宽度真的落在屏幕上，
 * 外缘仍然是软的。
 *
 * @param patch 0..1 的低频斑块：这一段海岸"起不起浪"
 */
export function foamAlpha(dDeg: number, patch: number): number {
  const ft = clamp01((dDeg - FIRST_SEA_CELL_DEG) / FOAM_SPAN_DEG)
  const p = Number.isFinite(patch) ? Math.min(1, Math.max(0, patch)) : FOAM_MIN
  return MAX_FOAM_ALPHA * Math.pow(1 - ft, 0.7) * (FOAM_MIN + (1 - FOAM_MIN) * p)
}

/**
 * 把两层合成成一个像素：返回总不透明度与"白沫在颜色里占多少"。
 *
 * 【为什么不能直接把两张 alpha 相加】相加会在两者都强的地方溢出成
 * 一块纯白（浅水与碎浪在贴岸处必然重叠）。按 `a = a1 + a2(1-a1)` 合成，
 * 颜色按同样的权重加权，才不会出现过曝的岸线。
 */
export function compositeShore(dDeg: number, patch: number): { alpha: number; foamMix: number } {
  const a1 = shallowAlpha(dDeg)
  const a2 = foamAlpha(dDeg, patch)
  const alpha = a1 + a2 * (1 - a1)
  if (alpha <= 0) return { alpha: 0, foamMix: 0 }
  return { alpha, foamMix: (a2 * (1 - a1)) / alpha }
}

/**
 * 每格所属陆块的面积（单位：格）。非陆地返回 0。
 *
 * 【为什么需要】岸外那圈光晕的宽度是 0.75°，而海上有大量群岛
 * （德雷克海峡的南设得兰、印度洋的凯尔盖朗、太平洋的环礁）——
 * 岛与岛之间只有 1~2°，每一座都画晕，晕就会**连成一条横穿大洋的线**，
 * 远景读作一条不存在的海岸线（实测截图里从合恩角一路拉到南极半岛）。
 * 真实海图上这种地方画的是零散的礁石符号，不是连续的海岸。
 *
 * 【判据为什么用"陆块面积"而不是"腐蚀一格"】先试过腐蚀：小岛是没了，
 * 但南设得兰这类**几公里宽、彼此只隔 1°** 的岛群腐蚀完还在，
 * 晕照样连成线。面积是"这块陆地有没有分量"的直接度量。
 *
 * 4 连通洪泛（栈式，不递归：1024×512 递归会爆栈）。
 */
export function componentLabels(land: Uint8Array, w: number, h: number): Uint32Array {
  const id = new Uint32Array(land.length)
  const stack: number[] = []
  let next = 1
  for (let i = 0; i < land.length; i++) {
    if (!land[i] || id[i]) continue
    stack.length = 0
    stack.push(i)
    id[i] = next
    while (stack.length) {
      const k = stack.pop()!
      const x = k % w
      const y = (k - x) / w
      if (x > 0 && land[k - 1] && !id[k - 1]) { id[k - 1] = next; stack.push(k - 1) }
      if (x < w - 1 && land[k + 1] && !id[k + 1]) { id[k + 1] = next; stack.push(k + 1) }
      if (y > 0 && land[k - w] && !id[k - w]) { id[k - w] = next; stack.push(k - w) }
      if (y < h - 1 && land[k + w] && !id[k + w]) { id[k + w] = next; stack.push(k + w) }
    }
    next++
  }
  return id
}

/** 一份 id 数组里最大的 id（不能用 Math.max(...arr)：52 万个参数会爆栈） */
function maxId(id: Uint32Array): number {
  let m = 0
  for (let i = 0; i < id.length; i++) if (id[i] > m) m = id[i]
  return m
}

/** 每格所属陆块的面积（单位：格）。非陆地返回 0。 */
export function componentAreas(land: Uint8Array, w: number, h: number): Uint32Array {
  const id = componentLabels(land, w, h)
  const sizes = new Uint32Array(maxId(id) + 1)
  for (let i = 0; i < id.length; i++) if (id[i]) sizes[id[i]]++
  const area = new Uint32Array(land.length)
  for (let i = 0; i < land.length; i++) if (id[i]) area[i] = sizes[id[i]]
  return area
}

/**
 * 岸外光晕只画给"有分量"的陆地：陆块面积 ≥ 这么多格。
 *
 * 20 格 ≈ 3 万平方公里（一格约 1500 km²）。按这个门槛：
 *   保留 冰岛(≈70) 古巴(≈70) 西西里(≈17? 略低于门槛) 马达加斯加 日本 新西兰
 *   丢弃 南设得兰(个位数) 南乔治亚 凯尔盖朗 太平洋环礁
 * 门槛是**视觉**参数而不是地理常数：要的是"岛群的晕不会连成一条线"。
 */
export const MIN_SHORE_AREA_CELLS = 18

/**
 * 腐蚀一格：只留下 3×3 邻域全是陆地的格。
 *
 * 【为什么面积过滤不够】海陆掩码在海上还留着一些**一格宽的细长"陆地"**
 * （海底山脊在生成掩码时被算成了陆地的边）。它们的面积可以很大
 * （一整条环），所以"面积 ≥ 18 格"放它们过去 —— 实测南大西洋上出现一条
 * 横跨两千公里的**闭环白线**，就是这些细条被 0.75° 的光晕围着画出来的。
 * 腐蚀一格能一次去干净：一格宽的东西必然留不下。
 *
 * 代价：白沫外缘向海挪了约 0.1°（11 公里），大陆与半岛（几十公里宽）不受影响。
 */
export function erodeLand(land: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(land.length)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (!land[i]) continue
      if (
        land[i - 1] && land[i + 1] && land[i - w] && land[i + w] &&
        land[i - w - 1] && land[i - w + 1] && land[i + w - 1] && land[i + w + 1]
      ) out[i] = 1
    }
  }
  return out
}

/**
 * 岸外光晕的门槛：**先腐蚀一格，再要求面积达标**。
 *
 * 两道关各管一类杂质：
 *   腐蚀 → 去掉一格宽的细长"陆地"（海底山脊之类），它们面积够大但不成块；
 *   面积 → 去掉真正的孤岛与礁石，它们成块但太小，晕会连成假海岸线。
 */
export function majorLand(land: Uint8Array, w: number, h: number, minCells = MIN_SHORE_AREA_CELLS): Uint8Array {
  const id = componentLabels(land, w, h)
  const solid = erodeLand(land, w, h)
  /*
   * 【为什么"体检"用腐蚀、几何却用原始陆地】
   * 腐蚀会把整块大陆向内收一格：若直接拿腐蚀后的结果算距离，白沫就从**第二格**
   * 海水才开始，贴岸那一格永远空着 —— 实测近景的海岸带因此淡了将近一半。
   * 所以腐蚀只用来判断"这块陆地有没有厚度"（有没有一个 3×3 全是陆地的核），
   * 保留下来的陆块仍用它**原始的边界**算距离。
   * 一格宽的细条没有核，整块被丢掉（它们是海上那些假海岸线的来源）。
   */
  const coreIds = new Uint8Array(maxId(id) + 1)
  for (let i = 0; i < solid.length; i++) if (solid[i] && id[i]) coreIds[id[i]] = 1
  const sizes = new Uint32Array(coreIds.length)
  for (let i = 0; i < id.length; i++) if (id[i]) sizes[id[i]]++
  const out = new Uint8Array(land.length)
  for (let i = 0; i < land.length; i++) {
    const k = id[i]
    if (!k) continue
    if (coreIds[k] && sizes[k] >= minCells) out[i] = 1
  }
  return out
}
