import * as THREE from 'three'
import { latToWorldZ, lonToWorldX } from '@/utils/mapProjection'
import { createPortLabel, type ScreenLabel } from './mapLabels3d'

/**
 * 传说与故事线的**3D 海图标记**。
 *
 * 【为什么必须补这一层】2D 海图上有金色传说圈（`map/NationLegend`）和三段航路的
 * 菱形（`map/NationStory`），但切到立体海图之后它们**全部消失** —— 玩家不会
 * 想到"这是渲染层的差别"，只会觉得"这边少了东西"，或者干脆忘了还有一片海没去。
 * 而"回来有个东西在等你"正是这套游戏的留存机制。
 *
 * 【为什么不用"真实半径的圆"】90 海里在立体海图上只有 0.09 世界单位
 * （MAP_WORLD_SIZE=20 铺 360°），默认视野下约 4 像素 —— 画出来是个点，
 * 而且**会谎报范围**（玩家以为圈住的就是全部兑现区）。这里只放一个恒定屏幕
 * 尺寸的金色标记：它宣称的是"这里有东西"，不宣称"这个圈多大"。
 *
 * 【为什么用 sizeAttenuation:false】立体海图的缩放范围很大（整块板 → 单港特写）。
 * 跟着世界缩放的标记在远景下会消失、在近景下会变成一块大金牌。恒定屏幕尺寸
 * 才是"图标"的正确行为（与 2D 的图标一致）。
 */

export type LegendMarkKind = 'legend' | 'story'

/**
 * 当前该出现的标记（纯函数，给单测与 3D 层共用）。
 *
 * 【为什么单独抽出来】它决定"图上有没有东西在等你"，是这个功能的**语义**；
 * 网格怎么摆是渲染的事。抽成纯函数之后再接 store 就只是传三个字段的胶水，
 * 而判据可以断言"兑现过的传说不再出现""故事只出现下一段"。
 */
export function buildLegendMarks(
  st: { nation: string | null; collectedLegends?: readonly string[]; storyDone?: readonly string[] },
  portsList: readonly { id: number; nameCn: string; latitude: number; longitude: number }[],
  legendOf: (nation: string | null, collected: readonly string[]) => { lat: number; lng: number; name: string } | null,
  chapterOf: (nation: string | null, done: readonly string[]) => { id: string; portId: number } | null,
): LegendMark[] {
  const out: LegendMark[] = []
  const lg = legendOf(st.nation, st.collectedLegends ?? [])
  if (lg) out.push({ lat: lg.lat, lng: lg.lng, kind: 'legend', label: lg.name })
  const ch = chapterOf(st.nation, st.storyDone ?? [])
  if (ch) {
    const p = portsList.find((x) => x.id === ch.portId)
    /*
     * 位置就是**那个港口本身**（不偏不倚）：偏几度会让玩家以为目的地在
     * 港外的海上 —— "图上说的与实际发生的不一致"是本项目最忌讳的一类错。
     * 段号画在图标贴图里，所以不需要 DOM 标签，也就不会和港口名抢位置。
     */
    if (p) {
      out.push({
        lat: p.latitude,
        lng: p.longitude,
        kind: 'story',
        label: '',
        chapter: Number(ch.id.split('-').pop()) || 1,
      })
    }
  }
  return out
}

export interface LegendMark {
  lat: number
  lng: number
  kind: LegendMarkKind
  /** 标签文字（"圣布伦丹岛"）；故事标记不用（段号画在图标里） */
  label: string
  /** 故事线的第几段（1~3），只有 kind==='story' 用 */
  chapter?: number
}

/** 一个标记的贴图：传说＝八角星，故事＝菱形。金色，带一圈淡光。 */
function makeMarkTexture(kind: LegendMarkKind, num = 0): THREE.Texture {
  const S = 96
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')!
  const cx = S / 2
  const cy = S / 2
  // 光晕（两种标记共用）
  const halo = g.createRadialGradient(cx, cy, 0, cx, cy, S / 2)
  halo.addColorStop(0, 'rgba(255,226,160,0.55)')
  halo.addColorStop(0.45, 'rgba(240,200,130,0.18)')
  halo.addColorStop(1, 'rgba(240,200,130,0)')
  g.fillStyle = halo
  g.fillRect(0, 0, S, S)
  g.strokeStyle = '#f0d79a'
  g.fillStyle = 'rgba(240,215,154,0.92)'
  g.lineWidth = 2
  if (kind === 'legend') {
    // 八角星：外径 26、内径 11
    g.beginPath()
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 - Math.PI / 2
      const r = i % 2 === 0 ? 26 : 10
      const x = cx + Math.cos(a) * r
      const y = cy + Math.sin(a) * r
      if (i === 0) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.closePath()
    g.fill()
    // 中心一个小实心圆：远景下星形会糊成一个点，圆保证"那里有东西"
    g.beginPath()
    g.arc(cx, cy, 6, 0, Math.PI * 2)
    g.fillStyle = '#fff6e0'
    g.fill()
  } else {
    // 菱形：旋转 45° 的方块，边长 22
    g.beginPath()
    g.moveTo(cx, cy - 24)
    g.lineTo(cx + 17, cy)
    g.lineTo(cx, cy + 24)
    g.lineTo(cx - 17, cy)
    g.closePath()
    g.fill()
    g.strokeStyle = 'rgba(90,70,30,0.55)'
    g.stroke()
    /*
     * 段号写在菱形里面（**不做 DOM 标签**）：目的地本身就是一个港口，
     * 港口名已经挂在图上了 —— 再加一行"第 1 段 · 哈瓦那"会和港口名挤在一起，
     * 两行字互相压（实测截图：标签被避让推到港名正上方，糊成一块）。
     * 2D 那边也是把段号画在图标里，这里保持一致。
     */
    if (num > 0) {
      g.fillStyle = '#2b2418'
      g.font = 'bold 20px "Noto Serif SC", serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(String(num), cx, cy + 1)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export interface LegendLayer3d {
  group: THREE.Group
  /** 标签（调用方把它并进 `${allLabels}`，由 placeLabels 统一避让） */
  labels: ScreenLabel[]
  update(t: number, night: number): void
  dispose(): void
}

/**
 * 建一层传说/故事标记。
 *
 * `marks` 由调用方按 store 现状算好传进来（只传**当前该出现**的那些）：
 * 传说兑现过就不再出现；故事只出现"下一段"的目的地。
 */
export function createLegendLayer3d(mount: HTMLElement, marks: LegendMark[]): LegendLayer3d {
  const group = new THREE.Group()
  group.name = 'map3d-legends'
  const disposables: { dispose(): void }[] = []
  const labels: ScreenLabel[] = []
  const sprites: THREE.Sprite[] = []
  const ringMats: THREE.MeshBasicMaterial[] = []

  const texLegend = makeMarkTexture('legend')
  disposables.push(texLegend)
  // 故事标记的段号是画在贴图里的，每段一张（同时只会存在一个）
  const storyNums = new Map<number, THREE.Texture>()

  for (const m of marks) {
    const x = lonToWorldX(m.lng)
    const z = latToWorldZ(m.lat)
    /*
     * 高度 0.05：陆地顶面是 0、港口底座顶面约 0.06 —— 放在两者之间，
     * 标记不会陷进地里，也不会浮在港口房子上方。
     */
    const y = 0.05
    let storyTex: THREE.Texture | null = null
    if (m.kind === 'story') {
      const num = m.chapter ?? 1
      storyTex = storyNums.get(num) ?? makeMarkTexture('story', num)
      if (!storyNums.has(num)) {
        storyNums.set(num, storyTex)
        disposables.push(storyTex)
      }
    }
    const mat = new THREE.SpriteMaterial({
      map: m.kind === 'legend' ? texLegend : storyTex!,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: false,
    })
    const sp = new THREE.Sprite(mat)
    sp.position.set(x, y, z)
    // 0.030 ≈ 27px（900 高）：与 2D 的 26px 图标同量级
    const s = m.kind === 'legend' ? 0.034 : 0.026
    sp.scale.set(s, s, 1)
    sp.renderOrder = 6
    sp.name = `map3d-legend-${m.kind}`
    group.add(sp)
    sprites.push(sp)
    disposables.push(mat)

    /*
     * 传说再加一个**缓慢呼吸的圆环**：单靠一个静止图标，在满是港口模型的海图上
     * 读不出"这是还没完成的事"。环的半径固定 0.09 世界单位（约 4 像素），
     * 只做透明度呼吸 —— 它宣称的是"这里有事情"，不是"这个圈多大"。
     */
    if (m.kind === 'legend') {
      const ringGeo = new THREE.RingGeometry(0.075, 0.09, 32)
      ringGeo.rotateX(-Math.PI / 2)
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xe8c98a,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.position.set(x, 0.018, z)
      ring.renderOrder = 5
      ring.name = 'map3d-legend-ring'
      group.add(ring)
      ringMats.push(ringMat)
      disposables.push(ringGeo, ringMat)
    }

    /*
     * 标签：**只有传说给名字**。故事标记的段号已经画在菱形里，目的地就是那个
     * 港口本身（港口名就在旁边）—— 再加一行会和港名挤成一团。
     */
    if (m.kind === 'legend') {
      labels.push(createPortLabel(mount, m.label, x, z, 'legend'))
    }
  }

  return {
    group,
    labels,
    update(t: number, night: number) {
      // 呼吸：0.34~0.72，周期约 3.4 秒。夜里更亮一点（白天在浅色海图上金色会糊）
      const k = 0.34 + 0.38 * (0.5 + 0.5 * Math.sin(t * 1.85))
      for (const rm of ringMats) rm.opacity = k * (0.85 + 0.35 * night)
      for (const sp of sprites) {
        // 图标本身也轻微呼吸，和环同步 —— 两个东西各自呼吸时会读成"闪烁"
        const m = sp.material as THREE.SpriteMaterial
        m.opacity = 0.72 + 0.28 * (0.5 + 0.5 * Math.sin(t * 1.85))
      }
    },
    dispose() {
      for (const d of disposables) d.dispose()
      for (const l of labels) l.el.remove()
      labels.length = 0
    },
  }
}
