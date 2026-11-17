import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface FullScreenPanelProps {
  /** 顶部大标题，如「商品交易」 */
  title: string
  /** 标题旁的小字（如「塞维利亚 · 第 63 天」） */
  subtitle?: string
  children: ReactNode
  /** 不随正文滚动的常驻页脚；缺省时不渲染 */
  footer?: ReactNode
  onClose: () => void
  /** e2e 锚点，如 `trade-screen` */
  testId: string
}

/**
 * 全屏操作面板的外壳（港口 / 贸易 / 造船 / 舰队共用）。
 *
 * 【为什么要从「侧边浮窗」改成整屏】
 * 侧栏五个按钮里，任务/日志/图鉴/成就/船长点开的是**整屏航海志**，
 * 而舰队与港口/贸易/造船点开的还是 320~416px 的窄浮窗 ——
 * 同一列按钮，一半进整屏、一半弹小窗，玩家读起来就是"有些按钮只弹个窗"。
 * 手机上更分裂：那三块是底部抽屉（82dvh），航海志却是整屏。
 *
 * 【为什么复用航海志的骨架，而不是自己再包一层】
 * 航海志（`LogbookScreen`）已经解决了一整套问题：深底不是纯色（有一层极淡羊皮纸底纹）、
 * 顶栏左侧标题 + 右侧「回海图」、主体 `flex-1 min-h-0` 自己滚、
 * 移动端与桌面同一套。四块面板照抄这套骨架，玩家不会有"这是另一个应用"的感觉。
 *
 * 【为什么正文要 `max-w-3xl` 居中】
 * 桌面 1440 下如果铺满，贸易面板一行会拉成 1300px 宽 ——
 * 商品名在左、价格与按钮在右，中间一大片空白，眼睛要横着跑。
 * 768px 是"一屏能读完两列文字"的上限，也让 390 手机自然变成满宽。
 *
 * 【为什么用 `absolute` 而不是 `fixed`】
 * 它和航海志一样挂在 MainMap 的同一个定位容器里，跟着地图层一起被
 * 侧栏/底栏的层级关系约束。用 fixed 会跑到侧栏上面去。
 */
export default function FullScreenPanel({
  title, subtitle, children, footer, onClose, testId,
}: FullScreenPanelProps) {
  return (
    <div
      className="absolute inset-0 flex flex-col"
      data-testid={testId}
      role="region"
      aria-label={title}
      style={{ backgroundColor: '#0d1116' }}
    >
      {/* 极淡的羊皮纸底纹：和航海志同款，让整屏不是一块死色 */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-[0.07]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 30% 20%, #e8d5a8 0%, transparent 55%), radial-gradient(circle at 75% 80%, #c9a96e 0%, transparent 60%)',
        }}
      />

      <header className="relative shrink-0 flex items-end justify-between gap-3 px-5 md:px-10 pt-5 pb-3 border-b border-gold-700/30">
        <div className="flex items-end gap-3 min-w-0">
          <h1 className="pirate-title text-xl md:text-[26px] text-gold-300 leading-none truncate">{title}</h1>
          {subtitle && (
            <span className="hidden sm:block text-xs font-serif text-gold-500 mb-0.5 truncate">{subtitle}</span>
          )}
        </div>
        <button
          onClick={onClose}
          data-testid={`${testId}-close`}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-gold-700/40
            text-gold-300 hover:bg-gold-700/15 transition-colors font-serif text-sm"
          title="回到海图（Esc）"
        >
          <X size={14} />
          <span className="hidden sm:inline">回海图</span>
        </button>
      </header>

      {/*
       * 正文自己滚。`flex-1 min-h-0` 缺一不可：没有 min-h-0 时 flex 子项
       * 的最小高度是内容高度，滚动区会被内容撑开、整块溢出（这个坑今天已经
       * 在 ParchmentCard 上踩过一次）。
       */}
      <div className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-parchment">
        <div className="mx-auto max-w-3xl px-4 md:px-8 py-4 md:py-5">{children}</div>
      </div>

      {footer && (
        <div className="relative shrink-0 border-t border-gold-700/30 px-4 md:px-8 py-3">
          <div className="mx-auto max-w-3xl">{footer}</div>
        </div>
      )}
    </div>
  )
}
