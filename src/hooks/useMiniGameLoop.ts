import { useEffect, useRef } from 'react'

/**
 * 小游戏的帧循环与键盘管理（所有原型共用）。
 *
 * 架构约定（继承自操舵挑战 HelmModal）：
 *   · 实时状态全部放 ref，React 只在阶段切换时 setState
 *   · requestAnimationFrame 驱动，DOM 直接改 style/textContent，不触发重渲染
 *   · 键盘经 window 监听；小游戏挂载期间由 uiBus 的 miniGameActive 标志
 *     挡住全局键盘通道，避免空格被当成"继续"、数字键被当成"选选项"
 *
 * 每个原型只需提供：
 *   · step(dt)    —— 推进一帧的纯逻辑
 *   · onKey(dir)  —— 处理一次按键
 *   · finish(perf)—— 算出表现分并结束
 */
export interface MiniGameRuntime<S> {
  /** 创建初始状态 */
  create: () => S
  /** 推进一帧；返回 true 表示本帧结束（应调用 finish） */
  step: (state: S, dt: number) => boolean
  /** 处理按键；返回 true 表示游戏结束 */
  onKey?: (state: S, key: string) => boolean
  /** 算出表现分 */
  score: (state: S) => number
}

export interface UseMiniGameLoopOptions<S> {
  /** 是否处于运行阶段（false 时不启动帧循环） */
  active: boolean
  runtime: MiniGameRuntime<S>
  /** 状态容器：运行时写入 ref.current */
  stateRef: React.MutableRefObject<S | null>
  /** 游戏结束时回调，携带表现分 */
  onFinish: (score: number) => void
  /** 每帧结束后的 DOM 更新钩子 */
  render?: (state: S) => void
}

/**
 * 启动 60fps 帧循环 + 键盘监听。
 *
 * 帧循环内部只做两件事：推进纯逻辑状态、把状态同步到 DOM。
 * 任何需要 React 重渲染的事（阶段切换、结算）都通过 onChange/onFinish 抛出去。
 */
export function useMiniGameLoop<S>({
  active,
  runtime,
  stateRef,
  onFinish,
  render,
}: UseMiniGameLoopOptions<S>): void {
  // 所有回调都放进 ref：帧循环的 effect 只依赖 [active, stateRef]，
  // 若直接闭包捕获 render/onFinish，改了 modifiers 之类仍会用旧闭包。
  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime
  const renderRef = useRef(render)
  renderRef.current = render
  const finishRef = useRef(onFinish)
  finishRef.current = onFinish

  useEffect(() => {
    if (!active) return
    let raf = 0
    let last = performance.now()
    const loop = (ts: number) => {
      // dt 上限 0.1 秒：既能挡住"切后台回来"时的巨大跳变，
      // 又能让低帧率设备（<20fps）不至于把游戏拖成慢动作。
      // 上限 0.05 时，10fps 的无头浏览器里 1 秒真实时间只推进 0.5 秒游戏时间。
      const dt = Math.min(0.1, Math.max(0, (ts - last) / 1000))
      last = ts
      const state = stateRef.current
      if (!state) return

      const done = runtimeRef.current.step(state, dt)
      if (renderRef.current) renderRef.current(state)
      if (done) {
        finishRef.current(runtimeRef.current.score(state))
        return
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [active, stateRef])

  // 键盘：只在运行阶段接管
  useEffect(() => {
    if (!active || !runtime.onKey) return
    const kd = (e: KeyboardEvent) => {
      const state = stateRef.current
      if (!state) return
      const handled = runtimeRef.current.onKey!(state, e.key)
      if (handled) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stateRef])
}

/** 箭头键 → 方向标识的映射 */
export function arrowToDir(key: string): 'up' | 'down' | 'left' | 'right' | null {
  switch (key) {
    case 'ArrowUp': case 'w': case 'W': return 'up'
    case 'ArrowDown': case 's': case 'S': return 'down'
    case 'ArrowLeft': case 'a': case 'A': return 'left'
    case 'ArrowRight': case 'd': case 'D': return 'right'
    default: return null
  }
}
