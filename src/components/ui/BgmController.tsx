import { useEffect } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { setBgmMood, startBgm, type BgmMood } from '@/utils/bgm'
import { isAmbienceEnabled, startAmbience } from '@/utils/audio'

/**
 * BGM 控制器：把配乐情绪绑定到玩家的真实处境。
 *
 * 映射规则（按优先级）：
 *   事件/对白阶段 → event   留白，把注意力让给文字
 *   暴风雨天气    → storm   紧张
 *   航行中        → sail    稳定推进
 *   港口/主界面   → calm    温暖、节奏轻快
 *
 * BGM 必须在用户手势后才能启动（浏览器自动播放策略），
 * 因此首屏的"启航"点击会同时启动环境音与 BGM。
 */
export default function BgmController() {
  const gamePhase = useGameStore((s) => s.gamePhase)
  const isSailing = useGameStore((s) => s.fleet.isSailing)
  const weatherKind = useGameStore((s) => s.weather.kind)

  // 情绪跟随状态
  useEffect(() => {
    let mood: BgmMood
    if (gamePhase === 'event' || gamePhase === 'helm' || gamePhase === 'segment') {
      mood = 'event'
    } else if (weatherKind === 'storm') {
      mood = 'storm'
    } else if (isSailing) {
      mood = 'sail'
    } else {
      mood = 'calm'
    }
    setBgmMood(mood)
  }, [gamePhase, isSailing, weatherKind])

  // 首次交互时启动音频上下文与 BGM
  useEffect(() => {
    const kick = () => {
      if (!isAmbienceEnabled()) return
      startAmbience()
      startBgm()
    }
    // pointerdown 捕获阶段：比 click 更早拿到手势
    window.addEventListener('pointerdown', kick, { capture: true })
    window.addEventListener('keydown', kick, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', kick, { capture: true })
      window.removeEventListener('keydown', kick, { capture: true })
    }
  }, [])

  return null
}
