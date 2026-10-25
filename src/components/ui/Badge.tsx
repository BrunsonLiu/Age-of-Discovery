import { factionBadge, traitIcon } from '@/data/badges'

/**
 * 派系徽记 / 特质图标（第二批 P2 矢量徽章）。
 *
 * 统一渲染规则：
 *   · 方形徽章（1:1）用 <img>，保留 SVG 的矢量清晰度
 *   · 小尺寸（列表行内）降到 14~16px，靠 object-contain 保证不裁切
 *   · 找不到徽记时回退到 emoji（数据层仍保留 emoji 字段作为兜底文案）
 */
export default function Badge({
  kind,
  id,
  fallback,
  size = 16,
  className = '',
}: {
  /** 'faction' 用派系徽记，'trait' 用特质图标 */
  kind: 'faction' | 'trait'
  id: string
  /** 数据层里的 emoji，徽记缺失时显示 */
  fallback?: string
  /** 徽章边长（px） */
  size?: number
  className?: string
}) {
  const src = kind === 'faction' ? factionBadge(id) : traitIcon(id)
  if (!src) return <span className={className}>{fallback}</span>
  return (
    <img
      src={src}
      alt={fallback ?? id}
      title={fallback}
      width={size}
      height={size}
      className={`inline-block object-contain align-middle ${className}`}
      style={{ width: size, height: size }}
    />
  )
}
