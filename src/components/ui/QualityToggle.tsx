import { useEffect, useState } from 'react'
import { Zap, Gauge, Sparkles } from 'lucide-react'
import { QUALITY_ORDER, QUALITY_PRESETS, cycleQuality, getQuality, onQualityChange } from '@/utils/quality'
import type { QualityLevel } from '@/utils/quality'

/**
 * 画质档位开关（底栏，紧挨着音量）。
 *
 * 【为什么玩家需要它】自适应分辨率只在"已经卡了"之后才降像素，而档位是**事前**的
 * 选择：核显用户直接选"流畅"，独显用户选"精细"。两件事互补 ——
 * 档位定上限，自适应在上限之内浮动。
 *
 * 【为什么是"点一下循环"而不是下拉】底栏的宽度在 1024 宽屏上已经很紧
 * （之前那一排开关 + 重置按钮刚好铺满），下拉会挡住地图。三个档位循环点击
 * 是这类小游戏最常见也最省空间的做法。
 */
const ICONS: Record<QualityLevel, typeof Zap> = {
  low: Zap,
  mid: Gauge,
  high: Sparkles,
}

export default function QualityToggle() {
  const [q, setQ] = useState<QualityLevel>(getQuality())
  // 订阅：别处（例如自动降档）改了档位，按钮的文字要跟着变
  useEffect(() => onQualityChange((nq) => setQ(nq)), [])

  const preset = QUALITY_PRESETS[q]
  const Icon = ICONS[q]

  return (
    <button
      onClick={() => setQ(cycleQuality())}
      /*
       * `hidden xl:flex`：底栏那一排在 1024 宽屏上已经是满的（新增一个按钮会
       * 把右侧的"重新开始"挤出可视区，clickable-audit 会红）。1280 以上才出现，
       * 窄屏靠自适应分辨率顶着。
       */
      className="hidden xl:flex items-center gap-1 p-1 rounded text-gold-400 hover:text-gold-200 hover:bg-gold-700/30 press transition-all"
      title={`画质：${preset.label}（点击切换 ${QUALITY_ORDER.map((k) => QUALITY_PRESETS[k].label).join(' / ')}）`}
      aria-label={`画质：${preset.label}`}
      data-testid="quality-toggle"
      data-quality={q}
    >
      {/* 只留图标：底栏在 1024 宽屏上已经挤满，而且中文标签会被
          "中文 UI 下限 12px" 的判据拦下（small-text e2e 会红）。
          三档用三个不同的图标形状区分，当前档位在 title / aria-label 里。 */}
      <Icon size={15} aria-hidden="true" />
    </button>
  )
}
