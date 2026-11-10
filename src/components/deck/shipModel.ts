import * as THREE from 'three'
import { createGlowTexture } from '@/components/map3d/models'
import { normalFromCanvas, plankCanvas, sailAlphaCanvas, sailCanvas, texFrom } from './shipTextures'
import {
  HULL_BULWARK, HULL_STATIONS, SHIP_HALF_LENGTH,
  shipDeckAt, shipDeckHalfWidthAt, shipHalfWidthAt, shipKeelAt,
} from './shipShape'
import { buildHullGeo } from './shipHull'
import { SAILOR_STATIONS } from './deckCrew'

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
  dispose(): void
}

export function createDeckShip(): DeckShip {
  /** 简写：本文件里到处要写三维点 */
  const V = THREE.Vector3
  const group = new THREE.Group()
  group.name = 'deck-ship'
  const disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = []

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
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x1a1004,
    emissive: 0xffab5e,
    emissiveIntensity: 2.2,
    roughness: 0.35,
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
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 1.9, 0.5),
      new THREE.MeshBasicMaterial({ visible: false }),
    )
    hit.name = 'ship-wheel'
    hit.position.y = 1.95
    wheel.add(hit)
  }
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
  const armGeo = new THREE.CylinderGeometry(0.062, 0.072, 0.56, 5)
  const hatGeo = new THREE.CylinderGeometry(0.132, 0.122, 0.1, 8)
  disposables.push(sailorMat, skinMat, hatMat, beltMat, legGeo, bootGeo, torsoGeo, beltGeo, neckGeo, headGeo, armGeo, hatGeo)

  const sailors: THREE.Group[] = []
  for (const st of SAILOR_STATIONS) {
    const g = new THREE.Group()
    g.name = `ship-sailor-${st.kind}`
    g.position.set(st.x, shipDeckAt(st.z), st.z)
    g.rotation.y = st.yaw
    // 腿 + 靴：两根分开站，脚底在 y=0（甲板面）
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(legGeo, hatMat)
      leg.position.set(sx * 0.115, 0.38, 0)
      g.add(leg)
      const boot = new THREE.Mesh(bootGeo, hatMat)
      boot.position.set(sx * 0.115, 0.05, 0.03)
      g.add(boot)
    }
    // 躯干：略窄的方箱（人不是圆桶），上缘对齐肩
    const torso = new THREE.Mesh(torsoGeo, sailorMat)
    torso.position.set(0, 1.08, 0)
    g.add(torso)
    // 腰带：这个尺寸上"人"是靠腰线认出来的
    const belt = new THREE.Mesh(beltGeo, beltMat)
    belt.position.set(0, 0.82, 0)
    g.add(belt)
    // 手臂：外移到躯干轮廓之外，张开一点点，读作"站着"而不是"立正"
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(armGeo, sailorMat)
      arm.position.set(sx * 0.245, 1.05, 0.01)
      arm.rotation.z = sx * 0.16
      g.add(arm)
    }
    // 脖子：一小截，头才不会直接坐在肩上
    const neck = new THREE.Mesh(neckGeo, skinMat)
    neck.position.set(0, 1.4, 0)
    g.add(neck)
    const head = new THREE.Mesh(headGeo, skinMat)
    head.position.set(0, 1.5, 0)
    g.add(head)
    // 帽子：一顶矮圆帽，从远处也能认出"这是个人"
    const hat = new THREE.Mesh(hatGeo, hatMat)
    hat.position.set(0, 1.6, 0)
    g.add(hat)
    /*
     * 水手也参与"能不能点"？**不参与**。甲板上可点的三件东西（舱口 / 舵轮 / 瞭望台）
     * 各自对应一组真实数字；点一个人却只能说一句废话，那会稀释另外三个的意义。
     */
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
    // 两只木桶（箍是深色的一圈，近看才有"桶"而不只是"圆柱"）
    for (const [bx, bz] of [[1.7, 2.4], [2.1, 1.2]] as const) {
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

  for (const yd of yardData) {
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, yd.len, 6), mastMat)
    yard.name = `ship-yard-${yd.seed}`
    yard.rotation.z = Math.PI / 2
    yard.position.set(0, yd.y, yd.z)
    group.add(yard)

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
      const taper = 1 - 0.13 * (1 - (y + 1) / 2)
      pos.setX(i, pos.getX(i) * taper)
      const foot = y < -0.55 ? -0.06 * (1 - Math.abs(x)) * sh : 0
      pos.setZ(i, Math.cos(x * Math.PI * 0.5) * Math.cos(y * Math.PI * 0.5) * (sw * 0.11))
      pos.setY(i, pos.getY(i) + foot)
    }
    pos.needsUpdate = true
    sailGeo.computeVertexNormals()
    // 帆挂在帆桁下方：几何中心下移半个帆高
    const sail = new THREE.Mesh(sailGeo, makeSailMaterial(yd.seed, new THREE.Vector3(0, 0, 1), 1))
    sail.name = `ship-sail-${yd.seed}`
    sail.position.set(0, yd.y - sh / 2 - 0.2, yd.z + 0.42)
    group.add(sail)
  }

  /*
   * ---------------- 船首斜桅（bowsprit） ----------------
   *
   * 【为什么必须补】前桅的系留索、艏三角帆的拉索全都收敛到空间中的一点
   * ——而那个点上**原本什么都没有**。回看船时，几根线悬空指向船首前方，
   * 一眼就假（而且它占的正是船最显眼的剪影位置）。斜桅是一根从船首斜插出去的
   * 锥形木杆，前桅的支索就绑在它上面。
   */
  const bowBase = new V(0, shipDeckAt(17) + 0.95, 15.8)
  {
    const dir = new V(0, 6.1, 26.2).sub(new V(0, 0.95, 15.8)).normalize()
    const len = new V(0, 6.1, 26.2).distanceTo(new V(0, 0.95, 15.8))
    const sprit = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.3, len, 8), mastMat)
    sprit.name = 'ship-bowsprit'
    sprit.position.copy(bowBase).addScaledVector(dir, len / 2)
    sprit.quaternion.setFromUnitVectors(new V(0, 1, 0), dir)
    group.add(sprit)
    // 捆绑环（gammoning）：斜桅穿过船首处的两三道绳圈
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.045, 5, 12), ironMat)
      ring.position.copy(bowBase).addScaledVector(dir, 0.5 + i * 0.55)
      ring.quaternion.copy(sprit.quaternion)
      ring.rotateX(Math.PI / 2)
      group.add(ring)
    }
    // 斜桅端头的帽
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.34, 8), brassMat)
    cap.position.copy(bowBase).addScaledVector(dir, len - 0.25)
    cap.quaternion.copy(sprit.quaternion)
    group.add(cap)
  }

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
  // 斜桅端头：与上面那根实体的 bowsprit 是同一个点（两处各写一份必然分叉）
  const bowTip = new V(0, shipDeckAt(17) + 6.1, 26.2)
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
  group.add(new THREE.LineSegments(rungGeo, rungMat))
  disposables.push(rungGeo, rungMat)
  const rigGeo = new THREE.BufferGeometry().setFromPoints(rigPts)
  const rigMat = new THREE.LineBasicMaterial({ color: 0x2a2419, transparent: true, opacity: 0.85 })
  group.add(new THREE.LineSegments(rigGeo, rigMat))
  const runGeo = new THREE.BufferGeometry().setFromPoints(runPts)
  const runMat = new THREE.LineBasicMaterial({ color: 0x4a4130, transparent: true, opacity: 0.7 })
  group.add(new THREE.LineSegments(runGeo, runMat))
  disposables.push(rigGeo, rigMat, runGeo, runMat)

  return {
    group,
    /**
     * 背光方向 + 透光颜色：帆的透光靠它。
     * @param dir 世界空间的"从帆指向光源"单位向量（与 `vSailN` 同空间）
     * @param color 透出来的光色（夜里是月光的冷白，白天是天光的暖白）
     * @param k 强度倍率（0 = 完全不透光）
     */
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
        g.rotation.y = st.yaw + Math.sin(t * 0.45 + st.phase) * 0.07
        g.position.y = shipDeckAt(st.z) + Math.sin(t * 0.95 + st.phase) * 0.01
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
