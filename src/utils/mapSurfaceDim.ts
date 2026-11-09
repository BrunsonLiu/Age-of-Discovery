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
