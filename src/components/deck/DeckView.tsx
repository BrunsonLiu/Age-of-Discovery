import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Anchor, X } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { skyAt } from '@/utils/skyClock'
import { createDeckShip, type DeckShip } from './shipModel'
import { DECK_WAVES, deckShipPose } from './deckWaves'
import { findCoast, bearingWord, type CoastSighting } from './deckCoast'
import { createDeckCoast } from './coastModel'
import { createMap3DPost, type Map3DPost } from '@/components/map3d/post'
import { createDeckRain, rainTiltFromWind } from './rainLayer'
import {
  approachLook, deckWeatherLook, lightningEnvelope, rainDropCount, type DeckWeatherLook,
} from './deckWeather'
import { calculateBearing } from '@/utils/navigation'

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
 * 船上视角的层级：压过底栏(40)/时间轴(50)/通知(60)的前一层，
 * 但**让位给通知与事件卡**——船上有海况，事件卡必须还能弹出来。
 */
const Z_DECK = 62

/**
 * 分段式 sRGB 编码。
 *
 * 【为什么必须自己写】自定义 `ShaderMaterial` 的 `gl_FragColor` 是**直接写进画布**的
 * （画布按 sRGB 解释），three 不会替你转换。而 uniform 里的颜色经 `Color` 已经
 * 是**线性**工作空间的值 —— 于是 0x5b86ad 这种中蓝写出去被当成 sRGB 0.10 显示，
 * 屏幕上是 25/255 的深蓝。实测后果：`lit=0.95` 的"上午"看起来像黄昏，
 * 天空与受光的船体（走 three 内置材质，会正确编码）明暗关系对不上。
 *
 * 【为什么不用 three 的 colorspace_fragment】那个 chunk 在 ShaderMaterial 里
 * 生成的是纯 gamma 1/2.2，而画布是分段式 sRGB：暗部会差 7/255（海图的 post 里
 * 踩过一模一样的坑）。
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
  const open = useMapStore((s) => s.deckView)
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
          gl_FragColor = vec4(srgbEncode(clamp(col, 0.0, 1.0)), 1.0);
        }
      `,
    })
    const sky = new THREE.Mesh(skyGeo, skyMat)
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
          vec4 world = modelMatrix * vec4(p, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uMoonDir;
        uniform vec3 uDeep;
        uniform vec3 uSky;
        uniform vec3 uMoon;
        uniform float uMoonK;
        uniform float uFogNear;
        uniform float uFogFar;
        uniform float uFogK;
        uniform vec3 uFogColor;
        uniform float uDark;
        varying vec3 vWorld;
        varying vec3 vNormal;
        ${SRGB_ENCODE}
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
          vec3 col = mix(uDeep, uSky, clamp(fres * 1.05, 0.0, 0.82));
          // 月光镜面（Blinn-Phong 的高光半径收得很紧，海面才不会整片发白）
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
          float spec = pow(max(dot(n, h), 0.0), 420.0);
          col += uMoon * spec * 0.45 * uMoonK;
          // 浪脊的微弱提亮：让相邻浪面之间有层次，不然海面是一块布
          col += uSky * clamp(n.y - 0.97, 0.0, 1.0) * 0.8;
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
          col *= uDark;
          gl_FragColor = vec4(srgbEncode(clamp(col, 0.0, 1.0)), 1.0);
        }
      `,
    })
    const sea = new THREE.Mesh(seaGeo, seaMat)
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
    // 取证句柄：巡检要能量岸线的可见性/坐标（与海图的 __map3d 同一做法）
    ;(window as unknown as { __deckScene?: THREE.Scene }).__deckScene = scene

    /*
     * ---- 雨 ----
     * 位置更新在顶点着色器里算（见 rainLayer），CPU 只改两个 uniform。
     * 整层跟着相机走，所以船开到哪都在"雨里"。
     */
    const rain = createDeckRain(6000)
    scene.add(rain.mesh)

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
      fill.intensity = 0.55 + 1.15 * skyInfo.lit
      ambient.intensity = 0.30 + 0.25 * skyInfo.lit

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

        // 海面的浪高必须与船的姿态用同一个倍数，否则船会浮在浪外
        seaUniforms.uWaveScale.value = look.wave
        // 雾：把"远处混天光"的起点收近
        seaUniforms.uFogNear.value = 28 - 22 * look.fog
        seaUniforms.uFogFar.value = 62 - 38 * look.fog
        const dark = 1 - 0.45 * look.darken
        seaUniforms.uDark.value = dark
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

      const pose = deckShipPose(t, 0.72, 0.26, look.wave)
      ship.position.y = pose.y
      // 船有自重：姿态只跟随浪的一部分，全跟随会像一片叶子
      ship.rotation.x = pose.pitch * 0.6
      ship.rotation.z = pose.roll * 0.55
      // 极慢的艏向摆动，让画面"活着"但不打断观察
      ship.rotation.y = Math.sin(t * 0.09) * 0.012
      deckShip.update(t)

      // 相机：贴着船尾缓慢横移，读作"站在船上"而不是"在看模型"
      camera.position.x = -2.5 + Math.sin(t * 0.11) * 0.2
      camera.position.y = 1.75 + Math.sin(t * 0.07 + 1.3) * 0.06 + pose.y * 0.35
      camera.lookAt(-0.25, 1.15, 1.4)

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
        coast.setSighting(sighting)
        if (hudRef.current) {
          hudRef.current.textContent = sighting
            ? `${sighting.port.nameCn} · ${bearingWord(sighting.relBearingDeg)} ${sighting.distNm.toFixed(1)} 海里`
            : '远洋 · 视野内无陆地'
        }
      }
      coast.update(t, night, skyMat.uniforms.uHorizon.value, look.fog, skyMat.uniforms.uFogColor.value)

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
      seaUniforms.uSky.value.copy(lastSeaSky).multiplyScalar(0.55)
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
      skyGeo.dispose()
      skyMat.dispose()
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
      rain.dispose()
      post.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      delete (window as unknown as { __deckScene?: THREE.Scene }).__deckScene
    }
  }, [open])

  if (!open) {
    if (viewMode === 'harbor') return null
    return (
      <button
        type="button"
        onClick={() => setDeckView(true)}
        data-testid="deck-view-toggle"
        title="船上视角（V）：贴着海面看自己的船"
        className="fixed right-4 bottom-24 z-30 flex items-center gap-1.5 rounded-full border border-gold-600/50 bg-ocean-900/85 px-3 py-2 text-xs text-parchment-100 shadow-lg backdrop-blur transition hover:bg-ocean-800/90 md:bottom-6"
      >
        <Anchor size={14} />
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
      <button
        type="button"
        onClick={() => setDeckView(false)}
        className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full border border-gold-600/50 bg-black/40 px-3 py-2 text-xs text-parchment-100 backdrop-blur transition hover:bg-black/60"
        data-testid="deck-view-close"
      >
        <X size={14} />
        回海图
      </button>
      <div
        ref={hudRef}
        data-testid="deck-coast-hud"
        className="pointer-events-none absolute left-4 top-[5.5rem] rounded-md border border-gold-600/25 bg-black/30 px-3 py-1.5 text-xs tracking-wider text-parchment-200/90 backdrop-blur-sm"
      >
        远洋 · 视野内无陆地
      </div>
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs tracking-wider text-parchment-200/70">
        V / Esc 回海图
      </div>
    </div>
  )
}
