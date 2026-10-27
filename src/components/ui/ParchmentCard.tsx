import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { UI_ASSETS } from '@/data/uiAssets'

interface ParchmentCardProps {
  title?: string
  /** 标题旁的小字（如成就进度 x / y） */
  subtitle?: string
  children: ReactNode
  className?: string
  onClose?: () => void
}

export default function ParchmentCard({ title, subtitle, children, className = '', onClose }: ParchmentCardProps) {
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
      {/* 真羊皮纸纹理（F1）：低透明度叠在深褐底上增加纸的颗粒感 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${UI_ASSETS.parchment})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.14,
        }}
      />

      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-gold-500/50 rounded-tl-lg" />
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-gold-500/50 rounded-tr-lg" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-gold-500/50 rounded-bl-lg" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-gold-500/50 rounded-br-lg" />

      <div className="relative p-4">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-gold-700/30">
          {title && (
            <h3 className="font-pirate text-lg text-gold-300 tracking-wide flex items-center gap-2">
              {title}
              {subtitle && <span className="text-gold-500 text-xs font-serif">{subtitle}</span>}
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
        {/* 内容区高度：
            桌面端被放在 top-12/bottom-12 的容器里，60vh 刚好；
            移动端面板是底部抽屉（最高 82dvh），要给到 68dvh 才填得下，
            否则抽屉里会套着一条更矮的内滚动区，出现两层滚动条。 */}
        <div className="max-h-[68dvh] md:max-h-[60vh] overflow-y-auto scroll-parchment">
          {children}
        </div>
      </div>
    </div>
  )
}
