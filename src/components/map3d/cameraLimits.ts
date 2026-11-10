/**
 * 2.5D 海图的相机限制：**仰角下限随距离收紧**。
 *
 * 【为什么需要】海图是一块有限大的板（`MAP_WORLD_SIZE` 见方，厚 0.085）。
 * 相机能拉到 40 单位远、同时压到 0.16 弧度（9°）—— 那个组合是**贴着板边看**：
 * 南极一侧的板缘会露出来，读作"世界到这里被切断了"（一条笔直的浅色边）。
 * 用户从很早以前就报过这个"白色楔形"。
 *
 * 修法有两条路：
 *   ① 把板做成无限大 / 加一圈木框 —— 改的是世界本身，风险大；
 *   ② 不允许"又远又低"这个组合 —— 改的是相机，一行判据。
 * 这里选 ②：观感上没有任何损失（远处本来就该俯视），却能保证那块板缘永远
 * 落在视野之外。近处（dist ≤ 20）不受影响，贴海平视的视角仍然可用。
 */
export const EL_MIN = 0.16
export const EL_MAX = 1.35
/** 从这个距离开始收紧下限 */
export const EL_TIGHTEN_FROM = 20
/** 收紧到最远距离时的额外仰角（弧度）：0.16 + 0.55 ≈ 41° */
export const EL_TIGHTEN_MAX = 0.55

/** 当前距离下允许的最小仰角 */
export function minElevationAt(dist: number): number {
  const d = Number.isFinite(dist) ? dist : EL_TIGHTEN_FROM
  const t = Math.max(0, Math.min(1, (d - EL_TIGHTEN_FROM) / (40 - EL_TIGHTEN_FROM)))
  return EL_MIN + EL_TIGHTEN_MAX * t
}

/** 把仰角钳进"当前距离允许的范围" */
export function clampElevation(dist: number, el: number): number {
  const e = Number.isFinite(el) ? el : EL_MAX
  return Math.max(minElevationAt(dist), Math.min(EL_MAX, e))
}
