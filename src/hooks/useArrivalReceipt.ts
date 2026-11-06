import { useMemo } from 'react'
import { useGameStore } from '@/store/useGameStore'
import type { LogbookEntry } from '@/types'

export interface ArrivalReceipt {
  /** 真实未读页数；屏幕若写数字，只能来自这里 */
  unread: number
  /** 最新一页未读（logbook 是新 → 旧）；没有则 null */
  latest: LogbookEntry | null
  /** 主屏那一行短句：从页里的真实字段截出，不另写一套文案 */
  gist: string
}

/**
 * 常驻条主行是 12px 的一行，实测可用宽约 306px ≈ 25 个汉字；扣掉
 * 「刚带回 · 」前缀后只剩 18 字。上一轮 layout-audit 就是因为港名被
 * truncate 裁掉 7px 报红，所以这里直接给硬上限，宁可截短也不让 CSS 裁。
 * 完整原文由组件放进 title 属性，hover 仍读得到，屏幕上的短句不撒谎。
 */
const MAX_GIST = 16

/** 截到破折号前，留下的正是那句「没讲完的尾巴」本身 */
function gistOf(entry: LogbookEntry): string {
  let text = entry.title
  const hint = entry.hint ?? ''
  const cut = hint.indexOf('——')
  if (cut > 0) text = hint.slice(0, cut)
  else if (hint) text = hint.split('。')[0] || entry.title
  // 应验页的完整句子有 23 字，会撑破一行；用它的标题（「应验 · 果阿」），
  // 完整正文交给 title 属性，不凭空造字也不丢内容。
  return text.length > MAX_GIST ? `${text.slice(0, MAX_GIST)}…` : text
}

/**
 * 「这趟带回了什么」的唯一计算来源。
 *
 * 【为什么需要它】到港时 `arriveAtPort` 会写一页见闻（含一句不过期的线索），
 * 首次靠上线索所指的港还会补一页应验。实测 1440×900 连跑 10 趟：主屏可见
 * 文本里这些字样一次都没出现，唯一提示是侧栏「日志」按钮上一个 8px 红点 +
 * 屏幕上看不见的 aria-label。内容其实做得很完整（见闻标题、风土注、线索、
 * 应验页、三页签、在地图上看看都在），只是没有常驻出口 —— 和「下一站」曾经
 * 埋在任务面板里是同一个结构病。
 *
 * 【为什么不另写文案】册子里的句子是留存机制本身；主屏若自己拼一句「有新内容」，
 * 迟早与册子分叉。这里只做「取最新一页 + 截短」，字字来自 LogbookEntry。
 *
 * 【为什么只读未读页】打开日志（默认见闻页）的 SightingsView 会立刻
 * markLogbookRead；已读归零后主屏自动回到「航路 · 目标」，不留下一条
 * 永远消不掉的横条。翻过才算看过，玩家不被常驻条缠住。
 */
export function useArrivalReceipt(): ArrivalReceipt {
  const logbook = useGameStore(s => s.logbook)
  return useMemo(() => {
    const unreadPages = logbook.filter(e => !e.read)
    const latest = unreadPages[0] ?? null
    return {
      unread: unreadPages.length,
      latest,
      gist: latest ? gistOf(latest) : '',
    }
  }, [logbook])
}
