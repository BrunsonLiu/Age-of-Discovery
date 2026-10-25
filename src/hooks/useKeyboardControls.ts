import { useEffect } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { useDialogueStore } from '@/store/useDialogueStore'
import { emitUiCommand, isMiniGameActive } from '@/utils/uiBus'
import { STANCE_ORDER } from '@/utils/segment'
import { TUTORIAL_STEP_COUNT } from '@/constants/tutorial'

/** 数字键 1-8 对应的面板（与侧边按钮顺序一致） */
const PANEL_KEYS = ['fleet', 'task', 'event', 'achievement', 'rival', 'port', 'trade', 'shipyard'] as const

/**
 * 全键盘控制：让"点点点"之外多一条输入通道。
 *
 * 优先级（自上而下，命中即返回）：
 * 0. 教学引导：Enter/Space 下一步，Esc 跳过（引导是此刻唯一该做的事）
 * 1. 航段抉择：1/2/3 选择方针（这是**唯一**的速度旋钮，必须键盘可达）
 * 2. 剧情致辞：Enter/Space 推进，Esc 跳过整段（戴夫讲话时别的事都靠后）
 * 3. 事件界面：1-9 选择选项，Enter/Space 继续
 * 4. 出航计划：Enter 升起旗帜，Esc 再想想
 * 5. 操舵挑战中：全部按键交给操舵界面（每段必经的节拍）
 * 6. 常规航行/驻港：1-8 面板，Space 暂停/恢复，Esc 关闭，? 帮助
 *
 * 为什么航段抉择排在致辞前面：
 * 出航后会**立刻**弹抉择面板，而开场致辞也在这时播放。
 * 若致辞在前，玩家按 1/2/3 会推进台词而不是选方针——抉择被吞，
 * 玩家盯着一个按不动的面板。这是死锁，必须让阻塞决策优先。
 */
export function useKeyboardControls() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return

      const key = e.key.toLowerCase()
      const s = useGameStore.getState()

      // 0. 教学引导（最高优先级）
      // 引导层是全屏遮罩，玩家此刻只可能在跟引导对话；
      // 若不拦，数字键会穿透打开侧栏、Space 会暂停游戏。
      if (s.gamePhase === 'playing' && s.tutorialStep >= 0 && s.tutorialStep < TUTORIAL_STEP_COUNT) {
        if (key === 'enter' || key === ' ') {
          e.preventDefault()
          if (s.tutorialStep === TUTORIAL_STEP_COUNT - 1) s.skipTutorial()
          else s.nextTutorialStep()
        } else if (key === 'escape') {
          e.preventDefault()
          s.skipTutorial()
        }
        return
      }

      // 1. 航段抉择：1/2/3 直接选方针
      // 这是整个游戏**唯一**的速度/风险旋钮，键盘可达是硬要求——
      // 抉择密度是这版改造的核心指标，鼠标点击一次 300ms，键盘 80ms。
      //
      // 优先级高于致辞：出航后抉择面板立刻弹出，而开场致辞也在这时播，
      // 若致辞在前，玩家按 1/2/3 只会推进台词，抉择面板按不动 = 死锁。
      if (s.gamePhase === 'segment') {
        const n = Number.parseInt(key, 10)
        if (Number.isFinite(n) && n >= 1 && n <= 3) {
          e.preventDefault()
          const stance = STANCE_ORDER[n - 1]
          emitUiCommand({ type: 'segment:choose', stance })
        }
        return
      }

      // 2. 剧情致辞
      if (useDialogueStore.getState().scriptId) {
        if (key === 'enter' || key === ' ') {
          e.preventDefault()
          emitUiCommand({ type: 'dialogue:advance' })
        } else if (key === 'escape') {
          e.preventDefault()
          emitUiCommand({ type: 'dialogue:skip' })
        }
        return
      }

      // 2.5 事件小游戏：键盘完全归小游戏界面管
      // （小游戏期间 gamePhase 仍是 'event'，若不拦住，空格会被当成"继续"、
      //  数字键会被当成"选第几个选项"，操作全部失效）
      if (isMiniGameActive()) {
        return
      }

      // 3. 事件界面
      if (s.gamePhase === 'event') {
        const n = Number.parseInt(key, 10)
        if (Number.isFinite(n) && n >= 1 && n <= 9) {
          e.preventDefault()
          emitUiCommand({ type: 'event:choice', index: n - 1 })
          return
        }
        if (key === 'enter' || key === ' ') {
          e.preventDefault()
          emitUiCommand({ type: 'event:continue' })
        }
        return
      }

      // 4. 出航计划
      if (s.pendingVoyage) {
        if (key === 'enter') {
          e.preventDefault()
          emitUiCommand({ type: 'voyage:confirm' })
        } else if (key === 'escape') {
          e.preventDefault()
          emitUiCommand({ type: 'voyage:cancel' })
        }
        return
      }

      // 5. 操舵挑战中：按键全部交给操舵界面（它有自己的 window 监听），
      //    全局钩子一律放行——包括 Esc（结算屏要靠它收舵）。
      //    旧版在这里按 H 手动开操舵；现在它是每段必经的节拍，
      //    由 gamePhase 'helm' 驱动，不再需要手动入口。
      if (s.gamePhase === 'helm') return

      if (s.gamePhase !== 'playing') return

      // 6. 常规操作
      const panelIdx = Number.parseInt(key, 10) - 1
      if (Number.isFinite(panelIdx) && panelIdx >= 0 && panelIdx < PANEL_KEYS.length) {
        e.preventDefault()
        const panel = PANEL_KEYS[panelIdx]
        s.setActivePanel(s.activePanel === panel ? null : panel)
        return
      }

      switch (key) {
        case ' ': {
          e.preventDefault()
          // 暂停 / 恢复（恢复回 3x 常规档）
          s.setSimSpeed(s.simSpeed === 0 ? 3 : 0)
          break
        }
        case 'escape': {
          if (s.activePanel) s.setActivePanel(null)
          else if (s.showHelp) s.setShowHelp(false)
          break
        }
        case '?':
        case '/': {
          e.preventDefault()
          if (s.activePanel) s.setActivePanel(null)
          s.setShowHelp(!s.showHelp)
          break
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
