import { useEffect, useMemo, useRef, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { useFxStore as useFx } from '@/store/useFxStore'
import { calculateBearing, prevailingWindBearing } from '@/utils/navigation'
import {
  HELM_DURATION,
  HELM_FAVOR_ARC,
  HELM_GRADE_COLOR,
  HelmWindSim,
  advanceHelmShip,
  angleDiff,
  evaluateHelmRun,
  helmFavor,
  helmReward,
  inFavorArc,
  type HelmRunResult,
  type HelmSample,
} from '@/utils/helm'
import { shipSprite } from '@/data/shipSprites'
import { STANCES } from '@/utils/segment'
import TouchKeyPad from '@/components/ui/TouchKeyPad'
import { useIsTouchPrimary } from '@/hooks/useIsMobile'

type Phase = 'intro' | 'running' | 'done'

/** 屏幕坐标：罗盘方位角（0=北，顺时针）→ SVG 坐标点 */
function polar(cx: number, cy: number, r: number, bearing: number): [number, number] {
  const rad = (bearing * Math.PI) / 180
  return [cx + r * Math.sin(rad), cy - r * Math.cos(rad)]
}

const CX = 160
const CY = 160

/** 有利区弧带（以正上方为轴，±HELM_FAVOR_ARC），整组绕中心旋转即对准风向 */
function arcPath(radius: number): string {
  const [x1, y1] = polar(CX, CY, radius, -HELM_FAVOR_ARC)
  const [x2, y2] = polar(CX, CY, radius, HELM_FAVOR_ARC)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

function windStatus(angle: number): { text: string; cls: string } {
  if (angle <= HELM_FAVOR_ARC) return { text: '吃风', cls: 'text-emerald-300' }
  if (angle <= 90) return { text: '侧风', cls: 'text-gold-300' }
  if (angle <= 135) return { text: '逆风', cls: 'text-orange-300' }
  return { text: '顶风', cls: 'text-danger-400' }
}

/**
 * 操舵挑战（第三条线：实时操作）——航行节拍器的「拍」。
 *
 * 每段起航前必经：选完航段方针后弹出，船停住（gamePhase: 'helm'），
 * 玩家用键盘控船首向与帆缆 15 秒，在摆动的风与不定期阵风中
 * 尽量长时间待在风向有利区。结算评级决定这一段能少走多少海里——
 * 操作好，真的省时间。
 *
 * 与旧版「可选加分项」的区别：
 * - 旧版按 H 才开、每段一次机会，于是最有操作感的环节最容易被跳过；
 * - 现在与航段方针绑定，每段都必须掌舵——决策密度不再由玩家自觉决定。
 * - 奖励不再直接挪船位（会被下一帧覆盖），而是递交里程由
 *   SailingController 入账，见 store.finishHelmRun。
 */
export default function HelmModal() {
  const pendingHelm = useGameStore((s) => s.pendingHelm)
  const segmentCount = useGameStore((s) => s.segmentCount)
  const stance = useGameStore((s) => s.stance)
  const isSailing = useGameStore((s) => s.fleet.isSailing)
  const shipPosition = useGameStore((s) => s.shipPosition)
  const currentRoute = useGameStore((s) => s.currentRoute)
  const finishHelmRun = useGameStore((s) => s.finishHelmRun)
  const skipHelmRun = useGameStore((s) => s.skipHelmRun)
  // 操舵用的是旗舰的精绘精灵
  const shipType = useGameStore((s) => {
    const f = s.fleet
    const flagship = f.ships.find(sh => sh.id === f.flagshipId) || f.ships[0]
    return flagship?.type || 'galleon'
  })
  const spriteUrl = useMemo(() => shipSprite(shipType), [shipType])

  /**
   * 触屏设备：没有物理键盘，操舵就完全没法玩。
   * 所以给一套虚拟按键——它派发的就是键盘事件，
   * 与键盘玩家走**完全同一段代码**（见 TouchKeyPad 的说明）。
   */
  const isTouch = useIsTouchPrimary()

  const [phase, setPhase] = useState<Phase>('intro')
  const [result, setResult] = useState<HelmRunResult | null>(null)
  const [hint, setHint] = useState('')

  // —— 实时状态全部放 ref：60fps 不触发 React 重渲染，DOM 直接更新 ——
  const shipRef = useRef({ heading: 0, trim: 0.6 })
  const windRef = useRef<HelmWindSim | null>(null)
  const keysRef = useRef({ left: false, right: false, up: false, down: false })
  const samplesRef = useRef<HelmSample[]>([])
  const favorSumRef = useRef(0)
  const elapsedRef = useRef(0)
  const rafRef = useRef(0)

  // DOM 直查引用（避免每帧 setState）
  const needleRef = useRef<SVGGElement>(null)
  const windGroupRef = useRef<SVGGElement>(null)
  const arcGroupRef = useRef<SVGGElement>(null)
  const gustRef = useRef<SVGTextElement>(null)
  const angleTextRef = useRef<HTMLSpanElement>(null)
  const statusTextRef = useRef<HTMLSpanElement>(null)
  const scoreTextRef = useRef<HTMLSpanElement>(null)
  const scoreBarRef = useRef<HTMLDivElement>(null)
  const timeTextRef = useRef<HTMLSpanElement>(null)
  const timeBarRef = useRef<HTMLDivElement>(null)
  const trimBarRef = useRef<HTMLDivElement>(null)
  const trimLabelRef = useRef<HTMLSpanElement>(null)
  const wakeRef = useRef<SVGGElement>(null)
  const shipImgRef = useRef<SVGImageElement>(null)

  // 基准风：按当前纬度取行星风带（与海图预估同一套模型）
  const baseWind = useMemo(
    () => prevailingWindBearing(shipPosition?.[0] ?? 25),
    [shipPosition],
  )

  // 本段距离（海里）——奖励按它折算，段段可比
  const segmentNm = currentRoute && segmentCount > 0
    ? currentRoute.distance / segmentCount
    : (currentRoute?.distance ?? 0)

  const isOpen = !!pendingHelm && isSailing

  // 关闭或航线变化/事件打断时重置回 intro（不结算、不占用机会）
  useEffect(() => {
    if (!isOpen) setPhase('intro')
  }, [isOpen])

  useEffect(() => {
    if (phase !== 'running') return
    if (!isSailing) {
      setPhase('intro')
      setHint('航程中断，本段操舵作罢。')
    }
  }, [isSailing, phase])

  const applyFrame = (wind: number, gust: number) => {
    const ship = shipRef.current
    if (needleRef.current) needleRef.current.style.transform = `rotate(${ship.heading}deg)`
    if (windGroupRef.current) windGroupRef.current.style.transform = `rotate(${wind}deg)`
    if (arcGroupRef.current) arcGroupRef.current.style.transform = `rotate(${wind}deg)`
    if (wakeRef.current) wakeRef.current.style.opacity = String(0.15 + ship.trim * 0.5)
    const angle = angleDiff(ship.heading, wind)
    const status = windStatus(angle)
    if (gustRef.current) {
      const g = Math.abs(gust)
      gustRef.current.style.opacity = g > 14 ? '1' : '0'
    }
    if (angleTextRef.current) angleTextRef.current.textContent = `${angle.toFixed(0)}°`
    if (statusTextRef.current) {
      statusTextRef.current.textContent = status.text
      statusTextRef.current.style.color = status.cls.includes('emerald') ? '#6ee7b7'
        : status.cls.includes('gold') ? '#e8c050'
        : status.cls.includes('orange') ? '#fdba74' : '#f07b5a'
    }
    const n = samplesRef.current.length
    const avgFavor = n > 0 ? favorSumRef.current / n : 1
    if (scoreTextRef.current) scoreTextRef.current.textContent = `均风 ${avgFavor.toFixed(2)}`
    if (scoreBarRef.current) scoreBarRef.current.style.width = `${Math.max(0, Math.min(1, (avgFavor - 0.6) / 0.8)) * 100}%`
    const remain = Math.max(0, HELM_DURATION - elapsedRef.current)
    if (timeTextRef.current) timeTextRef.current.textContent = `${remain.toFixed(1)}s`
    if (timeBarRef.current) timeBarRef.current.style.width = `${(remain / HELM_DURATION) * 100}%`
    if (trimBarRef.current) trimBarRef.current.style.width = `${ship.trim * 100}%`
    if (trimLabelRef.current) trimLabelRef.current.textContent = ship.trim > 0.66 ? '满帆' : ship.trim > 0.33 ? '半帆' : '松帆'
  }

  const finishRun = (early: boolean) => {
    if (elapsedRef.current < 3) {
      setHint(early ? '至少掌舵 3 秒才能收舵——风不会等你。' : '')
      if (early) window.setTimeout(() => setHint(''), 1600)
      return
    }
    // 只记本地结果，不入账：奖励等玩家看完结算屏、关闭模态时才递交。
    // 否则「奖励已发、操舵重来」会被刷新页面利用（本地重开即复得）。
    setResult(evaluateHelmRun(samplesRef.current))
    setPhase('done')
  }

  /** 收舵离开：这一刻才把奖励入账（store 会清掉 pendingHelm 并恢复航行） */
  const closeAndSettle = () => {
    if (result) finishHelmRun(result)
    setPhase('intro')
    setResult(null)
  }

  const startRun = () => {
    const s = useGameStore.getState()
    const pos = s.shipPosition
    const target = s.waypoint
    // 初始船首向对准目标——开局是"守住航向"，不是先掉头
    const heading = pos && target
      ? calculateBearing(pos[0], pos[1], target.latitude, target.longitude)
      : 0
    shipRef.current = { heading, trim: 0.6 }
    windRef.current = new HelmWindSim(baseWind)
    keysRef.current = { left: false, right: false, up: false, down: false }
    samplesRef.current = []
    favorSumRef.current = 0
    elapsedRef.current = 0
    setHint('')
    useFx.getState().cue('port')
    setPhase('running')
  }

  // 结算屏：Enter / Esc 收舵回到航程（奖励此刻入账）
  useEffect(() => {
    if (phase !== 'done') return
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'enter' || k === 'escape') {
        e.preventDefault()
        closeAndSettle()
      }
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // 键盘：A/D 转向，W/S 帆缆，Enter 收舵
  useEffect(() => {
    if (phase !== 'running') return
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'a' || k === 'arrowleft') { keysRef.current.left = true; e.preventDefault() }
      else if (k === 'd' || k === 'arrowright') { keysRef.current.right = true; e.preventDefault() }
      else if (k === 'w' || k === 'arrowup') { keysRef.current.up = true; e.preventDefault() }
      else if (k === 's' || k === 'arrowdown') { keysRef.current.down = true; e.preventDefault() }
      else if (k === 'enter') { e.preventDefault(); finishRun(true) }
    }
    const ku = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'a' || k === 'arrowleft') keysRef.current.left = false
      else if (k === 'd' || k === 'arrowright') keysRef.current.right = false
      else if (k === 'w' || k === 'arrowup') keysRef.current.up = false
      else if (k === 's' || k === 'arrowdown') keysRef.current.down = false
    }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup', ku)
    return () => {
      window.removeEventListener('keydown', kd)
      window.removeEventListener('keyup', ku)
    }
  }, [phase])

  // 准备屏：Enter/Space 掌舵启程。
  // 按钮文案写着「（Enter）」就必须真有这个键——否则键盘玩家
  // 盯着一个按不动的开始按钮，而鼠标玩家根本发现不了这件事。
  //
  // Esc = 交给水手（跳过）。跳过的唯一代价是本段拿不到操舵奖励。
  useEffect(() => {
    if (phase !== 'intro') return
    const kd = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (k === 'enter' || k === ' ') {
        e.preventDefault()
        startRun()
      } else if (k === 'escape') {
        e.preventDefault()
        skipHelmRun()
      }
    }
    window.addEventListener('keydown', kd)
    return () => window.removeEventListener('keydown', kd)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // 主循环
  useEffect(() => {
    if (phase !== 'running') return
    let last = performance.now()
    const loop = (ts: number) => {
      // dt 上限 0.1 秒：挡住切后台回来时的巨大跳变，同时让低帧率设备不至于变成慢动作
      const dt = Math.min(0.1, Math.max(0, (ts - last) / 1000))
      last = ts
      elapsedRef.current += dt

      const keys = keysRef.current
      const turn = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
      const trimDelta = (keys.up ? 1 : 0) - (keys.down ? 1 : 0)
      shipRef.current = advanceHelmShip(shipRef.current, { turn: turn as -1 | 0 | 1, trimDelta: trimDelta as -1 | 0 | 1 }, dt)

      const sim = windRef.current
      if (!sim) return
      const wind = sim.update(dt)
      const ship = shipRef.current
      const favor = helmFavor(ship.heading, wind)
      samplesRef.current.push({ t: elapsedRef.current, favor, inArc: inFavorArc(ship.heading, wind) })
      favorSumRef.current += favor

      applyFrame(wind, sim.gust)

      if (elapsedRef.current >= HELM_DURATION) {
        finishRun(false)
        return
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [phase])

  if (!isOpen) return null

  const reward = result ? helmReward(result) : null
  // 本次操舵能省下的本段里程（与 store.finishHelmRun 同一口径）
  const advanceNm = reward ? Math.round(reward.progressBonus * segmentNm * 10) / 10 : 0

  return (
    <div
      className="fixed inset-0 flex items-start justify-center bg-black/75 backdrop-blur-sm p-3 md:p-4 overflow-y-auto"
      style={{ zIndex: 85 }}
      role="dialog"
      aria-label="操舵挑战"
    >
      <div className="my-auto w-[30rem] max-w-[94vw] bg-ocean-900/95 border border-gold-700/40 rounded-xl shadow-2xl overflow-hidden animate-fade-in-scale">
        {/* 标题 */}
        <div className="px-4 py-3 border-b border-gold-700/30 bg-ocean-800/50 flex items-center justify-between">
          <div>
            <h2 className="pirate-title text-lg text-gold-300">🧭 操舵挑战</h2>
            <p className="text-gold-500 font-serif text-xs mt-0.5">
              {phase === 'intro' && '把住舵轮——让船咬住风的咽喉'}
              {phase === 'running' && '守在绿色风区里，阵风来袭前提前调向'}
              {phase === 'done' && '本段操舵完毕'}
            </p>
          </div>
          {pendingHelm && (
            <span className="text-gold-600 font-serif text-xs text-right leading-tight">
              第 {pendingHelm.segmentIndex + 1}/{segmentCount} 段<br />
              <span className="text-gold-700">{STANCES[stance].icon} {STANCES[stance].name}</span>
            </span>
          )}
        </div>

        {phase === 'intro' && (
          <div className="p-5 space-y-4">
            <div className="bg-ocean-800/40 border border-gold-700/20 rounded p-3 space-y-2 text-xs font-serif">
              <p className="text-gold-200">🌬️ 行星风带此刻吹向 <span className="text-sky-300">{baseWind}°</span>——船首向与风向夹角越小，跑得越快。</p>
              <ul className="space-y-1.5 text-gold-400">
                <li><span className="text-gold-200">A / D</span>（或 ← / →）：左转 / 右转舵</li>
                <li><span className="text-gold-200">W / S</span>（或 ↑ / ↓）：收帆 / 松帆——帆收得紧，舵响应更快</li>
                <li>风向会缓慢摆动，每隔几秒还有一阵突如其来的阵风</li>
                <li>坚持 <span className="text-gold-200">{HELM_DURATION} 秒</span>，或按 <span className="text-gold-200">Enter</span> 提前收舵（至少 3 秒）</li>
                {isTouch && (
                  <li className="text-gold-300">没有键盘？操作界面下方有一套虚拟按键，作用完全一样</li>
                )}
              </ul>
            </div>
            <div className="flex justify-center">
              <img
                src={spriteUrl}
                alt=""
                aria-hidden="true"
                className="h-24 w-auto object-contain drop-shadow-lg"
                onError={(e) => { e.currentTarget.style.visibility = 'hidden' }}
              />
            </div>
            <div className="bg-gold-900/10 border border-gold-700/25 rounded p-3 text-xs font-serif">
              <p className="text-gold-300 mb-1">🏆 评级即航程</p>
              <p className="text-gold-500">传奇舵手可省下至多 <span className="text-gold-200">15%</span> 本段航程（约 <span className="text-gold-200">{Math.round(segmentNm * 0.15)}</span> 海里）并提振士气；操作太莽，船要在浪里颠掉耐久。</p>
            </div>
            {hint && <p className="text-danger-400 text-xs font-serif text-center">{hint}</p>}
            <button
              onClick={startRun}
              className="w-full py-2.5 text-sm font-serif text-gold-100 bg-gold-700/70 hover:bg-gold-600/80 rounded-lg press transition-all"
            >
              ⚓ 掌舵启程（Enter）
            </button>
            {/* 交给水手：不是"失败"，是"不玩"。
                跳过的唯一代价是本段没有操舵奖励（不省里程、不加士气、不掉耐久），
                船照常往前开。不想玩实时操作的人不该被卡在这一步。 */}
            <button
              onClick={skipHelmRun}
              className="w-full py-2 text-xs font-serif text-gold-500 hover:text-gold-300 border border-gold-700/25 rounded-lg press transition-all"
            >
              🙋 交给水手，跳过本段（Esc）——本段没有操舵奖励
            </button>
          </div>
        )}

        {phase === 'running' && (
          <div className="p-4 space-y-3">
            {/* 仪表盘 */}
            <div className="relative mx-auto" style={{ width: 300, maxWidth: '86vw' }}>
              <svg viewBox="0 0 320 320" className="w-full h-full" style={{ filter: 'drop-shadow(0 0 18px rgba(0,0,0,0.5))' }}>
                <defs>
                  <radialGradient id="helmBg" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="rgba(20,34,48,0.98)" />
                    <stop offset="100%" stopColor="rgba(10,18,28,1)" />
                  </radialGradient>
                </defs>
                <circle cx={CX} cy={CY} r="150" fill="url(#helmBg)" stroke="#6b4e1e" strokeWidth="2.5" />
                <circle cx={CX} cy={CY} r="140" fill="none" stroke="#c9a96e" strokeWidth="0.8" opacity="0.4" />

                {/* 刻度 */}
                {Array.from({ length: 24 }, (_, i) => i * 15).map((deg) => {
                  const [x1, y1] = polar(CX, CY, 128, deg)
                  const [x2, y2] = polar(CX, CY, deg % 90 === 0 ? 116 : 122, deg)
                  return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#c9a96e" strokeWidth={deg % 90 === 0 ? 1.4 : 0.6} opacity={deg % 90 === 0 ? 0.7 : 0.3} />
                })}
                {(['N', 'E', 'S', 'W'] as const).map((label, i) => {
                  const [x, y] = polar(CX, CY, 104, i * 90)
                  return <text key={label} x={x} y={y + 5} textAnchor="middle" fill="#d4a838" fontSize="13" fontFamily="serif" fontWeight="bold" opacity="0.9">{label}</text>
                })}

                {/* 风向组：箭头指向风吹去的方位 */}
                <g ref={windGroupRef} style={{ transformOrigin: `${CX}px ${CY}px` }}>
                  <line x1={CX} y1={CY - 118} x2={CX} y2={CY - 142} stroke="#9fc5e8" strokeWidth="2" opacity="0.9" />
                  <polygon points={`${CX},${CY - 152} ${CX - 6},${CY - 140} ${CX + 6},${CY - 140}`} fill="#9fc5e8" opacity="0.95" />
                  <line x1={CX - 26} y1={CY - 126} x2={CX - 12} y2={CY - 132} stroke="#9fc5e8" strokeWidth="1" opacity="0.5" />
                  <line x1={CX + 26} y1={CY - 126} x2={CX + 12} y2={CY - 132} stroke="#9fc5e8" strokeWidth="1" opacity="0.5" />
                </g>

                {/* 有利区弧带（绿色）：随风向旋转 */}
                <g ref={arcGroupRef} style={{ transformOrigin: `${CX}px ${CY}px` }}>
                  <path d={arcPath(92)} fill="none" stroke="#34d399" strokeWidth="11" opacity="0.28" strokeLinecap="round" />
                  <path d={arcPath(92)} fill="none" stroke="#6ee7b7" strokeWidth="1.6" opacity="0.85" strokeLinecap="round" />
                </g>

                {/* 阵风警示 */}
                <text ref={gustRef} x={CX} y={CY - 60} textAnchor="middle" fill="#f87171" fontSize="13" fontFamily="serif" fontWeight="bold" style={{ opacity: 0, transition: 'opacity 0.15s' }}>⚠ 阵风！</text>

                {/* 航迹尾迹（帆越满越明显） */}
                <g ref={wakeRef} style={{ opacity: 0.5 }}>
                  <path d={`M ${CX - 4} ${CY + 30} Q ${CX} ${CY + 46} ${CX + 4} ${CY + 30}`} fill="none" stroke="rgba(120,190,255,0.5)" strokeWidth="1.4" />
                </g>

                {/* 船首向指针 */}
                <g ref={needleRef} style={{ transformOrigin: `${CX}px ${CY}px` }}>
                  <line x1={CX} y1={CY + 14} x2={CX} y2={CY - 74} stroke="#f0d88a" strokeWidth="1.6" strokeDasharray="5 4" opacity="0.85" />
                  <polygon points={`${CX},${CY - 88} ${CX - 7},${CY - 70} ${CX + 7},${CY - 70}`} fill="#f0d88a" />
                  {/* 旗舰精绘精灵：随船首向旋转，帆缆越满 Wake 越亮 */}
                  <image
                    ref={shipImgRef}
                    href={spriteUrl}
                    x={CX - 17}
                    y={CY - 50}
                    width={34}
                    height={76}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.6))' }}
                  />
                </g>

                <circle cx={CX} cy={CY} r="4" fill="#d4a838" stroke="#8a6c2a" strokeWidth="1" />
              </svg>

              {/* 夹角读数 */}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-1 text-center">
                <span className="text-gold-500 font-serif text-[10px]">航向·风向夹角 </span>
                <span ref={angleTextRef} className="text-gold-200 font-serif text-sm">0°</span>
                <span ref={statusTextRef} className="font-serif text-sm ml-1" style={{ color: '#6ee7b7' }}>吃风</span>
              </div>
            </div>

            {/* HUD */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-serif">
                <span className="text-gold-500 w-14 shrink-0">剩余</span>
                <div className="flex-1 h-2 bg-ocean-700 rounded-full overflow-hidden">
                  <div ref={timeBarRef} className="h-full bg-sky-400/80 rounded-full" style={{ width: '100%' }} />
                </div>
                <span ref={timeTextRef} className="text-gold-300 w-12 text-right">{HELM_DURATION.toFixed(1)}s</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-serif">
                <span className="text-gold-500 w-14 shrink-0">均风</span>
                <div className="flex-1 h-2 bg-ocean-700 rounded-full overflow-hidden">
                  <div ref={scoreBarRef} className="h-full bg-emerald-400/80 rounded-full" style={{ width: '50%' }} />
                </div>
                <span ref={scoreTextRef} className="text-gold-300 w-16 text-right">均风 1.00</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-serif">
                <span className="text-gold-500 w-14 shrink-0">帆缆</span>
                <div className="flex-1 h-2 bg-ocean-700 rounded-full overflow-hidden">
                  <div ref={trimBarRef} className="h-full bg-gold-400/80 rounded-full" style={{ width: '60%' }} />
                </div>
                <span ref={trimLabelRef} className="text-gold-300 w-16 text-right">半帆</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] font-serif text-gold-600">
              <span>A/D 转向 · W/S 帆缆</span>
              <span>Enter 收舵</span>
            </div>
            {hint && <p className="text-danger-400 text-xs font-serif text-center">{hint}</p>}

            {/* 触屏虚拟按键：没有物理键盘时，操舵必须能用手玩。
                派发的就是键盘事件，所以与键盘玩法完全同源。 */}
            {isTouch && (
              <div className="space-y-2 pt-1">
                <TouchKeyPad
                  keys={[
                    { key: 'ArrowLeft', label: '◀', hint: '左转', hold: true },
                    { key: 'ArrowUp', label: '▲', hint: '收帆', hold: true },
                    { key: 'ArrowRight', label: '▶', hint: '右转', hold: true },
                    { key: 'ArrowDown', label: '▼', hint: '松帆', hold: true },
                  ]}
                />
                <button
                  type="button"
                  data-testid="touch-helm-finish"
                  onPointerDown={(e) => { e.preventDefault(); finishRun(true) }}
                  className="w-full py-2 text-xs font-serif text-gold-300 border border-gold-700/30 rounded-lg press transition-all"
                >
                  ⛵ 收舵（Enter）
                </button>
              </div>
            )}
          </div>
        )}

        {phase === 'done' && result && reward && (
          <div className="p-5 space-y-4">
            <div className="text-center">
              <div className="text-3xl mb-1">{reward.grade === 'legend' ? '🌟' : reward.grade === 'poor' ? '🌀' : '🧭'}</div>
              <h3 className="pirate-title text-2xl" style={{ color: HELM_GRADE_COLOR[reward.grade] }}>{reward.label}</h3>
              <p className="text-gold-400 font-serif text-sm mt-1">{reward.comment}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center bg-ocean-800/40 rounded p-2.5">
              <div>
                <div className="text-gold-500 text-[10px] font-serif">综合评分</div>
                <div className="text-gold-200 text-sm font-serif">{result.score.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gold-500 text-[10px] font-serif">吃风时长</div>
                <div className="text-gold-200 text-sm font-serif">{Math.round(result.timeInArcRatio * 100)}%</div>
              </div>
              <div>
                <div className="text-gold-500 text-[10px] font-serif">最佳连击</div>
                <div className="text-gold-200 text-sm font-serif">{result.bestStreak.toFixed(1)}s</div>
              </div>
            </div>

            <div className="bg-ocean-800/40 border border-gold-700/20 rounded p-3 space-y-1 text-xs font-serif">
              <div className="flex justify-between">
                <span className="text-gold-500">本段少走</span>
                <span className="text-sky-300">{advanceNm.toFixed(0)} 海里</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gold-500">士气</span>
                <span className={reward.morale >= 0 ? 'text-emerald-300' : 'text-danger-400'}>{reward.morale >= 0 ? `+${reward.morale}` : reward.morale}</span>
              </div>
              {reward.wear !== 0 && (
                <div className="flex justify-between">
                  <span className="text-gold-500">旗舰耐久</span>
                  <span className="text-danger-400">{reward.wear}</span>
                </div>
              )}
              {reward.fame > 0 && (
                <div className="flex justify-between">
                  <span className="text-gold-500">声望</span>
                  <span className="text-gold-300">+{reward.fame}</span>
                </div>
              )}
            </div>

            <button
              onClick={closeAndSettle}
              className="w-full py-2.5 text-sm font-serif text-gold-100 bg-gold-700/70 hover:bg-gold-600/80 rounded-lg press transition-all"
            >
              ⛵ 收起舵轮，继续航程（Enter / Esc）
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
