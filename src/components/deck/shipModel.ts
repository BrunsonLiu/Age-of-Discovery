import * as THREE from 'three'
import { createGlowTexture } from '@/components/map3d/models'
import { foamStripCanvas, normalFromCanvas, plankCanvas, sailAlphaCanvas, sailCanvas, texFrom } from './shipTextures'
import {
  HULL_BULWARK, HULL_STATIONS, SHIP_HALF_LENGTH,
  shipDeckAt, shipDeckHalfWidthAt, shipHalfWidthAt, shipKeelAt,
} from './shipShape'
import { buildHullGeo } from './shipHull'
import {
  BOWSPRIT_BASE, BOWSPRIT_CAP_INSET, BOWSPRIT_TIP, FIGUREHEAD_CREST, figureheadPoints, STEM_Z, stemTopY,
} from './deckBow'
import { ANCHOR_LEN, ANCHOR_SIDE, ANCHOR_STOCK, anchorPose, HAWSE_Y, HAWSE_Z } from './deckAnchor'
import { sailorIdle, SAILOR_POSES, SAILOR_STATIONS } from './deckCrew'
import { chartCourse } from './deckChart'
import { WATERLINE_Y_M, WAKE_SEGMENTS } from './deckWake'
import { bearingDelta, FLAG_BASE_H_M, FLAG_LEN_M, FLAG_SEG_X, FLAG_SEG_Y, flagOffset, pennantYaw, windK } from './deckFlag'
import {
  BRACE_SEGMENTS, braceYaw, rotateAboutYaw, SAIL_DROP, SAIL_TAPER, SAIL_Z_OFF,
  sailClew, sheetSag, sheetSway, SHEET_SEGMENTS, writeSheetPoints,
} from './deckRigging'

/*
 * 形状与缩放的定义搬到了 `shipShape.ts`（纯数字，可在单测里跑），这里转出去，
 * 免得甲板行走与测试改 import 路径。**不要在这里再写一遍公式**。
 */
export { SHIP_SCALE, shipDeckAt, shipHalfWidthAt } from './shipShape'

/**
 * 船上视角的船：按"放样 + 帆装 + 索具"重建，不是几个方块拼的。
 *
 * 【来源与改造】结构与比例取自用户另一个项目（黑珍珠号）的 `createShip`：
 * 30 个站位的船体放样、舷墙、船尾楼与回廊、三桅六帆、贝塞尔索具、吊灯笼。
 * 我们这边做了四件事：
 *   ① 改成 TS/ESM、用我们自己的程序化贴图（不搬它的 27 个生成器）；
 *   ② 尺寸保留它的原尺度（半长 18、船宽 10），由调用方 `scale` 缩到场景里——
 *      这样所有比例（桅高/帆宽/舷墙厚）都是它调好的，不会因为换算走样；
 *   ③ 帆的摆动保留（顶点着色器），但去掉毛边纤维与破口开合（那套要扫 alpha 像素，
 *      等甲板视角做出来再补）；
 *   ④ 灯光只留两盏（回廊 + 艏），其余用自发光 + 光晕贴图假扮——
 *      每盏 PointLight 都是逐片元成本，近景两三盏就够了。
 *
 * 【为什么值得换】原来那个模型是"扁平船体 + 三根棍子 + 平板帆"，在这个距离上
 * 一眼就假。现在船壳有舷弧与收分、甲板有板缝、帆有鼓胀与摆动、索具把桅杆连起来，
 * 剪影与细节都对得上"帆船"这个物件。
 */

/** 舷墙高度（甲板面往上），贴图与桅杆都要用；定义在 shipShape 里 */
const BULWARK = HULL_BULWARK

export interface DeckShip {
  group: THREE.Group
  /**
   * 每帧推进。
   * @param night 夜色 0..1：**灯要跟着日相亮/灭**（正午的船窗不该发光）
   * @param helm 舵轮转角（弧度）。0 = 正舵；改航向时由调用方给一个脉冲，
   *   航行中给一点随浪的微调。**它不代表真实舵角** —— 航向由 store 里的 waypoint
   *   决定，这里只是让甲板上那件东西对"改向"这件事有反应。
   */
  update(t: number, helm?: number, night?: number): void
  /**
   * 背光方向与透光颜色（世界空间）。帆是薄的，逆光时会透亮。
   * @param color 透出的光色；@param k 强度（0 = 完全不透）
   */
  setBacklight(dir: THREE.Vector3, color: THREE.Color, k: number): void
  /**
   * 甲板上露几个水手（0..3）。由 `fleet.ships[].crew` 经 `sailorCount` 得来 ——
   * **船上没人就不该有人站在甲板上**，这是画面与数字一致性的一部分。
   */
  setCrew(n: number): void
  /**
   * 风（`weather.windDir` = **风吹去**的罗盘方位、`weather.windSpeed` = 节）。
   * 旗子按它转向与甩动 —— 于是"风往哪吹"这件决定航程天数的事，第一次在画面里可读。
   */
  setWind(bearingDeg: number, speedKnots: number): void
  /**
   * 航迹：强度 0..1、船首 V 浪张角（弧度）、船首浪长度（模型米，0 = 没在走）。
   * 这三个数全部由 `deckWake` 的纯函数从"是否航行 + 船速"算出来。
   */
  setWake(strength: number, spreadRad: number, bowLenM: number, waveAmp?: number): void
  /**
   * 抛锚 / 收锚（`!fleet.isSailing`）。
   * 锚垂进水里 = 停着，收到舷边 = 在走 —— 全船唯一与"是否在航行"直接挂钩的实体。
   */
  setMooring(moored: boolean): void
  /**
   * 海图桌上那张图上的航线（**真实方位与剩余距离**）。
   * @param bearingDeg 到下一站的真方位；@param remainNm 剩余海里。
   * 任一为 null = 没有航路（图上不画线）。
   */
  setCourse(bearingDeg: number | null, remainNm: number | null): void
  dispose(): void
}

/**
 * 接触暗部（contact shadow）用的软圆贴图。
 *
 * 【为什么不用 shadowMap】整条船 + 整片海都要阴影的话，光源得开 castShadow、
 * 每个网格要 receiveShadow，代价是每个阴影光源一次额外的深度 pass —— 而这里
 * 需要的只是"东西落在地板上"的那一圈暗部。一张径向渐变的贴图贴在物件脚下，
 * 几十个顶点就能有 80% 的效果。
 */
function contactShadowTexture(): THREE.CanvasTexture {
  const S = 128
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  // 中心 0.85、边缘 0：暗部要"从物件底下往外淡出"，硬边一眼就看出来是贴片
  grad.addColorStop(0, 'rgba(0,0,0,0.85)')
  grad.addColorStop(0.45, 'rgba(0,0,0,0.45)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function createDeckShip(): DeckShip {
  /** 简写：本文件里到处要写三维点 */
  const V = THREE.Vector3
  /**
   * 任意高度处的船体半宽：截面是半椭圆（与炮门、放样用同一个公式），
   * 给定 y 反解出该高度的 x。→ 水线泡沫带与湿痕都靠它贴到船壳上。
   */
  const hullHalfWidthAtY = (z: number, y: number): number => {
    const deck = shipDeckAt(z)
    const keel = shipKeelAt(z)
    const cosA = (deck - y) / (deck + keel)
    return shipHalfWidthAt(z) * Math.sqrt(Math.max(0, 1 - cosA * cosA))
  }
  const group = new THREE.Group()
  group.name = 'deck-ship'
  const disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = []

  /*
   * ---- 接触暗部：所有"落在地上"的东西脚下一圈软阴影 ----
   *
   * 共享一张贴图 / 一个材质 / 一个 1×1 平面：每个物件只是缩放到自己的占地大小、
   * 加一个位置。**不共享几何会多十几个 draw setup**，而这里每个都是一个 quad。
   * 透明度按材质统一（0.6）—— 分档反而会让"桌面亮、椅子暗"这种不一致露出来。
   */
  const shadowTex = contactShadowTexture()
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex, transparent: true, depthWrite: false, opacity: 0.6, color: 0x000000,
  })
  const shadowGeo = new THREE.PlaneGeometry(1, 1)
  disposables.push(shadowTex, shadowMat, shadowGeo)
  /**
   * 在父节点下的 (x,y,z) 处放一块 rx × rz 的接触暗部（y 由调用方给，必须略高于地面）。
   */
  const addShadow = (
    parent: THREE.Object3D, x: number, y: number, z: number, rx: number, rz: number,
  ) => {
    const m = new THREE.Mesh(shadowGeo, shadowMat)
    m.rotation.x = -Math.PI / 2
    m.position.set(x, y, z)
    m.scale.set(rx * 2, rz * 2, 1)
    // 阴影不该被拾取（否则点到"影子"会命中一个看不见的平面）
    m.raycast = () => {}
    parent.add(m)
    return m
  }

  // ---------------- 贴图 ----------------
  const hullCanvas = plankCanvas({ seed: 4471, along: 'h', rows: 9, base: [86, 58, 36], seamW: 2.2 })
  /*
   * 甲板木板：rows 24（约 0.39 米一条，接近真实板宽；14 条时每条 0.67 米，
   * 脚边读成"木地板"而不是"船板"），1024 边长 + 端头接缝。
   *
   * grain: 0 —— 不要年轮线。船壳是立着的面、看的是"板缝 + 木纹"；甲板是
   * **平的面**，视线掠着扫过去，任何一条沿板长方向的波浪线都被拉成"水波纹"
   * （实测两版截图都是这样）。
   * wear: 0.15 —— 不要钉子。钉子在 512 的贴图里只有 1.4px，掠射角下被过滤成
   * 一小段短线，密密麻麻排在板缝旁，整片甲板读成"砖砌地面"（放大截图实测）。
   */
  const deckCanvas = plankCanvas({
    // 底色 [150, 112, 74]：晒过的柚木甲板；[122,90,58] 在正确编码下读作深巧克力
    seed: 9917, along: 'v', rows: 24, base: [150, 112, 74], seamW: 2.4,
    // grain 0.4：一点点木纹就够；0 的时候近看是一块平涂的板（放大截图）
    grain: 0.4, wear: 0.15, size: 1024, buttJoints: true,
    /*
     * traffic：中央走道的磨损。甲板是这条船上唯一"被人反复走过"的表面，
     * 一条磨白的带 + 十几道拖痕，是它和"刚刷过漆的新地板"唯一的区别。
     * 强度 1.0 —— uv 的 u 横跨整个船宽（repeat 只沿 v），所以这条带正好落在中线。
     */
    traffic: 1,
  })
  const hullTex = texFrom(hullCanvas, true)
  const hullNormal = normalFromCanvas(hullCanvas, 2.2)
  const deckTex = texFrom(deckCanvas, true)
  hullTex.repeat.set(1, 3)
  // 甲板沿船长方向重复 3 次：板是整根长的，重复的是木纹，衔接处在脚边看不出来
  deckTex.repeat.set(1, 3)
  const sailTex = texFrom(sailCanvas(7), true)
  const sailAlpha = texFrom(sailAlphaCanvas(11), false)
  const glowTex = createGlowTexture()
  // 取证句柄：贴图是程序化生成的，出问题时唯一直接的办法是把 canvas 本身导出来看
  group.userData.sourceCanvases = { hull: hullCanvas, deck: deckCanvas, sail: sailCanvas(7) }
  disposables.push(hullTex, hullNormal, deckTex, sailTex, sailAlpha, glowTex)

  const woodDark = new THREE.MeshStandardMaterial({ color: 0x3a2918, roughness: 0.9, metalness: 0.05 })
  const woodMid = new THREE.MeshStandardMaterial({ color: 0x5c4129, roughness: 0.88, metalness: 0.05 })
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.82, metalness: 0.35 })
  const brassMat = new THREE.MeshStandardMaterial({ color: 0x9d7a3c, roughness: 0.45, metalness: 0.7 })
  /*
   * 桅杆色 0x33251a（原 0x1d150e）：0x1d150e 在 ACES 下几乎是纯黑，站到甲板上
   * 时主桅是一根贯穿画面的黑柱子（实测截图），读作"穿模的圆柱"而不是木桅。
   * 焦油涂过的木头是深棕，不是黑。
   */
  /*
   * 桅杆 0x33251a → 0x4a3826：站到甲板上抬头，主桅是一根贯穿画面的黑柱子 —— 它
   * 只吃环境光（fill 从镜头后方打，桅杆朝镜头那面在背光里），深棕在 ACES 下就黑了。
   * 抬到 0x4a3826 才读得出是"焦油木"，而不是一根穿模的杆。
   */
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x4a3826, roughness: 0.85, metalness: 0.08 })

  // ---------------- 船体放样 ----------------
  // 几何在 `shipHull.ts` 里生成（纯数组、可单测）；这里只负责贴到 BufferGeometry 上
  const hullData = buildHullGeo()
  const hullGeo = new THREE.BufferGeometry()
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(hullData.positions, 3))
  hullGeo.setAttribute('uv', new THREE.Float32BufferAttribute(hullData.uvs, 2))
  hullGeo.setIndex(hullData.indices)
  hullGeo.computeVertexNormals()
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: hullTex,
    normalMap: hullNormal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.76,
    metalness: 0.06,
    /*
     * 极弱自发光：夜里背光面不至于变成纯黑洞（海图那边同一条经验）。
     * 0.5 / 0x121c26 是第二轮调过的值：舷墙**内侧**是背光面，站上甲板时
     * 它占了画面右半边，0.35 时读作一堵黑墙（实测 rgb 28/31/38，与夜空的
     * 对比几乎为零），抬到这里之后能看出是木板。
     */
    emissive: 0x121c26,
    emissiveIntensity: 0.5,
    side: THREE.DoubleSide,
  })
  /*
   * 【网格必须命名】甲板视角是"贴着物件看"，构图出问题时唯一可靠的定位手段是
   * 从屏幕某点发一条射线，读命中的是谁。第一版全部无名，探针只能报
   * "(无名) BufferGeometry #ffffff" —— 船壳与甲板两条都长这样，分不出来。
   */
  const hull = new THREE.Mesh(hullGeo, hullMat)
  hull.name = 'ship-hull'
  group.add(hull)
  disposables.push(hullGeo, hullMat)

  // ---------------- 甲板 ----------------
  const dv: number[] = []
  const du: number[] = []
  const di: number[] = []
  for (let i = 0; i <= HULL_STATIONS; i++) {
    const z = -SHIP_HALF_LENGTH + 2 * SHIP_HALF_LENGTH * (i / HULL_STATIONS)
    const w = shipDeckHalfWidthAt(z)
    const y = shipDeckAt(z) + 0.03
    dv.push(-w, y, z, w, y, z)
    du.push(0, i / HULL_STATIONS, 1, i / HULL_STATIONS)
  }
  for (let i = 0; i < HULL_STATIONS; i++) {
    const a = i * 2
    di.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const deckGeo = new THREE.BufferGeometry()
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(dv, 3))
  deckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(du, 2))
  deckGeo.setIndex(di)
  deckGeo.computeVertexNormals()
  /*
   * 【甲板用 Lambert，不用 Standard】这一条是"脚边那块甲板像一汪水"的解法：
   * 人眼高度看甲板是极限掠射角，Standard 材质的介质镜面反射（F0=0.04）在掠射
   * 时菲涅尔趋近 1，粗糙度 0.92 也压不住 —— 整片近处甲板把天空镜面反射回来，
   * 变成一块淡蓝灰色的板（实测截图：脚下像积了水）。干燥的木板本来就只有漫反射，
   * Lambert 没有镜面项，这里用它才是对的材质。
   * 顺带：甲板也不要法线贴图 —— 掠射角下板缝被压成断续短线，读作碎砖。
   */
  const deckMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: deckTex,
    emissiveMap: deckTex,
    emissive: 0x6a4a2a,
    /* 0.2：自发光只用来托住夜里的暗部；0.3 在白天会把木纹糊成一层平橘色 */
    emissiveIntensity: 0.2,
    side: THREE.DoubleSide,
  })
  const deck = new THREE.Mesh(deckGeo, deckMat)
  deck.name = 'ship-deck'
  group.add(deck)
  disposables.push(deckGeo, deckMat)

  // ---------------- 舷墙金色饰线 ----------------
  const railMat = new THREE.LineBasicMaterial({ color: 0xb08a45, transparent: true, opacity: 0.7 })
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= HULL_STATIONS; i++) {
      const z = -SHIP_HALF_LENGTH + 2 * SHIP_HALF_LENGTH * (i / HULL_STATIONS)
      pts.push(new THREE.Vector3(s * shipHalfWidthAt(z) * 0.99, shipDeckAt(z) + BULWARK + 0.02, z))
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts)
    group.add(new THREE.Line(g, railMat))
    disposables.push(g)
  }
  disposables.push(railMat)

  // ---------------- 船尾楼 ----------------
  const sternDeck = shipDeckAt(-15)
  const cabin = new THREE.Group()
  cabin.name = 'ship-cabin'
  cabin.position.set(0, sternDeck + 1.35, -14.6)
  const cabinBox = new THREE.Mesh(new THREE.BoxGeometry(6.6, 2.7, 5.2), woodMid)
  cabin.add(cabinBox)
  const cabinTop = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.28, 5.8), woodDark)
  cabinTop.position.y = 1.5
  cabin.add(cabinTop)

  /** 所有"点着的灯"（窗户玻璃、灯笼玻璃）与它们的光晕 —— 白天要暗下去 */
  const warmMats: THREE.MeshStandardMaterial[] = []
  const warmGlows: THREE.Sprite[] = []
  /** 灯笼里的实体点光：白天必须关掉（它是"夜里照亮甲板"的那盏灯） */
  const warmLights: { light: THREE.PointLight, base: number }[] = []
  /** 船长室里那盏灯：**独立一条曲线**，白天也亮着（室内没有天空的反弹光） */
  let cabinLamp: THREE.PointLight | null = null
  /** 艉窗透进来的冷光（给舱内拉色相层次） */
  let cabinWindowLamp: THREE.PointLight | null = null
  /** 水线湿痕的材质：**不受光**（Basic），所以必须自己跟夜色，否则夜里比船壳亮 */
  let wetMatRef: THREE.MeshBasicMaterial | null = null
  /** 舱内那三扇窗的玻璃：**不受光**，直接用天空色（白天亮、夜里暗） */
  let cabinGlassMat: THREE.MeshBasicMaterial | null = null
  /** 往海图上画航线（方位 + 剩余距离）；未进舱时为 null */
  let paintCourse: ((b: number | null, nm: number | null) => void) | null = null
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x1a1004,
    emissive: 0xffab5e,
    emissiveIntensity: 2.2,
    // 0.35 → 0.55：老玻璃不是镜子，点光在它上面打出的高光会变成一团白斑
    roughness: 0.55,
  })
  warmMats.push(windowMat)
  for (let i = -1; i <= 1; i++) {
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.78), windowMat)
    win.position.set(i * 1.55, 0.42, -2.62)
    win.rotation.y = Math.PI
    cabin.add(win)
    // 窗框：四根细铜条（近景能读出结构，不是一块发光板）
    for (const [ox, oy] of [[0, 0.52], [0, -0.52], [0.56, 0], [-0.56, 0]] as const) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(ox ? 0.08 : 1.22, oy ? 0.08 : 1.06, 0.12), brassMat)
      frame.position.set(i * 1.55 + ox, 0.42 + oy, -2.6)
      cabin.add(frame)
    }
    // 窗光的光晕：一张加法混合的 sprite，不是 PointLight（省逐片元）
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffa958,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.3,
      toneMapped: false,
    }))
    glow.scale.set(2.6, 2.6, 1)
    glow.position.set(i * 1.55, 0.45, -2.92)
    cabin.add(glow)
    warmGlows.push(glow)
  }
  /*
   * ---- 船尾楼朝向甲板的那一面：门 + 两扇小窗 ----
   *
   * 【为什么必须补】船尾楼的六扇窗全在**艉板**上（朝船尾、朝海）。于是站在甲板上
   * 回头看，看到的是一整块 6.6×2.7 米的空木墙 —— 又黑又空，是甲板上最没有信息
   * 的一块面（实测截图）。真实的船尾楼front 有舱门（通往船长室/储藏）、两侧有
   * 采光小窗：补上之后，那面墙才读得出"这里能进去"，也给夜里的甲板多加两个光源。
   *
   * 位置用局部坐标：船尾楼中心在 z=−14.6、进深 5.2，所以**前壁在局部 z=+2.6**。
   */
  {
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3f2c1b, roughness: 0.92 })
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.95, 0.08), doorMat)
    door.name = 'ship-cabin-door'
    door.position.set(0, -0.37, 2.6)
    cabin.add(door)
    // 门框：两根铜立柱 + 一道门楣（与艉窗同一种铜，读作同一条船）
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 2.12, 0.13), brassMat)
      post.position.set(sx * 0.52, -0.33, 2.6)
      cabin.add(post)
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.09, 0.13), brassMat)
    lintel.position.set(0, 0.73, 2.6)
    cabin.add(lintel)
    // 门上的小窗（夜里会透出灯光，白天是深色玻璃）
    /*
     * z 偏移必须拉开：门板厚 0.08（2.56~2.64），玻璃若贴在 2.645 就只有 5 毫米余量，
     * 深度缓冲在这个距离上会打架（实测：玻璃上出现一片脏粉色斑）。给到 2.70。
     */
    const doorWin = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.38), windowMat)
    doorWin.position.set(0, 0.28, 2.70)
    cabin.add(doorWin)
    /*
     * 这三扇朝甲板的窗也要有光晕：艉窗那边一直有，而新加的窗若只有一块亮玻璃，
     * 夜里读作"墙上贴了一张黄纸"（实测截图）。光晕是加法 sprite，走同一个
     * `warmGlows` 列表，白天一起被压掉。
     */
    const addGlow = (x: number, y: number, size: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTex, color: 0xffa958, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }))
      sp.scale.set(size, size, 1)
      sp.position.set(x, y, 2.95)
      cabin.add(sp)
      warmGlows.push(sp)
      return sp
    }
    addGlow(0, 0.28, 1.5)
    // 铜把手
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.12, 8), brassMat)
    knob.position.set(0.33, -0.42, 2.68)
    knob.rotation.x = Math.PI / 2
    cabin.add(knob)
    // 两侧采光窗：比艉窗小一半，位置对着舱内的工作台高度
    for (const sx of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.44), windowMat)
      w.position.set(sx * 2.15, 0.36, 2.66)
      cabin.add(w)
      addGlow(sx * 2.15, 0.36, 1.6)
      for (const [ox, oy, bw, bh] of [[0, 0.27, 0.62, 0.07], [0, -0.27, 0.62, 0.07], [0.31, 0, 0.07, 0.6], [-0.31, 0, 0.07, 0.6]] as const) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.1), brassMat)
        f.position.set(sx * 2.15 + ox, 0.36 + oy, 2.6)
        cabin.add(f)
      }
    }
  }

  /*
   * ================= 舱内（船长室）=================
   *
   * 【为什么必须自己铺一层内壁】船尾楼是一个 BoxGeometry：它的面朝外，从**里面**
   * 看是被背面剔除的 —— 站进舱里会直接看见外面的海。所以内部要另铺一层朝内
   * 的平面（地板、天花、四面墙），Box 只当"外壳"。
   *
   * 坐标全部用**舱的局部系**（cabin 的 position 已经把它放到位）：
   *   x ∈ ±3.3（船宽方向）、y ∈ ±1.35（楼高 2.7）、z ∈ ±2.6（进深 5.2）；
   *   地面在 y = −1.35，也就是甲板面。
   *
   * 【为什么值得做】舱门这一轮已经建在船尾楼正面了 —— 门后面如果是空的，
   * 那扇门就是一张贴纸。舱内给的是这一局最安静的一处：海图桌（航路）、床（休息）、
   * 箱子（货）、挂灯（光）。它也是唯一能"关起门来看海图"的地方。
   */
  {
    /*
     * 内宽 5.6 而不是 6.6：船体半宽在船尾只有 4.03（z=−12）→ 3.07（z=−17.2），
     * 6.6 宽的舱会在艉部两侧穿出船壳 —— 站在舱里能看见**船壳的木条斜插进来**
     * （实测：左侧一条灰蓝色的楔形，射线命中 `ship-hull`）。
     * 5.6 宽（半宽 2.8）在整个进深里都留有余量。
     */
    const IN_W = 5.6
    const IN_D = 5.2
    const IN_H = 2.7
    const halfH = IN_H / 2
    /*
     * 【半高 1.35 与半深 2.6 是两件事】第一版把 z 也写成了 halfH —— 于是四面墙、
     * 艉窗、舱门全都挤到地板中心线附近，房间实际只有 2.7 米深，门开在屋子中间。
     * 屏幕上看仍然"像个木盒子"，只有量了世界坐标才发现相机和门只差 1 毫米。
     */
    const halfD = IN_D / 2
    /*
     * 内壁用 Lambert + 船壳的木板贴图：Standard 在这个距离上会把天花板反成一块
     * 灰蓝（和甲板"积水"同一个原因），而舱内是纯漫反射的木板。
     */
    // 0xa98a66 → 0x9c8b74：原色在暖光下整间屋子是一片橙（实测截图没有色相变化）
    const wallMatIn = new THREE.MeshLambertMaterial({ map: hullTex, color: 0x9c8b74, side: THREE.FrontSide })
    const floorMatIn = new THREE.MeshLambertMaterial({ map: deckTex, color: 0xb59a76, side: THREE.FrontSide })
    const ceilMatIn = new THREE.MeshLambertMaterial({ color: 0x6d563c, side: THREE.FrontSide })
    disposables.push(wallMatIn, floorMatIn, ceilMatIn)

    const plane = (w: number, h: number, mat: THREE.Material) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    // 地面（法线朝上）
    const fl = plane(IN_W, IN_D, floorMatIn)
    fl.rotation.x = -Math.PI / 2
    fl.position.set(0, -halfH + 0.005, 0)
    fl.name = 'ship-cabin-floor'
    cabin.add(fl)
    // 天花（法线朝下）
    const cl = plane(IN_W, IN_D, ceilMatIn)
    cl.rotation.x = Math.PI / 2
    cl.position.set(0, halfH - 0.005, 0)
    cl.name = 'cabin-ceiling'
    cabin.add(cl)
    // 前壁（朝舱内 = −z），门开在这面
    const front = plane(IN_W, IN_H, wallMatIn)
    front.rotation.y = Math.PI
    front.position.set(0, 0, halfD - 0.01)
    front.name = 'cabin-wall-front'
    cabin.add(front)
    // 后壁（艉板，朝 +z）：三扇窗在这里
    const back = plane(IN_W, IN_H, wallMatIn)
    back.position.set(0, 0, -halfD + 0.01)
    back.name = 'cabin-wall-back'
    cabin.add(back)
    // 两舷
    const port = plane(IN_D, IN_H, wallMatIn)
    port.rotation.y = -Math.PI / 2
    port.position.set(IN_W / 2 - 0.01, 0, 0)
    port.name = 'cabin-wall-port'
    cabin.add(port)
    const stbd = plane(IN_D, IN_H, wallMatIn)
    stbd.rotation.y = Math.PI / 2
    stbd.position.set(-IN_W / 2 + 0.01, 0, 0)
    stbd.name = 'cabin-wall-stbd'
    cabin.add(stbd)

    /*
     * 艉窗的**内侧**：外面那三扇是朝外的（rotation.y=π），从舱里看是背面、被剔除，
     * 于是夜里"舱内一片黑"。这里贴一层朝内的同款玻璃 —— 它同时是舱内唯一的光源
     * 说辞：灯是给舱内用的，海光是从这扇窗进来的。
     */
    /*
     * 【舱内的窗不能复用 `windowMat`】那是"灯光漏到外面"的材质（夜里 emissive 2.2）。
     * 从舱里往外看，玻璃应该是**暗的** —— 夜里窗外是黑的，不是一盏灯。第一版直接
     * 复用它，夜里三扇窗是三个过曝的黄板，整间屋子像烧起来了（实测截图）。
     * 这里用一块深色的普通玻璃：白天被窗侧的冷光映成灰蓝，夜里几乎是黑。
     */
    /*
     * 用 **MeshBasicMaterial**、完全不受光：舱内的窗是"看出去的那块天"，它不该
     * 被舱里那盏灯照亮。第一版用 Standard，点光在玻璃上打出一大片渐变亮斑，
     * 两块窗像贴了两团雾（实测截图）。颜色每帧由天空的昼夜插值给（见 update）。
     */
    const glassInMat = new THREE.MeshBasicMaterial({ color: 0x0a121c })
    disposables.push(glassInMat)
    cabinGlassMat = glassInMat
    for (let i = -1; i <= 1; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.78), glassInMat)
      w.position.set(i * 1.55, 0.42, -halfD + 0.03)
      w.name = 'cabin-window-in'
      cabin.add(w)
    }

    // 门的内侧：门板 + 铜框 + 一个可以点回甲板的命中体
    const doorIn = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.95, 0.06), new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.92 }))
    doorIn.position.set(0, -0.37, halfD - 0.07)
    cabin.add(doorIn)
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.06, 0.1), brassMat)
      post.position.set(sx * 0.5, -0.34, halfD - 0.08)
      cabin.add(post)
    }
    const doorHit = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 2.2, 0.3),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    doorHit.name = 'ship-cabin-inner-door'
    doorHit.position.set(0, -0.2, halfD - 0.14)
    cabin.add(doorHit)

    /*
     * ---- 海图桌 ----
     * 桌面上摊一张海图（浅色羊皮纸 + 两道墨线）：它是这个房间里唯一"要被看"的东西，
     * 也是整个游戏的隐喻 —— 玩家在做的所有决定，最后都落在这张纸上。
     */
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x5a3f26, roughness: 0.9 })
    const topY = -halfH + 0.92
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.07, 1.05), tableMat)
    top.position.set(0, topY, 0.15)
    cabin.add(top)
    for (const [lx, lz] of [[-0.78, -0.42], [0.78, -0.42], [-0.78, 0.72], [0.78, 0.72]] as const) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.9, 0.09), tableMat)
      leg.position.set(lx, -halfH + 0.45, 0.15 + lz)
      cabin.add(leg)
    }
    // 0xd9c79c → 0xc2ad80：正对着挂灯，原色在 0.5 米处被照到接近纯白（实测截图）
    // 0xc2ad80 → 0xa89268：挂灯就在桌子正上方 1.3 米，原色被照到接近纯白（实测截图）
    /*
     * ---- 海图：一张会画"你正在往哪走"的 canvas ----
     * 图面（羊皮纸 + 两道海岸墨线 + 一条航线）画在一张 256×170 的 canvas 上，
     * 航线的方位与长度由 `setCourse` 用**真实数据**重画（见 deckChart.ts）。
     * 不用静态贴图：静态图只能当装饰，而这张图是甲板上唯一"会跟着你变"的东西。
     */
    const CHART_W = 256
    const CHART_H = 170
    const chartCanvas = document.createElement('canvas')
    chartCanvas.width = CHART_W
    chartCanvas.height = CHART_H
    const chartTex = new THREE.CanvasTexture(chartCanvas)
    chartTex.colorSpace = THREE.SRGBColorSpace
    disposables.push(chartTex)

    /** 重画整张图（底图 + 海岸 + 航线）。只在方位/距离变化超过阈值时调用。 */
    const paintChart = (bearingDeg: number | null, remainNm: number | null) => {
      const g = chartCanvas.getContext('2d')!
      // 羊皮纸底
      g.fillStyle = '#c9b184'
      g.fillRect(0, 0, CHART_W, CHART_H)
      // 两道海岸墨线：不画真实地理，只给"这是一张海图"的语汇
      g.strokeStyle = 'rgba(92,74,48,0.75)'
      g.lineWidth = 2
      for (const pts of [
        [[-10, 120], [40, 96], [78, 104], [120, 74], [168, 62], [210, 40]],
        [[30, 170], [62, 148], [96, 150], [140, 132], [200, 130], [266, 108]],
      ] as const) {
        g.beginPath()
        pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
        g.stroke()
      }
      // 罗盘：一圈细线 + 十字
      const cx = 78
      const cy = 86
      g.strokeStyle = 'rgba(92,74,48,0.5)'
      g.lineWidth = 1
      g.beginPath(); g.arc(cx, cy, 22, 0, Math.PI * 2); g.stroke()
      g.beginPath(); g.moveTo(cx - 28, cy); g.lineTo(cx + 28, cy); g.moveTo(cx, cy - 28); g.lineTo(cx, cy + 28); g.stroke()

      const course = chartCourse(bearingDeg, remainNm)
      if (course) {
        const len = Math.min(CHART_W, CHART_H) * 0.5 * course.lengthFrac * 2
        const x1 = cx + Math.cos(course.angleRad) * len
        const y1 = cy + Math.sin(course.angleRad) * len
        // 航线：一笔实线 + 端头一个小三角（"往这边走"）
        g.strokeStyle = 'rgba(120,42,28,0.92)'
        g.lineWidth = 2.4
        g.setLineDash([7, 5])
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(x1, y1); g.stroke()
        g.setLineDash([])
        g.fillStyle = 'rgba(120,42,28,0.95)'
        g.beginPath()
        g.arc(x1, y1, 3.2, 0, Math.PI * 2)
        g.fill()
        // 船位：一个实心小点（起点）
        g.fillStyle = 'rgba(60,44,26,0.95)'
        g.beginPath(); g.arc(cx, cy, 3.6, 0, Math.PI * 2); g.fill()
      }
      chartTex.needsUpdate = true
    }
    paintChart(null, null)

    const chart = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.82), new THREE.MeshLambertMaterial({ map: chartTex }))
    chart.rotation.x = -Math.PI / 2
    chart.position.set(0, topY + 0.04, 0.15)
    chart.name = 'ship-cabin-chart'
    cabin.add(chart)
    disposables.push(tableMat)
    /** 上一次画进去的方位/距离：变化不到阈值就不重画（每帧重画 canvas 很贵） */
    let lastCourse: { b: number | null; nm: number | null } = { b: null, nm: null }
    paintCourse = (b, nm) => {
      const changed = (lastCourse.b == null) !== (b == null)
        || (b != null && lastCourse.b != null && Math.abs(b - lastCourse.b) > 3)
        || (nm != null && lastCourse.nm != null && Math.abs(nm - lastCourse.nm) > 80)
      if (!changed) return
      lastCourse = { b, nm }
      paintChart(b, nm)
    }
    // 凳子
    // 接触暗部：舱内没有阴影贴图，家具与地板之间必须有一点暗，否则全是"贴纸"
    addShadow(cabin, 0, -halfH + 0.012, 0.15, 1.05, 0.72)
    const stool = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.46, 8), tableMat)
    stool.position.set(0.95, -halfH + 0.23, 0.1)
    addShadow(cabin, 0.95, -halfH + 0.012, 0.1, 0.3, 0.3)
    cabin.add(stool)
    // 卷起来的备用海图（两根纸筒）：用羊皮纸色的 Lambert（与桌上的图同一个色系）
    const rollMat = new THREE.MeshLambertMaterial({ color: 0xa89268 })
    disposables.push(rollMat)
    for (const [cx, cz] of [[-0.62, 0.55], [-0.5, 0.66]] as const) {
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), rollMat)
      roll.rotation.z = Math.PI / 2
      roll.position.set(cx, topY + 0.09, cz)
      cabin.add(roll)
    }

    /*
     * ---- 床铺 / 箱子 / 挂灯 ----
     * 床靠左舷（+x 是左舷）：铺盖用暗红，与全船的棕调区分开，一眼能认出"那是床"。
     */
    const bunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2a24, roughness: 0.95 })
    addShadow(cabin, 2.3, -halfH + 0.012, 0.2, 0.55, 1.15)
    const bunk = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.3, 2.1), tableMat)
    bunk.position.set(2.3, -halfH + 0.55, 0.2)
    cabin.add(bunk)
    const bedding = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.16, 1.95), bunkMat)
    bedding.position.set(2.3, -halfH + 0.76, 0.2)
    cabin.add(bedding)
    disposables.push(bunkMat)
    addShadow(cabin, -2.3, -halfH + 0.012, -1.35, 0.6, 0.42)
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.5, 0.6), tableMat)
    chest.position.set(-2.3, -halfH + 0.25, -1.35)
    cabin.add(chest)
    for (const oy of [-0.18, 0.18]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.99, 0.05, 0.64), ironMat)
      band.position.set(-2.3, -halfH + 0.25 + oy, -1.35)
      cabin.add(band)
    }

    /*
     * 挂灯：舱里唯一的光源。**必须在夜里亮、白天暗**（与甲板的灯同一套 litK 逻辑），
     * 否则正午的舱内会有一团无来源的暖光。
     * 点光的 distance 是**世界单位**，船缩了 0.05 —— 4 米要写 0.2，写 4 会照亮整条船。
     */
    /*
     * 挂灯用**内联的几件几何**，不复用甲板那盏 `makeLantern` —— 那个函数定义在文件
     * 更下面（船尾楼这一段在它之前），直接调用会报"used before declaration"。
     * 玻璃复用 `windowMat`：它已经挂在 `warmMats` 里，白天自动暗下去。
     */
    const lanternIn = new THREE.Group()
    /*
     * 位置从正中的 (0, …, −0.55) 挪到右舷：舱里那盏灯正好吊在**中间那扇艉窗**前面，
     * 点光在窗玻璃（roughness 0.35）上打出一团白色高光，读作"窗里有个太阳"
     * （实测截图）。挪开 1 米，高光就不在窗上了。
     */
    lanternIn.position.set(-1.05, halfH - 0.62, -0.1)
    {
      const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 5), brassMat)
      hook.position.y = 0.2
      lanternIn.add(hook)
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.07, 8), brassMat)
      cap.position.y = 0.1
      lanternIn.add(cap)
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.17, 8), windowMat)
      glass.position.y = -0.01
      lanternIn.add(glass)
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 8), brassMat)
      base.position.y = -0.1
      lanternIn.add(base)
    }
    cabin.add(lanternIn)
    /*
     * 灯色 0xffb066 → 0xffd7b2：纯暖橙会把整间屋子染成同一种橙（没有色相变化，
     * 木墙、床、桌子糊成一片）。偏白的暖光才让"木色/红铺盖/浅海图"分得开。
     */
    /*
     * decay = 0（不是 2）。three 的物理点光是**平方反比**，而船缩了 0.05：
     * 灯到桌面只有 0.065 世界单位 → 1/0.065² ≈ 236 倍，桌面直接被照成纯白
     * （实测截图：木桌与海图糊成一块米色板）。室内照明在这里要的是"均匀铺一层"，
     * 不是物理照度 —— decay=0 + distance 截断就是可用的那一种。
     */
    const cabinLight = new THREE.PointLight(0xffd7b2, 0.62, 0.3, 0)
    cabinLight.position.set(-1.05, halfH - 0.85, -0.1)
    cabin.add(cabinLight)
    /*
     * 【舱灯不能跟甲板的灯一样"白天熄"】室外有天空、有反弹光，室内没有：
     * 只靠三扇艉窗的直射光，白天的舱内是一团深棕（实测截图：家具有没有都看不清）。
     * 所以它单独一条曲线 —— 白天 0.45、夜里 1.0，读作"舱里那盏灯一直亮着"。
     */
    cabinLamp = cabinLight
    /*
     * 艉窗那一侧的冷光：舱里唯一的"外面的光"。没有它，整间屋子只有一盏暖灯 ——
     * 所有东西同一个色相（实测截图）。冷光只给一点，作用是拉开层次，不是照明。
     */
    const windowLight = new THREE.PointLight(0x9fc0e0, 0.4, 0.34, 0)
    // 也要离开窗轴：贴在中间那扇窗正前方时，点光会在玻璃上留一个小白点
    windowLight.position.set(-1.9, 1.02, -halfD + 1.3)
    cabin.add(windowLight)
    cabinWindowLamp = windowLight
  }

  /*
   * ---------------- 艉灯（stern lantern） ----------------
   *
   * 【为什么它值得单独做一盏】真实帆船的船尾挂一盏（或三盏）灯 —— 那是夜里
   * 从后面判断"这是一条船、朝哪走"的唯一信号。我们的船尾原来只有六扇窗，
   * 从船后看过去是"一排亮窗"，缺一个明确的光源标志。
   *
   * 做法与甲板的灯笼同一套（`warmMats` / `warmGlows` / `warmLights`），
   * 所以白天它会自动暗下去（`litK` 那条曲线），不需要另写一份日夜判断。
   */
  {
    const lantern = new THREE.Group()
    lantern.name = 'ship-stern-lantern'
    /*
     * 位置：船尾楼**顶上 1.1 米**、后壁外一点。
     * 【为什么不是挂在后壁侧面】第一版挂在楼顶后方 0.65 米，从船后上方看，楼顶
     * 正好挡住它的一半 —— 只露出一个橘点（实测截图）。挂到楼顶之上 1.1 米之后，
     * 从任何俯角它都在"船尾最高处"，与真实艉灯的位置一致。
     */
    lantern.position.set(0, shipDeckAt(-14.6) + 4.0, -17.45)
    // 竖杆：从楼顶伸上来（灯笼是"立在船尾最高处"，不是斜挑出去的）
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, 1.3, 6), brassMat)
    pole.position.set(0, -0.42, 0.12)
    lantern.add(pole)
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.2, 8), brassMat)
    cap.position.y = 0.26
    lantern.add(cap)
    // 玻璃：复用 windowMat（它已经在 warmMats 里，白天 0.03、夜里 1）
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.46, 8), windowMat)
    glass.position.y = 0
    lantern.add(glass)
    // 四根铜棱：让灯笼不是一根圆柱
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.48, 0.026), brassMat)
      bar.position.set(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18)
      lantern.add(bar)
    }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.07, 8), brassMat)
    base.position.y = -0.27
    lantern.add(base)
    // 光晕：与甲板灯笼同一张 sprite（加法混合）
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffa64e, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }))
    glow.scale.setScalar(3.2)
    glow.position.y = 0
    lantern.add(glow)
    warmGlows.push(glow)
    // 点光：照船尾那一小块甲板（distance 是**世界单位**，船缩了 0.05）
    const lamp = new THREE.PointLight(0xffb066, 0.55, 0.5, 2)
    lamp.position.y = 0.02
    lantern.add(lamp)
    warmLights.push({ light: lamp, base: 0.55 })
    group.add(lantern)
  }

  /*
   * ---------------- 护舷木条（rubbing strake） ----------------
   *
   * 【它是什么】船壳外侧、水线以上的一条凸出的水平木条 —— 靠岸、靠码头、与
   * 别的船并排时，撞的是它而不是船壳板。几乎每一条老商船都有，而且是"这条船
   * 用过很多年"最直观的一笔（船体上多了一条硬朗的水平线）。
   *
   * 几何与湿痕带同一套做法（沿船体截面反解 x），只是更窄、更凸出（外扩 2.5%
   * ≈ 10 厘米），用不透明的深木色 —— 它必须是"实心的木条"，不能是半透明贴片。
   */
  {
    const strakeMat = new THREE.MeshLambertMaterial({ color: 0x3d2a18 })
    disposables.push(strakeMat)
    /*
     * 高度：水线以上 2.05~2.3 米（船体偏上、甲板下方 1 米多）。
     * 【为什么不贴水线】第一版放在水线以上 1.4 米 —— 那里正好是湿痕带（0.9~2.4 米）
     * 的范围，两条带子叠在一起，画面上只剩一条模糊的灰带（实测截图）。
     * 挪到湿痕之上，它才是一条**独立**的硬朗水平线。
     */
    const S_TOP = WATERLINE_Y_M + 2.3
    const S_BOT = WATERLINE_Y_M + 2.05
    for (const side of [-1, 1]) {
      const pos: number[] = []
      const idx: number[] = []
      for (let i = 0; i <= WAKE_SEGMENTS; i++) {
        const t = i / WAKE_SEGMENTS
        const z = SHIP_HALF_LENGTH * 0.955 - SHIP_HALF_LENGTH * 1.89 * t
        pos.push(side * hullHalfWidthAtY(z, S_BOT) * 1.025, S_BOT, z)
        pos.push(side * hullHalfWidthAtY(z, S_TOP) * 1.025, S_TOP, z)
        if (i < WAKE_SEGMENTS) {
          const a = i * 2
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
        }
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      g.setIndex(idx)
      g.computeVertexNormals()
      const m = new THREE.Mesh(g, strakeMat)
      m.name = `ship-strake-${side > 0 ? 'port' : 'stbd'}`
      group.add(m)
      disposables.push(g)
    }
  }

  group.add(cabin)

  // ---------------- 船尾回廊 ----------------
  const gallery = new THREE.Group()
  const gy = sternDeck + 0.32
  const gz = -17.5
  const platform = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.22, 1.5), woodDark)
  platform.position.set(0, gy, gz)
  gallery.add(platform)
  const railBar = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.12, 0.16), woodMid)
  railBar.position.set(0, gy + 1.05, gz - 0.62)
  gallery.add(railBar)
  for (const gx of [-3.2, -2.1, -1.0, 0, 1.0, 2.1, 3.2]) {
    const bal = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.05, 6), woodMid)
    bal.position.set(gx, gy + 0.52, gz - 0.62)
    gallery.add(bal)
  }
  for (const gx of [-3.3, 3.3]) {
    const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.05, 4, 10, Math.PI), brassMat)
    scroll.position.set(gx, gy + 0.6, gz - 0.4)
    scroll.rotation.y = Math.PI / 2
    gallery.add(scroll)
  }
  const transomGold = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.1, 0.08), brassMat)
  transomGold.position.set(0, sternDeck + 2.62, -17.24)
  gallery.add(transomGold)
  group.add(gallery)

  // ---------------- 甲板上的可点物件 ----------------
  /*
   * 【为什么要有它们】船上视角原本是一段"能走但没有东西"的过场：玩家在甲板上
   * 走一圈，除了看什么也做不了。真实船上最常被摸的两件东西就是**货舱口**与
   * **舵轮** —— 它们正好对应玩家最关心的两组数（载了什么、往哪走）。
   * 点开的不是文案，而是当前这一局的真实数字（见 DeckView 的 `DeckHotspot`）。
   */
  const hatch = new THREE.Group()
  hatch.name = 'ship-hatch-group'
  hatch.position.set(0.4, shipDeckAt(5.6) + 0.03, 5.6)
  {
    // 舱口围板（coaming）+ 格栅：四根边梁 + 8 根横条
    const coamingMat = woodDark
    for (const [ox, oz, w, d] of [[0, -1.15, 3.0, 0.22], [0, 1.15, 3.0, 0.22], [-1.4, 0, 0.22, 2.3], [1.4, 0, 0.22, 2.3]] as const) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, d), coamingMat)
      bar.position.set(ox, 0.13, oz)
      hatch.add(bar)
    }
    for (let i = 0; i < 8; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.1, 0.16), woodMid)
      slat.position.set(0, 0.2, -0.92 + i * 0.26)
      hatch.add(slat)
    }
    // 格栅下面是一条黑：近看才读得出"这是个洞"，不是一块板
    const dark = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 2.2),
      new THREE.MeshBasicMaterial({ color: 0x0a0705 }),
    )
    dark.rotation.x = -Math.PI / 2
    dark.position.y = 0.11
    hatch.add(dark)
    /* 命中体：格栅本身是 8 根细条，点击很难命中 —— 用一个透明的扁盒子兜住整块区域 */
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(3.0, 0.4, 2.4),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    hit.name = 'ship-hatch'
    hit.position.y = 0.16
    hatch.add(hit)
  }
  // 舱口：占地 3.0×2.4，阴影略大一圈（光总有一点绕射）
  addShadow(group, 0.4, shipDeckAt(5.6) + 0.05, 5.6, 1.85, 1.5)
  group.add(hatch)

  /*
   * 舵轮：站到船尾才看得见。两圈轮缘 + 8 根辐条 + 铜毂 + 立柱，尺寸按真舵轮
   * （轮径 1.5 米）来 —— 它必须比手大得多，玩家才知道"这是要两个人转的东西"。
   */
  const wheel = new THREE.Group()
  wheel.name = 'ship-wheel-group'
  /*
   * 【舵轮曾经埋在船尾楼的墙里】船尾楼（cabin）中心 z=−14.6、进深 5.2，于是它的
   * **前壁在 z=−12.0**；而舵轮原来摆在 z=−12.2 —— 整整 20 厘米在墙里面，只留
   * 半个轮缘露在外面。从甲板回头看，那里只有一块黑方板，"舵轮"根本读不出来
   * （实测截图）。挪到 −10.9：塔前留 1.1 米，正好是舵手站的位置。
   */
  wheel.position.set(0, shipDeckAt(-10.9) + 0.03, -10.9)
  {
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.5), woodDark)
    stand.position.y = 0.55
    wheel.add(stand)
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.9, 8), woodMid)
    column.position.set(0, 1.5, 0)
    wheel.add(column)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.34, 10), brassMat)
    hub.position.set(0, 1.95, 0)
    hub.rotation.x = Math.PI / 2
    wheel.add(hub)
    // 轮缘：内外两圈（真舵轮的轮缘是拼木的，两圈之间是辐条）
    for (const r of [0.72, 0.62]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.055, 6, 24), woodMid)
      ring.position.y = 1.95
      wheel.add(ring)
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.07), woodMid)
      spoke.position.set(Math.cos(a) * 0.36, 1.95 + Math.sin(a) * 0.36, 0)
      spoke.rotation.z = a - Math.PI / 2
      wheel.add(spoke)
      // 手柄：辐条伸出轮缘的那一小截
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 6), brassMat)
      handle.position.set(Math.cos(a) * 0.82, 1.95 + Math.sin(a) * 0.82, 0)
      handle.rotation.z = a
      wheel.add(handle)
    }
    /*
     * 命中盒 1.9 → 1.6×1.5：舵轮的直径只有 1.44，原来那个 1.9 的方盒**向下探出**
     * 到船尾楼舱门的高度，于是点舱门正中会被舵轮抢走（射线实测：
     * `ship-wheel@0.083` 排在 `ship-cabin-door@0.158` 前面）。盒子按轮盘的实际
     * 尺寸收，两者才分得开。
     */
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.5, 0.5),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    hit.name = 'ship-wheel'
    hit.position.y = 1.95
    wheel.add(hit)
  }
  addShadow(group, 0, shipDeckAt(-10.9) + 0.05, -10.9, 0.7, 0.55)
  group.add(wheel)
  // 舵轮要能被逐帧转动（改航向时的回执），所以单独留一个引用
  const wheelSpinner = wheel

  /*
   * ---------------- 甲板上的水手 ----------------
   *
   * 【为什么这轮加人】前几轮把船做得很细（帆、索具、舱口、舵轮、灯火），但它是
   * **一条没人的船**：所有该由人做的动作（掌舵、看货、望路）都只有物件自己在动。
   * 三个人站在三个岗位上，甲板立刻从"模型"变成"有人的地方"，而且他们的位置本身
   * 就在指路：轮盘边的人在掌舵、舱口边的人在清点、船首的人在望。
   *
   * 【为什么不做走路动画】走路要骨骼/IK，成本远高于收益；而且**站定的人**在船上
   * 才是常态（水手大多在某个位置干某件事）。这里只做极轻的呼吸式摇晃（振幅 1cm、
   * 三人相位不同），让它不像三尊雕塑。
   *
   * 【几何全部共享】三个人的腿/躯干/头/手臂是同一批 geometry 与材质，只有 Group
   * 不同 —— 18 个 mesh 但只有 6 份几何。
   */
  /*
   * 配色与比例（第一版是"一枚深色棋子"，实测放大截图：一根黑柱子顶着一个球）：
   *  · 上衣 0x2a3242 → 0x39425a：ACES 下深蓝会压成纯黑，抬一档才看得出是件衣服；
   *  · 躯干窄到 0.36，手臂外移到 ±0.245 —— 第一版手臂贴着躯干，整块糊成一个方箱；
   *  · 腿从"一根细棍"改成两条（间隙 ±0.12、半径 0.085）+ 一双靴子；
   *  · 加一条浅色腰带：人眼在这个尺寸上认"人"靠的就是腰线，不是脸。
   */
  const sailorMat = new THREE.MeshStandardMaterial({ color: 0x39425a, roughness: 0.94, metalness: 0.02 })
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x9a7150, roughness: 0.86 })
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.9 })
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x6b5232, roughness: 0.9 })
  const legGeo = new THREE.CylinderGeometry(0.076, 0.09, 0.76, 6)
  const bootGeo = new THREE.BoxGeometry(0.15, 0.1, 0.24)
  const torsoGeo = new THREE.BoxGeometry(0.36, 0.56, 0.24)
  const beltGeo = new THREE.BoxGeometry(0.38, 0.075, 0.26)
  const neckGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.09, 6)
  const headGeo = new THREE.SphereGeometry(0.112, 8, 6)
  /*
   * 手臂几何**下移到肩在原点**：这样 `rotation.x` 是绕肩摆，而不是绕手臂中点
   * （绕中点转会把下半截甩到身后，看着像折了）。肩高 = 躯干上缘（1.33）。
   */
  const armGeo = new THREE.CylinderGeometry(0.062, 0.072, 0.56, 5)
  armGeo.translate(0, -0.28, 0)
  const hatGeo = new THREE.CylinderGeometry(0.132, 0.122, 0.1, 8)
  disposables.push(sailorMat, skinMat, hatMat, beltMat, legGeo, bootGeo, torsoGeo, beltGeo, neckGeo, headGeo, armGeo, hatGeo)

  /** 上身组（绕髋部前倾）：呼吸摇晃也要动它 */
  const sailorUppers: THREE.Group[] = []
  /** 每人 [左臂, 右臂]（小动作改它们的 rotation.x） */
  const sailorArms: THREE.Mesh[][] = []
  /** 每人的头组（头 + 帽子，小动作改它的俯仰） */
  const sailorHeads: THREE.Group[] = []
  const sailors: THREE.Group[] = []
  for (const st of SAILOR_STATIONS) {
    const pose = SAILOR_POSES[st.kind]
    const g = new THREE.Group()
    g.name = `ship-sailor-${st.kind}`
    g.position.set(st.x, shipDeckAt(st.z), st.z)
    g.rotation.y = st.yaw
    // 腿 + 靴：两根分开站，脚底在 y=0（甲板面）。腿不参与姿态（模型没有膝关节）
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, hatMat)
      leg.position.set(sx * 0.115, 0.38, 0)
      g.add(leg)
      const boot = new THREE.Mesh(bootGeo, hatMat)
      boot.position.set(sx * 0.115, 0.05, 0.03)
      g.add(boot)
    }
    /*
     * 上身从**髋部**起算：upper 的原点在 y=0.76（髋），绕 x 转 = 弯腰。
     * 所有上身部件都相对它摆放，于是"前倾"会把头、肩、手一起带走 —— 这才是人
     * 弯腰的样子（第一版没有这一层，只能整个 group 转，脚也跟着离地）。
     */
    const upper = new THREE.Group()
    upper.position.set(0, 0.76, 0)
    upper.rotation.x = pose.lean
    g.add(upper)
    const dy = -pose.sink
    // 躯干：略窄的方箱（人不是圆桶），上缘对齐肩
    const torso = new THREE.Mesh(torsoGeo, sailorMat)
    torso.position.set(0, 0.32 + dy, 0)
    upper.add(torso)
    // 腰带：这个尺寸上"人"是靠腰线认出来的
    const belt = new THREE.Mesh(beltGeo, beltMat)
    belt.position.set(0, 0.06 + dy, 0)
    upper.add(belt)
    /*
     * 手臂与头都要留引用：小动作（`sailorIdle`）每帧改的是**它们的角度**。
     */
    const arms: THREE.Mesh[] = []
    for (const [sx, ax, az] of [
      [-1, pose.armLX, pose.armLZ],
      [1, pose.armRX, pose.armRZ],
    ] as const) {
      const arm = new THREE.Mesh(armGeo, sailorMat)
      arm.position.set(sx * 0.245, 0.57 + dy, 0.01)
      arm.rotation.x = ax
      arm.rotation.z = az
      upper.add(arm)
      arms.push(arm)
    }
    // 脖子：一小截，头才不会直接坐在肩上
    const neck = new THREE.Mesh(neckGeo, skinMat)
    neck.position.set(0, 0.64 + dy, 0)
    upper.add(neck)
    /*
     * 头 + 帽子放进一个 head 组。
     *
     * 【为什么必须成组】`SAILOR_POSES.headTilt` 一直在表里躺着，但**从来没被应用**
     * （注释写着"弯腰之后再低头脸会埋进胸口"，代码里却没人读这个数）——
     * 这一轮补上。帽子必须跟着头转，否则"头低了帽子还悬在空中"，
     * 所以帽子是 head 组的子节点，而不是 upper 的子节点。
     */
    const headGroup = new THREE.Group()
    /*
     * 名字**不能以 `ship-sailor-` 开头**：e2e 用 `/^ship-sailor-/` 数甲板上站着
     * 几个人（人数必须等于 `sailorCount(crew)`），头组一多算，那条判据就从
     * "2 个"变成"5 个"—— 这是加头组时当场踩到的假红。
     */
    headGroup.name = `ship-head-${st.kind}`
    headGroup.position.set(0, 0.74 + dy, 0.01)
    headGroup.rotation.x = pose.headTilt
    upper.add(headGroup)
    const head = new THREE.Mesh(headGeo, skinMat)
    headGroup.add(head)
    // 帽子：一顶矮圆帽，从远处也能认出"这是个人"
    const hat = new THREE.Mesh(hatGeo, hatMat)
    hat.position.set(0, 0.10, 0)
    headGroup.add(hat)
    sailorUppers.push(upper)
    sailorArms.push(arms)
    sailorHeads.push(headGroup)
    /*
     * 水手也参与"能不能点"？**不参与**。甲板上可点的三件东西（舱口 / 舵轮 / 瞭望台）
     * 各自对应一组真实数字；点一个人却只能说一句废话，那会稀释另外三个的意义。
     */
    // 脚下那圈暗部：没有它，人像"贴在甲板上的一张纸"
    addShadow(g, 0, 0.008, 0.06, 0.42, 0.34)
    group.add(g)
    sailors.push(g)
  }

  /** 当前露出的水手数（默认 3，DeckView 每帧用真实船员数覆盖） */
  let crewShown = -1

  /*
   * ---------------- 甲板零碎：系缆桩 / 盘好的缆绳 / 木桶 ----------------
   * 站到甲板上时，三米以内的地面原本空得发慌（只有木纹）。这些零碎不参与玩法，
   * 但它们给了**尺度参照**：一根缆桩的高度、一只桶的体积，让"人眼 1.7 米"有了
   * 可比较的东西，甲板才不是一块无限大的地板。
   */
  {
    // 系缆桩：沿舷墙内侧一排小木桩（控帆索就拴在这上面）
    const pinGeo = new THREE.CylinderGeometry(0.055, 0.075, 0.62, 6)
    for (const sgn of [-1, 1]) {
      for (let k = 0; k < 9; k++) {
        const z = -10 + k * 2.4
        const x = sgn * (shipDeckHalfWidthAt(z) - 0.12)
        const pin = new THREE.Mesh(pinGeo, woodMid)
        pin.position.set(x, shipDeckAt(z) + 0.4, z)
        pin.rotation.x = sgn * 0.16
        group.add(pin)
      }
    }
    // 盘在甲板上的缆绳：三圈大小不同的环，层层叠起来才像"盘好的"
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x6a5a3c, roughness: 0.95 })
    for (const [r, y] of [[0.62, 0.06], [0.48, 0.13], [0.32, 0.19]] as const) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(r, 0.075, 5, 20), ropeMat)
      coil.position.set(-1.5, shipDeckAt(-2.6) + y, -2.6)
      coil.rotation.x = Math.PI / 2
      group.add(coil)
    }
    addShadow(group, -1.5, shipDeckAt(-2.6) + 0.05, -2.6, 0.8, 0.8)
    // 两只木桶（箍是深色的一圈，近看才有"桶"而不只是"圆柱"）
    for (const [bx, bz] of [[1.7, 2.4], [2.1, 1.2]] as const) {
      addShadow(group, bx, shipDeckAt(bz) + 0.05, bz, 0.5, 0.5)
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.28, 0.82, 10), woodMid)
      barrel.position.set(bx, shipDeckAt(bz) + 0.41, bz)
      group.add(barrel)
      /*
       * 桶盖：单独一片端面木色。整只桶用同一个材质时，俯视看到的顶盖会因为法线
       * 朝上、只吃到半球光的冷色而读成一块黑圆片（放大截图）。端面用更浅的木色，
       * 与桶身形成"盖子 vs 桶板"的对比。
       */
      const lid = new THREE.Mesh(
        new THREE.CylinderGeometry(0.345, 0.345, 0.05, 10),
        new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.95 }),
      )
      lid.position.set(bx, shipDeckAt(bz) + 0.8, bz)
      group.add(lid)
      for (const hy of [-0.22, 0.22]) {
        const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.028, 4, 12), ironMat)
        hoop.position.set(bx, shipDeckAt(bz) + 0.41 + hy, bz)
        hoop.rotation.x = Math.PI / 2
        group.add(hoop)
      }
    }
  }

  // 绞盘：主桅后面一个，纯装饰（但它是"甲板上有活儿"的信号）
  {
    const capstan = new THREE.Group()
    capstan.position.set(0, shipDeckAt(3.4) + 0.03, 3.4)
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.95, 10), woodMid)
    drum.position.y = 0.48
    capstan.add(drum)
    for (let i = 0; i < 6; i++) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 5), woodDark)
      bar.position.y = 0.82
      bar.rotation.z = Math.PI / 2
      bar.rotation.y = (i / 6) * Math.PI * 2
      capstan.add(bar)
    }
    group.add(capstan)
  }

  // ---------------- 灯笼 ----------------
  const lanternPivots: THREE.Group[] = []
  const makeLantern = (scale: number, withLight: boolean): THREE.Group => {
    const pivot = new THREE.Group()
    const body = new THREE.Group()
    body.position.y = -0.55
    pivot.add(body)
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x3a2408, emissive: 0xffa64e, emissiveIntensity: 1.15, roughness: 0.45 })
    warmMats.push(glassMat)
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 0.9, 8), glassMat)
    body.add(glass)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.95, 0.035), ironMat)
      bar.position.set(Math.cos(a) * 0.46, 0, Math.sin(a) * 0.46)
      body.add(bar)
    }
    const topRing = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.032, 4, 10), ironMat)
    topRing.rotation.x = Math.PI / 2
    topRing.position.y = 0.49
    body.add(topRing)
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 4, 8, Math.PI), ironMat)
    handle.position.y = 1.0
    body.add(handle)
    const capTop = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.5, 8), brassMat)
    capTop.position.y = 0.68
    body.add(capTop)
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.46, 0.16, 8), brassMat)
    base.position.y = -0.53
    body.add(base)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xffb060,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.48,
      toneMapped: false,
    }))
    glow.scale.setScalar(1.6)
    body.add(glow)
    warmGlows.push(glow)
    if (withLight) {
      /*
       * 【distance 是世界单位，**不随 group.scale 缩放**】
       * 船整体缩到 0.05，但灯光参数不会跟着缩：写 7 就意味着"照亮 7 个世界单位"，
       * 整条船（1.8 单位）全在暖光里 —— 实测帆被染成橙色木板。
       * 现在给 0.5：只照亮船尾楼与灯笼周围一小圈。
       */
      const l = new THREE.PointLight(0xffb066, 0.5, 0.5, 2)
      body.add(l)
      warmLights.push({ light: l, base: 0.5 })
    }
    pivot.scale.setScalar(scale)
    lanternPivots.push(pivot)
    return pivot
  }

  // 回廊两端各一盏（带一盏实体光）
  ;[-3.05, 3.05].forEach((gx, i) => {
    const bracket = new THREE.Group()
    bracket.position.set(gx, gy + 1.75, gz - 0.55)
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 5), ironMat)
    arm.rotation.z = Math.PI / 2
    arm.position.x = gx > 0 ? -0.35 : 0.35
    bracket.add(arm)
    // 尺寸 1.4：3.4 时灯笼比船尾楼还大（4 倍放大实测：像两个挂在船外的大灯球）
    bracket.add(makeLantern(1.4, i === 1))
    gallery.add(bracket)
  })

  // ---------------- 桅杆 / 帆桁 ----------------
  const mastData = [
    { z: 11, baseDeck: shipDeckAt(11), top: 23 },
    { z: 1, baseDeck: shipDeckAt(1), top: 28 },
    { z: -8, baseDeck: shipDeckAt(-8), top: 19 },
  ]
  for (const m of mastData) {
    const h = m.top - m.baseDeck
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.36, h, 8, 1), mastMat)
    mast.name = `ship-mast-${m.z}`
    mast.position.set(0, m.baseDeck + h / 2, m.z)
    group.add(mast)
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.6, 5), mastMat)
    tip.position.set(0, m.top + 0.7, m.z)
    group.add(tip)
  }

  /*
   * ---------------- 主桅顶的长三角旗（pennant） ----------------
   *
   * 【为什么是三角旗、为什么在主桅】方旗（旗面宽高比接近 1）在远处只是一个色块，
   * 而更长的三角旗**指向下风侧**：一眼就能读出"风往哪吹"。挂在主桅最高处是因为
   * 它是全船受风最干净的位置（不被帆与索具挡住），也正是真实帆船挂长旗的地方。
   *
   * 几何一次建好（三角旗：沿 x 收成一个尖），逐帧只改顶点的 z/y 偏移 ——
   * 偏移由 `deckFlag` 的纯函数给（旗根不动、旗尾甩得最凶、风小则垂下来）。
   */
  const flagGeo = new THREE.BufferGeometry()
  {
    const pos: number[] = []
    const idx: number[] = []
    const cols = FLAG_SEG_X + 1
    const rows = FLAG_SEG_Y + 1
    for (let iy = 0; iy < rows; iy++) {
      const v = (iy / FLAG_SEG_Y) * 2 - 1 // −1 上边 … +1 下边
      for (let ix = 0; ix < cols; ix++) {
        const u = ix / FLAG_SEG_X
        // 三角旗：半高随 u 线性收到 0（旗尾是一个尖）
        const halfH = (FLAG_BASE_H_M / 2) * (1 - u)
        pos.push(u * FLAG_LEN_M, v * halfH, 0)
      }
    }
    for (let iy = 0; iy < FLAG_SEG_Y; iy++) {
      for (let ix = 0; ix < FLAG_SEG_X; ix++) {
        const a = iy * cols + ix
        idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols)
      }
    }
    flagGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    flagGeo.setIndex(idx)
    flagGeo.computeVertexNormals()
    flagGeo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((cols * rows) * 2).fill(0), 2))
  }
  const flagBase = Float32Array.from(flagGeo.attributes.position.array as Float32Array)
  /*
   * 旗布用 Lambert + 两面可见：夜里它只是一个暗色的形状（正确 —— 灯照不到桅顶），
   * 白天它吃到天光。红底加一条浅色边是"船籍旗"最省的画法，两种颜色在远处就能分开。
   */
  const flagMat = new THREE.MeshLambertMaterial({
    color: 0x8f2b22, side: THREE.DoubleSide, emissive: 0x140806, emissiveIntensity: 0.5,
  })
  const flagMesh = new THREE.Mesh(flagGeo, flagMat)
  flagMesh.name = 'ship-pennant'
  const mainMast = mastData[1]
  flagMesh.position.set(0, mainMast.top + 2.05, mainMast.z)
  // 旗杆：一根细杆，旗子要有东西可挂
  const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.1, 5), mastMat)
  // 杆立在桅尖（top+0.7 ± 0.8 → 顶端 29.5）之上：29.5 ~ 30.6
  flagPole.position.set(0, mainMast.top + 2.3, mainMast.z)
  group.add(flagPole)
  // 旗子整体挂在一个 group 上：group 只负责按风向转，顶点在局部空间里被甩
  const flagPivot = new THREE.Group()
  flagPivot.name = 'ship-pennant-pivot'
  flagPivot.position.copy(flagMesh.position)
  flagMesh.position.set(0, 0, 0)
  flagPivot.add(flagMesh)
  group.add(flagPivot)
  disposables.push(flagGeo, flagMat)
  /*
   * 风的两个状态：`windTarget` 是 store 里的真值（每帧由 DeckView 写进来），
   * `flagWind` 是画面用的平滑值（一阶跟随）。风向做平滑不是为了好看 ——
   * 天气切换时 windDir 会跳，旗子若跟着跳会像"被人突然扯了一下"。
   */
  /**
   * 航迹的三个参数（强度 / 张角 / 船首浪长）。由 DeckView 每帧按 store 里的真实
   * 航行状态写进来 —— 系泊时强度只有 0.14、船首浪长度为 0（船首不该有 V 浪）。
   */
  const wakeState = { strength: 0.26, spread: 0.42, bowLen: 0, waveAmp: 1 }
  const windTarget = { bearing: Number.NaN, speed: Number.NaN }
  const flagWind = { bearing: Number.NaN, speed: Number.NaN }
  let lastFlagT = 0
  let flagNormalTick = 0
  /** 动索自己的帧间隔（转桁角的平滑用） */
  let lastRigT = 0
  /** 锚收放的平滑计时 */
  let lastAnchorT = 0

  /*
   * ---------------- 贴着船体的水沫带 + 船首 V 浪 ----------------
   *
   * 【为什么必须做】这一条补的是"船与海之间有交换"：船体把水推开，水在船侧留下
   * 一条断续的白沫。没有它，船是贴在画上的一片纸 —— 尤其从船后看，船体与海之间
   * 完全没有过渡。
   *
   * 【水面在哪里】船被抬高了 `SHIP_DRAFT_LIFT`（0.12 世界单位），而它本身随浪起伏
   * （`deckShipPose` 的 y），所以**水面在船体局部坐标里是个变动的常数**：
   *   y_local = −group.position.y / SHIP_SCALE
   * 每帧现算并写进 `wakeGroup.position.y`。第一版把它写死在 −2.4，于是船在浪上
   * 起伏时白沫带一会儿浮在半空、一会儿沉到水里（一帧对一帧错地闪）。
   */
  const foamTex = texFrom(foamStripCanvas())
  const foamMat = new THREE.MeshBasicMaterial({
    map: foamTex, transparent: true, opacity: 0.4, depthWrite: false,
    side: THREE.DoubleSide, color: new THREE.Color(0.95, 0.97, 1),
  })
  disposables.push(foamTex, foamMat)
  const wakeGroup = new THREE.Group()
  wakeGroup.name = 'ship-wake'
  group.add(wakeGroup)


  /*
   * ---------------- 水线带：下半白沫、上半湿痕（都贴在船壳上） ----------------
   *
   * 【为什么贴在船壳上、不画在水面上】泡沫带原来是水平铺在船侧的水面上，
   * 但两件事让它完全看不见：
   *   ① 从船后上方看船时，船侧的水面被**船体自己**挡住（涂红 + 关深度测试才
   *      确认它位置是对的）；
   *   ② 更致命的是浪：船体跟随浪高，而浪面的空间起伏是 ±0.13 世界单位
   *      （±2.6 模型米）——水平的一条带子必然一半在水下，被不透明海面切掉。
   * 改成贴在船壳外表面上就都解决了：它随船倾斜、永远在船体的可见面上，
   * 而且"泡沫爬到船壳上"本来就是真的（船在走时，白沫会沿着船壳往上溅）。
   *
   * 宽度用**模型米**但必须够大：1 世界单位 = 0.05 模型米，而 chase 机位在 12
   * 世界单位外 —— 0.65 米的带子在屏幕上只有 4 像素（第一版就是这样，量了世界
   * 坐标才发现"它在那儿，只是看不见"）。
   */
  {
    const WET_TOP_M = WATERLINE_Y_M + 2.4
    const FOAM_TOP_M = WATERLINE_Y_M + 0.9
    /*
     * 颜色 0x1a0f07 + opacity 0.5 → 压在深棕船壳上**完全看不出来**（实测：
     * 把同一个材质染成纯红才确认它一直都在、位置完全正确）。真实船的水线是深青绿
     * 的（水藻 + 湿木），换个色相才读得出来 —— 不是加深，是换色。
     */
    const wetMat = new THREE.MeshBasicMaterial({
      color: 0x2c3a32, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide,
    })
    disposables.push(wetMat)
    wetMatRef = wetMat
    for (const side of [-1, 1]) {
      // ① 湿痕（深色，水线往上 1.7 米）
      {
        const pos: number[] = []
        const idx: number[] = []
        for (let i = 0; i <= WAKE_SEGMENTS; i++) {
          const t = i / WAKE_SEGMENTS
          const z = SHIP_HALF_LENGTH * 0.96 - SHIP_HALF_LENGTH * 1.9 * t
          // 1.012 = 贴船壳外侧 1.2%（约 5 厘米），太低会与船壳 z-fighting
          pos.push(side * hullHalfWidthAtY(z, FOAM_TOP_M) * 1.012, FOAM_TOP_M, z)
          pos.push(side * hullHalfWidthAtY(z, WET_TOP_M) * 1.012, WET_TOP_M, z)
          if (i < WAKE_SEGMENTS) {
            const a = i * 2
            idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
          }
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        g.setIndex(idx)
        const m = new THREE.Mesh(g, wetMat)
        m.name = `ship-wetline-${side > 0 ? 'port' : 'stbd'}`
        m.raycast = () => {}
        group.add(m)
        disposables.push(g)
      }
      // ② 白沫（贴在水线往上 0.55 米，用同一张泡沫贴图，uv 的 v 沿船长）
      {
        const pos: number[] = []
        const uv: number[] = []
        const idx: number[] = []
        for (let i = 0; i <= WAKE_SEGMENTS; i++) {
          const t = i / WAKE_SEGMENTS
          const z = SHIP_HALF_LENGTH * 0.96 - SHIP_HALF_LENGTH * 1.9 * t
          pos.push(side * hullHalfWidthAtY(z, WATERLINE_Y_M) * 1.014, WATERLINE_Y_M, z)
          pos.push(side * hullHalfWidthAtY(z, FOAM_TOP_M) * 1.014, FOAM_TOP_M, z)
          uv.push(0, t, 1, t)
          if (i < WAKE_SEGMENTS) {
            const a = i * 2
            idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
          }
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
        g.setIndex(idx)
        const m = new THREE.Mesh(g, foamMat)
        m.name = `ship-wake-side-${side > 0 ? 'port' : 'stbd'}`
        m.raycast = () => {}
        group.add(m)
        disposables.push(g)
      }
    }
  }

  /*
   * 船首 V 浪：两条从船首向外张开的梯形片。长度与张角由 `deckWake` 的纯函数给
   * （快船张角小、慢船张角大 —— 慢船把水慢慢挤到两边，快船把浪推到正前方）。
   * 几何按"1 单位长"建，运行时用 scale.z 拉伸，避免每帧重建。
   */
  const bowGroups: THREE.Group[] = []
  {
    const bw = 1.7
    const pos = [
      0, 0, 0, bw, 0, 0, 0, 0, -1,
      bw, 0, 0, bw * 0.18, 0, -1, 0, 0, -1,
    ]
    const uv = [0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1]
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.computeVertexNormals()
    disposables.push(g)
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group()
      pivot.name = `ship-bowwave-${side > 0 ? 'port' : 'stbd'}`
      pivot.position.set(side * 0.5, 0, SHIP_HALF_LENGTH * 0.9)
      pivot.rotation.y = -side * 0.4
      const m = new THREE.Mesh(g, foamMat)
      m.raycast = () => {}
      pivot.add(m)
      wakeGroup.add(pivot)
      bowGroups.push(pivot)
    }
  }

  /*
   * ---------------- 桅顶瞭望台（crow's nest / top） ----------------
   *
   * 【为什么是"主桅下桁之上"这个位置】这不是随便挑的高度：真实帆船的"桅盘"就
   * 架在下桅的桅头、下帆桁的正上方 —— 水手从绳梯爬到这里，再上桅顶。主桅下帆桁在
   * y=15，上帆帆脚在 17.9，所以 17.2 正好是那条缝。放在这里，抬头看是"桅杆中间
   * 多了一圈平台"，符合眼睛对帆船的记忆；放到桅顶反而成了旗杆上的鸟窝。
   *
   * 【它为什么值得存在】它是这条船上**第二个能点的地方**（第一个是舱口/舵轮），
   * 而它给的是"船上看不出来的信息"：最近的陆地在哪个方位、多远、天气在往哪走。
   * 玩家在甲板上是看不到这些的（镜头被舷墙挡住），只有爬上去才看得见 —— 这就是
   * "机制靠位置落地"，不是弹一段文案。
   */
  {
    const NEST_Y = 17.2
    const NEST_Z = 1
    const nest = new THREE.Group()
    nest.name = 'ship-crow-group'
    nest.position.set(0, NEST_Y, NEST_Z)
    /*
     * 平台：一圈略厚的圆盘。
     * 【为什么单独给它一个材质】从甲板往上看，看到的是**盘底** —— 它朝下、只吃环境光，
     * 借 woodMid 时读作"桅杆上挂了一只黑鼓"（实测截图：一个纯黑圆盘，栏杆全被它挡住）。
     * 给一点自发光把盘底托起来，再加一圈亮边的箍，它才是一个"木台"。
     */
    const nestMat = new THREE.MeshStandardMaterial({
      color: 0x6b4d30, roughness: 0.9, metalness: 0.04,
      emissive: 0x1d1409, emissiveIntensity: 0.55,
    })
    disposables.push(nestMat)
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.34, 1.12, 0.15, 12), nestMat)
    floor.position.y = 0
    nest.add(floor)
    // 盘沿的一道箍：从下面看是这条边在反天光，圆盘才有厚度
    const rimBand = new THREE.Mesh(new THREE.TorusGeometry(1.33, 0.055, 5, 18), nestMat)
    rimBand.rotation.x = Math.PI / 2
    rimBand.position.y = 0.055
    nest.add(rimBand)
    // 支撑梁：斜撑到下桅上（没有它那圈平台是"浮"在桅杆上的）
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), nestMat)
      brace.position.set(Math.cos(a) * 0.62, -0.6, Math.sin(a) * 0.62)
      brace.rotation.set(Math.sin(a) * 0.62, 0, -Math.cos(a) * 0.62)
      nest.add(brace)
    }
    // 栏杆：8 根立柱 + 一圈扶手（站着的人要扶得住东西）
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.78, 0.07), woodDark)
      post.position.set(Math.cos(a) * 1.36, 0.45, Math.sin(a) * 1.36)
      nest.add(post)
    }
    const rail = new THREE.Mesh(new THREE.TorusGeometry(1.36, 0.045, 5, 20), woodDark)
    rail.rotation.x = Math.PI / 2
    rail.position.y = 0.84
    nest.add(rail)
    /*
     * 命中体：栏杆是 8 根细柱 + 一根细环，点击几乎命不中 —— 用一个透明的扁盒子
     * 兜住整圈平台（与舱口/舵轮同一手法）。
     * 盒子比平台大一圈：玩家点到"平台附近"就该算点到，而不是必须精确戳中木条。
     */
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 1.5, 3.2),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    hit.name = 'ship-crow'
    hit.position.y = 0.42
    nest.add(hit)
    group.add(nest)
  }

  /*
   * 帆桁的高度表。
   *
   * 【为什么整组抬高】原表的最低帆（下桁）脚离甲板只有 1.6 米 —— 站到甲板上
   * 齐胸就是一块帆布墙，六张帆把整片天空糊死（实测截图：画面上一半是平涂的
   * 土黄，看不到桅、看不到天）。真实方帆船的下桁脚离甲板有 4~6 米（水手要在
   * 底下走动、绞盘、抬炮），所以这里把三张下帆抬到"脚离甲板 4.5~5.5 米"，
   * 上帆跟着上移，桅顶高度不变。结果：站在甲板上，帆在头顶、天在帆上方。
   */
  const yardData = [
    { z: 11, y: 13.6, len: 14.5, sailH: 6.4, sailW: 0.86, seed: 1 },
    { z: 11, y: 20.2, len: 10.0, sailH: 4.6, sailW: 0.84, seed: 2 },
    { z: 1, y: 15.0, len: 17.6, sailH: 8.0, sailW: 0.88, seed: 3 },
    { z: 1, y: 23.2, len: 12.2, sailH: 5.4, sailW: 0.86, seed: 4 },
    { z: -8, y: 12.4, len: 10.4, sailH: 5.6, sailW: 0.84, seed: 5 },
    { z: -8, y: 17.4, len: 7.0, sailH: 3.6, sailW: 0.82, seed: 6 },
  ]

  const sailTime = { value: 0 }
  const sailMats: THREE.MeshStandardMaterial[] = []
  /*
   * ---- 帆的透光（背光时布是亮的）----
   *
   * 【为什么需要】帆布是**薄的**。原来它只有漫反射：太阳/月亮在帆背后时，
   * 帆读作一块纯黑剪影（夜航尤其明显 —— 六张帆是六个黑三角，贴在星空上）。
   * 真实的帆在逆光下是"发亮的布"：光穿过经纬线，从缝里漏出来。
   *
   * 【怎么算】经典的单次散射近似：
   *   through = max(-dot(N, L), 0)     光从背面来多少
   *   facing  = |dot(N, V)|            视线穿过多厚的布（正对着看最亮）
   *   加法项 = uSailGlow * through * (0.3 + 0.7*facing)
   * 它只加到 emissive 上，不参与漫反射，所以**不会改变"光从哪来"的判断**。
   *
   * 两个 uniform 是所有帆共用的（同一个太阳/月亮），由 `setBacklight` 每帧写。
   */
  /** 舱内窗玻璃的两个端点色（白天 / 夜里） */
  const CABIN_GLASS_DAY = new THREE.Color(0x9fb6c8)
  const CABIN_GLASS_NIGHT = new THREE.Color(0x0a121c)
  /** 水线湿痕的两个端点色：白天是水藻绿、夜里接近黑 */
  const WET_DAY = new THREE.Color(0x2c3a32)
  const WET_NIGHT = new THREE.Color(0x0b110e)

  const sailLightDir = { value: new THREE.Vector3(-0.45, 0.42, -0.78).normalize() }
  const sailGlow = { value: new THREE.Color(0, 0, 0) }

  /**
   * 帆的材质 + 摆动。
   *
   * 【为什么要 onBeforeCompile 而不是 MeshStandardMaterial + morph】帆要"鼓着
   * 随风呼吸"，这是每帧顶点位移；用它自己的光照链（法线也要一起动）最省事。
   * 顶点着色器里同时改 position 与 normal，逆光时布面的明暗才跟着变。
   */
  const makeSailMaterial = (seed: number, flapAxis: THREE.Vector3, strength: number) => {
    const mat = new THREE.MeshStandardMaterial({
      map: sailTex,
      alphaMap: sailAlpha,
      alphaTest: 0.32,
      color: 0xf0e7cf,
      emissiveMap: sailTex,
      // 自发光偏冷、很弱：只保证背光面不是纯黑，不参与染色
      emissive: 0x141a20,
      emissiveIntensity: 0.28,
      side: THREE.DoubleSide,
      roughness: 0.92,
      metalness: 0,
    })
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = sailTime
      shader.uniforms.uSeed = { value: seed }
      shader.uniforms.uAxis = { value: flapAxis }
      shader.uniforms.uStrength = { value: strength }
      shader.uniforms.uLightDir = sailLightDir
      shader.uniforms.uSailGlow = sailGlow
      shader.vertexShader = `
        uniform float uTime; uniform float uSeed; uniform vec3 uAxis; uniform float uStrength;
        varying vec3 vSailN;
      ` + shader.vertexShader
        .replace('#include <beginnormal_vertex>', `
          #include <beginnormal_vertex>
          float senv = sin(uv.y * 3.14159) * (0.55 + 0.45 * sin(uv.x * 3.14159));
          objectNormal = normalize(objectNormal + uAxis * senv * 0.42);
          /*
           * 世界空间法线（**不按面翻转**）：透光要判"光在布的哪一侧"。
           * 片元里的 normal 会被 three 按 gl_FrontFacing 翻成朝相机的那一面，
           * 那样永远算不出逆光 —— 所以单独传一份原始朝向。
           */
          vSailN = normalize(mat3(modelMatrix) * objectNormal);
        `)
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float env = sin(uv.y * 3.14159) * (0.55 + 0.45 * sin(uv.x * 3.14159));
          float phase = uTime * 2.15 + uSeed + uv.x * 3.3 + uv.y * 1.2
            + sin(uv.y * 7.1 + uSeed * 3.1) * 0.55;
          float flap = sin(phase) * 0.55 + sin(phase * 2.4 + 1.1) * 0.18;
          float gust = sin(uTime * 0.37 + uSeed * 2.0 + uv.y * 4.0) * sin(uTime * 0.23 + uSeed * 1.3);
          transformed += uAxis * ((flap + 0.62) * 0.55 * env + gust * 0.10 * env) * uStrength;
          transformed += uAxis * (sin(uv.x * 3.14159) * 0.26) * uStrength;
          // 静态细褶：让光在布面上散开，避免整片平光
          transformed += uAxis * (sin(uv.x * 9.4 + uSeed * 5.0) * sin(uv.y * 5.7 + uSeed * 2.2) * 0.035) * uStrength;
        `)
      /*
       * 布面明暗：帆原本是一整块平涂的土黄（顶点都在动，但颜色没有层次，
       * 近看像一张纸）。这里加三件事，全部在 fragment 里按 uv 算，零成本：
       *   ① 边缘自遮挡：靠近帆桁（上缘）与两侧包边的地方压暗 —— 布是被绑住的，
       *      贴住绳边的那一圈本来就吃不到光；
       *   ② 纵缝：帆是几幅布拼的，缝线处一条浅阴影；
       *   ③ 帆脚透光：光从背后压过来，越靠下越亮一点。
       */
      shader.fragmentShader = `
        varying vec3 vSailN;
        uniform vec3 uLightDir;
        uniform vec3 uSailGlow;
      ` + shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        /*
         * 注意用 vMapUv 而不是 vUv：three 0.15x 之后每张贴图有**自己的** uv varying
         * （vMapUv / vAlphaMapUv ...），vUv 只在 USE_UV 时才有 —— 帆材质定义了
         * USE_MAP 但没有 USE_UV，写 vUv 会直接编译失败（实测：Fragment shader is
         * not compiled / 'vUv' undeclared，整块帆不渲染）。
         */
        float ex = smoothstep(0.0, 0.17, vMapUv.x) * smoothstep(0.0, 0.17, 1.0 - vMapUv.x);
        float ey = smoothstep(0.0, 0.10, vMapUv.y) * smoothstep(0.0, 0.24, 1.0 - vMapUv.y);
        diffuseColor.rgb *= 0.58 + 0.42 * min(ex, ey);
        float seam = abs(fract(vMapUv.x * 4.0 + 0.5) - 0.5);
        diffuseColor.rgb *= 1.0 - 0.16 * smoothstep(0.06, 0.0, seam);
        diffuseColor.rgb *= 1.0 + 0.16 * smoothstep(0.6, 0.0, vMapUv.y);
        // 布面整体有一点点自上而下的明暗（帆桁上沿最暗）
        diffuseColor.rgb *= 0.94 + 0.06 * smoothstep(0.0, 0.7, vMapUv.y);
      `)
        /*
         * 透光：加到 emissive 上（不参与漫反射）。`normal` 已经是**朝相机**的那一面、
         * `vViewPosition` 是片元→相机的视线（两者都在视空间），所以 |dot| 正好是
         * "视线穿过多少布"；`vSailN` 是原始朝向（世界空间），与 uLightDir 同空间。
         */
        .replace('#include <emissivemap_fragment>', `
          #include <emissivemap_fragment>
          float through = max(-dot(normalize(vSailN), uLightDir), 0.0);
          float facing = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
          /*
           * 乘 diffuseColor：透光要跟着布面自己的厚薄走 —— 包边（边缘 AO 0.58）、
           * 纵缝（0.84）、织纹都在这上面。**不乘它，六张帆就是六块均匀发亮的板**
           * （实测：帆面区域平均 54/61/65，整片没有一个明暗起伏，读作塑料）。
           */
          totalEmissiveRadiance += uSailGlow * through * (0.30 + 0.70 * facing) * diffuseColor.rgb * 1.25;
        `)
    }
    sailMats.push(mat)
    return mat
  }

  /*
   * ---------------- 帆桁 / 帆：挂在"可转"的枢轴上 ----------------
   *
   * 【为什么要多一层 pivot】转桁索把帆桁绕桅转（见 `deckRigging.braceYaw`）——
   * 桁和帆必须一起转。直接把帆的 rotation.y 写在 mesh 上是不行的：帆面在 z 上
   * 偏离桅杆 0.42 米（`SAIL_Z_OFF`），绕自己转会让整张帆平移出去；真正的转轴
   * 是**桅杆轴线**，所以 pivot 放在 (0, 桁高, 桅的 z)、桁与帆都塞进去。
   * 桁的世界坐标因此在 pivot 转角为 0 时与原来完全一致（名字、位置都不变）。
   */
  interface YardRig {
    /** 帆桁的 z（pivot 的中心，转轴） */
    z: number
    pivot: THREE.Group
    /** 桁臂半长（米，局部 +x） */
    armX: number
    /** 当前转桁角（平滑后的实际值，绳与帆共用这一个数） */
    yaw: number
    seed: number
    /** 左右两根帆脚索 */
    sheets: {
      side: 1 | -1
      attr: THREE.BufferAttribute
      arr: Float32Array
      /** 帆角（未转的局部坐标） */
      clew: { x: number; y: number; z: number }
      /**
       * 索尾：`yard >= 0` 时绑在那根**下桁的桁臂**上（上帆的脚索就是这么走的），
       * `yard < 0` 时绑在舷墙上。
       */
      anchorYard: number
      anchor: { x: number; y: number; z: number }
      seed: number
    }[]
    /** 两根转桁索（只有下桁有）：从桁臂拉到甲板后方 */
    braces: {
      side: 1 | -1
      attr: THREE.BufferAttribute
      arr: Float32Array
      tip: { x: number; y: number; z: number }
      anchor: { x: number; y: number; z: number }
    }[]
    /** 上下桁配对：本桁的上帆脚索要绑到的那根（−1 = 没有更低的桁） */
    lower: number
  }
  const yardRigs: YardRig[] = []
  /** 同一根桅上"更低的桁"的下标（上帆的脚索绑到它上面） */
  const lowerYardOf = (i: number) => {
    let best = -1
    for (let j = 0; j < yardData.length; j++) {
      if (j === i) continue
      if (yardData[j].z !== yardData[i].z) continue
      if (yardData[j].y >= yardData[i].y) continue
      if (best < 0 || yardData[j].y > yardData[best].y) best = j
    }
    return best
  }

  for (let yi = 0; yi < yardData.length; yi++) {
    const yd = yardData[yi]
    const pivot = new THREE.Group()
    pivot.position.set(0, yd.y, yd.z)
    pivot.name = `ship-yard-pivot-${yd.seed}`
    group.add(pivot)

    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, yd.len, 6), mastMat)
    yard.name = `ship-yard-${yd.seed}`
    yard.rotation.z = Math.PI / 2
    pivot.add(yard)

    const sw = yd.len * yd.sailW
    const sh = yd.sailH
    // 帆面：分段多一点，摆动才平滑（10×8 已经够）
    const sailGeo = new THREE.PlaneGeometry(sw, sh, 10, 8)
    // 鼓胀：沿 z 方向按 sin 剖面推出去，中间最鼓（顺风鼓帆）
    const pos = sailGeo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / (sw / 2)
      const y = pos.getY(i) / (sh / 2)
      /*
       * ① 鼓胀：沿 z 按 cos 剖面推出去，中间最鼓（顺风鼓帆）。
       * ② 收分（taper）：方帆上宽下窄 —— 帆顶绑在帆桁上、帆脚是自由的，
       *    两侧的边（leech）向内收一点，剪影才不是一块矩形布（侧看尤其明显：
       *    原来整张帆是一个规整的四边形，像挂在晾衣绳上的床单）。
       * ③ 帆脚弧（roach）：底边中间略微上收，布不会像被剪过一样平直。
       */
      const taper = 1 - SAIL_TAPER * (1 - (y + 1) / 2)
      pos.setX(i, pos.getX(i) * taper)
      const foot = y < -0.55 ? -0.06 * (1 - Math.abs(x)) * sh : 0
      pos.setZ(i, Math.cos(x * Math.PI * 0.5) * Math.cos(y * Math.PI * 0.5) * (sw * 0.11))
      pos.setY(i, pos.getY(i) + foot)
    }
    pos.needsUpdate = true
    sailGeo.computeVertexNormals()
    // 帆挂在帆桁下方：几何中心下移半个帆高（相对 pivot）
    const sail = new THREE.Mesh(sailGeo, makeSailMaterial(yd.seed, new THREE.Vector3(0, 0, 1), 1))
    sail.name = `ship-sail-${yd.seed}`
    sail.position.set(0, -sh / 2 - SAIL_DROP, SAIL_Z_OFF)
    pivot.add(sail)

    const rig: YardRig = {
      z: yd.z, pivot, armX: yd.len / 2, yaw: 0, seed: yd.seed,
      sheets: [], braces: [], lower: lowerYardOf(yi),
    }
    yardRigs.push(rig)
  }

  /*
   * ---------------- 动索：帆脚索（sheet）+ 转桁索（brace） ----------------
   *
   * 【为什么这一轮的绳才叫"动索"】静索（前后支索、侧支索）是结构，绑死不动；
   * 动索是**被操作**的：帆脚索拉紧帆脚，转桁索把帆桁绕桅转。船上视角里它们让
   * "风"这件事从旗子上的一个角度，变成"帆在追风、索在抽动"的连续动作。
   *
   * 【线的画法】`THREE.Line`（连续折线，不是 LineSegments）—— 一根索是一个整体，
   * 顶点每帧重写。`frustumCulled = false` 是必须的：动态顶点的包围球算在初始
   * （全 0）位置上，视锥剔除会把整根索剔掉（"绳都没了"，而且不报错）。
   */
  const mkRope = (color: number, opacity: number, n: number) => {
    const arr = new Float32Array((n + 1) * 3)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity })
    const line = new THREE.Line(g, m)
    line.frustumCulled = false
    group.add(line)
    disposables.push(g, m)
    return { line, g, m, attr: g.attributes.position as THREE.BufferAttribute, arr }
  }
  for (let yi = 0; yi < yardRigs.length; yi++) {
    const rig = yardRigs[yi]
    const yd = yardData[yi]
    const sw = yd.len * yd.sailW
    const sh = yd.sailH
    for (const side of [-1, 1] as const) {
      const clew = sailClew(sw, sh, yd.y, yd.z, side)
      /*
       * 索尾绑在哪：
       *  · 上帆（有下桁）：绑在**下桁的桁臂**上 —— 真实的脚索就是这么走的，
       *    直接从 8 米高的帆角拉到舷边会穿过下帆（穿模）。
       *  · 下帆：拉到后方 3.4 米的舷墙内侧。
       */
      let anchorYard = -1
      let anchor: { x: number; y: number; z: number }
      if (rig.lower >= 0) {
        const lo = yardData[rig.lower]
        anchorYard = rig.lower
        anchor = { x: side * (lo.len / 2) * 0.94, y: lo.y, z: lo.z }
      } else {
        const zb = yd.z - 3.4
        anchor = {
          x: side * shipHalfWidthAt(zb) * 0.9,
          y: shipDeckAt(zb) + HULL_BULWARK - 0.15,
          z: zb,
        }
      }
      const rope = mkRope(0x6b5a3d, 0.75, SHEET_SEGMENTS)
      rope.line.name = `ship-sheet-${yd.seed}-${side > 0 ? 'port' : 'stbd'}`
      rig.sheets.push({ side, attr: rope.attr, arr: rope.arr, clew, anchorYard, anchor, seed: yd.seed * 7 + (side > 0 ? 1.3 : 4.9) })
    }
    /*
     * 转桁索：只给三根**下桁**（上桁的转桁索在真实船上也有，但那是第四层绳子，
     * 画面上已经看不出层次）。从桁臂斜拉到甲板后方。
     * 桅在最尾那根（z=−8）时，"后方 5.4 米"会落进船尾楼里，所以夹到 −10.8。
     */
    if (rig.lower < 0) {
      const zb = Math.max(yd.z - 5.4, -10.8)
      for (const side of [-1, 1] as const) {
        const rope = mkRope(0x584a33, 0.6, BRACE_SEGMENTS)
        rope.line.name = `ship-brace-${yd.seed}-${side > 0 ? 'port' : 'stbd'}`
        rig.braces.push({
          side,
          attr: rope.attr,
          arr: rope.arr,
          tip: { x: side * (yd.len / 2) * 0.97, y: yd.y, z: yd.z },
          anchor: {
            x: side * shipHalfWidthAt(zb) * 0.86,
            y: shipDeckAt(zb) + HULL_BULWARK - 0.1,
            z: zb,
          },
        })
      }
    }
  }

  /*
   * 动索的每帧更新（建模型时也先跑一次）。
   *
   * 三个数决定一切，且都来自**已有的单一来源**：
   *  · 转桁角 ← `windTarget.bearing`（与旗子、`calculateSailingDays` 同一个风向）
   *  · 松紧   ← `windK(windTarget.speed)`（与旗子同一个归一化）
   *  · 摆动的相位 ← 每根索自己的 seed
   * 帆与索读的是**同一个平滑后的 `rig.yaw`** —— 帆转了 8°、索还留在 0°，
   * 绳头就会从帆角上"脱开"（这是本轮最容易犯的错，所以只有这一份角度）。
   */
  const updateRigging = (t: number, k: number) => {
    const dt = Math.min(0.2, Math.max(0.001, t - lastRigT))
    lastRigT = t
    const target = braceYaw(windTarget.bearing, k)
    for (const rig of yardRigs) {
      // 时间常数约 1 秒：风一变，帆不是"啪"地转过去，而是慢慢吃上劲
      rig.yaw += (target - rig.yaw) * Math.min(1, dt * 0.9)
      rig.pivot.rotation.y = rig.yaw
    }
    for (const rig of yardRigs) {
      for (const sheet of rig.sheets) {
        const top = rotateAboutYaw(sheet.clew.x, sheet.clew.z, rig.z, rig.yaw)
        let bx = sheet.anchor.x
        let bz2 = sheet.anchor.z
        if (sheet.anchorYard >= 0) {
          // 上帆的索尾绑在下桁臂上：下桁自己也在转，索尾要跟着它走
          const ar = yardRigs[sheet.anchorYard]
          const p = rotateAboutYaw(sheet.anchor.x, sheet.anchor.z, ar.z, ar.yaw)
          bx = p.x
          bz2 = p.z
        }
        /*
         * 上帆的脚索只跨一层桁（2~3 米），垂不了 1.4 米 —— 按 0.45 缩，
         * 否则那几根短索会垂成一个夸张的 U 形（像晾衣绳）。
         */
        const short = sheet.anchorYard >= 0
        const sag = sheetSag(t, sheet.seed, k) * (short ? 0.45 : 1)
        const sway = sheetSway(t, sheet.seed, k) * (short ? 0.4 : 1)
        writeSheetPoints(
          sheet.arr,
          top.x, sheet.clew.y, top.z,
          bx, sheet.anchor.y, bz2,
          sag, sway, SHEET_SEGMENTS,
        )
        sheet.attr.needsUpdate = true
      }
      for (const brace of rig.braces) {
        const tip = rotateAboutYaw(brace.tip.x, brace.tip.z, rig.z, rig.yaw)
        /*
         * 转桁索是**绷紧**的（它要拉住整根桁），所以垂度只有 0.3 米上下，
         * 但会随风速轻轻抖（绷得越紧抖得越少）。
         */
        const sag = 0.34 - 0.12 * k + 0.04 * Math.sin(t * 0.7 + rig.seed)
        writeSheetPoints(
          brace.arr,
          tip.x, brace.tip.y, tip.z,
          brace.anchor.x, brace.anchor.y, brace.anchor.z,
          sag, 0.02, BRACE_SEGMENTS,
        )
        brace.attr.needsUpdate = true
      }
    }
  }
  updateRigging(0, 0)

  /*
   * ---------------- 船首斜桅（bowsprit） ----------------
   *
   * 【为什么必须补】前桅的系留索、艏三角帆的拉索全都收敛到空间中的一点
   * ——而那个点上**原本什么都没有**。回看船时，几根线悬空指向船首前方，
   * 一眼就假（而且它占的正是船最显眼的剪影位置）。斜桅是一根从船首斜插出去的
   * 锥形木杆，前桅的支索就绑在它上面。
   */
  const bowBase = new V(0, BOWSPRIT_BASE.y, BOWSPRIT_BASE.z)
  const bowTipV = new V(0, BOWSPRIT_TIP.y, BOWSPRIT_TIP.z)
  const spritDir = bowTipV.clone().sub(bowBase)
  const spritLen = spritDir.length()
  spritDir.normalize()
  {
    const sprit = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.3, spritLen, 8), mastMat)
    sprit.name = 'ship-bowsprit'
    sprit.position.copy(bowBase).addScaledVector(spritDir, spritLen / 2)
    sprit.quaternion.setFromUnitVectors(new V(0, 1, 0), spritDir)
    group.add(sprit)
    // 捆绑环（gammoning）：斜桅穿过船首处的两三道绳圈
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.045, 5, 12), ironMat)
      ring.position.copy(bowBase).addScaledVector(spritDir, 0.5 + i * 0.55)
      ring.quaternion.copy(sprit.quaternion)
      ring.rotateX(Math.PI / 2)
      group.add(ring)
    }
    // 斜桅端头的帽
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.34, 8), brassMat)
    cap.name = 'ship-bowsprit-cap'
    cap.position.copy(bowBase).addScaledVector(spritDir, spritLen - BOWSPRIT_CAP_INSET)
    cap.quaternion.copy(sprit.quaternion)
    group.add(cap)
  }

  /*
   * ---------------- 船首柱（stem post）+ 船首像（figurehead） ----------------
   *
   * 【为什么值得做】船的**剪影**在远处只有三样东西认得出：桅杆的高度、帆的形状、
   * 船首前端那道曲线。前两样早就有了，而船首原本是"放样收成一条边"——从侧面看
   * 是一条刀口，从正面看什么都没有。船首柱把船体前缘收成一根有厚度的木柱，
   * 船首像再从柱顶伸出去，于是"这是哪条船"在最远处也能认出来。
   *
   * 【为什么船首像在船首柱顶上而不是挂在船舷上】真实帆船的船首像（figurehead）
   * 是船首柱的**延伸**：它顺着柱子的曲度往前下方伸，让剪影连续。挂高了读作
   * "船头站了个人"，挂低了会被船首浪盖住。
   *
   * 形状全在 `deckBow` 的 `FIGUREHEAD_SPINE` 里（纯数据、可单测）：脊柱上摆一串
   * 收细的球，加尾鳍与头冠，镀金 —— 这个尺度上"读成一个人/一只海兽"靠的是
   * **金灿灿的一条曲线**，不是五官。
   */
  {
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.62, 0.5), woodDark)
    stem.name = 'ship-stem'
    // 柱子从甲板下方一直顶到船首像的挂点（中间不许有缝，否则像"两个零件"）
    stem.position.set(0, stemTopY() - 0.82, STEM_Z)
    stem.rotation.x = -0.18
    group.add(stem)
    // 柱头的铜箍：柱顶到船首像之间要有"接上去"的东西
    const stemCap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.3, 8), brassMat)
    stemCap.position.set(0, stemTopY() - 0.12, STEM_Z - 0.05)
    group.add(stemCap)
    /*
     * 船首像的托架（cheek）：两根短梁从柱顶斜下来托住像的根部。
     * 【为什么不叫"头栏"、也不拉到舷侧】第一版照着真实帆船的 head rail 从船首柱
     * 一路拉到舷侧外沿 —— 结果那根梁横在甲板上方 0.3~0.6 米处，从甲板看就是
     * "一根横杆挡在走道中间"（实测两轮截图都是这样）。原因是**这条船的船首没有
     * 可以挂靠的"头部结构"**：船体放样在 z=18 收成一条边，舷墙内侧就是甲板边，
     * 任何连到舷侧的梁都必然从甲板上方穿过。所以只保留贴着柱子的两根短托架，
     * 它们的作用是"让像不是凭空插上去的"，不需要伸出去。
     */
    for (const sgn of [-1, 1]) {
      const a = new V(0, stemTopY() - 0.28, STEM_Z - 0.02)
      const b = new V(sgn * 0.42, stemTopY() - 0.78, STEM_Z - 0.62)
      const mid = a.clone().add(b).multiplyScalar(0.5)
      const dir = b.clone().sub(a)
      const cheek = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, dir.length(), 5), woodDark)
      cheek.name = `ship-figurehead-cheek-${sgn > 0 ? 'port' : 'stbd'}`
      cheek.position.copy(mid)
      cheek.quaternion.setFromUnitVectors(new V(0, 1, 0), dir.normalize())
      group.add(cheek)
    }

    const figure = new THREE.Group()
    figure.name = 'ship-figurehead'
    const bodyMat = new THREE.MeshStandardMaterial({
      // 镀金：比 brassMat 亮一档，远处才有"一点金"（与船壳的深棕拉开）
      color: 0xc9a24a, roughness: 0.42, metalness: 0.65, emissive: 0x2a1f08, emissiveIntensity: 0.35,
    })
    disposables.push(bodyMat)
    const pts = figureheadPoints()
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const seg = new THREE.Mesh(new THREE.SphereGeometry(p.r, 10, 7), bodyMat)
      seg.position.set(p.x, p.y, p.z)
      figure.add(seg)
    }
    // 尾鳍：两片薄板向后上方张开（船首像最容易被认出的部分）
    const tipP = pts[pts.length - 1]
    for (const sgn of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.52, 4), bodyMat)
      fin.position.set(sgn * 0.12, tipP.y + 0.16, tipP.z - 0.06)
      fin.rotation.set(-0.9, 0, sgn * 0.5)
      figure.add(fin)
    }
    // 头冠：肩部那一段往上收出一个尖，剪影里像个头
    const crest = new THREE.Mesh(
      new THREE.ConeGeometry(FIGUREHEAD_CREST.radius, FIGUREHEAD_CREST.height, 6), bodyMat,
    )
    crest.name = 'ship-figurehead-crest'
    crest.position.set(0, pts[0].y + FIGUREHEAD_CREST.lift, pts[0].z + 0.02)
    crest.rotation.x = 0.35
    figure.add(crest)
    group.add(figure)
  }

  /*
   * ---------------- 锚（anchor）----------------
   *
   * 【为什么是全船最该有的一件"零碎"】甲板上的三件可点物表达"接下来做什么"，
   * 锚表达**此刻的状态**：锚垂进水里 = 停着，锚收到舷边 = 在走。它也是这条船上
   * 唯一与 `fleet.isSailing` 直接挂钩的实体 —— 玩家看见锚收起来了，就知道船真的在动。
   *
   * 【位置为什么在右舷船首外沿】真实的锚挂在"猫头"（cathead，船首外伸的横梁）上，
   * 锚链从**锚链孔**（hawse hole）出海，所以锚在船壳**外面**、链子斜着穿出去。
   * 挂在舷墙内侧就变成"甲板上放了个铁件"。
   *
   * 尺寸按 36 米商船：锚杆 2.4、横杆 2.2 —— 在甲板上看是"一个人张开双臂那么宽"。
   * 状态与位置全部来自 `deckAnchor.anchorPose`（纯函数，可单测）。
   */
  const anchorRefs: { group: THREE.Group; cable: THREE.BufferAttribute } = (() => {
    const startPose = anchorPose(false)
    const anchor = new THREE.Group()
    anchor.name = 'ship-anchor'
    anchor.position.set(startPose.x, startPose.y, startPose.z)
    anchor.rotation.x = startPose.tilt
    // 挂环
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 5, 10), ironMat)
    anchor.add(ring)
    // 锚杆
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, ANCHOR_LEN, 6), ironMat)
    shank.position.y = -ANCHOR_LEN / 2
    anchor.add(shank)
    // 横杆（stock）：靠近挂环那端。
    /*
     * 【为什么让它**沿船长**而不是横着】横杆长 2.2 米、锚又挂在船壳外 0.28 米处 ——
     * 横着放时，靠近船那一头会**插进舷墙里**（实测截图：横杆穿过栏杆扎进甲板）。
     * 真实船收锚时横杆就是顺着船壳的方向贴着的，所以这里绕 x 转 90°。
     */
    const stock = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, ANCHOR_STOCK, 6), ironMat)
    stock.rotation.x = Math.PI / 2
    stock.position.y = -0.38
    anchor.add(stock)
    // 两个锚爪：从锚冠向两侧翻起（扁平的四棱锥，远看是"钩"）
    for (const sgn of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.78, 4), ironMat)
      arm.position.set(sgn * 0.3, -ANCHOR_LEN + 0.24, 0)
      arm.rotation.set(0, 0, sgn * 0.55)
      anchor.add(arm)
    }
    // 锚冠（crown）：锚杆底端的一块厚铁
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.26), ironMat)
    crown.position.y = -ANCHOR_LEN + 0.06
    anchor.add(crown)
    group.add(anchor)

    // 锚链孔：船壳上的一圈深色孔（没有它，链子像从空气里出来）
    const hawse = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.05, 5, 10), ironMat)
    hawse.name = 'ship-hawse'
    hawse.position.set(ANCHOR_SIDE * shipHalfWidthAt(HAWSE_Z) * 1.01, HAWSE_Y, HAWSE_Z)
    hawse.rotation.y = Math.PI / 2
    group.add(hawse)

    // 锚链：从锚链孔到挂环的一段（顶点每帧按当前锚位重写）
    const arr = new Float32Array((SHEET_SEGMENTS + 1) * 3)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    const m = new THREE.LineBasicMaterial({ color: 0x3a3428, transparent: true, opacity: 0.9 })
    const line = new THREE.Line(g, m)
    line.name = 'ship-anchor-cable'
    line.frustumCulled = false
    group.add(line)
    disposables.push(g, m)
    return { group: anchor, cable: g.attributes.position as THREE.BufferAttribute }
  })()
  /** 当前是否抛锚（由 DeckView 按 `fleet.isSailing` 写） */
  let anchorMoored = false

  /*
   * ---------------- 炮门（gun ports） ----------------
   * 一排小黑方口是"这是一条武装商船/战舰"最省笔画的一笔：近看是框 + 洞，
   * 远看是一条断续的暗带。位置贴着船壳的弧面算（cos 反解），不是随便摆的方块。
   */
  {
    const portGeo = new THREE.BoxGeometry(0.62, 0.62, 0.16)
    const portMat = new THREE.MeshBasicMaterial({ color: 0x07090b })
    const frameGeo = new THREE.BoxGeometry(0.8, 0.8, 0.1)
    for (const sgn of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const z = -11 + k * 4.4
        const deck = shipDeckAt(z)
        const keel = shipKeelAt(z)
        const w = shipHalfWidthAt(z)
        // 炮门中心离甲板 0.85 米：由弧面公式反解出该高度处的舷侧 x
        const y = deck - 0.85
        const cosA = (deck - y) / (deck + keel)
        const x = w * Math.sqrt(Math.max(0, 1 - cosA * cosA)) * 0.97
        const frame = new THREE.Mesh(frameGeo, woodDark)
        frame.position.set(sgn * x, y, z)
        frame.lookAt(sgn * (x + 2), y, z)
        group.add(frame)
        const port = new THREE.Mesh(portGeo, portMat)
        port.position.set(sgn * (x + 0.04), y, z)
        port.lookAt(sgn * (x + 2), y, z)
        group.add(port)
      }
    }
  }

  // ---------------- 索具（静索 + 动索） ----------------
  const rigPts: THREE.Vector3[] = []
  const runPts: THREE.Vector3[] = []
  const curve = (a: THREE.Vector3, b: THREE.Vector3, sag: number, running: boolean) => {
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
    mid.y -= sag
    const q = new THREE.QuadraticBezierCurve3(a, mid, b)
    const pts = q.getPoints(8)
    const dst = running ? runPts : rigPts
    for (let i = 0; i < pts.length - 1; i++) dst.push(pts[i], pts[i + 1])
  }
  const foreTop = new V(0, mastData[0].top, 11)
  const mainTop = new V(0, mastData[1].top, 1)
  const mizTop = new V(0, mastData[2].top, -8)
  /*
   * 斜桅端头：**只有 `deckBow.BOWSPRIT_TIP` 这一份**。
   * 这里原来写的是 `shipDeckAt(17) + 6.1`，而实体斜桅是从 (0, 0.95, 15.8) 求
   * 方向再摆到 `bowBase` 上 —— 两处**碰巧**算出同一个 y（7.96）：方向里少算的
   * 0.95 与底端多算的 0.95 抵消。所以这不是修错，是把"靠巧合对上"换成一个
   * 来源；e2e 用"索具端点 vs 网格端头"守着它不再分叉。
   */
  const bowTip = new V(0, BOWSPRIT_TIP.y, BOWSPRIT_TIP.z)
  curve(foreTop, bowTip, 0.9, false)
  curve(foreTop, mainTop, 0.7, false)
  curve(mainTop, mizTop, 0.55, false)
  curve(mainTop, new V(0, 4.4, -17), 0.5, false)
  curve(bowTip, new V(0, 2.0, 17.6), 0.35, false)
  curve(bowTip, new V(-3.4, 2.1, 14.2), 0.4, true)
  curve(bowTip, new V(3.4, 2.1, 14.2), 0.4, true)
  /*
   * 侧支索：从桅顶到舷边，左右各三组。
   * 中间那道是**绳梯**（ratlines）：三条支索之间每隔一段架一根横档，水手踩着它上桅。
   * 只有三条斜线时，抬头看桅杆读作"几根绳子"；加了横档才是"能爬上去的东西"。
   * 横档跟着支索的曲度插值，所以不会浮在绳子外面。
   */
  const rungPts: THREE.Vector3[] = []
  for (const m of mastData) {
    for (const s of [-1, 1]) {
      const top = new V(0, m.top - 1.2, m.z)
      const feet = [-1.6, 0, 1.6].map((dz) => new V(
        s * shipHalfWidthAt(m.z + dz) * 0.92,
        shipDeckAt(m.z + dz) + BULWARK,
        m.z + dz,
      ))
      for (const f of feet) curve(top.clone(), f.clone(), 0.25, false)
      // 相邻两道支索之间架横档
      for (let i = 0; i < feet.length - 1; i++) {
        for (let t = 0.18; t < 0.92; t += 0.075) {
          const a = top.clone().lerp(feet[i], t)
          const b = top.clone().lerp(feet[i + 1], t)
          // 侧支索是向下垂的（curve 里 sag 0.25 在两端点之间），横档跟着微微下垂
          a.y -= Math.sin(t * Math.PI) * 0.25 * (1 - t)
          b.y -= Math.sin(t * Math.PI) * 0.25 * (1 - t)
          rungPts.push(a, b)
        }
      }
    }
  }
  const rungGeo = new THREE.BufferGeometry().setFromPoints(rungPts)
  const rungMat = new THREE.LineBasicMaterial({ color: 0x3a3324, transparent: true, opacity: 0.75 })
  const rungLines = new THREE.LineSegments(rungGeo, rungMat)
  rungLines.name = 'ship-ratlines'
  group.add(rungLines)
  disposables.push(rungGeo, rungMat)
  const rigGeo = new THREE.BufferGeometry().setFromPoints(rigPts)
  const rigMat = new THREE.LineBasicMaterial({ color: 0x2a2419, transparent: true, opacity: 0.85 })
  const rigLines = new THREE.LineSegments(rigGeo, rigMat)
  /*
   * 命名给 e2e 用：这条线里包含"前支索"的端点 —— 它必须与斜桅端头**重合**。
   * 不命名的话，"绳头系在空气里"只能靠肉眼在截图里找（0.95 米的差在远景里
   * 只有几个像素，而且很容易被当成索具的正常弯度）。
   */
  rigLines.name = 'ship-rig-static'
  group.add(rigLines)
  const runGeo = new THREE.BufferGeometry().setFromPoints(runPts)
  const runMat = new THREE.LineBasicMaterial({ color: 0x4a4130, transparent: true, opacity: 0.7 })
  const runLines = new THREE.LineSegments(runGeo, runMat)
  runLines.name = 'ship-rig-running'
  group.add(runLines)
  disposables.push(rigGeo, rigMat, runGeo, runMat)

  return {
    group,
    /**
     * 背光方向 + 透光颜色：帆的透光靠它。
     * @param dir 世界空间的"从帆指向光源"单位向量（与 `vSailN` 同空间）
     * @param color 透出来的光色（夜里是月光的冷白，白天是天光的暖白）
     * @param k 强度倍率（0 = 完全不透光）
     */
    setCourse(bearingDeg: number | null, remainNm: number | null) {
      paintCourse?.(bearingDeg, remainNm)
    },
    setWake(strength: number, spreadRad: number, bowLenM: number, waveAmp = 1) {      wakeState.strength = strength
      wakeState.spread = spreadRad
      wakeState.bowLen = bowLenM
      wakeState.waveAmp = waveAmp
    },
    setWind(bearingDeg: number, speedKnots: number) {
      windTarget.bearing = bearingDeg
      windTarget.speed = speedKnots
    },
    setMooring(moored: boolean) {
      anchorMoored = moored
    },
    setCrew(n: number) {
      const shown = Math.max(0, Math.min(sailors.length, Math.round(n)))
      // 只在变化时改（每帧改 visible 会让 three 重算场景图）
      if (shown === crewShown) return
      crewShown = shown
      for (let i = 0; i < sailors.length; i++) sailors[i].visible = i < shown
    },
    setBacklight(dir: THREE.Vector3, color: THREE.Color, k: number) {
      sailLightDir.value.copy(dir).normalize()
      sailGlow.value.copy(color).multiplyScalar(k)
    },
    update(t: number, helm = 0, night = 0) {
      sailTime.value = t
      wheelSpinner.rotation.z = helm
      /*
       * 灯：白天几乎不亮（0.12），夜里满亮。
       * 【为什么必须有】正午截图里，船尾六扇窗是六块发光的黄板，灯笼也在发光 ——
       * 那是"夜里的船"贴在白天的海上，一眼假。灯是"有没有人在这条船上"的信号，
       * 白天它应该只是深色的玻璃。
       */
      /*
       * 白天的地板值 0.12 → 0.03。
       *
       * 【为什么】0.12 时窗玻璃的自发光是 2.2×0.12=0.26，出来是 147/102/69 —— 比同
       * 一帧的舱壁（55/47/43）亮 2.7 倍，正午的舱门小窗像一盏点着的铜灯（实测像素）。
       * 上一轮把「白天窗还在发光」当成修好了，其实只修到"不再是黄板"，没量到这个
       * 程度。0.03 → 约 74/61/41，读作"深色玻璃里有一点暖"，与舱壁只差一档。
       */
      const litK = 0.03 + 0.97 * night
      windowMat.emissiveIntensity = 2.2 * litK
      for (const m of warmMats) if (m !== windowMat) m.emissiveIntensity = 1.15 * litK
      for (const w of warmLights) w.light.intensity = w.base * litK
      if (cabinLamp) cabinLamp.intensity = 0.62 * (0.55 + 0.25 * night)
      // 窗外一直是冷的（白天是天光、夜里是月光），只在雾天更暗一点
      if (cabinWindowLamp) cabinWindowLamp.intensity = 0.4 * (0.35 + 0.65 * (1 - night * 0.4))
      /*
       * 舱内窗玻璃的颜色 = 窗外的天。白天 0x9fb6c8（灰蓝天光）、夜里 0x0a121c
       * （几乎是黑）。**不跟舱里的灯** —— 否则"窗比墙还亮"，读作舱里挂了三盏灯。
       */
      if (cabinGlassMat) cabinGlassMat.color.copy(CABIN_GLASS_DAY).lerp(CABIN_GLASS_NIGHT, night)
      for (const g of warmGlows) {
        const mat = g.material as THREE.SpriteMaterial
        mat.opacity = (g.scale.x > 2 ? 0.30 : 0.48) * litK
      }
      /*
       * 水手的呼吸式摇晃：振幅 1cm、周期 4~6 秒，三人相位不同。
       * 【为什么不随船摇】船体的横摇已经通过 group 的 quaternion 传给他们了
       * （他们是 group 的子节点）；这里只补"人在站着时也会动"的那一点。
       */
      for (let i = 0; i < sailors.length; i++) {
        const g = sailors[i]
        if (!g.visible) continue
        const st = SAILOR_STATIONS[i]
        const pose = SAILOR_POSES[st.kind]
        g.rotation.y = st.yaw + Math.sin(t * 0.45 + st.phase) * 0.07
        g.position.y = shipDeckAt(st.z) + Math.sin(t * 0.95 + st.phase) * 0.01
        /*
         * 呼吸式的上身起伏 + **岗位小动作**：两者都是"叠加在姿势上"的增量。
         *  · 呼吸：振幅 1.8°，周期约 7 秒，三人相位不同；
         *  · 小动作：舵手推轮 / 舱口的人直起腰 / 瞭望的人放下手（见 `sailorIdle`）。
         * 增量永远不会把姿势翻过去（小动作幅度都小于对应的姿势角），所以"弯腰的人"
         * 不会突然变成后仰的人 —— 这是纯函数单测守的。
         */
        const up = sailorUppers[i]
        const idle = sailorIdle(st.kind, t, st.phase)
        if (up) up.rotation.x = pose.lean + idle.lean + Math.sin(t * 0.9 + st.phase) * 0.018
        const arms = sailorArms[i]
        if (arms) {
          arms[0].rotation.x = pose.armLX + idle.armLX
          arms[1].rotation.x = pose.armRX + idle.armRX
        }
        const head = sailorHeads[i]
        if (head) head.rotation.x = pose.headTilt + idle.headTilt
      }

      /*
       * ---- 水线湿痕的颜色 ----
       * 【为什么要单独写这一行】湿痕用的是 MeshBasicMaterial（不受光），颜色恒定。
       * 白天它读作"水藻带"，正确；**夜里它比整条船壳还亮**（船壳是 Lambert，夜里
       * 几乎全黑，而 Basic 还是 0x2c3a32）—— 实测夜景截图里船体中部挂着一条发灰
       * 的宽带，像贴了一条胶带。夜里必须把它压到接近黑。
       */
      if (wetMatRef) wetMatRef.color.copy(WET_DAY).lerp(WET_NIGHT, night)

      /*
       * ---- 航迹 ----
       * 水面在船体局部坐标里的高度每帧现算（船随浪起伏，这个值会变 ±1.9 米）；
       * 泡沫带的 y 跟着它，才不会浮在半空或沉进水里。
       */
      {
        /*
         * 泡沫带的 y 是几何里定死的（水面之上 0.3 米，见 WAKE_Y_M 的注释）；
         * 只有船首 V 浪需要每帧采样 —— 它在船首那一侧，与船中的水面差得最远。
         */
        wakeGroup.position.y = 0
        /*
         * 白沫不是自发光：夜里它是灰的（月光下没有纯白的沫）。所以颜色随夜色压，
         * 而不是只调 opacity —— 只调 opacity 的话黑海上的沫会变成一块"透明的白"，
         * 反而更亮眼。
         */
        const litW = 0.16 + 0.84 * (1 - night)
        foamMat.opacity = wakeState.strength * litW
        for (const p of bowGroups) {
          const on = wakeState.bowLen > 0.05
          p.visible = on
          if (!on) continue
          p.scale.set(1, 1, wakeState.bowLen)
          p.rotation.y = -Math.sign(p.position.x) * wakeState.spread
          /*
           * 与泡沫带同一个高度：水面之上 0.3 米（模型）。**不按点采样浪高** ——
           * CPU 与 GPU 的相位差 2~5 厘米，采出来的高度会让 V 浪一会儿沉进水面、
           * 一会儿浮起来（一帧对一帧错地闪），比"整体略高 0.3 米"难看得多。
           */
          p.position.y = WATERLINE_Y_M + 0.5
        }
      }

      /*
       * ---- 三角旗 ----
       * 顶点每帧重写（波在跑），法线每 4 帧算一次 —— `computeVertexNormals` 会重建
       * 整个 normal 数组，每帧调是在制造 GC 垃圾；4 帧一次肉眼看不出来。
       */
      if (flagGeo.attributes.position) {
        const dt = Math.min(0.05, Math.max(0.001, t - lastFlagT))
        lastFlagT = t
        if (Number.isFinite(windTarget.bearing)) {
          if (!Number.isFinite(flagWind.bearing)) {
            flagWind.bearing = windTarget.bearing
            flagWind.speed = windTarget.speed
          } else {
            const a = Math.min(1, dt * 1.2)
            flagWind.bearing += bearingDelta(flagWind.bearing, windTarget.bearing) * a
            flagWind.speed += (windTarget.speed - flagWind.speed) * a
          }
        }
        flagPivot.rotation.y = pennantYaw(flagWind.bearing)
        const attr = flagGeo.attributes.position as THREE.BufferAttribute
        const arr = attr.array as Float32Array
        for (let iy = 0; iy <= FLAG_SEG_Y; iy++) {
          const v = (iy / FLAG_SEG_Y) * 2 - 1
          for (let ix = 0; ix <= FLAG_SEG_X; ix++) {
            const u = ix / FLAG_SEG_X
            const i = (iy * (FLAG_SEG_X + 1) + ix) * 3
            const off = flagOffset(u, v, t, flagWind.speed)
            arr[i] = flagBase[i]
            arr[i + 1] = flagBase[i + 1] + off.y
            arr[i + 2] = off.z
          }
        }
        attr.needsUpdate = true
        if (++flagNormalTick % 4 === 0) flagGeo.computeVertexNormals()
      }

      /*
       * ---- 动索 ----
       * 建模型时也调一次（t=0、无风），否则第一帧之前那十八根索的顶点全是 0，
       * 会从船心拉出十八根射线（只闪一帧，但截图里就是一团黑线）。
       */
      updateRigging(t, windK(windTarget.speed))

      /*
       * ---- 锚：抛 / 收 ----
       *
       * 目标位置来自 `anchorPose`（纯函数），这里只做**平滑**：抛锚是"咚"一下，
       * 但收锚是摇绞盘，几秒钟才上来；直接跳变看起来像穿模。时间常数 0.6 秒，
       * 用 dt 而不是"每帧固定比例"（固定比例在 2fps 和 60fps 下速度差 30 倍）。
       */
      {
        const want = anchorPose(anchorMoored)
        const a = 1 - Math.exp(-Math.max(0.001, Math.min(0.2, t - lastAnchorT)) / 0.6)
        lastAnchorT = t
        const g = anchorRefs.group
        g.position.x = want.x
        g.position.z = want.z
        g.position.y += (want.y - g.position.y) * a
        g.rotation.x += (want.tilt - g.rotation.x) * a
        // 锚链：锚链孔 → 挂环（垂度由状态给；控制点取 2× 见 deckRigging）
        writeSheetPoints(
          anchorRefs.cable.array as Float32Array,
          ANCHOR_SIDE * shipHalfWidthAt(HAWSE_Z) * 1.01, HAWSE_Y, HAWSE_Z,
          g.position.x, g.position.y, g.position.z,
          anchorPose(anchorMoored).cableSag, 0, SHEET_SEGMENTS,
        )
        anchorRefs.cable.needsUpdate = true
      }

      // 灯笼晃：吊灯本来就随船摇，幅度小、周期不同（两盏不同相）
      for (let i = 0; i < lanternPivots.length; i++) {
        lanternPivots[i].rotation.z = Math.sin(t * 0.9 + i * 1.7) * 0.06
        lanternPivots[i].rotation.x = Math.sin(t * 0.7 + i * 2.3) * 0.04
      }
    },
    dispose() {
      for (const d of disposables) d.dispose()
      for (const m of sailMats) m.dispose()
      group.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mm = mesh.material as THREE.Material | THREE.Material[] | undefined
        for (const one of Array.isArray(mm) ? mm : mm ? [mm] : []) one.dispose()
      })
    },
  }
}
