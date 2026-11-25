import type { EventChoice, NotorietyAxis } from '@/types'

/**
 * 五轴取向 → 可见选项的**唯一过滤入口**（R3）。
 *
 * 【为什么要它】取向（残忍/仁慈/贪婪/胆识/隐秘）从第 29 轮起就在累积，
 * 但全项目只有 `currentTitle()` 与册子的「正在成为」读它 —— 玩家做了三十次
 * 道德选择，换来的只是一个称号。同类游戏（太吾、鬼谷）里，"你是哪种人"
 * 会**改变你能选什么**：这才是选择有重量的证据。
 *
 * 【为什么必须是一个函数，而不是每个组件里 .filter】
 * 事件卡、结算、潜在的推荐器都要知道"这一刻能选哪些"。散着写一次漏一处，
 * 就会出现"屏上少一个选项，但按 index 取值却取到了它"这种最难查的错。
 * `handleSelectChoice(index)` 取的是**过滤后**列表的下标，所以只有一个列表。
 *
 * 【兜底】没有取向数据（老存档 / 未初始化）时一律显示全部 —— 宁可让老档少一层
 * 机制，也不能让玩家看到一个没有选项的事件卡。
 */
export function visibleChoices(
  choices: readonly EventChoice[],
  notoriety: Partial<Record<NotorietyAxis, number>> | undefined,
): EventChoice[] {
  if (!notoriety) return [...choices]
  return choices.filter(c => {
    const need = c.requireAxis
    if (!need) return true
    return (notoriety[need.axis] ?? 0) >= need.min
  })
}

/** 某个取向离某个阈值还差多少（给"再走一步就多一个选项"这类提示用；不满足返回 0） */
export function axisGap(
  axis: NotorietyAxis,
  min: number,
  notoriety: Partial<Record<NotorietyAxis, number>> | undefined,
): number {
  const v = notoriety?.[axis] ?? 0
  return v >= min ? 0 : min - v
}
