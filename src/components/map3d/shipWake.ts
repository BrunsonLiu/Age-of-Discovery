import * as THREE from 'three'

/**
 * 船尾尾迹：航行时拖着一条渐渐散开的白沫带。
 *
 * 【为什么值得做】
 * 3D 里所有运动此前都绑在玩家操作上：开船只是"图标沿着线走"。
 * 一条尾迹是最便宜的"这艘船真的在水上"的证据——它不进任何计算，
 * 但缺了它，远景里的船读作"贴图在地上平移"。
 *
 * 【为什么是一条纸片带，不是粒子】
 * 粒子要几百个 sprite、每帧改矩阵，远景下每个不到 2px，纯浪费。
 * 这一条带子总共 2×26 个顶点、1 次 draw call，剩下的全是顶点位置计算。
 * 而且它平铺在海面上，与恒向线、洋流是同一套"画在纸上"的语义。
 *
 * 【为什么用"收窄到 0"来淡出，而不是逐顶点 alpha】
 * MeshBasicMaterial 的顶点色是三通道，要逐顶点做透明得开 RGBA 顶点色，
 * 不同版本行为不一致。收窄宽度在观感上等价（尾巴最后收成一条线消失），
 * 代码只依赖最稳的那条路径。
 */

/** 最多记多少个采样点：26 段在默认视野下约 1.5 个船长，够读作"尾迹" */
const MAX_POINTS = 26
/** 相邻采样点的最小间距（世界单位）：太小会堆出一堆零长度线段 */
const MIN_STEP = 0.012
/** 单步超过这个距离就当作"瞬移"（读档/改航线），丢弃整条尾迹 */
const MAX_STEP = 0.35
/** 尾迹宽度（世界单位，半宽）：约 0.06 → 屏幕上 2~4px */
const HALF_WIDTH = 0.075

/**
 * 尾迹贴在海面上方多少。
 *
 * 【高度账】海面顶面 -0.089｜洋流/海盗/风带 -0.0880~-0.0862｜陆地顶面 0
 * 取 -0.080：比所有叠加图层都高（不会被它们盖住），又远低于陆地顶面
 * （所以贴在岸上的那一段会被陆地遮掉，这是对的——船不会开上岸）。
 */
const WAKE_Y = -0.080

export interface ShipWake {
  mesh: THREE.Mesh
  /**
   * 每帧喂一次。
   * @param x 船的世界 X
   * @param z 船的世界 Z
   * @param on 该不该有尾迹（航行中才有；停泊/无位置时给 false）
   * @param heading 船的艏向（弧度，绕 Y）。用来决定尾迹从船尾开始，而不是船心
   */
  update(x: number, z: number, on: boolean, heading?: number): void
  dispose(): void
}

/**
 * 尾迹贴图：横向两端透明（软边）、纵向从头到尾淡出。
 *
 * 【为什么必须用贴图，而不是纯色几何】
 * 第一版是纯色三角形带：实测在 3D 里读作"用白漆在海面上刷了一道"——
 * 硬边 + 恒定宽度 + 到尾巴突然截断，三个都不像水。
 * 换成一张 32×64 的渐变贴图之后，边缘是软的、尾巴是自己淡掉的，
 * 而且宽度可以保持不变（软边会替你把"边界"藏起来）。
 *
 * 坐标：u 横跨宽度（0/1 两端透明），v 沿长度（0 = 船尾最亮，1 = 尾巴全透明）。
 */
function buildWakeTexture(): THREE.Texture {
  const W = 32, H = 64
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const g = canvas.getContext('2d')!
  const img = g.createImageData(W, H)
  for (let y = 0; y < H; y++) {
    // 沿长度：前 25% 保持强度，之后平滑衰减到 0
    const v = y / (H - 1)
    const along = v < 0.25 ? 1 : Math.pow(1 - (v - 0.25) / 0.75, 1.6)
    for (let x = 0; x < W; x++) {
      // 横跨宽度：中间实、两边虚（cos 曲线，避免出现一条硬边线）
      const u = x / (W - 1)
      const across = Math.pow(Math.sin(Math.PI * u), 1.4)
      const a = Math.round(255 * along * across * 0.85)
      const i = (y * W + x) * 4
      img.data[i] = 233; img.data[i + 1] = 244; img.data[i + 2] = 250
      img.data[i + 3] = a
    }
  }
  g.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  // 沿长度方向重复采样（UV 的 v 是按点序给的 0..1，不需要 wrap）
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  return tex
}

export function createShipWake(): ShipWake {
  const geometry = new THREE.BufferGeometry()
  const positions = new Float32Array(MAX_POINTS * 2 * 3)
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  // UV：u 横跨带宽（0/1），v 沿航迹（0 = 船尾，1 = 尾巴）
  const uvs = new Float32Array(MAX_POINTS * 2 * 2)
  for (let i = 0; i < MAX_POINTS; i++) {
    uvs[i * 4] = 0; uvs[i * 4 + 1] = i / (MAX_POINTS - 1)
    uvs[i * 4 + 2] = 1; uvs[i * 4 + 3] = i / (MAX_POINTS - 1)
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  // 顶点数固定，索引也固定：26 个点 → 25 个四边形 → 每个 2 个三角形
  const idx: number[] = []
  for (let i = 0; i < MAX_POINTS - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1
    idx.push(a, b, c, b, d, c)
  }
  geometry.setIndex(idx)
  geometry.setDrawRange(0, 0)

  const texture = buildWakeTexture()
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    // 贴图自己带 alpha（软边 + 尾巴淡出），这里只给一个整体强度
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'ship-wake'
  mesh.frustumCulled = false
  mesh.renderOrder = 6
  mesh.visible = false

  /** 采样点：index 0 = 最新（船尾），往后越旧 */
  const pts: { x: number; z: number }[] = []
  let lastHeading = 0

  const rebuild = () => {
    const n = pts.length
    if (n < 2) {
      geometry.setDrawRange(0, 0)
      mesh.visible = false
      return
    }
    for (let i = 0; i < n; i++) {
      const p = pts[i]
      // 用前后相邻点求走向：端点各用一侧
      const a = pts[Math.max(0, i - 1)]
      const b = pts[Math.min(n - 1, i + 1)]
      let dx = b.x - a.x
      let dz = b.z - a.z
      const len = Math.hypot(dx, dz)
      if (len < 1e-6) {
        // 前后重合（刚起步）：退回船艏向的法线
        dx = Math.sin(lastHeading)
        dz = Math.cos(lastHeading)
      } else {
        dx /= len; dz /= len
      }
      // 垂直于走向 → 带宽方向
      const nx = -dz, nz = dx
      // 越旧越窄：t=0（船尾）最宽，t=1（尾巴）收成 0
      const t = i / (n - 1)
      const w = HALF_WIDTH * Math.pow(1 - t, 0.75)
      const o = i * 6
      positions[o] = p.x + nx * w
      positions[o + 1] = WAKE_Y
      positions[o + 2] = p.z + nz * w
      positions[o + 3] = p.x - nx * w
      positions[o + 4] = WAKE_Y
      positions[o + 5] = p.z - nz * w
    }
    geometry.attributes.position.needsUpdate = true
    // 只画已有采样构成的那几段
    geometry.setDrawRange(0, (n - 1) * 6)
    mesh.visible = true
  }

  return {
    mesh,
    update(x, z, on, heading) {
      if (typeof heading === 'number' && Number.isFinite(heading)) lastHeading = heading
      if (!on || !Number.isFinite(x) || !Number.isFinite(z)) {
        if (pts.length) { pts.length = 0; geometry.setDrawRange(0, 0); mesh.visible = false }
        return
      }
      const head = pts[0]
      /*
       * 瞬移守卫：一步跨过大半个世界就不是"在航行"。
       *
       * 不判这一条，快速移动/读档/改航线时会拖出一条横贯大洋的白条
       * （实测：26 个采样点各差 0.9°，画出来是一条从好望角到印度洋的直线）。
       * 遇到这种情况清空重来——尾迹本来就不该记住上一条命。
       */
      if (head && Math.hypot(x - head.x, z - head.z) > MAX_STEP) {
        pts.length = 0
      }
      const h2 = pts[0]
      if (!h2 || Math.hypot(x - h2.x, z - h2.z) >= MIN_STEP) {
        pts.unshift({ x, z })
        if (pts.length > MAX_POINTS) pts.pop()
        rebuild()
      } else {
        // 船没动（速度极慢或被暂定）：让最新的点跟着船，别留下断头
        h2.x = x; h2.z = z
        rebuild()
      }
    },
    dispose() {
      geometry.dispose()
      texture.dispose()
      material.dispose()
    },
  }
}
