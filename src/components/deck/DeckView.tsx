import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { Anchor, Footprints, X } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { skyAt } from '@/utils/skyClock'
import { createDeckShip, type DeckShip } from './shipModel'
import { DECK_WAVES, deckShipPose, deckWaveHeight } from './deckWaves'
import { findCoast, bearingWord, compassWord, wrapDeg, type CoastSighting } from './deckCoast'
import { createDeckHarbor, type DeckHarbor } from './harborModel'
import { harborCalm } from './deckHarbor'
import { createDeckCoast } from './coastModel'
import { deckEyeY, stepWalk, WALK_SPEED_M, type WalkPos } from './deckWalk'
import { CABIN_ENTER, CABIN_EXIT, cabinEyeY, stepInCabin } from './deckCabin'
import { SHIP_DRAFT_LIFT, SHIP_HALF_LENGTH, SHIP_SCALE } from './shipShape'
import { createMap3DPost, type Map3DPost } from '@/components/map3d/post'
import { createDeckRain, rainTiltFromWind } from './rainLayer'
import { BIRD_MAX, deckBirdFlock, deckBirdPose } from './deckBirds'
import { sailorCount } from './deckCrew'
import { bowWaveLength, bowWaveSpread, wakeStrength } from './deckWake'
import {
  approachLook, deckWeatherLook, lightningEnvelope, rainDropCount, type DeckWeatherLook,
} from './deckWeather'
import { calculateBearing } from '@/utils/navigation'
import { goods } from '@/data/goods'
import { WEATHER_INFO } from '@/utils/weather'
import { ports } from '@/data/ports'
import { useVoyageNext } from '@/hooks/useVoyageNext'

/**
 * 船上视角：贴着海面看自己的船（第三个空间）。
 *
 * 【为什么需要它】前两个空间都是"看地图"：2D 海图是俯视的纸，2.5D 是全球一块板。
 * 玩家从头到尾都站在地图外面，看不到"海有多高、船有多大"。这个视角把镜头
 * 降到水面上，船、浪、月亮同一个尺度——它是**换景别**，不是加弹窗。
 *
 * 【与 2.5D 海图的关系】同一个 three 版本、同一套后处理、同一套船模型，
 * 但**独立场景**：海图是"一块平板 + 贴图"，这里是"真海面 + 真船"。
 * 独立的好处是各自可以有自己的降级策略，坏处是资源要各管各的（见 cleanup）。
 *
 * 【这一版做到哪】深海：浪、月、星、船、灯火、辉光、随浪起伏、随航速流动。
 * 还没有：岸线/灯塔/港口建筑、雨雪、甲板行走。那些是后续几轮的事。
 */

/*
 * 【颜色一律写成 0xRRGGBB，不要用 setRGB 写裸数字】
 * three 的 `Color` 在 ColorManagement 开启时会把 hex 当 **sRGB** 转成线性工作空间；
 * 而 `setRGB(0.15, ...)` 是**直接当线性**写进去的 —— 同一个 0.15，前者显示约 0.15、
 * 后者显示约 0.42。第一版每帧 setRGB 写天空，结果"深夜"是灰蓝色（实测 rgb 104,129,150），
 * 整张图像阴天的下午。现在两端各给一个 hex，每帧按日相 lerp。
 */
const SKY_ZENITH_NIGHT = new THREE.Color(0x04080f)
const SKY_ZENITH_DAY = new THREE.Color(0x4478a6)
const SKY_HORIZON_NIGHT = new THREE.Color(0x112436)
const SKY_HORIZON_DAY = new THREE.Color(0xb2cee2)
const SEA_DEEP_NIGHT = new THREE.Color(0x02060b)
const SEA_DEEP_DAY = new THREE.Color(0x0d2a3f)
const MOON_COLOR = new THREE.Color(0xdfe9ff)
/*
 * 黄昏的颜色：日出/日落时地平线偏橙、天顶偏紫。
 * 【为什么必须有】只有"夜蓝 ↔ 日蓝"两端时，`lit≈0.45` 的那一段是**灰的**
 * （两色线性插值的中点），读作"阴天"而不是黄昏 —— 傍晚截图就是这样。
 * 真实的黄昏是**第三种色**，不是两端的中点。
 */
const DUSK_HORIZON = new THREE.Color(0xc47a52)
const DUSK_ZENITH = new THREE.Color(0x4e4a66)

/**
 * 甲板上被点开的物件面板。
 *
 * 【它为什么不是"又一个弹窗"】它是**贴着物件的回执**：点舱口看舱里有什么、
 * 点舵轮看往哪走。两个面板各自只有一组数，而且全部来自既有单一来源
 * （载重与货来自 `fleet`，下一站来自 `useVoyageNext`）—— 面板里不重新算账，
 * 否则甲板上写"约 12 天"、出航计划写"约 15 天"，玩家不知道该信哪个。
 */
function DeckSpotPanel({
  spot, fleet, weather, next, sighting, onClose,
}: {
  spot: 'hatch' | 'wheel' | 'crow'
  fleet: ReturnType<typeof useGameStore.getState>['fleet']
  weather: ReturnType<typeof useGameStore.getState>['weather']
  next: ReturnType<typeof useVoyageNext>
  /** 当前位置的最近陆地（`findCoast` 的结果，与 HUD 同一个来源） */
  sighting: CoastSighting | null
  onClose: () => void
}) {
  const flagship = fleet.ships.find((s) => s.id === fleet.flagshipId) ?? fleet.ships[0]
  const capacity = flagship?.capacity ?? 0
  const used = fleet.cargo.reduce((sum, c) => sum + c.quantity, 0)
  const rows = [...fleet.cargo]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)
    .map((c) => ({ name: goods.find((g) => g.id === c.goodId)?.nameCn ?? `货 ${c.goodId}`, qty: c.quantity }))

  return (
    <div
      data-testid={`deck-spot-${spot}`}
      className="absolute bottom-24 left-1/2 w-[min(92vw,25rem)] -translate-x-1/2 rounded-lg border border-gold-600/40 bg-[#0a1420]/95 p-3 text-parchment-100 shadow-xl backdrop-blur-md"
    >
      <div className="flex items-baseline justify-between">
        <div className="text-xs tracking-[0.3em] text-gold-400">
          {spot === 'hatch' ? '货舱口' : spot === 'wheel' ? '舵轮' : '桅顶瞭望台'}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1.5 text-xs text-parchment-200/70 hover:text-parchment-100"
        >
          收起
        </button>
      </div>
      {spot === 'hatch' ? (
        <>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg leading-none">{used}</span>
            <span className="text-xs text-parchment-200/70">/ {capacity} 载重</span>
            <span className="ml-auto text-xs text-parchment-200/70">
              空 {Math.max(0, capacity - used)}
            </span>
          </div>
          <ul className="mt-2 space-y-0.5 text-xs">
            {rows.length ? (
              rows.map((r) => (
                <li key={r.name} className="flex justify-between border-b border-white/5 pb-0.5">
                  <span>{r.name}</span>
                  <span className="tabular-nums text-parchment-200/80">×{r.qty}</span>
                </li>
              ))
            ) : (
              <li className="text-parchment-200/60">舱里是空的 —— 只有压舱石与缆绳</li>
            )}
          </ul>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
            {[['粮', fleet.food], ['水', fleet.water], ['士气', fleet.morale]].map(([k, v]) => (
              <div key={String(k)} className="rounded border border-white/10 py-1">
                <div className="text-parchment-200/60">{k}</div>
                <div className="tabular-nums">{Math.round(Number(v))}</div>
              </div>
            ))}
          </div>
        </>
      ) : spot === 'crow' ? (
        <>
          {/*
            * 瞭望台报的是**甲板上看不见的三样**：
            *   ① 最近陆地（方位 + 海里，与 HUD 同源）；
            *   ② 能见度（`WEATHER_INFO[kind].visibility` —— 它本来就在影响港口发现半径，
            *      只是从来没露到界面上）；
            *   ③ 风（`weather.windDir` 是"风吹去"的罗盘方位，所以写"往…去"）。
            * 这三样都不是新算的：全部来自既有单一来源，瞭望台只是换了个**站得高**的出口。
            */}
          <div className="mt-1 text-sm">
            {sighting ? (
              <>
                最近的陆地在<span className="text-gold-300"> {bearingWord(sighting.relBearingDeg)}</span>
                <span className="ml-1 text-parchment-200/70">
                  {sighting.distNm.toFixed(1)} 海里 · {sighting.port.nameCn}
                </span>
              </>
            ) : (
              <span className="text-parchment-200/70">四下皆是海 —— 视野里没有一片陆地</span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded border border-white/10 px-2 py-1">
              <div className="text-parchment-200/60">能见度</div>
              <div className="tabular-nums">
                {WEATHER_INFO[weather.kind]?.label ?? '—'}
                <span className="ml-1 text-parchment-200/60">
                  {Math.round((WEATHER_INFO[weather.kind]?.visibility ?? 1) * 100)}%
                </span>
              </div>
            </div>
            <div className="rounded border border-white/10 px-2 py-1">
              <div className="text-parchment-200/60">风</div>
              <div className="tabular-nums">
                往{compassWord(weather.windDir)}去
                <span className="ml-1 text-parchment-200/60">{Math.round(weather.windSpeed)} 节</span>
              </div>
            </div>
          </div>
          <div className="mt-2 text-xs text-parchment-200/70">
            {next.suggest
              ? <>下一站 <span className="text-gold-300">{next.suggest.nameCn}</span>
                  {next.suggest.distanceNm != null && <> · {Math.round(next.suggest.distanceNm)} 海里</>}
                  {next.days != null && <> · 约 {next.days} 天</>}
                </>
              : '航路还没定 —— 回海图挑一处目的地'}
          </div>
          <div className="mt-1 text-xs leading-snug text-parchment-200/60">
            爬到这里，舷墙就挡不住视线了。能见度与风都不是新数：前者本来就决定你能在多远
            发现港口，后者决定这趟要走几天。
          </div>
        </>
      ) : (
        <>
          <div className="mt-1 text-sm">
            {next.suggest ? (
              <>
                下一站 <span className="text-gold-300">{next.suggest.nameCn}</span>
                {next.suggest.distanceNm != null && (
                  <span className="ml-2 text-xs text-parchment-200/70">
                    {Math.round(next.suggest.distanceNm)} 海里
                  </span>
                )}
                {next.days != null && (
                  <span className="ml-2 text-xs text-parchment-200/70">约 {next.days} 天</span>
                )}
              </>
            ) : (
              <span className="text-parchment-200/70">航路还没定 —— 回海图挑一处目的地</span>
            )}
          </div>
          <div className="mt-2 text-xs text-parchment-200/70">
            第 {fleet.day} 天 · {fleet.isSailing ? '航行中' : '系泊'}
            {fleet.currentPortId != null && (
              <> · {ports.find((p) => p.id === fleet.currentPortId)?.nameCn ?? ''}</>
            )}
          </div>
          <div className="mt-1 text-xs leading-snug text-parchment-200/60">
            舵轮只报读数：真正的航向在海图的「出航计划」里定，这里转不动它。
          </div>
        </>
      )}
    </div>
  )
}

/**
 * 船上视角的层级：压过底栏(40)/时间轴(50)/通知(60)的前一层，
 * 但**让位给通知与事件卡**——船上有海况，事件卡必须还能弹出来。
 */
const Z_DECK = 62

/**
 * 分段式 sRGB 编码（**船上视角的两个自定义着色器现在不用它**，留作参考）。
 *
 * 【为什么不再自己编码】第 66 轮查清了一条老账：船上视角接上后处理之后，画面
 * 先渲进**线性 HalfFloat** 的 RT，再由 `post.ts` 的合成 pass 统一做 srgbEncode。
 * 而天空/海面着色器当时**自己也编码了一遍** —— 双编码把 0.15 的线性值推到 0.68
 * （168/255），于是"海面永远是灰白的、天空永远发白"：这不是调参能救的，
 * 调 uSky 只能把双编码后的结果从 0.68 拉到 0.6。去掉自编码之后，uniform 里的
 * 线性颜色才等于最终显示色（正午海面实测从 135/155/168 落到 ~70/95/115）。
 *
 * 【为什么不用 three 的 colorspace_fragment】那个 chunk 在 ShaderMaterial 里
 * 生成的是纯 gamma 1/2.2，而画布是分段式 sRGB：暗部会差 7/255。
 */
const SRGB_ENCODE = /* glsl */ `
vec3 srgbEncode(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(hi, lo, vec3(lessThanEqual(c, vec3(0.0031308))));
}
`

export default function DeckView() {
  const hudRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  /*
   * 甲板行走开关。
   *
   * 【为什么用 ref + 一个只读 state】effect 的依赖是 `[open]`：把 walking 放进
   * 依赖会让整个 3D 场景（船的几何、雨、岸线）在切换时重建一次 —— 那是几百毫秒
   * 的黑屏。ref 存"真正生效的开关"，state 只负责让按钮文案与 HUD 重渲染。
   */
  const walkingRef = useRef(false)
  const [walking, setWalking] = useState(false)
  /*
   * 是否在船长室里。ref 给帧循环读（每帧都要判），state 只驱动 UI ——
   * 与甲板行走同一套写法：state 进 effect 依赖会重建整个场景。
   */
  const inCabinRef = useRef(false)
  const [inCabin, setInCabin] = useState(false)
  /*
   * 甲板上被点开的物件（舱口 / 舵轮）。null = 没点开。
   * 用 React state 而不是 ref：它要驱动一个 DOM 面板，跟 3D 场景重建无关。
   */
  const [spot, setSpot] = useState<null | 'hatch' | 'wheel' | 'crow'>(null)
  /*
   * 瞭望台面板要的"最近陆地"是在帧循环里每 8 帧算一次（与 HUD 同一次计算）。
   * 用 ref 存：面板打开的那一刻读到的就是**最新一次真实计算的结果**，
   * 不需要为了一个弹窗再跑一遍 haversine，也不会出现"HUD 与面板各算一遍"。
   */
  const sightingRef = useRef<CoastSighting | null>(null)
  /*
   * 帧循环里要读"下一站剩多少海里"，但 hook 不能在循环里调用 —— 每帧把最新的
   * `useVoyageNext()` 结果写进 ref。**里程仍然只有这一个来源**（不在这里另算
   * 大圆距离，否则海图上的线会和出航计划面板对不上）。
   */
  const nextRef = useRef<ReturnType<typeof useVoyageNext> | null>(null)
  /** 移动端方向键与键盘共用这一份状态（effect 里读、JSX 里写） */
  const keysRef = useRef({ f: false, b: false, l: false, r: false })
  const setWalk = (v: boolean) => {
    walkingRef.current = v
    setWalking(v)
    // 离开甲板行走时一并退出舱内，否则下次进来会"开在舱里"
    if (!v) {
      inCabinRef.current = false
      setInCabin(false)
    }
  }
  const open = useMapStore((s) => s.deckView)
  /*
   * 甲板物件面板要用的真实数据。全部走既有单一来源：
   *  · 载重/货/粮水士气 ← `fleet`（与交易面板同一个 store 字段）
   *  · 下一站港名/海里/天数 ← `useVoyageNext`（与出航计划、主屏指引同一个 hook）
   * 面板里**不允许自己再算一遍**里程或天数。
   */
  const fleet = useGameStore((s) => s.fleet)
  const weather = useGameStore((s) => s.weather)
  const next = useVoyageNext()
  nextRef.current = next
  const setDeckView = useMapStore((s) => s.setDeckView)
  const viewMode = useMapStore((s) => s.viewMode)
  const mountRef = useRef<HTMLDivElement>(null)

  // 快捷键：V 开/关，Esc 关
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'v' || e.key === 'V') {
        const { deckView, viewMode: vm } = useMapStore.getState()
        if (vm === 'harbor') return
        useMapStore.getState().setDeckView(!deckView)
      } else if (e.key === 'Escape' && useMapStore.getState().deckView) {
        useMapStore.getState().setDeckView(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const mount = mountRef.current
    if (!mount) return

    const width = mount.clientWidth || window.innerWidth
    const height = mount.clientHeight || window.innerHeight

    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })
    /*
     * 着色器编译失败时，three 默认只在 console 打印**出错行附近**的源码，看不到
     * 前面的声明是否真的进了编译单元。这里把完整的 shader 源码与 info log 存到
     * window 上 —— 排查"明明声明了却说 undeclared"这类问题只能靠它。
     */
    renderer.debug.onShaderError = (gl, _program, vs, fs) => {
      const dump = (shader: WebGLShader | null) => shader
        ? { log: gl.getShaderInfoLog(shader) || '', source: gl.getShaderSource(shader) || '' }
        : { log: '', source: '' }
      const w = window as unknown as { __shaderError?: unknown[] }
      w.__shaderError = [...(w.__shaderError ?? []), { vs: dump(vs), fs: dump(fs) }]
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
    renderer.setSize(width, height)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, width / height, 0.05, 400)
    camera.position.set(-2.5, 1.75, -4.3)
    // 注视点略高于水线：让船占画面中下部，天空留白给月亮
    camera.lookAt(-0.25, 1.15, 1.4)

    /*
     * ---- 月亮方向 ----
     * 与 2.5D 海图共用 `skyAt` 的日相，但这里**不跟随**主光的摆动：
     * 海图是俯视，光摆动看得出影子换边；这里镜头贴着水面，月亮应该稳稳挂在那。
     */
    /*
     * 月亮必须**在画面里**：它偏低、偏右前方，于是海面上的反光带从月亮脚下
     * 一路铺到镜头前——那是"月夜海面"最有说服力的一笔。
     * 第一版把月亮放在左上方画面外，结果只剩船尾一团无主的白光（实测截图）。
     */
    const moonDir = new THREE.Vector3(0.34, 0.20, 0.92).normalize()

    // ---- 天空：一个内表面球，渐变 + 月亮盘与光晕（不要贴图）----
    const skyGeo = new THREE.SphereGeometry(180, 32, 20)
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: SKY_ZENITH_NIGHT.clone() },
        uHorizon: { value: SKY_HORIZON_NIGHT.clone() },
        uMoonDir: { value: moonDir.clone() },
        uMoonColor: { value: MOON_COLOR.clone() },
        // 月亮亮度：白天该淡到只剩一个白盘，夜里才是光源（见 fragment）
        uMoonK: { value: 1 },
        uDusk: { value: 0 },
        uDuskColor: { value: DUSK_HORIZON.clone() },
        uFogK: { value: 0 },
        uDark: { value: 1 },
        uFogColor: { value: new THREE.Color(0xb4bdc2) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        uniform vec3 uMoonDir;
        uniform vec3 uMoonColor;
        uniform float uMoonK;
        uniform float uDusk;
        uniform vec3 uDuskColor;
        uniform float uFogK;
        uniform float uDark;
        uniform vec3 uFogColor;
        varying vec3 vDir;
        ${SRGB_ENCODE}
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -1.0, 1.0);
          // 地平线附近偏亮、天顶偏暗；下半个球压到海色，避免出现"天在下"
          vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
          col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.35, h));
          float m = max(dot(d, uMoonDir), 0.0);
          // 月亮：盘（~1.2°）+ 两圈光晕。加起来比贴图省一次采样
          // 盘：smoothstep 的下限决定直径。0.9994 对应 4°（屏幕上 60~80px，像太阳），
          // 0.9999 对应 1.6°（约 26px）——那才是一轮月亮
          /*
           * 地平线暖带：黄昏时只有贴着海平线的一条是橙的，天顶仍然冷。
           * 【为什么要单独一条带】只把 horizon 色往橙里混 25% 时，整片天是"灰紫"，
           * 看不出日落（实测截图）；真实黄昏的暖是**集中在低空**的，
           * 用 smoothstep 按仰角压成一条带，强度可以给足而不脏。
           */
          float band = smoothstep(0.30, 0.0, h);
          col = mix(col, uDuskColor, uDusk * 0.55 * band);
          col += uMoonColor * smoothstep(0.99988, 0.99994, m) * (0.10 + 2.10 * uMoonK);
          /*
           * 月亮的两圈光晕。指数越大半径越小：
           * 240/26 时外圈直径约 300px，夜里读成"月亮周围一大块灰白"（截图实测）；
           * 收到 300/70 之后外圈剩约 120px，剩下的柔光交给后处理的辉光去补 ——
           * 光晕画在天空里是**死的**（不随亮度变化），交给 bloom 才自然。
           */
          col += uMoonColor * pow(m, 300.0) * 0.16 * uMoonK;
          col += uMoonColor * pow(m, 70.0) * 0.030 * uMoonK;
          // 黄昏整体压暗：日落时天比白天暗，不压的话"黄昏"会亮成一盏粉灯
          col *= 1.0 - 0.30 * uDusk;
          /*
           * 雾：越低空越被灰白吃掉（天空整体变白是"浓雾"最直接的信号）。
           * 用仰角调制而不是整体混，否则天顶也会白成一块布。
           */
          col = mix(col, uFogColor, uFogK * (0.35 + 0.55 * smoothstep(0.45, 0.0, h)));
          col *= uDark;
          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `,
    })
    const sky = new THREE.Mesh(skyGeo, skyMat)
    // 命名：取色/遮挡巡检要按名字开关某一层做 A/B（与海图的 'map3d-sea' 同一约定）
    sky.name = 'deck-sky'
    sky.frustumCulled = false
    scene.add(sky)

    // ---- 星：固定屏幕尺寸的小点，只在上半球 ----
    const starCount = 420
    const starPos = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      // 均匀分布在上半球：cos 采样避免堆在极点
      const u = Math.random()
      const phi = Math.acos(0.06 + u * 0.94)
      const theta = Math.random() * Math.PI * 2
      const r = 170
      starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      starPos[i * 3 + 1] = r * Math.cos(phi)
      starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    const starMat = new THREE.PointsMaterial({
      color: 0xd9e4ff,
      size: 1.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    })
    const stars = new THREE.Points(starGeo, starMat)
    stars.frustumCulled = false
    scene.add(stars)

    // ---- 海面：Gerstner 顶点位移 + 月光镜面 + 距离淡出 ----
    // 与 deckWaves 共用同一组参数（船的姿态也从那里算，不允许两套）
    const seaGeo = new THREE.PlaneGeometry(140, 140, 200, 200)
    seaGeo.rotateX(-Math.PI / 2)
    const seaUniforms = {
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uMoonDir: { value: moonDir.clone() },
      uDeep: { value: SEA_DEEP_NIGHT.clone() },
      uSky: { value: SKY_HORIZON_NIGHT.clone().multiplyScalar(0.9) },
      uMoon: { value: MOON_COLOR.clone() },
      uMoonK: { value: 1 },
      uWaveScale: { value: 1 },
      uFogNear: { value: 28 },
      uFogFar: { value: 62 },
      uFogK: { value: 0 },
      uFogColor: { value: new THREE.Color(0xb4bdc2) },
      uDark: { value: 1 },
      uFoam: { value: 0.16 },
      uFoamLight: { value: 1 },
      /*
       * 开尔文波的三个人参：船首 z、船尾 z、强度。前两个是**世界坐标**（船在原点、
       * 船首朝 +z、半长 1.8 → 船首 0.83、船尾 −0.83），第三个由航迹强度给。
       */
      uBowZ: { value: 0.83 },
      uSternZ: { value: -0.83 },
      uWakeK: { value: 0 },
      uAmp: { value: DECK_WAVES.map((w) => w.amp) },
      uLen: { value: DECK_WAVES.map((w) => w.len) },
      uSteep: { value: DECK_WAVES.map((w) => w.steep) },
      uDir: { value: DECK_WAVES.map((w) => new THREE.Vector2(w.dir[0], w.dir[1]).normalize()) },
    }
    const seaMat = new THREE.ShaderMaterial({
      uniforms: seaUniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uFlow;
        uniform vec2 uDir[4];
        uniform float uAmp[4];
        uniform float uLen[4];
        uniform float uSteep[4];
        uniform float uWaveScale;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vCrest;
        void main() {
          vec3 p = position;
          vec3 nrm = vec3(0.0, 1.0, 0.0);
          for (int i = 0; i < 4; i++) {
            vec2 d = normalize(uDir[i]);
            float k = 6.2831853 / uLen[i];
            float c = sqrt(9.8 / k);
            float f = k * dot(d, p.xz) - c * uTime - uFlow * uTime;
            p.y += uAmp[i] * uWaveScale * sin(f);
            // 解析法线：与 deckWaves.deckWaveNormal 逐项对应（含 ampScale）
            nrm.x -= d.x * k * uAmp[i] * uWaveScale * cos(f);
            nrm.z -= d.y * k * uAmp[i] * uWaveScale * cos(f);
            nrm.y -= uSteep[i] * k * uAmp[i] * uWaveScale * sin(f);
          }
          vNormal = normalize(nrm);
          /*
           * 浪高（相对静水面，世界单位）传给片元：白沫只应该长在浪尖上。
           * 用**位移后的 y** 而不是法线：法线在缓坡上也很"平"，判不出浪尖。
           */
          vCrest = p.y;
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uMoonDir;
        /*
         * 值噪声（哈希 + 双线性 + smoothstep 插值）。只给"月光的碎光"用。
         * 为什么不用纹理：海面没有 uv（位置在顶点里算），而且 0.3 单位级的噪声
         * 用 4 个 sin 就够，省一张贴图的带宽与采样。
         */
        float hash21(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float vnoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
            u.y);
        }
        uniform vec3 uDeep;
        uniform vec3 uSky;
        uniform vec3 uMoon;
        uniform float uMoonK;
        uniform float uFogNear;
        uniform float uFogFar;
        uniform float uFogK;
        uniform vec3 uFogColor;
        uniform float uDark;
        uniform float uFoam;
        uniform float uFoamLight;
        uniform float uTime;
        uniform float uBowZ;
        uniform float uSternZ;
        uniform float uWakeK;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vCrest;
        ${SRGB_ENCODE}
        /*
         * 开尔文波 + 船尾尾迹的强度场（与 deckWake.kelvinStrength 同一套公式）。
         * 船首朝 +z、船在世界原点；船首之后是 z < uBowZ。
         * 两条 V 脊的判据是 |x|/d ≈ tan(19.47°) —— 这是开尔文波的理论半角，
         * 不是随手挑的斜率。
         */
        float wakeField(vec2 p) {
          float d = uBowZ - p.y;
          if (d <= 0.9 || uWakeK <= 0.01) return 0.0;
          float r = abs(p.x) / d;
          // 波脊（V 的两条边）：宽度 0.035 + 0.003d，收窄之后才像"脊"而不是"带"
          float w = 0.045 + 0.0035 * d;
          float ridge = exp(-pow((r - 0.354) / w, 2.0));
          float decay = exp(-d * 0.095);
          /*
           * V 形**内部**的横向波列：真实开尔文波不是两条线，而是两线之间一片
           * 有横向波纹的扰动区（波长几米、峰线大致平行于两条边）。
           * 用 d 与 |x| 的组合做一组斜向条纹，强度只有波脊的 1/4 —— 它给的是
           * "水被搅过"的质地，不是另一条亮线。
           */
          float inside = step(r, 0.354) * decay;
          float ripples = 0.5 + 0.5 * sin((d * 5.2 - abs(p.x) * 2.4) * 6.2831);
          float stern = p.y < uSternZ
            ? exp(-pow(abs(p.x) / (0.45 + 0.02 * (uSternZ - p.y)), 2.0)) * exp(-(uSternZ - p.y) * 0.03)
            : 0.0;
          return clamp((ridge * decay * 0.95 + inside * ripples * 0.22 + stern * 0.8) * uWakeK, 0.0, 1.0);
        }
        void main() {
          vec3 n = normalize(vNormal);
          vec3 v = normalize(cameraPosition - vWorld);
          // 菲涅尔：正视是深水，掠视反天光
          /*
           * 菲涅尔上限 0.82：相机贴着水面，**几乎整片海都是掠射角**，
           * 上限给 1.0 时每一处都混成天光色，海面读作"浅灰的地板"（正午截图）。
           * 留 18% 的深色底，近处才有水色、远处才反天光。
           */
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          /*
           * 【上限 0.70 而不是 0.82】这是"海为什么白得像天"的直接原因：
           * 相机贴着水面，20 米以外的海面几乎全是掠射角，菲涅尔接近 1，
           * 混进去的 82% 都是天光色；而天光色本身又亮，于是海面 = 天空
           * （实测正午 205/221/233 vs 天空 200/217/231，肉眼就是"一片白"）。
           * 真实的海即使在掠射角下也比天空暗一档、且更蓝（水体本身的吸收）。
           * 上限压到 0.70，配合 uSky 的压暗（见 JS 侧），才有水的分量。
           */
          vec3 col = mix(uDeep, uSky, clamp(fres * 1.05, 0.0, 0.55));
          // 月光镜面（Blinn-Phong 的高光半径收得很紧，海面才不会整片发白）
          /*
           * ---- 高光用的高频法线 ----
           * 网格 200×200 铺 140 单位，近处一格约 0.7 单位；月光高光半径收窄之后，
           * 每一格会被整块点亮，月光道读成"锯齿状的白折线"（实测截图）。这里在
           * **只影响镜面项**的法线上叠两组不成比例的正弦，把高光打碎成鳞片状碎光。
           * 注意：它只进高光，不动顶点位移，所以船不会浮在浪外，也不会变成布纹。
           */
          vec3 nn = n;
          /*
           * 【为什么从"两个正弦相加"改成"两个乘积"】
           * 相加的两个正弦在屏幕上是一条条**互相平行又能干涉的条纹**（波长约 1 单位
           * = 20 米），高光被它们切成一段段的波浪带 —— 实测夜航截图里月光道是一条
           * 边缘起伏的白绸带，读作"贴在水面上的一块布"。
           * 取**乘积**再叠三个互不成比例的方向（41.3/23.9/17.3 互质、波长 3~5 米），
           * 得到的是斑点状的亮点（正正得正、正负得负），高光碎成鳞片。
           * 幅度 0.055 也比原来的 0.035 大：指数 900 很窄，法线只晃 0.05 就足以
           * 让高光与浪错开，幅度再小就几乎看不出变化。
           */
          vec2 q = vWorld.xz;
          nn.x += (vnoise(q * 2.7) - 0.5) * 0.075 + (vnoise(q * 7.1 + 13.0) - 0.5) * 0.035;
          nn.z += (vnoise(q * 2.7 + 41.0) - 0.5) * 0.075 + (vnoise(q * 7.1 + 71.0) - 0.5) * 0.035;
          nn = normalize(nn);
          vec3 h = normalize(uMoonDir + v);
          /*
           * 月光镜面：指数收到 420、强度 0.85。
           * 第一版 220 / 1.6 的结果是一团**贴着船尾的白斑**（浪脊恰好满足
           * 反射角时整块过曝），读作探照灯而不是月光。收窄之后它才是一条
           * 随浪闪的碎光带。
           */
          /*
           * 月光反射只在夜里出现：白天太阳在天上，海面不该有一条"月色大道"。
           * 第一版没乘 uMoonK，正午截图里那条白亮带横贯海面，读作"水面反光过曝"。
           */
          /*
           * 指数 420 → 900、强度 0.45 → 0.34：月光道原来是**锯齿状的大块白**，
           * 因为 200×200 的网格在近处每格约 0.7 单位，宽高光会把每一格都点亮成
           * 一个多边形（实测截图：像一条折线的路）。收窄高光半径，碎光才像水面上
           * 的鳞片，剩下的柔光交给后处理辉光。
           */
          /*
           * 【为什么还要乘一个噪声门】只抖法线时，月光道是"一整条被揉皱的带子" ——
           * 几何网格一格 0.7 单位（14 米），相邻几格的法线都接近镜面角，高光连成片。
           * 真实的水面是**一块块独立的小镜面**，有亮有暗、中间会断。
           * 乘一个 0.2~1.8 的噪声门，高光才被切成一颗颗独立的亮点（中间真的暗下去，
           * 不是"蒙了一层灰"）。
           */
          float gate = 0.2 + 1.7 * vnoise(vWorld.xz * 3.6 + 7.0);
          /*
           * ---- 波脊参与高光 ----
           * 开尔文波的 V 脊是**水面被压出的一道凸起**，它的法线更陡，所以月光在
           * 那上面会成片地亮起来（真实照片里夜航船的船首波是一条发亮的 V）。
           * 只做"亮度加法"是不够的：那看起来像画上去的白线；把强度乘进镜面项，
           * 高光才会沿着波脊碎成一片 —— 与月光道用的是同一套碎光。
           */
          float kwSpec = wakeField(vWorld.xz);
          float spec = pow(max(dot(nn, h), 0.0), 900.0) * gate * (1.0 + kwSpec * 2.6);
          col += uMoon * spec * 0.34 * uMoonK;
          // 浪脊的微弱提亮：让相邻浪面之间有层次，不然海面是一块布
          col += uSky * clamp(n.y - 0.985, 0.0, 1.0) * 0.35;
          /*
           * ---- 浪脊的散射（夜里的 V 才看得见）----
           *
           * 【为什么必须有这一项】上面那条开尔文波脊只乘在**镜面项**里
           * （1.0 + kwSpec*2.6）。这本身是对的：脊是凸起，法线更陡，月光在那上面
           * 会成片亮起来。但镜面只在**月光道**里才有值 —— 于是落在道外的波脊
           * 亮度**恒等于零**。冻住场景时间做 A/B 差分（.workbuddy/kelvin-probe.mjs）
           * 量得很清楚：整片水域里唯一的变化就是月光道上那几块碎光，道外一个像素
           * 都没变。也就是说"船在切水"这件事在夜里只发生在月亮照到的那一小条上。
           *
           * 【为什么加的是月光色而不是白色】翻滚的水（白沫、碎浪）会把**周围的光**
           * 散回来，夜里那点光就是月光 + 天光。用 uMoon 染色的散射，比加纯白
           * 更像"被搅起来的水"；系数 0.055 是量出来的：低于 0.03 在暗处看不出来，
           * 高于 0.09 会读成一条画上去的白线（这两头都在第 82 轮帆透光上踩过）。
           * 噪声门（0.35~1.0）让它断成一段段 —— 连续的一条弧线一眼就假。
           */
          float foamGate = 0.35 + 0.65 * vnoise(vWorld.xz * 3.1 + 5.0);
          /*
           * 必须乘 uMoonK：白天月亮在地下，这一项要跟着镜面一起消失 ——
           * 否则正午的尾迹会带一条发蓝的亮带（镜面那一项踩过同一个坑）。
           *
           * 【系数是量出来的】冻住 performance.now 到同一帧，只改这一项的系数、
           * 跑两次差分（.workbuddy/kelvin-probe.mjs）：亮度 >30 的像素从 4.10%
           * 涨到 5.11%，全屏均值 +0.29；256 级里没有一个像素到 250（不过曝）。
           */
          col += uMoon * kwSpec * 0.055 * foamGate * uMoonK;
          // 远处收到天光色：与天空球的地平线接上，不出现一条硬边
          float d = length(vWorld.xz);
          /*
           * 远处混天光：晴天的起点是 28~62，浓雾时收到 6~24（只看得到船头）。
           * 用 uniform 而不是写死，是因为雾天必须让"海面尽头"提前消失 ——
           * 否则海与天的分界线还清清楚楚，与"能见度 100 米"自相矛盾。
           */
          /*
           * 远处混的是**雾色**，不是天光色。
           * 第一版只把 smoothstep 的区间收窄、目标色仍用 uSky（天蓝），结果浓雾天
           * 海面远处变成"更蓝的天"，整张图看起来只是"天气变晴了"（实测截图：
           * fogNear=7.9 生效，画面却毫无变化）。雾必须自己有一个颜色。
           */
          vec3 farCol = mix(uSky * 0.85, uFogColor, uFogK);
          col = mix(col, farCol, smoothstep(uFogNear, uFogFar, d));
          /*
           * ---- 开尔文波（船首 V 脊）与船尾尾迹 ----
           * 【为什么在雾之前算】波脊是水面上的浅浮雕，它应该随雾一起退掉；
           * 放在雾之后会变成"雾里两道亮线"（与船体自身的雾化不一致）。
           * 强度乘 uFoamLight：夜里波脊不该是白的（月光下的波脊只是比周围亮一档）。
           */
          {
            float kw = kwSpec;
            /*
             * 【必须打碎】第一版直接按强度加亮，两条波脊是**两条连续的灰白带**，
             * 读作拖拉机履带（实测截图）。真实波脊被浪与风打断成一段段。
             * 用与月光碎光同一个值噪声调幅（0.2~1.3），它才"断得开"。
             * 亮度也压到 0.42：波脊只是比周围亮一档，不是白色。
             */
            kw *= 0.35 + 1.0 * vnoise(vWorld.xz * 2.6 + 11.0);
            col += vec3(0.48, 0.55, 0.60) * kw * 0.5 * uFoamLight;
          }
          /*
           * ---- 浪尖白沫 ----
           * 没有白沫的海面读作"一块会动的塑料"：浪有形状、没有碎裂。
           * 这里只用一条便宜的近似：位移高的地方起沫，再用两组世界坐标的正弦
           * 把沫打碎成条带（不是均匀的一层白霜）。uFoam 由天气给（晴天 0.16、
           * 暴雨 0.5），所以风暴天海面自己会"翻白"。
           */
          /*
           * 【尺度是这里唯一的难点】第一版用两组正弦相乘打碎白沫：波长 2π/9.1 ≈ 0.69
           * 世界单位 = **14 米见方**，于是整片海是一块块灰蓝的大斑（实测截图：像水
           * 面上的油污，而不是白沫）。沫的物理尺度是几米，而且只长在**接近破碎的
           * 浪尖**上 —— 所以这里做两件事：
           *   ① 阈值抬到 0.80~1.06（原来 0.62 起）：只有浪峰才有沫；
           *   ② 用哈希值噪声（波长 1/7 单位 ≈ 2.9 米）打碎，而不是正弦。
           * 代价是又一个 vnoise 采样（4 个 hash）—— 海面片元总共约 24 个 sin，可接受。
           */
          float crestK = clamp(vCrest / 0.13, 0.0, 1.5);
          float fn = vnoise(vWorld.xz * 7.0 + 3.0);
          float foam = smoothstep(0.80, 1.06, crestK) * smoothstep(0.42, 0.78, fn);
          /*
           * 【白沫必须跟着光照走】第一版把白沫直接加到颜色上，结果夜里海面整片发白
           * （实测截图：黑天 + 淡灰色的海，像结冰）—— 沫是漫反射，不是自发光。
           * uFoamLight 由日相给（白天 1、夜里 0.18），天越黑沫越沉。
           */
          // 沫本身要更白一点（0.86/0.90/0.92）：面积小了，靠对比度才读得出"浪碎了"
          col += vec3(0.86, 0.90, 0.92) * foam * uFoam * uFoamLight;
          col *= uDark;
          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `,
    })
    const sea = new THREE.Mesh(seaGeo, seaMat)
    sea.name = 'deck-sea'
    sea.frustumCulled = false
    scene.add(sea)

    /*
     * ---- 船 ----
     * 换成按"放样 + 帆装 + 索具"重建的模型（见 shipModel.ts）：船壳有舷弧与收分、
     * 甲板有板缝、帆会鼓着呼吸、索具把桅杆连起来，还有船尾楼的窗光与吊灯笼。
     * 它的原尺度是半长 18（总长 36），这里缩到场景里 0.05 → 约 1.8 单位。
     */
    const deckShip: DeckShip = createDeckShip()
    deckShip.group.scale.setScalar(0.05)
    scene.add(deckShip.group)
    const ship = deckShip.group

    /*
     * ---- 近岸 ----
     * 远洋时整组隐藏；进入 42 海里内按"最近港口"摆一条山脊 + 灯塔 + 沿岸窗光。
     * 它解决的是这个视角唯一的地理问题：**船到岸了没有**。没有它，深海与
     * 停在塞维利亚港里的画面一模一样。
     */
    const coast = createDeckCoast()
    scene.add(coast.group)

    /*
     * ---- 靠港近景：那座城 ----
     * `coast` 给的是"一条有灯塔的海岸"——它对**所有港口**都一样，停在塞维利亚与
     * 停在荒岛看不出区别。这一层补上只有港口才有的东西：防波堤、码头、栈桥、
     * 成排的房子、停泊的商船、吊货臂架、旗。样式按海域分四套（红瓦石堤 / 木棚茅顶 /
     * 木构青瓦 / 平顶土屋），近看剪影就知道到了哪片海。
     */
    const harbor: DeckHarbor = createDeckHarbor()
    scene.add(harbor.group)
    // 取证句柄：巡检要能量岸线的可见性/坐标（与海图的 __map3d 同一做法）
    ;(window as unknown as { __deckScene?: THREE.Scene }).__deckScene = scene
    ;(window as unknown as { __deckCam?: THREE.Camera }).__deckCam = camera
    ;(window as unknown as { __THREE?: unknown }).__THREE = THREE

    /*
     * ---- 雨 ----
     * 位置更新在顶点着色器里算（见 rainLayer），CPU 只改两个 uniform。
     * 整层跟着相机走，所以船开到哪都在"雨里"。
     */
    const rain = createDeckRain(6000)
    scene.add(rain.mesh)

    /*
     * ---- 海鸟（近岸时出现）----
     *
     * 每只鸟 = 2 段线（一个浅浅的 V 字），12 只一共 48 个顶点，逐帧在 CPU 上写。
     * 【为什么用线不用网格】20 单位（400 米）外的一只 2 米翼展的海鸟只有几个像素，
     * 这时候"两根斜线构成的 V"就是它真实的样子；给两只三角面反而会因为面朝不对
     * 而闪。线不受光、不受雾，颜色固定为深灰——它在画面里永远是剪影。
     *
     * 数量、方位、出现时机全部来自 `deckBirds` 的纯函数（可单测），这里只负责抄顶点。
     */
    const birdPos = new Float32Array(BIRD_MAX * 4 * 3)
    const birdGeo = new THREE.BufferGeometry()
    birdGeo.setAttribute('position', new THREE.BufferAttribute(birdPos, 3))
    const birdMat = new THREE.LineBasicMaterial({
      color: 0x161a1d, transparent: true, opacity: 0, depthWrite: false,
    })
    const birds = new THREE.LineSegments(birdGeo, birdMat)
    birds.name = 'deck-birds'
    birds.frustumCulled = false
    scene.add(birds)

    /*
     * ---- 天气状态（平滑趋近）----
     * 天气按天切换，直接跳会让雨"啪"地满、浪瞬间翻倍、船猛地一抬。
     * 用 index 里那套"按天"的 weather.kind 作为目标值，1.5 秒走完 90%。
     */
    let look: DeckWeatherLook = deckWeatherLook(useGameStore.getState().weather?.kind)
    let lastWeatherKind: string = useGameStore.getState().weather?.kind ?? 'clear'
    let boltAge = 99
    let boltCooldown = 1.5

    // ---- 光：月光主光 + 极低环境（夜里靠月亮，不靠补光）----
    const moon = new THREE.DirectionalLight(0xbfd6ff, 2.1)
    moon.position.copy(moonDir).multiplyScalar(30)
    scene.add(moon)
    const ambient = new THREE.AmbientLight(0x223347, 0.55)
    scene.add(ambient)
    /*
     * ---- 半球光：专治"甲板极掠射角发黑" ----
     * 甲板是**朝上**的面，而月亮压在低空（`moonDir.y≈0.2`），入射角接近 90°，
     * 漫反射只拿到 cos≈0.2 的能量；站到甲板上时脚边一片黑，木纹全丢
     * （实测截图：甲板读作一块深棕色的布）。真实世界里这些光来自天空本身。
     * 半球光按法线朝向给两种环境色（朝上取天光、朝下取船体反光），
     * 不加方向性、不改变"月光从哪来"的判断，是最省的一种补光。
     */
    const hemi = new THREE.HemisphereLight(0x36495f, 0x2b1c10, 0.55)
    scene.add(hemi)
    /*
     * ---- 补光（"站在船上"的那一侧）----
     * 月亮在船头前方，于是我们看到的帆与船尾全是背光面 —— 只吃环境光就是一团黑
     * （实测截图：船只剩剪影，帆的织纹、舷墙、索具都看不见）。
     * 真实拍摄里这时会在摄影机侧加一盏柔光；这里放一盏很弱的冷色平行光，
     * 位置在镜头后方偏上，只负责"让结构读出来"，不改变夜的方向感。
     * 这条与对方 spec 里的 deckFill 是同一个思路，只是我们用冷色（月亮的光是冷的）。
     */
    const fill = new THREE.DirectionalLight(0x9db6cf, 0.85)
    fill.position.set(-6, 4, -7)
    scene.add(fill)
    /*
     * 补光的颜色要跟着日相变：夜里它是"月亮的散射"（冷蓝），白天它是"天光"
     * （暖白）。固定冷蓝时，正午的帆与船壳被染成灰绿（实测截图：帆是一块
     * 土灰色的布），整条船读作"阴天的模型"。
     */
    const FILL_NIGHT = new THREE.Color(0x8fa8c2)
    const FILL_DAY = new THREE.Color(0xffeccc)

    // 后处理（辉光）：用海图那一份实现，参数共享一套
    const post: Map3DPost = createMap3DPost(renderer)
    /*
     * 船上视角的辉光要另调两个数：
     *  · 阈值 0.78（海图是 0.45）：这里的"亮部"包括**海面的月光反射带**
     *    （线性 0.5~0.9），用 0.45 会把整条反光带捞进去、模糊后叠成一条白公路。
     *  · 强度 0.45（海图 0.62）：镜头贴着水面，光斑在画面里占的比例大得多。
     */
    post.setThreshold(0.78)
    post.setBloom(0.38)
    // 取证句柄：探针要能开/关辉光做同帧 A/B
    ;(window as unknown as { __deckPost?: unknown }).__deckPost = post
    /*
     * 港口的取证句柄：e2e 直接读布局（几栋房、几条栈桥、哪种样式），
     * 不去数屏幕上的色块——"看起来有一排房子"无法判定，数字可以。
     */
    ;(window as unknown as { __deckHarbor?: () => unknown }).__deckHarbor = () => harbor.debug()
    // 取证句柄：着色器编译失败时只有拿到 renderer 才能读 programs 的 diagnostics
    ;(window as unknown as { __deckRenderer?: unknown }).__deckRenderer = renderer

    /** 上一帧算出的"海面该反射的天光色"（含一点黄昏暖），给 uSky 用 */
    const lastSeaSky = new THREE.Color()

    // ---- 尺寸 ----
    const onResize = () => {
      const w = mount.clientWidth || window.innerWidth
      const h = mount.clientHeight || window.innerHeight
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    /*
     * ---- 甲板行走的输入状态 ----
     * effect 内部的普通变量：切换甲板行走不该重建场景，所以不放进 React state。
     */
    // 朝船头：船体局部 +z 是船首，所以 yaw=0 就朝船头
    const viewRef = { current: { yaw: -0.05, pitch: -0.06 } }
    /*
     * 初始位置：**前桅右前方、略偏右舷**（x=1.4, z=9.5，米），视角略微低头、
     * 朝向船首偏右 20°。
     *
     * 试过三处：船尾楼前沿（z=−11.5）后桅帆压头顶；主桅与前桅之间（z=6.5）
     * 与船首（z=13.2）都只剩海 —— 前者被帆挡、后者船首结构在视野下边缘之外，
     * 第一眼像"站在海面上"。这一档能同时看到甲板、前桅的索具、舷墙与右前方的海。
     */
    /*
     * 初始机位：主桅**后方** 6 米、略偏右舷，朝正前方。
     * 试过的五个机位（`.workbuddy/probe-deck-frames.mjs` 一次拍完）：
     *   A 前桅右前（原默认）：主桅贴着画面中轴，除了甲板只有一根黑柱子；
     *   C 船首回望：下帆挡住整个上半屏；
     *   E 右舷侧看：只有甲板与海，看不到船的结构；
     *   D 主桅后方朝前 ← 现在这一档：甲板成透视带、主桅在画面中轴、下帆在头顶、
     *     舷墙与船首外海岸（塞维利亚的灯塔）都在框里，一眼知道"我站在一条船上"。
     */
    /** 上一次的航向目标（用来判断"改航向了"）与舵轮脉冲 */
    let lastWpKey = ''
    let helmPulse = 0
    let helmSign = 1
    let lastBearing: number | null = null
    let walkPos: WalkPos = { x: 1.55, z: -5.2 }
    /*
     * 取证/调试句柄：甲板行走的位置与朝向原本是 effect 里的闭包变量，外面读不到，
     * 于是"换个机位看看"只能改代码重跑一次（一轮 50 秒）。
     * 现在巡检脚本可以 `__deckWalk.set({z:2})` 连拍几个机位做构图对比；
     * `get()` 同时给 e2e 断言用（相机确实站在甲板上、确实在动）。
     */
    ;(window as unknown as { __deckWalk?: unknown }).__deckWalk = {
      get: () => ({ x: walkPos.x, z: walkPos.z, ...viewRef.current, walking: walkingRef.current }),
      set: (p: { x?: number; z?: number; yaw?: number; pitch?: number }) => {
        if (typeof p.x === 'number') walkPos.x = p.x
        if (typeof p.z === 'number') walkPos.z = p.z
        if (typeof p.yaw === 'number') viewRef.current.yaw = p.yaw
        if (typeof p.pitch === 'number') viewRef.current.pitch = p.pitch
        return { x: walkPos.x, z: walkPos.z, ...viewRef.current }
      },
    }
    let bobPhase = 0

    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (!walkingRef.current) return
      const k = e.key.toLowerCase()
      const set = (name: 'f' | 'b' | 'l' | 'r') => {
        keysRef.current[name] = down
        e.preventDefault()
      }
      if (k === 'w' || k === 'arrowup') set('f')
      else if (k === 's' || k === 'arrowdown') set('b')
      else if (k === 'a' || k === 'arrowleft') set('l')
      else if (k === 'd' || k === 'arrowright') set('r')
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f') {
        setWalk(!walkingRef.current)
        return
      }
      onKey(e, true)
    }
    const onKeyUp = (e: KeyboardEvent) => onKey(e, false)

    /*
     * 转头的拖拽：不用 Pointer Lock（那会让 Esc 行为变得不可控，且移动端没有）。
     * 灵敏度 0.0032 rad/px —— 手拖 300px 约转 55°。
     */
    let dragging = false
    let lastX = 0
    let lastY = 0
    /** 按下时的屏幕位置：用来区分"拖拽转头"与"点物件" */
    let downX = 0
    let downY = 0
    const picker = new THREE.Raycaster()
    picker.params.Line.threshold = 0
    const onPointerDown = (e: PointerEvent) => {
      if (!walkingRef.current) return
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      downX = e.clientX
      downY = e.clientY
      ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || !walkingRef.current) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      viewRef.current.yaw -= dx * 0.0032
      // 俯仰钳在 ±75°：翻过来会看到船体内部
      viewRef.current.pitch = Math.max(-1.3, Math.min(1.3, viewRef.current.pitch - dy * 0.0032))
    }
    /*
     * 松手时才判断"这是点击还是拖拽"：位移小于 6px 才算点击。
     * 【为什么不在 pointerdown 里捡】甲板行走同时用指针转头，如果按下就判定点击，
     * 每次转头都会顺手点开一个面板（拖拽的第一帧位移为 0，必然命中）。
     */
    const onPointerUp = (e: PointerEvent) => {
      const wasDragging = dragging
      dragging = false
      if (!wasDragging || !walkingRef.current) return
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return
      const rect = renderer.domElement.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      picker.setFromCamera(
        new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      )
      /*
       * 三个可点的东西：舱口 / 舵轮 / 桅顶瞭望台。
       * 注意拾取的是 `ship.children` 的**递归**结果（`intersectObjects(..., true)`），
       * 三件东西都在各自的 group 里，只传直接子节点会一个也点不到。
       */
      /*
       * 一次拾取决定三件事：开面板（舱口/舵轮/瞭望台）、进舱、还是什么都不做。
       *
       * 【为什么必须取"最近的命名物"】门在舵轮正后方 1.1 米。第一版先 `find` 门名、
       * 再找热点 —— 于是点**舵轮**时，射线穿过舵轮命中了后面的门，人被传送进舱里，
       * 舵轮面板永远打不开（e2e 当场炸掉三条）。
       * 现在合成一张表，取 `hits` 里**第一个**在表里的对象：谁近听谁的。
       */
      const hits = picker.intersectObjects(ship.children, true)
      const ACTIONS: Record<string, 'hatch' | 'wheel' | 'crow' | 'enter' | 'exit'> = {
        'ship-hatch': 'hatch',
        'ship-wheel': 'wheel',
        'ship-crow': 'crow',
        'ship-cabin-door': 'enter',
        'ship-cabin-inner-door': 'exit',
      }
      const first = hits.find((h) => ACTIONS[h.object.name] != null)
      const action = first ? ACTIONS[first.object.name] : null
      if (action === 'enter' || action === 'exit') {
        /*
         * 点**外**门（船尾楼正面那扇）→ 进舱；点**内**门（舱里那扇）→ 出舱。
         * 第一版把这一条写反了（`inside = name === 'inner'`），于是"点门进舱"变成了
         * "点门把自己放到门外一步的地方" —— 看不出错，只是永远进不去。
         */
        const inside = action === 'enter'
        inCabinRef.current = inside
        setInCabin(inside)
        const tgt = inside ? CABIN_ENTER : CABIN_EXIT
        walkPos.x = tgt.x
        walkPos.z = tgt.z
        viewRef.current.yaw = tgt.yaw
        viewRef.current.pitch = tgt.pitch
        setSpot(null)
        return
      }
      setSpot(action ?? null)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    renderer.domElement.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    // ---- 帧循环 ----
    let raf = 0
    let frame = 0
    let tPrev = performance.now() / 1000
    const tick = () => {
      frame++
      const t = performance.now() / 1000
      // dt 钳在 0.1 秒：切后台回来时一帧可能是几十秒，会让平滑一步跳完
      const dt = Math.min(0.1, Math.max(0, t - tPrev))
      tPrev = t
      const st = useGameStore.getState()
      const skyInfo = skyAt(performance.now(), st.routeProgress ?? 0)
      const night = 1 - skyInfo.lit

      // 天与海随日相：白天亮、夜里暗，但夜里也不关灯（沿用海图的口径）
      seaUniforms.uTime.value = t
      // 航速：停泊时海面几乎不动，航行时浪向后跑
      const sailing = st.fleet.isSailing
      seaUniforms.uFlow.value = sailing ? 0.55 + (st.simSpeed ?? 1) * 0.55 : 0.06
      const lightMul = 0.42 + 0.58 * skyInfo.lit
      moon.intensity = 2.1 * lightMul
      // 雾里看不到月亮：下面那处再乘一次 (1 − 雾)
      skyMat.uniforms.uMoonK.value = 0.06 + 0.94 * night
      /*
       * 补光也要跟着日相：白天船体在阳光下不该是全黑的。
       * 实测（停泊白昼截图）：fill 固定 0.85 时船壳与帆接近纯黑，
       * 只剩轮廓——那是夜里的样子，白天需要更实的形体。
       */
      /*
       * 去掉双重 sRGB 编码之后，同样的灯光参数看起来亮了一大截（甲板成了平涂的
       * 橘色），但第一版"降 30%"又矫枉过正：正午甲板读成一块深巧克力色、舷墙内侧
       * 全黑（实测截图）。这组数是第三次校：白天 fill 1.85 / ambient 0.56 /
       * hemi 0.48 —— 比"平涂"那次低一点，比"过暗"那次高四成。
       */
      fill.intensity = 0.5 + 1.35 * skyInfo.lit
      fill.color.copy(FILL_NIGHT).lerp(FILL_DAY, skyInfo.lit)
      ambient.intensity = 0.26 + 0.30 * skyInfo.lit
      /*
       * 半球光夜里给得多、白天给得少：白天有方向光（fill 涨到 1.7），
       * 再叠一层环境光会把船壳照成平涂；夜里则需要它撑住甲板的可读性。
       */
      hemi.intensity = 0.72 - 0.24 * skyInfo.lit

      /*
       * ---- 天气：平滑趋近 + 分发到四处 ----
       * 雨量、雾、浪高、压暗、闪电频率全部来自 `deckWeatherLook(kind)` 这一张表，
       * 这里的职责只是"把表里的数送到该去的地方"。天气种类变了不做任何动画切换，
       * 由 approachLook 自己用 1.5 秒的指数趋近消化。
       */
      {
        const kind = st.weather?.kind ?? 'clear'
        if (kind !== lastWeatherKind) lastWeatherKind = kind
        look = approachLook(look, deckWeatherLook(kind), dt)

        /*
         * 海面的浪高必须与船的姿态用同一个倍数，否则船会浮在浪外。
         * `calm` 在港内把两者一起压下去（防波堤里的水本来就该平，见 harborCalm）；
         * 因为改的是**同一个** ampScale，船与水面不会各说各话。
         */
        const sight = sightingRef.current
        const calm = sight ? harborCalm(sight.distNm, st.fleet.isSailing) : 1
        seaUniforms.uWaveScale.value = look.wave * calm
        // 雾：把"远处混天光"的起点收近
        seaUniforms.uFogNear.value = 28 - 22 * look.fog
        seaUniforms.uFogFar.value = 62 - 38 * look.fog
        const dark = 1 - 0.45 * look.darken
        seaUniforms.uDark.value = dark
      /*
       * 白沫随天候涨：晴天只在浪尖有一点点（0.16），暴雨整片翻白（0.5）。
       * 与浪高同源（look.wave），所以"浪大"与"沫多"不会各说各话。
       */
      seaUniforms.uFoam.value = 0.12 + 0.34 * look.darken * look.wave
      seaUniforms.uFoamLight.value = 0.18 + 0.82 * (1 - night)
      /*
       * 开尔文波：船首/船尾的世界 z 取船的**实际**位置（船在原点，但船首随船长
       * 与 SHIP_SCALE 决定），强度与船壳上的白沫同源（`wakeStrength`）——
       * 系泊时 0.26（只有极淡的一点），航行时涨到 1。
       */
      const halfLenWorld = SHIP_HALF_LENGTH * SHIP_SCALE
      seaUniforms.uBowZ.value = halfLenWorld * 0.92
      seaUniforms.uSternZ.value = -halfLenWorld * 0.88
      seaUniforms.uWakeK.value = wakeStrength(
        st.fleet.isSailing,
        (st.fleet.ships.find((x) => x.id === st.fleet.flagshipId) ?? st.fleet.ships[0])?.speed ?? 0,
      )
      seaUniforms.uFogK.value = look.fog
      seaUniforms.uFogColor.value.copy(skyMat.uniforms.uFogColor.value)
        skyMat.uniforms.uDark.value = dark
        skyMat.uniforms.uFogK.value = look.fog * 0.9
      // 雾与厚云都会遮月亮：暴雨夜里那轮月亮应该只剩一个模糊的亮斑
      skyMat.uniforms.uMoonK.value *= (1 - look.fog) * (1 - 0.55 * look.darken)

        rain.setAmount(rainDropCount(look, 6000))
        rain.update(t, camera.position.x, camera.position.z)
        // 雨的倾斜与风向同源：风向 90°（吹向东）时雨往 +x 斜
        const tilt = look.tilt + rainTiltFromWind(st.weather?.windDir ?? 0, st.weather?.windSpeed ?? 0)
        // tilt 通过 uniform 传进雨层（setAmount 内部只改 opacity/drawRange）
        ;(rain.mesh.material as THREE.ShaderMaterial).uniforms.uTilt.value = tilt

        // 闪电：按频率随机会触发一次，之后 0.6 秒衰减
        boltAge += dt
        boltCooldown -= dt
        if (look.lightning > 0.01 && boltCooldown <= 0) {
          boltAge = 0
          // 间隔用指数分布（泊松过程），看起来才不像节拍器
          boltCooldown = Math.max(0.6, -Math.log(1 - Math.random()) / look.lightning)
        }
      }
      const flashK = look.lightning > 0.01 ? lightningEnvelope(boltAge) : 0
      if (flashRef.current) flashRef.current.style.opacity = String(flashK * 0.55)
      // 闪电照亮整片海：环境光与月光各提一档，画面才有"被闪到"的感觉
      if (flashK > 0.01) {
        ambient.intensity += flashK * 1.6
        fill.intensity += flashK * 1.2
      }

      /*
       * 【吃水：船必须坐在水里，不能"泡"在水里】
       * 模型的水线在 y=0、甲板 1.32（模型米）—— 相当于 36 米长的船只有 1.3 米干舷，
       * 而海面的涌浪在这里是 ±0.13 世界单位（= ±2.6 模型米）。于是浪峰一过就把
       * 甲板淹掉：站到甲板上时，脚下一大片"淡蓝色的板"，其实是**盖在甲板上的海水**
       * （实测：关掉 deck-sea 那块就消失；把甲板涂红则红面完整，几何没洞）。
       * 抬起 0.12 世界单位（2.4 模型米）= 真实干舷 ≈ 4 米/36 米船，甲板才在海面之上。
       */
      /*
       * 【船的 y 必须**精确**等于它所在位置的浪高】原来用 `pose.y`（合成浪高的
       * 0.72 倍）—— 那个值只表达了"船在起伏"，与该点的真实水面差 2~6 厘米世界
       * 单位（1~2.5 模型米）。差这一点，船就一会儿悬在水上、一会儿扎进水里，
       * 而水线泡沫带也跟着一半沉在水下被遮住（实测：中段顶点比水面低 1.5 厘米）。
       * 现在直接用 GPU 用的同一个 `deckWaveHeight` 采船位的水面高度。
       */
      /*
       * 船与水面读同一个 `waveAmp`（= look.wave × 港内 calm）：
       * 港内水面压平了而船还在摇，是这类画面最容易出的错。
       */
      const waveAmp = look.wave * (sightingRef.current ? harborCalm(sightingRef.current.distNm, st.fleet.isSailing) : 1)
      const pose = deckShipPose(t, 0.72, 0.26, waveAmp)
      const seaAtShip = deckWaveHeight(0, 0, t, waveAmp)
      ship.position.y = seaAtShip + SHIP_DRAFT_LIFT
      // 船有自重：姿态只跟随浪的一部分，全跟随会像一片叶子
      ship.rotation.x = pose.pitch * 0.6
      ship.rotation.z = pose.roll * 0.55
      // 极慢的艏向摆动，让画面"活着"但不打断观察
      ship.rotation.y = Math.sin(t * 0.09) * 0.012
      /*
       * ---- 舵轮的两个动作（都来自真实事件，不是随机摆动）----
       * ① 改航向：waypoint 变了就给一个 1.2 秒的转角脉冲（水手在转舵）；
       * ② 航行中：随涌浪做 ±5° 的微调（船在浪里走，舵手一直在修）。
       * 系泊时舵轮不动 —— 停在港里没人握着舵。
       */
      {
        const wp = st.waypoint
        const key = wp ? `${wp.latitude.toFixed(3)},${wp.longitude.toFixed(3)}` : 'none'
        const pos = st.shipPosition
        // 到目标的真方位：航向变化的方向决定舵轮往哪边打
        const bearing = wp && pos
          ? calculateBearing(pos[0], pos[1], wp.latitude, wp.longitude)
          : null
        if (key !== lastWpKey) {
          if (lastWpKey !== '' && key !== 'none') helmPulse = 1
          if (bearing != null && lastBearing != null) {
            const d = wrapDeg(bearing - lastBearing)
            if (Math.abs(d) > 2) helmSign = d > 0 ? 1 : -1
          }
          lastWpKey = key
        }
        lastBearing = bearing
        helmPulse = Math.max(0, helmPulse - dt / 1.2)
        const pulse = helmPulse * helmPulse * 1.1 * helmSign
        const trim = st.fleet.isSailing ? Math.sin(t * 0.7) * 0.09 : 0
        /*
         * 帆的透光：方向就是主光（`fill`）的方向 —— 它是"太阳/月亮"在这一幕的位置，
         * 用别的方向就会出现"背光的方向和投在地上的影子对不上"。
         * 强度乘 `fill.intensity`：夜里月光弱、透出来的也少，白天强。
         * **不另设曲线**，让"透光"和"受光"永远同源。
         *
         * 系数是量出来的，不是随手挑的（同一点 A/B，夜空 11/21/34）：
         *   关掉透光 38/42/40 —— 纯黑剪影，夜航的帆看不出是布；
         *   0.6      65/75/81 —— 比夜空亮六倍，读作"一块发光的塑料板"；
         *   0.35     47/54/56 —— 看得出布在透光，又没脱离"夜"。
         * 取 0.35。
         */
        {
          const flag = st.fleet.ships.find((x) => x.id === st.fleet.flagshipId) ?? st.fleet.ships[0]
          deckShip.setCrew(sailorCount(flag?.crew ?? 0))
        }
        /*
         * 牲口栏：**与"粮"同源**。栏里几只羊由 `penLivestock(fleet.food)` 决定 ——
         * 粮掉到 4 以下栏子就空了，比 HUD 上的数字更早提醒玩家该靠港。
         * 这里不另设阈值：分档写在 `deckPen` 里，纯函数可单测。
         */
        deckShip.setProvisions(st.fleet.food)
        /*
         * 海图桌上那条线：方位 = 到 waypoint 的真方位，长度按剩余海里。
         * 两者都来自既有单一来源（`calculateBearing` / `useVoyageNext`），
         * 所以"桌上的图"和"出航计划面板"永远说同一件事。
         */
        /*
         * 旗子：风向直接取 `weather.windDir`（**风吹去**的罗盘方位）。不在这里做
         * 任何"顺风/逆风"的换算 —— 那是 `calculateSailingDays` 的事，旗子只负责
         * 把同一个数画出来，两处一旦各算一遍就必然对不上。
         */
        deckShip.setWind(st.weather.windDir, st.weather.windSpeed)
        /*
         * 航迹：船速取旗舰的 `speed`（节），是否在走取 `fleet.isSailing`。
         * 三个数都在 `deckWake` 里算（可单测）—— 系泊时强度 0.14、船首浪长 0，
         * 所以"停着"与"在走"在画面上是两件明显不同的事。
         */
        {
          const flag = st.fleet.ships.find((x) => x.id === st.fleet.flagshipId) ?? st.fleet.ships[0]
          const knots = flag?.speed ?? 0
          deckShip.setWake(
            wakeStrength(st.fleet.isSailing, knots),
            bowWaveSpread(knots),
            bowWaveLength(st.fleet.isSailing, knots),
            look.wave,
          )
          /*
           * 锚：**与航迹同源**（同一个 `fleet.isSailing`）。锚垂进水里 = 停着，
           * 锚收到舷边 = 在走。两处如果各读一个状态，就会出现"船在走锚还挂着"
           * 这种一眼假的画面 —— 所以都从这里这一处分支出去。
           */
          deckShip.setMooring(!st.fleet.isSailing)
        }
        {
          const wpt = st.waypoint
          const pos = st.shipPosition
          const remain = nextRef.current?.suggest?.distanceNm ?? null
          const brg = wpt && pos
            ? calculateBearing(pos[0], pos[1], wpt.latitude, wpt.longitude)
            : null
          deckShip.setCourse(brg, remain)
        }
        deckShip.setBacklight(fill.position, fill.color, 0.30 * fill.intensity)
        deckShip.update(t, pulse + trim, night)
      }

      if (walkingRef.current) {
        /*
         * ---- 甲板行走：第一人称站在船上 ----
         *
         * 位置存在**船体局部坐标（米）**里，每帧乘 SHIP_SCALE 再用 ship.localToWorld
         * 变到世界 —— 于是船的纵摇/横摇/航向会完整地传到"站在甲板上的人"，
         * 不需要另写一套摇摆。
         *
         * 朝向也乘 ship.quaternion：否则船一摇，人的视线还钉在世界坐标上，
         * 读作"相机浮在船外面"。
         */
        const speed = WALK_SPEED_M * dt
        let fwd = 0
        let side = 0
        const k = keysRef.current
        if (k.f) fwd += 1
        if (k.b) fwd -= 1
        if (k.r) side += 1
        if (k.l) side -= 1
        if (fwd !== 0 && side !== 0) {
          // 斜着走不该比直着快
          const inv = Math.SQRT1_2
          fwd *= inv
          side *= inv
        }
        if (fwd !== 0 || side !== 0) {
          const sy = Math.sin(viewRef.current.yaw)
          const cy = Math.cos(viewRef.current.yaw)
          // 前向 = (sin yaw, cos yaw)，右向 = (cos yaw, -sin yaw)
          const dx = (fwd * sy + side * cy) * speed
          const dz = (fwd * cy - side * sy) * speed
          /*
           * 舱内是矩形房间、甲板是船体轮廓 —— 两套约束不能混（见 deckCabin 的注释）。
           * 这里只换约束函数，方向/速度/斜走归一的逻辑完全共用。
           */
          walkPos = inCabinRef.current ? stepInCabin(walkPos, dx, dz) : stepWalk(walkPos, dx, dz)
          bobPhase += dt * 7.5
        }

        ship.updateMatrixWorld(true)
        /*
         * 【绝不能再乘一次 SHIP_SCALE】`ship.localToWorld` 应用的是完整的
         * 世界矩阵，**已经包含 0.05 的缩放**。第一版把米制坐标先乘了 SHIP_SCALE
         * 再交给 localToWorld，等于缩了两次（1/400）：相机被拉到龙骨附近，
         * 屏幕上是"从船体内部往外看"的一堆木纹 —— 而且看起来还挺像有内容的，
         * 只有对照"人应该站在甲板上"才知道错了。
         */
        /*
         * 舱内的地板是一个常数高度（船尾楼底面），不是 `shipDeckAt(z)` ——
         * 后者是甲板线，在船尾会翘起来，站进舱里就会"脚陷进地板、头穿出天花"。
         */
        const eyeY = inCabinRef.current ? cabinEyeY() : deckEyeY(walkPos.z)
        const eye = new THREE.Vector3(walkPos.x, eyeY, walkPos.z)
        ship.localToWorld(eye)
        // 走路时相机轻微上下起伏（幅度 2cm）：没有它走起来像滑冰
        eye.y += Math.sin(bobPhase) * 0.006
        camera.position.copy(eye)
        const v = viewRef.current
        const cp = Math.cos(v.pitch)
        const dir = new THREE.Vector3(Math.sin(v.yaw) * cp, Math.sin(v.pitch), Math.cos(v.yaw) * cp)
        dir.applyQuaternion(ship.quaternion)
        camera.lookAt(eye.clone().add(dir))
        if (camera.fov !== 56) {
          camera.fov = 56
          camera.updateProjectionMatrix()
        }
      } else {
        // 相机：贴着船尾缓慢横移，读作"站在船上"而不是"在看模型"
        camera.position.x = -2.5 + Math.sin(t * 0.11) * 0.2
        camera.position.y = 1.75 + Math.sin(t * 0.07 + 1.3) * 0.06 + pose.y * 0.35
        camera.lookAt(-0.25, 1.15, 1.4)
        if (camera.fov !== 42) {
          camera.fov = 42
          camera.updateProjectionMatrix()
        }
      }

      /*
       * ---- 近岸：每 8 帧算一次 ----
       * 20 个港的 haversine 不算贵，但也没必要每帧做——船一帧挪不了几米，
       * 岸的景别在 8 帧里不会变。HUD 上的海里数同样跟着这个节奏刷新
       * （读数是真实距离，画的位置是景别，两者不混）。
       */
      if (frame % 8 === 0) {
        const pos = st.shipPosition
        let sighting: CoastSighting | null = null
        if (pos) {
          /*
           * 停泊时没有 waypoint：把港固定在左舷前方（−78°）。
           * 用绝对方位会让"停在港里"的画面取决于上一段航向，随机得很。
           */
          const heading = st.fleet.isSailing && st.waypoint
            ? calculateBearing(pos[0], pos[1], st.waypoint.latitude, st.waypoint.longitude)
            : 0
          sighting = findCoast(pos[0], pos[1], heading)
          if (sighting && !st.fleet.isSailing) {
            sighting = { ...sighting, relBearingDeg: -78, presence: 1 }
          }
        }
        sightingRef.current = sighting
        coast.setSighting(sighting)
        /*
         * 港口与海岸读**同一份** sighting：两份各自算一次距离是这类画面最典型的
         * 分叉来源（岸在左、港在右，或者一个出现一个消失）。
         * 停泊时 `isSailing` 传 false → 港无条件显示（见 harborVisible 的注释）。
         */
        harbor.setSighting(sighting, st.fleet.isSailing)
        if (hudRef.current) {
          if (inCabinRef.current) {
            hudRef.current.textContent = '船长室 · 海图桌'
          } else {
          hudRef.current.textContent = sighting
            ? `${sighting.port.nameCn} · ${bearingWord(sighting.relBearingDeg)} ${sighting.distNm.toFixed(1)} 海里`
            : '远洋 · 视野内无陆地'
          }
        }
      }
      coast.update(t, night, skyMat.uniforms.uHorizon.value, look.fog, skyMat.uniforms.uFogColor.value)
      harbor.update(t, night, look.fog, skyMat.uniforms.uFogColor.value)

      /*
       * ---- 海鸟：位置由纯函数给，这里只抄顶点 ----
       * `sightingRef.current` 是每 8 帧算一次的那个最近陆地（与 HUD 同一次计算），
       * 所以鸟群的方向永远等于"岸在哪边"——两条线索不可能各说各话。
       */
      {
        const sight = sightingRef.current
        const flock = deckBirdFlock(
          sight ? sight.distNm : null,
          skyInfo.lit,
          st.weather?.kind,
          sight ? sight.relBearingDeg : 0,
        )
        // 0.62：深灰的线在亮天上够清楚，又不至于像"一串飘在空中的黑线"
        birdMat.opacity = flock.count ? 0.62 : 0
        for (let i = 0; i < BIRD_MAX; i++) {
          const o = i * 12
          if (i >= flock.count) {
            /*
             * 多余的鸟藏到水下 80 单位。**不能只把 opacity 设 0** —— 那样它们仍在
             * 原点附近、仍在被绘制；也不能把顶点留在上一帧的位置（换群时会有一两只
             * "卡"在天上）。
             */
            for (let k = 0; k < 12; k += 3) {
              birdPos[o + k] = 0
              birdPos[o + k + 1] = -80
              birdPos[o + k + 2] = 0
            }
            continue
          }
          const p = deckBirdPose(i, t, flock)
          // 翼尖上下扑：±0.55 个翼展，鸟在远处就是"两点抬落"
          const tip = p.wing * p.span * 0.55
          birdPos[o] = p.x - p.span
          birdPos[o + 1] = p.y + tip
          birdPos[o + 2] = p.z
          birdPos[o + 3] = p.x
          birdPos[o + 4] = p.y
          birdPos[o + 5] = p.z
          birdPos[o + 6] = p.x
          birdPos[o + 7] = p.y
          birdPos[o + 8] = p.z
          birdPos[o + 9] = p.x + p.span
          birdPos[o + 10] = p.y + tip
          birdPos[o + 11] = p.z
        }
        birdGeo.attributes.position.needsUpdate = true
        // 取证句柄：巡检要能量"这一帧有几只鸟、在哪"
        ;(window as unknown as { __deckBirds?: unknown }).__deckBirds = {
          count: flock.count,
          headingDeg: flock.headingDeg,
          dist: flock.dist,
          sprite: birdPos.length,
        }
      }

      // 星空随夜色淡入（夜里才该看到星星）
      starMat.opacity = 0.12 + 0.68 * night
      // 天亮时海色与天光一起抬起来，不让"白天还是深夜的蓝"
      const dayK = 1 - night
      skyMat.uniforms.uZenith.value.copy(SKY_ZENITH_NIGHT).lerp(SKY_ZENITH_DAY, dayK)
      skyMat.uniforms.uHorizon.value.copy(SKY_HORIZON_NIGHT).lerp(SKY_HORIZON_DAY, dayK)
      /*
       * 黄昏强度：以 lit≈0.42 为中心的高斯（日出与日落都会经过这里）。
       * 【强度为什么是 0.2 而不是 0.6】第一版给 0.62 时整幅画面变成粉色——
       * 天顶的紫（0x4a4a72）与地平线的橙一混就是品红，而海面的 uSky 又跟着
       * 地平线走，于是连海都粉了。黄昏只需要**地平线一带**暖，天顶保持冷。
       */
      const dusk = Math.exp(-Math.pow((skyInfo.lit - 0.42) / 0.2, 2))
      skyMat.uniforms.uZenith.value.lerp(DUSK_ZENITH, 0.14 * dusk)
      skyMat.uniforms.uHorizon.value.lerp(DUSK_HORIZON, 0.30 * dusk)
      // 海面只借一点暖（水面反射天空，但反射率低、色偏冷）
      /*
       * 海面借的暖比"物理反射率"高一些（0.45 而不是 0.16）：
       * 这是画面平衡，不是物理。黄昏时天空是暖的、海面若仍是冷灰，
       * 整张图会读作"阴天配橙色滤镜"（实测截图）。
       */
      lastSeaSky.copy(SKY_HORIZON_NIGHT).lerp(SKY_HORIZON_DAY, dayK).lerp(DUSK_HORIZON, 0.45 * dusk)
      skyMat.uniforms.uDusk.value = dusk
      seaUniforms.uDeep.value.copy(SEA_DEEP_NIGHT).lerp(SEA_DEEP_DAY, dayK).multiplyScalar(1 - 0.22 * dusk)
      /*
       * 0.55 而不是 0.72：相机贴着水面时几乎整片海都是掠射角（菲涅尔接近上限），
       * 天光色的权重被放得很大，夜海会读成"浅灰的地板"。压到 0.55 之后
       * 近处才有水色、远处才反天光。
       */
      /*
       * 【海水反射的天光要再压一道】0.32 × (0.80, 0.95, 1.06)：
       * 先压三分之一（水的吸收 + 只有一部分天光被反射），再往蓝绿偏一点。
       * 这两步都不是"调参玄学"：量出来的判据是——正午海面必须比天空暗
       * **至少 60/255**，且蓝分量大于红分量。压之前是海 205/221/233、天 200/217/231
       * （海比天还亮 5），压之后见 `.workbuddy/probe-deck-px.mjs` 的复测值。
       */
      /*
       * 夜间把反射天光的权重提到 0.34：去掉双编码之后夜海几乎是纯黑（实测 4/11/20），
       * 浪形完全看不出来；夜里真实的海面会反一点星光与天光，需要一点底。
       */
      seaUniforms.uSky.value.copy(lastSeaSky).multiplyScalar(0.24 + 0.10 * night)
      seaUniforms.uSky.value.r *= 0.80
      seaUniforms.uSky.value.g *= 0.95
      seaUniforms.uSky.value.b *= 1.06
      seaUniforms.uMoonK.value = 0.04 + 0.96 * night

      /*
       * 【这一版不接辉光】共用的 `post` 在**极暗**的场景里会把整体提亮很多：
       * 实测夜空 rgb(16,27,40) → rgb(71,92,111)（同一帧开关对比）。
       * 海图的暗部只差 6/255，这里差 60 —— 说明它在不同的输入值域上表现不一致，
       * 属于那条合成链路的遗留问题，不能带着上船。先把场景做对，辉光留给下一轮
       * 单独修（判据：关掉辉光时逐像素等于直出）。
       */
      /*
       * ---- 后处理：只做辉光 ----
       *
       * 【上一轮为什么没接】当时的判断是"共用 post 在极暗场景里会把整体提亮 +55"
       * （夜空 rgb(16,27,40) → rgb(71,92,111)）。**那个诊断是错的** ——
       * 真正的原因是船上视角的天空/海面 shader 当时**缺 sRGB 编码**：
       * 直出把线性值直接写成 sRGB（画面偏暗），而 post 在合成末尾做了正确的编码，
       * 于是"接了 post 反而正常亮"，看起来像 post 提亮了暗部。
       * 第 61 轮补上 srgbEncode 之后，两条路径的值域一致，可以接了。
       *
       * 判据（写死在这里）：关掉辉光（uBloom=0）时与直出**逐像素一致**，
       * 由 `.workbuddy/probe-deck-post.mjs` 验。
       */
      post.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      renderer.domElement.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      skyGeo.dispose()
      skyMat.dispose()
      birdGeo.dispose()
      birdMat.dispose()
      starGeo.dispose()
      starMat.dispose()
      seaGeo.dispose()
      seaMat.dispose()
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
        for (const one of Array.isArray(m) ? m : m ? [m] : []) one.dispose()
      })
      deckShip.dispose()
      coast.dispose()
      harbor.dispose()
      rain.dispose()
      post.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      delete (window as unknown as { __deckScene?: THREE.Scene }).__deckScene
      delete (window as unknown as { __deckWalk?: unknown }).__deckWalk
    }
  }, [open])

  if (!open) {
    if (viewMode === 'harbor') return null
    return (
      /*
       * 【入口为什么搬到这里】
       * 原来它是 `fixed right-4 bottom-24 md:bottom-6 z-30`：桌面端 bottom-6
       * 正好落在底栏（y 849..900）上、z-30 又低于底栏内部那层 div ——
       * 实测 elementFromPoint 命中的是 `DIV.flex items-center gap-0.5 shrink-0 order-3`，
       * 也就是**按钮整个被底栏盖住**，玩家点不到也看不见（用户反馈"没看到按钮"）。
       * 同一个坑 3D 海图那个开关也踩过（它现在躲在 top-14 right-3）。
       * 现在与它并排：都在顶栏下方的右上角，z-900 压在底栏/侧栏之上。
       */
      <button
        type="button"
        onClick={() => setDeckView(true)}
        data-testid="deck-view-toggle"
        title="船上视角（V）：贴着海面看自己的船"
        className="absolute right-[7.4rem] top-14 z-[900] flex items-center gap-1.5 rounded border
                   border-[#8b6f3e]/70 bg-[#1b1408]/95 px-3 py-1.5 text-xs font-serif text-[#e8d4a8]
                   shadow-[0_2px_8px_rgba(0,0,0,0.55)] transition-colors
                   hover:bg-[#2a1f0c] active:scale-95"
      >
        <Anchor size={14} aria-hidden="true" />
        船上
      </button>
    )
  }

  return (
    <div className="absolute inset-0 bg-[#03080e]" style={{ zIndex: Z_DECK }} data-testid="deck-view">
      <div ref={mountRef} className="absolute inset-0" />
      {/*
        闪电的整屏白闪：用 DOM 而不是 3D 里的 sprite —— 它必须**绝对覆盖**全屏
        （包括 HUD 之外的边缘），且不该参与深度/雾/色调映射。opacity 由帧循环直改。
      */}
      <div
        ref={flashRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[#dfe9ff] opacity-0"
      />
      {/* HUD：只留必要信息，别把海面盖住 */}
      <div className="pointer-events-none absolute left-4 top-4 rounded-md border border-gold-600/30 bg-black/35 px-3 py-2 text-parchment-100 backdrop-blur-sm">
        <div className="text-xs tracking-[0.3em] text-gold-400">DECK VIEW</div>
        <div className="mt-0.5 text-sm tracking-widest">船上 · 贴着海面</div>
      </div>
      <div className="absolute right-4 top-4 flex gap-2">
        <button
          type="button"
          onClick={() => setWalk(!walking)}
          className="flex items-center gap-1.5 rounded-full border border-gold-600/50 bg-black/40 px-3 py-2 text-xs text-parchment-100 backdrop-blur transition hover:bg-black/60"
          data-testid="deck-walk-toggle"
        >
          <Footprints size={14} />
          {walking ? '回看船' : '上甲板'}
        </button>
        <button
          type="button"
          onClick={() => setDeckView(false)}
          className="flex items-center gap-1.5 rounded-full border border-gold-600/50 bg-black/40 px-3 py-2 text-xs text-parchment-100 backdrop-blur transition hover:bg-black/60"
          data-testid="deck-view-close"
        >
          <X size={14} />
          回海图
        </button>
      </div>
      <div
        ref={hudRef}
        data-testid="deck-coast-hud"
        className="pointer-events-none absolute left-4 top-[5.5rem] rounded-md border border-gold-600/25 bg-black/30 px-3 py-1.5 text-xs tracking-wider text-parchment-200/90 backdrop-blur-sm"
      >
        远洋 · 视野内无陆地
      </div>
      {/*
        * 「你在哪」的常驻提示。舱内与甲板是两个空间，而画面里看不出边界
        * （舱内四面都是木板）—— 一行小字比一个弹窗省事得多。
        */}
      {walking && inCabin ? (
        <div
          data-testid="deck-cabin-badge"
          className="pointer-events-none absolute left-1/2 top-[5.5rem] -translate-x-1/2 rounded-md border border-gold-600/30 bg-black/45 px-3 py-1 text-xs tracking-[0.2em] text-gold-300 backdrop-blur-sm"
        >
          船长室
        </div>
      ) : null}
      {walking && spot ? (
        <DeckSpotPanel
          spot={spot}
          fleet={fleet}
          weather={weather}
          next={next}
          sighting={sightingRef.current}
          onClose={() => setSpot(null)}
        />
      ) : null}
      {walking ? (
        <>
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs tracking-wider text-parchment-200/70">
            WASD 走动 ｜ 拖拽转头 ｜ F 回看船
          </div>
          {/*
            移动端方向键：与键盘共用 keysRef（不是 state —— 按住要连续生效，
            state 每帧 setState 会把整个组件重渲染一次）。
          */}
          <div className="absolute bottom-16 right-4 grid grid-cols-3 gap-1.5 md:hidden">
            {([['', 'f', ''], ['l', '', 'r'], ['', 'b', '']] as const).map((row, ri) =>
              row.map((dir, ci) => {
                if (!dir) return <span key={`${ri}-${ci}`} />
                const label = dir === 'f' ? '↑' : dir === 'b' ? '↓' : dir === 'l' ? '←' : '→'
                return (
                  <button
                    key={`${ri}-${ci}`}
                    type="button"
                    aria-label={dir}
                    className="h-12 w-12 rounded-lg border border-gold-600/40 bg-black/45 text-lg text-parchment-100 backdrop-blur active:bg-black/70"
                    onPointerDown={(e) => {
                      keysRef.current[dir] = true
                      e.currentTarget.setPointerCapture(e.pointerId)
                    }}
                    onPointerUp={() => { keysRef.current[dir] = false }}
                    onPointerCancel={() => { keysRef.current[dir] = false }}
                    onPointerLeave={() => { keysRef.current[dir] = false }}
                  >
                    {label}
                  </button>
                )
              }),
            )}
          </div>
        </>
      ) : (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs tracking-wider text-parchment-200/70">
          V / Esc 回海图 ｜ F 上甲板
        </div>
      )}
    </div>
  )
}
