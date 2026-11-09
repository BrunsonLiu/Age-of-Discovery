/**
 * "海面上的东西"在昼夜/天气下要一起暗——这是全图唯一一条倍率曲线。
 *
 * 【为什么抽成函数】同一个倍率原来只写在海岸墨线/经纬网/山符号那一段，
 * 而**岸外的浅水带与白沫**是另一块网格（`shallow-band`，MeshBasicMaterial），
 * 它从来没被压过：白天看不出来（乘数正好是 1），一到傍晚就露馅——
 * 海面暗下去了，贴着岸的一圈白沫还停在白天亮度，读作"会发光的岸"。
 *
 * 曲线本身不动：`(0.55 + 0.45·天气) × (0.62 + 0.38·日相)`，
 * 参数约定：weatherDim=1 是天晴、0 是最差天气；lit=1 是正午、0 是深夜。
 * 于是 天晴白昼 = 1.00、天晴夜里 = 0.62、最差天气的白天 = 0.55。
 */
export function surfaceDimMul(weatherDim: number, lit: number): number {
  const w = Number.isFinite(weatherDim) ? Math.min(1, Math.max(0, weatherDim)) : 1
  const l = Number.isFinite(lit) ? Math.min(1, Math.max(0, lit)) : 1
  return (0.55 + 0.45 * w) * (0.62 + 0.38 * l)
}

/**
 * 海面上的**颜色类**叠加层（浅水带、白沫、洋流、季节现象…）用的倍率。
 *
 * 【为什么比墨线更暗一档】墨线是"画在纸上的墨"，纸本身不发光，压到 0.62 就够；
 * 而这些层是**水面的颜色**，它们底下是受光的海面。实测（压灯模拟夜晚，
 * `.workbuddy/probe-band-ratio-fast.mjs`）：
 *   用墨线的倍率 0.62 → 岸外白沫仍是邻海的 **1.55 倍**亮度，夜里读作"发光的岸"；
 * 再乘一档夜间系数 `0.55 + 0.45·lit`（就是海面外圈用的那个）之后，
 * 白沫落在 0.34，与海面的差距回到"看得出是岸外浅水"的量级。
 *
 * 参数约定同 `surfaceDimMul`。
 */
export function seaOverlayMul(weatherDim: number, lit: number): number {
  const l = Number.isFinite(lit) ? Math.min(1, Math.max(0, lit)) : 1
  return surfaceDimMul(weatherDim, lit) * (0.55 + 0.45 * l)
}
