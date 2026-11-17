import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface FullScreenPanelProps {
  /** 顶部大标题，如「商品交易」 */
  title: string
  /** 标题旁的小字（如「塞维利亚 · 第 63 天」） */
  subtitle?: string
  children: ReactNode
  /** 不随正文滚动的常驻页脚；缺省时渲染默认的键盘提示 */
  footer?: ReactNode
  onClose: () => void
  /** e2e 锚点，如 `trade-screen` */
  testId: string
  /**
   * 正文的宽度档位。
   * - `'md'`（默认）768：一段一段读的页面（舰队、造船）
   * - `'lg'` 1024：本身就是表格/账本的面板（贸易、港口服务）
   */
  width?: 'md' | 'lg'
}

/**
 * 全屏操作面板的外壳（港口 / 贸易 / 造船 / 舰队共用）。
 *
 * 【为什么要从「侧边浮窗」改成整屏】
 * 侧栏五个按钮里，任务/日志/图鉴/成就/船长点开的是**整屏航海志**，
 * 而舰队与港口/贸易/造船点开的还是 320~416px 的窄浮窗 ——
 * 同一列按钮，一半进整屏、一半弹小窗，玩家读起来就是"有些按钮只弹个窗"。
 *
 * 【为什么复用航海志的骨架，而不是自己再包一层】
 * 航海志（`LogbookScreen`）已经解决了一整套问题：深底不是纯色（有一层极淡羊皮纸底纹）、
 * 顶栏左侧标题 + 右侧「回海图」、主体 `flex-1 min-h-0` 自己滚、
 * 移动端与桌面同一套。四块面板照抄这套骨架，玩家不会有"这是另一个应用"的感觉。
 *
 * 【2026-11-17 第二版：整屏不能只是"变宽了的侧板"】
 * 第一版直接把侧板内容塞进 768px 的居中栏，1440 下实测的后果是：
 * 内容挤在上半屏、下面半屏死黑（贸易面板尤其明显 —— 六行商品之后全是空），
 * 而顶栏右侧又空出 1000px。两侧加起来 700px 的空白，读起来像"页面没做完"。
 * 这一版补三件事：
 *   · **顶栏升到 h-14/h-16**，标题与副标题用一道竖线分开 —— 不再是"两个小字并排"；
 *   · **底部常驻脚注条**（左：这一屏能做什么；右：键盘提示），把下半屏收口；
 *   · **正文宽度分档**：账本类面板给 1024，读文类给 768。
 * 空白本身不是问题，问题是"空白没有边界"—— 现在底边有脚注、顶边有标题带，
 * 中间那点余白才是留白，而不是漏做。
 */
export default function FullScreenPanel({
  title, subtitle, children, footer, onClose, testId, width = 'md',
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
      {/*
        顶部渐晕：标题带下方压一层从黑到透明的过渡。
        【为什么】整屏底色 #0d1116 与顶栏的 #0b0e11 几乎同色，标题带只有一条
        0.3 透明度的金线分隔，滚动时正文会从标题底下"渗出来"。
        一层 64px 的渐晕让标题带自带厚度，深色面板才不会读成一块平面。
      */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-24 pointer-events-none"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 100%)' }}
      />

      <header className="relative shrink-0 h-14 md:h-16 flex items-center justify-between gap-4 px-5 md:px-10 border-b border-gold-700/30">
        <div className="flex items-center gap-3 md:gap-4 min-w-0">
          <h1 className="pirate-title text-xl md:text-[26px] text-gold-300 leading-none truncate">{title}</h1>
          {subtitle && (
            <>
              <span aria-hidden="true" className="hidden sm:block h-4 w-px bg-gold-700/55 shrink-0" />
              <span className="hidden sm:block text-[13px] font-serif text-gold-500 truncate">{subtitle}</span>
            </>
          )}
        </div>
        <button
          onClick={onClose}
          data-testid={`${testId}-close`}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-gold-700/40
            text-gold-300 hover:bg-gold-700/15 transition-colors font-serif text-sm press"
          title="回到海图（Esc）"
        >
          <X size={14} />
          <span className="hidden sm:inline">回海图</span>
        </button>
      </header>

      {/*
       * 正文自己滚。`flex-1 min-h-0` 缺一不可：没有 min-h-0 时 flex 子项
       * 的最小高度是内容高度，滚动区会被内容撑开、整块溢出。
       */}
      <div className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain scroll-parchment">
        <div
          className={`mx-auto w-full px-5 md:px-10 py-5 md:py-7 ${
            width === 'lg' ? 'max-w-5xl' : 'max-w-3xl'
          }`}
        >
          {children}
        </div>
      </div>

      {/*
        脚注条：不滚、不挡内容。
        左侧是这一屏的"能做什么"，右侧是键盘提示 —— 这一条同时解决两件事：
        下半屏有了边界（不再是纯黑），以及玩家不必记住 1-8 / Esc。
      */}
      <div className="relative shrink-0 h-9 md:h-10 flex items-center justify-between gap-3 px-5 md:px-10 border-t border-gold-700/25 bg-black/25">
        <span className="text-[12px] font-serif text-gold-600 truncate">{footer}</span>
        <span className="hidden md:flex items-center gap-3 text-[12px] font-serif text-gold-600 tabular-nums shrink-0">
          <span>1–8 换面板</span>
          <span className="text-gold-600">·</span>
          <span>Esc 回海图</span>
        </span>
      </div>
    </div>
  )
}
