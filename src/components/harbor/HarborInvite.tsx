import { useEffect, useRef, useState } from 'react'
import { Anchor, ArrowRight, X } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports } from '@/data/ports'
import { DURATION, EASE_STANDARD, prefersReducedMotion } from '@/utils/motion'

/**
 * 靠岸邀请：航行 → 停泊那一下，把「还有第二个空间」说给玩家听。
 *
 * 【为什么不是全屏自动切换】
 * 到港自动弹岸上视图会打断玩家（上一轮刚修掉的"彩蛋遮罩打断面板"就是同类问题），
 * 也会让所有"到港后直接点地图/开面板"的旧流程全部失效。
 * 这里只给一条 9 秒自动收起的小条：看见了可以点，没看见也完全不影响操作。
 *
 * 【为什么用 isSailing 的下降沿，而不是"当前停泊"】
 * 判据若写成 `!isSailing && currentPortId != null`，玩家每次刷新页面都会再弹一次，
 * 关掉也没用。只有真正"刚从海上回来"的那一刻才该提示——reload 后
 * wasSailing 初值就是 false，不会误弹。
 */
const AUTO_HIDE_MS = 9000

export default function HarborInvite() {
  const fleet = useGameStore(s => s.fleet)
  const setActivePanel = useGameStore(s => s.setActivePanel)
  const viewMode = useMapStore(s => s.viewMode)
  const setViewMode = useMapStore(s => s.setViewMode)

  const [visible, setVisible] = useState(false)
  const wasSailing = useRef(fleet.isSailing)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const arrived = wasSailing.current && !fleet.isSailing && fleet.currentPortId != null
    wasSailing.current = fleet.isSailing
    if (arrived) setVisible(true)
  }, [fleet.isSailing, fleet.currentPortId])

  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => setVisible(false), AUTO_HIDE_MS)
    return () => clearTimeout(t)
  }, [visible])

  // 已经上岸 / 又开船了，邀请条就没有存在的理由
  useEffect(() => {
    if (viewMode === 'harbor' || fleet.isSailing) setVisible(false)
  }, [viewMode, fleet.isSailing])

  useEffect(() => {
    if (!visible) { setShown(false); return }
    if (prefersReducedMotion()) { setShown(true); return }
    const raf = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(raf)
  }, [visible])

  if (!visible || viewMode === 'harbor' || fleet.isSailing) return null
  const port = ports.find(p => p.id === fleet.currentPortId)
  if (!port) return null

  /*
   * 从 top-10(40px) 下移到 104px：常驻「下一站」占着罗盘右侧 y56~100，
   * 在 1024~1280 的中屏上本条居中后左边缘约 342~470px，会横向压住它。
   * 下移一行让两条上下错开；9 秒后本条收起、常驻条仍在原位。
   */
  const reduced = prefersReducedMotion()
  const style: React.CSSProperties = reduced
    ? { opacity: 1 }
    : {
        opacity: shown ? 1 : 0,
        transform: shown ? 'translate(-50%, 0)' : 'translate(-50%, -8px)',
        transition: `opacity ${DURATION.normal}ms ${EASE_STANDARD}, transform ${DURATION.normal}ms ${EASE_STANDARD}`,
      }

  return (
    <div
      className="fixed top-[6.5rem] left-1/2 z-[62] flex items-center gap-3 pl-3 pr-2 py-2 rounded-lg
        border border-gold-500/55 bg-[#241a10]/95 shadow-[0_8px_28px_rgba(0,0,0,0.7)]"
      style={style}
      data-testid="harbor-invite"
      role="status"
    >
      <Anchor size={16} className="text-gold-300 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-gold-100 font-serif text-[13px] leading-tight whitespace-nowrap">
          已靠岸 · {port.nameCn}
        </p>
        <p className="text-gold-400 font-serif text-[12px] leading-tight mt-0.5 whitespace-nowrap">
          这趟带回的一页见闻已收进日志
        </p>
      </div>
      <button
        onClick={() => { setActivePanel(null); setViewMode('harbor') }}
        data-testid="harbor-invite-enter"
        className="inline-flex items-center gap-1 shrink-0 px-2.5 py-1.5 rounded
          border border-gold-500/60 bg-gold-700/30 hover:bg-gold-700/50
          text-gold-100 font-serif text-[13px] press transition-colors"
      >
        上岸走走
        <ArrowRight size={13} aria-hidden="true" />
      </button>
      <button
        onClick={() => setVisible(false)}
        aria-label="收起靠岸提示"
        data-testid="harbor-invite-close"
        className="shrink-0 p-1 rounded text-gold-500 hover:text-gold-200 hover:bg-gold-700/25 press transition-colors"
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  )
}
