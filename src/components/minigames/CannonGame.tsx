import { useEffect, useRef, useState } from 'react'
import { Bomb, Shield } from 'lucide-react'
import {
  CANNON_BRACE_MARK,
  CANNON_GRAZE_HALF,
  CANNON_HIT_HALF,
  CANNON_VOLLEYS,
  type CannonShotResult,
  type CannonState,
  type MiniGameModifiers,
  advanceCannon,
  braceCannon,
  cannonPerformance,
  createCannonState,
  fireCannon,
} from '@/utils/miniGame'
import { useMiniGameLoop } from '@/hooks/useMiniGameLoop'
import { useFxStore as useFx } from '@/store/useFxStore'
import { useGameStore } from '@/store/useGameStore'
import { FX_ASSETS } from '@/data/envAssets'
import { SHIP_SPRITES, SPECIAL_SPRITES, shipSprite } from '@/data/shipSprites'

/**
 * 舷炮对轰：三轮齐射，每轮「先开火、再扛对方的反击」。
 *
 * 与其它原型同构：纯逻辑在 utils/miniGame.ts（advanceCannon/fireCannon/
 * braceCannon/cannonPerformance），本组件只做帧循环 + DOM 直改 + 特效摆放。
 *
 * 空间读法（玩家视角，己方在左、敌舰在右）：
 *   · 上方瞄准轨：标尺从左到右匀速掠过，敌舰正中的命中带在轨道中央
 *   · 下方来袭轨：敌弹从右向左逼近，越过中线后架盾才算「及时」
 * 屏幕上两条轨道的带宽、架盾窗口线与 utils 里的判定常量是同一组数字，
 * 看见的宽度就是判定的宽度。
 */

/** 战场上的特效：位置以场景百分比计，落点与船体位置一一对应 */
const FX_ANCHOR = {
  ownGuns: { x: 21, y: 76 },
  enemyHull: { x: 50, y: 33 },
  enemyWater: { x: 66, y: 36 },
  ownHull: { x: 20, y: 76 },
} as const

const SHOT_LABEL: Record<'hit' | 'graze' | 'miss', string> = {
  hit: '命中',
  graze: '擦弹',
  miss: '落水',
}

export default function CannonGame({ modifiers, onDone }: {
  modifiers: MiniGameModifiers
  onDone: (score: number) => void
}) {
  const stateRef = useRef<CannonState | null>(null)
  const [hint, setHint] = useState('标尺掠过敌舰时，按空格开火')
  const [log, setLog] = useState<string[]>([])

  // 己方旗舰精灵（事件卡背后就是玩家的船）
  const flagship = useGameStore(s => {
    const f = s.fleet
    return f.ships.find(sh => sh.id === f.flagshipId) ?? f.ships[0]
  })

  // DOM 直改引用
  const sceneRef = useRef<HTMLDivElement>(null)
  const aimTrackRef = useRef<HTMLDivElement>(null)
  const incomingTrackRef = useRef<HTMLDivElement>(null)
  const aimMarkerRef = useRef<HTMLDivElement>(null)
  const incomingMarkerRef = useRef<HTMLDivElement>(null)
  const hitBandRef = useRef<HTMLDivElement>(null)
  const grazeBandRef = useRef<HTMLDivElement>(null)
  const braceZoneRef = useRef<HTMLDivElement>(null)
  const braceLineRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const ownShipRef = useRef<HTMLDivElement>(null)
  const shieldRef = useRef<HTMLDivElement>(null)
  const bannerRef = useRef<HTMLDivElement>(null)
  const volleyRef = useRef<HTMLSpanElement>(null)
  const hitsRef = useRef<HTMLSpanElement>(null)
  const grazesRef = useRef<HTMLSpanElement>(null)
  const missesRef = useRef<HTMLSpanElement>(null)
  const damageBarRef = useRef<HTMLDivElement>(null)
  const damageTextRef = useRef<HTMLSpanElement>(null)
  const fireBtnRef = useRef<HTMLButtonElement>(null)
  const braceBtnRef = useRef<HTMLButtonElement>(null)
  const dotRefs = useRef<(HTMLSpanElement | null)[]>([])

  /** 帧间过渡检测：只有状态真的跨过界才放特效/改文案，避免每帧重复触发 */
  const prevRef = useRef({
    phase: 'aim' as CannonState['phase'],
    volley: 0,
    shot: null as CannonShotResult,
    braced: false,
    damagesLen: 0,
    enemyFxShown: false,
    ownFxShown: false,
  })
  /** 每轮开火结果（轮次圆点用） */
  const volleyResultsRef = useRef<CannonShotResult[]>([])

  useEffect(() => {
    stateRef.current = createCannonState()
  }, [])

  /** 在战场上生成一张特效图，播完自动移除（Web Animations，不依赖 CSS 关键帧） */
  const spawnFx = (src: string, xPct: number, yPct: number, size: number) => {
    const scene = sceneRef.current
    if (!scene) return
    const img = document.createElement('img')
    img.src = src
    img.alt = ''
    img.draggable = false
    img.style.cssText = `position:absolute;left:${xPct}%;top:${yPct}%;width:${size}px;height:${size}px;transform:translate(-50%,-50%);pointer-events:none;z-index:20`
    scene.appendChild(img)
    img.animate(
      [
        { opacity: 0, transform: 'translate(-50%,-50%) scale(0.4)' },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1.05)', offset: 0.25 },
        { opacity: 0, transform: 'translate(-50%,-50%) scale(1.35)' },
      ],
      { duration: 620, easing: 'ease-out' },
    ).onfinish = () => img.remove()
  }

  /** 己方受创时的船体晃动 */
  const shakeScene = () => {
    sceneRef.current?.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(4px)' },
        { transform: 'translateX(-2px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 260, easing: 'ease-in-out' },
    )
  }

  useMiniGameLoop<CannonState>({
    active: true,
    stateRef,
    runtime: {
      create: createCannonState,
      step: (s, dt) => {
        advanceCannon(s, dt)
        return s.finished
      },
      onKey: (s, key) => {
        if (s.finished) return false
        if (key === ' ' || key === 'f' || key === 'F') {
          if (s.phase !== 'aim' || s.shot !== null) return false
          fireCannon(s, modifiers)
          return true
        }
        if (key === 'ArrowDown' || key === 's' || key === 'S') {
          if (s.phase !== 'incoming' || s.braced) return false
          const { timing } = braceCannon(s)
          setHint(timing === 'timely' ? '架盾及时——木屑飞溅，人没事' : '架得太早，膀子先麻了')
          useFx.getState().cue('task')
          return true
        }
        return false
      },
      score: (s) => cannonPerformance(s, modifiers),
    },
    onFinish: (score) => onDone(score),
    render: (s) => {
      const wb = modifiers.windowBonus
      const hitHalf = CANNON_HIT_HALF * (1 + wb)
      const grazeHalf = CANNON_GRAZE_HALF * (1 + wb)
      const prev = prevRef.current

      /* ---------- 常驻：轨道明暗、按钮可用感 ---------- */
      if (aimTrackRef.current) aimTrackRef.current.style.opacity = s.phase === 'aim' ? '1' : '0.25'
      if (incomingTrackRef.current) incomingTrackRef.current.style.opacity = s.phase === 'incoming' ? '1' : '0.25'
      if (fireBtnRef.current) fireBtnRef.current.style.opacity = s.phase === 'aim' && s.shot === null ? '1' : '0.35'
      if (braceBtnRef.current) braceBtnRef.current.style.opacity = s.phase === 'incoming' && !s.braced ? '1' : '0.35'

      /* ---------- 命中带：宽度 = 判定半宽（加成实时反映，不虚标） ---------- */
      if (hitBandRef.current) {
        hitBandRef.current.style.left = `${(0.5 - hitHalf) * 100}%`
        hitBandRef.current.style.width = `${hitHalf * 200}%`
      }
      if (grazeBandRef.current) {
        grazeBandRef.current.style.left = `${(0.5 - grazeHalf) * 100}%`
        grazeBandRef.current.style.width = `${grazeHalf * 200}%`
      }

      /* ---------- 架盾窗口线（来袭标 ≤ 0.5 为及时） ---------- */
      if (braceZoneRef.current) {
        braceZoneRef.current.style.width = `${CANNON_BRACE_MARK * 100}%`
      }
      if (braceLineRef.current) {
        braceLineRef.current.style.left = `${CANNON_BRACE_MARK * 100}%`
      }

      /* ---------- 标尺 / 敌弹位置 ---------- */
      if (aimMarkerRef.current) aimMarkerRef.current.style.left = `${s.aim * 100}%`
      if (incomingMarkerRef.current) incomingMarkerRef.current.style.left = `${(1 - s.incoming) * 100}%`
      if (shellRef.current) {
        shellRef.current.style.left = `${(1 - s.incoming) * 100}%`
        shellRef.current.style.opacity = s.phase === 'incoming' ? '1' : '0'
      }

      /* ---------- 架盾指示：己方船上亮盾 ---------- */
      if (shieldRef.current) {
        if (s.braced) {
          shieldRef.current.style.opacity = '1'
          shieldRef.current.style.filter = s.braceTiming === 'timely'
            ? 'drop-shadow(0 0 6px rgba(251,191,36,0.9))'
            : 'grayscale(0.6) opacity(0.7)'
        } else {
          shieldRef.current.style.opacity = '0'
        }
      }

      /* ---------- HUD ---------- */
      if (volleyRef.current) volleyRef.current.textContent = `${Math.min(CANNON_VOLLEYS, s.volley + 1)}`
      if (hitsRef.current) hitsRef.current.textContent = `${s.hits}`
      if (grazesRef.current) grazesRef.current.textContent = `${s.grazes}`
      if (missesRef.current) missesRef.current.textContent = `${s.misses}`
      const avgDamage = s.damages.length > 0
        ? s.damages.reduce((a, b) => a + b, 0) / s.damages.length
        : 0
      if (damageBarRef.current) {
        damageBarRef.current.style.width = `${avgDamage * 100}%`
        damageBarRef.current.style.background = avgDamage > 0.6
          ? 'rgba(248,113,113,0.9)'
          : avgDamage > 0.3
            ? 'rgba(251,191,36,0.85)'
            : 'rgba(125,211,160,0.8)'
      }
      if (damageTextRef.current) damageTextRef.current.textContent = `${Math.round(avgDamage * 100)}%`
      for (let i = 0; i < CANNON_VOLLEYS; i++) {
        const dot = dotRefs.current[i]
        if (!dot) continue
        const r = volleyResultsRef.current[i]
        dot.style.background = r === 'hit'
          ? 'rgba(125,211,160,0.95)'
          : r === 'graze'
            ? 'rgba(251,191,36,0.95)'
            : r === 'miss'
              ? 'rgba(248,113,113,0.85)'
              : 'rgba(30,58,82,0.9)'
      }

      /* ---------- 过渡 1：开火——炮口火光先炸 ---------- */
      if (prev.phase === 'aim' && s.phase === 'incoming' && s.shot !== null) {
        volleyResultsRef.current[s.volley] = s.shot
        prev.enemyFxShown = false
        prev.ownFxShown = false
        spawnFx(FX_ASSETS.cannonFlash, FX_ANCHOR.ownGuns.x, FX_ANCHOR.ownGuns.y, 88)
        useFx.getState().cue('ship')
        setHint('炮弹出膛——当心她的还击')
      }

      /* ---------- 过渡 2：炮弹砸到敌舰（飞行 ~0.32s 后见分晓） ---------- */
      if (
        s.phase === 'incoming' && s.shot !== null && !prev.enemyFxShown
        && s.phaseTime >= 0.32
      ) {
        prev.enemyFxShown = true
        if (s.shot === 'hit') {
          spawnFx(FX_ASSETS.hullBurst, FX_ANCHOR.enemyHull.x, FX_ANCHOR.enemyHull.y, 110)
          setHint('砸中了！她的船舷炸开了花')
          useFx.getState().cue('impact')
        } else if (s.shot === 'graze') {
          spawnFx(FX_ASSETS.hullBurst, FX_ANCHOR.enemyHull.x, FX_ANCHOR.enemyHull.y, 84)
          setHint('擦过帆索——只削掉几片木屑')
          useFx.getState().cue('task')
        } else {
          spawnFx(FX_ASSETS.waterSpout, FX_ANCHOR.enemyWater.x, FX_ANCHOR.enemyWater.y, 96)
          setHint('砸进浪里，只捞起一朵水花')
        }
      }

      /* ---------- 过渡 3：敌弹落定——己方受创 ---------- */
      if (s.damages.length > prev.damagesLen) {
        prev.damagesLen = s.damages.length
        const d = s.damages[s.damages.length - 1]
        setLog(l => [...l, `第 ${s.volley + 1} 轮 ${SHOT_LABEL[s.shot ?? 'miss']} · 受创 ${Math.round(d * 100)}%`])
        if (!prev.ownFxShown) {
          prev.ownFxShown = true
          if (d > 0.2) {
            spawnFx(FX_ASSETS.hullBurst, FX_ANCHOR.ownHull.x, FX_ANCHOR.ownHull.y, 100)
            shakeScene()
            if (d >= 0.6) useFx.getState().cue('impact')
          }
        }
        if (bannerRef.current) {
          bannerRef.current.textContent = d <= 0.15
            ? '架盾及时，几乎无伤'
            : d >= 0.65
              ? '直吃一发，甲板在晃'
              : '挡住了大半'
        }
      }

      /* ---------- 过渡 4：进入下一轮 / 轮间横幅 ---------- */
      if (s.phase === 'aim' && s.volley !== prev.volley) {
        prev.volley = s.volley
        if (bannerRef.current) bannerRef.current.style.opacity = '0'
        setHint(`第 ${s.volley + 1} 轮齐射——标尺掠过敌舰时开火`)
      }
      if (s.phase === 'resolve' && bannerRef.current) {
        bannerRef.current.style.opacity = '1'
      }

      prev.phase = s.phase
      prev.shot = s.shot
      prev.braced = s.braced
    },
  })

  const doFire = () => {
    const s = stateRef.current
    if (!s || s.finished || s.phase !== 'aim' || s.shot !== null) return
    fireCannon(s, modifiers)
  }
  const doBrace = () => {
    const s = stateRef.current
    if (!s || s.finished || s.phase !== 'incoming' || s.braced) return
    const { timing } = braceCannon(s)
    setHint(timing === 'timely' ? '架盾及时——木屑飞溅，人没事' : '架得太早，膀子先麻了')
    useFx.getState().cue('task')
  }

  const ownSprite = flagship ? shipSprite(flagship.type) : SHIP_SPRITES.galleon

  return (
    <div className="p-5 space-y-3">
      {/* HUD：轮次 / 命中统计 / 受创条 */}
      <div className="flex items-center justify-between text-xs font-serif">
        <span className="text-gold-500 w-28 shrink-0">
          第 <span ref={volleyRef} data-testid="cannon-volley" className="text-gold-200">1</span>/{CANNON_VOLLEYS} 轮齐射
        </span>
        <div className="flex items-center gap-1" data-testid="cannon-dots">
          {Array.from({ length: CANNON_VOLLEYS }, (_, i) => (
            <span
              key={i}
              ref={el => { dotRefs.current[i] = el }}
              className="w-2 h-2 rounded-full"
              style={{ background: 'rgba(30,58,82,0.9)' }}
            />
          ))}
        </div>
        <span className="text-gold-500">
          命中 <span ref={hitsRef} data-testid="cannon-hits" className="text-emerald-300">0</span>
          {' · '}擦弹 <span ref={grazesRef} data-testid="cannon-grazes" className="text-amber-300">0</span>
          {' · '}落水 <span ref={missesRef} data-testid="cannon-misses" className="text-danger-400">0</span>
        </span>
      </div>

      {/* 战场：上轨瞄准、下轨来袭，两船分居左右 */}
      <div
        ref={sceneRef}
        data-testid="cannon-scene"
        className="relative h-56 rounded-lg border border-gold-700/30 overflow-hidden bg-gradient-to-b from-ocean-800 via-ocean-900 to-ocean-950"
      >
        {/* 瞄准轨（上） */}
        <div
          ref={aimTrackRef}
          data-testid="cannon-aim-track"
          className="absolute left-3 right-3 top-2.5 h-5 rounded-full bg-ocean-950/70 border border-gold-700/25 transition-opacity"
        >
          {/* 擦弹带（外）与命中带（内）：宽度即判定宽度 */}
          <div
            ref={grazeBandRef}
            className="absolute top-0 bottom-0 bg-amber-400/10"
            style={{ left: '20%', width: '60%' }}
          />
          <div
            ref={hitBandRef}
            className="absolute top-0 bottom-0 bg-emerald-400/15 border-x border-emerald-400/50"
            style={{ left: '36%', width: '28%' }}
          />
          <div
            ref={aimMarkerRef}
            data-testid="cannon-aim-marker"
            className="absolute top-0 bottom-0 w-[3px] -translate-x-1/2 bg-gold-200 shadow-[0_0_6px_rgba(251,191,36,0.8)]"
            style={{ left: '0%' }}
          />
        </div>

        {/* 敌舰：弓朝左（对着我们） */}
        <div className="absolute left-1/2 top-9 -translate-x-1/2 w-32 h-32 flex items-center justify-center pointer-events-none">
          <img
            src={SPECIAL_SPRITES.frigateWar}
            alt="敌舰"
            draggable={false}
            className="w-32 h-32 select-none"
            style={{ transform: 'rotate(-90deg)' }}
          />
        </div>

        {/* 来袭轨（下）：敌弹从右向左 */}
        <div
          ref={incomingTrackRef}
          data-testid="cannon-incoming-track"
          className="absolute left-3 right-3 bottom-2.5 h-5 rounded-full bg-ocean-950/70 border border-gold-700/25 transition-opacity"
        >
          {/* 及时架盾区：来袭标进入左半边再按 ↓ */}
          <div
            ref={braceZoneRef}
            className="absolute left-0 top-0 bottom-0 bg-gold-400/10 border-r border-gold-400/40"
            style={{ width: '50%' }}
          />
          <div
            ref={braceLineRef}
            className="absolute top-0 bottom-0 w-px bg-gold-400/50"
            style={{ left: '50%' }}
          />
          <div
            ref={incomingMarkerRef}
            data-testid="cannon-incoming-marker"
            className="absolute top-0 bottom-0 w-[3px] -translate-x-1/2 bg-danger-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]"
            style={{ left: '100%' }}
          />
          <div
            ref={shellRef}
            className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-ocean-950 to-black shadow-md"
            style={{ left: '100%', opacity: 0 }}
          />
        </div>

        {/* 己方旗舰：弓朝右 */}
        <div ref={ownShipRef} className="absolute left-1 bottom-8 w-40 h-40 flex items-end justify-center pointer-events-none">
          <img
            src={ownSprite}
            alt="己舰"
            draggable={false}
            className="w-36 h-36 select-none"
            style={{ transform: 'rotate(90deg)' }}
          />
        <span
          ref={shieldRef}
          data-testid="cannon-shield"
          className="absolute left-1/2 -translate-x-1/2 bottom-16 text-3xl transition-opacity"
          style={{ opacity: 0 }}
        >
          🛡
        </span>
        </div>

        {/* 轮间结果横幅 */}
        <div
          ref={bannerRef}
          data-testid="cannon-banner"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded bg-ocean-950/85 border border-gold-600/50 text-gold-200 text-sm font-serif whitespace-nowrap transition-opacity pointer-events-none"
          style={{ opacity: 0 }}
        />
      </div>

      {/* 受创条 */}
      <div className="flex items-center gap-2 text-xs font-serif">
        <span className="text-gold-500 w-14 shrink-0">本战受创</span>
        <div className="flex-1 h-2 bg-ocean-700 rounded-full overflow-hidden">
          <div
            ref={damageBarRef}
            data-testid="cannon-damage-bar"
            className="h-full rounded-full"
            style={{ width: '0%' }}
          />
        </div>
        <span ref={damageTextRef} data-testid="cannon-damage-text" className="text-gold-300 w-9 text-right">0%</span>
      </div>

      {/* 操作按钮（键盘等价） */}
      <div className="grid grid-cols-2 gap-2">
        <button
          ref={fireBtnRef}
          data-testid="cannon-fire"
          onClick={doFire}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-gold-700/40 bg-ocean-800/60 hover:bg-gold-700/30 press transition-[opacity,transform] font-serif text-sm text-gold-200"
        >
          <Bomb size={13} aria-hidden="true" />
          开火（空格）
        </button>
        <button
          ref={braceBtnRef}
          data-testid="cannon-brace"
          onClick={doBrace}
          className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg border border-gold-700/40 bg-ocean-800/60 hover:bg-gold-700/30 press transition-[opacity,transform] font-serif text-sm text-gold-200"
        >
          <Shield size={13} aria-hidden="true" />
          架盾（↓）
        </button>
      </div>

      <p className="text-gold-300 text-xs font-serif text-center h-4" data-testid="cannon-hint">{hint}</p>

      {/* 逐轮账目 */}
      <div className="text-[10px] font-serif text-gold-600 space-y-0.5 min-h-[2.2em]" data-testid="cannon-log">
        {log.map((line, i) => <div key={i}>{line}</div>)}
      </div>
      <p className="text-[10px] font-serif text-gold-600 text-center">
        标尺压在敌舰正中开火 · 来袭标越过中线再架盾
      </p>
    </div>
  )
}
