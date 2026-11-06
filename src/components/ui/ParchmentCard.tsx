import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { UI_ASSETS } from '@/data/uiAssets'
import ScrollFade from '@/components/ui/ScrollFade'

interface ParchmentCardProps {
  title?: string
  /** 标题旁的小字（如成就进度 x / y） */
  subtitle?: string
  children: ReactNode
  /**
   * 不随正文滚动的常驻页脚。给「不管看到哪一节都得能点到」的操作入口用
   * （帮助面板的导出/导入存档、换模式）。缺省时行为与旧版完全一致。
   */
  footer?: ReactNode
  className?: string
  onClose?: () => void
}

export default function ParchmentCard({ title, subtitle, children, footer, className = '', onClose }: ParchmentCardProps) {
  return (
    <div
      className={`relative rounded-lg overflow-hidden ${className}`}
      style={{
        /*
         * 【底色为什么要再压暗一档】
         * 原来 rgba(48,36,22,0.96) + 14% 的羊皮纸纹理，实测渲染出来是
         * rgb(85,70,46)。这个亮度下，面板里最常用的 gold-500 (#c9a96e)
         * 只有 4.09:1、gold-400 只有 4.11:1 —— **整套金色文字都刚好卡在
         * AA 的 4.5 下面一点点**（对比度审计在 5 个面板里都量到了同一组数）。
         * 与其把每一处文字都提亮（会丢掉层次），不如把底板压暗：
         * 压到 rgb(56,46,33) 后，gold-500/400 都在 5.7:1 以上，
         * 而 gold-600/700 这类"只该做描边"的暗金依旧不够——那部分单独清了。
         * 顺带把 4% 的透底也收掉：半透明底板会让"底下是海还是陆地"改变可读性。
         */
        background: `
          linear-gradient(135deg, rgba(40, 30, 18, 0.985) 0%, rgba(52, 38, 22, 0.985) 50%, rgba(40, 30, 18, 0.985) 100%)
        `,
        /*
         * 【为什么边框要改成"分层"】
         * 原来是一条 2px 的 rgba(201,169,110,0.6) 实线 —— 均匀、半透明、没有厚度。
         * 放大看就是一根画上去的金线，面板因此读作"一片深褐色玻璃"，
         * 而紧挨着它的侧栏铭牌（.side-plate）是三段渐变 + 顶棱受光 + 底棱背光，
         * 两者放在一起，最大的一块反而是最薄的。
         *
         * 铜框的读法靠"两暗一明"：
         *   外侧 1px 近黑   → 把面板从地图上切下来（没有它，面板边界和深色海面糊在一起）
         *   内侧 1px 亮金   → 框的内棱受光，厚度感就来自这一条
         *   底缘 2px 暗     → 背光的框厚
         * 外面再垫一层 3px、14% 的金色晕，模拟铜件反到桌面上的光。
         */
        border: '1px solid rgba(206,172,108,0.88)',
        boxShadow: [
          '0 0 0 1px rgba(12,8,3,0.92)',
          '0 0 0 3px rgba(201,169,110,0.13)',
          'inset 0 0 0 1px rgba(255,238,186,0.26)',
          'inset 0 1px 0 rgba(255,246,214,0.30)',
          'inset 0 -2px 0 rgba(0,0,0,0.58)',
          '0 12px 34px rgba(0,0,0,0.76)',
        ].join(', '),
      }}
    >
      {/* 真羊皮纸纹理（F1）：低透明度叠在深褐底上增加纸的颗粒感 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${UI_ASSETS.parchment})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.09,
        }}
      />

      {/* 四角包铜：外框 1px 金线之外再压一段 2px 的角线，角上的铜件比边线厚一档 */}
      <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-gold-300/75 rounded-tl-lg" />
      <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-gold-300/75 rounded-tr-lg" />
      <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-gold-300/75 rounded-bl-lg" />
      <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-gold-300/75 rounded-br-lg" />

      <div className="relative p-4">
        <div className="flex items-center justify-between mb-2">
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
        {/*
         * 【标题下的分隔线要两端渐隐】
         * 原来是 `border-b border-gold-700/30` —— 一条等宽等浓的实线，
         * 从左边一直画到右边，末端是一个硬切口。放大看像表格的单元格边框，
         * 而不是版画上的装饰线。铜版画里的分隔线中间浓、两头收进纸里。
         * 两端渐隐之后，标题和内容之间才有"层次"而不是"分格"。
         */}
        <div
          aria-hidden="true"
          className="h-px mb-3"
          style={{
            background:
              'linear-gradient(90deg, rgba(201,169,110,0) 0%, rgba(201,169,110,0.42) 22%, rgba(201,169,110,0.42) 78%, rgba(201,169,110,0) 100%)',
          }}
        />
        {/* 内容区高度：
            桌面端被放在 top-12/bottom-12 的容器里，60vh 刚好；
            移动端面板是底部抽屉（最高 82dvh），要给到 68dvh 才填得下，
            否则抽屉里会套着一条更矮的内滚动区，出现两层滚动条。

            用 ScrollFade 而不是裸 div：面板内容长起来（港口面板的服务+军官+
            船员+任务）会在这里被裁掉，玩家看到最后一行断在半截却没有提示，
            和之前 7 个内层列表是同一个毛病。渐隐色就是本卡片的底色 #30241a。 */}
        {/* 有常驻页脚时给正文让出高度，否则两层加起来会顶出屏幕。
            没有 footer 的 11 个面板仍是原来的 68dvh / 60vh，不受影响。 */}
        <ScrollFade className={
          footer
            ? 'max-h-[40dvh] md:max-h-[38vh] overflow-y-auto scroll-parchment'
            : 'max-h-[68dvh] md:max-h-[60vh] overflow-y-auto scroll-parchment'
        }>
          {children}
        </ScrollFade>
        {footer}
      </div>
    </div>
  )
}
