import { useGameStore } from '@/store/useGameStore'
import { Compass, Scroll, Trophy, AlertTriangle, X } from 'lucide-react'
import { useEffect, useState } from 'react'

const iconMap = {
  discovery: Compass,
  history: Scroll,
  achievement: Trophy,
  warning: AlertTriangle,
}

const colorMap = {
  discovery: 'border-blue-400/40 bg-ocean-900/90',
  history: 'border-gold-400/40 bg-ocean-900/90',
  achievement: 'border-amber-400/40 bg-ocean-900/90',
  warning: 'border-red-400/40 bg-ocean-900/90',
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

export default function NotificationToast() {
  const notifications = useGameStore(s => s.notifications)
  const removeNotification = useGameStore(s => s.removeNotification)
  const [visible, setVisible] = useState<VisibleNotification[]>([])

  useEffect(() => {
    const newVisible = notifications.map(n => {
      const existing = visible.find(v => v.id === n.id)
      return existing ? existing : { ...n, removing: false }
    })
    setVisible(newVisible)
  }, [notifications])

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    visible.forEach(n => {
      if (!n.removing) {
        const dismissTimer = setTimeout(() => {
          setVisible(prev => prev.map(v => v.id === n.id ? { ...v, removing: true } : v))
        }, 3500)
        const removeTimer = setTimeout(() => {
          removeNotification(n.id)
        }, 4000)
        timers.push(dismissTimer, removeTimer)
      }
    })

    return () => timers.forEach(clearTimeout)
  }, [visible.length])

  const handleDismiss = (id: string) => {
    setVisible(prev => prev.map(v => v.id === id ? { ...v, removing: true } : v))
    setTimeout(() => removeNotification(id), 500)
  }

  if (visible.length === 0) return null

  return (
    <div className="absolute top-14 right-4 flex flex-col gap-2 max-w-[320px]">
      {visible.map(n => {
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
              <div className="text-gold-200 font-serif text-sm font-bold truncate">{n.title}</div>
              <div className="text-gold-400 text-xs mt-0.5 truncate">{n.message}</div>
            </div>
            <button
              onClick={() => handleDismiss(n.id)}
              className="text-gold-600 hover:text-gold-300 transition-colors shrink-0 mt-0.5"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
