import { useState } from 'react'
import { Volume2, VolumeX, Music4 } from 'lucide-react'
import { isAmbienceEnabled, setAmbienceEnabled, startAmbience } from '@/utils/audio'
import { getBgmLevel, setBgmLevel } from '@/utils/bgm'

/**
 * 声音控制。首次点击会同时满足浏览器"用户手势"要求，
 * 从而创建并启动 AudioContext。
 *
 * 音量条为 BGM 专用比例（0~100%），与总开关独立：
 * 玩家可能想静音环境音但仍想听配乐，反之亦然。
 */
export default function SoundToggle() {
  const [enabled, setEnabled] = useState(isAmbienceEnabled())
  const [bgm, setBgm] = useState(getBgmLevel())
  const [open, setOpen] = useState(false)

  const toggle = () => {
    const next = !enabled
    // 任何一次点击都是合法手势，确保音频上下文已就绪
    startAmbience()
    setAmbienceEnabled(next)
    setEnabled(next)
  }

  const changeBgm = (v: number) => {
    setBgmLevel(v)
    setBgm(v)
  }

  return (
    <div className="relative flex items-center gap-1">
      {open && (
        <div className="absolute right-full mr-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-1 rounded bg-ink-900/90 border border-gold-700/40 backdrop-blur-sm">
          <Music4 size={11} className="text-gold-400 shrink-0" aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(bgm * 100)}
            onChange={(e) => changeBgm(Number(e.target.value) / 100)}
            className="w-16 h-1 accent-gold-400 cursor-pointer"
            aria-label="配乐音量"
            title={`配乐音量 ${Math.round(bgm * 100)}%`}
          />
          <span className="text-[9px] text-gold-400 font-serif tabular-nums w-6 text-right">
            {Math.round(bgm * 100)}%
          </span>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className={`p-1 rounded transition-colors ${
          open ? 'bg-gold-700/40 text-gold-200' : 'text-gold-500 hover:text-gold-300'
        }`}
        title="配乐音量"
        aria-label="配乐音量"
        aria-expanded={open}
      >
        <Music4 size={12} aria-hidden="true" />
      </button>

      <button
        onClick={toggle}
        className={`p-1 rounded transition-colors ${
          enabled ? 'bg-gold-700/40 text-gold-200' : 'text-gold-500 hover:text-gold-300'
        }`}
        title={enabled ? '关闭声音' : '开启声音'}
        aria-label={enabled ? '关闭声音' : '开启声音'}
        aria-pressed={enabled}
      >
        {enabled ? <Volume2 size={12} aria-hidden="true" /> : <VolumeX size={12} aria-hidden="true" />}
      </button>
    </div>
  )
}
