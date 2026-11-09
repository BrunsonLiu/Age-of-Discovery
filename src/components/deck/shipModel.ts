import * as THREE from 'three'
import { createGlowTexture } from '@/components/map3d/models'
import { normalFromCanvas, plankCanvas, sailAlphaCanvas, sailCanvas, texFrom } from './shipTextures'

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

const HALF = 18
const BEAM = 10
const STATIONS = 30
const ARC = 10
const BULWARK = 0.95

function widthAt(z: number): number {
  const t = Math.min(1, Math.abs(z) / HALF)
  return z > 0
    ? (BEAM / 2) * (1 - 0.78 * Math.pow(t, 2.6))
    : (BEAM / 2) * (1 - 0.42 * Math.pow(t, 1.9))
}
function keelAt(z: number): number {
  const t = Math.min(1, Math.abs(z) / HALF)
  return z > 0 ? 3.1 * (1 - 0.62 * Math.pow(t, 1.35)) : 3.1 * (1 - 0.28 * Math.pow(t, 1.5))
}
function deckAt(z: number): number {
  const t = Math.min(1, Math.abs(z) / HALF)
  return 1.32 + 0.62 * Math.pow(t, 2.4)
}

export interface DeckShip {
  group: THREE.Group
  /** 每帧推进：帆的摆动、灯笼的晃 */
  update(t: number): void
  dispose(): void
}

export function createDeckShip(): DeckShip {
  const group = new THREE.Group()
  group.name = 'deck-ship'
  const disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = []

  // ---------------- 贴图 ----------------
  const hullCanvas = plankCanvas({ seed: 4471, along: 'h', rows: 9, base: [86, 58, 36], seamW: 2.2 })
  const deckCanvas = plankCanvas({ seed: 9917, along: 'v', rows: 14, base: [116, 86, 55], seamW: 1.6 })
  const hullTex = texFrom(hullCanvas, true)
  const hullNormal = normalFromCanvas(hullCanvas, 2.2)
  const deckTex = texFrom(deckCanvas, true)
  const deckNormal = normalFromCanvas(deckCanvas, 2.6)
  hullTex.repeat.set(1, 3)
  deckTex.repeat.set(1, 1)
  const sailTex = texFrom(sailCanvas(7), true)
  const sailAlpha = texFrom(sailAlphaCanvas(11), false)
  const glowTex = createGlowTexture()
  disposables.push(hullTex, hullNormal, deckTex, deckNormal, sailTex, sailAlpha, glowTex)

  const woodDark = new THREE.MeshStandardMaterial({ color: 0x2c1e12, roughness: 0.88, metalness: 0.05 })
  const woodMid = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.86, metalness: 0.05 })
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.82, metalness: 0.35 })
  const brassMat = new THREE.MeshStandardMaterial({ color: 0x9d7a3c, roughness: 0.45, metalness: 0.7 })
  const mastMat = new THREE.MeshStandardMaterial({ color: 0x1d150e, roughness: 0.85, metalness: 0.08 })

  // ---------------- 船体放样 ----------------
  const verts: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const sectionCount = ARC + 2
  for (let i = 0; i <= STATIONS; i++) {
    const z = -HALF + 2 * HALF * (i / STATIONS)
    const w = widthAt(z)
    const depth = keelAt(z)
    const dy = deckAt(z)
    verts.push(-w * 0.965, dy + BULWARK, z)
    uvs.push(0, i / STATIONS)
    for (let k = 0; k <= ARC; k++) {
      const a = -Math.PI / 2 + (k / ARC) * Math.PI
      verts.push(w * Math.sin(a), dy - (dy + depth) * Math.cos(a), z)
      uvs.push((k + 1) / (sectionCount - 1), i / STATIONS)
    }
    verts.push(w * 0.965, dy + BULWARK, z)
    uvs.push(1, i / STATIONS)
  }
  for (let i = 0; i < STATIONS; i++) {
    for (let j = 0; j < sectionCount - 1; j++) {
      const a = i * sectionCount + j
      const b = a + sectionCount
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  // 首尾封板：从中心点扇形连到该站位的截面
  const cap = (stationIndex: number, atZ: number) => {
    const base = stationIndex * sectionCount
    const dy = deckAt(atZ)
    const centerIndex = verts.length / 3
    verts.push(0, dy * 0.1 - keelAt(atZ) * 0.45, atZ)
    uvs.push(0.5, 1)
    for (let j = 0; j < sectionCount - 1; j++) indices.push(centerIndex, base + j, base + j + 1)
  }
  cap(0, -HALF)
  cap(STATIONS, HALF)

  const hullGeo = new THREE.BufferGeometry()
  hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  hullGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  hullGeo.setIndex(indices)
  hullGeo.computeVertexNormals()
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: hullTex,
    normalMap: hullNormal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.76,
    metalness: 0.06,
    // 极弱自发光：夜里背光面不至于变成纯黑洞（海图那边同一条经验）
    emissive: 0x0d1620,
    emissiveIntensity: 0.35,
    side: THREE.DoubleSide,
  })
  const hull = new THREE.Mesh(hullGeo, hullMat)
  group.add(hull)
  disposables.push(hullGeo, hullMat)

  // ---------------- 甲板 ----------------
  const dv: number[] = []
  const du: number[] = []
  const di: number[] = []
  for (let i = 0; i <= STATIONS; i++) {
    const z = -HALF + 2 * HALF * (i / STATIONS)
    const w = widthAt(z) * 0.94
    const y = deckAt(z) + 0.03
    dv.push(-w, y, z, w, y, z)
    du.push(0, i / STATIONS, 1, i / STATIONS)
  }
  for (let i = 0; i < STATIONS; i++) {
    const a = i * 2
    di.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const deckGeo = new THREE.BufferGeometry()
  deckGeo.setAttribute('position', new THREE.Float32BufferAttribute(dv, 3))
  deckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(du, 2))
  deckGeo.setIndex(di)
  deckGeo.computeVertexNormals()
  const deckMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: deckTex,
    normalMap: deckNormal,
    normalScale: new THREE.Vector2(1.15, 1.15),
    emissiveMap: deckTex,
    emissive: 0x6a4a2a,
    emissiveIntensity: 0.3,
    roughness: 0.92,
    metalness: 0.04,
    side: THREE.DoubleSide,
  })
  const deck = new THREE.Mesh(deckGeo, deckMat)
  group.add(deck)
  disposables.push(deckGeo, deckMat)

  // ---------------- 舷墙金色饰线 ----------------
  const railMat = new THREE.LineBasicMaterial({ color: 0xb08a45, transparent: true, opacity: 0.7 })
  for (const s of [-1, 1]) {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= STATIONS; i++) {
      const z = -HALF + 2 * HALF * (i / STATIONS)
      pts.push(new THREE.Vector3(s * widthAt(z) * 0.99, deckAt(z) + BULWARK + 0.02, z))
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts)
    group.add(new THREE.Line(g, railMat))
    disposables.push(g)
  }
  disposables.push(railMat)

  // ---------------- 船尾楼 ----------------
  const sternDeck = deckAt(-15)
  const cabin = new THREE.Group()
  cabin.position.set(0, sternDeck + 1.35, -14.6)
  const cabinBox = new THREE.Mesh(new THREE.BoxGeometry(6.6, 2.7, 5.2), woodMid)
  cabin.add(cabinBox)
  const cabinTop = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.28, 5.8), woodDark)
  cabinTop.position.y = 1.5
  cabin.add(cabinTop)

  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x1a1004,
    emissive: 0xffab5e,
    emissiveIntensity: 2.2,
    roughness: 0.35,
  })
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

  // ---------------- 灯笼 ----------------
  const lanternPivots: THREE.Group[] = []
  const makeLantern = (scale: number, withLight: boolean): THREE.Group => {
    const pivot = new THREE.Group()
    const body = new THREE.Group()
    body.position.y = -0.55
    pivot.add(body)
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.52, 0.9, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a1a08, emissive: 0xffb066, emissiveIntensity: 3.2, roughness: 0.45 }),
    )
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
    if (withLight) {
      /*
       * 【distance 是世界单位，**不随 group.scale 缩放**】
       * 船整体缩到 0.05，但灯光参数不会跟着缩：写 7 就意味着"照亮 7 个世界单位"，
       * 整条船（1.8 单位）全在暖光里 —— 实测帆被染成橙色木板。
       * 现在给 0.5：只照亮船尾楼与灯笼周围一小圈。
       */
      const l = new THREE.PointLight(0xffb066, 0.5, 0.5, 2)
      body.add(l)
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
    bracket.add(makeLantern(3.4, i === 1))
    gallery.add(bracket)
  })

  // ---------------- 桅杆 / 帆桁 ----------------
  const mastData = [
    { z: 11, baseDeck: deckAt(11), top: 23 },
    { z: 1, baseDeck: deckAt(1), top: 28 },
    { z: -8, baseDeck: deckAt(-8), top: 19 },
  ]
  for (const m of mastData) {
    const h = m.top - m.baseDeck
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.36, h, 8, 1), mastMat)
    mast.position.set(0, m.baseDeck + h / 2, m.z)
    group.add(mast)
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.6, 5), mastMat)
    tip.position.set(0, m.top + 0.7, m.z)
    group.add(tip)
  }

  const yardData = [
    { z: 11, y: 10.5, len: 14.5, sailH: 7.2, sailW: 0.86, seed: 1 },
    { z: 11, y: 17.6, len: 10.0, sailH: 5.6, sailW: 0.84, seed: 2 },
    { z: 1, y: 12.0, len: 17.6, sailH: 9.4, sailW: 0.88, seed: 3 },
    { z: 1, y: 21.2, len: 12.2, sailH: 7.0, sailW: 0.86, seed: 4 },
    { z: -8, y: 9.0, len: 10.4, sailH: 6.2, sailW: 0.84, seed: 5 },
    { z: -8, y: 14.2, len: 7.0, sailH: 4.2, sailW: 0.82, seed: 6 },
  ]

  const sailTime = { value: 0 }
  const sailMats: THREE.MeshStandardMaterial[] = []

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
      shader.vertexShader = `
        uniform float uTime; uniform float uSeed; uniform vec3 uAxis; uniform float uStrength;
      ` + shader.vertexShader
        .replace('#include <beginnormal_vertex>', `
          #include <beginnormal_vertex>
          float senv = sin(uv.y * 3.14159) * (0.55 + 0.45 * sin(uv.x * 3.14159));
          objectNormal = normalize(objectNormal + uAxis * senv * 0.42);
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
    }
    sailMats.push(mat)
    return mat
  }

  for (const yd of yardData) {
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, yd.len, 6), mastMat)
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
      pos.setZ(i, Math.cos(x * Math.PI * 0.5) * Math.cos(y * Math.PI * 0.5) * (sw * 0.11))
    }
    pos.needsUpdate = true
    sailGeo.computeVertexNormals()
    // 帆挂在帆桁下方：几何中心下移半个帆高
    const sail = new THREE.Mesh(sailGeo, makeSailMaterial(yd.seed, new THREE.Vector3(0, 0, 1), 1))
    sail.position.set(0, yd.y - sh / 2 - 0.2, yd.z + 0.42)
    group.add(sail)
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
  const V = THREE.Vector3
  const foreTop = new V(0, mastData[0].top, 11)
  const mainTop = new V(0, mastData[1].top, 1)
  const mizTop = new V(0, mastData[2].top, -8)
  const bowTip = new V(0, deckAt(17) + 6.1, 26.2)
  curve(foreTop, bowTip, 0.9, false)
  curve(foreTop, mainTop, 0.7, false)
  curve(mainTop, mizTop, 0.55, false)
  curve(mainTop, new V(0, 4.4, -17), 0.5, false)
  curve(bowTip, new V(0, 2.0, 17.6), 0.35, false)
  curve(bowTip, new V(-3.4, 2.1, 14.2), 0.4, true)
  curve(bowTip, new V(3.4, 2.1, 14.2), 0.4, true)
  // 侧支索：从桅顶到舷边，左右各三组
  for (const m of mastData) {
    for (const s of [-1, 1]) {
      for (const dz of [-1.6, 0, 1.6]) {
        curve(new V(0, m.top - 1.2, m.z), new V(s * widthAt(m.z + dz) * 0.92, deckAt(m.z + dz) + BULWARK, m.z + dz), 0.25, false)
      }
    }
  }
  const rigGeo = new THREE.BufferGeometry().setFromPoints(rigPts)
  const rigMat = new THREE.LineBasicMaterial({ color: 0x2a2419, transparent: true, opacity: 0.85 })
  group.add(new THREE.LineSegments(rigGeo, rigMat))
  const runGeo = new THREE.BufferGeometry().setFromPoints(runPts)
  const runMat = new THREE.LineBasicMaterial({ color: 0x4a4130, transparent: true, opacity: 0.7 })
  group.add(new THREE.LineSegments(runGeo, runMat))
  disposables.push(rigGeo, rigMat, runGeo, runMat)

  return {
    group,
    update(t: number) {
      sailTime.value = t
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
