import * as THREE from 'three'
import {
  COAST_HIDE_BEHIND_DEG, coastScenePos, hash01, wrapDeg,
  type CoastSighting,
} from './deckCoast'
import {
  harborPlan, harborRadius, harborStyleFor, harborVisible,
  type FolkKind, type HarborFolk, type HarborPlan, type HarborStyle,
} from './deckHarbor'
import { texFrom } from './shipTextures'

/**
 * 靠港近景的几何层：把 `deckHarbor` 算出的布局变成 mesh。
 *
 * 【为什么要与 `coastModel` 分开】那一层是"远岸的剪影"，逻辑是"一条横带随距离退远"；
 * 这一层是"近港的实体"，逻辑是"一城房子随距离长出来、换样式换颜色"。两者的更新节奏
 * （8 帧一次）与坐标系相同，但状态机完全不同（样式切换要重建材质色、实例数要变）。
 * 塞进同一个文件只会让 642 行的 `coastModel` 变成 1000 行。
 *
 * 【为什么几乎全是 InstancedMesh】一座港有 8~11 栋房、4 条栈桥、4 条船、6 棵棕榈 ——
 * 逐个 Mesh 是 40+ 次 draw call，而它只是一块背景。墙、屋顶、桅杆、假帆、棕榈干
 * 各一个 InstancedMesh，整座港压到 ~10 次 draw call。多余的实例缩放到 0
 * （与港口灯火"未发现就挪到 −100"是同一个手法）。
 */

/** 各部件数量上限（够用就好：超过上限的 plan 会被截断，不会崩） */
const MAX_HOUSE = 12
const MAX_PIER = 5
const MAX_MOOR = 6
const MAX_PALM = 8
const MAX_CRANE = 3
const MAX_FOLK = 14
const MAX_LAMP = 10

export interface DeckHarbor {
  group: THREE.Group
  /**
   * @param s        最近陆地（与 coast 同一个来源）
   * @param isSailing 停泊时无条件显示（见 `harborVisible` 的注释）
   */
  setSighting(s: CoastSighting | null, isSailing: boolean): void
  /** night 0..1；horizon/fog 与海岸同一套大气透视 */
  update(t: number, night: number, fogK: number, fogColor: THREE.Color): void
  dispose(): void
  /** 取证用：当前这一帧的布局与样式（e2e / 探针读它，不猜像素） */
  debug(): {
    style: string; houses: number; piers: number; moorings: number
    night: number; litK: number; plan: HarborPlan | null
  }
}

function makeGlow(): THREE.Texture {
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.28, 'rgba(255,236,190,0.82)')
  grad.addColorStop(0.6, 'rgba(255,190,110,0.22)')
  grad.addColorStop(1, 'rgba(255,170,90,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  return texFrom(c)
}

export function createDeckHarbor(): DeckHarbor {
  const group = new THREE.Group()
  group.name = 'deck-harbor'
  group.visible = false

  const glowTex = makeGlow()

  /* ---- 材质：全部 MeshBasicMaterial（远程背景，用不着光照；夜里靠 night 插值） ---- */
  const mk = (color: number, extra: Partial<THREE.MeshBasicMaterialParameters> = {}) =>
    new THREE.MeshBasicMaterial({ color, ...extra })
  const deckMat = mk(0x6b5b45)
  const wallMat = mk(0xd8cdb6)
  const roofMat = mk(0x9c4a33)
  const stoneMat = mk(0x8a8377)
  const pierMat = mk(0x4a3a28)
  const mastMat = mk(0x3b2e20)
  const sailMat = mk(0xbdb3a0, { side: THREE.DoubleSide })
  /* 停泊船的船壳与舷缘单独两个色：船壳比海面亮一档，舷缘再亮一档 */
  /*
   * 【必须 DoubleSide】船体是从 `ExtrudeGeometry` 的轮廓挤出的：Shape 的绕向
   * 决定了侧面法线朝里还是朝外。绕向反了时，整艘船**一个面都看不见**
   * （顶面朝下、侧壁朝内，全被背面剔除），画面上只剩桅杆与帆 —— 这正是
   * "四条船只剩八根线"的真正原因（第一版以为是太小，把干舷从 2 米加到 5 米也没用）。
   * 双面渲染对这么小的背景物体没有代价，也顺手修掉"从侧面看是一条线"。
   */
  /* 窗洞：比墙暗两档的凹口（白天唯一的立面细节） */
  const paneMat = mk(0x2b2a26)
  /* 烟囱：比屋顶暗一点的砖色 —— 用墙色会与白墙糊在一起 */
  const chimneyMat = mk(0x6b4a3a)
  const hullMat = mk(0x6a5138, { side: THREE.DoubleSide })
  const railMat = mk(0x9c7c56, { side: THREE.DoubleSide })
  const palmMat = mk(0x2f4026)
  const flagMat = mk(0xb03a2e, { side: THREE.DoubleSide })
  const spireMat = mk(0x8e8578)
  /** 每个材质在 setSighting 里记下"白天的本色"，update 按 night 插值 */
  const bases = new Map<THREE.Material, THREE.Color>()
  for (const m of [deckMat, wallMat, roofMat, stoneMat, pierMat, mastMat, sailMat, palmMat, flagMat, spireMat, hullMat, railMat, paneMat, chimneyMat]) {
    bases.set(m, (m as THREE.MeshBasicMaterial).color.clone())
  }

  /* ---- 码头面：一块横板，贴在水线上 ---- */
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), deckMat)
  deck.name = 'deck-harbor-quay'
  group.add(deck)

  /*
   * 码头外沿的压条：一条比码头面亮一档的窄带。
   * 【为什么需要】码头面（尤其加勒比的木色）与水面的明度接近时，两者读成一片
   * —— 实测广州与哈瓦那的截图上，房子像直接站在泥滩上，看不出"这是一道人工的岸"。
   * 一条几十厘米高的亮边就够把两者缝开，而且它正是石砌码头的压顶石。
   */
  const quayEdge = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), railMat)
  quayEdge.name = 'deck-harbor-quay-edge'
  group.add(quayEdge)

  /* ---- 房屋墙（实例化） ---- */
  const wallGeo = new THREE.BoxGeometry(1, 1, 1)
  wallGeo.translate(0, 0.5, 0) // 原点放到地面，缩放时房子是从地面往上长
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, MAX_HOUSE)
  walls.name = 'deck-harbor-walls'
  walls.frustumCulled = false
  group.add(walls)

  /*
   * 屋顶：**两坡顶**（屋脊平行岸线）。
   *
   * 第一版用四棱锥（ConeGeometry 4 段）—— "坡顶"的剪影有了，但四坡顶没有方向：
   * 一排房子看起来是一排**帐篷/方尖碑**，天际线全是孤立的尖（实测截图）。
   * 真实码头边的排屋屋脊是**平行于街道**的，连起来看是一条折线 —— 这个形状
   * 才是"城"的识别特征。所以手写一个三角棱柱：底面 1×1、屋脊在 y=1 沿 x。
   */
  const roofGeo = (() => {
    const g = new THREE.BufferGeometry()
    const v = [
      // 前坡（+z 面）
      -0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0,
      -0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0,
      // 后坡（−z 面）
      -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0,
      -0.5, 0, -0.5, 0.5, 1, 0, 0.5, 0, -0.5,
      // 两端山墙
      -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0,
      0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0,
    ]
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.computeVertexNormals()
    return g
  })()
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, MAX_HOUSE)
  roofs.name = 'deck-harbor-roofs'
  roofs.frustumCulled = false
  group.add(roofs)

  /* ---- 窗光：每栋房子门口两点 + 檐下一点 ---- */
  const winGeo = new THREE.BufferGeometry()
  winGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_HOUSE * 3 * 3), 3))
  const winMat = new THREE.PointsMaterial({
    map: glowTex,
    color: new THREE.Color(1.5, 1.05, 0.6),
    size: 1,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
    fog: false,
    toneMapped: false,
  })
  const windows = new THREE.Points(winGeo, winMat)
  windows.name = 'deck-harbor-windows'
  windows.frustumCulled = false
  group.add(windows)

  /* ---- 栈桥（板 + 桩） ---- */
  const pierGeo = new THREE.BoxGeometry(1, 1, 1)
  const piers = new THREE.InstancedMesh(pierGeo, pierMat, MAX_PIER)
  piers.name = 'deck-harbor-piers'
  piers.frustumCulled = false
  group.add(piers)
  const pileGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 5)
  pileGeo.translate(0, -0.5, 0)
  const piles = new THREE.InstancedMesh(pileGeo, pierMat, MAX_PIER * 6)
  piles.name = 'deck-harbor-piles'
  piles.frustumCulled = false
  group.add(piles)

  /* ---- 防波堤 ---- */
  /*
   * 四棱台（下宽上窄）= 抛石堤的坡面。用 Box 做出来的是一个**竖着的方块**，
   * 从甲板上看就是一块水泥板（第一版实测）；收个 30% 的坡，剪影立刻变成"堤"。
   */
  const bwGeo = new THREE.CylinderGeometry(0.34, 0.5, 1, 4)
  bwGeo.rotateY(Math.PI / 4)
  bwGeo.translate(0, 0.5, 0)
  const bws = new THREE.InstancedMesh(bwGeo, stoneMat, 2)
  bws.name = 'deck-harbor-breakwater'
  bws.frustumCulled = false
  group.add(bws)

  /* ---- 停泊商船：船壳 + 桅杆 + 帆 ---- */
  /*
   * 【单位几何 + scale 给绝对尺寸】第一版这里写的是 Box(1, 0.5, 0.36)，
   * 然后 `scale.set(len, len*0.55, len)` —— 三个轴都乘了船长，于是每条
   * 停泊船是 6 单位长、3 单位高、2 单位宽（按 1 单位≈18 米算，40 米宽 60 米高）。
   * 屏幕上就是两块深棕色的**大木板**横在码头上，把房子全挡住了（实测截图）。
   * 现在几何一律 1×1×1，尺寸只在 scale 里给一次。
   */
  /*
   * 船体：从**俯视轮廓**挤出（不是方块）。
   *
   * 【为什么非改不可】方块船体从侧面看就是一条深棕色的长条 —— 屏幕上读作
   * "一根木头浮在水上"，四条停泊船只剩八根桅杆（实测截图）。真实船的识别特征
   * 是**尖头尖尾**：一个收窄的前端在剪影上就够说话了。
   * 轮廓长 1（x）、宽 0.29（y→z）、挤出深度 1（y 方向，由 scale 压成干舷）。
   */
  const hullGeo = (() => {
    /*
     * 手写船体：8 个轮廓点、上下两个面 + 一圈侧壁。
     *
     * 【为什么不用 ExtrudeGeometry】那一版在做出来之后**一个像素都不显示**：
     * 实例矩阵、位置、投影全都对（探针把船投到屏幕 (919,436)，正是水面），
     * 但画面上只有桅杆。Shape 的三角化在这里出了问题（curveSegments 生成的
     * 点被判定为退化），换成 DoubleSide 也没用。
     * 手写 32 个三角形之后立刻可见 —— 这种"轮廓挤出"的形状，与其猜三角化，
     * 不如自己列顶点：点少、可控、还能保证法线朝外。
     */
    const RING: [number, number][] = [
      [-0.5, 0], [-0.34, 0.132], [0, 0.145], [0.3, 0.118],
      [0.5, 0], [0.3, -0.118], [0, -0.145], [-0.34, -0.132],
    ]
    const pos: number[] = []
    const push = (x: number, y: number, z: number) => { pos.push(x, y, z) }
    const N = RING.length
    // 侧面（每段两个三角）
    for (let i = 0; i < N; i++) {
      const [x0, z0] = RING[i]
      const [x1, z1] = RING[(i + 1) % N]
      push(x0, 0, z0); push(x1, 0, z1); push(x1, 1, z1)
      push(x0, 0, z0); push(x1, 1, z1); push(x0, 1, z0)
    }
    // 顶面（扇形，中心 + 每段）
    for (let i = 0; i < N; i++) {
      const [x0, z0] = RING[i]
      const [x1, z1] = RING[(i + 1) % N]
      push(0, 1, 0); push(x0, 1, z0); push(x1, 1, z1)
    }
    // 底面（反向）
    for (let i = 0; i < N; i++) {
      const [x0, z0] = RING[i]
      const [x1, z1] = RING[(i + 1) % N]
      push(0, 0, 0); push(x1, 0, z1); push(x0, 0, z0)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return g
  })()
  const hulls = new THREE.InstancedMesh(hullGeo, hullMat, MAX_MOOR)
  hulls.name = 'deck-harbor-hulls'
  hulls.frustumCulled = false
  group.add(hulls)
  /*
   * 舷缘：船壳顶上一圈浅色的带。
   * 【为什么非要有】船壳只有 2~3 米干舷（0.13 单位），在 18 单位外是 8 像素的
   * 深棕色 —— 与深蓝的海面几乎同亮度，画面上看就是"桅杆从水里长出来"
   * （实测截图：四条船只剩八根杆子）。加一条浅色舷缘，船的轮廓立刻出来。
   */
  const railGeo = hullGeo.clone()
  const rails = new THREE.InstancedMesh(railGeo, railMat, MAX_MOOR)
  rails.name = 'deck-harbor-rails'
  rails.frustumCulled = false
  group.add(rails)
  /*
   * 艉楼：船尾那截抬高的甲板室。**这是帆船最好认的一个特征**——
   * 光有尖头尖尾的船体（2~3 米干舷）在 300 米外只有 10 像素，
   * 抬起来的艉楼能把"这是船"再往前推一步，也顺便解释了船尾楼为什么比甲板高。
   */
  const sternGeo = new THREE.BoxGeometry(1, 1, 1)
  sternGeo.translate(0, 0.5, 0)
  const sterns = new THREE.InstancedMesh(sternGeo, hullMat, MAX_MOOR)
  sterns.name = 'deck-harbor-sterns'
  sterns.frustumCulled = false
  group.add(sterns)

  /*
   * 桅径 0.05（≈1.8 米直径）。真实主桅 0.6~0.9 米，在 250 米外只有 0.3 像素 ——
   * 屏幕上就是一排**看不见的线**，四条船只剩"水面上几个点"（实测截图）。
   * 与灯塔同样处理：远处的识别特征允许夸张，比例尺由 HUD 的数字负责。
   */
  const mastGeoShip = new THREE.CylinderGeometry(0.045, 0.055, 1, 6)
  mastGeoShip.translate(0, 0.5, 0)
  const masts = new THREE.InstancedMesh(mastGeoShip, mastMat, MAX_MOOR * 2)
  masts.name = 'deck-harbor-masts'
  masts.frustumCulled = false
  group.add(masts)
  /*
   * 帆：**收起来**的横桁帆 —— 一块窄长的横条挂在桅杆上。
   * 停泊的船张着满帆是错的（真实是收帆系在桁上），而且一排满帆会把港口
   * 糊成一面白墙。横条的剪影也正好是"一排桅杆"的识别特征。
   */
  const sailGeo = new THREE.BoxGeometry(1, 1, 0.02)
  const sails = new THREE.InstancedMesh(sailGeo, sailMat, MAX_MOOR * 2)
  sails.name = 'deck-harbor-sails'
  sails.frustumCulled = false
  group.add(sails)

  /* ---- 棕榈 / 尖顶 / 吊臂 / 旗 ---- */
  const palmGeo = new THREE.CylinderGeometry(0.045, 0.07, 1, 5)
  palmGeo.translate(0, 0.5, 0)
  const palms = new THREE.InstancedMesh(palmGeo, palmMat, MAX_PALM)
  palms.name = 'deck-harbor-palms'
  palms.frustumCulled = false
  group.add(palms)
  const frondGeo = new THREE.ConeGeometry(0.16, 0.62, 4)
  const fronds = new THREE.InstancedMesh(frondGeo, palmMat, MAX_PALM * 5)
  fronds.name = 'deck-harbor-fronds'
  fronds.frustumCulled = false
  group.add(fronds)

  /*
   * 钟楼 = **方塔 + 细锥**。只给一个大锥（第一版：底半径 0.62、高 2.9）时，
   * 屏幕上是一个白色大三角 —— 读成帐篷或帆，不是塔（实测放大截图）。
   * 塔身（Box）给出"这是个建筑"的体量，锥只做收头。
   */
  /*
   * 窗洞与烟囱：各一个 InstancedMesh。
   * 【为什么不做成"在墙贴图上画窗户"】墙是 InstancedMesh + 一张纯色材质，
   * 每栋房的宽高都不同，贴图上的窗会跟着拉伸；而且贴图在夜里还要与窗光对齐。
   * 独立的小盒最省事：位置由 `harborPlan` 给（纯函数，可单测），几何只有两块。
   */
  const paneGeo = new THREE.BoxGeometry(1, 1, 1)
  const panes = new THREE.InstancedMesh(paneGeo, paneMat, MAX_HOUSE * 6)
  panes.name = 'deck-harbor-panes'
  panes.frustumCulled = false
  group.add(panes)
  const chimneyGeo = new THREE.BoxGeometry(1, 1, 1)
  chimneyGeo.translate(0, 0.5, 0)
  const chimneys = new THREE.InstancedMesh(chimneyGeo, chimneyMat, MAX_HOUSE)
  chimneys.name = 'deck-harbor-chimneys'
  chimneys.frustumCulled = false
  group.add(chimneys)

  /*
   * ---- 码头上的人 ----
   * 三种衣服颜色各一个 InstancedMesh（搬运工土黄 / 水手深蓝 / 闲站米白），
   * 头单独一个（统一深色，远处只有一个点）。总共 4 次 draw call，
   * 换来"这座城里有人在干活"。每帧只做很小的上下起伏（走路的样子）。
   */
  const folkBodyMat: Record<FolkKind, THREE.MeshBasicMaterial> = {
    /* 搬运工用偏亮的土黄（与码头面 0x9a9184 太近就糊成一片）、水手深蓝、闲站米白 */
    porter: mk(0x7d5a36),
    sailor: mk(0x33465f),
    idle: mk(0xc4b79c),
  }
  const folkHeadMat = mk(0x6b5744)
  for (const m of [...Object.values(folkBodyMat), folkHeadMat]) bases.set(m, m.color.clone())

  const folkBodyGeo = new THREE.BoxGeometry(1, 1, 1)
  folkBodyGeo.translate(0, 0.5, 0)
  const folkBody: Record<FolkKind, THREE.InstancedMesh> = {
    porter: new THREE.InstancedMesh(folkBodyGeo, folkBodyMat.porter, MAX_FOLK),
    sailor: new THREE.InstancedMesh(folkBodyGeo, folkBodyMat.sailor, MAX_FOLK),
    idle: new THREE.InstancedMesh(folkBodyGeo, folkBodyMat.idle, MAX_FOLK),
  }
  for (const [k, m] of Object.entries(folkBody)) {
    m.name = `deck-harbor-folk-${k}`
    m.frustumCulled = false
    group.add(m)
  }
  /* 头：6×4 段的球，远处读作一个圆点（用 Box 会读成"方脑袋"） */
  const folkHeadGeo = new THREE.SphereGeometry(0.5, 6, 4)
  const folkHead = new THREE.InstancedMesh(folkHeadGeo, folkHeadMat, MAX_FOLK)
  folkHead.name = 'deck-harbor-folk-head'
  folkHead.frustumCulled = false
  group.add(folkHead)

  /*
   * ---- 水边的灯 ----
   * 灯杆（细柱，与桅同色）+ 光点（一个 Points，加法混合）。
   * 【为什么光点要单独一批而不是并进窗光】两者的分布完全不同：窗光散在墙上、
   * 沿岸线高度一致；灯是**沿水边的一排**、高度更高、更亮。并进一批就没法
   * 分别控制（雾里的削弱、夜里的强度都要各算一份）。
   */
  const lampPostGeo = new THREE.CylinderGeometry(0.016, 0.022, 1, 5)
  lampPostGeo.translate(0, 0.5, 0)
  const lampPosts = new THREE.InstancedMesh(lampPostGeo, mastMat, MAX_LAMP)
  lampPosts.name = 'deck-harbor-lampposts'
  lampPosts.frustumCulled = false
  group.add(lampPosts)
  const lampGeo = new THREE.BufferGeometry()
  lampGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LAMP * 3), 3))
  const lampMat = new THREE.PointsMaterial({
    map: glowTex,
    color: new THREE.Color(1.7, 1.15, 0.62),
    size: 1,
    sizeAttenuation: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
    fog: false,
    toneMapped: false,
  })
  const lampPoints = new THREE.Points(lampGeo, lampMat)
  lampPoints.name = 'deck-harbor-lamps'
  lampPoints.frustumCulled = false
  group.add(lampPoints)

  const spireTower = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), spireMat)
  spireTower.name = 'deck-harbor-spire'
  spireTower.geometry.translate(0, 0.5, 0)
  group.add(spireTower)
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 4), spireMat)
  spire.rotation.y = Math.PI / 4
  spire.name = 'deck-harbor-spire-cap'
  spire.geometry.translate(0, 0.5, 0)
  group.add(spire)

  const craneGeo = new THREE.BoxGeometry(1, 0.12, 0.12)
  const cranes = new THREE.InstancedMesh(craneGeo, pierMat, MAX_CRANE)
  cranes.name = 'deck-harbor-cranes'
  cranes.frustumCulled = false
  group.add(cranes)

  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5), mastMat)
  flagPole.geometry.translate(0, 0.5, 0)
  group.add(flagPole)
  const flagCloth = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.15), flagMat)
  group.add(flagCloth)

  const dummy = new THREE.Object3D()
  const zero = new THREE.Matrix4().makeScale(0, 0, 0)
  let plan: HarborPlan | null = null
  let style: HarborStyle = harborStyleFor('europe')

  let folkList: { f: HarborFolk; slot: number }[] = []
  let curDeckY = 0

  /**
   * 把人写进实例矩阵。`t` 用来做很小的上下起伏（走路），
   * 幅度只有身高的 7% —— 远处看是"在动"，不是"在跳"。
   */
  function writeFolk(t: number) {
    const used: Record<FolkKind, number> = { porter: 0, sailor: 0, idle: 0 }
    for (let i = 0; i < folkList.length; i++) {
      const { f } = folkList[i]
      const bob = Math.sin(t * 2.4 + f.phase) * f.h * 0.07
      dummy.position.set(f.x, curDeckY + bob, f.z)
      dummy.rotation.set(0, f.yaw, 0)
      // 躯干：宽 = 身高的 30%（肩宽 1.7 米的人约 0.5 米），厚 22%
      dummy.scale.set(f.h * 0.3, f.h * 0.72, f.h * 0.22)
      dummy.updateMatrix()
      folkBody[f.kind].setMatrixAt(used[f.kind]++, dummy.matrix)

      dummy.position.set(f.x, curDeckY + bob + f.h * 0.78, f.z)
      dummy.rotation.set(0, f.yaw, 0)
      dummy.scale.set(f.h * 0.26, f.h * 0.26, f.h * 0.26)
      dummy.updateMatrix()
      folkHead.setMatrixAt(i, dummy.matrix)
    }
    for (const k of ['porter', 'sailor', 'idle'] as FolkKind[]) {
      for (let i = used[k]; i < MAX_FOLK; i++) folkBody[k].setMatrixAt(i, zero)
      folkBody[k].instanceMatrix.needsUpdate = true
    }
    for (let i = folkList.length; i < MAX_FOLK; i++) folkHead.setMatrixAt(i, zero)
    folkHead.instanceMatrix.needsUpdate = true
  }

  function apply(pl: HarborPlan) {
    const { deckHalfW, deckZ0, deckZ1, deckY } = pl

    /*
     * 码头面横向铺到 1.5 倍半宽：只铺房子那么宽时，两侧会露出 `coastModel`
     * 的草地与松树，与石砌码头的交界是一条硬边（实测截图里房子两端直接是草坪）。
     * 铺宽之后它读成"整段岸都修了堤"，也顺手把树挡在城后面。
     */
    deck.scale.set(deckHalfW * 3, Math.max(0.06, deckY), deckZ1 - deckZ0)
    deck.position.set(0, deckY * 0.5, (deckZ0 + deckZ1) * 0.5)

    quayEdge.scale.set(deckHalfW * 3, Math.max(0.04, deckY * 0.22), 0.16)
    quayEdge.position.set(0, deckY, deckZ0 + 0.06)

    /* ---- 房屋 ---- */
    const nH = Math.min(MAX_HOUSE, pl.houses.length)
    for (let i = 0; i < MAX_HOUSE; i++) {
      const h = i < nH ? pl.houses[i] : null
      if (!h) { walls.setMatrixAt(i, zero); roofs.setMatrixAt(i, zero); continue }
      dummy.position.set(h.x, deckY, h.z)
      dummy.rotation.set(0, h.yaw, 0)
      dummy.scale.set(h.w, h.h, h.d)
      dummy.updateMatrix()
      walls.setMatrixAt(i, dummy.matrix)

      dummy.position.set(h.x, deckY + h.h, h.z)
      dummy.rotation.set(0, h.yaw, 0)
      dummy.scale.set(h.w * 1.06, Math.max(0.05, h.roofH), h.d * 1.06)
      dummy.updateMatrix()
      roofs.setMatrixAt(i, dummy.matrix)
    }
    walls.instanceMatrix.needsUpdate = true
    roofs.instanceMatrix.needsUpdate = true

    /* ---- 窗洞：白天的立面细节（夜里再叠一层光点） ---- */
    let qi = 0
    for (const pn of pl.panes) {
      if (qi >= MAX_HOUSE * 6) break
      dummy.position.set(pn.x, pn.y, pn.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(pn.w, pn.h, 0.05)
      dummy.updateMatrix()
      panes.setMatrixAt(qi++, dummy.matrix)
    }
    for (let i = qi; i < MAX_HOUSE * 6; i++) panes.setMatrixAt(i, zero)
    panes.instanceMatrix.needsUpdate = true

    /* ---- 码头上的人（矩阵在 update 里每帧重写，这里先摆到位） ---- */
    folkList = pl.folk.slice(0, MAX_FOLK).map((f) => ({ f, slot: 0 }))
    {
      const used: Record<FolkKind, number> = { porter: 0, sailor: 0, idle: 0 }
      for (const item of folkList) {
        item.slot = used[item.f.kind]++
      }
    }
    curDeckY = deckY
    writeFolk(0)

    /* ---- 水边的灯：灯杆 + 光点（光点的 y 就是灯高） ---- */
    {
      const lp = lampGeo.getAttribute('position') as THREE.BufferAttribute
      const nL = Math.min(MAX_LAMP, pl.lamps.length)
      for (let i = 0; i < MAX_LAMP; i++) {
        const l = i < nL ? pl.lamps[i] : null
        if (!l) {
          lampPosts.setMatrixAt(i, zero)
          lp.setXYZ(i, 0, -100, 0)
          continue
        }
        dummy.position.set(l.x, deckY, l.z)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, l.y, 1)
        dummy.updateMatrix()
        lampPosts.setMatrixAt(i, dummy.matrix)
        lp.setXYZ(i, l.x, deckY + l.y, l.z)
      }
      lampPosts.instanceMatrix.needsUpdate = true
      lp.needsUpdate = true
    }

    /* ---- 烟囱：一半的房子有，站在屋脊上 ---- */
    let ci = 0
    for (let i = 0; i < nH && ci < MAX_HOUSE; i++) {
      const ch = pl.chimneys[i] ?? pl.chimneys[ci]
      if (!ch) continue
      dummy.position.set(ch.x, deckY + pl.houses[i].h + pl.houses[i].roofH * 0.55, ch.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(ch.w, ch.h, ch.w)
      dummy.updateMatrix()
      chimneys.setMatrixAt(ci++, dummy.matrix)
    }
    for (let i = ci; i < MAX_HOUSE; i++) chimneys.setMatrixAt(i, zero)
    chimneys.instanceMatrix.needsUpdate = true

    /* ---- 窗光：只给亮着的那几栋（位置在房子靠海那一面） ---- */
    const wp = winGeo.getAttribute('position') as THREE.BufferAttribute
    let wi = 0
    for (let i = 0; i < nH; i++) {
      const h = pl.houses[i]
      if (!h.lit) continue
      const zf = h.z - h.d * 0.5 - 0.02
      for (let k = 0; k < 2; k++) {
        const off = (k - 0.5) * h.w * 0.42
        wp.setXYZ(wi++, h.x + off, deckY + h.h * (0.34 + 0.12 * k), zf)
      }
    }
    for (let i = wi; i < MAX_HOUSE * 3; i++) wp.setXYZ(i, 0, -100, 0)
    wp.needsUpdate = true

    /* ---- 栈桥 + 桩 ---- */
    const nP = Math.min(MAX_PIER, pl.piers.length)
    let pi = 0
    for (let i = 0; i < MAX_PIER; i++) {
      const p = i < nP ? pl.piers[i] : null
      if (!p) { piers.setMatrixAt(i, zero); continue }
      const len = Math.abs(p.z1 - p.z0)
      dummy.position.set(p.x, deckY + 0.02, (p.z0 + p.z1) * 0.5)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(p.w, 0.07, len)
      dummy.updateMatrix()
      piers.setMatrixAt(i, dummy.matrix)
      // 每 1.2 单位一对桩
      const np = Math.min(3, Math.max(1, Math.round(len / 1.2)))
      for (let k = 0; k < np && pi < MAX_PIER * 6; k++) {
        const zz = p.z0 + (p.z1 - p.z0) * ((k + 0.5) / np)
        for (const sx of [-1, 1]) {
          dummy.position.set(p.x + sx * p.w * 0.45, deckY, zz)
          dummy.rotation.set(0, 0, 0)
          dummy.scale.set(1, deckY + 0.06, 1)
          dummy.updateMatrix()
          piles.setMatrixAt(pi++, dummy.matrix)
        }
      }
    }
    piers.instanceMatrix.needsUpdate = true
    for (let i = pi; i < MAX_PIER * 6; i++) piles.setMatrixAt(i, zero)
    piles.instanceMatrix.needsUpdate = true

    /* ---- 防波堤：从内端向外端拉一根"臂" ---- */
    for (let i = 0; i < 2; i++) {
      const b = pl.breakwaters[i]
      if (!b) { bws.setMatrixAt(i, zero); continue }
      const dx = b.x1 - b.x0
      const dz = b.z1 - b.z0
      const len = Math.hypot(dx, dz)
      dummy.position.set((b.x0 + b.x1) * 0.5, 0, (b.z0 + b.z1) * 0.5)
      /*
       * 旋转：BoxGeometry 的长边是 z（因为 scale.z = len），要让它的 +z 指向
       * (dx, dz)。绕 Y 的角 = atan2(dx, dz) —— **不是 atan2(dz, dx)**，
       * 那个是相对 +x 量的，会把臂转 90°（第一版就是横着浮在水面上）。
       */
      dummy.rotation.set(0, Math.atan2(dx, dz), 0)
      dummy.scale.set(b.h * 0.9, b.h, len)
      dummy.updateMatrix()
      bws.setMatrixAt(i, dummy.matrix)
    }
    bws.instanceMatrix.needsUpdate = true

    /* ---- 停泊商船 ---- */
    const nM = Math.min(MAX_MOOR, pl.moorings.length)
    let mi = 0
    let si = 0
    for (let i = 0; i < MAX_MOOR; i++) {
      const m = i < nM ? pl.moorings[i] : null
      if (!m) { hulls.setMatrixAt(i, zero); rails.setMatrixAt(i, zero); sterns.setMatrixAt(i, zero); continue }
      /*
       * 船壳：长 = len、高 = len·0.11（约 2 米/18 米船长的干舷）、宽 = len·0.26。
       * 这三个比例是照着一艘 30 米卡拉维尔给的：长宽比 3.8、干舷 8%。
       */
      const hullH = Math.max(0.18, m.len * 0.22)
      /*
       * 抬到 y=0.2：海面在船位处有 ±0.3 的浪（`deckWaves` 的 amp 是全局的，
       * 港口内并不平静），船体只有 0.2~0.3 高 —— 放在 y=0 时整条船都在浪面以下，
       * 画面上只剩桅杆（实测截图）。抬到 0.2 之后干舷露出来，也不会看着像浮在浪尖。
       */
      dummy.position.set(m.x, 0.2, m.z)
      dummy.rotation.set(0, m.yaw, 0)
      dummy.scale.set(m.len, hullH, m.len * 0.92)
      dummy.updateMatrix()
      hulls.setMatrixAt(i, dummy.matrix)

      dummy.position.set(m.x, 0.2 + hullH * 0.78, m.z)
      dummy.rotation.set(0, m.yaw, 0)
      dummy.scale.set(m.len * 1.03, Math.max(0.03, m.len * 0.03), m.len * 0.95)
      dummy.updateMatrix()
      rails.setMatrixAt(i, dummy.matrix)

      // 艉楼：船尾 22% 处，高一点、窄一点
      dummy.position.set(
        m.x - Math.sin(m.yaw + Math.PI / 2) * m.len * 0.33,
        0.2,
        m.z - Math.cos(m.yaw + Math.PI / 2) * m.len * 0.33,
      )
      dummy.rotation.set(0, m.yaw, 0)
      dummy.scale.set(m.len * 0.3, hullH * 1.9, m.len * 0.62)
      dummy.updateMatrix()
      sterns.setMatrixAt(i, dummy.matrix)

      // 两根桅（前后）：高 ≈ 船长（真实卡拉维尔：长 25 米、主桅 24 米）
      for (let k = 0; k < 2; k++) {
        const fwd = (k === 0 ? -1 : 1) * m.len * 0.24
        const mx = m.x + Math.sin(m.yaw + Math.PI / 2) * fwd
        const mz = m.z + Math.cos(m.yaw + Math.PI / 2) * fwd
        dummy.position.set(mx, 0.2, mz)
        dummy.rotation.set(0, m.yaw, 0)
        /*
         * 桅高 ≈ 船长（真实卡拉维尔：长 25 米、主桅 24 米）。第一版乘 0.22
         * 做出 5 米高的桅杆 —— 一排小棍子，配着 100 米长的船壳（两者的
         * 系数各错一处，抵消在画面上就是"横条浮在水上"）。
         */
        dummy.scale.set(1, m.len * (k === 0 ? 0.84 : 1.0), 1)
        dummy.updateMatrix()
        masts.setMatrixAt(mi++, dummy.matrix)

        if (si < MAX_MOOR * 2) {
          // 收起的横桁帆：一条窄横条，挂在桅高 62% 处，宽 = 桅高的 0.9
          const sailY = 0.2 + m.len * (k === 0 ? 0.84 : 1.0) * 0.55
          dummy.position.set(mx, sailY, mz)
          dummy.rotation.set(0, m.yaw, 0)
          /* 收起的帆是一**卷**布，不是一个面：厚度给到 0.09·len（≈2 米），
         否则在 250 米外是一条 1 像素的线，与桅杆混在一起 */
      dummy.scale.set(m.len * (k === 0 ? 0.5 : 0.58), Math.max(0.07, m.len * 0.1), Math.max(0.05, m.len * 0.12))
          dummy.updateMatrix()
          sails.setMatrixAt(si++, dummy.matrix)
        }
      }
    }
    hulls.instanceMatrix.needsUpdate = true
    rails.instanceMatrix.needsUpdate = true
    sterns.instanceMatrix.needsUpdate = true
    for (let i = mi; i < MAX_MOOR * 2; i++) masts.setMatrixAt(i, zero)
    for (let i = si; i < MAX_MOOR * 2; i++) sails.setMatrixAt(i, zero)
    masts.instanceMatrix.needsUpdate = true
    sails.instanceMatrix.needsUpdate = true

    /* ---- 棕榈 ---- */
    const nPal = Math.min(MAX_PALM, pl.palms.length)
    let fi = 0
    for (let i = 0; i < MAX_PALM; i++) {
      const t = i < nPal ? pl.palms[i] : null
      if (!t) { palms.setMatrixAt(i, zero); continue }
      dummy.position.set(t.x, deckY, t.z)
      dummy.rotation.set(0, hash01(i * 3.1) * 6.28, 0)
      dummy.scale.set(1, t.h, 1)
      dummy.updateMatrix()
      palms.setMatrixAt(i, dummy.matrix)
      /*
       * 五片叶，向外**下垂**（绕水平轴转 60°）。三片锥体那版从远处看是一个
       * "绿色小蘑菇"（实测截图）—— 叶子太少、太短、还朝上。五片够围一圈，
       * 下垂 60° 才有棕榈的伞形。
       */
      for (let k = 0; k < 5 && fi < MAX_PALM * 5; k++) {
        const a = (k / 5) * Math.PI * 2 + hash01(i * 7.7) * 2
        dummy.position.set(t.x + Math.cos(a) * 0.2, deckY + t.h, t.z + Math.sin(a) * 0.2)
        dummy.rotation.set(Math.cos(a) * 1.05, -a, -Math.sin(a) * 1.05)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        fronds.setMatrixAt(fi++, dummy.matrix)
      }
    }
    palms.instanceMatrix.needsUpdate = true
    for (let i = fi; i < MAX_PALM * 5; i++) fronds.setMatrixAt(i, zero)
    fronds.instanceMatrix.needsUpdate = true

    /* ---- 尖顶 / 吊臂 / 旗 ---- */
    // 艉楼的基准跟着船体一起抬
    if (pl.spire) {
      // 塔身占 2/3，锥占 1/3；塔身宽 = 高的 40%（钟楼的正常比例）
      const H = pl.spire.h
      const bodyH = H * 0.66
      const bodyW = bodyH * 0.42
      spireTower.visible = true
      spireTower.position.set(pl.spire.x, deckY, pl.spire.z)
      spireTower.scale.set(bodyW, bodyH, bodyW)
      spire.visible = true
      spire.position.set(pl.spire.x, deckY + bodyH, pl.spire.z)
      spire.scale.set(bodyW * 1.24, H * 0.34, bodyW * 1.24)
    } else {
      spire.visible = false
      spireTower.visible = false
    }

    for (let i = 0; i < MAX_CRANE; i++) {
      const c = pl.cranes[i]
      if (!c) { cranes.setMatrixAt(i, zero); continue }
      dummy.position.set(c.x, deckY + 0.62, c.z)
      dummy.rotation.set(0, i === 0 ? 0.5 : -0.6, i === 0 ? -0.34 : -0.42)
      dummy.scale.set(c.arm, 1, 1)
      dummy.updateMatrix()
      cranes.setMatrixAt(i, dummy.matrix)
    }
    cranes.instanceMatrix.needsUpdate = true

    flagPole.position.set(pl.flag.x, deckY, pl.flag.z)
    flagPole.scale.set(1, pl.flag.h, 1)
    flagCloth.position.set(pl.flag.x + 0.14, deckY + pl.flag.h - 0.1, pl.flag.z)

    plan = pl
  }

  /** 换样式时把材质色与帆型换掉 */
  function applyStyle(st: HarborStyle) {
    style = st
    ;(wallMat).color.setHex(st.wall)
    ;(roofMat).color.setHex(st.roof)
    ;(stoneMat).color.setHex(st.stone)
    ;(pierMat).color.setHex(st.timber)
    ;(deckMat).color.setHex(st.quay)
    ;(flagMat).color.setHex(st.banner)
    ;(spireMat).color.setHex(st.wall)
    bases.set(wallMat, new THREE.Color(st.wall))
    bases.set(roofMat, new THREE.Color(st.roof))
    bases.set(stoneMat, new THREE.Color(st.stone))
    bases.set(pierMat, new THREE.Color(st.timber))
    bases.set(deckMat, new THREE.Color(st.quay))
    bases.set(flagMat, new THREE.Color(st.banner))
    bases.set(spireMat, new THREE.Color(st.wall))
    winMat.color.setRGB(st.lamp[0], st.lamp[1], st.lamp[2])
    /*
     * 硬帆（中式/南洋）比软帆短而宽：把帆的横条压扁一点，
     * 一排桅杆的剪影立刻换成"另一种船"。
     */
    sailMat.color.setHex(st.sail === 'junk' ? 0xa8926a : 0xbdb3a0)
    bases.set(sailMat, (sailMat).color.clone())
  }

  let lastStyleId = ''
  let curPresence = 0
  /*
   * 【必须记"上一次是哪个港"】布局的重建条件原来只有 `presence 变了`，
   * 而停泊时 presence 恒为 1 —— 于是从塞维利亚开到广州，样式（墙色/屋顶）换了，
   * **房子数、棕榈、钟楼却还是塞维利亚的**：广州长出了教堂尖顶、没有棕榈。
   * e2e 的"四个港都是 8 栋房"抓到的就是这个（实测）。
   */
  let lastPortId = -1
  /* 最近一帧的昼夜系数（取证用：`__deckHarbor().night`） */
  let lastNight = -1
  let lastLitK = -1

  return {
    group,
    setSighting(s, isSailing) {
      if (!s || !harborVisible(s.distNm, isSailing)) {
        group.visible = false
        plan = null
        return
      }
      /*
       * 岸在正后方时，`coastModel` 不画。这里**只在航行时**跟随这条规则：
       * 停泊时船就靠在码头边，不画港会让画面变成一片空海（见 harborVisible）。
       */
      if (isSailing && Math.abs(wrapDeg(s.relBearingDeg)) > COAST_HIDE_BEHIND_DEG) {
        group.visible = false
        plan = null
        return
      }
      group.visible = true
      const st = harborStyleFor(s.port.region)
      if (st.id !== lastStyleId) {
        applyStyle(st)
        lastStyleId = st.id
      }
      /*
       * 停泊时 presence 恒 1（`DeckView` 已经这么给了），航向也固定，所以
       * 布局是稳定的：不会出现"站在甲板上一会儿房子大一会儿房子小"。
       */
      const presence = s.presence
      /*
       * 港口用自己的景别（`harborRadius`：贴岸 18，比通用海岸的 24 近一档）——
       * HUD 说"0.0 海里"时画面就不该还隔着一大片水。
       * 宽度仍按 2×半径给（岸线要铺满视野），否则靠近时两侧会露出空档。
       */
      const radius = harborRadius(presence)
      const { x, z } = coastScenePos(s.relBearingDeg, radius)
      group.position.set(x, 0, z)
      group.rotation.y = 0
      if (Math.abs(presence - curPresence) > 0.001 || plan === null || s.port.id !== lastPortId) {
        apply(harborPlan(st, radius * 2, presence, s.port.id))
        curPresence = presence
        lastPortId = s.port.id
      }
    },
    update(t, night, fogK, fogColor) {
      if (!group.visible) return
      /*
       * 实体建筑在夜里的处理与海岸**不同**：海岸是剪影（跟地平线色走），
       * 港口是"有墙有窗的城"—— 夜里墙要真的暗下去（0.18），窗光才亮得出来。
       * 白天则接近本色。`t` 目前只用来给旗与窗光一点点呼吸。
       */
      const litK = 0.18 + 0.82 * (1 - night)
      lastNight = night
      lastLitK = litK
      /*
       * 【顺序很重要：先混雾色、**再**乘昼夜系数】
       * 第一版是 `乘 litK → 混雾色`：黄昏时 `uFogColor` 还是一片暖亮的天光，
       * 混进去等于把墙提亮回来 —— 实测夜里（night 0.44、litK 0.638）墙面
       * 只有 #b1a895（比白天暗 18%），一城房子在夜里还是米白的。
       * 雾是"混入天光"，而天光本身在夜里是暗的；`uFogColor` 没跟上日相时，
       * litK 兜住这一层。顺序换过来之后，夜里的墙才真的暗下去。
       */
      for (const [mat, base] of bases) {
        const m = mat as THREE.MeshBasicMaterial
        m.color.copy(base)
        if (fogK > 0) m.color.lerp(fogColor, Math.min(0.9, fogK * 0.85))
        m.color.multiplyScalar(litK)
        m.opacity = 1
        m.transparent = false
      }
      // 码头上的人在动（很小的起伏，幅度 7% 身高）
      if (folkList.length) writeFolk(t)
      /*
       * 水边的灯：夜里亮，被雾削，随距离淡（用 size 表达"远灯更小"）。
       * 与窗光分开控制：灯比窗光更亮一档，且不随 `night` 线性（黄昏就该点上）。
       */
      lampMat.opacity = Math.min(1, (0.25 + 0.75 * night)) * (1 - Math.min(1, fogK) * 0.85)
      lampMat.size = (0.42 + 0.16 * night) * (1 + curPresence * 0.5)
      // 窗光：只在夜里、且被雾削
      winMat.opacity = Math.max(0, Math.min(1, night)) * (1 - Math.min(1, fogK) * 0.9)
      const breath = 0.9 + 0.1 * Math.sin(t * 0.7)
      winMat.size = (0.34 + 0.1 * breath) * (1 + curPresence * 0.6)
    },
    debug() {
      return {
        style: style.id,
        night: lastNight,
        litK: lastLitK,
        houses: plan?.houses.length ?? 0,
        piers: plan?.piers.length ?? 0,
        moorings: plan?.moorings.length ?? 0,
        plan,
      }
    },
    dispose() {
      glowTex.dispose()
      group.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = (m as THREE.Mesh).material
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else if (mat) (mat as THREE.Material).dispose()
      })
    },
  }
}
