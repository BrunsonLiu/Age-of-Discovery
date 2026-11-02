/**
 * 港口规模三档。
 *
 * 【为什么单独抽出来】这条规则原来只写在 `components/map3d/models.ts` 里（3D 模型
 * 用它决定底座大小与建筑数量）。但 2D 地图上的港口徽章也需要按规模分级——
 * 而 models.ts 引了 three.js，从 2D 组件里 import 它会把整个 three 拖进主图包
 * （565KB，正是当初把它做成 React.lazy 的原因）。所以规则放在这里，两边共用。
 *
 * 【判据】服务数量：≥5 大港、≥3 中港、其余小补给站。
 * 用服务数量而不是"货物种类/声望"之类，是因为它就是玩家能直接用到的东西
 * ——修船、雇水手、买卖——而这三档在玩法上确实不一样。
 */
export type PortScale = 'major' | 'medium' | 'minor'

export function portScaleOf(port: { services: readonly string[] }): PortScale {
  if (port.services.length >= 5) return 'major'
  if (port.services.length >= 3) return 'medium'
  return 'minor'
}
