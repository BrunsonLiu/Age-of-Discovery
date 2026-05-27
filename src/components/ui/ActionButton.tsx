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
    bg-gradient-to-b from-gold-500 to-gold-700
    text-ocean-900 font-semibold
    hover:from-gold-400 hover:to-gold-600
    hover:shadow-[0_0_12px_rgba(201,169,110,0.4)]
    active:from-gold-600 active:to-gold-800
  `,
  danger: `
    bg-gradient-to-b from-danger-400 to-danger-600
    text-parchment-50 font-semibold
    hover:from-danger-300 hover:to-danger-500
    hover:shadow-[0_0_12px_rgba(184,67,46,0.4)]
    active:from-danger-500 active:to-danger-700
  `,
  secondary: `
    bg-transparent border border-gold-600/50
    text-gold-400
    hover:bg-gold-700/20 hover:border-gold-500/70
    hover:shadow-[0_0_8px_rgba(201,169,110,0.2)]
    active:bg-gold-700/30
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
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm',
        'transition-all duration-200 ease-out',
        'font-serif tracking-wide',
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
