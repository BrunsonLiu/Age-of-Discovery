import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface ParchmentCardProps {
  title?: string
  children: ReactNode
  className?: string
  onClose?: () => void
}

export default function ParchmentCard({ title, children, className = '', onClose }: ParchmentCardProps) {
  return (
    <div
      className={`relative rounded-lg overflow-hidden ${className}`}
      style={{
        background: `
          linear-gradient(135deg, rgba(48, 36, 22, 0.96) 0%, rgba(60, 44, 26, 0.96) 50%, rgba(48, 36, 22, 0.96) 100%)
        `,
        border: '2px solid rgba(201,169,110,0.6)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.7), inset 0 1px 0 rgba(244,228,193,0.15)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none opacity-8"
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg, transparent, transparent 2px, rgba(201,169,110,0.25) 2px, rgba(201,169,110,0.25) 4px
          )`,
        }}
      />

      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-gold-500/50 rounded-tl-lg" />
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-gold-500/50 rounded-tr-lg" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-gold-500/50 rounded-bl-lg" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-gold-500/50 rounded-br-lg" />

      <div className="relative p-4">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gold-700/30">
          {title && (
            <h3 className="font-pirate text-lg text-gold-300 tracking-wide">
              {title}
            </h3>
          )}
          {!title && <div />}
          {onClose && (
            <button
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="text-gold-500 hover:text-gold-200 transition-colors p-1.5 rounded hover:bg-gold-700/30 z-50 relative flex-shrink-0"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto scroll-parchment">
          {children}
        </div>
      </div>
    </div>
  )
}
