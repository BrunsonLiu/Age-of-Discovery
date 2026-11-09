import { useEffect, useRef, useState } from 'react'
import { Anchor } from 'lucide-react'
import * as THREE from 'three'
import { Line2 } from 'three/examples/jsm/lines/Line2.js'
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { useFxStore as useFx } from '@/store/useFxStore'
import { ports } from '@/data/ports'
import { routes } from '@/data/routes'
import { findNearestOceanPoint, isOnLand, fetchLandGeojsonForRender, loadLandData } from '@/utils/landCheck'
import { getRouteGeometry, toLatLngList, type RouteGeometry } from '@/utils/routePath'
import { calculateBearing } from '@/utils/navigation'
import {
  MAP_WORLD_SIZE, lonToWorldX, latToWorldZ, worldXToLon, worldZToLat,
} from '@/utils/mapProjection'
import { buildLandGeometry, PLATE_THICKNESS } from './landGeometry'
import { buildGrainCanvas } from '@/utils/landGrain'
import { birdPose } from '@/utils/portLife'
import { buildCloudShadowCanvas, cloudBlobs } from '@/utils/cloudShadow'
import { NPC_LEGS, NPC_SPEED_NM, npcLegAt, npcPose } from '@/utils/npcShips'
import { RELICS, relicInReach, relicInSeason } from '@/data/relics'
import { relicMarkerHtml } from '@/utils/relicGlyph'
import { skyAt } from '@/utils/skyClock'
import {
  animatePortLife, createBirdTexture, createPortModelKit, createShipModelKit,
  makePortModel, makeShipModel, portScaleOf,
} from './models'
import { buildMap3DLayers } from './mapLayers3d'
import { buildMap3DBorders } from './mapBorders3d'
import { buildMap3DCoastline } from './mapCoastline3d'
import { buildMap3DPeaks, type PeakFacing } from './mapPeaks3d'
import { createRhumb3d } from './mapRhumb3d'
import { createShipWake } from './shipWake'
import { createShallowBand } from './shallowBand'
import { shipNearZoomScale } from '@/utils/shipZoom'
import { loadReliefNormalMap } from '@/utils/reliefNormalMap'
import { seasonAt } from '@/utils/season'
import { buildTerrainSymbols, filterPeaksByElevation } from '@/utils/terrainDecor'
import { loadElevationSampler } from '@/utils/elevation'
import { buildMap3DGraticule, GRATICULE_OPACITY_NEAR } from './mapGraticule3d'
import { fetchBordersGeojson } from '@/utils/mapGeoJson'
import { decidePixelRatio } from '@/utils/adaptiveResolution'
import { isTapGesture } from '@/utils/tapGesture'
import { WEATHER_INFO } from '@/utils/weather'
import { useIsMobile } from '@/hooks/useIsMobile'
import {
  createAreaLabels, createPortLabel, measureLabels, placeLabels, remeasureWhenFontsReady,
  type ScreenLabel,
} from './mapLabels3d'
import { createSeaLayer3d, type SeaStaticItem } from './seaLayer3d'
import type { Waypoint } from '@/types'

/**
 * 2.5D 立体海图（实验性视图）。
 *
 * 【它是什么】
 * 把世界地图从 Leaflet 的 2D 矢量图换成 three.js 的斜俯视立体地图：
 * 平的羊皮纸陆地板块 + 沿海岸的薄边 + 微缩港口底座 + 低模帆船。
 * 风格参照《Age of Sail》——那种"斜俯视的微缩立体战略地图"。
 *
 * 【和 2D 地图的关系】
 * 这是**并列的第二种视图**，不是替换。玩法逻辑完全共用：
 *   - 船位仍由 SailingController 的 positionAtNm 推导（这里只读不写）
 *   - 航线仍走 getRouteGeometry（和 2D 的虚线是同一条几何）
 *   - 陆地碰撞仍用 landCheck 的 isOnLand / findNearestOceanPoint
 *   - 点击海面的语义与 MapClickHandler 完全一致
 * 唯一新增的是把 [lat,lng] 换算成世界坐标的投影函数（utils/mapProjection）。
 *
 * 【为什么默认不开启】
 * 2D 地图有 26 处 e2e 断言依赖 Leaflet 的 DOM 结构（.leaflet-overlay-pane path 等）。
 * 2.5D 作为可切换视图，2D 保持默认，这批断言一条都不用改。
 */
/**
 * 海面基色（与贴图逐通道相乘）。
 *
 * 抽出常量的原因：这个值要被两处使用 —— 材质初始化时的"青绿转深蓝"，
 * 以及天气变化时的"压暗 / 灰化"。两处各写一份数字，改一处漏一处就会出现
 * "阴天比晴天还亮"这种说不清的现象。
 */
const SEA_BASE_R = 1.34
const SEA_BASE_G = 1.50
const SEA_BASE_B = 2.18

/**
 * 浓雾时海面的目标色：比基色更亮、更中性（B 压下来），像一层白障。
 * 三个分量的比值沿用调亮前的设计（雾/晴 = 1.36 / 1.28 / 0.88）：
 * R、G 抬上去、B 压下来，与青灰贴图相乘后落在浅灰蓝，才是雾而不是夜。
 * 海面基色整体提亮后，这里必须按**同一个比例**跟着放大，
 * 否则雾会相对变暗、浓雾看起来像阴天。
 */
const FOG_R = 1.82
const FOG_G = 1.92
const FOG_B = 1.91

/**
 * 三个光源的基准强度。天气变差时按比例压暗（见帧循环里的天气段）。
 * 抽常量的理由同 SEA_BASE：基准值要被"初始化"与"天气调整"两处用。
 */
const LIGHT_KEY = 3.0
const LIGHT_RIM = 0.45
const LIGHT_AMB = 0.78

/**
 * `scene.environment`（PMREM 环境贴图）的基准强度。
 *
 * 【为什么它必须一起压】海面用的是 MeshStandardMaterial，材质自身没有 envMap，
 * 走的是 scene.environment —— 这一项的贡献**不受 Light.intensity 影响**。
 * 实测只压三个光源时，风暴的画面亮度纹丝不动（48.8 不变），
 * 因为画面亮度主要来自它（0.72）而不是方向光。
 */
const ENV_BASE = 0.72

/**
 * 陆地颗粒在世界空间平铺几次。
 *
 * 海图宽 20 世界单位 → 22 次 = 每格 0.9 单位。近景（约 5 单位横跨 1440px）
 * 时一格占 260px，256 texel 的颗粒贴图正好接近 1:1 像素；再远会被 mip 抹平
 * （那正是"远景不需要颗粒"想要的效果），再近才会开始变糊。
 */
const GRAIN_TILES = 22

/**
 * bump 强度。**这个数不能凭"看起来像多少"猜**，是扫出来的：
 *
 * 实测（近景、同机位、陆地相邻像素差 = HF 能量，海面 0.46 为对照）：
 *   0      → 0.57   （没有颗粒）
 *   0.03   → 0.57   （等于没有：第一版就是拍了个 0.03，白做一轮）
 *   0.3    → 0.59
 *   0.8    → 0.66
 *   2      → 0.91
 *   6      → 1.94
 *   20     → 5.6（砂纸，每个像素都在闪）
 *
 * 取 4：HF 落在 1.4 上下 —— 肉眼能读出"有纹理"，但不会在移动时抖。
 * 顺便记一个坑：0.03 这种"合理猜测"在这条曲线上小了两个数量级，
 * 因为 bump 的输入是贴图的一阶差分，而颗粒贴图是 1:1 像素级的噪声，
 * 差分本身就很小。凭感觉给数值，等于没加。
 */
const GRAIN_BUMP = 4

/**
 * 经纬网画在哪个高度（世界坐标 y）。
 *
 * 两个候选都拍了同机位对照（0.008 = 盖在羊皮纸上 / 海平面 = 只在水面）：
 * 实测在羊皮纸上几乎没有区别 —— 0x5b4425 @ 0.22 落在奶油色底子上只有
 * 约 4 级亮度差，肉眼看不出格子（这正是"背景层"该有的强度）。
 * 既然两种在陆地上都看不见，就取海平面版：少一层与国界线、地形符号、
 * 港口叠加的线，也不额外在海图上盖一层全屏 overdraw。
 */
const GRATICULE_Y = -PLATE_THICKNESS + 0.002

/**
 * 地形符号的世界高度：比陆地顶面高 0.004（在海岸墨线 0.006 之下）。
 * 符号是"画在纸面上"的，压得太高会在斜视时和陆地脱开、看起来浮空。
 */
const PEAK_Y = 0.004

/**
 * 地形符号的撒点步长（度）与参与撒点的陆地块数。
 *
 * 2D 用的也是 1.1°，但 3D 的符号**世界尺寸固定**（0.30 单位 ≈ 11px），
 * 不按屏幕像素缩放，所以远景下 1.1° 会显得偏密：默认视野 40 单位宽
 * 就是 130° 经度，一格 1.1° ≈ 11px —— 正好一个符号挨着一个符号。
 * 取 1.8°（≈18px 一格）给山脊之间留出纸面。
 * topBlocks 与 2D 一致（14 块）：小岛不撒符号。
 */
const TERRAIN_STEP_DEG = 1.6

/**
 * 山符号的朝向。A/B 两版都拍过：'flat' 平铺在纸面 / 'upright' 竖直立起。
 * 结论见调用处注释。
 */
const PEAK_FACING: PeakFacing = 'flat'
const TERRAIN_TOP_BLOCKS = 14

/**
 * 陆地贴图向羊皮纸色混合的比例（0 = 原彩色喷绘，1 = 纯羊皮纸）。
 *
 * 【上一版是 0.55，这一版降到 0.25 —— 理由不是"更好看"，是"更诚实"】
 * 0.55 是把 painted-land.png 往 rgb(219,197,157) 掺了 55%，为的是让
 * 2.5D 和 2D 读作同一张图。方向没错，但代价是**贴图里唯一的高频信息被抹平了**：
 * painted-land 是 1024×512 全球图，每像素约 39km，本来就没有可用的高频细节；
 * 它仅有的信息是**大尺度的生态分带**（撒哈拉沙黄、刚果深绿、格陵兰冰白、
 * 安第斯褐红）。掺到 0.55 之后，这些分带全部落进米黄的同一个色阶，
 * 于是 3D 陆地变成一张纯色纸 —— 近景再怎么加 bump 颗粒也救不回来。
 *
 * 降到 0.25 之后：整体调子仍是羊皮纸（纸色、墨线海岸、山形符号、
 * 经纬网都没变），但大陆内部重新出现"这里是沙漠 / 这里是雨林"的分区。
 * 这也顺带把 2D 的已知缺陷补了一半：2D 按 painted-land 的颜色撒植被符号
 * 时出现"撒哈拉长松树"，而 3D 只撒山（见 mapPeaks3d 的说明），
 * 现在连底色都对上了。
 *
 * 为什么不直接降到 0：0 的时候大陆是浓绿/深褐的彩色喷绘，和奶油羊皮纸的
 * 边框、港口金色、UI 铜木完全不在一个色系里，切视图就是换游戏。
 */
const LAND_PARCHMENT_MIX = 0.25

/**
 * 每个港口上空的海鸥数量。
 * 2 只：1 只读作"一个黑点在转"，3 只以上在微缩尺度上开始像虫群。
 */
const BIRDS_PER_PORT = 2

/** 主光的两种色温端点（正午暖白 / 深夜冷蓝） */
const SUN_COLOR_DAY = new THREE.Color(0xfff1dc)
/** 夜里的水面偏冷：**乘数**（三通道接近 1），不是插值目标色 */
const NIGHT_SEA_TINT_BASE = new THREE.Color(1, 1, 1)

/**
 * 夜里把"墨线"往冷的方向掰：红压 34%、绿压 15%、蓝几乎不动。
 *
 * 目的是让深褐墨线在灰蓝的夜色里仍然读作"墨"，而不是暖色的霓虹边。
 * 白天的 nightK=0，系数正好是 1，不改变任何白天表现。
 * 就地改色彩对象，不新建 Color —— 这是每帧要跑两次的路径，
 * 每帧 new 两个 THREE.Color 属于给 GC 找活干。
 */
function coolLine(c: THREE.Color, nightK: number): void {
  if (nightK <= 0) return
  c.r *= 1 - 0.34 * nightK
  c.g *= 1 - 0.15 * nightK
  c.b *= 1 + 0.04 * nightK
}
const SUN_COLOR_NIGHT = new THREE.Color(0x8fa8d8)

/**
 * 海上遗物在 3D 里的图层数据：**一次建好，逐帧复用**。
 *
 * 【为什么不每帧重建】图标 HTML 里是一段 SVG 字符串，
 * 每帧重建 8 遍字符串 + 8 个闭包纯属浪费（帧循环每秒 60 次）。
 *
 * 【与 2D 读同一份数据】2D 那边也是 `data/relics.ts` 里那 8 件，
 * 拾走之后 2D 与 3D 一起消失——不存在"这边拾过那边还在"的分歧。
 */
const RELIC_ITEMS: SeaStaticItem[] = RELICS.map(r => ({
  id: r.id,
  lat: r.lat,
  lng: r.lng,
  html: relicMarkerHtml(r.kind, r.lore, r.id),
  title: `拾起：${r.name}`,
  near: false,
  onClick: () => useGameStore.getState().collectRelic(r.id),
}))

/**
 * 「够得着 / 够不着」要跟着船走。
 *
 * 遗物有拾取半径：隔着半个大洋点它**不结算**，只回一句「还在多少海里外」。
 * 那提示就不能一直写「拾起：X」——屏幕上说的与实际发生的不一致，
 * 比没有提示更糟（项目硬规矩）。2D 与 3D 用同一个判据
 * （data/relics 的 relicInReach），所以两边不会各说各话。
 *
 * 【为什么在这里改写而不是每帧重建】帧循环每秒 60 次，
 * 每帧重建 8 遍字符串 + 8 个闭包纯属浪费。
 * 这里只在**状态翻转**的那一帧改 title，别的帧一个字都不动。
 */
const RELIC_NEAR = new Map<string, boolean>()
const RELIC_BY_ID = new Map(RELICS.map(r => [r.id, r]))

function syncRelicReach(): void {
  const pos = useGameStore.getState().shipPosition
  for (const item of RELIC_ITEMS) {
    const r = RELIC_BY_ID.get(item.id)
    if (!r) continue
    const near = relicInReach(pos?.[0], pos?.[1], r)
    if (RELIC_NEAR.get(item.id) === near) continue
    RELIC_NEAR.set(item.id, near)
    item.near = near
    item.title = near ? `拾起：${r.name}` : `太远了 · ${r.name}`
  }
}

/** 当前还没被拾走的遗物（拾走一件就少一件） */
function getRelicItems(): SeaStaticItem[] {
  syncRelicReach()
  const st = useGameStore.getState()
  const got = st.collectedRelics
  const day = st.fleet.day
  // 两道过滤：拾过的消失；不在此季的也**不在海面上**（与 2D 同一份判据）
  const allowed = new Set(RELICS.filter(r => relicInSeason(r, day)).map(r => r.id))
  return RELIC_ITEMS.filter(r => (!got || !got.includes(r.id)) && allowed.has(r.id))
}

export default function Map3DView() {  const mountRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading')
  /** 操作提示要按设备改写（手机没有滚轮）；手势本身两条路径都支持 */
  const isMobile = useIsMobile()
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    let disposed = false
    let raf = 0
    let renderer: THREE.WebGLRenderer | null = null
    const disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = []

    const boot = async () => {
      const base = import.meta.env.BASE_URL

      // ---- 资源：陆地数据与两张贴图 ----
      //
      // 【贴图朝向的统一约定】两张贴图都是 flipY=false，即「PNG 第 0 行 = 北极」。
      //   - 陆地：landGeometry 的 UV 直接写 mercNorm(lat)，v=0 就是北 → 对齐
      //   - 海面：几何体 UV 额外翻转过一次（v=0 也是北）→ 同样对齐
      //
      // 【踩过的坑】海面贴图原本用 flipY=true，而几何体那边又把 v 翻了，
      // 等于**上下翻了两次**，南北颠倒：南极那片黑（海面贴图在陆地像素处
      // 原本就没写入）被翻到了北极，在画面上方糊出一大块黑楔形。
      // 实测：翻回来后画面上 1/4 区域的极暗像素占比 8.9% → 0.5%。
      const [geojson, landTex, seaTex, reliefTex] = await Promise.all([
        fetchLandGeojsonForRender(),
        loadTexture(`${base}data/painted-land.png`, false),
        loadTexture(`${base}data/painted-sea.png`, false),
        // 地形法线：由 2048×1024 的高程图算出来，让平坦的陆地顶面
        // 也能被方向光照出山脊的明暗（失败返回 null，退回无起伏的旧样子）
        loadReliefNormalMap(`${base}data/elev-map.png`, { strength: 6 }),
        /*
         * 【第 34 轮：3D 也要等航线几何有结论】
         * 下面建 NPC 商船时会调 getRouteGeometry，而掩码没到位时那几何是
         * **横穿陆地的大圆直线**（塞维利亚→埃尔米纳 439 vs 真值 781 海里）。
         * 2D 那边靠 MapView 的「几何有结论才挂载」解决了（见 MapView 的 mapReady），
         * 3D 这条路径不经过 MapView 的 2D 分支，得自己等。
         *
         * loadLandData() 与 2D 共用同一个 Promise（掩码/geojson 都只请求一次），
         * 掩码失败时它 reject——这里 catch 掉，让 3D 照常出来（退化成直线）。
         */
        loadLandData().catch(() => {}),
      ])
      if (disposed) return

      // ---- 国界线数据 ----
      //
      // 【为什么不跟上面一起 Promise.all】
      // borders.geojson 有 640KB，是国界线的全部内容。
      // 它是**可选图层**：加载失败不该挡住地图出场。
      // 所以单独 await 且失败返回 null（见 utils/mapGeoJson.ts）。
      // 与 2D 的 MapView 共用同一个 Promise，不会下载两趟。
      const bordersGeojson = await fetchBordersGeojson()
      if (disposed) return

      // 这俩是 **let**：窗口 resize 后帧循环里的屏幕投影要用新尺寸
      // （标签层、漂流物层都靠它）。原来是 const，resize 只改了 renderer
      // 和几个 Line2 的 resolution，标签位置就一直按旧尺寸算 —— 整体偏移。
      let width = mount.clientWidth || 800
      let height = mount.clientHeight || 600

      // ---- 渲染器 ----
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
      renderer.setSize(width, height)
      renderer.shadowMap.enabled = true
      /*
       * PCFSoft 而不是 PCF。
       *
       * 【为什么要换】阴影相机是 ±14 世界单位 / 2048² 贴图 ≈ 73 texel/单位，
       * 而港口底座只有 0.3 单位宽 —— 一个投影在屏幕上只有几十 texel，
       * 边缘是一格一格的台阶（8 倍放大下非常明显，像像素画）。
       * PCF 只用固定 4 个采样点做硬边，PCFSoft 的核更大、过渡更宽，台阶被抹开。
       * 只影响阴影边缘，不动光的强度与颜色 —— 海面颜色因此完全不变
       * （换 ambient 会连带改海色，已经排除过）。
       */
      renderer.shadowMap.type = THREE.PCFSoftShadowMap
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.42
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.domElement.style.display = 'block'
      mount.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x0a1018)
      const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 200)

      // ---- 环境光：自建渐变全景，给海面一点反光 ----
      {
        const c = document.createElement('canvas'); c.width = 16; c.height = 128
        const g2 = c.getContext('2d')!
        const grad = g2.createLinearGradient(0, 0, 0, 128)
        grad.addColorStop(0, '#4d7396'); grad.addColorStop(0.5, '#22394d'); grad.addColorStop(1, '#0a151f')
        g2.fillStyle = grad; g2.fillRect(0, 0, 16, 128)
        const envTex = new THREE.CanvasTexture(c)
        envTex.mapping = THREE.EquirectangularReflectionMapping
        envTex.colorSpace = THREE.SRGBColorSpace
        const pmrem = new THREE.PMREMGenerator(renderer)
        scene.environment = pmrem.fromEquirectangular(envTex).texture
        scene.environmentIntensity = 0.72
        disposables.push(envTex)
        pmrem.dispose()
      }

      // ---- 海面 ----
      const seaGeo = new THREE.PlaneGeometry(MAP_WORLD_SIZE, MAP_WORLD_SIZE)
      seaGeo.rotateX(-Math.PI / 2)
      {
        // 世界 Z 从北(-10)到南(+10)，贴图 v=0 在北 → 翻转 v
        const uv = seaGeo.attributes.uv.array as Float32Array
        for (let i = 1; i < uv.length; i += 2) uv[i] = 1 - uv[i]
        seaGeo.attributes.uv.needsUpdate = true
      }
      const seaMat = new THREE.MeshStandardMaterial({
        map: seaTex, roughness: 0.3, metalness: 0.1, envMapIntensity: 1.3,
        /*
         * 【为什么要给 color 一个 >1 的分量】
         * color 在 three.js 里是**乘数**，与贴图逐通道相乘。sea-tile.png 本身是
         * 青绿（G > B），2D 视图靠 CSS 的 background-blend-mode: luminosity 换掉了
         * 色相，但那是 2D 的渲染路径，管不到这里——切到 3D 会像换了个游戏。
         *
         * 要让青绿变深蓝，必须 R、G 压下去、B 抬上来。乘数默认上限是 1，
         * 光靠 clamp 只能压暗不能提蓝，所以 B 给到 1.3（分量允许 >1，
         * 相乘结果 0.23 远不到溢出）。实测海面从 (17,49,43) 变成 B>G>R 的深蓝。
         */
        color: new THREE.Color(SEA_BASE_R, SEA_BASE_G, SEA_BASE_B),
      })
      const sea = new THREE.Mesh(seaGeo, seaMat)
      /*
       * 给海面一个名字。
       *
       * 【为什么】巡检（map3d-check）要读海面材质来验证"暴风雨压暗、晴天恢复"。
       * 它原来是按"宽 20 + 有贴图的 Mesh"挑的——这个判据在浅水带加进来之后
       * 同时命中两块（浅水带也是宽 20 的贴图平面，而且后加入，覆盖了前者），
       * 于是读到一个恒为 (1,1,1) 的材质，断言当场红。
       * 按名字取是唯一稳定的判据，也不会随渲染顺序变化。
       */
      sea.name = 'map3d-sea'
      sea.position.set(MAP_WORLD_SIZE / 2, -PLATE_THICKNESS - 0.004, 0)
      sea.receiveShadow = true
      scene.add(sea)

      /*
       * 岸外的浅水带：陆地与海之间唯一的过渡。
       *
       * 高度：海面在 -PLATE_THICKNESS-0.004（-0.089），叠加层最低的是
       * 洋流/海盗区（-0.0880）。浅水带取 -0.0888——压在海面上、又在所有
       * 叠加线之下，于是"洋流压在浅水上"，层次与真海图一致。
       */
      const shallow = createShallowBand(MAP_WORLD_SIZE, -PLATE_THICKNESS - 0.0032)
      if (shallow) scene.add(shallow.mesh)

      /*
       * ---- 恒向线网 + 罗经花（2D 的身份特征，3D 之前完全没有）----
       *
       * 2D 的海面上有：经纬网、恒向线、罗经花、纸纹 四层。
       * 3D 之前只有经纬网一层，于是那片海读作"低模世界地图"——
       * 切视图不像"换了个视角看同一张海图"，像换了个游戏。
       *
       * 这里补上后两层：线与花都复用 utils/rhumbLines 的同一份几何与常数，
       * 两个视图的射线角度逐度一致（另算一套必然切视图时"线歪了"）。
       * 压到陆地上的那半截靠深度测试被陆地顶盖挡掉，与 2D 的 pane 层叠同效。
       */
      const rhumb = createRhumb3d(-PLATE_THICKNESS - 0.004)
      scene.add(rhumb.group)

      /*
       * 外圈几何：**中间挖掉世界范围的方环**，不是一整块大平面。
       *
       * 【为什么必须是环】原来是一块 90×90 的平面压在海图本体下面，两块面重合。
       * 为了不 z-fighting 把它压低 0.016 世界单位，结果两条边之间留了一道
       * 竖直的缝——斜视时从缝里看到背景，海面上出现一条 2px 的暗线
       * （实测亮度 47 → 36 → 47）。试过同高 + polygonOffset，暗线仍在
       * （掠射角度下 polygonOffsetFactor 会把面推得极远，不可控）。
       * 挖成方环之后两块面**只共享一条边、不再重叠**，可以同高，
       * 既没有缝也没有 z-fighting。
       */
      /** 方环几何（形状坐标在 XY 平面，放平交给 mesh.rotation.x） */
      const squareRing = (halfOuter: number, halfInner: number) => {
        const shape = new THREE.Shape()
        shape.moveTo(-halfOuter, -halfOuter)
        shape.lineTo(halfOuter, -halfOuter)
        shape.lineTo(halfOuter, halfOuter)
        shape.lineTo(-halfOuter, halfOuter)
        shape.closePath()
        const hole = new THREE.Path()
        hole.moveTo(-halfInner, -halfInner)
        hole.lineTo(-halfInner, halfInner)
        hole.lineTo(halfInner, halfInner)
        hole.lineTo(halfInner, -halfInner)
        hole.closePath()
        shape.holes.push(hole)
        // 只建在 XY 平面：绕 X 的放平动作交给 mesh 的 rotation.x，
        // 在几何里再转一次会变成"转两遍"，方环直接立起来（实测整片外圈消失）
        return new THREE.ShapeGeometry(shape)
      }

      const OUTER_HALF = 45
      const OUTER_OVERLAP = 0.3
      /** 方环内沿（= 海图本体的边往里多盖 0.3） */
      const RING_INNER = MAP_WORLD_SIZE / 2 - OUTER_OVERLAP
      /** 淡出带宽度 */
      const FADE_W = 1.5

      const outerGeo = (() => {
        /*
         * 内沿往里多盖 0.3 单位（OUTER_OVERLAP）。
         *
         * 【为什么不能正好贴着海图本体的边】实测那道 2px 暗线不是缝隙，
         * 换洋红验过：它属于**海面本体**——painted-sea.png 最外一行本身是深色
         * （ClampToEdge 采样到贴图边框），于是海图四边各有一圈暗边。
         * 方环多盖一点，把海面那圈暗边压在下面，交界就落在贴图内部正常的区域。
         * 环比海面高 0.002，重叠区由环胜出；因为两者颜色已校准到相差 ≤2 级，
         * 交界本身看不出来。
         */
        return squareRing(OUTER_HALF, RING_INNER)
      })()

      /*
       * 外圈的"由内向外压暗"是**烘进一张灰度贴图**的，并按世界坐标取 UV。
       *
       * 【为什么要压暗】外圈是纯色的，一直铺到 ±45 世界单位；不压的话它
       * 和中间那块有笔触的海面是同一个亮度，读起来像一桶没有内容的水。
       * 往外渐暗到 58%，远处的边自己沉进桌面的暗色里，视线自然收在海图上。
       *
       * 【为什么用贴图而不是顶点色】方环是 ShapeGeometry，顶点只在轮廓上
       * （8 个），做不出连续梯度；退化成"四角一色"会变成一圈斜的棱。
       * 手工细分又要在两条腿上各切十几段，不如一张 Smoothstep 图省事。
       *
       * 【UV 必须按世界坐标算】方环有 4 条腿，按默认 UV（ShapeGeometry 直接
       * 拿形状坐标当 UV）也能用，但四条腿在贴图里的取值区间完全不同，
       * 亮度会在四个角上突变。这里用 (x + 45) / 90 的世界归一化坐标，
       * 梯度就与"离海图多远"严格一致。灰度图是**乘数**，必须
       * NoColorSpace —— 用 sRGB 解码会把 0.58 解成 0.29，一圈边直接黑掉。
       */
      const outerVignette = (() => {
        const S = 256
        const c = document.createElement('canvas')
        c.width = c.height = S
        const g = c.getContext('2d')!
        const img = g.createImageData(S, S)
        /** 压暗走完的距离（世界单位）；再往外保持最深 */
        const SPAN = 14
        const MIN_V = 0.58
        for (let py = 0; py < S; py++) {
          for (let px = 0; px < S; px++) {
            const wx = ((px + 0.5) / S) * 2 * OUTER_HALF - OUTER_HALF
            const wy = ((py + 0.5) / S) * 2 * OUTER_HALF - OUTER_HALF
            // 到中心的"切比雪夫距离"：方环的内沿整条边正好是 RING_INNER，
            // 用欧氏距离的话四个角（14）比边中点（9.7）远得多，会先暗下去，
            // 在海图四角外面留下四块深斑。
            const d = Math.max(Math.abs(wx), Math.abs(wy))
            const t = Math.min(1, Math.max(0, (d - RING_INNER) / SPAN))
            const v = 1 - (1 - MIN_V) * (t * t * (3 - 2 * t))
            const q = Math.round(v * 255)
            const o = (py * S + px) * 4
            img.data[o] = q
            img.data[o + 1] = q
            img.data[o + 2] = q
            img.data[o + 3] = 255
          }
        }
        g.putImageData(img, 0, 0)
        const t = new THREE.CanvasTexture(c)
        t.colorSpace = THREE.NoColorSpace
        t.minFilter = THREE.LinearFilter
        t.magFilter = THREE.LinearFilter
        t.wrapS = THREE.ClampToEdgeWrapping
        t.wrapT = THREE.ClampToEdgeWrapping
        return t
      })()
      {
        const p = outerGeo.attributes.position
        const uv = new Float32Array(p.count * 2)
        for (let i = 0; i < p.count; i++) {
          uv[i * 2] = (p.getX(i) + OUTER_HALF) / (OUTER_HALF * 2)
          uv[i * 2 + 1] = (p.getY(i) + OUTER_HALF) / (OUTER_HALF * 2)
        }
        outerGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
      }

      const outer = new THREE.Mesh(
        outerGeo,
        /*
         * 【为什么用 MeshBasicMaterial（不受光）】
         * 这层是"海图之外的水"，铺满屏幕四周，不参与任何光照叙事。
         * 用 Standard 材质时它会被 scene.environment 洗成中性灰：实测给
         * color=(0.21,0.24,0.35) 的深蓝，渲染出来是 rgb(93,87,87) 的灰——
         * 比海面 (9,56,74) 还亮，边界反而更刺眼。
         * 不受光材质只有一个可调项（颜色），与海面的对应关系稳定可调，
         * 天气也只需要走同一个 setSeaColor 就能同步。
         */
        new THREE.MeshBasicMaterial({ color: 0x0a2230, map: outerVignette })
      )
      outer.rotation.x = -Math.PI / 2
      outer.position.set(MAP_WORLD_SIZE / 2, -PLATE_THICKNESS - 0.004 + 0.002, 0)
      scene.add(outer)

      /*
       * 海图边缘的「淡出带」。
       *
       * 【为什么需要】海面贴图是一块**有限的 20×20 单位**，方环是纯色。
       * 两者靠"颜色校准到 ±2 级"只能消掉**颜色**的阶跃，消不掉**纹理**的：
       * 3 倍放大截图里，交界是一条笔直的斜线，线外侧的波纹、笔触同时消失，
       * 像把海图剪了个正方形。颜色对了不等于边界不存在。
       *
       * 【做法】在最后 1.5 单位内，把外圈的水色按 alpha 0→1 盖上去，
       * 让波纹"化"进水色，而不是被一刀切。带子外沿正好落在方环内沿
       * （alpha=1 处的颜色与方环同源），三块面之间没有任何颜色阶跃。
       *
       * 【为什么是 4 条四边形，不是 ShapeGeometry 挖个细环】Earcut 处理细环时
       * 会插一条贯穿整条带的"洞桥"三角形，顶点 alpha 在桥的两端插值，
       * 边界上就会冒出一道斜楔。手工 4 条带，内外两个边界全部落在顶点上，
       * 梯度只沿边的法线方向线性变化，不可能歪。
       *
       * 【为什么 depthWrite=false】带子是半透明的覆盖层，压在海面上方 0.003；
       * 写深度会让它挡住同一位置后续要画的半透明物件（航线箭头、尾迹）。
       */
      const fadeMat = new THREE.MeshBasicMaterial({
        color: 0x0a2230,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const fadeGeo = (() => {
        const pos: number[] = []
        const col: number[] = []
        const idx: number[] = []
        /**
         * 一条带。a0..a3 逐顶点给 alpha——**不要按"内/外"起变量名**：
         * 第一版写成 (aOut0, aIn0, aIn1, aOut1) 并按"先外后内"填，
         * 结果两条边的 alpha 各自沿 x 变化、沿 y 是常数，
         * 剖面测出来是一段 1.2 单位长的平板色（不是梯度），
         * 而截图上看不出问题——遮蔽贴图渐变只能靠像素剖面。
         */
        const strip = (
          x0: number, y0: number, x1: number, y1: number,
          x2: number, y2: number, x3: number, y3: number,
          a0: number, a1: number, a2: number, a3: number,
        ) => {
          const b = pos.length / 3
          pos.push(x0, y0, 0, x1, y1, 0, x2, y2, 0, x3, y3, 0)
          col.push(
            1, 1, 1, a0, 1, 1, 1, a1,
            1, 1, 1, a2, 1, 1, 1, a3,
          )
          idx.push(b, b + 1, b + 2, b, b + 2, b + 3)
        }
        const o = RING_INNER
        const i = RING_INNER - FADE_W
        // 内沿（离海图中心近）= 0，外沿（贴着方环）= 1
        // 北 / 南（shape 的 y 正 = 世界 z 负）
        strip(-o, i, o, i, o, o, -o, o, 0, 0, 1, 1)
        strip(o, -o, -o, -o, -o, -i, o, -i, 1, 1, 0, 0)
        // 西 / 东（四角已由南北两条盖住，这里只补中间那段）
        strip(-o, -i, -i, -i, -i, i, -o, i, 1, 0, 0, 1)
        strip(o, i, i, i, i, -i, o, -i, 1, 0, 0, 1)
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4))
        geo.setIndex(idx)
        return geo
      })()
      const fade = new THREE.Mesh(fadeGeo, fadeMat)
      fade.rotation.x = -Math.PI / 2
      fade.position.set(MAP_WORLD_SIZE / 2, -PLATE_THICKNESS - 0.004 + 0.003, 0)
      scene.add(fade)

      disposables.push(seaGeo, seaMat, outer.geometry, outer.material, outerVignette, fadeGeo, fadeMat)

      /*
       * 海色只有一处写法。
       *
       * 【为什么必须收成一个函数】海图是两块面：`sea`（地图范围内，带贴图）和
       * `outer`（地图之外 90×90 的"远处的水"）。天气一变只改 sea 的颜色，
       * 边界上就会当场裂出一条直线——实测晴天时海面 rgb(9,56,74)、外面 rgb(14,21,19)，
       * 一条硬切把"海图"切成"棋盘上的一块板"。海盗区泛红时同理。
       * 所以两块面共用这一个写入口，任何调海色的地方都走这里，不许单独 setRGB。
       *
       * 【外圈为什么不能跟着乘同一个数】sea 的颜色是**和贴图相乘**的，贴图本身很暗；
       * outer 没有贴图，同样的乘数会让它亮出一大截（实测 color=sea×0.26 时，
       * 外圈渲染成 rgb(179,180,191) 的灰白，比海面还亮）。
       * 所以外圈给一套独立的线性基色，只按"海色的 R 相对基色的比例"缩放——
       * 天气压暗/雾化时比例跟着走，两边不会脱钩。
       *
       * OUTER_BASE 是解出来的，不是拍脑袋：目标是把外圈渲染成接近海面的深海色
       * rgb(12,40,52)。sRGB(12,40,52) → 线性 (0.0037,0.0215,0.0331)；
       * three 的 ACES 在暗部是**提亮**的（x=0.35 会输出 0.49），反解 ACES 得到
       * 输入约 (0.010,0.031,0.042)。实测按此设置后外圈落在 rgb(11,38,50)。
       */
      const OUTER_BASE: [number, number, number] = [0.0052, 0.0435, 0.068]
      const outerMat = outer.material as THREE.MeshBasicMaterial
      /**
       * 外圈/淡出带的**基色**（未乘日相）。
       *
       * 【为什么必须留一份基色】这两块是不受光材质，光照压不暗它们；
       * 而日相要每帧写一次颜色。如果直接在材质色上乘，就会一帧一帧地
       * 连乘下去（晚上一秒变纯黑）。所以：setSeaColor 写基色，
       * 每帧的日相段用 `基色 × 日相色` 覆盖回去。
       */
      const outerBaseColor = new THREE.Color()
      /** 海盗事件把海面染红时的加项（emissive 的等价物，不受光材质只能加到颜色上） */
      let pirateR = 0, pirateG = 0, pirateB = 0
      /*
       * ---- 航季色调 ----
       *
       * 【为什么乘在 setSeaColor 里面，而不是让每个调用方自己乘】
       * 海色有三个来源：天气（晴/雾/阴/雨/风暴）、海盗染红、初始化。
       * 逐个乘一遍，只要漏一处就会出现"晴天是夏天的颜色、阴天变回春天的颜色"。
       * 这里让 setSeaColor 收**中立色**（天气算完、不含季节），
       * 由它统一乘季节，于是季节对所有路径自动生效。
       *
       * 【为什么重新写入要保留中立色】海盗那段原来写
       * `setSeaColor(seaMat.color.r, ...)`（把已经乘过季节的颜色再喂回来），
       * 加了季节之后那会变成**连乘两次**。所以留一份 seaNeutral。
       */
      let seasonSeaTint: [number, number, number] = [1, 1, 1]
      let seaNeutral: [number, number, number] = [SEA_BASE_R, SEA_BASE_G, SEA_BASE_B]
      let seasonLandTint: [number, number, number] = [1, 1, 1]

      const applySeaColor = () => {
        const r = seaNeutral[0] * seasonSeaTint[0]
        const g = seaNeutral[1] * seasonSeaTint[1]
        const b = seaNeutral[2] * seasonSeaTint[2]
        seaMat.color.setRGB(r, g, b)
        const k = SEA_BASE_R > 0 ? r / SEA_BASE_R : 1
        const or = OUTER_BASE[0] * k + pirateR
        const og = OUTER_BASE[1] * k + pirateG
        const ob = OUTER_BASE[2] * k + pirateB
        outerBaseColor.setRGB(or, og, ob)
        outerMat.color.setRGB(or, og, ob)
        // 淡出带必须和方环**逐位相同**：两者都是不受光材质、都没有颜色乘数，
        // 只要差一级，内沿（alpha 从 0 走到 1 的地方）就会重新长出一条细线的
        // 影子——那正是这次要消灭的东西。
        fadeMat.color.setRGB(or, og, ob)
      }
      const setSeaColor = (r: number, g: number, b: number) => {
        seaNeutral = [r, g, b]
        applySeaColor()
      }
      setSeaColor(SEA_BASE_R, SEA_BASE_G, SEA_BASE_B)

      // ---- 陆地板块 ----
      const land = buildLandGeometry(geojson as unknown as Parameters<typeof buildLandGeometry>[0])
      const lidMat = new THREE.MeshStandardMaterial({
        map: landTex, roughness: 0.88, metalness: 0.02,
      })
      /*
       * 地形法线：让平坦的陆地顶面被方向光照出山脊明暗。
       *
       * 陆地顶面**没有内部顶点**（几何只有海岸线上的点），所以位移做不出内陆的山。
       * 一块纯平板配一盏方向光 = 一整片均匀亮度，实测南美/非洲/西伯利亚
       * 的地面颜色几乎一样，"融化塑料"就是这么来的。
       * 山的形状其实早就画在 painted-land 里了，只是它不参与光照；
       * 补一张法线图之后，同一盏光就会在迎光面提亮、背光面压暗。
       *
       * 用 normalMap 槽位而不是再塞 bumpMap：bumpMap 已经被纸纹颗粒占着
       * （repeat 22×，近景 1:1 像素），换掉就是拿颗粒换地形。两张各管一头。
       */
      if (reliefTex) {
        lidMat.normalMap = reliefTex
        /*
         * 0.6 而不是 1。
         *
         * 实测 0.85 时安第斯与喜马拉雅读作**撕裂的碎片**：迎光面接近纯白、
         * 背光面接近深褐，两三个像素之内就跳完，没有过渡。
         * 那是 DEM 在陡坡处的梯度被整体放大造成的——高程图 2048 宽，
         * 一个像素 0.176° ≈ 19km，安第斯真实宽度就是几个像素，
         * 于是"坡"在图上是一道硬边。
         *
         * 压到 0.6 之后脊线还在（能认出安第斯、喜马拉雅、阿尔卑斯、
         * 东非大裂谷），但明暗之间有了中间调，读作"山"而不是"裂口"。
         * 平原本来就没有梯度，压这一档对它们没有任何影响。
         */
        lidMat.normalScale.set(0.6, 0.6)
        /*
         * **不放进 disposables**：这张图是 `loadReliefNormalMap` 按 url 缓存的，
         * 2D/3D 来回切视图时会复用同一个 THREE.Texture。
         * 卸载时释放掉，下一次挂载拿到的就是一张已经 dispose 过的纹理
         * （three 会重新上传，但那份 2048×1024 的解析结果白算了，还得重算一遍）。
         * 缓存住、只在页面卸载时随上下文一起走，才是它该有的生命周期。
         */
        lidMat.userData.reliefMounted = true
      }
      /*
       * 陆地的高频细节：bumpMap（不是自绘着色器）。
       *
       * 【为什么不是 onBeforeCompile 注入 albedo 乘算】
       * 试过，而且"看起来"完全正常：注入的源码确实进了片元着色器
       * （canary 抓到 `texture2D(uGrain, vMapUv * uGrainScale)`）、
       * uniform 里也确实放着一个 CanvasTexture，但屏幕上**一个像素都没变**。
       * 把 uGrainScale 调到 1.2 / uGrainWeight 调到 1.0 也不变 ——
       * 说明采样器没绑上：three 只给"材质自身属性"里的贴图建 uniform，
       * 自定义 uniform 里的 Texture 在 setValueT1 拿到的是空值，
       * 于是退回默认纹理（≈白），乘了等于没乘。
       * HF（相邻像素差）实测 0.56 → 0.60，和海面 0.46 基本同档。
       *
       * 【为什么 bumpMap 反而更对】
       * 1) 它是材质自带通道，uniform / UV 变换（repeat、wrap、channel）
       *    全由 three 接管，不可能出现"代码在、画面上没有"；
       * 2) 它扰动的是**法线**而不是颜色 —— 纸的"齿"、岩土的颗粒，
       *    本来就是在掠射光下靠明暗读出来的，压 albedo 只会像脏点；
       * 3) 代价只有一次额外采样。
       *
       * 颗粒贴图必须自己 repeat：bumpMap 用的是 uv0（0..1 铺满整张海图），
       * 不 repeat 的话一张 256px 图摊在 20 世界单位上，近景是一团糊。
       * 22 次 → 每格 0.9 单位，近景刚好 1:1 像素左右。
       */
      /*
       * ---- 陆地的"图纸调子" ----
       *
       * 【为什么必须做】2D 与 2.5D 是同一个游戏的两张脸，现在它们不是：
       *   2D  = 奶油羊皮纸 + 墨线海岸 + 树木/山形符号（波托兰海图）
       *   2.5D = painted-land 的彩色喷绘，**一根线都没有**
       * 切一次视图像换了个游戏，而且技术更强的那个说服力反而更弱。
       *
       * 【做法】把贴图色向羊皮纸色混合。2D 的纸色是 rgb(219,197,157)
       * （utils/paperTexture 的 BASE），这里用同一个数——两个视图同一个"纸"。
       *
       * 【为什么用 onBeforeCompile 的常量混色，而不是给材质设 color】
       * color 是**乘数**：只能压暗、不能提亮，也不可能把绿色调成奶油色
       * （乘法在数学上改不了色相方向）。这里要的是"往奶油色靠"，
       * 只能 mix。而常量 mix 不涉及贴图采样——上次给自定义 uniform 塞
       * CanvasTexture 时采样器根本没绑上（白做了一个颗粒），这次没有那个风险。
       */
      {
        const anchoropts = { mix: LAND_PARCHMENT_MIX }
        lidMat.onBeforeCompile = (shader) => {
          const anchor = '#include <map_fragment>'
          lidMat.userData.toneInjected = shader.fragmentShader.includes(anchor)
          if (!lidMat.userData.toneInjected) return
          shader.uniforms.uParchMix = { value: anchoropts.mix }
          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <map_fragment>',
              `#include <map_fragment>
              // 只动色相/明度，不动 alpha；羊皮纸色与 2D 的纸纹同源
              diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.859, 0.773, 0.616), uParchMix);`,
            )
            .replace('#include <common>', '#include <common>\nuniform float uParchMix;')
        }
      }

      {
        const grainCanvas = buildGrainCanvas(256)
        if (grainCanvas) {
          const grainTex = new THREE.CanvasTexture(grainCanvas)
          grainTex.colorSpace = THREE.NoColorSpace
          grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping
          grainTex.repeat.set(GRAIN_TILES, GRAIN_TILES)
          grainTex.anisotropy = 4
          grainTex.needsUpdate = true
          lidMat.bumpMap = grainTex
          lidMat.bumpScale = GRAIN_BUMP
          disposables.push(grainTex)
          lidMat.userData.grainMounted = true
        }
      }

      // 侧壁（海岸薄边）。
      //
      // 【为什么加 emissive】侧壁是垂直面，背对主光的那一面只被
      // ambient（冷蓝 0x3d5470）照到，实测渲染出来接近纯黑，
      // 于是整圈海岸变成一道**黑锯齿边**——看起来像毛刺，不像浮雕。
      // （改色法取证：把 wall 改成纯红，那圈黑边原位变红，确认归属。）
      //
      // 加一点暖色自发光当"底光"，让背光面仍读作暗棕色的岩壁，
      // 而不是被吃掉的黑色剪影。这是"给暗部补光"，不是"取消阴影"。
      //
      // 【明暗改由顶点色承担】原来整个侧壁是一色 0xa89066 的纯色面膜，
      // 近景下就是一圈又厚又亮的均匀色带（像蛋糕盒）。现在几何里带了
      // 逐顶点的垂直渐变（顶棱亮 → 中段岩土色 → 水线暗），所以这里的 color
      // 必须是纯白（three 的最终色 = material.color × vertexColor），
      // emissive 也要压下来，否则平铺的自发光会把渐变的暗部重新提亮、白做。
      /*
       * 【为什么最终改成不受光材质（MeshBasicMaterial）】
       * 侧壁是"切开的岩层截面"，它的明暗应该由**画好的顶点色**决定，
       * 而不是由光线的入射角决定。可实测反复出问题：相邻墙面的绕向/法线并不一致，
       * 受光后每个竖条亮度不同，整圈海岸变成了**瓦楞纸**——一排明暗相间的板缝，
       * 局部甚至接近全黑。
       * 排查过程（都记下来，免得下次重走）：放大法线合并容差（无效）→
       * 关 receiveShadow（无效）→ 设 DoubleSide（无效）→ 最后定位到 flipWinding
       * 漏交换 color（已修，条纹减轻但仍有残余，因为法线本身不连续）。
       *
       * 换成不受光后：颜色 = vertexColors（顶棱亮 → 中段 → 水线暗），完全确定，
       * 且必须 DoubleSide——不受光材质下，绕向不一致的墙面若单面渲染会被剔除，
       * 露出背面形成"黑缝"。
       * 代价是它不再跟着灯光变化，所以天气压暗时要**手动**同步一次倍率
       * （见下面天气段里的 wallMat.color.setScalar(dim)）。
       */
      const wallMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        vertexColors: true,
        side: THREE.DoubleSide,
      })

      /*
       * 【试过、量过、撤掉的：岩层纹理（B4 tile_rock_face）】
       *
       * 侧壁原来没有 UV，这次在 landGeometry 里补了（见那边的 pushTri），
       * 然后真的把 1024² 岩层图贴上、亮度补偿到 1.75 做了 A/B。
       *
       * 结果：**看不出来**。
       *   · 默认视角（俯视）整块区域逐像素 avg 差异 2.27（1~2 个色阶，不可见）；
       *   · 把相机压到接近水平、放大到侧壁占屏，侧壁在屏幕上只有 6~15px 高，
       *     而 v 方向重复 2 次 → 每层 3~7px，读不出层理，只是一条褐色带。
       *
       * 根因不是纹理质量，是 `PLATE_THICKNESS = 0.085`：1 单位≈2000km，
       * 这块"崖壁"在战略尺度上本来就只有几十公里高，没有足够像素承载层理。
       * 贴图还要多付 175KB 与一次采样，所以撤掉。
       *
       * UV 保留在几何里：以后若把板块加厚（或做"近岸悬崖"局部加厚），
       * 这张图就能直接用，不必再改几何。
       */
      const lidMesh = new THREE.Mesh(land.lid, lidMat)
      lidMesh.castShadow = true; lidMesh.receiveShadow = true
      const wallMesh = new THREE.Mesh(land.wall, wallMat)
      wallMesh.castShadow = true; wallMesh.receiveShadow = true
      scene.add(lidMesh, wallMesh)
      disposables.push(land.lid, land.wall, lidMat, wallMat)

      /*
       * ---- 海岸墨线 + 经纬网 ----
       *
       * 【这两条是"从渲染图变回海图"的关键】
       * 陆地调成羊皮纸色之后，缺的最后一层是**线**：2D 的陆地是
       * 「奶油色填充 + #3d2810 深褐描边」，海岸是硬的；3D 之前只有贴图渐变，
       * 海岸是软的（4 倍放大看不到一根线），小岛更是一坨没轮廓的土黄。
       * 经纬网则是海图的"身份证"：它声明这是一张用来量位置的图。
       *
       * 海岸线直接复用 land.geojson 的环，不再加载 coastline.geojson
       * （两者的坐标 99.5% 重复，2D 那边已经删过一次）。
       * 分大陆/小岛两条线是照抄 2D 的 landStyleFor 判据：
       * 60% 的陆地是十几公里的碎块，远景只有 2~3 像素，
       * 给它们上 1.5px 深褐描边会让整片海域浮一层褐色杂点。
       */
      const coast = buildMap3DCoastline(geojson as unknown as Parameters<typeof buildMap3DCoastline>[0])
      for (const l of coast.lines) scene.add(l)
      for (const m of coast.materials) m.resolution.set(width, height)

      const graticule = buildMap3DGraticule(GRATICULE_Y)
      scene.add(graticule.lines)
      graticule.material.resolution.set(width, height)

      /*
       * 这两组线是**不受光材质**（LineMaterial 不吃光照），所以它们不会跟着
       * 昼夜与天气变化 —— 和侧壁、外圈是同一个坑：夜里整张图暗下去，
       * 只有它们还亮着，海面上会浮出一张发光的网、海岸像镶了银边。
       * 记下基色，每帧在日相段里乘同一个倍率。
       */
      const coastBase = coast.materials.map(m => m.color.clone())
      const gratBase = graticule.material.color.clone()

      /*
       * ---- 地形符号（山）----
       *
       * 【为什么必须等高程图】符号一旦生成就是固定的世界坐标。
       * 先按"不看高程"撒一遍、等高程到了再重撒，屏幕上会看到整片山跳一次
       * （2D 的 TerrainDecor 也是为这个才等它）。高程图 394KB，比看它跳便宜。
       * 加载失败就退回不看高程的旧行为——不能让地形整层消失。
       *
       * 【为什么是异步 .then 而不是 await】这一段在 useEffect 的 async 初始化里，
       * await 会把整张海图的出现推迟到高程解码之后；.then 让它先出图、
       * 山晚一两帧补上（那时玩家还在看开场对白）。
       */
      /**
       * 山的容器组。
       *
       * 【为什么要有这一层】'upright' 朝向需要让所有符号一起绕竖轴转向相机。
       * 逐个实例改矩阵是每帧几千次 compose；而所有山共用一个朝向，
       * 只需要转这个**组**（每帧一次），成本可忽略。
       * 'flat' 时这个组什么都不做，只是容器。
       */
      const peakGroup = new THREE.Group()
      peakGroup.name = 'map3d-peak-group'
      scene.add(peakGroup)
      /** 山材质的基色（白）：不受光，昼夜要手动乘 */
      const peakBase = new THREE.Color(1, 1, 1)
      /** 已经建好的山材质（帧循环里要乘昼夜倍率；异步补建后才有内容） */
      const peakMats: THREE.MeshBasicMaterial[] = []
      let peaks: ReturnType<typeof buildMap3DPeaks> | null = null
      loadElevationSampler(`${import.meta.env.BASE_URL}data/elev-map.png`).then((elev) => {
        if (disposed) return
        const symbols = buildTerrainSymbols(geojson as unknown as GeoJSON.GeoJsonObject, {
          elevationAt: elev ?? undefined,
          topBlocks: TERRAIN_TOP_BLOCKS,
          stepDeg: TERRAIN_STEP_DEG,
        })
        /*
         * 3D 用的是「比邻域均值高」的山脊判据，不是绝对高程 ——
         * 原因与实测数字写在 filterPeaksByElevation 的注释里：
         * 绝对阈值 0.25 会让伊比利亚只有 2%（那里真有山），
         * 改成相对高度后 39%，而法国平原/亚马逊/澳洲内陆/东欧平原都是 0%。
         */
        const strong = filterPeaksByElevation(symbols, elev)
        /*
         * 雪态要**同时看纬度与海拔**：只按纬度时阿尔卑斯（46°N 却很高）没雪、
         * 西伯利亚平原（60°N 是平地）有雪，两边都反了。
         * 高程采样器在这里本来就有（elev），顺手传给雪态判定。
         */
        peaks = buildMap3DPeaks(strong, PEAK_Y, PEAK_FACING, {
          elevAt: elev ? (la, ln) => elev(la, ln) : undefined,
        })
        for (const m of peaks.meshes) peakGroup.add(m)
        // 寒季雪的两个组挂进同一个 peakGroup（add 会把它们从上面那轮里重新挂过来）
        peakGroup.add(peaks.coldGroups.north, peaks.coldGroups.south)
        for (const m of peaks.materials) m.color.copy(peakBase)
        for (const mat of peaks.materials) peakMats.push(mat)
        /*
         * 建好就立刻按当前航季定一次雪态。
         *
         * 【为什么不能只靠帧循环里那次】山是**异步**建好的（要先解码高程图），
         * 而帧循环只在"季相变化"时切换可见性；等到山建好时，
         * 那次切换早就在 peaks 还是 null 的时候空转过去了 ——
         * 实测三季的可见性全是 true，等于没做。
         */
        {
          const si = seasonAt(useGameStore.getState().fleet.day).index
          const coldNorth = si >= 2
          peaks.coldGroups.north.visible = coldNorth
          peaks.coldGroups.south.visible = !coldNorth
        }
      })

      /*
       * ---- 云影 ----
       *
       * 【为什么是"贴地"的一层，不是空中的一块板】云影是投影，应该贴地表；
       * 空中放板在斜视时会露出边缘、低仰角时糊住半个天。
       *
       * 【为什么必须用 offset 平移 + 可平铺贴图】这层的存在感全靠"在动"。
       * 非平铺的图一平移就会露边，只能靠淡入淡出遮丑，那会变成明暗脉搏。
       *
       * 【为什么颜色接近纯黑、透明度只有 0.26】云影不该改色相，只该压暗。
       * 用普通混合（不是 multiply）是因为 multiply 在 alpha 边缘会失真，
       * 而这层要的恰恰是"边缘柔和地消失"。
       *
       * 【为什么比海图更大（90×90）】拉到最远（dist≈40）时可见范围约 ±25，
       * 90 保证平面边缘始终在画面外；再小就会看到"云的边界"。
       */
      const cloudTex = (() => {
        const canvas = buildCloudShadowCanvas(cloudBlobs())
        if (!canvas) return null
        const t = new THREE.CanvasTexture(canvas)
        t.colorSpace = THREE.NoColorSpace
        t.wrapS = t.wrapT = THREE.RepeatWrapping
        // 一张图覆盖 90/2.2 ≈ 41 世界单位：云团直径约 4~8 单位，
        // 与"一条船几秒钟穿过一朵云"的观感对得上
        t.repeat.set(2.2, 2.2)
        t.needsUpdate = true
        return t
      })()
      let cloudMesh: THREE.Mesh | null = null
      if (cloudTex) {
        const cloudMat = new THREE.MeshBasicMaterial({
          color: 0x050a10,
          map: cloudTex,
          transparent: true,
          opacity: 0.26,
          depthWrite: false,
        })
        const cloudGeo = new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2)
        cloudMesh = new THREE.Mesh(cloudGeo, cloudMat)
        // 0.012：比陆地顶面（y=0）高一点点、比港口底座顶面（≈0.06）低，
        // 所以影子落在陆地与海面上，但不会"从下往上"盖住建筑
        cloudMesh.position.set(MAP_WORLD_SIZE / 2, 0.012, 0)
        cloudMesh.renderOrder = 2
        cloudMesh.name = 'map3d-cloudshadow'
        scene.add(cloudMesh)
        disposables.push(cloudGeo, cloudMat, cloudTex)
      }

      // ---- 微缩港口 ----
      const portKit = createPortModelKit()
      const shipKit = createShipModelKit('player')
      /*
       * NPC 用**另一个套件**（冷灰帆、无红旗）。
       * 原来两家共用一个套件、只靠 0.72 缩放区分 —— 默认视野下船长 30~40px，
       * 28% 的尺寸差几乎读不出来。材质各一份的代价只是多两份 uniform。
       */
      const npcKit = createShipModelKit('merchant')
      disposables.push(
        portKit.base, portKit.house, portKit.roof, portKit.pole, portKit.flag,
        portKit.tower, portKit.towerTop, portKit.unit,
        portKit.baseMat, portKit.houseMat, portKit.poleMat, portKit.flagMat,
        portKit.towerMat, portKit.woodMat, portKit.deckMat,
        // 屋顶材质按 region 分四套（Record），要展开成单个材质再登记
        ...Object.values(portKit.roofMat),
        shipKit.hull, shipKit.deck, shipKit.mast, shipKit.sail, shipKit.yard, shipKit.bowsprit,
        shipKit.hullMat, shipKit.deckMat, shipKit.mastMat, shipKit.sailMat,
      )

      /*
       * 海鸥：所有港口共用**一个** InstancedMesh。
       *
       * 【为什么不是每港一个 sprite】20 个港 × 2 只 = 40 次 draw call，
       * 而它们加起来不到屏幕的 0.1%。InstancedMesh 把 34 只鸟压成 1 次。
       *
       * 【为什么几何要放平（rotateX(-90°)）】相机是俯视 30~40°，竖着的
       * 平面在屏幕上几乎是**一条线**（正视自己朝向后就等于边看一张纸）。
       * 放平之后俯视看到的才是"从上面看一只展翅的鸟"。
       */
      const birdGeo = new THREE.PlaneGeometry(0.032, 0.016).rotateX(-Math.PI / 2)
      const birdTex = createBirdTexture()
      const birdMat = new THREE.MeshBasicMaterial({
        map: birdTex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const birds = new THREE.InstancedMesh(birdGeo, birdMat, ports.length * BIRDS_PER_PORT)
      birds.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      // 实例矩阵每帧都在动，包围球按默认几何算出来是错的 → 直接关掉视锥剔除
      birds.frustumCulled = false
      birds.name = 'map3d-birds'
      scene.add(birds)
      disposables.push(birdGeo, birdMat, birdTex)
      const birdDummy = new THREE.Object3D()

      const portGroup = new THREE.Group()
      const portObjects: { group: THREE.Group; id: number; label: ScreenLabel }[] = []
      for (const p of ports) {
        // 模型按港口自身的 services 分三档规模 + 只有能修船的港才有干船坞
        // （见 models.ts 的 portScaleOf / makePortModel）
        const g = makePortModel(portKit, p)
        g.position.set(lonToWorldX(p.longitude), 0, latToWorldZ(p.latitude))
        g.userData.portId = p.id
        portGroup.add(g)
        const label = createPortLabel(mount, p.nameCn, g.position.x, g.position.z)
        portObjects.push({ group: g, id: p.id, label })
      }
      scene.add(portGroup)

      // ---- 「当前所在港口」的地面光环 ----
      //
      // 【为什么必须有】2D 的 PortMarker 用「34px + 发光 + portPulse 脉冲动画」
      // 标出船所在的港口（未发现/其它港只有 28px 静态图标）。
      // 3D 里原本没有任何对应信号：玩家只要不记得自己从哪出发，就看不出"我在哪个港"。
      // 这个缺口在本轮更明显——停泊时为了不遮住港口，船被挪开 0.6 并缩小，
      // 方位感进一步变弱。
      //
      // 做法：平躺的圆环套在港口底座外圈，用 MeshBasicMaterial 不受光照影响（夜里也亮），
      // 透明度做 2.5s 脉冲——节奏与 2D 的 portPulse 一致，切换视图时观感连贯。
      //
      // 【为什么几何是 (1, 1.2) 的"单位环"】三档底座的半径不同（0.228 / 0.19 / 0.144），
      // 用一个固定尺寸的环会在大港上显得松、小港上显得太宽。
      // 单位环 × 缩放系数（= 底座半径 + 0.01）就能贴合每一档。
      /*
       * 【为什么环变细、变成金色】
       * 原来是 (1, 1.2) 的环——径向厚度占半径的 20%，在近景下是一圈又粗又平的
       * 米白色垫圈，像 UI 控件扣在地形上，和铜木金边的材质语言不搭。
       * 真实海图上的"当前港口"标记是**嵌在图上的一道细铜环**：
       * 厚度约 6%、颜色偏黄铜、边缘比中间亮一点。
       * 所以改成 (1, 1.06) + #e8c87e，并用两层复叠做出"铜丝 + 微光"：
       * 细环本体不透明一些，外圈再压一层极淡的宽环当辉光。
       */
      const currentPortRing = new THREE.Mesh(
        new THREE.RingGeometry(1, 1.06, 64).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({
          color: 0xe8c87e, transparent: true, opacity: 0.9,
          side: THREE.DoubleSide, depthWrite: false,
        }),
      )
      currentPortRing.name = 'current-port-ring'
      currentPortRing.visible = false
      currentPortRing.renderOrder = 4
      scene.add(currentPortRing)
      disposables.push(currentPortRing.geometry, currentPortRing.material)

      // ---- 区域名（海名 + 洲名）----
      //
      // 【为什么 3D 也要有】
      // 2D 的 OceanLabels 一直显示这 28 个名字。3D 里没有的话，
      // 玩家切到立体海图就失去了"我在哪个大洋/哪块大陆"的方位感——
      // 而这恰恰是斜俯视地图最难自己读出来的信息。
      // 数据来自 @/data/mapLayers，与 2D 同一份定义。
      const areaLabels = createAreaLabels(mount)
      const allLabels: ScreenLabel[] = [...portObjects.map(p => p.label), ...areaLabels]
      measureLabels(allLabels)
      remeasureWhenFontsReady(allLabels)

      // ---- 海面漂流物（与 2D 同一份 debrisSpots / 同一段图标 HTML）----
      //
      // 【为什么 3D 也要有】2D 海面上漂着可点的木桶，切到 2.5D 突然全没了，
      // 玩家不会想到"这是渲染层的差别"，只会觉得这边少了东西、或者自己点不到。
      // 投影方式复用标签层：世界坐标 → 屏幕像素 → 绝对定位 DOM。
      const seaLayer = createSeaLayer3d(mount, getRelicItems)

      // ---- 玩家船 ----
      // 船尾尾迹：航行时才出现（见 shipWake.ts）
      const wake = createShipWake()
      scene.add(wake.mesh)

      const ship = makeShipModel(shipKit)
      // 起个名字，供 e2e 找到它（验证停泊时不会把港口模型盖住）
      ship.name = 'map3d-ship'
      scene.add(ship)

      // ---- 海盗事件的"3D 演出"：只做海面泛红，不做敌船 ----
      //
      // 【这是本轮量出来的成本结论，写在这里免得下次又试一遍】
      // 试过在地图上放一艘敌船逼近玩家（复用 shipModel + 深色材质），实测走不通：
      //   ① 事件卡占屏幕中央 416×562（1440×900），玩家船正好在屏幕中心
      //      → 贴着玩家船的演出全被卡片挡住（1.15 世界单位处完全不可见）。
      //   ② 把敌船拉远到卡片外，需要 ≥5.7 世界单位（斜俯视下往南偏移主要朝左下走），
      //      那时船长只剩 ~43px，小到没有意义。
      //   ③ 固定方向 + 固定距离的偏移很容易落到陆地（东南 45° 偏移 4 单位
      //      会飘到阿拉伯半岛内陆，被陆块整块遮住）。
      //   ④ 事件卡的 badge-black/70 + backdrop-blur 会把深色船帆彻底糊掉。
      // 结论：**在现有全屏事件卡布局下，"地图上的 3D 演出"做不出可读的效果。**
      // 要做得好看，得先把事件卡改成侧置/更小/半透明——那是另一笔成本。
      // 所以这里只保留唯一 100% 可见的形式：海面整体色调联动。
      // （配套改动见 EventCard.tsx：3D 模式下遮罩 70%→45% 且去掉背景模糊，
      //   让玩家能看清"事件发生在这片海域"。）

      /*
       * ---- NPC 商船：让海上"有别人" ----
       *
       * 【和"海盗事件的 3D 演出"的区别】上面那段注释否掉的是**跟着事件卡走**的
       * 敌船（卡片占屏幕中央 416×562，玩家船正好在中心，贴着它的演出全被挡住）。
       * 这里是常驻的世界元素：散在各个海域、和事件无关，不存在被卡片遮挡的问题。
       *
       * 【为什么固定 4 条腿、来回跑】航线几何是 A* 算的，新的一对港口要现算。
       * 商船如果每到港就换目的地，就会周期性触发 A*（低端机上是可见卡顿）。
       * 定期船本来就在两地之间往返，折返形态是自然的。
       *
       * 【为什么速度按"海里/秒"给】玩家船的真实速度是"海里/天"，跟视觉时间
       * 不是一个量纲；NPC 只用来看，20 nm/s 意味着 420 海里的塞维利亚—里斯本
       * 要约 21 秒跑完 —— 你能看出它在动，但它不会窜。
       */
      // 航线清单与速度在 utils/npcShips（2D 用同一份）
      const NPC_SCALE = 0.72
      const npcs: { group: THREE.Group; geom: RouteGeometry; phase0: number }[] = []
      for (let i = 0; i < NPC_LEGS.length; i++) {
        const r = routes.find(x => x.id === NPC_LEGS[i].routeId)
        if (!r) continue
        const a = ports.find(p => p.id === r.fromPortId)
        const b = ports.find(p => p.id === r.toPortId)
        if (!a || !b) continue
        const geom = getRouteGeometry([a.latitude, a.longitude], [b.latitude, b.longitude])
        if (!(geom.totalNm > 0)) continue
        const g = makeShipModel(npcKit)
        // 比玩家的座舰小一圈：玩家船必须一眼认出来，商船只是"别人"
        g.scale.setScalar(NPC_SCALE)
        g.name = `map3d-npc-${i}`
        scene.add(g)
        npcs.push({
          group: g,
          geom,
          phase0: NPC_LEGS[i].phase0,
        })
      }

      // ---- 航线（与 2D 的虚线同一份几何） ----
      const routeMat = new LineMaterial({
        color: 0xe8c46a, linewidth: 2.4, transparent: true, opacity: 0.9,
        dashed: true, dashSize: 0.28, gapSize: 0.18,
      })
      routeMat.resolution.set(width, height)
      const routeGeo = new LineGeometry()
      const routeLine = new Line2(routeGeo, routeMat)
      routeLine.visible = false
      // 注意：这里**不能**调 computeLineDistances()——
      // 它内部要读 geometry.attributes.instanceStart.count，
      // 而 LineGeometry 还没 setPositions 过，那个属性是 undefined，直接抛错。
      // 距离属性在每次 setPositions 之后再算（见 tick 里���。
      scene.add(routeLine)
      disposables.push(routeGeo, routeMat)

      // ---- 航线方向箭头 + 终点标记 ----
      //
      // 【为什么 3D 需要箭头而 2D 不需要】2D 是俯视，虚线本身在纸面上有"从 A 到 B"
      // 的方向感；3D 是斜俯视 + 透视，一条虚线在屏幕上可以是"往远处去"也可以是
      // "从远处来"，光看线分不清。2D 的 RouteLine 会在航线上每段放一个箭头，
      // 3D 没有就成了"看得见航线但不知道往哪走"。
      //
      // 用一个 InstancedMesh 装全部箭头（而不是每条放一个 Mesh）：
      // 航线最长约 20 世界单位、间距 1.5，最多十几个箭头，
      // 一次 draw call 画完，比逐个 Mesh 省得多。
      const ARROW_MAX = 48
      /**
       * 箭头间距（世界单位）。
       *
       * 【尺度换算】世界地图边长 20 单位 = 地球周长约 40000km
       * → **1 世界单位 ≈ 2000km ≈ 1080 海里**。
       * 所以塞维利亚→伦敦（1223 海里）只有 **1.1 个世界单位**。
       * 第一版按 1.5 设间距，实测整条航线只放得下 2 个箭头、
       * 更近的航线一个都没有（0 个）——尺度直接算错了。
       * 0.5 单位 ≈ 540 海里一个箭头，典型航线 2-3 个，跨洋航线十几个。
       */
      const ARROW_SPACING = 0.5
      const ARROW_Y = -PLATE_THICKNESS + 0.045
      /** 终点图钉悬空的高度：浮在港口模型（最高约 0.28）之上，不会被建筑插穿 */
      const DEST_MARK_Y = 0.34
      const arrowGeo = new THREE.ConeGeometry(0.085, 0.26, 4).rotateX(Math.PI / 2)
      // ConeGeometry 默认尖朝 +Y；rotateX(π/2) 后尖朝 +Z，
      // 之后按 atan2(dx, dz) 绕 Y 旋转就能对准航段方向。
      //
      // 【尺寸是实测调大的】第一版 0.055×0.17，在默认视距（dist≈15）下
      // 屏幕上只有 3-4px，缩成了航线上的一串小白点，方向完全看不出来。
      // 0.085×0.26 在远景约 6px、拉近时约 25px，两头都能读出"这是个箭头"。
      const arrowMat = new THREE.MeshStandardMaterial({
        color: 0xf2d98c, emissive: 0x6a5320, emissiveIntensity: 0.85, roughness: 0.55,
      })
      const arrows = new THREE.InstancedMesh(arrowGeo, arrowMat, ARROW_MAX)
      arrows.name = 'map3d-route-arrows'
      arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      arrows.count = 0
      // 实例矩阵是我们自己写的，包围球不会自动更新 → 关掉剔除，
      // 否则相机一转箭头会整批消失
      arrows.frustumCulled = false
      arrows.visible = false
      scene.add(arrows)
      disposables.push(arrowGeo, arrowMat)

      // 终点标记：悬在目标点上方的倒锥（读作"图钉"），帧循环里上下浮动
      const destGeo = new THREE.ConeGeometry(0.075, 0.2, 4).rotateX(Math.PI)
      const destMat = new THREE.MeshStandardMaterial({
        color: 0xf7ecc9, emissive: 0x8a7030, emissiveIntensity: 0.9, roughness: 0.5,
      })
      const destMark = new THREE.Mesh(destGeo, destMat)
      destMark.name = 'map3d-dest-mark'
      destMark.visible = false
      scene.add(destMark)
      disposables.push(destGeo, destMat)

      const arrowM4 = new THREE.Matrix4()

      /**
       * 沿航线按**弧长**摆方向箭头。
       *
       * 【为什么按弧长而不是按点数】getRouteGeometry 出来的点密度极不均匀：
       * 直线段只有两个端点，绕海岸改道的地方点很密。
       * 按点数放箭头会出现"直线上一个箭头都没有、贴着海岸挤成一坨"。
       */
      const placeArrows = (pts: [number, number][]) => {
        const world = pts.map(([la, ln]) => ({ x: lonToWorldX(ln), z: latToWorldZ(la) }))
        // 先量总弧长，让间距能自适应
        let total = 0
        for (let i = 0; i + 1 < world.length; i++) {
          total += Math.hypot(world[i + 1].x - world[i].x, world[i + 1].z - world[i].z)
        }
        // 【间距为什么要自适应】固定 0.5 时空距航线放不下箭头：
        // 塞维利亚→里斯本只有约 0.4 世界单位 → 实测 **0 个箭头**，
        // 而这类近距离航线恰恰是玩家走得最多的。
        // 上限 0.5（长航线不挤），下限 0.3（再小箭头首尾相接糊成一条线）。
        const spacing = Math.max(0.3, Math.min(ARROW_SPACING, total / 3))
        let n = 0
        // 从半格起步，避免第一个箭头正好压在船底下（看不见还挡船）
        let acc = spacing * 0.5
        for (let i = 0; i + 1 < world.length && n < ARROW_MAX; i++) {
          const a = world[i], b = world[i + 1]
          const dx = b.x - a.x, dz = b.z - a.z
          const segLen = Math.hypot(dx, dz)
          if (segLen < 1e-5) continue
          // 模型尖朝 +Z，转到航段方向就是 atan2(dx, dz)
          const yaw = Math.atan2(dx, dz)
          while (acc <= segLen && n < ARROW_MAX) {
            const t = acc / segLen
            arrowM4.makeRotationY(yaw)
            arrowM4.setPosition(a.x + dx * t, ARROW_Y, a.z + dz * t)
            arrows.setMatrixAt(n++, arrowM4)
            acc += spacing
          }
          acc -= segLen
        }
        arrows.count = n
        arrows.instanceMatrix.needsUpdate = true
      }

      // ---- 叠加图层：洋流 / 海盗区 / 风带 ----
      //
      // 【为什么 3D 也要有这三个图层】
      // 底栏的图层开关（风向/洋流/海盗区域）在 3D 模式下**照样可见可点**——
      // BottomBar 是无条件渲染的。3D 里没有对应图层的话，
      // 玩家按下去就什么都不会发生：这是"承诺不兑现"。
      //
      // 数据来自 @/data/mapLayers，与 2D 完全同一份。
      const layers = buildMap3DLayers(useGameStore.getState().fleet.day)
      scene.add(layers.currents, layers.pirates, layers.winds, layers.phenomena.group)
      for (const m of layers.lineMaterials) m.resolution.set(width, height)

      // 洋流的虚线材质单独收一份，帧循环里推进 dashOffset 让流向"动起来"。
      //
      // 【为什么不能直接用 layers.lineMaterials】那个数组里还有海盗区的闭合环，
      // 让边界线也流动会被读成"海盗区在漂移"，语义就错了。
      // 只在 currents 组里找就可以了（洋流是唯一的虚线折线）。
      const currentMats: { dashOffset: number }[] = []
      layers.currents.traverse(o => {
        const m = (o as unknown as { material?: { isLineMaterial?: boolean } }).material
        if (m?.isLineMaterial) currentMats.push(m as unknown as { dashOffset: number })
      })

      // ---- 国界线 ----
      //
      // 【为什么 3D 也要有】
      // 2D 地图画了 borders.geojson。3D 里没有的话，
      // 玩家切视图就少了一层地理信息（大洲内部的政治分界）。
      //
      // 393 段合并成**一个** LineSegments2 ——一次 draw call，
      // 逐段建 Line2 的话是 393 个 draw call，移动端会掉帧。
      const borders = bordersGeojson ? buildMap3DBorders(bordersGeojson) : null
      if (borders) {
        scene.add(borders.lines)
        borders.material.resolution.set(width, height)
      }

      // ---- 光照 ----
      const key = new THREE.DirectionalLight(0xffe4b8, LIGHT_KEY)
      key.position.set(-9, 6, 6)
      key.castShadow = true
      key.shadow.mapSize.set(2048, 2048)
      key.shadow.camera.left = -14; key.shadow.camera.right = 14
      key.shadow.camera.top = 14; key.shadow.camera.bottom = -14
      key.shadow.camera.near = 1; key.shadow.camera.far = 40
      key.shadow.bias = -0.0012
      /*
       * 阴影强度：0.55，不是默认的 1。
       *
       * 【为什么】阴影在 three 里是"把主光的贡献乘 0"——被遮住的地方只剩
       * ambient + rim + 环境贴图。实测近景（港口 + 船，灯 intensity 3.0、
       * 环境 0.72）：被阴影覆盖的像素只保住 **43%** 的亮度（中位数），
       * 最暗的几个点从 202 掉到 7 —— 近景读作**黑洞**，不像影子。
       * 真实白天的影子有天空散射补光，通常保住 60~75%。
       *
       * 【为什么调这一项，而不是调 ambient】
       * ambient 会同时抬高画面里**所有**暗部，海面颜色跟着漂
       * （之前踩过：动 ambient 会把海色从 (9,56,74) 推成灰）。
       * `LightShadow.intensity` 只作用于阴影因子本身：受光面一个像素都不动，
       * 只有被遮住的部分变浅。这是唯一"只改影子、不改画面"的旋钮。
       */
      key.shadow.intensity = 0.55
      scene.add(key)
      const rim = new THREE.DirectionalLight(0x6f9fd8, LIGHT_RIM)
      rim.position.set(7, 3, -6)
      scene.add(rim)
      // 保存引用：天气变差时要压它的强度（原来这里是匿名 add，调不到）
      const ambient = new THREE.AmbientLight(0x3d5470, LIGHT_AMB)
      scene.add(ambient)

      // 晕影不在这里做：游戏自带的 VintageMapOverlay 已经有一层暗角，
      // 两层叠加会把 3D 画面压到只剩 20% 亮度（实测 2D 陆地 p90=203 / 3D 陆地 p90=41）。

      // ---- 相机状态：绕着船转，玩家控制角度与距离 ----
      /*
       * 相机状态。**初始注视点取船位**，不是写死的世界中心。
       *
       * 【为什么】(10, 0) 是世界中心（约在非洲西侧）。玩家在远东时切到 3D，
       * 镜头会从中心一路"飞"到船位：实测船在 (23.1, 113.3) 时，相机首帧在
       * (15.73, 10.99)，要 1.4 秒才滑到 (21.27, 9.83)。
       * 第一次切视图时那 1.4 秒就是"地图在乱跑"，玩家会以为出了 bug。
       * 以船位起手，切过去第一眼就是船所在的那片海。
       */
      const initShip = useGameStore.getState().shipPosition
      const camState = {
        fx: initShip && isFinite(initShip[1]) ? lonToWorldX(initShip[1]) : 10,
        fz: initShip && isFinite(initShip[0]) ? latToWorldZ(initShip[0]) : 0,
        dist: 15, az: 0.42, el: 0.62,
      }
      const camTarget = { x: 10, z: 0 }

      // ---- 交互：拖拽转视角 / 滚轮或双指捏合缩放 / 点击选点 ----
      //
      // 【为什么要处理多指】桌面靠 wheel 缩放，手机没有 wheel。
      // 实测（CDP 发真实触摸序列，390×844）：双指捏合对相机高度的影响 Δ=0.000，
      // 也就是手机上根本不能缩放 —— 只能看 dist=15 那一个画面，
      // 既进不了近景（看不清港口三档差异），也拉不到远景（看不到自己在世界哪一块）。
      //
      // 【为什么要设 touch-action: none】canvas 默认 touch-action:auto，
      // 浏览器会把单指拖拽当成页面滚动。实测：横拖 96px 只收到 2 个 pointermove
      // 就 pointercancel —— 旋转到一半被浏览器抢走，手感像"转不动"。
      // 只设在这块 canvas 上，不影响 2D 与周围可滚动区域。
      const el = renderer.domElement
      el.style.touchAction = 'none'

      /** 当前按下的所有指针（触摸/鼠标统一走 Pointer Events） */
      const pointers = new Map<number, { x: number; y: number }>()
      let dragging = false
      /**
       * 本次按下时的屏幕坐标。松手时用**净位移**判定"点"还是"拖"。
       *
       * 【为什么不用累加位移】`moved` 是每帧增量绝对值之和，手指来回抖动会
       * 被累加成好几倍：真实手指按下抬起即使"点"也会有 3~5px 的游走，
       * 累加后轻松超过 5 —— 实测（CDP 发真实触摸序列，390×844）：
       *   抖动 2,2px → 触发点击；**抖动 4,3px → 被当成拖拽**，航向设不上。
       * 玩家感受到的是"点了海面没反应"。净位移对往返抖动不敏感，
       * 才真正区分"手抖"与"想转视角"。
       */
      let startX = 0, startY = 0
      /** 捏合期间置 true：松手不该触发点击 */
      let pinched = false
      let lastX = 0, lastY = 0
      /** 上一次的两指间距，捏合时用相邻两帧的比值算缩放 */
      let pinchDist = 0

      /** 用两指间距的比值缩放（不依赖绝对像素，高分屏/不同机身一致） */
      const applyPinch = () => {
        const [p1, p2] = [...pointers.values()]
        const d = Math.hypot(p1.x - p2.x, p1.y - p2.y)
        if (pinchDist > 0 && d > 1) {
          // 手指张开 → d 变大 → 比值 <1 → dist 变小 = 拉近。
          // 与地图 App 的习惯一致（张开放大/拉近），不是反向。
          camState.dist = Math.min(40, Math.max(3, camState.dist * (pinchDist / d)))
        }
        pinchDist = d
      }

      const onPointerDown = (e: PointerEvent) => {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        try { el.setPointerCapture(e.pointerId) } catch { /* 指针已释放 */ }
        if (pointers.size === 1) {
          dragging = true; pinched = false
          lastX = e.clientX; lastY = e.clientY
          startX = e.clientX; startY = e.clientY
        } else if (pointers.size === 2) {
          // 进入捏合：停掉旋转，否则第二根手指落下时画面会跳一下
          dragging = false
          const [p1, p2] = [...pointers.values()]
          pinchDist = Math.hypot(p1.x - p2.x, p1.y - p2.y)
          // 捏合不算点击：否则松手会误触发"点地图出航"
          pinched = true
        }
      }
      const onPointerMove = (e: PointerEvent) => {
        const p = pointers.get(e.pointerId)
        if (!p) return
        p.x = e.clientX; p.y = e.clientY

        if (pointers.size >= 2) { applyPinch(); return }
        if (!dragging) return

        const dx = e.clientX - lastX, dy = e.clientY - lastY
        lastX = e.clientX; lastY = e.clientY
        camState.az -= dx * 0.005
        camState.el = Math.min(1.35, Math.max(0.16, camState.el + dy * 0.004))
      }
      const onPointerUp = (e: PointerEvent) => {
        const wasSingle = pointers.size === 1
        pointers.delete(e.pointerId)
        try { el.releasePointerCapture(e.pointerId) } catch { /* 指针已释放 */ }

        if (pointers.size === 0) {
          dragging = false
          pinchDist = 0
          // 点击判定抽在 utils/tapGesture（可单测）：净位移 + 按设备分阈值。
          // 实测改前：手机抖动 4,3px 就被当成拖拽，航向根本设不上。
          if (wasSingle && isTapGesture({
            pointerType: e.pointerType,
            startX, startY,
            endX: e.clientX, endY: e.clientY,
            pinched,
            eventType: e.type,
          })) handleClick(e)
        } else if (pointers.size === 1) {
          // 从双指退回单指：把剩下那根手指当新的基准，
          // 否则 dt 会从"上一根手指的位置"算，画面跳一大截
          const [rest] = [...pointers.values()]
          lastX = rest.x; lastY = rest.y
          dragging = true
          pinchDist = 0
        }
      }
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        camState.dist = Math.min(40, Math.max(3, camState.dist * (1 + e.deltaY * 0.0012)))
      }
      el.addEventListener('pointerdown', onPointerDown)
      el.addEventListener('pointermove', onPointerMove)
      el.addEventListener('pointerup', onPointerUp)
      el.addEventListener('pointercancel', onPointerUp)
      el.addEventListener('wheel', onWheel, { passive: false })

      const raycaster = new THREE.Raycaster()
      const ndc = new THREE.Vector2()

      /** 点击海面/港口 → 与 2D 的 MapClickHandler 语义一致 */
      function handleClick(e: PointerEvent) {
        const rect = el.getBoundingClientRect()
        ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
        ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(ndc, camera)

        // 先打港口模型
        const portHits = raycaster.intersectObjects(portGroup.children, true)
        let lat: number, lng: number
        if (portHits.length) {
          let o: THREE.Object3D | null = portHits[0].object
          while (o && o.userData.portId === undefined) o = o.parent
          const pid = o?.userData.portId as number | undefined
          const p = pid !== undefined ? ports.find(pp => pp.id === pid) : undefined
          if (!p) return
          lat = p.latitude; lng = p.longitude
        } else {
          const seaHits = raycaster.intersectObject(sea, false)
          if (!seaHits.length) return
          const hit = seaHits[0].point
          lng = worldXToLon(hit.x)
          lat = worldZToLat(hit.z)
        }
        applyWaypoint(lat, lng)
      }

      /** 复刻 MapClickHandler 的判定顺序 */
      function applyWaypoint(lat: number, lng: number) {
        const state = useGameStore.getState()
        const fleet = state.fleet
        const discoveredPorts = state.discoveredPorts

        const nearbyPort = ports.find(p => {
          const dLat = p.latitude - lat
          const dLng = p.longitude - lng
          return Math.sqrt(dLat * dLat + dLng * dLng) < 2
        })

        if (nearbyPort) {
          if (nearbyPort.id === fleet.currentPortId) return
          const alreadyDiscovered = discoveredPorts.includes(nearbyPort.id)
          const waypoint: Waypoint = {
            latitude: nearbyPort.latitude,
            longitude: nearbyPort.longitude,
            name: alreadyDiscovered ? nearbyPort.nameCn : undefined,
            portId: nearbyPort.id,
          }
          if (fleet.isSailing) state.changeCourse(waypoint)
          else {
            state.setWaypoint(waypoint)
            state.sailToWaypoint(waypoint)
            useFx.getState().fx({ kind: 'cue', tone: 'plain', text: '' }, 'sail')
          }
          if (alreadyDiscovered) {
            useMapStore.getState().setSelectedPortId(nearbyPort.id)
            state.setActivePanel('port')
          }
          return
        }

        let targetLat = lat, targetLng = lng
        if (isOnLand(lat, lng)) {
          const ocean = findNearestOceanPoint(lat, lng)
          if (!ocean) {
            state.addNotification({
              id: `no-ocean-${Date.now()}`,
              type: 'warning',
              title: '无法航行',
              message: '这一带是连绵的陆地，附近找不到可以出海的点。',
            })
            return
          }
          targetLat = ocean[0]; targetLng = ocean[1]
          state.addNotification({
            id: `coast-snap-${Date.now()}`,
            type: 'discovery',
            title: '航线已贴岸',
            message: '目标点在陆地上，航线自动改道至最近的海岸。',
          })
        }

        const waypoint: Waypoint = { latitude: targetLat, longitude: targetLng }
        if (fleet.isSailing) state.changeCourse(waypoint)
        else if (fleet.currentPortId || state.shipPosition) {
          state.setWaypoint(waypoint)
          state.sailToWaypoint(waypoint)
          useFx.getState().fx({ kind: 'cue', tone: 'plain', text: '' }, 'sail')
        }
      }

      // ---- 尺寸自适应 ----
      const onResize = () => {
        const w = mount.clientWidth || width
        const h = mount.clientHeight || height
        width = w
        height = h
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer!.setSize(w, h)
        routeMat.resolution.set(w, h)
        for (const m of layers.lineMaterials) m.resolution.set(w, h)
        borders?.material.resolution.set(w, h)
        for (const m of coast.materials) m.resolution.set(w, h)
        graticule.material.resolution.set(w, h)
      }
      window.addEventListener('resize', onResize)

      // ---- 帧循环 ----
      const portMap = new Map(ports.map(p => [p.id, p]))
      let routeSig = ''
      /** 上一次的当前港口 id：只在变化时改 DOM class，不每帧写 */
      let lastCurrentPortId: number | null | undefined
      /** 海面是否已染上海盗事件的红色（避免每帧重复写材质） */
      let pirateTintOn = false
      /**
       * 上一次的天气。天气决定海面的明度与粗糙度，只在**变化时**写材质。
       *
       * 【为什么 3D 必须单独做这件事】
       * 2D 的天气表现是换贴图（storm 时用 sea-tile-storm.png），而 3D 用的是
       * 另一张手绘全球贴图 painted-sea.png，没有 storm 版本 —— 于是切到 3D
       * 风暴就"消失"了，玩家看不出天气变了。而天气直接影响航速（sailMul
       * 0.55~1.0）与事件率（1.8 倍），不是装饰。
       * 没有第二张贴图，就用调色表达同一件事。
       */
      let lastWeatherKind: string | null = null
      /** 天气倍率（只在天气变化时更新，光照每帧用） */
      let weatherDim = 1
      /** 上一次已应用的航季序号（-1 = 还没应用过） */
      let lastSeasonIndex = -1
      /** 上一次写进材质的地势法线强度（避免每帧改属性） */
      let lastReliefK = -1
      /*
       * 日相不在这里推进。
       *
       * 【为什么】2D 与 2.5D 是两套渲染。如果各自 `phase += dt/周期`，
       * 两边起点不同 → 切视图时天色会跳；而且谁先跑谁"对"。
       * 改成读 utils/skyClock 的纯函数 `skyAt(nowMs, 进度)`：同一时刻问两次
       * 答案相同，两个视图天然对齐，谁也不必同步谁。
       */
      /**
       * 上一帧时间戳，用来算 dt。
       *
       * 【为什么必须 clamp】切到别的标签页再回来时，两帧之间可能隔了几十秒，
       * 不 clamp 的话所有按 dt 推进的东西（转向缓动、洋流流动）会一口气跳到底。
       * 记忆里 0.1s 这条线是踩过坑定下的（无头浏览器 rAF 帧率低时也不能超）。
       */
      let lastT = performance.now()
      const tmpV = new THREE.Vector3()

      /*
       * 自适应分辨率的采样缓冲。
       *
       * 初始 pixelRatio 是 min(devicePixelRatio, 1.5)。在 2 倍屏上那是 2.25 倍像素，
       * 核显（实测 Intel UHD 630：1440×900 下 3D 27ms/帧、2D 16.7ms）扛不住，
       * 但玩家不会去调设置，只会觉得「一切 3D 就卡」。所以这里实测帧时自己降档。
       *
       * 两条必要的防护：
       *   · 只采 0~100ms 的样本 —— 切标签页回来那种几十秒的间隔不是分辨率的锅；
       *   · 改完清空样本并冷却 3 秒 —— setPixelRatio 会重分配 drawingBuffer，
       *     紧接着那几帧必然慢，拿它们当依据会一路降到底。
       */
      const frameMsBuf: number[] = []
      let lastRatioChangeAt = 0

      const tick = () => {
        raf = requestAnimationFrame(tick)
        const tNow = performance.now()
        const rawMs = tNow - lastT
        const dt = Math.min(0.1, rawMs / 1000)
        lastT = tNow

        /*
         * 岸上视角是一整块不透明覆盖层，3D 画布此刻一个像素都看不见。
         * 继续逐帧投影标签、更新漂流物 DOM、再画满屏三角形纯属空转：
         * 实测 2 秒内 15876 次 draw call（比海图时的 10584 还多，因为
         * 地图层被压暗推远又触发了一次重算）。
         *
         * 这里早退，但**保留 rAF**：下一帧照常来，切回海图立刻恢复绘制，
         * 不用重建场景（重建才是切换卡顿的来源）。lastT 已在上面更新过，
         * 所以切回时 dt 不会攒出一大跳；自适应分辨率也不采岸上的样本。
         */
        if (useMapStore.getState().viewMode === 'harbor') return

        if (rawMs > 0 && rawMs < 100) frameMsBuf.push(rawMs)
        if (frameMsBuf.length >= 40) {
          if (tNow - lastRatioChangeAt > 3000) {
            const next = decidePixelRatio(renderer!.getPixelRatio(), frameMsBuf)
            if (next !== null) {
              renderer!.setPixelRatio(next)
              lastRatioChangeAt = tNow
            }
          }
          frameMsBuf.length = 0
        }
        /** 秒级时间戳：船摇、终点标记浮动、洋流等所有周期性动画共用 */
        const tt = tNow / 1000
        const state = useGameStore.getState()
        const fleet = state.fleet

        /*
         * ---- 航季：换季时整体重刷一次颜色 ----
         *
         * 海色只在"天气变化"时被写入（那是刻意的：不每帧 setRGB）。
         * 但换季也必须触发一次重刷，否则会出现"天气一变才发现变季了"——
         * 玩家在晴天连开两趟，海一直是上一个季节的颜色。
         *
         * 陆地用同一个色调做乘数：土地虽以贴图为主，季节只调冷暖，
         * 但少了这一项，海变了、地没变，画面会读成"海被染了色"而不是"换季"。
         */
        {
          const season = seasonAt(fleet.day)
          if (season.index !== lastSeasonIndex) {
            lastSeasonIndex = season.index
            seasonSeaTint = season.seaTint
            seasonLandTint = season.landTint
            applySeaColor()
            lidMat.color.setRGB(seasonLandTint[0], seasonLandTint[1], seasonLandTint[2])
            /*
             * 雪线随季升起/落下：北半球的"寒季雪"在我们的秋(2)/冬(3)出现，
             * 南半球的在春(0)/夏(1)——因为那时正是他们的冬天。
             * 一个开关让全世界同时下雪是假的；分开之后，
             * 换季时能看见"这一半山戴雪、那一半山脱雪"。
             */
            const coldNorth = season.index >= 2
            if (peaks) {
              peaks.coldGroups.north.visible = coldNorth
              peaks.coldGroups.south.visible = !coldNorth
            }
            /*
             * 这一季的"不好走的那片水"也要跟着换。
             *
             * 【为什么放这里而不是每帧调】换季只发生一次，
             * setDay 内部同一天重复调用是空操作；放在这里就少一条每帧分支。
             */
            // 洋流点序 / 风箭头朝向 / 现象可见性，一次推进到新的一季
            layers.setDay(fleet.day)
          }
        }

        // 船位：港内取所在港口，航行中取船位
        let shipLat: number | null = null, shipLng: number | null = null
        if (state.shipPosition && isFinite(state.shipPosition[0]) && isFinite(state.shipPosition[1])) {
          shipLat = state.shipPosition[0]; shipLng = state.shipPosition[1]
        } else if (fleet.currentPortId) {
          const p = portMap.get(fleet.currentPortId)
          if (p) { shipLat = p.latitude; shipLng = p.longitude }
        }
        if (shipLat === null) {
          const p = portMap.get(6)
          if (p) { shipLat = p.latitude; shipLng = p.longitude }
        }

        if (shipLat !== null && shipLng !== null) {
          // 【停泊时的偏移与缩小：否则船把港口模型整个盖住】
          // 港内时船位就是港口坐标，而帆船模型（放大到不真实的大小，
          // 参考 Age of Sail 的刻意风格）比港口大一圈——
          // 线上实测：停在塞维利亚时港口**完全看不见**，只露出一个"塞维利亚"标签。
          // 刚做完的港口辨识度（三档规模 + 干船坞）在玩家最常看的位置失效，等于白做。
          // 处理：停泊时把船挪到港口一侧并缩小，读作"船停在码头边"。
          // 【判据不能用 !state.shipPosition】开局时 shipPosition 就被写成
          // 所在港口坐标（非空），那样判断会让"停泊"永远为假、修复等于没做
          // （e2e 的断言当场抓到这个：scale 仍是 0.8、中心距 0）。
          // 正确的判据是"在港内 且 没在航行"。
          const docked = !!fleet.currentPortId && !fleet.isSailing
          // 偏移 0.6 / 缩放 0.5 是实测调出来的：
          // 船半长 0.92×0.5/2 = 0.23，港口底座半径约 0.18 → 中心距 0.6 时
          // 两者投影不再交叠；再小就又会压住港口右侧的房子（0.45 时实测仍遮挡）。
          const sx = lonToWorldX(shipLng) + (docked ? 0.6 : 0)
          const sz = latToWorldZ(shipLat)

          // ---- 拉近时把船缩小 ----
          //
          // 【为什么】玩家贴到这么近，本意是看港口的三档细节（塔楼/干船坞/栈桥）。
          // 而船就在相机注视点正中心：实测 dist=3（camY=1.74）时船占屏 **54.5%**，
          // 港口整块被自己的船压住，刚做的辨识度在最该看清的距离上失效。
          //
          // 曲线取 dist/8：8 以上完全不缩（远景本来就小，占屏 1.7%），
          // 到 dist=3 缩到 0.45 → 占屏降到约 11%，港口露出来了。
          // 沿用"停泊时把船挪开缩小"的同一原则：**近景下船要给港口让位**。
          const nearK = shipNearZoomScale(camState.dist)
          ship.scale.setScalar((docked ? 0.5 : 0.8) * nearK)

          // ---- 随浪摇晃 ----
          //
          // 【为什么不直接让海面起伏】海面贴图下面还铺着洋流/风带/海盗区图层
          // （y ∈ [-0.0880, -0.0862]，海面顶面在 -0.089），余量只有 0.0008~0.0028。
          // 海面只要起伏超过千分之二就跟图层穿模，而幅度小到看不出来又等于没做。
          // 所以让"浮在水上的东西"摇，而不是让水动——成本几乎为零，观感一样成立。
          //
          // 停泊时摆幅取 0.45：船系在码头上，只随涌浪轻晃；航行中才是全幅。
          //
          // 【幅度为什么这么小】远景（dist=15）下 1 世界单位≈57px，
          // rotZ 0.035 只能让船首端点动 1.2px —— 本来就看不见。
          // 这组数值是给**拉近**用的（dist=3 时 1 世界单位≈286px，端点动 5.9px）。
          // 想让它远景也明显就得倾斜 8° 以上，在平静海面上反而假。
          // 所以保持小幅度：远景是一片安静的海图，贴脸看时才觉得船浮在水上。
          const sway = fleet.isSailing ? 1 : 0.45
          ship.position.set(
            sx,
            -PLATE_THICKNESS + 0.02 + Math.sin(tt * 1.25) * 0.012 * sway,
            sz,
          )
          // x / z 轴只管摇晃，y 轴留给航向（两者不抢同一个轴）
          ship.rotation.z = Math.sin(tt * 1.7) * 0.035 * sway
          ship.rotation.x = Math.sin(tt * 1.05 + 0.7) * 0.022 * sway

          const wp = state.waypoint
          if (fleet.isSailing && wp) {
            const bearing = calculateBearing(shipLat, shipLng, wp.latitude, wp.longitude)
            const targetYaw = -bearing * Math.PI / 180 + Math.PI
            // 最短弧插值。直接赋值会让转向"啪"地跳一下；而且目标角跨过 ±π 边界时
            // 差值可能接近 2π，硬插值会看到船原地绕一整圈。
            // atan2(sin, cos) 把差值归一到 [-π, π]，绕远路的问题就没有了。
            let dYaw = targetYaw - ship.rotation.y
            dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw))
            ship.rotation.y += dYaw * Math.min(1, dt * 7)
          }
          /*
           * 尾迹从**船尾**起，不是船心。
           *
           * 船的朝向是 rotation.y（艏向），船尾在 -艏向方向约半个船长处：
           * 船长 0.92×scale，半长 0.46×scale。不减去它，尾迹会从船肚子底下冒出来，
           * 近景（dist=3）下一眼看穿。
           */
          {
            const halfLen = 0.46 * ship.scale.x
            const heading = ship.rotation.y
            const sternX = sx - Math.sin(heading) * halfLen
            const sternZ = sz - Math.cos(heading) * halfLen
            wake.update(sternX, sternZ, fleet.isSailing, heading)
          }

          // 相机焦点：停泊时对准港口本身，航行时才跟船。
          //
          // 【为什么停泊要对准港口】停泊时船被挪到港口旁边 0.6 世界单位
          // （为了不压住港口模型），如果注视点还在船上，拉近后港口就偏到视野边缘——
          // 实测 dist=3 时塞维利亚只剩一个光环挂在画面左缘，玩家拉近本想看港口，
          // 结果看到的是自己的船和一片空海。
          // 远景下这点偏移只有 4% 视野，几乎无感；近景下就是"港口在中间"与
          // "港口在边上"的区别。
          camTarget.x = docked ? lonToWorldX(shipLng) : sx
          camTarget.z = sz

          // ---- 洋流流动 ----
          //
          // dashOffset 递减 = 虚线沿线的正方向前进。洋流数据的点序就是流向
          // （OCEAN_CURRENTS 每条都从起点画到终点），所以视觉方向与数据一致，
          // 不是因为"看起来顺眼"随手定的。
          //
          // 速度取 0.15/s：一个 dash 周期是 dashSize+gapSize = 0.085 世界单位，
          // 约 0.57 秒走完一格 —— 远看是"缓缓流动"，再快就成了跑马灯。
          //
          // 洋流只对底栏开关负责：组不可见时这三个材质也不会被渲染，
          // 但 uniform 仍会被写。7 条线的开销可以忽略，不做可见性判断。
          for (let i = 0; i < currentMats.length; i++) {
            currentMats[i].dashOffset -= dt * 0.15
          }

          /*
           * NPC 商船：推进里程 → 摆位置 → 插值朝向。
           *
           * 朝向必须插值（与玩家船同一套最短弧写法）：折返那一刻航向会直接
           * 反 180°，硬赋值就是一帧之内原地转过半圈，看起来像瞬移。
           */
          for (const npc of npcs) {
            // 位置是**时刻的函数**（不是累加）：与 2D 那份地图用的是同一个公式，
            // 所以同一时刻切换视图，船在同一个地方。
            const st = npcLegAt(npc.geom.totalNm, NPC_SPEED_NM, npc.phase0, tNow)
            const pose = npcPose(npc.geom, st)
            npc.group.position.set(
              lonToWorldX(pose.lng),
              -PLATE_THICKNESS + 0.02,
              latToWorldZ(pose.lat),
            )
            const targetYaw = -pose.bearing * Math.PI / 180 + Math.PI
            let dYaw = targetYaw - npc.group.rotation.y
            dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw))
            npc.group.rotation.y += dYaw * Math.min(1, dt * 4)
            // 与玩家船同频的轻摇，但幅度小一半（商船装得满，不该晃得比战舰厉害）
            npc.group.rotation.z = Math.sin(tNow / 1000 * 1.5 + npc.geom.totalNm) * 0.018
            npc.group.rotation.x = Math.sin(tNow / 1000 * 0.9 + npc.geom.totalNm) * 0.012
            /*
             * 近景缩放必须与座舰**同一条曲线**。
             *
             * 【为什么要修】原来只有玩家船乘了 nearK，NPC 固定 0.72，
             * 于是**船越小越显得别人大**：实测（`.workbuddy/probe-npc-scale.mjs`）
             *   航行 dist=15：座舰 0.80 / NPC 0.72 → 0.90（对）
             *   航行 dist=4 ：座舰 0.40 / NPC 0.72 → **1.80（别人的船大近一倍）**
             *   停泊 dist=4 ：座舰 0.25 / NPC 0.72 → **2.88**
             * 修后两档都回到 0.90（停泊那档是 1.44，因为座舰靠岸时故意缩到 0.5
             * 给港口让位，那是另一条刻意的规则）。
             */
            const npcK = NPC_SCALE * shipNearZoomScale(camState.dist)
            if (Math.abs(npc.group.scale.x - npcK) > 0.01) npc.group.scale.setScalar(npcK)
          }

          /*
           * 云影漂移：只改贴图 offset，不动平面。
           *
           * 速度 0.0035 /s（一张图 = 41 世界单位，也就是约 0.14 单位/秒，
           * 一条 3 节船的速度量级）：云要"慢到你不确定它是不是在动"才对，
           * 快了像地板在滑。
           * offset 会无限增大，但 RepeatWrapping 下取模在 GPU 里做，
           * 而 float 精度在几十公里之后才掉——一局游戏根本到不了。
           */
          if (cloudMesh) {
            const cm = cloudMesh.material as THREE.MeshBasicMaterial
            if (cm.map) {
              cm.map.offset.x += dt * 0.0035
              cm.map.offset.y += dt * 0.0012
            }
          }

          // ---- 海盗事件：海面泛红（3D 演出的唯一可靠形式）----
          //
          // 详见上方「海盗事件的"3D 演出"」注释里的成本结论：
          // 敌船在地图上放不出来（卡片遮挡 + 落陆地 + 太小），
          // 但"海面整体变色"占满屏幕，是 100% 可见的。
          //
          // seaMat.color 与贴图相乘（贴图是青灰色），设成偏红即整体泛红。
          // 只在状态变化时写，不每帧 setHex（避免无意义的材质更新）。
          const ev = state.currentEvent
          const pirateActive = !!ev && ev.type === 'pirate' && state.gamePhase === 'event'
          if (pirateTintOn !== pirateActive) {
            pirateTintOn = pirateActive
            // 【为什么用 emissive 而不是 color】
            // `color` 是**乘数**：海面贴图是青灰色（低 R / 高 G / 高 B），
            // 乘任何"偏红"的颜色只会让整体变暗、蓝绿反而更突出，
            // **乘法在数学上就做不出"变红"**（实测：color 设 0xee8878，海面只是变暗）。
            // `emissive` 是**加项**，直接往上叠红光，才能真的把海面染红。
            seaMat.emissive.setHex(pirateActive ? 0x6b1a12 : 0x000000)
            seaMat.emissiveIntensity = 1.2
            // 外圈是不受光材质、没有 emissive，只能用"颜色加项"模拟同样的泛红，
            // 然后重跑一遍 setSeaColor 把它写进去（不要绕过唯一入口单写）。
            pirateR = pirateActive ? 0.020 : 0
            pirateG = pirateActive ? 0.004 : 0
            pirateB = pirateActive ? 0.002 : 0
            setSeaColor(seaNeutral[0], seaNeutral[1], seaNeutral[2])
          }
        }

        // ---- 天气：调海面的明度与粗糙度 ----
        //
        // 2D 是换贴图（storm → sea-tile-storm.png），3D 用的 painted-sea.png
        // 没有 storm 版本，所以只能调色。但不能不做：天气影响航速
        // （sailMul 0.55~1.0）与事件率（1.8 倍），玩家需要一眼看出"现在天气差"。
        //
        // 用的参数是 WEATHER_INFO 里现成的 `visibility`（晴 1.0 → 浓雾 0.55），
        // 它与 sailMul 同向，所以"看起来越糟、走得越慢"天然一致，
        // 不需要再编一套天气→明度的映射表。
        //
        // 只在 kind 变化时写材质，不每帧改。
        const weatherKind = state.weather.kind
        if (weatherKind !== lastWeatherKind) {
          lastWeatherKind = weatherKind
          const gloom = 1 - WEATHER_INFO[weatherKind].visibility
          if (weatherKind === 'fog') {
            // 浓雾：海面读起来要"发白"，而不是"发暗"（压暗会像入夜）。
            //
            // 【第一版为什么失败】用 `base + (0.95 - base) * gloom` 插值，
            // 而 gloom 只有 0.45（visibility 0.55），只走了不到一半的距离 ——
            // 实测海面亮度 54.6 → 54.9，**画面和晴天几乎没差别**。
            // 顶栏写着「浓雾 航速-25%」而画面完全不像，就是承诺不兑现。
            // 浓雾本身就是极端天气，直接给一个固定的"暖白灰"：
            // 比基色更亮（R/G 抬上去）、更中性（B 压下来），饱和度掉下来才像雾。
            setSeaColor(
              SEA_BASE_R + (FOG_R - SEA_BASE_R),
              SEA_BASE_G + (FOG_G - SEA_BASE_G),
              SEA_BASE_B + (FOG_B - SEA_BASE_B),
            )
          } else {
            // 阴云 / 落雨 / 风暴：压暗。
            //
            // 【系数为什么是 1.6 而不是 0.85】第一版压 0.85（风暴只剩 74% 亮度），
            // 同时把 roughness 从 0.3 提到 0.63 —— 实测画面**反而变亮**
            // （海面区域亮度 54.5 → 56.8）。原因是粗糙表面漫反射更均匀，
            // 在点光源下把压暗的效果抵消掉了。
            // 现在不动 roughness，只压 color，并把系数提到 1.6
            // （风暴 gloom=0.3 → 只剩 52%）。实测亮度 54.5 → 41.2。
            const dark = 1 - gloom * 1.6
            setSeaColor(SEA_BASE_R * dark, SEA_BASE_G * dark, SEA_BASE_B * dark)
          }
          /*
           * 同时压暗三盏灯与环境贴图。
           *
           * 【为什么必须压光照，而不能只压海面颜色】
           * 实测归因（1440×900、同一机位、逐项消融）：
           *   · 海面 color 压到 0.2 倍 → 画面亮度只降 7%（54.5 → 50.5）
           *   · 三盏灯全部关掉       → 亮度掉到 4.9（说明亮度几乎全来自灯）
           *   · scene.environment 设 0 → **完全不变**（对场景没有可见贡献）
           * ACES 色调映射（exposure 1.42）把颜色乘法压得几乎看不见，
           * 所以"天阴了"要真看得见，只能压光照强度 —— 实测压 33% 就是
           * 一个明确可感的差别，而颜色压 48% 只有 10%。
           *
           * 附带好处：陆地、港口、船一起吃这个变化，符合"阴天"的直觉；
           * 只压海面会让陆地亮得刺眼。
           * 浓雾例外：雾是散射的，整体发灰但不该像入夜。第一版按 0.55 压，
           * 净效果变成 46.6（比晴天暗 14.5%）—— 看起来像"阴天"而不是"雾"。
           * 压到 0.3 后，海色提亮占主导，整体略暗但偏灰白，才是雾。
           */
          /*
           * 这里**只记天气倍数，不直接写灯**——
           * 因为灯光现在有两个乘数：天气（阶跃、只在变化时变）与日相
           * （连续、每帧变）。两处各写一遍必然打架：谁后写谁赢，
           * 表现就是"天阴了之后太阳再也不动"。
           * 所以写入口收在帧末的 applyLighting()，两个乘数在那儿相乘。
           */
          weatherDim = weatherKind === 'fog' ? 1 - gloom * 0.3 : 1 - gloom * 1.1
        }

        /*
         * ---- 日相：太阳在走 ----
         *
         * 【为什么不是"跟航程进度"】那是最直觉的方案（出航清晨、到港黄昏），
         * 但有两个硬伤：① 停泊时画面完全静止，正好是玩家看港口细节的时候；
         * ② routeProgress 到港会归零，太阳会当场跳回清晨。
         * 所以改成**实时推进 + 航程给一个向前的推力**：
         *   - 一昼夜 8 分钟（480s），慢到不会让人以为要赶时间；
         *   - 航程进度每增加 1，太阳额外前推 0.35 —— 一趟远洋确实"过了一天"，
         *     但只认**增量**（进度归零不倒退），所以到港那一刻不会跳。
         *
         * 【为什么夜里也不能压太黑】这是个要看数字的海图。地中海的港口编号、
         * 航线的金色虚线、货价都要读得清。夜里最暗只到 0.72 倍并偏蓝，
         * 不是"关灯"。
         */
        const sky = skyAt(tNow, state.routeProgress ?? 0)

        /*
         * 灯光只有一个写入口：天气 × 日相。
         *
         * 日相曲线用 sin 而不是分段：正弦在两端都是平滑的，
         * 分段线性会在日出/日落那一刻出现"速度突变"（亮度曲线打一个折）。
         */
        {
          const lit = sky.lit
          const sunLightMul = 0.72 + 0.34 * lit
          key.intensity = LIGHT_KEY * weatherDim * sunLightMul
          rim.intensity = LIGHT_RIM * weatherDim * (0.55 + 0.45 * lit)
          ambient.intensity = LIGHT_AMB * weatherDim * (0.6 + 0.4 * lit)
          scene.environmentIntensity = ENV_BASE * weatherDim * (0.65 + 0.35 * lit)
          // 主光色温：深夜偏冷蓝 → 正午偏暖白。用同一个 lit 插值，
          // 不让"亮度"和"色温"各走一条曲线（那会在某个时段出现灰绿）。
          key.color.setRGB(
            SUN_COLOR_NIGHT.r + (SUN_COLOR_DAY.r - SUN_COLOR_NIGHT.r) * lit,
            SUN_COLOR_NIGHT.g + (SUN_COLOR_DAY.g - SUN_COLOR_NIGHT.g) * lit,
            SUN_COLOR_NIGHT.b + (SUN_COLOR_DAY.b - SUN_COLOR_NIGHT.b) * lit,
          )
          // 侧壁是不受光材质，吃不到上面任何一项，必须自己跟一次——
          // 否则夜里整张海图都暗了，只有海岸那圈还是白天的亮度。
          /*
           * 侧壁：先按天气 × 日相压亮度，再和墨线一起往冷的方向掰。
           *
           * 【为什么不再用 setScalar】setScalar 是**灰度乘数**，只会让侧壁变暗、
           * 不会让它变冷。夜里陆地吃冷蓝主光已经偏灰蓝，而侧壁仍然是一圈暖砂岩
           * —— 放大看是"灰蓝的岛镶着橙边"，和墨线是同一个问题。
           * 拆成三通道就是为了让它跟陆地同色温。
           */
          {
            const k = (0.55 + 0.45 * weatherDim) * (0.62 + 0.38 * lit)
            const nk = 1 - lit
            wallMat.color.setRGB(
              k * (1 - 0.34 * nk),
              k * (1 - 0.15 * nk),
              k * (1 + 0.04 * nk),
            )
          }

          /*
           * 海图的线同理（不受光材质）：海岸墨线与经纬网跟着一起暗。
           * 用的倍率与侧壁完全相同 —— 它们在同一张图上，若各走一条曲线，
           * 夜里会出现"海岸变暗了但网格还是白天的亮度"这种错位。
           */
          const lineMul = (0.55 + 0.45 * weatherDim) * (0.62 + 0.38 * lit)
          /*
           * 除了压暗，还要**偏冷**。
           *
           * 夜里陆地吃的是冷蓝主光，会偏灰蓝；而墨线是不受光材质，
           * 只压亮度不改色温 —— 结果是"灰蓝的岛上镶着一条暖橙的边"，
           * 读起来像发光的管子，比白天更显眼。
           * 用三通道接近 1 的乘数往冷的方向掰（和夜间海面同一套做法），
           * 不要 lerp 到一个亮的冷色（那等于把深褐整体提亮）。
           */
          const nightK = 1 - lit
          for (let i = 0; i < coast.materials.length; i++) {
            coast.materials[i].color.copy(coastBase[i]).multiplyScalar(lineMul)
            coolLine(coast.materials[i].color, nightK)
          }
          graticule.material.color.copy(gratBase).multiplyScalar(lineMul)
          coolLine(graticule.material.color, nightK)
          // 极远视角下经纬网会和海岸线/航线争注意力：只按相机距离压透明度，
          // 不碰颜色（颜色归上面的日相/天气链，两处各写一遍会互相覆盖）。
          // dist 范围 3~40：≤12 保持 0.22，到 40 降到 0.121，近景仍读得出网格。
          const farK = Math.min(1, Math.max(0, (camState.dist - 12) / (40 - 12)))
          graticule.material.opacity = GRATICULE_OPACITY_NEAR * (1 - 0.45 * farK)
          // 山也是不受光材质（画在纸上的墨迹），同一套倍率
          for (const mat of peakMats) {
            mat.color.copy(peakBase).multiplyScalar(lineMul)
            coolLine(mat.color, nightK)
          }

          /*
           * 外圈与淡出带同理：它们也是不受光材质，**不跟就会在夜里亮成一块**。
           * 白天两块面已经校准到与海面同色，夜里必须一起暗下去，
           * 否则又会出现"白天看不见、夜里裂一条线"的边界——这次的裂缝是"亮"的。
           * 压到 0.8 并偏冷（不是 0.62，那会比受光的海面还暗，反倒更显眼）。
           */
          /*
           * 【不能用 lerp 向一个"亮的夜间色"插值】基色的线性值只有 0.005~0.07，
           * lerp 到 0.72 那种亮度等于把它整体乘 4 倍 —— 实测夜里外圈从 41.5
           * 变成 **113.9**（比白天亮 2.7 倍，一条亮缝横在海图边上）。
           * 要的是"相对压暗 + 偏冷"，所以走**乘数**：三通道各自接近 1 的系数。
           */
          const night = 1 - lit
          const seaNightMul = 0.80 + 0.20 * lit
          outerMat.color.copy(outerBaseColor).multiplyScalar(seaNightMul)
          outerMat.color.multiply(NIGHT_SEA_TINT_BASE)
          outerMat.color.setRGB(
            outerMat.color.r * (1 - 0.10 * night),
            outerMat.color.g * (1 - 0.05 * night),
            outerMat.color.b * (1 + 0.06 * night),
          )
          fadeMat.color.copy(outerMat.color)
        }

        camState.fx += (camTarget.x - camState.fx) * 0.12
        camState.fz += (camTarget.z - camState.fz) * 0.12
        const ce = Math.cos(camState.el), se = Math.sin(camState.el)
        camera.position.set(
          camState.fx + Math.sin(camState.az) * ce * camState.dist,
          se * camState.dist,
          camState.fz + Math.cos(camState.az) * ce * camState.dist
        )
        camera.lookAt(camState.fx, 0, camState.fz)

        // 港口显隐：未发现的不显示（与 2D 的 PortMarker 一致）
        for (const po of portObjects) {
          const found = state.discoveredPorts.includes(po.id)
          po.group.visible = found
          po.label.shown = found
        }

        /*
         * ---- 港口待机动画：旗 / 烟 / 海鸥 ----
         *
         * 【为什么这批动画值得单独写一段】目前画面里所有运动都绑在玩家操作上：
         * 开船才有尾迹、设了航线才有流动虚线、进港才有光环脉冲。玩家一停手，
         * 20 个港口就是 20 块静止的摆件。这三样是**待机时也在动**的东西，
         * 而且便宜：旗与烟只是改矩阵/透明度，海鸥是 1 个 InstancedMesh。
         *
         * detail 的门槛 22：远景下烟不到 2 个像素，隐藏它省的是 draw call
         * （每个 Sprite 各占一次）。海鸥同理，而且远看只是一粒灰。
         */
        {
          // 竖直朝向的山：整组绕竖轴对准相机（相机只绕 Y 转，所以这样正好）
          if (PEAK_FACING === 'upright') peakGroup.rotation.y = camState.az
          // 山符号在屏幕上大致定尺寸：只在缩放变化时重算实例矩阵
          peaks?.setScale(camState.dist)
          // 罗经花同理：远看是一粒米、近看是一片天，都读不出"一朵花"
          rhumb.setScale(camState.dist)

          /*
           * ---- 地势法线随距离淡出 ----
           *
           * 【为什么必须淡出】那张法线来自 2048×1024 的 DEM，一像素约 0.176°≈19 公里。
           * 拉到近景（dist≈8，一屏只装得下法国那么大）时，一个纹素被放大到几十个
           * 屏幕像素——实测整片中欧糊成一团脏褐斑，读作"贴图脏了"，而不是"有山"。
           *
           * 远看时它是画面上最有说服力的一层（安第斯/喜马拉雅/东非大裂谷的脊线），
           * 近看时它是最难看的一层。所以按距离收：dist≥14 满强度，dist≤7 只剩 15%
           * （不给 0：留一点大尺度明暗，否则近景的陆地完全平），
           * 近景的细节交给纸纹 bumpMap（repeat 22×，近景正好 1:1）。
           *
           * 【为什么不是换一张更细的法线图】DEM 就这个分辨率，换图等于造假地形；
           * 而且更高频的法线在远景会变成噪点。收强度是唯一诚实的做法。
           */
          if (lidMat.normalMap) {
            const k = Math.min(1, Math.max(0.15, (camState.dist - 7) / 7))
            // 只在明显变化时写，避免每帧改材质属性
            if (Math.abs(k - lastReliefK) > 0.02) {
              lastReliefK = k
              lidMat.normalScale.set(0.6 * k, 0.6 * k)
              /*
               * 地势收起多少，纸纹就补多少。
               *
               * 近景下 DEM 已经没用了（一片糊），而陆地又不能是一块塑料——
               * 这时该顶上来的是纸纹颗粒（bumpMap，repeat 22×）。
               * 实测 bumpScale 恒为 4 时，dist≈11 的巴黎周边只有一层平色。
               * 收到 0.15×0.6 的同时把颗粒提到 4→8 左右，陆地才重新像纸。
               */
              lidMat.bumpScale = GRAIN_BUMP * (1 + 1.2 * (1 - k))
            }
          }

          const tSec = tNow / 1000
          const detail = camState.dist < 22
          let bi = 0
          for (const po of portObjects) {
            animatePortLife(po.group, tSec, detail && po.group.visible)
            const tier = po.group.userData.portScale as string | undefined
            const hasBird = tier === 'major' || tier === 'medium'
            for (let k = 0; k < BIRDS_PER_PORT; k++) {
              if (detail && hasBird && po.group.visible) {
                const pose = birdPose(k, tSec, po.id)
                birdDummy.position.set(
                  po.group.position.x + pose.dx,
                  pose.dy,
                  po.group.position.z + pose.dz,
                )
                birdDummy.rotation.set(0, pose.yaw, 0)
                birdDummy.scale.setScalar(1)
              } else {
                // 未发现 / 太远：缩成 0（InstancedMesh 的实例数固定，只能这样隐藏）
                birdDummy.position.set(0, -50, 0)
                birdDummy.scale.setScalar(0)
              }
              birdDummy.updateMatrix()
              birds.setMatrixAt(bi++, birdDummy.matrix)
            }
          }
          birds.instanceMatrix.needsUpdate = true
        }

        // 「当前所在港口」光环：位置 + 脉冲 + 贴合底座尺寸
        {
          const cur = fleet.currentPortId
          const curPort = cur != null ? portMap.get(cur) : null
          if (curPort) {
            currentPortRing.visible = true
            currentPortRing.position.set(
              lonToWorldX(curPort.longitude), 0.004, latToWorldZ(curPort.latitude),
            )
            // 环的内径 = 该港底座底面半径（0.19 × baseR × 0.8）+ 间隙。
            // 间隙从 0.01 加到 0.04：0.01 时环几乎贴住底座，
            // 而底座是**立体的圆柱**，斜俯视下它的侧面会把环的远半整个遮住，
            // 只剩一小段弧露在外面（截图里像渲染残缺）。
            const baseR = portScaleOf(curPort) === 'major' ? 1.2
              : portScaleOf(curPort) === 'medium' ? 1.0 : 0.76
            const fit = 0.19 * baseR * 0.8 + 0.04
            // 2.5s 一个周期，与 2D 的 portPulse 同节奏
            const ph = (performance.now() / 2500) * Math.PI * 2
            currentPortRing.material.opacity = 0.34 + 0.26 * (0.5 + 0.5 * Math.sin(ph))
            const s = fit * (1 + 0.06 * Math.sin(ph))
            currentPortRing.scale.set(s, 1, s)
          } else {
            currentPortRing.visible = false
          }
        }

        // 当前港口的名字也高亮（对应 2D 那个"34px + 发光 + 脉冲"的大图标）
        //
        // 【为什么要 DOM 高亮而不只靠地上的环】塞维利亚/里斯本/加的斯三个港口
        // 模型本来就重叠（间距 0.062~0.22 世界单位），光环套在重叠区里认不出归属。
        // 名字高亮不受几何重叠影响，是更稳的"你在这里"信号。
        if (lastCurrentPortId !== fleet.currentPortId) {
          lastCurrentPortId = fleet.currentPortId
          for (const po of portObjects) {
            po.label.el.classList.toggle('map3d-port-label--current', po.id === fleet.currentPortId)
          }
        }

        // 航线：与 2D 虚线共用 getRouteGeometry
        const origin = state.routeOrigin ?? state.shipPosition
        const wp = state.waypoint
        if (origin && wp) {
          // sig 里带上危险等级：航线颜色由它决定，不含进来的话
          // "同一条航线被重新评估成更危险"时颜色不会跟着变。
          //
          // 【第 34 轮：还要带上「几何是否已就绪」】
          // 掩码到位前后算出的几何不一样（直线 vs 避陆弧线）。
          // sig 不含它的话，掩码后到时 sig 没变 → 航线不会重算，
          // 3D 里画的线就永远停在横穿陆地的那条上（2D 那边由 MapView 的
          // 「几何有结论才挂载」挡住了，3D 这条路径要自己带）。
          const geoReady = useMapStore.getState().landDataReady
          const sig = `${origin[0].toFixed(3)},${origin[1].toFixed(3)}->${wp.latitude.toFixed(3)},${wp.longitude.toFixed(3)}|${state.currentRoute?.dangerLevel ?? 2}|${geoReady ? 1 : 0}`
          if (sig !== routeSig) {
            routeSig = sig
            const geom = getRouteGeometry([origin[0], origin[1]], [wp.latitude, wp.longitude])
            const pts = toLatLngList(geom)
            if (pts.length >= 2) {
              const arr: number[] = []
              for (const [la, ln] of pts) arr.push(lonToWorldX(ln), -PLATE_THICKNESS + 0.03, latToWorldZ(la))
              routeGeo.setPositions(arr)
              routeLine.computeLineDistances()
              routeLine.visible = true

              // 航线颜色 = 危险等级。与 2D 的 getDangerColor 同一套分级，
              // 但整体提亮——2D 的深棕（#6b4a2a）在深青绿海面上根本看不见。
              const lvl = state.currentRoute?.dangerLevel ?? 2
              routeMat.color.setHex(lvl <= 2 ? 0xe8c46a : lvl === 3 ? 0xf0a050 : 0xf06a50)

              // 方向箭头 + 终点标记
              placeArrows(pts)
              arrows.visible = arrows.count > 0
              destMark.position.set(
                lonToWorldX(wp.longitude), DEST_MARK_Y, latToWorldZ(wp.latitude),
              )
              destMark.visible = true
            } else {
              routeLine.visible = false
              arrows.visible = false
              destMark.visible = false
            }
          }
        } else {
          routeSig = ''
          routeLine.visible = false
          arrows.visible = false
          destMark.visible = false
        }

        // 终点标记上下浮动：静止的钉子在一堆港口模型里很容易被看漏，
        // 轻微的呼吸让它自己"跳出来"（与新闻提示的脉冲是同一思路，但更安静）
        if (destMark.visible) {
          destMark.position.y = DEST_MARK_Y + Math.sin(tt * 2.2) * 0.045
          destMark.rotation.y = tt * 0.9
        }

        // 叠加图层可见性：跟着底栏的开关走
        //
        // 【为什么在帧循环里读而不是用 React state】
        // 开关状态在 useMapStore 里，而 3D 场景是命令式构建的
        // （three.js 对象不经过 React 渲染）。每帧读一次 getState()
        // 既不用重建场景，也不用引入订阅，代价可以忽略。
        //
        // 这样玩家在 3D 模式里点底栏的图层开关，画面会立刻跟着变——
        // 开关在 2D 和 3D 里指的是**同一件事**。
        const mapState = useMapStore.getState()
        layers.currents.visible = mapState.showCurrentOverlay
        layers.pirates.visible = mapState.showPirateZones
        layers.winds.visible = mapState.showWindOverlay

        // 标签投影到屏幕（港口名 + 海名 + 洲名，共用一套机制）
        //
        // 【为什么要做标签避让】
        // 直接把投影坐标写进 left/top，重叠必然发生：
        // 加勒比（哈瓦那/拿骚/圣胡安）、欧洲（里斯本/伦敦/塞维利亚）
        // 这些港口在地图上本来就挨得近，标签文字会互相压住。
        // 实测：8 个已发现港口有 **4 对重叠**（e2e 抓出来的）。
        //
        // 【为什么挪到独立模块】
        // 现在有三类标签（港口 20 + 海名 18 + 洲名 10 = 48 个）要互相避让，
        // 逻辑写在帧循环里会越来越臃肿。见 mapLabels3d.ts。
        placeLabels(allLabels, camera, width, height, tmpV)
        // 漂流物与标签共用同一台相机、同一个临时向量（不另分配）
        seaLayer.update(camera, width, height, tmpV)

        renderer!.render(scene, camera)
      }

      raf = requestAnimationFrame(tick)
      setPhase('ready')

      // ---- 清理 ----
      const cleanup = () => {
        cancelAnimationFrame(raf)
        window.removeEventListener('resize', onResize)
        el.removeEventListener('pointerdown', onPointerDown)
        el.removeEventListener('pointermove', onPointerMove)
        el.removeEventListener('pointerup', onPointerUp)
        el.removeEventListener('pointercancel', onPointerUp)
        el.removeEventListener('wheel', onWheel)
        for (const po of portObjects) po.label.el.remove()
        for (const l of areaLabels) l.el.remove()
        seaLayer.destroy()
        scene.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose()
        })
        for (const d of disposables) d.dispose()
        // 图层组里的 Line2 / 填充 / 箭头资源不在 disposables 里，单独释放
        layers.dispose()
        borders?.dispose()
        coast.dispose()
        graticule.dispose()
        // 山是异步补建的：切视图时它可能还没建好（peaks 为 null），也可能已建好
        peaks?.dispose()
        rhumb.dispose()
        wake.dispose()
        shallow?.dispose()
        renderer?.dispose()
        if (renderer && renderer.domElement.parentNode === mount) {
          mount.removeChild(renderer.domElement)
        }
      }
      ;(mount as unknown as { __map3dCleanup?: () => void }).__map3dCleanup = cleanup

      // 开发调试钩子：仅在 dev 构建下暴露 three 场景，便于自动化验证
      // （生产构建会被 tree-shake 掉，实测生产包 0 命中）。
      if (import.meta.env?.DEV && typeof window !== 'undefined') {
        ;(window as unknown as { __map3d?: unknown }).__map3d = { scene, camera, renderer }
      }
    }

    boot().catch(err => {
      console.error('[Map3DView]', (err as Error)?.stack ?? err)
      if (!disposed) { setErrorMsg(String(err?.message ?? err)); setPhase('error') }
    })

    return () => {
      disposed = true
      const c = (mount as unknown as { __map3dCleanup?: () => void }).__map3dCleanup
      if (c) c()
    }
  }, [])

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: '#0a1018' }}>
      <div ref={mountRef} className="absolute inset-0" />

      {phase === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-[#e8d4a8] font-serif"
             style={{ letterSpacing: 3, background: 'linear-gradient(180deg,#16212e 0%,#0d1620 100%)' }}>
          <div className="text-center">
            <Anchor size={36} className="mx-auto mb-4 text-gold-600" strokeWidth={1.2} style={{ animation: 'loadPulse 1.5s ease-in-out infinite' }} aria-hidden="true" />
            <div>装配立体海图...</div>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-red-200 font-serif text-sm">
          立体海图加载失败：{errorMsg}
        </div>
      )}

      {/*
        操作提示。两件事：

        ① **按设备说能做得到的事**：原来固定写「滚轮缩放」，
           手机上根本没有滚轮，等于教玩家一个不存在的操作。
           手势本身一直是两条路径都支持的（单指拖拽 + 双指捏合，见下方 pointer 处理）。

        ② **位置必须避开底栏**：原来在 bottom-3 left-3，实测一直被底栏压住
           （桌面提示底边 888、底栏顶边 858；手机 832 vs 714），玩家从来没看见过。
           现在放到顶部居中（罗盘在左、切换按钮在右，中间是空的），
           并 6.5 秒后自动淡出——"教一次就够"的说明不该长期占着画面。
      */}
      {phase === 'ready' && (
        <div
          className="absolute top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none text-center
                     text-[#e2cfa2] font-serif text-xs px-3 py-1.5 rounded-full
                     max-w-[calc(100vw-160px)]"
          style={{
            background: 'rgba(12, 20, 30, 0.55)',
            border: '1px solid rgba(201, 180, 137, 0.28)',
            textShadow: '0 1px 4px #000',
            animation: 'hintFade 6.5s ease-out forwards',
          }}
        >
          {/*
            手机上只讲手势。三段全写会换行成"…点海面" + "设航向"两行且长短失衡
            （实测胶囊内宽 195px，装不下 19 个字）。
            而「点海面设定航向」在 2D 里就是这么用的，3D 沿用同一套交互，
            不是新信息 —— 手机上真正需要教的只有手势。
          */}
          {isMobile ? '单指转视角 · 双指缩放' : '拖拽转视角 · 滚轮缩放 · 点击海面设定航向'}
        </div>
      )}
    </div>
  )
}

/** 载入贴图（flipY=false 时 v=0 对应图片首行，用于 Web Mercator 贴图） */
function loadTexture(url: string, flipY: boolean): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      url,
      (tex) => {
        tex.flipY = flipY
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 4
        tex.needsUpdate = true
        resolve(tex)
      },
      undefined,
      () => reject(new Error(`贴图加载失败：${url}`)),
    )
  })
}
