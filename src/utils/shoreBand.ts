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
