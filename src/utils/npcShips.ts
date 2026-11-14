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

/**
 * 4 条商船航线（route id + 初始相位）、速度。
 *
 * 【为什么放在这里而不是各自写一份】2D 与 2.5D 必须跑**同一批船**，
 * 否则切视图时"刚才那艘船不见了"。清单放在一处，两边只负责画。
 *
 * 【为什么每条腿写死相位，而不是 i*0.21 这种公式】
 * 相位决定"开局第一眼这艘船在哪"。公式凑出来的值是 0.36，实测那条船
 * 在默认视野里落在 y=-24（刚好出画 24px）；改成显式写 0.5 就落在画面中间。
 * 这种"要落在哪个位置"的事，写死比凑公式可靠。
 *
 * 【第 2 条为什么是 9 塞维利亚—哈瓦那】默认 2D 视野 center(25°N,-20°) / zoom 5，
 * 实际框住的是经度约 -55~5、纬度约 -5~40 这一块。实测这条航线的大圆**向北鼓**
 * （中途到 43°N 附近），所以相位 0.42 时落在 y=-9、相位 0.5 时落在 (-122,16)——
 * 两种都在画面上边缘之外一点点。也就是说：**2D 默认视野里不保证看得到商船**，
 * 它会在航行途中自然遇到；2.5D 默认是全景，那边一眼就能看见。
 * 不为这件事再挪相位：真挪到框内就得让船贴着哈瓦那，等于把起点写成特例。
 * 其余三条各守一片海：1 加勒比、13 印度洋、27 东非。
 */
/**
 * 商船的船型。
 *
 * 【为什么要有这个字段】原来四条腿全画同一张 `caravel` —— 也就是说地图上
 * 四艘"不同的船"长得完全一样。而 `shipSprites` 里早就有 caravel/galleon/sloop
 * 三种商船（还有五张特殊船一直在表里没人用，见该文件的注释）。
 * 船型不是装饰：加勒比那条腿跑的是小快船，里斯本—伦敦那条是大帆船 ——
 * 一眼能看出"这艘比我大"是海上最基本的读图信息。
 *
 * 【为什么按海域/航程选，而不是随机】随机的话同一艘船下次变成另一种，
 * 玩家会以为"船换了"。船型跟着航线走 = 它属于这条航线。
 */
export type NpcShipKind = 'caravel' | 'galleon' | 'sloop'

export const NPC_LEGS: readonly { routeId: number; phase0: number; kind: NpcShipKind }[] = [
  /* 加勒比：岛间短程，小快船最合理 */
  { routeId: 1, phase0: 0.30, kind: 'sloop' },
  /* 塞维利亚—哈瓦那：跨大西洋的定期班船，大帆船 */
  { routeId: 9, phase0: 0.50, kind: 'galleon' },
  /* 印度洋：季风航线的中型商船 */
  { routeId: 13, phase0: 0.72, kind: 'caravel' },
  /* 东非：沿岸贸易，小快船 */
  { routeId: 27, phase0: 0.15, kind: 'sloop' },
]
/**
 * 海里/秒。
 *
 * 玩家船的真实速度是"海里/天"，与视觉时间不是一个量级；商船只用来看。
 * 20 nm/s：里斯本—伦敦约 900 海里，45 秒跑完 —— 看得出在动，又不会窜。
 */
export const NPC_SPEED_NM = 20

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
 * 按**时刻**直接求一艘 NPC 船的位置（无状态）。
 *
 * 【为什么不用"每帧推进状态"】2D 与 2.5D 是两套渲染。各自持有一份里程状态，
 * 就会出现"同一个商船在两个视图里不在同一个位置"——切视图时船会跳过去。
 * 改成 `f(nowMs)`：同一时刻问两次答案相同，两边天然一致，也永远不会漂。
 *
 * 折返用**三角波**（ping-pong）：`d ∈ [0, 2T]`，前半程正走、后半程倒走。
 * 端点处位置连续，只有方向翻转 —— 比"到终点跳回起点"自然得多。
 */
export function npcLegAt(
  totalNm: number,
  speedNmPerSec: number,
  phase0: number,
  nowMs: number,
): NpcLegState {
  if (!(totalNm > 0) || !(speedNmPerSec > 0)) return { posNm: 0, sign: 1 }
  const span = totalNm * 2
  const walked = (totalNm * phase0 + (nowMs / 1000) * speedNmPerSec) % span
  const forward = walked <= totalNm
  const posNm = forward ? walked : span - walked
  return { posNm: Math.min(totalNm, Math.max(0, posNm)), sign: forward ? 1 : -1 }
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
