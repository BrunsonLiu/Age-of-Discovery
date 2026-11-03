import type { ReactNode } from 'react'
import { clsx } from 'clsx'

interface ActionButtonProps {
  onClick: () => void
  children: ReactNode
  variant?: 'primary' | 'danger' | 'secondary'
  disabled?: boolean
  className?: string
  icon?: ReactNode
}

const variantStyles = {
  primary: `
    bg-gradient-to-b from-gold-400 to-gold-600
    text-[#1c1408]
    hover:from-gold-400 hover:to-gold-600
    hover:shadow-[0_0_12px_rgba(201,169,110,0.4)]
    active:from-gold-600 active:to-gold-800
  `,
  danger: `
    bg-gradient-to-b from-danger-300 to-danger-500
    text-[#fff6ee]
    hover:from-danger-300 hover:to-danger-500
    hover:shadow-[0_0_12px_rgba(184,67,46,0.4)]
    active:from-danger-500 active:to-danger-700
  `,
  /*
   * 次级按钮＝铜牌（材质见 index.css 的 .plate-btn）。
   * 原来是「透明底 + 1px 金边」的 ghost button，压在深棕面板上没有任何材质，
   * 港口/贸易/船坞三个面板加起来 40 多个，读起来就是一排扁平色块。
   */
  secondary: `
    plate-btn
    text-gold-400
    hover:text-gold-300
  `,
}

export default function ActionButton({
  onClick,
  children,
  variant = 'primary',
  disabled = false,
  className = '',
  icon,
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'inline-flex items-center gap-1.5 px-4 py-2 rounded text-[15px] leading-5',
        'transition-all duration-200 ease-out',
        'font-serif tracking-[0.04em]',
        variantStyles[variant],
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
        className,
      )}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  )
}
