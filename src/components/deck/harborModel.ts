import * as THREE from 'three'
import {
  COAST_HIDE_BEHIND_DEG, coastScenePos, hash01, wrapDeg,
  type CoastSighting,
} from './deckCoast'
import {
  harborPlan, harborRadius, harborStyleFor, harborVisible, lampReflectionLen,
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
/** 防波堤每臂的石块数（一块整板读不出"抛石堤"，见 apply 里的说明） */
const BW_PER_ARM = 10
const MAX_BW = BW_PER_ARM * 2 + 2

/**
 * 假光照的入射方向（世界坐标）。
 *
 * 【为什么港口不用真光照】这一层的几何是**几十个 InstancedMesh + 纯色 Basic
 * 材质**：换成 Standard/Lambert 要一盏灯、一套法线、还会拖着色器变体与批次。
 * 而它要表达的只有一件事 —— **同一个面上朝向不同的面亮度不同**。
 *
 * 方向取 (0.35, 0.75, 0.55)：太阳在**左上方偏海**（屏幕左 = 世界 +x，见
 * `deckCoast` 的方位约定），所以朝 +x 的墙面亮、朝 −x 的暗、屋顶最亮。
 */
const HARBOR_LIGHT = new THREE.Vector3(0.35, 0.75, 0.55).normalize()

/**
 * 给几何烘一层"面朝向"的明暗，写进顶点色。
 *
 * 【为什么在几何上烘、而不是逐帧算】港口是静止的背景：房子、码头、栈桥都不会动，
 * 光照方向也不会变（这一层的太阳是固定的）。所以**烘一次**，运行时零成本，
 * 而且 InstancedMesh 的所有实例共用同一份顶点色 —— 加 8 栋房子不增加任何计算。
 *
 * 【为什么必须烘，不是"可选的美化"】这一层的材质全是 `MeshBasicMaterial` +
 * 一个纯色：一栋房子就是一个**矩形色块**，屋顶就是一个红色梯形。玩家读到的是
 * "纸片"，无论模型多准（这是用户「看着还是非常粗糙」的直接来源）。
 * 加一层明暗之后，同一个几何立刻有体积：正面亮、侧面暗、屋顶最亮。
 *
 * `contrast` 是明暗幅度：0 = 全平（回到改之前），0.42 = 实测下来"有体积但不脏"。
 */
export function shadeFaces<T extends THREE.BufferGeometry>(geo: T, contrast = 0.42): T {
  if (!geo.getAttribute('normal')) geo.computeVertexNormals()
  const n = geo.getAttribute('normal')
  const count = n.count
  const arr = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // n·L：朝光的面接近 1、背光的面接近 −1
    const d = n.getX(i) * HARBOR_LIGHT.x + n.getY(i) * HARBOR_LIGHT.y + n.getZ(i) * HARBOR_LIGHT.z
    const k = Math.max(0.3, Math.min(1.16, 0.74 + contrast * d))
    arr[i * 3] = k
    arr[i * 3 + 1] = k
    arr[i * 3 + 2] = k
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geo
}
const MAX_FOLK = 14
const MAX_LAMP = 10
const MAX_LINE = 4
/** 城内第三排（远屋顶）的上限 */
const MAX_FAR = 16
/**
 * 远排的"空气透视"色：乘以实例色时把它往冷灰蓝推一点。
 *
 * 【为什么是乘、不是直接换成雾色】这一层的实例色是**乘性**的（材质基色 × instanceColor），
 * 无法把对比度换成雾色；能做的只有"整体偏冷一点"。真实 27 单位外的屋顶比近处
 * 的墙更接近天空色，这条乘法就是这句话的近似 —— 亮度基本不动，蓝分量抬 4%。
 */
const FAR_HAZE = new THREE.Color(0.86, 0.90, 0.97)

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

/**
 * 倒影用的竖向渐变：靠灯那端亮、靠相机那端散开变淡。
 * `v` 方向（平面躺平后是 z）从 0（近相机）到 1（灯的投影点）。
 */
function makeReflectTexture(): THREE.Texture {
  const W = 16
  const H = 96
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const grad = g.createLinearGradient(0, H, 0, 0)
  grad.addColorStop(0, 'rgba(255,226,170,0)')
  grad.addColorStop(0.35, 'rgba(255,214,150,0.35)')
  grad.addColorStop(0.8, 'rgba(255,226,170,0.85)')
  grad.addColorStop(1, 'rgba(255,240,200,1)')
  g.fillStyle = grad
  g.fillRect(0, 0, W, H)
  /* 横向再柔一下边缘（倒影的边缘不该是硬直边） */
  const side = g.createLinearGradient(0, 0, W, 0)
  side.addColorStop(0, 'rgba(0,0,0,1)')
  side.addColorStop(0.5, 'rgba(0,0,0,0)')
  side.addColorStop(1, 'rgba(0,0,0,1)')
  g.globalCompositeOperation = 'destination-out'
  g.fillStyle = side
  g.fillRect(0, 0, W, H)
  return texFrom(c)
}

export function createDeckHarbor(): DeckHarbor {
  const group = new THREE.Group()
  group.name = 'deck-harbor'
  group.visible = false

  const glowTex = makeGlow()

  /* ---- 材质：全部 MeshBasicMaterial（远程背景，用不着光照；夜里靠 night 插值） ---- */
  /*
   * 所有实体材质都开 `vertexColors`：几何上烘的那层明暗靠它乘进 `color`。
   * 【顺序】three 的 Basic 材质最终色 = material.color × vertexColor × map，
   * 所以夜里按 night 改 `material.color` 的插值仍然有效（两者相乘，不会打架）。
   */
  const mk = (color: number, extra: Partial<THREE.MeshBasicMaterialParameters> = {}) =>
    new THREE.MeshBasicMaterial({ color, vertexColors: true, ...extra })
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
  /* 墙基：房子脚下的石砌勒脚（比墙暗一档，给"房子站在地上"一个接触） */
  const plinthMat = mk(0x9a9081)
  /* 窗洞：比墙暗两档的凹口（白天唯一的立面细节） */
  const paneMat = mk(0x2b2a26)
  /* 烟囱：比屋顶暗一点的砖色 —— 用墙色会与白墙糊在一起 */
  const chimneyMat = mk(0x6b4a3a)
  /*
   * 船壳 0x6a5138 → 0x7a4a30（偏红棕）。
   * 【为什么】原来的浅棕与栈桥的木色（timber 0x4a3a28 提亮后）太接近，
   * 停泊船与栈桥在屏幕上连成一块"木架子"（放大截图里船甲板像栈桥的延伸）。
   * 真实商船的船壳是涂了赭石/沥青的深红棕，与栈桥的灰褐能分开。
   */
  const hullMat = mk(0x7a4a30, { side: THREE.DoubleSide })
  const railMat = mk(0x9c7c56, { side: THREE.DoubleSide })
  const palmMat = mk(0x2f4026)
  const flagMat = mk(0xb03a2e, { side: THREE.DoubleSide })
  const spireMat = mk(0x8e8578)
  /*
   * 尖顶单独一个色（石板灰）。
   * 【为什么】塔身与锥同色同亮度时，两者在屏幕上连成一个**又高又细的白锥**
   * —— 实测那张全景里钟楼读作"一片帆"而不是塔。真实钟楼是石砌塔身 +
   * 深色石板尖顶，两者一深一浅就分开了。
   */
  const spireCapMat = mk(0x596069)
  /** 每个材质在 setSighting 里记下"白天的本色"，update 按 night 插值 */
  const bases = new Map<THREE.Material, THREE.Color>()
  for (const m of [deckMat, wallMat, roofMat, stoneMat, pierMat, mastMat, sailMat, palmMat, flagMat, spireMat, spireCapMat, hullMat, railMat, paneMat, chimneyMat, plinthMat]) {
    bases.set(m, (m as THREE.MeshBasicMaterial).color.clone())
  }

  /* ---- 码头面：一块横板，贴在水线上 ---- */
  const deck = new THREE.Mesh(shadeFaces(new THREE.BoxGeometry(1, 1, 1)), deckMat)
  deck.name = 'deck-harbor-quay'
  group.add(deck)

  /*
   * 岸壁：码头朝向水的那一面，**竖直**的石砌立面（从水面 −0.14 到码头面）。
   *
   * 【为什么这条必须有】相机在船尾、只比水面高 2 米多，看 18 单位外的码头是
   * **掠射角**：水平面在屏幕上是压扁的几条像素，于是"房子底部直接接水面"。
   * 一道竖直的岸壁能把"岸"这个厚度立在屏幕上（0.3 单位 ≈ 8~10 像素）。
   * 真实码头本来就是一堵石墙，不是一道缓坡。
   */
  const quayFace = new THREE.Mesh(shadeFaces(new THREE.BoxGeometry(1, 1, 1)), stoneMat)
  quayFace.name = 'deck-harbor-quayface'
  group.add(quayFace)

  /*
   * 码头外沿的压条：一条比码头面亮一档的窄带。
   * 【为什么需要】码头面（尤其加勒比的木色）与水面的明度接近时，两者读成一片
   * —— 实测广州与哈瓦那的截图上，房子像直接站在泥滩上，看不出"这是一道人工的岸"。
   * 一条几十厘米高的亮边就够把两者缝开，而且它正是石砌码头的压顶石。
   */
  const quayEdge = new THREE.Mesh(shadeFaces(new THREE.BoxGeometry(1, 1, 1)), railMat)
  quayEdge.name = 'deck-harbor-quay-edge'
  group.add(quayEdge)

  /*
   * 码头前沿的系缆矮墙：一道横贯全宽的低石墙，高约 0.2 单位（≈3.6 米偏高，
   * 按 1 单位≈18 米算是 3.5 米 —— 与真实码头边的护墙同量级）。
   * 【为什么要它】房子之间必然有缝（宽度随机），缝里直接露出背后的草地与松树，
   * 一排房子就读作"一排独立盒子摆在草地上"。一道连续的低墙把缝的下半截封住，
   * 视线才落在"岸 → 墙 → 房"这三层上，而不是穿到城后面去。
   */
  const quayWall = new THREE.Mesh(shadeFaces(new THREE.BoxGeometry(1, 1, 1)), stoneMat)
  quayWall.name = 'deck-harbor-quaywall'
  group.add(quayWall)

  /* ---- 房屋墙（实例化） ---- */
  const wallGeo = shadeFaces(new THREE.BoxGeometry(1, 1, 1))
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
    /*
     * 屋顶：**带瓦垄的两坡顶**。
     *
     * 【为什么要瓦垄】上一版是一整片纯红的斜面（顶点色只有"前坡/后坡"两档）。
     * 在 20 单位外，一片 2 单位宽的红斜面在屏幕上就是一块 60×20 像素的**纯色**——
     * 这是"房子像积木"最直接的原因。地中海的筒瓦屋面是**沿坡度方向一条条垄**：
     * 凸起的瓦脊受光、凹槽里是影，8 条垄就足够让一块红面变成"屋面"。
     *
     * 【为什么不再用 shadeFaces】那条路会把整片斜面算成同一个亮度（法线相同）。
     * 这里手写：沿屋脊 8 段 × 两坡，逐顶点给"垄的明暗 × 距屋脊的衰减"。
     */
    const SEG = 10
    const pos: number[] = []
    const col: number[] = []
    const push = (x: number, y: number, z: number, k: number) => {
      pos.push(x, y, z)
      col.push(k, k, k)
    }
    // 距屋脊越远越暗（檐口积灰、被墙挡住的天光）
    const RIDGE_K = 1.02
    const EAVE_K = 0.84
    for (let i = 0; i < SEG; i++) {
      const x0 = -0.5 + i / SEG
      const x1 = -0.5 + (i + 1) / SEG
      /*
       * 凸起的瓦垄亮、两垄之间的凹槽暗。
       *
       * 【8 段 → 10 段，对比 0.87 → 0.89/0.95】8 段时一条垄 = 房宽/8 ≈ 3 米，
       * 放大截图里是一排**木板条**（对比 13% 又太重，读成"贴了木饰面"）。
       * 10 段（屏幕上一段 6~14px）+ 三档节奏（每 3 条一道深缝）才像瓦：
       * 规律到"一明一暗"会被眼睛当成条纹图案，节奏一乱就变成材质。
       */
      const tile = i % 3 === 0 ? 1.0 : i % 2 === 0 ? 0.95 : 0.89
      // 前坡（+z，朝海）：朝光
      push(x0, 0, 0.5, EAVE_K * tile)
      push(x1, 0, 0.5, EAVE_K * tile)
      push(x1, 1, 0, RIDGE_K * tile)
      push(x0, 0, 0.5, EAVE_K * tile)
      push(x1, 1, 0, RIDGE_K * tile)
      push(x0, 1, 0, RIDGE_K * tile)
      // 后坡（−z，背光）：整体压到 0.72
      push(x0, 0, -0.5, EAVE_K * tile * 0.72)
      push(x0, 1, 0, RIDGE_K * tile * 0.72)
      push(x1, 1, 0, RIDGE_K * tile * 0.72)
      push(x0, 0, -0.5, EAVE_K * tile * 0.72)
      push(x1, 1, 0, RIDGE_K * tile * 0.72)
      push(x1, 0, -0.5, EAVE_K * tile * 0.72)
    }
    // 两端山墙：三角形，亮度居中（不参与瓦垄）
    const GABLE = 0.9
    push(-0.5, 0, -0.5, GABLE); push(-0.5, 0, 0.5, GABLE); push(-0.5, 1, 0, GABLE)
    push(0.5, 0, 0.5, GABLE); push(0.5, 0, -0.5, GABLE); push(0.5, 1, 0, GABLE)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.computeVertexNormals()
    return g
  })()
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, MAX_HOUSE)
  roofs.name = 'deck-harbor-roofs'
  roofs.frustumCulled = false
  group.add(roofs)

  /*
   * 城内第三排（远屋顶）：只复用墙与屋顶的几何 + 材质。
   *
   * 【为什么共用材质而不复制】逐栋色差走的是 `instanceColor`，而它是 **mesh**
   * 的属性（three 按 object 选 program 参数），同一个 material 可以同时服务两个
   * InstancedMesh。复制一份材质就得在 `applyStyle` 的夜间基色同步里再记一份
   * —— 那正是"黄昏重算后跳回欧洲默认色"踩过的坑。
   */
  const farWalls = new THREE.InstancedMesh(wallGeo, wallMat, MAX_FAR)
  farWalls.name = 'deck-harbor-far-walls'
  farWalls.frustumCulled = false
  group.add(farWalls)
  const farRoofs = new THREE.InstancedMesh(roofGeo, roofMat, MAX_FAR)
  farRoofs.name = 'deck-harbor-far-roofs'
  farRoofs.frustumCulled = false
  group.add(farRoofs)

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
  const pierGeo = shadeFaces(new THREE.BoxGeometry(1, 1, 1))
  const piers = new THREE.InstancedMesh(pierGeo, pierMat, MAX_PIER)
  piers.name = 'deck-harbor-piers'
  piers.frustumCulled = false
  group.add(piers)
  const pileGeo = /*
   * 木桩半径 0.08（≈1.4 米直径）：真实栈桥桩只有 30~40 厘米，但 18 单位外
   * 那不到一个像素 —— 屏幕上栈桥变成"一排悬空的木板"。与人物、缆绳同一个取舍。
   */
  shadeFaces(new THREE.CylinderGeometry(0.08, 0.08, 1, 5))
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
  const bwGeo = shadeFaces(new THREE.CylinderGeometry(0.34, 0.5, 1, 4))
  bwGeo.rotateY(Math.PI / 4)
  bwGeo.translate(0, 0.5, 0)
  const bws = new THREE.InstancedMesh(bwGeo, stoneMat, MAX_BW)
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
    /** 每个顶点的"板缝"系数（1 = 板面，0.88 = 板缝）—— 顶点色在 shadeFaces 之后再乘 */
    const marks: number[] = []
    const push = (x: number, y: number, z: number, k = 1) => { pos.push(x, y, z); marks.push(k) }
    const N = RING.length
    /*
     * 舷弧（sheer）：甲板线在**船首与船尾抬高**，中段最低。
     *
     * 【为什么这是"船"最关键的一根线】挤出几何的顶边是水平的，从侧面看
     * 船体就是一个**矩形**（40 米长的船在屏幕上 130×35px，上下两条平行的直线）——
     * 放大截图里那条大船读作"一块红棕色的板"，加多少桅杆都救不回来。
     * 真实帆船的舷弧很夸张（两端比中部高 15~25% 干舷），侧视是一条"微笑"的
     * 曲线；这一条曲线一出现，同一个矩形立刻变成船。
     */
    const sheerAt = (x: number) => 0.26 * Math.pow(Math.min(1, Math.abs(x) / 0.5), 2.4)
    /*
     * 侧面沿高度分 3 带：真实的船壳是**一条条横板**钉起来的，板缝在侧视里
     * 是 3~4 条水平暗线。一块纯色的红棕梯形不管轮廓多准，读作"木箱"
     * （放大截图里 40 米长的大船就是一块板）。分带之后顶点色才能带出板缝；
     * 不分带时侧面只有上下两圈顶点，任何线性插值都是"一片渐变"。
     */
    const BANDS = 3
    for (let i = 0; i < N; i++) {
      const [x0, z0] = RING[i]
      const [x1, z1] = RING[(i + 1) % N]
      for (let b = 0; b < BANDS; b++) {
        const t0 = b / BANDS
        const t1 = (b + 1) / BANDS
        const y0a = (1 + sheerAt(x0)) * t0
        const y1a = (1 + sheerAt(x1)) * t0
        const y0b = (1 + sheerAt(x0)) * t1
        const y1b = (1 + sheerAt(x1)) * t1
        // 每条带的**下沿**压暗 12%，上沿保持 —— 得到 3 条水平板缝
        const kBottom = b === 0 ? 0.86 : 0.9
        push(x0, y0a, z0, kBottom); push(x1, y1a, z1, kBottom); push(x1, y1b, z1, 1)
        push(x0, y0a, z0, kBottom); push(x1, y1b, z1, 1); push(x0, y0b, z0, 1)
      }
    }
    // 顶面（扇形，中心 + 每段）
    for (let i = 0; i < N; i++) {
      const [x0, z0] = RING[i]
      const [x1, z1] = RING[(i + 1) % N]
      push(0, 1, 0); push(x0, 1 + sheerAt(x0), z0); push(x1, 1 + sheerAt(x1), z1)
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
    /* 船体同样要明暗：舷侧朝光的一边亮、背光的一边暗，船才有"圆"的感觉 */
    const shaded = shadeFaces(g, 0.34)
    /* 再乘板缝系数（shadeFaces 会覆盖 color，所以必须在它之后改） */
    const cAttr = shaded.getAttribute('color')
    for (let i = 0; i < marks.length && i < cAttr.count; i++) {
      const k = marks[i]
      if (k === 1) continue
      cAttr.setXYZ(i, cAttr.getX(i) * k, cAttr.getY(i) * k, cAttr.getZ(i) * k)
    }
    cAttr.needsUpdate = true
    return shaded
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
  const sternGeo = shadeFaces(new THREE.BoxGeometry(1, 1, 1))
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
  const mastGeoShip = shadeFaces(new THREE.CylinderGeometry(0.055, 0.07, 1, 6))
  mastGeoShip.translate(0, 0.5, 0)
  const masts = new THREE.InstancedMesh(mastGeoShip, mastMat, MAX_MOOR * 3)
  masts.name = 'deck-harbor-masts'
  masts.frustumCulled = false
  group.add(masts)
  /*
   * 帆：**收起来**的横桁帆 —— 一块窄长的横条挂在桅杆上。
   * 停泊的船张着满帆是错的（真实是收帆系在桁上），而且一排满帆会把港口
   * 糊成一面白墙。横条的剪影也正好是"一排桅杆"的识别特征。
   */
  /*
   * 几何必须是 1×1×1（原来是 1×1×**0.02**）。
   * 【为什么这条是隐形 bug】0.02 是"一张薄片"的厚度，但收起的帆要用 z 当**长度**
   * （横桁横跨船宽）；几何自己只有 0.02 时，scale.z = 1.6 算出来是 0.032 单位 ——
   * 屏幕上 2px，四条船的帆桁全都"消失"，只剩几根光桅杆（截图里像电线杆）。
   */
  const sailGeo = shadeFaces(new THREE.BoxGeometry(1, 1, 1))
  const sails = new THREE.InstancedMesh(sailGeo, sailMat, MAX_MOOR * 4)
  sails.name = 'deck-harbor-sails'
  sails.frustumCulled = false
  group.add(sails)
  /*
   * 帆桁本体（深色木杆）：帆卷是挂在桁上的**一卷布**，没有这根杆时屏幕上只有
   * 一条浅米色的横条悬在桅杆上 —— 读作"晾衣杆"（截图实测）。真实桁是圆的木杆，
   * 比帆卷细、比它深，从正面看是"深色横杆 + 浅色布卷"两层。
   */
  const yardBars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mastMat, MAX_MOOR * 4)
  yardBars.name = 'deck-harbor-yardbars'
  yardBars.frustumCulled = false
  group.add(yardBars)

  /* ---- 棕榈 / 尖顶 / 吊臂 / 旗 ---- */
  const palmGeo = shadeFaces(new THREE.CylinderGeometry(0.045, 0.07, 1, 5))
  palmGeo.translate(0, 0.5, 0)
  const palms = new THREE.InstancedMesh(palmGeo, palmMat, MAX_PALM)
  palms.name = 'deck-harbor-palms'
  palms.frustumCulled = false
  group.add(palms)
  const frondGeo = shadeFaces(new THREE.ConeGeometry(0.16, 0.62, 4))
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
  const paneGeo = shadeFaces(new THREE.BoxGeometry(1, 1, 1))
  /*
   * 檐下阴影带：贴在墙顶、比墙宽一点、比墙暗一档的一条薄板。
   *
   * 【为什么这条比"再加细节"有效】屋顶挑出 14% 之后，檐口在墙顶投下一条暗带 ——
   * 这是真实建筑在日光下最稳定的一条明暗分界。少了它，屋顶与墙是"两块色板
   * 上下贴着"，房子仍然像贴图；有了它，两者之间才有"屋顶压在墙上"的关系。
   */
  const eaves = new THREE.InstancedMesh(shadeFaces(new THREE.BoxGeometry(1, 1, 1)), plinthMat, MAX_HOUSE)
  eaves.name = 'deck-harbor-eaves'
  eaves.frustumCulled = false
  group.add(eaves)

  /* 墙基（勒脚）：每栋一条，比墙略宽一点 */
  const plinths = new THREE.InstancedMesh(shadeFaces(new THREE.BoxGeometry(1, 1, 1)), plinthMat, MAX_HOUSE)
  plinths.name = 'deck-harbor-plinths'
  plinths.frustumCulled = false
  group.add(plinths)

  /*
   * 房屋投在码头面上的影子。
   *
   * 【为什么这是"粗糙"里最便宜的一块】这一层的所有东西都是**没有阴影的**：
   * 房子、栈桥、人都像"贴在"石面上，因为它们与地面之间没有明暗关系。
   * 而光照方向是固定的（`HARBOR_LIGHT` 从内陆上方来），于是房子的正面
   * （朝海那一面）本来就是背光的，影子正好落在码头上、正对相机 —— 一圈暗带
   * 就能把"一排纸片"变成"下午的码头"。
   *
   * 【为什么是矩形而不是投影形状】太阳仰角高（0.75 的 y 分量），影长 ≈ 房高；
   * 在这个景别（22~40 单位、房子 40px 高）上，矩形与真实投影的差别不到一个像素。
   */
  const shadowGeo = new THREE.PlaneGeometry(1, 1)
  shadowGeo.rotateX(-Math.PI / 2)
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x141a22,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    toneMapped: false,
  })
  const houseShadows = new THREE.InstancedMesh(shadowGeo, shadowMat, MAX_HOUSE)
  houseShadows.name = 'deck-harbor-house-shadows'
  houseShadows.frustumCulled = false
  group.add(houseShadows)

  /*
   * 窗框：比窗洞大一圈的浅色方块，垫在窗**后面**（z 更大一点）。
   *
   * 【为什么需要】窗洞是一块纯黑的方块，直接贴在白墙上读作"洞"（放大截图里
   * 一排三个黑方框，像被抠掉的三块）。真实窗户有石框/木框，一圈比窗洞亮的边
   * 就够把"洞"变成"窗"。框在墙与窗之间：窗凸出框一点，框只露出四边。
   */
  const windowFrames = new THREE.InstancedMesh(shadeFaces(new THREE.BoxGeometry(1, 1, 1)), plinthMat, MAX_HOUSE * 6)
  windowFrames.name = 'deck-harbor-windowframes'
  windowFrames.frustumCulled = false
  group.add(windowFrames)

  const panes = new THREE.InstancedMesh(paneGeo, paneMat, MAX_HOUSE * 6)
  panes.name = 'deck-harbor-panes'
  panes.frustumCulled = false
  group.add(panes)
  const chimneyGeo = shadeFaces(new THREE.BoxGeometry(1, 1, 1))
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

  const folkBodyGeo = shadeFaces(new THREE.BoxGeometry(1, 1, 1))
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
  const folkHeadGeo = shadeFaces(new THREE.SphereGeometry(0.5, 6, 4))
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
  const lampPostGeo = shadeFaces(new THREE.CylinderGeometry(0.016, 0.022, 1, 5))
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

  /*
   * ---- 灯在水面上的倒影 ----
   * 一块躺平的加法面片，从灯的水面投影点朝 −z（相机方向）拉长。
   * 【为什么不是真反射】真反射要一张反射 RT（多一遍全场景渲染），为了几盏灯
   * 不值。而"倒影"在小尺度上要表达的信息只有两件：**灯在水面上有像**、
   * **像朝相机方向被拉长**。一条带渐变的面片就够。
   */
  const reflectTex = makeReflectTexture()
  const reflectGeo = new THREE.PlaneGeometry(1, 1)
  reflectGeo.rotateX(-Math.PI / 2)
  const reflectMat = new THREE.MeshBasicMaterial({
    map: reflectTex,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
    fog: false,
    toneMapped: false,
  })
  const reflect = new THREE.InstancedMesh(reflectGeo, reflectMat, MAX_LAMP)
  reflect.name = 'deck-harbor-lampglow'
  reflect.frustumCulled = false
  reflect.renderOrder = 2
  group.add(reflect)

  /*
   * ---- 系泊缆绳 ----
   * 每条一根 `THREE.Line`（细线，便宜）。中段用二次贝塞尔下垂 ——
   * 真实缆绳不会绷成直线，下垂那一小段正是"它松着、被系住"的信号。
   * 【为什么用 Line 不用 Tube】缆绳在画面上本来就是 1~2 像素；Tube 要多几百个
   * 三角形去表达一个看不出来的粗细。
   */
  const lineMat = mk(0x6a6258)
  bases.set(lineMat, lineMat.color.clone())
  /*
   * 【为什么不是 Line】真实缆绳直径 5 厘米：在 18 单位（≈320 米）外是 **0.2 像素**，
   * `THREE.Line` 又永远只画 1 像素 —— 一根都看不见（实测截图里完全没有绳子）。
   * 改成一圈 4 段的极细 Tube（半径 0.028 单位 ≈ 半米粗，夸张了 10 倍）：
   * 屏幕上有 2~3 像素，读作"一根缆"。与人物（2.5 倍）、灯塔（20 倍）同一个取舍。
   */
  const lineMeshes: THREE.Mesh[] = []
  for (let i = 0; i < MAX_LINE; i++) {
    const ln = new THREE.Mesh(new THREE.BufferGeometry(), lineMat)
    ln.name = `deck-harbor-mooringline-${i}`
    ln.frustumCulled = false
    ln.visible = false
    group.add(ln)
    lineMeshes.push(ln)
  }

  const spireTower = new THREE.Mesh(shadeFaces(new THREE.BoxGeometry(1, 1, 1)), spireMat)
  spireTower.name = 'deck-harbor-spire'
  spireTower.geometry.translate(0, 0.5, 0)
  group.add(spireTower)
  /*
   * 檐口：塔身顶上一圈比塔身宽的薄板。**没有它，塔身与尖顶是一条直线上去的**，
   * 中间没有转折，眼会把它读成一个锥体（实测）。一圈挑檐就是"这是塔"的那一刀。
   */
  const spireCornice = new THREE.Mesh(shadeFaces(new THREE.BoxGeometry(1, 1, 1)), spireMat)
  spireCornice.name = 'deck-harbor-spire-cornice'
  group.add(spireCornice)
  /* 塔身正面的钟窗：一个竖向暗口（钟楼的脸） */
  const spireWindow = new THREE.Mesh(shadeFaces(new THREE.BoxGeometry(1, 1, 1)), paneMat)
  spireWindow.name = 'deck-harbor-spire-window'
  group.add(spireWindow)
  const spire = new THREE.Mesh(shadeFaces(new THREE.ConeGeometry(0.5, 1, 4)), spireCapMat)
  spire.rotation.y = Math.PI / 4
  spire.name = 'deck-harbor-spire-cap'
  spire.geometry.translate(0, 0.5, 0)
  group.add(spire)

  const craneGeo = shadeFaces(new THREE.BoxGeometry(1, 0.12, 0.12))
  /*
   * 吊臂的立柱。原来只有一根斜的 Box 悬在 y=deckY+0.62 处、长 1.5s（≈51 米）
   * —— 屏幕上是一根从屋顶方向斜插下来的木棍（实测放大图）。真实的吊货臂是
   * **一根立在地上的柱子 + 柱顶伸出的斜臂**，两者一竖一斜才读得出来。
   */
  const cranePostGeo = shadeFaces(new THREE.BoxGeometry(1, 1, 1))
  cranePostGeo.translate(0, 0.5, 0)
  const cranePosts = new THREE.InstancedMesh(cranePostGeo, pierMat, MAX_CRANE)
  cranePosts.name = 'deck-harbor-craneposts'
  cranePosts.frustumCulled = false
  group.add(cranePosts)

  const cranes = new THREE.InstancedMesh(craneGeo, pierMat, MAX_CRANE)
  cranes.name = 'deck-harbor-cranes'
  cranes.frustumCulled = false
  group.add(cranes)

  const flagPole = new THREE.Mesh(shadeFaces(new THREE.CylinderGeometry(0.025, 0.025, 1, 5)), mastMat)
  flagPole.geometry.translate(0, 0.5, 0)
  group.add(flagPole)
  const flagCloth = new THREE.Mesh(shadeFaces(new THREE.PlaneGeometry(0.26, 0.15)), flagMat)
  group.add(flagCloth)

  const dummy = new THREE.Object3D()
  const zero = new THREE.Matrix4().makeScale(0, 0, 0)
  let plan: HarborPlan | null = null
  let style: HarborStyle = harborStyleFor('europe')

  /** 逐实例色差用的临时色（避免每栋 new 一个 Color） */
  const tone = new THREE.Color()
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

    /* 岸壁：从水线 −0.14 立到码头面，贴在码头面的外沿 */
    quayFace.scale.set(deckHalfW * 2.7, deckY + 0.14, 0.12)
    quayFace.position.set(0, (deckY - 0.14) * 0.5, deckZ0 - 0.02)

    /* 前沿矮墙：横贯全宽，落在房子之前（z=0.1）、压住缝的下半截 */
    quayWall.scale.set(deckHalfW * 2.02, Math.min(0.26, deckY * 0.78), 0.12)
    quayWall.position.set(0, deckY, 0.1)

    /* ---- 房屋 ---- */
    const nH = Math.min(MAX_HOUSE, pl.houses.length)
    for (let i = 0; i < MAX_HOUSE; i++) {
      const h = i < nH ? pl.houses[i] : null
      if (!h) {
        walls.setMatrixAt(i, zero)
        roofs.setMatrixAt(i, zero)
        plinths.setMatrixAt(i, zero)
        eaves.setMatrixAt(i, zero)
        houseShadows.setMatrixAt(i, zero)
        continue
      }
      dummy.position.set(h.x, deckY, h.z)
      dummy.rotation.set(0, h.yaw, 0)
      dummy.scale.set(h.w, h.h, h.d)
      dummy.updateMatrix()
      walls.setMatrixAt(i, dummy.matrix)
      /*
       * 逐栋色差（instanceColor）。
       *
       * 【为什么这是"粗糙"的第二个来源】八栋房子共用一个材质、一个色值，
       * 屏幕上就是**一条等亮度的白带**：明暗只区分"正面/侧面"，分不出
       * "这一栋"与"那一栋"。真实码头边的墙有新有旧、有的刷过有的没刷，
       * ±8% 的亮度差 + 一点色相偏移就够让眼把它们数成八栋。
       *
       * 【为什么不改材质】每栋一个材质 = 每栋一个 draw call；instanceColor
       * 是逐实例的一个 vec3，零额外绘制。
       */
      tone.setRGB(
        (0.94 + 0.12 * hash01(i * 4.7 + 23)) * (1.0 + 0.03 * hash01(i * 8.3 + 5)),
        (0.94 + 0.12 * hash01(i * 4.7 + 23)) * (1.0 + 0.01 * hash01(i * 8.3 + 5)),
        (0.94 + 0.12 * hash01(i * 4.7 + 23)) * (0.97 + 0.02 * hash01(i * 8.3 + 5)),
      )
      walls.setColorAt(i, tone)
      /*
       * 屋顶同样抖，而且**不只抖亮度**：陶瓦从橙红到暗褐都有，只调亮度的结果是
       * "同一种红有深有浅"，仍然是一条色带。给一点点色相偏移（红多/黄多）
       * 才能把"一片红"打散成十几片瓦。
       */
      const rv = 0.86 + 0.22 * hash01(i * 6.1 + 29)
      tone.setRGB(
        rv * (1.0 + 0.05 * hash01(i * 2.3 + 31)),
        rv * (0.93 + 0.07 * hash01(i * 3.9 + 37)),
        rv * (0.88 + 0.06 * hash01(i * 5.1 + 41)),
      )
      roofs.setColorAt(i, tone)

      // 勒脚：比墙略宽、略深，给"房子站在地上"一个接触
      dummy.position.set(h.x, deckY - 0.01, h.z)
      dummy.scale.set(h.w * 1.05, Math.min(0.15, h.h * 0.16), h.d * 1.05)
      dummy.updateMatrix()
      plinths.setMatrixAt(i, dummy.matrix)

      /*
       * 影子：从墙脚朝**海那侧**（−z，也就是朝相机）铺一条，长度 ≈ 房高 × 0.9
       * （太阳仰角 0.75 的 y 分量 ≈ 45°以上）。只铺前排与后排，远排（farHouses）
       * 不铺 —— 它们在 30 单位外，影子会被前排自己的影子盖住。
       */
      const shLen = h.h * 0.9
      dummy.position.set(h.x, deckY + 0.004, h.z - h.d * 0.5 - shLen * 0.5)
      dummy.rotation.set(0, h.yaw, 0)
      dummy.scale.set(h.w * 1.06, 1, shLen)
      dummy.updateMatrix()
      houseShadows.setMatrixAt(i, dummy.matrix)

      /* 檐影：墙顶一条暗带（比墙宽 12%） */
      dummy.position.set(h.x, deckY + h.h - 0.02, h.z)
      dummy.rotation.set(0, h.yaw, 0)
      dummy.scale.set(h.w * 1.14, Math.max(0.03, h.h * 0.07), h.d * 1.14)
      dummy.updateMatrix()
      eaves.setMatrixAt(i, dummy.matrix)

      /* 屋顶：挑出 14%（≈2.6 米），与檐影一起给出"屋顶压在墙上"的关系 */
      dummy.position.set(h.x, deckY + h.h, h.z)
      dummy.rotation.set(0, h.yaw, 0)
      dummy.scale.set(h.w * 1.14, Math.max(0.05, h.roofH), h.d * 1.14)
      dummy.updateMatrix()
      roofs.setMatrixAt(i, dummy.matrix)
    }
    walls.instanceMatrix.needsUpdate = true
    roofs.instanceMatrix.needsUpdate = true
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true
    plinths.instanceMatrix.needsUpdate = true
    eaves.instanceMatrix.needsUpdate = true
    houseShadows.instanceMatrix.needsUpdate = true

    /* ---- 城内第三排：远屋顶（只有墙 + 屋顶，往冷灰里压） ---- */
    const nF = Math.min(MAX_FAR, pl.farHouses.length)
    for (let i = 0; i < MAX_FAR; i++) {
      const f = i < nF ? pl.farHouses[i] : null
      if (!f) { farWalls.setMatrixAt(i, zero); farRoofs.setMatrixAt(i, zero); continue }
      dummy.position.set(f.x, deckY, f.z)
      dummy.rotation.set(0, f.yaw, 0)
      dummy.scale.set(f.w, f.h, f.d)
      dummy.updateMatrix()
      farWalls.setMatrixAt(i, dummy.matrix)
      dummy.position.set(f.x, deckY + f.h, f.z)
      dummy.scale.set(f.w * 1.12, Math.max(0.04, f.roofH), f.d * 1.12)
      dummy.updateMatrix()
      farRoofs.setMatrixAt(i, dummy.matrix)
      /*
       * 逐栋色差照旧（±10%），再整体乘 FAR_HAZE。远排的色差要比前排**小**：
       * 距离会把差异吃掉，远处一片屋顶本来就该读成一片，而不是十几块色片。
       */
      const v = 0.95 + 0.1 * hash01(i * 4.7 + 211)
      tone.setRGB(v, v, v * 1.01).multiply(FAR_HAZE)
      farWalls.setColorAt(i, tone)
      tone.setScalar(0.92 + 0.14 * hash01(i * 6.1 + 223)).multiply(FAR_HAZE)
      farRoofs.setColorAt(i, tone)
    }
    farWalls.instanceMatrix.needsUpdate = true
    farRoofs.instanceMatrix.needsUpdate = true
    if (farWalls.instanceColor) farWalls.instanceColor.needsUpdate = true
    if (farRoofs.instanceColor) farRoofs.instanceColor.needsUpdate = true

    /* ---- 窗洞：白天的立面细节（夜里再叠一层光点） ---- */
    let qi = 0
    for (const pn of pl.panes) {
      if (qi >= MAX_HOUSE * 6) break
      // 框：比窗大 70%/50%，垫在窗后 1.5 厘米（只露出四边）
      dummy.position.set(pn.x, pn.y, pn.z + 0.012)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(pn.w * 1.7, pn.h * 1.5, 0.04)
      dummy.updateMatrix()
      windowFrames.setMatrixAt(qi, dummy.matrix)
      // 窗：凸出框一点，避免与墙面深度冲突
      dummy.position.set(pn.x, pn.y, pn.z - 0.004)
      dummy.scale.set(pn.w, pn.h, 0.05)
      dummy.updateMatrix()
      panes.setMatrixAt(qi, dummy.matrix)
      qi++
    }
    for (let i = qi; i < MAX_HOUSE * 6; i++) {
      panes.setMatrixAt(i, zero)
      windowFrames.setMatrixAt(i, zero)
    }
    panes.instanceMatrix.needsUpdate = true
    windowFrames.instanceMatrix.needsUpdate = true

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

    /* ---- 系泊缆绳：二次贝塞尔（中点下垂）挤成细管 ---- */
    for (let i = 0; i < MAX_LINE; i++) {
      const ln = lineMeshes[i]
      const L = i < pl.lines.length ? pl.lines[i] : null
      if (!L) { ln.visible = false; continue }
      ln.visible = true
      const [ax, ay, az] = L.from
      const [bx, by, bz] = L.to
      /* 控制点取 2×sag：贝塞尔在 t=0.5 处只下沉 sag/2，取两倍才对得上"下垂量" */
      const cy = Math.min(ay, by) - L.sag * 2
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(ax, ay, az),
        new THREE.Vector3((ax + bx) * 0.5, cy, (az + bz) * 0.5),
        new THREE.Vector3(bx, by, bz),
      )
      const geo = new THREE.TubeGeometry(curve, 10, 0.028, 4, false)
      ln.geometry.dispose()
      ln.geometry = geo
    }

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

      /* 倒影：从灯的投影点朝 −z 拉长（相机在船尾，看向 +z） */
      for (let i = 0; i < MAX_LAMP; i++) {
        const l = i < nL ? pl.lamps[i] : null
        if (!l) { reflect.setMatrixAt(i, zero); continue }
        const len = lampReflectionLen(l.y)
        dummy.position.set(l.x, 0.014, l.z - len * 0.5)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(0.36 + 0.14 * l.k, 1, len)
        dummy.updateMatrix()
        reflect.setMatrixAt(i, dummy.matrix)
      }
      reflect.instanceMatrix.needsUpdate = true
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
      dummy.scale.set(p.w, 0.12, len)
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

    /* ---- 防波堤：每臂一堆石头（不是一整块板） ---- */
    /*
     * 【为什么必须拆成石块】原来每臂是一个 4~10 单位长、宽 0.9、高 0.57 的
     * 四棱台 —— 从甲板上看，它的**顶面**是一块平躺的浅灰梯形，面积比一栋房子
     * 还大，横在水面上（实测截图里右侧那块"水泥板"，用户直接指出来）。
     * 抛石堤的真实剪影是**一串高低错落的石头**：顶面不平，边缘是齿状。
     * 拆成 6 块之后，顶面被切成锯齿，颜色也随明暗散开。
     */
    let bi = 0
    for (let arm = 0; arm < 2; arm++) {
      const b = pl.breakwaters[arm]
      if (!b) continue
      const dx = b.x1 - b.x0
      const dz = b.z1 - b.z0
      /* 石块必须**沿臂的长边**摆：rotation.y = atan2(dx, dz) 让本地的 +z 指向臂 */
      const armYaw = Math.atan2(dx, dz)
      for (let k = 0; k < BW_PER_ARM; k++) {
        const t = (k + 0.5) / BW_PER_ARM
        // 外端（堤头）略高、中间略低：真实抛石堤的轮廓本来就有起伏
        const hh = b.h * (0.6 + 0.45 * hash01(arm * 13 + k * 5 + 9)) * (0.92 + 0.2 * t)
        dummy.position.set(
          b.x0 + dx * t + (hash01(arm * 31 + k * 7 + 3) - 0.5) * 0.1,
          -0.14,
          b.z0 + dz * t + (hash01(arm * 17 + k * 11 + 5) - 0.5) * 0.1,
        )
        dummy.rotation.set(0, armYaw + (hash01(arm * 7 + k * 3) - 0.5) * 0.36, 0)
        /*
         * 沿臂方向 ×1.1、横向 ×2.0：石头**横向更宽**，相邻两块才会交叠成一条
         * 连续的脊。第一版 10 块 ×1.2/×1.05（近似正方）时，屏幕上是**一排
         * 独立的石凳**、彼此露着水（实测）—— 抛石堤的识别特征恰恰是"连成一片
         * 但顶面凹凸"，不是"一串墩子"。
         */
        dummy.scale.set(hh * 2.0, hh, hh * 1.15)
        dummy.updateMatrix()
        bws.setMatrixAt(bi++, dummy.matrix)
      }
    }
    for (let i = bi; i < MAX_BW; i++) bws.setMatrixAt(i, zero)
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
      /*
       * 干舷 = 0.26·len，但**封顶 0.42 单位**。
       *
       * 【为什么要封顶】夸张只对"小到看不清"的船有意义：1.2 单位的中型船
       * （22 米）干舷按真实比例只有 2.6 米 = 屏幕 6px，必须抬到 26% 才认得出。
       * 但栈桥头那条主力船是 2.4 单位（43 米）—— 26% 就是 **11 米干舷**，
       * 屏幕上成了一大块红棕色的墙（截图实测，比不改还糟）。
       * 大船在屏幕上本来就够大，它需要的是真实比例。
       */
      const hullH = Math.max(0.2, Math.min(0.42, m.len * 0.26))
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

      dummy.position.set(m.x, 0.2 + hullH * 0.9, m.z)
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
      /*
       * 宽 0.22·len（比船体窄）、高 1.55·干舷。原来是 0.3/1.9 —— 艉楼比船体
       * 还宽、比船壳高两倍，放大截图里是**一块立在船尾的方柜**，把船首到船尾
       * 的收分全盖住了。真实艉楼是船尾一截抬高的甲板室，比舷墙高一层人。
       */
      /*
       * 0.22/1.55/0.5 → 0.2/1.32/0.34：艉楼原来占了船长的**一半**、还是船体宽的
       * 1.1 倍，侧视里它就是"一块立着的红棕色方柜"，把舷弧与甲板线全挡掉。
       */
      dummy.scale.set(m.len * 0.2, hullH * 1.32, m.len * 0.34)
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

        if (si < MAX_MOOR * 4) {
          /*
           * 收起的横桁帆 = 一卷布挂在**横桁**上。
           *
           * 【轴向原来搞错了】旧代码把长度给在本地 x（= 船首方向），宽度只在
           * z 上给 0.12 —— 于是这条"横桁"是**沿船长**的一条短木头，从甲板
           * （正对船首）看过去只在桅杆上贴了一小块，四条桅杆像四根电线杆。
           * 真实帆桁是**垂直桅杆、横跨船宽**的一根长杆（长度接近船宽），
           * 收起的帆卷在它上面 —— 长度必须给 z。
           */
          /*
           * 每根桅两层桁（上小下大）。只有一层时，屏幕上"一根竖杆一根横杆"是
           * 一个**十字架**（截图实测）；真实帆船每桅有 2~4 层桁，上下逐层收短 ——
           * 这一组"梯形排列的横杆"才是帆船停泊时的剪影。
           */
          for (let lv = 0; lv < 2; lv++) {
            const sailY = 0.2 + m.len * (k === 0 ? 0.84 : 1.0) * (0.44 + 0.16 * lv)
            const span = (k === 0 ? 0.62 : 0.74) * (1 - 0.2 * lv)
            dummy.position.set(mx, sailY, mz)
            dummy.rotation.set(0, m.yaw, 0)
            dummy.scale.set(
              Math.max(0.07, m.len * 0.1),
              Math.max(0.055, m.len * 0.075),
              m.len * span,
            )
            dummy.updateMatrix()
            sails.setMatrixAt(si++, dummy.matrix)
            /* 桁：同一位置、稍靠下、更细更深的一根杆（布卷挂在它下面） */
            dummy.position.set(mx, sailY - m.len * 0.055, mz)
            dummy.scale.set(m.len * 0.055, m.len * 0.05, m.len * span * 1.08)
            dummy.updateMatrix()
            yardBars.setMatrixAt(si - 1, dummy.matrix)
          }
        }
      }

      /*
       * 船首斜桅：从船头伸向前上方的斜杆。
       *
       * 【为什么必须有】两根直桅 + 两条横帆的剪影只有"竖线 + 横线"——
       * 四条船并排就是一排栅栏（用户三次说"粗糙"里最直接的一处）。帆船剪影里
       * 唯一的长斜线就是斜桅，它一出现，同一堆线条立刻读成"船"。
       * Euler 是 XYZ（矩阵 Rx·Ry·Rz，作用顺序 z→y→x）：先绕 z 把 +y 倒向本地 +x
       * （船首），再绕 y 转到这艘船的朝向 —— 直接写 rotation.x 会让它游到水里。
       */
      if (mi < MAX_MOOR * 3) {
        const bx = m.x + Math.cos(m.yaw) * m.len * 0.44
        const bz = m.z - Math.sin(m.yaw) * m.len * 0.44
        dummy.position.set(bx, 0.2 + hullH * 0.8, bz)
        dummy.rotation.set(0, m.yaw, -1.05)
        dummy.scale.set(0.62, m.len * 0.42, 0.62)
        dummy.updateMatrix()
        masts.setMatrixAt(mi++, dummy.matrix)
      }
    }
    hulls.instanceMatrix.needsUpdate = true
    rails.instanceMatrix.needsUpdate = true
    sterns.instanceMatrix.needsUpdate = true
    for (let i = mi; i < MAX_MOOR * 3; i++) masts.setMatrixAt(i, zero)
    for (let i = si; i < MAX_MOOR * 4; i++) { sails.setMatrixAt(i, zero); yardBars.setMatrixAt(i, zero) }
    yardBars.instanceMatrix.needsUpdate = true
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
      /*
       * 塔身 : 檐口 : 尖顶 = 0.62 : 0.07 : 0.31（真实钟楼的比例）。
       * 塔身宽 = 塔身高 × 0.30 —— 原来 0.42 时塔身是个方柱，加上同色的锥，
       * 整个读作一个又高又细的白锥（实测全景里像"一片帆"）。
       */
      const H = pl.spire.h
      const bodyH = H * 0.62
      const bodyW = bodyH * 0.3
      spireTower.visible = true
      spireTower.position.set(pl.spire.x, deckY, pl.spire.z)
      spireTower.scale.set(bodyW, bodyH, bodyW)
      spireCornice.visible = true
      spireCornice.position.set(pl.spire.x, deckY + bodyH * 0.96, pl.spire.z)
      spireCornice.scale.set(bodyW * 1.34, bodyH * 0.07, bodyW * 1.34)
      spireWindow.visible = true
      spireWindow.position.set(pl.spire.x, deckY + bodyH * 0.74, pl.spire.z - bodyW * 0.52)
      spireWindow.scale.set(bodyW * 0.34, bodyH * 0.24, 0.03)
      spire.visible = true
      spire.position.set(pl.spire.x, deckY + bodyH + bodyH * 0.06, pl.spire.z)
      spire.scale.set(bodyW * 1.22, H * 0.31, bodyW * 1.22)
    } else {
      spire.visible = false
      spireTower.visible = false
      spireCornice.visible = false
      spireWindow.visible = false
    }

    for (let i = 0; i < MAX_CRANE; i++) {
      const c = pl.cranes[i]
      if (!c) {
        cranes.setMatrixAt(i, zero)
        cranePosts.setMatrixAt(i, zero)
        continue
      }
      // 柱高 = 臂长的 0.78，柱顶就是斜臂的支点
      const postH = c.arm * 0.78
      dummy.position.set(c.x, deckY, c.z)
      dummy.rotation.set(0, i === 0 ? 0.5 : -0.6, 0)
      dummy.scale.set(0.1, postH, 0.1)
      dummy.updateMatrix()
      cranePosts.setMatrixAt(i, dummy.matrix)

      dummy.position.set(c.x, deckY + postH, c.z)
      dummy.rotation.set(0, i === 0 ? 0.5 : -0.6, i === 0 ? -0.34 : -0.42)
      dummy.scale.set(c.arm, 1, 1)
      dummy.updateMatrix()
      cranes.setMatrixAt(i, dummy.matrix)
    }
    cranePosts.instanceMatrix.needsUpdate = true
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
    /*
     * 【bases 必须跟着一起改】`update` 每帧（在 night/fog 变化时）用
     * `m.color.copy(base).multiplyScalar(litK)` 重算颜色 —— base 是"这一个港
     * 白天的本色"。原来只有墙/屋顶/石堤同步了，栈桥、码头面、旗、塔身四个忘在
     * 外面：**推进黄昏那一次重算，它们就跳回欧洲的默认色**（广州港的栈桥变成
     * 里斯本的木头色）。四个都补上。
     */
    bases.set(pierMat, new THREE.Color(st.timber))
    bases.set(deckMat, new THREE.Color(st.quay))
    bases.set(flagMat, new THREE.Color(st.banner))
    bases.set(spireMat, new THREE.Color(st.wall))
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
      /*
       * 白天 0.06（几乎看不见）、黄昏 0.35、深夜 1。
       * 原来底值 0.25：正午的码头上挂着几个黄点（实测放大图里墙面上那几个
       * 光斑其实是前沿的灯）—— 大白天点灯是最露怯的一处。
       */
      lampMat.opacity = Math.min(1, (0.06 + 0.94 * night)) * (1 - Math.min(1, fogK) * 0.85)
      lampMat.size = (0.42 + 0.16 * night) * (1 + curPresence * 0.5)
      /* 倒影比灯本身淡一档，雾里削得更狠（水面上的像最先被雾吃掉） */
      reflectMat.opacity = Math.min(1, 0.2 + 0.8 * night) * (1 - Math.min(1, fogK) * 0.95)
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
