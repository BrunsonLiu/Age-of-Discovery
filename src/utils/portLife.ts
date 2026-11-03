/**
 * 港口"生活感"的三个待机动画：青烟、海鸥、旗帜。
 *
 * 【为什么要单独抽成纯函数】
 * 这三个动画都跑在 3D 的帧循环里，而帧循环**没法测**（dt 不确定、无头浏览器
 * rAF 还慢）。项目里已经吃过一次亏：帧循环里的逻辑不抽出来，失败就是概率性的，
 * "跑两次都通过"什么也证明不了。所以这里只放"给定 t 返回姿态"的纯数学，
 * 循环里只做赋值。
 *
 * 【为什么每个对象都要有相位】
 * 20 个港口如果同相位，就是 20 缕烟同时升起、同时消散——一眼是"批量复制的
 * 粒子系统"，比没有还假。相位由港口 id 派生（确定性），所以每次进游戏
 * 同一个港口的烟永远是同一个节奏，不会"港口在乱跳"。
 */

/** 由整数派生一个稳定的 [0,1) 相位（不用 Math.random，否则每次进游戏都不同） */
export function phaseOf(seed: number, salt = 0): number {
  let a = (seed * 2654435761 + salt * 40503) >>> 0
  a ^= a >>> 15
  a = (a * 2246822519) >>> 0
  a ^= a >>> 13
  return (a >>> 0) / 4294967296
}

/**
 * 一缕烟的姿态。
 *
 * 周期 3.4 秒（比心跳慢、比呼吸快）。`p` 是这一缕在周期里的位置：
 *   - 上升：0 → 0.30（世界单位），越升越快
 *   - 膨胀：0.05 → 0.20（直径），烟是要散的
 *   - 透明度：sin(πp) 的两端为 0 —— 出生和消散都不能"啪"地出现/消失，
 *     否则 20 个港口同屏就是一片闪烁的圆点
 */
export const SMOKE_PERIOD = 3.4
export function smokePose(i: number, t: number, seed: number): {
  p: number; rise: number; scale: number; alpha: number; sway: number
} {
  const ph = phaseOf(seed, 17 + i * 7)
  const p = (t / SMOKE_PERIOD + ph) % 1
  const rise = p * 0.24 * (0.7 + 0.6 * p)
  // 体积：0.04 → 0.115。第一版 0.05→0.20 在近景是一个 58px 的软斑，
  // 读起来像镜头上的一块污渍；"烟"是许多小团叠出来的，不是一个大气球。
  const scale = 0.045 + p * 0.09
  // sin(πp)：两端 0、中段最浓；再乘 (1-0.35p) 让末尾更淡（烟越散越薄）
  const alpha = Math.sin(Math.PI * p) * (1 - 0.35 * p)
  // 侧向偏移：风向固定（西风），但每缕略不同，避免叠成一条直线
  const sway = Math.sin(t * 0.9 + ph * 6.283) * 0.012 + p * 0.022
  return { p, rise, scale, alpha, sway }
}

/**
 * 一只海鸥的姿态：绕港口中心盘旋。
 *
 * 半径 0.34、高度 0.30~0.38（在房子和塔之上，和船桅差不多高）。
 * 返回的是**相对港口中心的偏移**，调用方加到 group.position 上。
 * yaw 让鸟头朝切线方向——不转向的话鸟会一直侧着飞，像纸片。
 */
export const BIRD_PERIOD = 7.5
export function birdPose(i: number, t: number, seed: number): {
  dx: number; dy: number; dz: number; yaw: number
} {
  const ph = phaseOf(seed, 41 + i * 13)
  const dir = i % 2 === 0 ? 1 : -1
  const ang = (t / BIRD_PERIOD) * Math.PI * 2 * dir + ph * Math.PI * 2
  const r = 0.32 + 0.06 * Math.sin(t * 0.7 + ph * 5)
  return {
    dx: Math.cos(ang) * r,
    dz: Math.sin(ang) * r,
    // 上下起伏很小：海鸥是滑翔，不是蹦跳
    dy: 0.33 + Math.sin(t * 1.3 + ph * 6.283) * 0.025,
    // 切线方向：x = cos, z = sin → 切线 (∓sin, ±cos)，绕 Y 轴的朝向 =
    // atan2(-dz', dx')，化简后就是 ang + dir*π/2
    yaw: -ang + dir * Math.PI / 2,
  }
}

/**
 * 旗帜绕杆摆动的角度（弧度）。
 *
 * 幅度 0.42 rad ≈ 24°，太大就变成"旗子在抽筋"。两个频率叠加：
 * 主频 2.4（一秒两下多一点，像风里的布），副频 7.3 给一点高频抖动，
 * 否则纯正弦读起来像机械摆锤。
 */
export function flagYaw(t: number, seed: number): number {
  const ph = phaseOf(seed, 5) * Math.PI * 2
  return Math.sin(t * 2.4 + ph) * 0.34 + Math.sin(t * 7.3 + ph * 1.7) * 0.08
}
