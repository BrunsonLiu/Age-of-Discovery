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
import { findNearestOceanPoint, isOnLand, fetchLandGeojsonForRender } from '@/utils/landCheck'
import { getRouteGeometry, toLatLngList } from '@/utils/routePath'
import { calculateBearing } from '@/utils/navigation'
import {
  MAP_WORLD_SIZE, lonToWorldX, latToWorldZ, worldXToLon, worldZToLat,
} from '@/utils/mapProjection'
import { buildLandGeometry, PLATE_THICKNESS } from './landGeometry'
import { createPortModelKit, createShipModelKit, makePortModel, makeShipModel, portScaleOf } from './models'
import { buildMap3DLayers } from './mapLayers3d'
import { buildMap3DBorders } from './mapBorders3d'
import { fetchBordersGeojson } from '@/utils/mapGeoJson'
import { decidePixelRatio } from '@/utils/adaptiveResolution'
import { isTapGesture } from '@/utils/tapGesture'
import { WEATHER_INFO } from '@/utils/weather'
import { useIsMobile } from '@/hooks/useIsMobile'
import {
  createAreaLabels, createPortLabel, measureLabels, placeLabels, remeasureWhenFontsReady,
  type ScreenLabel,
} from './mapLabels3d'
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

export default function Map3DView() {
  const mountRef = useRef<HTMLDivElement>(null)
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
      const [geojson, landTex, seaTex] = await Promise.all([
        fetchLandGeojsonForRender(),
        loadTexture(`${base}data/painted-land.png`, false),
        loadTexture(`${base}data/painted-sea.png`, false),
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

      const width = mount.clientWidth || 800
      const height = mount.clientHeight || 600

      // ---- 渲染器 ----
      renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' })
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
      renderer.setSize(width, height)
      renderer.shadowMap.enabled = true
      renderer.shadowMap.type = THREE.PCFShadowMap
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
      sea.position.set(MAP_WORLD_SIZE / 2, -PLATE_THICKNESS - 0.004, 0)
      sea.receiveShadow = true
      scene.add(sea)

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
      const outerGeo = (() => {
        const half = 45
        const shape = new THREE.Shape()
        shape.moveTo(-half, -half)
        shape.lineTo(half, -half)
        shape.lineTo(half, half)
        shape.lineTo(-half, half)
        shape.closePath()
        /*
         * 内沿往里多盖 0.3 单位（OVERLAP）。
         *
         * 【为什么不能正好贴着海图本体的边】实测那道 2px 暗线不是缝隙，
         * 换洋红验过：它属于**海面本体**——painted-sea.png 最外一行本身是深色
         * （ClampToEdge 采样到贴图边框），于是海图四边各有一圈暗边。
         * 方环多盖一点，把海面那圈暗边压在下面，交界就落在贴图内部正常的区域。
         * 环比海面高 0.002，重叠区由环胜出；因为两者颜色已校准到相差 ≤2 级，
         * 交界本身看不出来。
         */
        const OVERLAP = 0.3
        const h = MAP_WORLD_SIZE / 2 - OVERLAP
        const hole = new THREE.Path()
        hole.moveTo(-h, -h)
        hole.lineTo(-h, h)
        hole.lineTo(h, h)
        hole.lineTo(h, -h)
        hole.closePath()
        shape.holes.push(hole)
        // 只建在 XY 平面：绕 X 的放平动作交给下面 mesh 的 rotation.x，
        // 在几何里再转一次会变成"转两遍"，方环直接立起来（实测整片外圈消失）
        return new THREE.ShapeGeometry(shape)
      })()

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
        new THREE.MeshBasicMaterial({ color: 0x0a2230 })
      )
      outer.rotation.x = -Math.PI / 2
      outer.position.set(MAP_WORLD_SIZE / 2, -PLATE_THICKNESS - 0.004 + 0.002, 0)
      scene.add(outer)
      disposables.push(seaGeo, seaMat, outer.geometry, outer.material)

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
      /** 海盗事件把海面染红时的加项（emissive 的等价物，不受光材质只能加到颜色上） */
      let pirateR = 0, pirateG = 0, pirateB = 0
      const setSeaColor = (r: number, g: number, b: number) => {
        seaMat.color.setRGB(r, g, b)
        const k = SEA_BASE_R > 0 ? r / SEA_BASE_R : 1
        outerMat.color.setRGB(
          OUTER_BASE[0] * k + pirateR,
          OUTER_BASE[1] * k + pirateG,
          OUTER_BASE[2] * k + pirateB,
        )
      }
      setSeaColor(SEA_BASE_R, SEA_BASE_G, SEA_BASE_B)

      // ---- 陆地板块 ----
      const land = buildLandGeometry(geojson as unknown as Parameters<typeof buildLandGeometry>[0])
      const lidMat = new THREE.MeshStandardMaterial({
        map: landTex, roughness: 0.88, metalness: 0.02,
      })
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
      const lidMesh = new THREE.Mesh(land.lid, lidMat)
      lidMesh.castShadow = true; lidMesh.receiveShadow = true
      const wallMesh = new THREE.Mesh(land.wall, wallMat)
      wallMesh.castShadow = true; wallMesh.receiveShadow = true
      scene.add(lidMesh, wallMesh)
      disposables.push(land.lid, land.wall, lidMat, wallMat)

      // ---- 微缩港口 ----
      const portKit = createPortModelKit()
      const shipKit = createShipModelKit()
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

      // ---- 玩家船 ----
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
      const layers = buildMap3DLayers()
      scene.add(layers.currents, layers.pirates, layers.winds)
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
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer!.setSize(w, h)
        routeMat.resolution.set(w, h)
        for (const m of layers.lineMaterials) m.resolution.set(w, h)
        borders?.material.resolution.set(w, h)
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
          const nearK = Math.min(1, Math.max(0.45, camState.dist / 8))
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
            setSeaColor(seaMat.color.r, seaMat.color.g, seaMat.color.b)
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
          const dim = weatherKind === 'fog' ? 1 - gloom * 0.3 : 1 - gloom * 1.1
          key.intensity = LIGHT_KEY * dim
          rim.intensity = LIGHT_RIM * dim
          ambient.intensity = LIGHT_AMB * dim
          scene.environmentIntensity = ENV_BASE * dim
          // 侧壁是不受光材质，不吃上面这四行，必须自己跟一次——
          // 否则暴风雨里整张海图都暗了，只有海岸那圈还是晴天的亮度。
          wallMat.color.setScalar(0.55 + 0.45 * dim)
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
          const sig = `${origin[0].toFixed(3)},${origin[1].toFixed(3)}->${wp.latitude.toFixed(3)},${wp.longitude.toFixed(3)}|${state.currentRoute?.dangerLevel ?? 2}`
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
        scene.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose()
        })
        for (const d of disposables) d.dispose()
        // 图层组里的 Line2 / 填充 / 箭头资源不在 disposables 里，单独释放
        layers.dispose()
        borders?.dispose()
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
