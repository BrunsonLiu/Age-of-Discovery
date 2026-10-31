import { useGameStore } from '@/store/useGameStore'
import { Compass, Scroll, Trophy, AlertTriangle, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'

const iconMap = {
  discovery: Compass,
  history: Scroll,
  achievement: Trophy,
  warning: AlertTriangle,
}

const colorMap = {
  discovery: 'border-blue-400/60 bg-slate-900/95',
  history: 'border-gold-400/60 bg-slate-900/95',
  achievement: 'border-amber-400/60 bg-slate-900/95',
  warning: 'border-red-400/60 bg-slate-900/95',
}

const iconColorMap = {
  discovery: 'text-blue-400',
  history: 'text-gold-400',
  achievement: 'text-amber-400',
  warning: 'text-red-400',
}

interface VisibleNotification {
  id: string
  type: 'discovery' | 'history' | 'achievement' | 'warning'
  title: string
  message: string
  timestamp: number
  removing: boolean
}

const AUTO_DISMISS_MS = 3500
const REMOVE_AFTER_ANIM_MS = 500

/**
 * 同时最多显示几条。
 *
 * 通知是**奖励反馈**，不紧急；但它固定在右上角，而右侧面板（贸易/港口/船厂）
 * 也在右上角。早期版本一次渲染全部通知——一次交易同时解锁 4 个成就时，
 * 4 条通知叠起来把整个面板盖住，玩家 3.5 秒内什么都点不了。
 * 超出的折叠成「+N」，内容不丢（前几条消失后自然补位）。
 */
const MAX_VISIBLE = 2

export default function NotificationToast() {
  const notifications = useGameStore(s => s.notifications)
  const activePanel = useGameStore(s => s.activePanel)
  const removeNotification = useGameStore(s => s.removeNotification)
  const [visible, setVisible] = useState<VisibleNotification[]>([])
  const visibleRef = useRef<VisibleNotification[]>([])
  const isMobile = useIsMobile()

  useEffect(() => {
    visibleRef.current = visible
  }, [visible])

  useEffect(() => {
    if (notifications.length === 0) {
      setVisible(prev => prev.length > 0 ? [] : prev)
      return
    }

    const prevById = new Map(visibleRef.current.map(v => [v.id, v]))
    const newVisible = notifications.map(n => {
      const existing = prevById.get(n.id)
      return existing ?? { ...n, removing: false }
    })
    setVisible(newVisible)
  }, [notifications])

  useEffect(() => {
    if (visible.length === 0) return

    const timers: ReturnType<typeof setTimeout>[] = []

    for (const n of visible) {
      if (n.removing) continue
      const dismissTimer = setTimeout(() => {
        setVisible(prev => prev.map(v => v.id === n.id ? { ...v, removing: true } : v))
      }, AUTO_DISMISS_MS)
      const removeTimer = setTimeout(() => {
        removeNotification(n.id)
      }, AUTO_DISMISS_MS + REMOVE_AFTER_ANIM_MS)
      timers.push(dismissTimer, removeTimer)
    }

    return () => timers.forEach(clearTimeout)
  }, [visible, removeNotification])

  const handleDismiss = (id: string) => {
    setVisible(prev => prev.map(v => v.id === id ? { ...v, removing: true } : v))
    setTimeout(() => removeNotification(id), REMOVE_AFTER_ANIM_MS)
  }

  if (visible.length === 0) return null

  const shown = visible.slice(0, MAX_VISIBLE)
  const overflow = visible.length - shown.length
  // 右侧面板（贸易/港口/船厂）就在通知所在的这一块。面板打开时把整叠通知
  // 滑到面板左边去——成就提示挪个位置照样看得见，但不会压在玩家正要操作的东西上。
  //
  // 移动端不做这个位移：面板是底部抽屉，通知在顶部，本来就不打架；
  // 而横移会把通知推出屏幕。
  const shifted = activePanel != null && !isMobile

  return (
    // pointer-events-none：通知是纯展示，**绝不能挡住玩家的点击**。
    // 视觉上它可能压在右侧面板上，但下面的按钮照样能点。
    <div
      className={`absolute flex flex-col gap-2 pointer-events-none ${
        isMobile
          ? 'top-11 left-2 right-2 max-w-none'
          : 'top-14 right-4 max-w-[320px]'
      }`}
      style={{
        transform: shifted ? 'translateX(calc(-100% - 1rem))' : 'translateX(0)',
        transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >      {shown.map(n => {
        const Icon = iconMap[n.type]
        return (
          <div
            key={n.id}
            className={`
              ${colorMap[n.type]}
              ${n.removing ? 'animate-slide-out-right' : 'animate-slide-in-right'}
              border rounded-lg p-3 backdrop-blur-sm shadow-xl
              flex items-start gap-3
            `}
          >
            <div className={`${iconColorMap[n.type]} mt-0.5 shrink-0`}>
              <Icon size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-gold-100 font-serif text-[15px] tracking-wide truncate">{n.title}</div>
              {/* 历史节点的正文是重点，允许两行；其余通知保持单行紧凑 */}
              <div className={`text-gold-400 text-xs mt-0.5 ${n.type === 'history' ? 'line-clamp-2' : 'truncate'}`}>
                {n.message}
              </div>
            </div>
            <button
              onClick={() => handleDismiss(n.id)}
              aria-label="关闭通知"
              className="text-gold-600 hover:text-gold-300 transition-colors shrink-0 mt-0.5 pointer-events-auto"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
      {overflow > 0 && (
        <div className="self-end text-gold-500 text-[10px] font-serif px-2 py-0.5 rounded bg-ocean-900/85 border border-gold-700/25">
          还有 {overflow} 条通知
        </div>
      )}
    </div>
  )
}
