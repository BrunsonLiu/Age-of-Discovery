import { useCallback, useEffect, useRef, useState } from 'react'
import { useDialogueStore } from '@/store/useDialogueStore'
import { getScript, getSpeaker } from '@/utils/dialogue'
import { onUiCommand } from '@/utils/uiBus'
import { playCue } from '@/utils/audio'

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

  const [shown, setShown] = useState(0)
  const [typing, setTyping] = useState(false)
  const timerRef = useRef<number | null>(null)

  const script = scriptId ? getScript(scriptId) : undefined
  const speaker = script ? getSpeaker(script) : undefined
  const line = script && lineIndex < script.lines.length ? script.lines[lineIndex] : ''

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
  const boxSideStyle = fromLeft
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
      {speaker.portrait && (
        <div
          key={script.id}
          className={`absolute bottom-0 h-[72%] ${fromLeft ? 'dlg-slide-in' : 'dlg-slide-in-right'}`}
          style={fromLeft ? { left: '5%' } : { right: '5%' }}
        >
          <img
            src={speaker.portrait}
            alt={speaker.name}
            className="h-full w-auto dlg-float drop-shadow-lg"
          />
        </div>
      )}

      {/* 对话框：名牌 + 羊皮纸台词框（事件卡同款配色） */}
      <div className="absolute bottom-10 dlg-box-in" style={boxSideStyle}>
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
              <span className="text-[#8a6c2a] text-xs dlg-caret">Enter 继续 ▸</span>
            )}
          </div>
        </div>
        <p className="text-gold-600/70 text-xs mt-1.5 text-right">Esc 跳过致辞</p>
      </div>
    </div>
  )
}
