/**
 * 用**浏览器空闲时间**推进一个生成器，直到跑完。
 *
 * 【为什么不是"每帧塞 8ms"】实测冷启动后的时间轴（200ms 一格）：
 * 地形撒点从 1.2 秒一直跑到 4.4 秒，**每格占主线程 170ms**。
 * 地图虽然 1.2 秒就出来了，但接下来三秒主线程一直是满的 ——
 * 玩家第一下拖地图、第一下缩放，全都排在这堆装饰工作的后面。
 * 也就是说"把一次 2 秒的死冻切成 3 秒的持续占用"并不算修好。
 *
 * `requestIdleCallback` 的语义正好是"等真的空了再做"：
 * 主线程一忙它就不被调用，玩家操作优先；同时 `timeout` 保证它不会被饿死。
 *
 * 【为什么要给上限 8ms】空闲回调可能一次给几十毫秒（浏览器猜你闲着）。
 * 但玩家随时可能动鼠标 —— 一片超过 8ms 就可能让那一帧掉到 50ms 以下。
 * 所以取 `min(剩余空闲, 8ms)`，且下限 4ms（剩余为 0 时也要有进展）。
 *
 * 【没有 requestIdleCallback 怎么办】Safari 老版本没有。退到 `setTimeout(0)`，
 * 语义变成"让出一次事件循环"，比 rAF 更保守（不占帧预算）。
 *
 * @returns 取消函数；调用后不再推进，也不再回调
 */
export interface IdleDeadlineLike {
  /** 本次空闲还剩多少毫秒（didTimeout 为真时给 0） */
  timeRemaining: () => number
  didTimeout: boolean
}

type Scheduler = (cb: (d: IdleDeadlineLike) => void) => number
type Canceller = (id: number) => void

function pickScheduler(): { schedule: Scheduler; cancel: Canceller } {
  const w = window as unknown as {
    requestIdleCallback?: (cb: (d: IdleDeadlineLike) => void, opts?: { timeout: number }) => number
    cancelIdleCallback?: (id: number) => void
  }
  if (typeof w.requestIdleCallback === 'function') {
    return {
      schedule: (cb) => w.requestIdleCallback!(cb, { timeout: 1200 }),
      cancel: (id) => w.cancelIdleCallback?.(id),
    }
  }
  return {
    schedule: (cb) => window.setTimeout(() => cb({ timeRemaining: () => 8, didTimeout: true }), 0),
    cancel: (id) => window.clearTimeout(id),
  }
}

export function runInIdleChunks<T>(
  it: Generator<void, T, void>,
  onDone: (value: T) => void,
  opts: { sliceMs?: number; minSliceMs?: number } = {},
): () => void {
  const sliceMs = opts.sliceMs ?? 8
  const minSliceMs = opts.minSliceMs ?? 4
  const { schedule, cancel } = pickScheduler()

  let cancelled = false
  let handle = 0
  let step = it.next()

  const pump = (deadline: IdleDeadlineLike) => {
    if (cancelled) return
    // didTimeout 时 timeRemaining() 返回 0，但我们仍必须推进（否则会被饿死）
    const budget = deadline.didTimeout
      ? minSliceMs
      : Math.max(minSliceMs, Math.min(sliceMs, deadline.timeRemaining()))

    const t0 = performance.now()
    while (!step.done && performance.now() - t0 < budget) step = it.next()

    if (step.done) {
      if (!cancelled) onDone(step.value)
      return
    }
    handle = schedule(pump)
  }

  handle = schedule(pump)
  return () => {
    cancelled = true
    cancel(handle)
  }
}
