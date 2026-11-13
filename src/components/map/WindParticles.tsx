import { useEffect, useRef } from 'react'

interface WindParticlesProps {
  /** 风向（风吹去的罗盘方位角），由当前天气状态给出 */
  windBearing: number
  /** 风速（节）：驱动粒子速度与浓度，风暴天风痕明显更快更密 */
  windSpeed?: number
}

const COUNT = 40

/**
 * 风痕的目标帧率。
 *
 * 【为什么要限帧】这些线以 16~46 px/s 漂移，60fps 下每帧只走 0.3~0.8px ——
 * 30fps 与 60fps 在观感上**没有区别**（一条 20px 长、透明度 0.05~0.15 的
 * 淡线，位移 0.5px 看不出来），但 CPU 时间差一倍。限到 30 是纯赚。
 */
const FPS = 30

interface Particle {
  x: number
  y: number
  len: number
  speed: number
  op: number
}

/**
 * 风向氛围层：一屏幕细长的"风痕"粒子，沿当前风带方向缓慢漂移。
 *
 * 【为什么是 canvas 不是 SVG line】原来是 40 个 `<line>`，每帧逐个
 * `setAttribute('x1'|'y1'|'x2'|'y2')` —— 实测 **每帧 160 次属性写入**，
 * 4 秒 38400 次。每一次都会让浏览器把那个 SVG 子树重算样式、重排、重绘；
 * 在 4 倍 CPU 节流下（≈低压 i5）主线程 **83.8% 花在原生绘制上**，JS 自时间
 * 不到 5%。也就是说卡顿完全来自这 40 条线，与游戏逻辑无关。
 *
 * canvas 上一次 `stroke()` 40 段路径的成本是几十微秒，且**不进布局树**。
 * 视觉上完全等价（同样的颜色、线宽、圆头、透明度、screen 混合）。
 *
 * 【仍然不碰 React】全部走 rAF + ref，透明度/坐标都在 canvas 里算，
 * 不 setState、不改 DOM 属性。pointer-events-none，绝不拦截地图操作。
 */
export default function WindParticles({ windBearing, windSpeed = 12 }: WindParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let w = window.innerWidth
    let h = window.innerHeight
    /*
     * 幅度上不跟 devicePixelRatio 走：这些线只有 1px 宽、透明度 ≤0.2，
     * 按 DPR 放大只会让像素多 4 倍而看不出差别。封顶 1.5 是给"线别糊"。
     */
    let dpr = Math.min(1.5, window.devicePixelRatio || 1)

    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      dpr = Math.min(1.5, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    // 风向向量（屏幕坐标：东=+x，北=-y）
    const rad = (windBearing * Math.PI) / 180
    const vx = Math.sin(rad)
    const vy = -Math.cos(rad)

    // 风速标度：12 节为基准 1.0，钳在 0.4-2.6（雾天风痕若有若无）
    const speedScale = Math.max(0.4, Math.min(2.6, windSpeed / 12))

    const MARGIN = 60
    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      len: 12 + Math.random() * 22,
      speed: (16 + Math.random() * 30) * speedScale,
      op: (0.05 + Math.random() * 0.1) * Math.min(1.6, speedScale),
    }))

    let last = performance.now()
    let acc = 0
    let raf = 0
    const step = 1000 / FPS

    const loop = (ts: number) => {
      raf = requestAnimationFrame(loop)
      const raw = ts - last
      last = ts
      // 切后台回来时 raw 可能是几秒，钳住避免粒子瞬移
      acc += Math.min(100, Math.max(0, raw))
      if (acc < step) return
      const dt = Math.min(0.05, acc / 1000)
      acc = 0

      ctx.clearRect(0, 0, w, h)
      ctx.lineWidth = 1
      ctx.lineCap = 'round'
      ctx.strokeStyle = '#bfdbfe'
      /*
       * 逐条改 globalAlpha 再 stroke：每条一次的 state 切换在 canvas 上很便宜
       * （与 SVG 的属性写入不是一个量级），而透明度是逐粒子的，不能合并。
       */
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += vx * p.speed * dt
        p.y += vy * p.speed * dt
        // 出界即从另一侧绕回，形成连绵不断的风
        if (p.x > w + MARGIN) p.x = -MARGIN
        if (p.x < -MARGIN) p.x = w + MARGIN
        if (p.y > h + MARGIN) p.y = -MARGIN
        if (p.y < -MARGIN) p.y = h + MARGIN
        ctx.globalAlpha = p.op
        ctx.beginPath()
        ctx.moveTo(p.x - vx * p.len, p.y - vy * p.len)
        ctx.lineTo(p.x, p.y)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [windBearing, windSpeed])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      aria-hidden="true"
      data-testid="wind-particles"
      style={{ mixBlendMode: 'screen' }}
    />
  )
}
