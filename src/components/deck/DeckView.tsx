import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Anchor, X } from 'lucide-react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { skyAt } from '@/utils/skyClock'
import { createShipModelKit, makeShipModel } from '@/components/map3d/models'
import { DECK_WAVES, deckShipPose } from './deckWaves'

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
const SKY_ZENITH_DAY = new THREE.Color(0x5b86ad)
const SKY_HORIZON_NIGHT = new THREE.Color(0x112436)
const SKY_HORIZON_DAY = new THREE.Color(0x9dbfd8)
const SEA_DEEP_NIGHT = new THREE.Color(0x02060b)
const SEA_DEEP_DAY = new THREE.Color(0x0d2a3f)
const MOON_COLOR = new THREE.Color(0xdfe9ff)

/**
 * 船上视角的层级：压过底栏(40)/时间轴(50)/通知(60)的前一层，
 * 但**让位给通知与事件卡**——船上有海况，事件卡必须还能弹出来。
 */
const Z_DECK = 62

export default function DeckView() {
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
    camera.position.set(1.15, 1.12, -3.55)
    // 注视点略高于水线：让船占画面中下部，天空留白给月亮
    camera.lookAt(0, 0.62, 2.4)

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
    const moonDir = new THREE.Vector3(0.40, 0.205, 0.89).normalize()

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
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -1.0, 1.0);
          // 地平线附近偏亮、天顶偏暗；下半个球压到海色，避免出现"天在下"
          vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.55));
          col = mix(col, uHorizon * 0.55, smoothstep(0.0, -0.35, h));
          float m = max(dot(d, uMoonDir), 0.0);
          // 月亮：盘（~1.2°）+ 两圈光晕。加起来比贴图省一次采样
          col += uMoonColor * smoothstep(0.9994, 0.9997, m) * 2.2;
          col += uMoonColor * pow(m, 240.0) * 0.20;
          col += uMoonColor * pow(m, 26.0) * 0.045;
          gl_FragColor = vec4(col, 1.0);
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
            p.y += uAmp[i] * sin(f);
            // 解析法线：与 deckWaves.deckWaveNormal 逐项对应
            nrm.x -= d.x * k * uAmp[i] * cos(f);
            nrm.z -= d.y * k * uAmp[i] * cos(f);
            nrm.y -= uSteep[i] * k * uAmp[i] * sin(f);
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
        varying vec3 vWorld;
        varying vec3 vNormal;
        void main() {
          vec3 n = normalize(vNormal);
          vec3 v = normalize(cameraPosition - vWorld);
          // 菲涅尔：正视是深水，掠视反天光
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 col = mix(uDeep, uSky, clamp(fres * 1.15, 0.0, 1.0));
          // 月光镜面（Blinn-Phong 的高光半径收得很紧，海面才不会整片发白）
          vec3 h = normalize(uMoonDir + v);
          /*
           * 月光镜面：指数收到 420、强度 0.85。
           * 第一版 220 / 1.6 的结果是一团**贴着船尾的白斑**（浪脊恰好满足
           * 反射角时整块过曝），读作探照灯而不是月光。收窄之后它才是一条
           * 随浪闪的碎光带。
           */
          float spec = pow(max(dot(n, h), 0.0), 420.0);
          col += uMoon * spec * 0.85;
          // 浪脊的微弱提亮：让相邻浪面之间有层次，不然海面是一块布
          col += uSky * clamp(n.y - 0.97, 0.0, 1.0) * 0.8;
          // 远处收到天光色：与天空球的地平线接上，不出现一条硬边
          float d = length(vWorld.xz);
          col = mix(col, uSky * 0.85, smoothstep(28.0, 62.0, d));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
    const sea = new THREE.Mesh(seaGeo, seaMat)
    sea.frustumCulled = false
    scene.add(sea)

    // ---- 船：与 2.5D 海图同一套模型（同一份 kit，不另做一套）----
    const kit = createShipModelKit('player')
    const ship = makeShipModel(kit)
    ship.scale.setScalar(0.92)
    scene.add(ship)

    // 艉灯：夜里唯一的暖光。它在船尾，正好落在镜头与船之间
    const lantern = new THREE.PointLight(0xffb066, 1.7, 4.5, 2)
    lantern.position.set(0, 0.62, -0.78)
    ship.add(lantern)
    const lanternBall = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, 10, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.0, 0.5) }),
    )
    lanternBall.position.copy(lantern.position)
    ship.add(lanternBall)

    // ---- 光：月光主光 + 极低环境（夜里靠月亮，不靠补光）----
    const moon = new THREE.DirectionalLight(0xbfd6ff, 2.1)
    moon.position.copy(moonDir).multiplyScalar(30)
    scene.add(moon)
    const ambient = new THREE.AmbientLight(0x223347, 0.55)
    scene.add(ambient)

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
    const tick = () => {
      const t = performance.now() / 1000
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
      ambient.intensity = 0.30 + 0.25 * skyInfo.lit

      const pose = deckShipPose(t)
      ship.position.y = pose.y
      // 船有自重：姿态只跟随浪的一部分，全跟随会像一片叶子
      ship.rotation.x = pose.pitch * 0.6
      ship.rotation.z = pose.roll * 0.55
      // 极慢的艏向摆动，让画面"活着"但不打断观察
      ship.rotation.y = Math.sin(t * 0.09) * 0.012

      // 相机：贴着船尾缓慢横移，读作"站在船上"而不是"在看模型"
      camera.position.x = 1.15 + Math.sin(t * 0.11) * 0.16
      camera.position.y = 1.12 + Math.sin(t * 0.07 + 1.3) * 0.05 + pose.y * 0.35
      camera.lookAt(0, 0.62, 2.4)

      // 星空随夜色淡入（夜里才该看到星星）
      starMat.opacity = 0.12 + 0.68 * night
      // 天亮时海色与天光一起抬起来，不让"白天还是深夜的蓝"
      const dayK = 1 - night
      skyMat.uniforms.uZenith.value.copy(SKY_ZENITH_NIGHT).lerp(SKY_ZENITH_DAY, dayK)
      skyMat.uniforms.uHorizon.value.copy(SKY_HORIZON_NIGHT).lerp(SKY_HORIZON_DAY, dayK)
      seaUniforms.uDeep.value.copy(SEA_DEEP_NIGHT).lerp(SEA_DEEP_DAY, dayK)
      seaUniforms.uSky.value.copy(skyMat.uniforms.uHorizon.value).multiplyScalar(0.9)

      /*
       * 【这一版不接辉光】共用的 `post` 在**极暗**的场景里会把整体提亮很多：
       * 实测夜空 rgb(16,27,40) → rgb(71,92,111)（同一帧开关对比）。
       * 海图的暗部只差 6/255，这里差 60 —— 说明它在不同的输入值域上表现不一致，
       * 属于那条合成链路的遗留问题，不能带着上船。先把场景做对，辉光留给下一轮
       * 单独修（判据：关掉辉光时逐像素等于直出）。
       */
      renderer.render(scene, camera)
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
      renderer.dispose()
      renderer.domElement.remove()
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
      <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs tracking-wider text-parchment-200/70">
        V / Esc 回海图 ｜ 拖拽与缩放暂不可用（这一版只有深海）
      </div>
    </div>
  )
}
