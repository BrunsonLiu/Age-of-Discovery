import * as THREE from 'three'
import { lonToWorldX, latToWorldZ } from '@/utils/mapProjection'
import { useGameStore } from '@/store/useGameStore'
import { DEBRIS_INFO, type DebrisKind } from '@/data/debris'
import { debrisMarkerHtml } from '@/utils/debrisGlyph'

/**
 * 2.5D 立体海图上的漂流物层。
 *
 * 【为什么也要有】2D 里海面上漂着可点的木桶/货箱，切到 2.5D 就全没了 ——
 * 玩家会以为"这边的海图少了点什么"，或者更糟：以为东西还在只是自己点不到。
 * 两个视图读的是**同一份 `debrisSpots`**，同一段图标 HTML，同一个
 * `collectDebris(id)`，所以不存在"这边捞过那边还有"的分歧。
 *
 * 【为什么是 DOM 而不是 three.js 的 Sprite / 小网格】
 * 1. 与标签层（`mapLabels3d.ts`）同一套办法：把世界坐标 `.project(camera)`
 *    成屏幕像素，绝对定位一个 div。相机怎么转它都跟着走。
 * 2. 图标是 SVG，DOM 任意缩放都锐利；Sprite 靠 Canvas 纹理会糊。
 * 3. 命中区域直接就是 44×44 的 button，不用写 raycaster ——
 *    而 3D 里那个 raycaster 只认港口模型和海面，加小网格还得改判定顺序。
 *
 * 【为什么点击不会顺带设航点】canvas 上的 `pointerdown` 绑在
 * `renderer.domElement` 上，而这些 button 是 canvas 的**兄弟节点**（同挂在
 * mount 下），事件不会冒泡经过 canvas。仍然 `stopPropagation()` 一次，
 * 免得以后有人给 mount 加全局手势时把这次点击又解释成"拖动地图"。
 *
 * 【为什么每帧只写变化的值】相机静止时 3 个物件的 left/top 一帧都没变；
 * 无脑写样式会让浏览器每帧解析 6 次 CSS，标签层早先就吃过这个亏。
 */

/** 与 2D 的手指下限一致：图标视觉 19px，热区 44px */
const HIT = 44
/**
 * 贴海面的高度。海面平面在 `-(PLATE_THICKNESS + 0.004)` = -0.089，
 * 海名标签在 -0.0862；漂流物取 -0.085，比海面高一点点，
 * 免得在斜俯视下被读成"沉在水底"。
 */
const DEBRIS_Y = -0.085

/** 两个漂流物至少要隔开这么远，44px 的热区才不会互相盖住 */
const MIN_GAP = 50

interface Node {
  el: HTMLButtonElement
  kind: DebrisKind
  /** 上一次真正写进 DOM 的值。undefined = 还没写过（第一帧必须写一次） */
  shown?: boolean
  left: number
  top: number
}

interface Item {
  id: string
  node: Node
  /** 真实投影锚点（屏幕像素） */
  ax: number
  ay: number
  visible: boolean
}

export interface DebrisLayer3d {
  update(camera: THREE.PerspectiveCamera, width: number, height: number, tmpV: THREE.Vector3): void
  destroy(): void
}

export function createDebrisLayer3d(mount: HTMLElement): DebrisLayer3d {
  const nodes = new Map<string, Node>()

  const make = (id: string, kind: DebrisKind): Node => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'debris-icon debris3d-icon'
    el.innerHTML = debrisMarkerHtml(kind)
    el.title = `打捞：${DEBRIS_INFO[kind].label}`
    el.setAttribute('aria-label', el.title)
    el.dataset.debrisId = id
    const stop = (e: Event) => e.stopPropagation()
    el.addEventListener('pointerdown', stop)
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      // 用 id 而不是"离船最近"：玩家点的是看见的那一个
      useGameStore.getState().collectDebris(id)
    })
    mount.appendChild(el)
    return { el, kind, left: NaN, top: NaN }
  }

  return {
    update(camera, width, height, tmpV) {
      const spots = useGameStore.getState().debrisSpots
      const kindById = new Map(spots.map(s => [s.id, s.kind]))

      // 先删走漂走的（含刚被打捞的）
      for (const [id, node] of nodes) {
        if (kindById.get(id) === node.kind) continue
        node.el.remove()
        nodes.delete(id)
      }

      const items: Item[] = []

      for (const spot of spots) {
        let node = nodes.get(spot.id)
        if (!node) {
          node = make(spot.id, spot.kind)
          nodes.set(spot.id, node)
        }

        tmpV.set(lonToWorldX(spot.lng), DEBRIS_Y, latToWorldZ(spot.lat))
        tmpV.project(camera)
        // z>=1 = 在相机背后（project 不做透视除法），此时算出来的屏幕坐标是错的
        const behind = tmpV.z >= 1
        const ax = ((tmpV.x + 1) / 2) * width
        const ay = ((-tmpV.y + 1) / 2) * height
        const onScreen = ax > -HIT && ax < width + HIT && ay > -HIT && ay < height + HIT
        items.push({ id: spot.id, node, ax, ay, visible: !behind && onScreen })
      }

      /*
       * 屏幕空间疏散：把靠得太近的点互相推开，直到两两 ≥ MIN_GAP。
       *
       * 【为什么必须做】漂流物生成在船附近 8~30 海里，而 1 世界单位 ≈ 1080 海里。
       * 3D 默认远景下这点距离投影只有 **1~3px**，三个 44px 热区会严严实实叠在
       * 一起：玩家点木桶的中心，命中的却是最后创建的零钱，捞到别的东西。
       *
       * 【为什么不用"按拥挤度乘一个半径"】试过线性 spread：dmin=20px 时只散开
       * 18px，叠加原始偏移后 barrel 与 coins 中心仍只差 15px，**点击照样串**。
       * 避让类问题要到"结果满足约束"为止，不能只按输入强度给个比例。
       *
       * 【为什么不用标签那套离散候选位】标签是矩形文字、各有 6 个候选位，
       * 选中就跳一格；物件是点、相机每帧在动，离散跳位会抖。松弛法对每个
       * 微小输入变化给出微小输出变化，收敛后静止时一帧都不再改 DOM。
       */
      const vis = items.filter(i => i.visible)
      const pts = vis
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(it => ({ node: it.node, x: it.ax, y: it.ay }))

      for (let iter = 0; iter < 6; iter++) {
        let moved = false
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            let dx = pts[j].x - pts[i].x
            let dy = pts[j].y - pts[i].y
            let d = Math.hypot(dx, dy)
            if (d >= MIN_GAP) continue
            if (d < 0.01) {
              // 完全重合时没有方向可推：按稳定序号给一个确定性方向，
              // 否则 0/0 会让几个点永远叠在一起
              const a = -Math.PI / 2 + (i + j) * (2 * Math.PI / 3)
              dx = Math.cos(a) * 0.01
              dy = Math.sin(a) * 0.01
              d = 0.01
            }
            const push = (MIN_GAP - d) / (2 * d)
            pts[i].x -= dx * push; pts[i].y -= dy * push
            pts[j].x += dx * push; pts[j].y += dy * push
            moved = true
          }
        }
        if (!moved) break
      }

      const placed = new Map<Node, { x: number; y: number }>()
      for (const pt of pts) placed.set(pt.node, { x: pt.x, y: pt.y })

      for (const it of items) {
        const { node, visible } = it
        if (node.shown !== visible) {
          node.el.style.display = visible ? 'block' : 'none'
          node.shown = visible
        }
        if (!visible) continue
        const p = placed.get(node)!
        const left = p.x - HIT / 2
        const top = p.y - HIT / 2
        if (node.left !== left) { node.el.style.left = `${left}px`; node.left = left }
        if (node.top !== top) { node.el.style.top = `${top}px`; node.top = top }
      }
    },
    destroy() {
      for (const node of nodes.values()) node.el.remove()
      nodes.clear()
    },
  }
}
