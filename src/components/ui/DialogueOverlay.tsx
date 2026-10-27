import { useCallback, useEffect, useRef, useState } from 'react'
import { useDialogueStore } from '@/store/useDialogueStore'
import { getScript, getSpeaker } from '@/utils/dialogue'
import { onUiCommand } from '@/utils/uiBus'
import { playCue } from '@/utils/audio'
import { useIsMobile, useIsTouchPrimary } from '@/hooks/useIsMobile'

/** 打字机步进（毫秒/字） */
const TYPE_MS = 42

/**
 * 剧情对白层：角色立绘滑入 + 打字机台词 + Enter 推进 / Esc 跳过。
 *
 * 交互约定（与事件界面一致）：
 * - 打字中点击/Enter：立即显示整句
 * - 打完后点击/Enter：下一句；末句之后整段关闭
 * - Esc：跳过整段
 * 键盘经 uiBus 广播进来（useKeyboardControls 最高优先级分支），
 * 组件自身不挂 keydown。
 */
export default function DialogueOverlay() {
  const scriptId = useDialogueStore(s => s.scriptId)
  const lineIndex = useDialogueStore(s => s.lineIndex)
  const advance = useDialogueStore(s => s.advance)
  const skip = useDialogueStore(s => s.skip)
  /**
   * 触屏没有 Esc 键：跳过致辞必须给一个能点的按钮，
   * 否则玩家只能一段段点完。
   */
  const isTouch = useIsTouchPrimary()
  const isMobile = useIsMobile()

  const [shown, setShown] = useState(0)
  const [typing, setTyping] = useState(false)
  const timerRef = useRef<number | null>(null)

  const script = scriptId ? getScript(scriptId) : undefined
  const speaker = script ? getSpeaker(script) : undefined
  const line = script && lineIndex < script.lines.length ? script.lines[lineIndex] : ''

  /**
   * 本句的立绘：剧本可逐句覆盖（情绪差分），未覆盖则用角色默认立绘。
   *
   * 关键：换立绘时必须重挂 key，否则 React 会复用同一个 img 节点，
   * 浏览器换了 src 也不会重新解码、还会闪一下旧的图。
   */
  const portrait = (script?.portraits?.[lineIndex]) ?? speaker?.portrait
  const portraitKey = `${script?.id ?? ''}-${lineIndex}`

  // 打字机：换句/换剧本时重新开始
  useEffect(() => {
    if (!script) {
      setShown(0)
      setTyping(false)
      return
    }
    setShown(0)
    setTyping(true)
    let i = 0
    timerRef.current = window.setInterval(() => {
      i += 1
      setShown(i)
      if (i >= line.length) {
        if (timerRef.current !== null) window.clearInterval(timerRef.current)
        timerRef.current = null
        setTyping(false)
      }
    }, TYPE_MS)
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [script, scriptId, lineIndex, line])

  // 开场一声低沉的年代钟（audio.ts 内部按用户偏好静默）
  const prevIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (scriptId && scriptId !== prevIdRef.current) playCue('era')
    prevIdRef.current = scriptId
  }, [scriptId])

  const handleClick = useCallback(() => {
    if (typing) {
      if (timerRef.current !== null) window.clearInterval(timerRef.current)
      timerRef.current = null
      setShown(line.length)
      setTyping(false)
    } else {
      advance()
    }
  }, [typing, line, advance])

  useEffect(() => onUiCommand(cmd => {
    if (cmd.type === 'dialogue:advance') handleClick()
    else if (cmd.type === 'dialogue:skip') skip()
  }), [handleClick, skip])

  if (!script || !speaker) return null

  const fromLeft = speaker.side === 'left'
  /**
   * 对话框位置。
   *
   * 桌面：台词框压在立绘的一侧（这是它的设计意图）。
   * 移动：立绘和台词框**没法分列两侧**——390px 宽的屏上，
   * 一边留 34% 给立绘，台词框就只剩 226px，字要挤成两行三行。
   * 所以移动端改成"立绘在上、台词框在下"的竖排，
   * 并且整体抬到底部标签栏之上，别被标签栏压住。
   */
  const boxSideStyle = isMobile
    ? {
        left: '4%',
        right: '4%',
        bottom: 'calc(92px + env(safe-area-inset-bottom))',
      }
    : fromLeft
      ? { left: '8%', right: '34%' }
      : { right: '8%', left: '34%' }

  return (
    <div
      className="fixed inset-0"
      style={{ zIndex: 75 }}
      onClick={handleClick}
      role="dialog"
      aria-label={`${speaker.name}的致辞`}
    >
      {/* 压暗衬底：对白从游戏画面里"浮"出来 */}
      <div className="absolute inset-0 bg-black/45" />

      {/* 立绘：外层负责滑入，内层负责待机浮动（两层 transform 互不覆盖） */}
      {portrait && (
        <div
          key={portraitKey}
          className={`absolute bottom-0 h-[52%] md:h-[72%] ${fromLeft ? 'dlg-slide-in' : 'dlg-slide-in-right'}`}
          style={fromLeft ? { left: '5%' } : { right: '5%' }}
        >
          <img
            src={portrait}
            alt={speaker.name}
            className="h-full w-auto dlg-float drop-shadow-lg"
          />
        </div>
      )}

      {/* 对话框：名牌 + 羊皮纸台词框（事件卡同款配色） */}
      <div className={`absolute dlg-box-in ${isMobile ? '' : 'bottom-10'}`} style={boxSideStyle}>
        <div className="inline-block bg-[#2a1c10] border border-gold-600/70 rounded-md px-3 py-1 mb-1.5">
          <span className="text-gold-300 text-sm font-medium">{speaker.name}</span>
          <span className="text-gold-600 text-xs ml-2">{speaker.title}</span>
        </div>
        <div className="relative bg-[#dccfae] border-2 border-[#8a6c2a] rounded-lg px-5 py-4 min-h-[5.5rem]">
          <p className="font-serif text-[#3a2410] text-base leading-relaxed m-0">
            {line.slice(0, shown)}
          </p>
          <div className="flex items-center justify-between mt-3">
            {/* 进度点 */}
            <div className="flex gap-1.5">
              {script.lines.map((_, i) => (
                <div
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    i === lineIndex ? 'bg-[#8a6c2a] w-4' : 'bg-[#8a6c2a]/35'
                  }`}
                />
              ))}
            </div>
            {!typing && (
              <span className="text-[#8a6c2a] text-xs dlg-caret">
                {isTouch ? '点一下继续 ▸' : 'Enter 继续 ▸'}
              </span>
            )}
          </div>
        </div>
        {isTouch ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); skip() }}
            className="mt-1.5 w-full text-center text-gold-300/80 text-xs py-1"
          >
            跳过这段致辞
          </button>
        ) : (
          <p className="text-gold-600/70 text-xs mt-1.5 text-right">Esc 跳过致辞</p>
        )}
      </div>
    </div>
  )
}
