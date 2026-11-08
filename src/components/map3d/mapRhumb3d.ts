import * as THREE from 'three'
import { buildRhumbNetwork, RHUMB_CENTERS } from '@/utils/rhumbLines'
import { latToWorldZ, lonToWorldX } from '@/utils/mapProjection'

/**
 * 2.5D 海图上的**恒向线网与罗经花**。
 *
 * 【为什么 3D 必须有这个】
 * 2D 视图一眼就是"波托兰海图"：海面上有一束束从罗经点量出去的方位线，
 * 加上那朵罗经花。切到 3D 之后这些全没了，那片海只剩下均匀的蓝——
 * 实测截图对比：2D 的海有经纬网、恒向线、罗经花、纸纹四层，
 * 3D 只有经纬网一层，所以读作"低模世界地图"而不是"立体海图"。
 * 这不是精细度的差别，是**身份**的差别。
 *
 * 【为什么直接复用 utils/rhumbLines】
 * 那套数值是 2D 调过的（射线 32 条、三圈 0.42/0.76/1、半径 0.9）。
 * 3D 另算一套必然和 2D 对不上——切视图时线的角度会变，玩家会觉得"换了个地方"。
 * 同一个几何函数、同一组常数，两个视图就是同一张海图。
 *
 * 【为什么线画在海底、却被陆地挡住】
 * 世 2D 用的是 pane 层级（rhumbPane z=380 低于 overlayPane 400），
 * 压到陆地上的那半截自动被陆地填充盖住——不用逐条判断有没有穿陆。
 * 3D 用同一招，只是换成深度测试：线放在海面之上 2mm、陆地顶面之下
 * （陆地顶面 y=0，海面 y=-PLATE_THICKNESS）。陆地板块是实心的，
 * 它的顶盖会把下面的线挡掉，视觉结果与 2D 的层叠完全一致。
 */

/**
 * 三圈透明度：与 2D 的 BAND_OPACITY 同一组**比例**，整体再乘 0.72。
 *
 * 【为什么比例照抄、绝对值要降】2D 的海面是给过 luminosity 混合的浅蓝，
 * 3D 的海面是深蓝（color 乘数把 B 抬到 1.3）。同样的 0.125 写在深底上，
 * 相对对比高得多——实测切到 3D 后线像"用白笔画的"，抢过海岸线。
 * 按 0.72 压下来之后，两边读到的是同一种"底纹"密度。
 *
 * 【为什么档差必须这么小】2D 踩过：早期用 0.10/0.07/0.04，4 倍放大下
 * 每条射线的圈界都露出一道亮度台阶，读起来像"线在中间折了一下"
 * （几何其实完全共线）。现在三档只差 0.009~0.013，淡出还在，台阶看不出。
 */
const BASE_OPACITY = [0.125, 0.11, 0.092]
const GLOBAL_GAIN = 0.72
const BAND_OPACITY = BASE_OPACITY.map(o => o * GLOBAL_GAIN)

/**
 * 罗经花的世界尺寸（相机距离 22 时）。
 *
 * 换算依据与 2D 一致：2D 那朵是 124 CSS px。3D 里山符号的换算是
 * "0.44 世界单位 ≈ 22px（dist=22）"→ 1 单位 ≈ 50px，
 * 所以 124px ≈ 2.4 单位。`setScale` 再按相机距离按比例放大/缩小，
 * 保证屏幕上始终是"一朵花"而不是远看一粒米、近看一片天。
 */
const ROSE_WORLD = 2.4

/** 画一朵罗经花到画布（与 2D 的 SVG 同一套比例：S=124，星尖 58/40，圈 60/55） */
function buildRoseTexture(): THREE.Texture {
  const S = 256
  const c = S / 2
  const k = S / 124           // 2D 的坐标系 → 画布像素
  const cv = document.createElement('canvas')
  cv.width = S; cv.height = S
  const g = cv.getContext('2d')!
  const INK = '168,198,220'   // #a8c6dc，与 2D 同一个色

  // 两圈细线
  g.strokeStyle = `rgba(${INK},0.55)`
  g.lineWidth = 1 * k
  g.beginPath(); g.arc(c, c, 60 * k, 0, Math.PI * 2); g.stroke()
  g.strokeStyle = `rgba(${INK},0.32)`
  g.lineWidth = 0.6 * k
  g.beginPath(); g.arc(c, c, 55 * k, 0, Math.PI * 2); g.stroke()

  // 16 方位星：长短交替，长的 58、短的 40
  g.beginPath()
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2 - Math.PI / 2
    const r = (i % 2 === 0 ? 58 : 40) * k
    const x = c + Math.cos(a) * r
    const y = c + Math.sin(a) * r
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y)
  }
  g.closePath()
  g.fillStyle = `rgba(${INK},0.10)`
  g.fill()
  g.strokeStyle = `rgba(${INK},0.55)`
  g.lineWidth = 0.7 * k
  g.stroke()

  // 中心点
  g.strokeStyle = `rgba(${INK},0.7)`
  g.lineWidth = 0.9 * k
  g.beginPath(); g.arc(c, c, 3.2 * k, 0, Math.PI * 2); g.stroke()

  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

export interface Map3DRhumb {
  group: THREE.Group
  /** 按相机距离重算罗经花尺寸（符号在屏幕上大致定尺寸） */
  setScale(dist: number): void
  /** 昼夜/天候压暗：只压透明度，不改色相 */
  setOpacity(k: number): void
  dispose(): void
}

/**
 * @param seaY 海面的世界 y（= -PLATE_THICKNESS）
 */
export function createRhumb3d(seaY: number): Map3DRhumb {
  const group = new THREE.Group()
  group.name = 'map3d-rhumb'

  // ---- 恒向线：一圈一个 LineSegments（透明度按圈不同，只能分材质） ----
  const networks = RHUMB_CENTERS.map(c => buildRhumbNetwork(c))
  const lineMats: THREE.LineBasicMaterial[] = []
  const lineGeos: THREE.BufferGeometry[] = []

  for (let bi = 0; bi < BAND_OPACITY.length; bi++) {
    const arr: number[] = []
    for (const net of networks) {
      const band = net[bi]
      if (!band) continue
      for (const ray of band) {
        for (let i = 1; i < ray.length; i++) {
          const a = ray[i - 1], b = ray[i]
          arr.push(
            lonToWorldX(a[1]), seaY + 0.002, latToWorldZ(a[0]),
            lonToWorldX(b[1]), seaY + 0.002, latToWorldZ(b[0]),
          )
        }
      }
    }
    if (!arr.length) continue
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    const mat = new THREE.LineBasicMaterial({
      color: 0x9fc0d8,
      transparent: true,
      opacity: BAND_OPACITY[bi],
      // 不写深度：它是贴着海面的底纹，写深度会和水面/阴影打架；
      // 但**保留 depthTest**，这样陆地顶盖仍然能把它挡住（与 2D 的 pane 层叠同效）
      depthWrite: false,
    })
    const lines = new THREE.LineSegments(geo, mat)
    lines.name = `map3d-rhumb-band-${bi}`
    group.add(lines)
    lineMats.push(mat)
    lineGeos.push(geo)
  }

  // ---- 罗经花：每个罗经点一朵，平铺在海面上 ----
  const roseTex = buildRoseTexture()
  const roseGeo = new THREE.PlaneGeometry(ROSE_WORLD, ROSE_WORLD)
  roseGeo.rotateX(-Math.PI / 2)
  const roseMat = new THREE.MeshBasicMaterial({
    map: roseTex,
    transparent: true,
    depthWrite: false,
    // 罗经花是"画在海图上的墨线"，不该被当成受光物体
    toneMapped: false,
  })
  const roses: THREE.Mesh[] = []
  for (let i = 0; i < RHUMB_CENTERS.length; i++) {
    const [lat, lng] = RHUMB_CENTERS[i]
    const m = new THREE.Mesh(roseGeo, roseMat)
    m.position.set(lonToWorldX(lng), seaY + 0.006, latToWorldZ(lat))
    m.name = `map3d-rose-${i}`
    group.add(m)
    roses.push(m)
  }

  let lastDist = -1
  let lastOpacity = -1
  /** 当前该用的总透明度倍率（远景淡出用），与 setScale 分开记 */
  let distGain = 1

  const applyOpacity = () => {
    const k = distGain
    for (let i = 0; i < lineMats.length; i++) lineMats[i].opacity = BAND_OPACITY[i] * k
    roseMat.opacity = k
  }

  return {
    group,
    setScale(dist: number) {
      /*
       * 【远景必须淡出，否则五张网叠成一团】
       * RHUMB_CENTERS 是 2D 定的五个点，2D 默认视角只框住伊比利亚一带，
       * 屏幕上通常只有一朵罗经花，射线是"从近处一个点量出去"的。
       * 3D 默认是**全球视角**，五个点全挤在视野里，五张网互相穿插 ——
       * 实测读作"蜘蛛网"，比不画更糟。
       * 波托兰海图本来也是**区域详图**才铺满恒向线；缩到全世界看时，
       * 那种密度在真实海图上也不存在。
       * 所以按相机距离淡出：dist≤18（近景）满强度，dist≥34（全球）只剩 22%。
       */
      if (dist !== lastDist) {
        const far = Math.min(1, Math.max(0, (dist - 18) / 16))
        /*
         * 近景也要淡。
         *
         * 【为什么】罗经花是按 2D 的五个中心点摆的，世界里直径 0.9 单位。
         * 拉到 dist≈10（一屏只装下半个地中海）时，那一朵在屏幕上直径三百多像素，
         * 上面还盖着整片恒向线——实测读作"贴了一张圆形贴纸在海面上"，
         * 而且它比港口、船、岛屿都显眼，把视线从真正的细节上拽走。
         *
         * 海图的规矩也是这样：恒向线网是**区域详图**的东西，
         * 你看的是三度见方的一小块海面时，没有人会在这上面画一朵占满整页的罗经花。
         *
         * 曲线：dist≥10 满强度；dist 5 时只剩 35%（不完全消失——
         * 它是这张海图的身份，淡到"能看见但不抢戏"）。
         */
        const near = dist >= 10 ? 1 : Math.min(1, Math.max(0.35, 0.35 + ((dist - 5) / 5) * 0.65))
        const nextGain = (1 - far * 0.78) * near
        if (Math.abs(nextGain - distGain) > 0.03) {
          distGain = nextGain
          applyOpacity()
        }
      }
      // 与山符号同一套滞回：变化不足 6% 不重算
      if (lastDist > 0 && Math.abs(dist - lastDist) / lastDist < 0.06) return
      lastDist = dist
      const k = Math.min(2.6, Math.max(0.5, dist / 22))
      for (const m of roses) m.scale.setScalar(k)
    },
    setOpacity(k: number) {
      if (Math.abs(k - lastOpacity) < 0.02) return
      lastOpacity = k
      distGain = k
      applyOpacity()
    },
    dispose() {
      for (const g of lineGeos) g.dispose()
      for (const m of lineMats) m.dispose()
      roseGeo.dispose()
      roseMat.dispose()
      roseTex.dispose()
    },
  }
}
