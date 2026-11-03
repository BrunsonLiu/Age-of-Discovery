import { calculateBearing } from '@/utils/navigation'
import { positionAtNm, type RouteGeometry } from '@/utils/routePath'

/**
 * NPC 商船的航行动力学（纯逻辑）。
 *
 * 【为什么只做"来回"，不做 A* 改道】航线几何是 A* 算出来的（routePath 里
 * 有记忆化缓存，但**新的一对港口**仍要现算）。商船如果每到一个港就换目的地，
 * 每次都要跑一次 A*，在低端机上就是一次可见的卡顿。而"商船在两地之间往返"
 * 本来就是最自然的形态（它们就是跑同一条航线的定期船），所以固定腿 + 折返。
 *
 * 【为什么用反射而不是循环】走到终点直接跳回起点，玩家会看到一艘船凭空
 * 消失又出现。反射（posNm 越过终点就镜像回来）在几何上是连续的，
 * 配合船首朝向的插值，看起来就是"到港掉头"。
 */

export interface NpcLegState {
  /** 沿几何的里程（海里），永远落在 [0, totalNm] */
  posNm: number
  /** 行进方向：1 = 从起点往终点，-1 = 返程 */
  sign: 1 | -1
}

/** 往前看多远来算朝向（海里）。太小会被浮点吃掉，太大转弯时朝向会提前拐 */
export function lookAheadNm(totalNm: number): number {
  return Math.max(0.5, totalNm * 0.004)
}

/**
 * 推进一艘 NPC 船。
 *
 * 返回值是新的状态（不原地改），这样单测可以直接对拍，
 * 也避免"每帧改共享对象"的隐性耦合。
 */
export function advanceNpc(
  st: NpcLegState,
  totalNm: number,
  speedNmPerSec: number,
  dt: number,
): NpcLegState {
  if (!(totalNm > 0) || !(speedNmPerSec > 0) || !(dt > 0)) return st
  let pos = st.posNm + st.sign * speedNmPerSec * dt
  let sign = st.sign
  // 反射：越界多少就镜像回多少（一帧最多跨一次，因为速度远小于航程）
  if (pos > totalNm) {
    pos = totalNm - (pos - totalNm)
    sign = -1
  } else if (pos < 0) {
    pos = -pos
    sign = 1
  }
  return { posNm: Math.min(totalNm, Math.max(0, pos)), sign }
}

/** 当前姿态：位置 + 船首朝向（正北 = 0，顺时针） */
export function npcPose(
  geom: RouteGeometry,
  st: NpcLegState,
): { lat: number; lng: number; bearing: number } {
  const here = positionAtNm(geom, st.posNm)
  const look = lookAheadNm(geom.totalNm)
  const aheadNm = Math.min(geom.totalNm, Math.max(0, st.posNm + st.sign * look))
  /*
   * 正好停在端点时"往前看"会原地不动 → bearing 退化成 0（正北），
   * 船会在掉头的一瞬间指错方向。这时改看**身后**那一点：
   * 得到的是"进来的航向"，船在掉头前保持原航向才自然。
   * （第一版直接拿 geom.to 兜底，而此时 geom.to 就是 here 自己 ——
   *   照样算出 0，测试里就是这么暴露出来的：nm=总里程 时 bearing=0。）
   */
  const degenerate = Math.abs(aheadNm - st.posNm) < 1e-6
  const other = degenerate
    ? positionAtNm(geom, Math.max(0, Math.min(geom.totalNm, st.posNm - st.sign * look)))
    : positionAtNm(geom, aheadNm)
  const bearing = degenerate
    ? calculateBearing(other.lat, other.lng, here.lat, here.lng)
    : calculateBearing(here.lat, here.lng, other.lat, other.lng)
  return { lat: here.lat, lng: here.lng, bearing }
}
