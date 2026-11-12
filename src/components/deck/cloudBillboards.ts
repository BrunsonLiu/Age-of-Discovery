import * as THREE from 'three'
import { texFrom } from './shipTextures'

/**
 * 天空的云 → **贴图 billboard**。
 *
 * 【为什么放弃 3D 噪声云】甲板的云原来是 fbm 噪声的等值线（三层 + domain warp +
 * 两层阈值），调了四轮：提高对比、收窄窗口、加内芯、压辉光阈值。它每一轮都
 * "更好一点"，但放大看永远是**一缕一缕的等值线**——噪声等值线在数学上就是
 * 一条连续曲线，做不出积云那种"圆鼓鼓的团 + 平底"。
 * 而云占画面 25%，是最大的一块"程序生成感"。
 *
 * 【为什么 billboard 能解决】积云的形状在**贴图**里已经画好了（几十个软圆叠加
 * 成一个土墩，底部压平、下沿压暗），billboard 只负责摆放与色调。
 * 代价是 1 次 draw call（InstancedMesh）+ 一张 256² 的贴图（程序生成，零外部资源）。
 */

/** 一片云的贴图（含水汽的软圆叠加 + 平底 + 下沿阴影） */
function makeCloudCanvas(seed: number, w = 768, h = 576): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  /** 固定种子的哈希（同一次启动永远是同一朵云，不会跳） */
  let s = seed * 9301 + 49297
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  /*
   * ① 主体：几十个软圆堆成一个"土墩"。
   * 圆心沿一条抛物线分布（中间高、两边低），半径从底部到顶部递减 ——
   * 这样顶上是几个圆鼓的团、底部连成一片，正是积云的轮廓。
   * 用 'lighter' 叠加：软圆的 alpha 相加，边缘自然变厚变实。
   */
  /*
   * ① 底盘：一个横向拉长的软椭圆（alpha 0.9 → 0）。
   * 【为什么要先铺这一层】只靠几十个小圆叠加时，核心的 alpha 会瞬间饱和到 1，
   * 而边缘在很窄的一条带上从 1 掉到 0 —— 屏幕上是**一块硬边的白板**
   * （第一版实测：整片天变成白色矩形，四边是四边形的边）。先铺一层**大而软**的
   * 底，边缘就有 25% 半径的过渡，小圆只负责把顶部堆出"花椰菜"的鼓包。
   */
  g.globalCompositeOperation = 'source-over'
  /*
   * 【底盘要**小**，不能是整朵云的形状】第一版 bw=0.40w 时，底盘本身就是一个
   * 大椭圆 —— 轮廓是椭圆，小圆只在里面加一点亮度，屏幕上永远是"一团棉花"。
   * 底盘只负责**下半部**的实体（积云的下半是连成一片的），上半部交给小圆去堆。
   */
  const cx0 = w * 0.5
  const cy0 = h * 0.62
  const bw = w * 0.30
  const bh = h * 0.20
  const base = g.createRadialGradient(cx0, cy0, 0, cx0, cy0, bw)
  /*
   * 底盘是**微冷灰**（226,232,242）而不是纯白：
   * 云的体积感靠"顶亮、底暗"的落差，纯白在 8bit 里没有上浮空间 —— 高光画不上去。
   * 底色压到 226 之后，鼓包的迎光面才能用 255 画出来（相差 29 级）。
   */
  base.addColorStop(0, 'rgba(214,223,237,1)')
  base.addColorStop(0.62, 'rgba(218,227,240,0.96)')
  base.addColorStop(0.88, 'rgba(226,234,245,0.5)')
  base.addColorStop(1, 'rgba(230,238,247,0)')
  g.save()
  g.translate(cx0, cy0)
  g.scale(1, bh / bw)
  g.translate(-cx0, -cy0)
  g.fillStyle = base
  g.fillRect(0, 0, w, h)
  g.restore()
  /*
   * ② 花椰菜：小圆的圆心**排在底盘的轮廓上**（一条压扁的上半椭圆 + 抖动），
   * 而不是随机撒在内部 —— 直径比间距略大，相邻的圆连成一片、外缘鼓出一串
   * 圆弧，这就是积云标志性的"菜花边"。随机撒在内部时，外缘仍由底盘决定。
   */
  /*
   * 【为什么用 source-over 而不是 'lighter'】'lighter' 是**加法**：给鼓包画
   * "背光侧的冷灰阴影"时，它反而把那块**加亮**了（rgb 相加不可能变暗），
   * 于是阴影和本体互相抵消，整朵云回到一片白。而且加法很快饱和到 255，
   * 8bit 里再也压不出层次。改成 source-over：本体是微冷灰、迎光面才用近白，
   * 暗部靠底色的深浅表达。
   */
  g.globalCompositeOperation = 'source-over'
  const puffs = 46
  for (let i = 0; i < puffs; i++) {
    const a = (-1.0 + 2.0 * (i / (puffs - 1))) * Math.PI * 0.82 + (rnd() - 0.5) * 0.25
    const ring = 0.80 + 0.20 * rnd()
    const px = cx0 + Math.sin(a) * bw * ring
    const py = cy0 - Math.cos(a) * bh * 1.35 * ring
    /*
     * 半径 0.055~0.095·w 且间距只有 0.04·w：**相邻的圆必须重叠**才连成一片。
     * 上一版半径 0.035~0.065 时，圆弧之间露着缝，屏幕上是一串**独立的泡泡**
     * 排成一条弧，不是一朵云。
     */
    const rr = w * (0.055 + 0.040 * rnd())
    const alpha = 0.72 + 0.22 * rnd()
    // ① 本体：微冷灰的球（比底盘亮一点点，鼓包才浮起来）
    const body = g.createRadialGradient(px, py, 0, px, py, rr)
    body.addColorStop(0, `rgba(238,243,250,${alpha})`)
    body.addColorStop(0.55, `rgba(226,233,244,${alpha * 0.86})`)
    body.addColorStop(1, 'rgba(220,228,240,0)')
    g.fillStyle = body
    g.beginPath()
    g.arc(px, py, rr, 0, Math.PI * 2)
    g.fill()
    /*
     * ② 迎光面（左上）：近白。这是"球被斜上方照亮"唯一可见的证据 ——
     * 只画本体时，一朵云就是一堆同亮度的泡泡，屏幕上只有轮廓没有体积。
     */
    const hl = g.createRadialGradient(px - rr * 0.26, py - rr * 0.30, 0, px - rr * 0.26, py - rr * 0.30, rr * 0.95)
    hl.addColorStop(0, `rgba(253,254,255,${alpha * 0.62})`)
    hl.addColorStop(0.55, `rgba(250,252,255,${alpha * 0.26})`)
    hl.addColorStop(1, 'rgba(250,252,255,0)')
    g.fillStyle = hl
    g.beginPath()
    g.arc(px - rr * 0.26, py - rr * 0.30, rr * 0.95, 0, Math.PI * 2)
    g.fill()
  }
  /*
   * ② 平底：积云的底部是被逆温层"切"平的。
   * 用 destination-out 把底部擦掉 —— 直接画一条不透明横条会把整片云切死，
   * 所以用一条**渐变**擦除（下端全擦、上端不擦），接缝才不硬。
   */
  g.globalCompositeOperation = 'destination-out'
  const cut = g.createLinearGradient(0, h * 0.86, 0, h)
  cut.addColorStop(0, 'rgba(0,0,0,0)')
  cut.addColorStop(0.55, 'rgba(0,0,0,0.85)')
  cut.addColorStop(1, 'rgba(0,0,0,1)')
  g.fillStyle = cut
  g.fillRect(0, h * 0.86, w, h * 0.14)
  /*
   * ③ 下沿阴影：云底比云顶暗一到两档（水汽厚、透光少）。
   * 只在**底部 40%** 叠一层冷灰，且用 'source-atop' —— 只作用在已有云的像素上，
   * 不会在空白处留下灰斑。
   */
  g.globalCompositeOperation = 'source-atop'
  /*
   * 下沿阴影 0.42 → 0.62，色相再往冷蓝走一点：云底是天光透过厚水汽的颜色。
   * 0.42 时整朵云是"一片纯白"，读作棉花糖；压到 0.62 才有"上面白、下面灰"的
   * 体积感（真实积云最显眼的特征就是这条明暗分界）。
   */
  const shade = g.createLinearGradient(0, h * 0.46, 0, h * 0.98)
  shade.addColorStop(0, 'rgba(168,180,198,0)')
  shade.addColorStop(0.55, 'rgba(158,172,192,0.30)')
  shade.addColorStop(1, 'rgba(146,160,182,0.62)')
  g.fillStyle = shade
  /*
   * 填充矩形必须**与渐变的起点对齐**（都是 0.46h）：原来从 0.52h 开始填，
   * 265~300 这一段没画到，于是这一段的下边界上 alpha 从 0 直接跳到 0.13 ——
   * 整朵云中间横着一条**笔直的接缝**（导出贴图一眼就看见，画面上是云被切成两半）。
   */
  g.fillRect(0, h * 0.46, w, h * 0.52)
  g.globalCompositeOperation = 'source-over'
  ;(window as unknown as { __cloudCanvas?: HTMLCanvasElement }).__cloudCanvas = c
  return c
}

/** 一片云的摆放（方位角 / 仰角 / 尺寸，全部是弧度） */
interface CloudSpot {
  az: number
  el: number
  /** 横向角宽 */
  w: number
  /** 纵向角高 */
  h: number
  /** 自转（贴图平转，避免同一朵云被认出来） */
  rot: number
  /** 明暗（0.86~1.08） */
  tone: number
}

/**
 * 云层：一圈朝向球心的四边形。
 *
 * 【为什么不用 Sprite】Sprite 每片一次 draw call，16 片就是 16 次；
 * 而且 Sprite 的 4 个顶点用父级矩阵变换，父级一有非均匀缩放就被拉成面条
 * （船上的灯塔光晕踩过这个坑）。这里用 InstancedMesh + 手动朝向球心。
 */
export function createCloudLayer(): {
  group: THREE.Group
  setNight(night: number): void
  setFog(k: number, color: THREE.Color): void
  dispose(): void
} {
  const group = new THREE.Group()
  group.name = 'deck-clouds'
  /*
   * renderOrder 1：天空穹顶是 0，先画天再画云。
   * depthTest **必须开着**：云在半径 118 上，比港口(20)和船(5)都远 ——
   * 关掉深度测试，云会盖在房子上。depthWrite 关掉，云之间不互相遮挡边缘
   * （它们的 alpha 会让前后关系看不出来，但写深度会把后画的云切掉一条）。
   */
  group.renderOrder = 1

  const R = 118
  /*
   * 16 片，方位角铺满一整圈（视野只有 ±45°，所以背面那几片是浪费，但省下来的
   * 是 CPU 侧的矩阵计算，不是 GPU —— 一片云在屏幕上可能横跨 40°，太少会露出"缝"）。
   * 仰角集中在 2°~26°：天顶留白（抬头看是清的），低空才是积云层。
   */
  /* 固定的 pseudo-random：同一帧两次生成必须一样（图纸与画面要对得上） */
  let s = 12345
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
  const spots: CloudSpot[] = []
  const N = 18
  for (let i = 0; i < N; i++) {
    const az = (i / N) * Math.PI * 2 + (rnd() - 0.5) * 0.22
    /*
     * 仰角 3°~30°，按 pow(rnd, 1.5) 偏下：积云集中在低空。
     * 14 片时一片 66° 的视野里只有一朵（实测），天空显得空；18 片 + 偏下的分布
     * 才让"抬头看到两三朵"这件事成立。再高过 30° 就跑到视野外了（相机略微俯视）。
     */
    const el = (6 + 28 * Math.pow(rnd(), 1.2)) * Math.PI / 180
    // 近地平线的云更大（透视 + 真实积云在低空更密），但不超过 42°
    /*
     * 角宽 11~22°：第一版给 18~42°，一片云横跨半个天 —— 屏幕上是一块
     * 90 单位宽的白板（实测）。真实积云在 30° 视野里也就 10~20°。
     */
    const wAng = (10 + 12 * rnd()) * Math.PI / 180
    spots.push({
      az,
      el,
      w: wAng,
      h: wAng * (0.52 + 0.16 * rnd()),
      rot: (rnd() - 0.5) * 0.10,
      tone: 0.86 + 0.22 * rnd(),
    })
  }

  /*
   * **三张不同的贴图**：一张贴图铺 18 片时，隔着 40° 就能看出左右两朵
   * "同一个模子"（实测截图：画面左右各一朵，轮廓一模一样）。
   * 三个种子 → 三种轮廓，每 6 片一组，三组各一次 draw call。
   */
  const VARIANTS = 3
  const texes: THREE.Texture[] = []
  const mats: THREE.MeshBasicMaterial[] = []
  const meshes: THREE.InstancedMesh[] = []
  const geo = new THREE.PlaneGeometry(1, 1)
  for (let v = 0; v < VARIANTS; v++) {
    const tex = texFrom(makeCloudCanvas(7 + v * 13))
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.InstancedMesh(geo, mat, Math.ceil(spots.length / VARIANTS))
    mesh.name = `deck-cloud-quads-${v}`
    mesh.frustumCulled = false
    group.add(mesh)
    texes.push(tex)
    mats.push(mat)
    meshes.push(mesh)
  }

  const dummy = new THREE.Object3D()
  const tone = new THREE.Color()
  const used = new Array(VARIANTS).fill(0)
  for (let i = 0; i < spots.length; i++) {
    const sp = spots[i]
    const v = i % VARIANTS
    const mesh = meshes[v]
    // 球面坐标 → 世界位置（相机在原点附近，云在半径 118 上）
    const ce = Math.cos(sp.el)
    dummy.position.set(
      Math.sin(sp.az) * ce * R,
      Math.sin(sp.el) * R,
      Math.cos(sp.az) * ce * R,
    )
    dummy.lookAt(0, dummy.position.y * 0.55, 0)
    dummy.rotateZ(sp.rot)
    // 角宽 → 世界尺寸：弦长 ≈ 2·R·tan(角/2)
    dummy.scale.set(2 * R * Math.tan(sp.w * 0.5), 2 * R * Math.tan(sp.h * 0.5), 1)
    dummy.updateMatrix()
    mesh.setMatrixAt(used[v], dummy.matrix)
    tone.setScalar(sp.tone)
    mesh.setColorAt(used[v], tone)
    used[v]++
  }
  for (const m of meshes) {
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }

  /*
   * 云的底色：白天是**暖白**（太阳照亮的一面偏暖），夜里压到很暗的蓝灰
   * （月光下的云只剩一层淡影）。`setNight` 只改材质色，不重建任何东西。
   */
  const DAY = new THREE.Color(0xfdf6e8)
  const NIGHT = new THREE.Color(0x20262f)
  /*
   * 【为什么要有 apply()】`setFog` 每帧都调，如果它在 `mat.opacity` 上做乘法，
   * 一秒钟就乘成 0（透明度指数衰减）。所以两路输入各自存起来，**每次都从
   * night 重新算一遍**再来叠雾。
   */
  let nightK = 1
  let fogK = 0
  const fogColor = new THREE.Color(0xb4bdc2)
  const apply = () => {
    const col = DAY.clone().lerp(NIGHT, nightK).lerp(fogColor, fogK * 0.9)
    // 夜里云几乎看不见：alpha 也要压下去，不然是一圈贴在夜空上的灰斑
    const op = (0.96 - 0.62 * nightK) * (1 - fogK * 0.85)
    for (const m of mats) {
      m.color.copy(col)
      m.opacity = op
    }
  }
  return {
    group,
    setNight(night: number) {
      nightK = Math.min(1, Math.max(0, night))
      apply()
    },
    setFog(k: number, color: THREE.Color) {
      fogK = Math.min(1, Math.max(0, k))
      fogColor.copy(color)
      apply()
    },
    dispose() {
      geo.dispose()
      for (const m of mats) m.dispose()
      for (const t of texes) t.dispose()
    },
  }
}
