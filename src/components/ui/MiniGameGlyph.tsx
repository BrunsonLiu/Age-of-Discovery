import { Anchor, Bomb, Dices, Footprints, Scale, Swords, Telescope, Wind, type LucideIcon } from 'lucide-react'

/**
 * 小游戏图标（统一来源）。
 *
 * 【为什么要有这个组件】
 * 这些小游戏原先各有一个彩色 emoji 当图标（🌪 ⚔ 🏃 🔭 🎲 ⚖ 💥），
 * 出现在事件选项的角标和操舵界面标题栏里——是界面上唯一不属于
 * 铜木金边材质的东西。
 *
 * 【为什么数据层只存名字】
 * `utils/miniGame.ts` 是纯逻辑层（被单测直接 import），不该引入 React。
 * 所以那里只写图标名，组件解析留在渲染层。
 * 之前有第二个渲染点（EventChoice 角标）还在直接输出这个字段，
 * 改成名字之后那里会印出「Wind」三个字母——所以映射必须只有这一份。
 */
const GLYPH: Record<string, LucideIcon> = {
  Wind, Swords, Footprints, Telescope, Dices, Scale, Bomb,
}

export default function MiniGameGlyph({
  icon, size = 14, className, strokeWidth = 1.6,
}: {
  icon: string | undefined
  size?: number
  className?: string
  strokeWidth?: number
}) {
  const Glyph = icon ? GLYPH[icon] : undefined
  if (!Glyph) return <Anchor size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" />
  return <Glyph size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" />
}
