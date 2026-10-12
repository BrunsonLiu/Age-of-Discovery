import { useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { isAmbienceEnabled, setAmbienceEnabled, startAmbience } from '@/utils/audio'

/**
 * 环境音开关。首次点击会同时满足浏览器"用户手势"要求，
 * 从而创建并启动 AudioContext。
 */
export default function SoundToggle() {
  const [enabled, setEnabled] = useState(isAmbienceEnabled())

  const toggle = () => {
    const next = !enabled
    // 任何一次点击都是合法手势，确保音频上下文已就绪
    startAmbience()
    setAmbienceEnabled(next)
    setEnabled(next)
  }

  return (
    <button
      onClick={toggle}
      className={`p-1 rounded transition-colors ${
        enabled ? 'bg-gold-700/40 text-gold-200' : 'text-gold-500 hover:text-gold-300'
      }`}
      title={enabled ? '关闭环境音' : '开启环境音'}
      aria-label={enabled ? '关闭环境音' : '开启环境音'}
      aria-pressed={enabled}
    >
      {enabled ? <Volume2 size={12} aria-hidden="true" /> : <VolumeX size={12} aria-hidden="true" />}
    </button>
  )
}
