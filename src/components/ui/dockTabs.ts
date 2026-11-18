import type { PanelType } from '@/types'

/**
 * 整屏面板顶部的那排页签。
 *
 * 【为什么要它】
 * 面板做成整屏之后，`chartUiVisible` 变 false —— **侧栏那一列是卸载的**。
 * 于是"从贸易切到港口"这件事，玩家得：Esc 回海图 → 找到侧栏 → 点港口。
 * 三步操作、中间还闪一下海图；而这两件事在他心里是同一类（"我要处理这个港"）。
 * 页签把这三步压成一次点击。
 *
 * 只放四块**与靠岸行为有关**的面板：港口 / 贸易 / 造船 / 舰队。
 * 任务、日志、图鉴、成就、船长是"记录"，它们在航海志里已经有一套左侧竖排页签，
 * 混进来会让两套导航打架。
 */
export const DOCK_TABS: { key: PanelType; label: string }[] = [
  { key: 'port', label: '港口' },
  { key: 'trade', label: '贸易' },
  { key: 'shipyard', label: '造船' },
  { key: 'fleet', label: '舰队' },
]
