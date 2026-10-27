import { useCallback } from 'react'

export interface TouchKeySpec {
  /**
   * 派发的键盘 key。
   *
   * 小游戏的输入处理统一收敛在 useMiniGameLoop 的 `onKey(state, key)`，
   * 键盘与触摸只要喂**同一个 key**，走的就是同一条代码路径——
   * 触屏版不会出现"判定和键盘版不一致"的隐性分叉。
   */
  key: string
  label: string
  /** 副标题：这个小字说明这个键干什么 */
  hint?: string
  /** 按住生效（keydown 持续、keyup 释放），用于转向/帆缆 */
  hold?: boolean
  tone?: 'default' | 'accent'
}

interface TouchKeyPadProps {
  keys: TouchKeySpec[]
  /** 布局：grid3 = 3 列九宫格（空位用占位项补）；row = 单行横排 */
  layout?: 'grid3' | 'row'
  className?: string
}

/**
 * 虚拟按键板：把触摸翻译成键盘事件。
 *
 * 【为什么不做成"每款小游戏各写一套触摸逻辑"】
 * 那样每加一款小游戏就得再写一遍输入，而且触摸版和键盘版很容易判定不一致
 * （按下的时机、连按的处理都不一定一样）。派发 KeyboardEvent 之后，
 * 触摸和键盘在游戏内部**完全等价**——因为它们本来就是同一件事。
 *
 * 【为什么用 pointer 事件而不是 touch 事件】
 * Pointer Events 同时覆盖鼠标、触摸、手写笔，一套代码通吃；
 * 而且 pointerdown/pointerup 带上"按住"语义，正好匹配操舵的转向键。
 */
export default function TouchKeyPad({ keys, layout = 'row', className = '' }: TouchKeyPadProps) {
  const press = useCallback((key: string, down: boolean) => {
    const ev = new KeyboardEvent(down ? 'keydown' : 'keyup', {
      key,
      bubbles: true,
      cancelable: true,
    })
    window.dispatchEvent(ev)
  }, [])

  const grid = layout === 'grid3'

  return (
    <div
      data-testid="touch-keypad"
      className={`select-none touch-none ${grid ? 'grid grid-cols-3 gap-1.5' : 'flex flex-wrap gap-1.5 justify-center'} ${className}`}
    >
      {keys.map(k => (
        <button
          key={k.key}
          type="button"
          data-testid={`touch-key-${k.key}`}
          aria-label={k.label}
          onPointerDown={(e) => {
            e.preventDefault()
            press(k.key, true)
          }}
          onPointerUp={(e) => {
            e.preventDefault()
            press(k.key, false)
          }}
          onPointerCancel={() => press(k.key, false)}
          onPointerLeave={() => press(k.key, false)}
          onContextMenu={(e) => e.preventDefault()}
          className={`${grid ? 'py-3' : 'px-3 py-2'} rounded-lg border font-serif transition-all
            active:scale-95 active:bg-gold-700/50 ${
              k.tone === 'accent'
                ? 'border-gold-500/60 bg-gold-700/30 text-gold-100'
                : 'border-gold-700/40 bg-ocean-800/70 text-gold-300'
            }`}
        >
          <span className="text-base leading-none block">{k.label}</span>
          {k.hint && (
            <span className="text-[9px] text-gold-600 font-serif block mt-0.5">{k.hint}</span>
          )}
        </button>
      ))}
    </div>
  )
}
