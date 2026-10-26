/**
 * 水位配色规则。
 *
 * 阈值可以用数值覆盖（warnBelow / criticalBelow），
 * 因为「多少算危险」对不同资源是不同的规则：
 * 耐久度看百分比，士气看 45 这条绝对线，粮水看到港天数。
 * 让所有资源共用一组百分比阈值，就等于让颜色说谎。
 *
 * 单独成文件（而不是留在 ResourceBar.tsx 里）：这是一条**规则**而非样式，
 * 规则必须能在没有浏览器的情况下被验证；同时组件文件只导出组件，
 * 热更新才不会整页失效。
 */
export function getStatusColor(
  value: number,
  maxValue: number,
  warnBelow?: number,
  criticalBelow?: number,
): string {
  const warn = warnBelow ?? maxValue * 0.6
  const critical = criticalBelow ?? maxValue * 0.3
  if (value <= critical) return 'bg-danger-400'
  if (value <= warn) return 'bg-gold-400'
  return 'bg-safe-400'
}
