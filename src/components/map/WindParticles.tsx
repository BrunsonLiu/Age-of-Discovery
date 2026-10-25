import { useEffect, useRef } from 'react'

interface WindParticlesProps {
  /** 风向（风吹去的罗盘方位角），由当前天气状态给出 */
  windBearing: number
  /** 风速（节）：驱动粒子速度与浓度，风暴天风痕明显更快更密 */
  windSpeed?: number
}

const COUNT = 40

interface Particle {
  x: number
  y: number
  len: number
  speed: number
  op: number
}

/**
 * 风向氛围层：一屏幕细长的"风痕"粒子，沿当前风带方向缓慢漂移。
 * 纯 SVG line + rAF，直接改 attribute，不触发 React 重渲染；
 * pointer-events-none，绝不拦截地图操作。
 */
export default function WindParticles({ windBearing, windSpeed = 12 }: WindParticlesProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    let w = window.innerWidth
    let h = window.innerHeight
    const onResize = () => { w = window.innerWidth; h = window.innerHeight }
    window.addEventListener('resize', onResize)

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

    const lines = particles.map((p) => {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('stroke', '#bfdbfe')
      line.setAttribute('stroke-width', '1')
      line.setAttribute('stroke-linecap', 'round')
      line.setAttribute('opacity', p.op.toFixed(3))
      svg.appendChild(line)
      return line
    })

    let last = performance.now()
    let raf = 0
    const loop = (ts: number) => {
      const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000))
      last = ts
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        p.x += vx * p.speed * dt
        p.y += vy * p.speed * dt
        // 出界即从另一侧绕回，形成连绵不断的风
        if (p.x > w + MARGIN) p.x = -MARGIN
        if (p.x < -MARGIN) p.x = w + MARGIN
        if (p.y > h + MARGIN) p.y = -MARGIN
        if (p.y < -MARGIN) p.y = h + MARGIN
        const line = lines[i]
        line.setAttribute('x1', (p.x - vx * p.len).toFixed(1))
        line.setAttribute('y1', (p.y - vy * p.len).toFixed(1))
        line.setAttribute('x2', p.x.toFixed(1))
        line.setAttribute('y2', p.y.toFixed(1))
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      for (const line of lines) line.remove()
    }
  }, [windBearing, windSpeed])

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full"
      aria-hidden="true"
      style={{ mixBlendMode: 'screen' }}
    />
  )
}
