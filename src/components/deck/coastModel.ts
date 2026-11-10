import * as THREE from 'three'
import { COAST_HIDE_BEHIND_DEG, coastLayout, coastScenePos, wrapDeg, type CoastSighting } from './deckCoast'
import { texFrom } from './shipTextures'

/**
 * 船上视角的"近岸"：一条山脊剪影 + 一座灯塔 + 沿岸窗光 + 几个礁石。
 *
 * 【来源】灯塔的构图（岩基 + 塔身 + 发光舱室 + 加法光晕 + 两片交叉渐变面片做光束）
 * 取自用户另一个项目的 `harbor.js`；山脊与窗光是这里新写的——那个项目是固定机位
 * 的小岛，我们这边岸线要能随船位换边、随距离变景别。
 *
 * 【为什么山脊用 MeshBasicMaterial 而不是等月亮打光】夜里的岸是背光的：平行光从
 * 月亮（船头方向）打过来，岸朝镜头这一面全在阴影里，只吃环境光就是一块纯黑。
 * 这里改成"顶点色 × 昼夜系数"，颜色直接跟地平线色走，于是岸永远像**空气里的剪影**，
 * 而不是一块贴上去的黑板。
 */

/** 山脊起伏（单位宽度 −0.5..0.5 上的采样，确定性的哈希，保证每次启动一致） */
function hash01(i: number): number {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** 单位空间的山脊：沿 x 从 −0.5 到 0.5，两条边（水线与脊线） */
function buildRidgeGeometry(segments: number): THREE.BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= segments; i++) {
    const u = i / segments
    const x = u - 0.5
    // 三层起伏叠加：大屿 + 小山 + 碎丘；两端压低，岸线才不像被裁断
    const edgeFade = Math.sin(Math.PI * u) ** 0.6
    const h =
      (0.62 + 0.26 * hash01(i * 3.1) + 0.15 * hash01(i * 7.7 + 11) + 0.08 * hash01(i * 13.3 + 29))
      * edgeFade
    // 水线与脊线：脊线略往后（z 越小越远），读作一道斜坡而不是一堵墙
    pos.push(x, 0, 0.06)
    pos.push(x, h, -0.05)
    // 水线偏暗（湿岩），脊线稍亮（受天光）
    col.push(0.52, 0.56, 0.52)
    col.push(1, 1, 1)
    if (i < segments) {
      const a = i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  return geo
}

/** 加法光晕贴图（与港口灯火同一套写法：内核占半径 1/3，中段够亮） */
function makeGlowTexture(): THREE.Texture {
  const S = 64
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  grad.addColorStop(0, 'rgba(255,252,240,1)')
  grad.addColorStop(0.20, 'rgba(255,244,214,1)')
  grad.addColorStop(0.40, 'rgba(255,226,168,0.82)')
  grad.addColorStop(0.64, 'rgba(255,204,136,0.30)')
  grad.addColorStop(1, 'rgba(255,180,110,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  return texFrom(c)
}

/** 灯塔光束贴图：沿 +x 由亮到透明，上下两端软收（比圆锥更像体积光） */
function makeBeamTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const g = c.getContext('2d')!
  const h = g.createLinearGradient(0, 0, 256, 0)
  h.addColorStop(0, 'rgba(255,238,204,1)')
  h.addColorStop(0.20, 'rgba(255,216,158,0.62)')
  h.addColorStop(0.58, 'rgba(255,192,122,0.16)')
  h.addColorStop(1, 'rgba(255,172,96,0)')
  g.fillStyle = h
  g.fillRect(0, 0, 256, 64)
  g.globalCompositeOperation = 'destination-in'
  const v = g.createLinearGradient(0, 0, 0, 64)
  v.addColorStop(0, 'rgba(0,0,0,0)')
  v.addColorStop(0.26, 'rgba(0,0,0,1)')
  v.addColorStop(0.74, 'rgba(0,0,0,1)')
  v.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = v
  g.fillRect(0, 0, 256, 64)
  return texFrom(c)
}

/*
 * 岸的颜色：写成 hex，让 three 走 sRGB→线性。
 * 【为什么不能用"线性 0.3 的灰"】`Color.setRGB(0.3,...)` 是**线性**值，显示出来
 * 约 0.58（148/255）—— 第一版的海岸就是这样一块浅灰白，像纸上贴的纸片。
 * 目标是"白天 90/255 左右的暗绿灰、夜里 30/255 的近黑"，那对应的线性值只有
 * 0.09 与 0.012。写 hex 就不用自己算这个换算。
 */
const RIDGE_DAY = new THREE.Color(0x5c6b53)
const RIDGE_NIGHT = new THREE.Color(0x0a0e12)
const ROCK_DAY = new THREE.Color(0x45483f)
const ROCK_NIGHT = new THREE.Color(0x07090b)
const TOWER_DAY = new THREE.Color(0xb8b9b0)
const TOWER_NIGHT = new THREE.Color(0x181b1e)

export interface DeckCoast {
  group: THREE.Group
  /** null = 看不见（远洋） */
  setSighting(s: CoastSighting | null): void
  /**
   * 每帧：night 0..1；horizon 做大气透视（远岸往天色里退）；
   * fogK 0..1 + fogColor：浓雾时岸线要**真的淡出**（否则"能见度 100 米"的
   * 时候 7 海里外的灯塔还清清楚楚，与文字读数自相矛盾）。
   */
  update(t: number, night: number, horizon: THREE.Color, fogK: number, fogColor: THREE.Color): void
  dispose(): void
}

export function createDeckCoast(): DeckCoast {
  const group = new THREE.Group()
  group.name = 'deck-coast'
  group.visible = false

  const ridgeGeo = buildRidgeGeometry(72)
  const ridgeMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
  })
  const ridge = new THREE.Mesh(ridgeGeo, ridgeMat)
  group.add(ridge)

  /*
   * ---- 滩线（碎浪）----
   * 陆地剪影直接切进海面会读作"贴上去的纸"：真实的岸在水线处总有一条浅色浪线，
   * 正是它把"岸"和"水面"缝在一起。用山脊几何的水线顶点画一条线，
   * 于是它天然跟着海岸起伏，不需要第二份数据。
   */
  /*
   * 三条平行线而不是一条：LineBasicMaterial 的线宽在多数 WebGL 实现里恒为 1px，
   * 一条线在 24 单位外只剩"海面上的一道亮痕"，读不出宽度。三条错开 0.012 单位，
   * 加起来约 3px，才有"浪带"的感觉；代价是 3 次 draw call（可以接受）。
   */
  const linePos: number[] = []
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i <= 72; i++) {
      const u = i / 72
      linePos.push(u - 0.5, 0.006 + k * 0.004, 0.055 + k * 0.014)
    }
  }
  const foamGeo = new THREE.BufferGeometry()
  foamGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3))
  const foamMat = new THREE.LineBasicMaterial({
    /*
     * 滩线亮度 0.62/0.35 → 0.5/0.16：去掉天空的双重 sRGB 编码之后，这几条用加法
     * 混合的白线相对亮了一档，远看像沿岸挂了一条断断续续的白栅栏（实测截图）。
     * 碎浪本来就该是"隐约一线"，不是硬线。
     */
    color: new THREE.Color(0.5, 0.55, 0.58),
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const foamLine = new THREE.Line(foamGeo, foamMat)
  group.add(foamLine)

  /*
   * ---- 灯塔 ----
   * 单独一个 group，位置在岸线靠海一侧（z 略小），高度由 coastLayout 给。
   * 它的岩基比塔身宽，才能在剪影上读成"塔站在石头上"。
   */
  const tower = new THREE.Group()
  group.add(tower)

  const rockMat = new THREE.MeshBasicMaterial({ color: 0x11161c, transparent: true })
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), rockMat)
  rock.scale.set(0.30, 0.15, 0.24)
  tower.add(rock)

  const wallMat = new THREE.MeshBasicMaterial({ color: 0x2b3038, transparent: true })
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.135, 1, 10), wallMat)
  wall.position.y = 0.5
  tower.add(wall)

  // 舱室：真正的发光体（不受光照影响，直接给亮色）
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.9, 1.1), transparent: true })
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.12, 0.09, 10), lampMat)
  lamp.position.y = 1.03
  tower.add(lamp)

  const glowTex = makeGlowTexture()
  const haloMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: new THREE.Color(1.7, 1.25, 0.75),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.9,
    fog: false,
    toneMapped: false,
  })
  const halo = new THREE.Sprite(haloMat)
  halo.position.y = 1.04
  halo.scale.set(4, 4, 1)
  tower.add(halo)

  const beamTex = makeBeamTexture()
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTex,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  })
  const beamGeo = new THREE.PlaneGeometry(1.9, 0.2, 1, 1)
  beamGeo.translate(0.95, 0, 0)
  const beam = new THREE.Group()
  beam.position.y = 1.03
  // 两片交叉：单片面片在侧视时会变成一条线
  const beamA = new THREE.Mesh(beamGeo, beamMat)
  const beamB = new THREE.Mesh(beamGeo, beamMat)
  beamB.rotation.x = Math.PI / 2
  // 抬一点仰角：水平的白光会被读成"画面上的划痕"，斜着才像扫过海面的光束
  beamA.rotation.z = 0.05
  beamB.rotation.z = -0.05
  beam.add(beamA, beamB)
  tower.add(beam)

  // 灯塔的点光：只在近处开（远处那点光对画面没贡献，却要占一盏灯的计算）
  const lampLight = new THREE.PointLight(0xffb066, 0, 60, 2)
  lampLight.position.y = 1.03
  tower.add(lampLight)

  /*
   * ---- 沿岸窗光 ----
   * 一排小暖点。它们是"这里有人住"的证据，也是远景里唯一能读出岸线走向的东西
   * （夜里山脊只剩一条黑边，靠这排灯才知道岸往哪边延伸）。
   */
  const WINDOW_N = 46
  const winGeo = new THREE.BufferGeometry()
  const winPos = new Float32Array(WINDOW_N * 3)
  for (let i = 0; i < WINDOW_N; i++) {
    const u = (i + 0.5) / WINDOW_N
    /*
     * 【为什么要"熄灭"一部分】等距排开的 46 个亮点读作"一串小灯泡"，不是村落。
     * 真实海岸的灯火是**几处聚落**，中间隔着黑的一段。这里用 hash 数量级地
     * 抽掉 45%，再给位置加抖动，剩下的自然聚成三五处。
     * 熄灭用"把 y 挪到 −100"（与港口灯火未发现时同一手法），不重建 buffer。
     */
    const lit = hash01(i * 3.7 + 5) > 0.35
    const cluster = 0.55 + 0.45 * Math.sin(u * 21.7)
    winPos[i * 3] = u - 0.5 + (hash01(i * 11.3) - 0.5) * 0.006
    /*
     * 【高度与 z 都是量出来的】第一版取 y=0.12~0.33、z=0.04（乘缩放后 z=0.27）：
     * 而岸线是一个斜平面（水线 z=+0.4、脊线 z=−0.33），在 z=0.27 处的表面高度
     * 约 0.19 —— 窗光正好埋在坡面以下，一个都看不到（探针量过包围盒才明白，
     * 屏幕上只会显示"岸边没有灯"）。
     * 第二次改：z 放到**海侧**（负值 = 更靠近相机）。岸是斜平面，把灯放在 z 更大
     * （更远）的一侧时，同一屏幕位置上坡面比它更近，深度测试直接把它裁掉 ——
     * 中间那一段一个点都看不见，只有两端（岸脊被 edgeFade 压平的地方）剩下两三个。
     */
    winPos[i * 3 + 1] = lit ? 0.26 + 0.26 * hash01(i * 5.3) * cluster : -100
    winPos[i * 3 + 2] = -0.07
  }
  winGeo.setAttribute('position', new THREE.BufferAttribute(winPos, 3))
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
  windows.frustumCulled = false
  group.add(windows)

  /* ---- 礁石：水线外的几块暗石，给岸线一点"深度前哨" ---- */
  const rocks: THREE.Mesh[] = []
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), rockMat)
    m.position.set(-0.42 + 0.21 * i + 0.05 * hash01(i * 9.1), -0.02, 0.14 + 0.2 * hash01(i * 4.4))
    m.scale.set(0.6 + hash01(i * 2.2) * 0.8, 0.4 + hash01(i * 6.6) * 0.5, 0.7)
    m.rotation.y = hash01(i) * 6.28
    group.add(m)
    rocks.push(m)
  }

  let lastPort = -1
  let cur: CoastSighting | null = null
  let layout = coastLayout(0)

  return {
    group,
    setSighting(s) {
      cur = s
      if (!s) {
        group.visible = false
        lastPort = -1
        return
      }
      /*
       * 岸在正后方时不画：视野里本来就看不到，硬画一块会变成"前方凭空出现陆地"。
       * HUD 仍然报方位与距离（文字说"正后方 6 海里"，画面没有岸——不矛盾）。
       */
      if (Math.abs(wrapDeg(s.relBearingDeg)) > COAST_HIDE_BEHIND_DEG) {
        group.visible = false
        lastPort = -1
        return
      }
      group.visible = true
      layout = coastLayout(s.presence)
      const { x, z } = coastScenePos(s.relBearingDeg, layout.radius)
      group.position.set(x, 0, z)
      // 不旋转：岸是一条横带，转过去会把长边转成竖边（见 deckCoast 的注释）
      group.rotation.y = 0

      ridge.scale.set(layout.width, layout.ridgeHeight, layout.width * 0.14)
      // 灯塔：放在岸线偏一侧（正中会挡住船），高度随景别
      const tw = layout.towerHeight
      tower.position.set(layout.width * 0.1, 0, layout.width * 0.02)
      /*
       * 【为什么塔身几何一开始就建得瘦，而不是在这里做非均匀缩放】
       * 试过 `scale.set(tw*0.26, tw, tw*0.26)`：塔身比例对了，但**光晕 sprite
       * 被父级的非均匀矩阵拉成一条竖带**（截图里塔顶冲出一道直通天顶的白光）。
       * Sprite 永远面向相机，它的 4 个顶点用父级矩阵变换，非均匀缩放必然扭曲。
       * 所以塔身半径写在几何里（底 0.135 / 顶 0.085，高 1 → 高宽比约 7:1），
       * 这里只做均匀缩放，sprite 与光束都不会变形。
       */
      tower.scale.setScalar(tw)
      halo.scale.set(tw * 0.52, tw * 0.52, 1)
      beam.scale.setScalar(tw)
      windows.scale.set(layout.width, layout.ridgeHeight, layout.width * 0.14)
      foamLine.scale.set(layout.width, 1, 1)
      // 窗光尺寸按景别给（远处要让点可见，否则整排灯消失）
      winMat.size = Math.max(0.55, layout.radius * 0.011)
      for (const r of rocks) r.scale.multiplyScalar(1)
      lampLight.distance = layout.radius * 0.55
      lastPort = s.port.id
      void lastPort
    },
    update(t, night, horizon, fogK, fogColor) {
      if (!cur) return
      /*
       * 岸色：白天偏绿的暗调，夜里几乎是黑的（比夜空更深，读作剪影）。
       * 再用 horizon 做大气透视——远岸往天色里退，近岸保留自身颜色。
       */
      const far = Math.min(1, Math.max(0, (layout.radius - 42) / 16))
      ridgeMat.color.copy(RIDGE_NIGHT).lerp(RIDGE_DAY, 1 - night)
      ridgeMat.color.lerp(horizon, 0.30 * far)
      rockMat.color.copy(ROCK_NIGHT).lerp(ROCK_DAY, 1 - night)
      rockMat.color.lerp(horizon, 0.26 * far)
      wallMat.color.copy(TOWER_NIGHT).lerp(TOWER_DAY, 1 - night)
      wallMat.color.lerp(horizon, 0.22 * far)

      /*
       * 雾：颜色退到雾色 + 整体降不透明度。
       * 只退颜色不够 —— 浓雾里岸的**边缘**也不该清楚，所以两个一起做。
       */
      const fog = Math.min(1, Math.max(0, Number.isFinite(fogK) ? fogK : 0))
      if (fog > 0.01) {
        const k = fog * 0.92
        ridgeMat.color.lerp(fogColor, k * 0.85)
        rockMat.color.lerp(fogColor, k * 0.9)
        wallMat.color.lerp(fogColor, k * 0.8)
        /*
         * 1.05 而不是 0.75：岸线几何的**水线那一排顶点**比脊线亮（模拟湿岩反光），
         * 保留 25% 不透明度时它在灰雾里会读成"海面上几条白色短线"（实测截图 3× 放大）。
         * 浓雾本来就该看不见岸。
         */
        ridgeMat.opacity = Math.max(0, 1 - fog * 1.05)
        /*
         * 灯塔尤其要淡：它是**纯白塔身**，在灰雾里比在晴天还显眼 ——
         * 而"浓雾里 7 海里外的灯塔"恰恰应该看不见。颜色退到雾色不够，
         * 它的亮度和雾差太多，必须一起降不透明度。
         */
        const towerFade = Math.max(0, 1 - fog * 1.25)
        wallMat.opacity = towerFade
        rockMat.opacity = towerFade
        lampMat.opacity = Math.max(0.15, 1 - fog)
      } else {
        ridgeMat.opacity = 1
        wallMat.opacity = 1
        rockMat.opacity = 1
        lampMat.opacity = 1
      }

      /*
       * 灯：夜里才亮，但**不能全灭**——白天远看灯塔也该有个白色塔身，
       * 只是在日光下灯不是光源。所以舱室给一点常亮，光晕与光束跟夜色走。
       */
      const lampK = 0.25 + 0.75 * night
      lampMat.color.setRGB(2.6 * lampK, 1.9 * lampK, 1.1 * lampK)
      haloMat.opacity = 0.02 + 0.92 * night
      beamMat.opacity = 0.22 * night * night
      winMat.opacity = 0.06 + 0.8 * night
      foamMat.opacity = 0.10 + 0.30 * (1 - night)
      lampLight.intensity = 6 * night
      /*
       * 雾对"发光物"的削弱必须放在**所有基础赋值之后**。
       * 第一版写在颜色那一段里（在 winMat/foamMat/haloMat 赋值之前），
       * 结果每帧都被后面的 base 值覆盖回去 —— 雾里窗光与滩线一点没淡，
       * 屏幕上只剩"海面上几段白色短线 + 一排暖点"（3× 放大才看清是它们）。
       */
      if (fog > 0.01) {
        const glowFade = Math.max(0, 1 - fog * 1.4)
        winMat.opacity *= glowFade
        foamMat.opacity *= glowFade
        haloMat.opacity *= Math.max(0, 1 - fog)
        beamMat.opacity *= Math.max(0, 1 - fog)
      }

      // 光束缓慢旋转：真实灯塔是转的，这一条让画面"活着"
      beam.rotation.y = t * 0.55
    },
    dispose() {
      ridgeGeo.dispose()
      ridgeMat.dispose()
      winGeo.dispose()
      winMat.dispose()
      glowTex.dispose()
      beamTex.dispose()
      beamMat.dispose()
      beamGeo.dispose()
      foamGeo.dispose()
      foamMat.dispose()
      haloMat.dispose()
      rockMat.dispose()
      wallMat.dispose()
      lampMat.dispose()
      beamA.geometry.dispose()
      sceneDispose(group)
    },
  }
}

/** 释放 group 里剩下的几何（礁石与灯罩等） */
function sceneDispose(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
  })
}
