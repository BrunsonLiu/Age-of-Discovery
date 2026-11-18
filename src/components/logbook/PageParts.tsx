import type { ReactNode } from 'react'

/**
 * 航海志的两级标题。**全册只有这两个组件**，五个页面都用它们。
 *
 * 【为什么必须收成一个】
 * 2026-11-18 实测（DOM，不是看截图）：同一本册子里，「段落」这一级出现了四种写法 ——
 *
 * | 页   | 标题 | 字号 | 线             | 计数 |
 * |------|------|------|----------------|------|
 * | 任务 | 眼下能接 | 18px | 后面的填充线 25% | 标题右侧 |
 * | 图鉴 | 航路 | 13px | **没有线** | 右端 |
 * | 成就 | 商路 COMMERCE | 13px | 底部线 30% | 右端 |
 * | 船长 | 座次 | 15px | 底部线 30% | 右端 |
 *
 * 同一个东西（"这一页里的第几段"）在四页里长四个样，玩家每翻一页都要重新认一遍
 * 哪一行是标题、哪一行是内容。这不是"风格差异"，是**规则缺失**。
 *
 * 现在两级各一个规范：
 *   · 页头 `PageHead` 18px：一页只有一个（记事 / 已点亮 / 已得 / 座次…）
 *   · 段头 `PageSection` 13px + 字距：一页可以有好几个（航路 / 传说 / 港口…）
 *
 * 两条都遵守同三条：**文字在左、计数在右、底下一道 30% 金线**。
 * 线是统一的：它把"标题"和"下面那一堆"括在一起，比任何字号都更能说明分组。
 */

/** 页头：一页只有一个。右侧放计数，note 放一句口径说明 */
export function PageHead({ title, note, right, testId }: {
  title: ReactNode
  /** 这一页在数什么（"生涯里程碑，判定都落在你做过的事上"） */
  note?: ReactNode
  /** 右侧计数。**必须与段头的计数同一个落点**（右端同一像素） */
  right?: ReactNode
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-baseline gap-3 mb-3 pb-2 border-b border-gold-700/30"
    >
      <h2 className="shrink-0 font-serif text-[18px] leading-none text-gold-300">{title}</h2>
      {note && <span className="min-w-0 truncate text-[12px] font-serif text-gold-600">{note}</span>}
      {right && (
        <span className="ml-auto shrink-0 text-[12px] font-serif tabular-nums text-gold-500">{right}</span>
      )}
    </div>
  )
}

/**
 * 段头。
 *
 * `en` 只在有英文原名的地方给（商路 COMMERCE），`hint` 是"这一段在说什么"，
 * 两者都不占计数的位置 —— 计数永远在最右端，**不跟着文字飘**。
 */
export function PageSection({ title, en, hint, right, testId }: {
  title: ReactNode
  en?: string
  hint?: ReactNode
  right?: ReactNode
  testId?: string
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-baseline gap-2 pb-1 border-b border-gold-700/30"
    >
      <h3 className="shrink-0 font-serif text-[13px] tracking-[0.12em] text-gold-300">{title}</h3>
      {en && <span className="shrink-0 text-[12px] tracking-[0.18em] text-gold-600">{en}</span>}
      {hint && <span className="min-w-0 truncate text-[12px] font-serif text-gold-600">{hint}</span>}
      {right && (
        <span className="ml-auto shrink-0 text-[12px] font-serif tabular-nums text-gold-500">{right}</span>
      )}
    </div>
  )
}
