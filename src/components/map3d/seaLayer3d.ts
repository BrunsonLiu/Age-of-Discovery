import * as THREE from 'three'
import { lonToWorldX, latToWorldZ, worldXToLon, worldZToLat } from '@/utils/mapProjection'
import { isOnLand, isLandLoaded } from '@/utils/landCheck'
import { useGameStore } from '@/store/useGameStore'
import { DEBRIS_INFO, type DebrisKind } from '@/data/debris'
import { debrisMarkerHtml } from '@/utils/debrisGlyph'

/**
 * 2.5D 立体海图上的**海上物件层**：漂流物 + 海上遗物。
 *
 * 【为什么两者要共用一层】
 * 2D 里海面上漂着可点的木桶/货箱，切到 2.5D 就全没了 ——
 * 玩家会以为"这边的海图少了点什么"，或者更糟：以为东西还在只是自己点不到。
 * 两个视图读的是**同一份 `debrisSpots`**（遗物则是同一份 `RELICS`），
 * 同一段图标 HTML，同一个 collect 动作，所以不存在"这边捞过那边还有"的分歧。
 *
 * 【两类物件的区别】
 *   漂流物：随机生成、会漂走、三天后消失 → 每帧从 store 取，走了就删节点。
 *   海上遗物：**位置固定、永久存在**，拾走才消失 → 由调用方每帧给一份
 *            "当前还剩哪些"（已拾走的自然不在里面）。
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
 * 海名标签在 -0.0862；物件取 -0.085，比海面高一点点，
 * 免得在斜俯视下被读成"沉在水底"。
 */
const DEBRIS_Y = -0.085

/** 两个物件至少要隔开这么远，44px 的热区才不会互相盖住 */
const MIN_GAP = 50

/**
 * 疏散偏移的**数值兜底**：只用来防异常把图标甩到屏幕外，不是「靠岸安全半径」。
 *
 * 别把它设成 24px：那是旧日志里记的「实测最多偏离锚点」，但 3 个物件投影只差
 * 1~3px 时，要收敛到 MIN_GAP=50px 的间距本来就需要更大的位移。实测钳在 24px 后
 * 最小间距掉到 34px，热区重新互相盖住（debris-3d.mjs 抓到）。
 * 真正防止图标画到陆地上，靠下面按 isOnLand 做的反投影否决。
 */
const MAX_OFFSET = MIN_GAP * 1.5

/**
 * 固定位置的海上物件（海上遗物）。
 *
 * 与漂流物的差别：位置是**钉死**的（每件遗物都在真实发生过事情的地方），
 * 所以不需要"每帧重新生成"；但"已拾走就不再显示"这条要由调用方负责——
 * 它每帧给一份"当前还剩哪些"。
 */
export interface SeaStaticItem {
  id: string
  lat: number
  lng: number
  /** 图标 HTML（与 2D 用同一段，见 utils/relicGlyph） */
  html: string
  /** 悬浮提示 */
  title: string
  /** 点击动作 */
  onClick: () => void
}

interface Node {
  el: HTMLButtonElement
  /** 漂流物用 kind 判「漂走了没有」；固定物件用 staticId 判「还在不在」 */
  kind?: DebrisKind
  staticId?: string
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

export interface SeaLayer3d {
  update(camera: THREE.PerspectiveCamera, width: number, height: number, tmpV: THREE.Vector3): void
  destroy(): void
}

export function createSeaLayer3d(
  mount: HTMLElement,
  /** 每帧问一次"当前还剩哪些固定物件"（已拾走的自然不在里面） */
  getStaticItems: () => SeaStaticItem[] = () => [],
): SeaLayer3d {
  const nodes = new Map<string, Node>()
  /** 复用的反投影向量，避免每帧 new 一个 Vector3 */
  const rayDir = new THREE.Vector3()

  const makeNode = (
    id: string,
    html: string,
    title: string,
    onClick: () => void,
    className: string,
    dataAttr: string,
  ): Node => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = className
    el.innerHTML = html
    el.title = title
    el.setAttribute('aria-label', title)
    el.setAttribute(dataAttr, id)
    const stop = (e: Event) => e.stopPropagation()
    el.addEventListener('pointerdown', stop)
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      // 用 id 而不是"离船最近"：玩家点的是看见的那一个
      onClick()
    })
    mount.appendChild(el)
    return { el, left: NaN, top: NaN }
  }

  return {
    update(camera, width, height, tmpV) {
      const spots = useGameStore.getState().debrisSpots
      const statics = getStaticItems()
      const kindById = new Map(spots.map(s => [s.id, s.kind]))
      const staticById = new Map(statics.map(s => [s.id, s]))

      // 先删走漂走的（含刚被打捞的）与已拾走的遗物
      for (const [id, node] of nodes) {
        const alive = node.staticId !== undefined
          ? staticById.has(id)
          : kindById.get(id) === node.kind
        if (alive) continue
        node.el.remove()
        nodes.delete(id)
      }

      const items: Item[] = []

      for (const spot of spots) {
        let node = nodes.get(spot.id)
        if (!node) {
          node = makeNode(
            spot.id,
            debrisMarkerHtml(spot.kind),
            `打捞：${DEBRIS_INFO[spot.kind].label}`,
            () => useGameStore.getState().collectDebris(spot.id),
            'debris-icon debris3d-icon',
            'data-debris-id',
          )
          node.kind = spot.kind
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

      for (const s of statics) {
        let node = nodes.get(s.id)
        if (!node) {
          node = makeNode(s.id, s.html, s.title, s.onClick, 'relic-icon relic3d-icon', 'data-relic-id')
          node.staticId = s.id
          nodes.set(s.id, node)
        }

        tmpV.set(lonToWorldX(s.lng), DEBRIS_Y, latToWorldZ(s.lat))
        tmpV.project(camera)
        const behind = tmpV.z >= 1
        const ax = ((tmpV.x + 1) / 2) * width
        const ay = ((-tmpV.y + 1) / 2) * height
        const onScreen = ax > -HIT && ax < width + HIT && ay > -HIT && ay < height + HIT
        items.push({ id: s.id, node, ax, ay, visible: !behind && onScreen })
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
        // 锚点要一起带进松弛：疏散后的偏移上限与「落陆地就退回」都要用到它
        .map(it => ({ node: it.node, x: it.ax, y: it.ay, ax: it.ax, ay: it.ay }))

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

      /*
       * 【疏散的安全边界】松弛只在屏幕空间两两推开，不知道推到的地方是海还是陆地：
       * 靠岸时可能把图标推到岸上（"点木桶捞到零钱"是另一类错，已经修过；
       * 这里是"图标画在陆地上"）。做两件事：
       *   ① 把偏移钳在 MAX_OFFSET 内，只防数值异常甩飞，不限制正常疏散；
       *   ② 把最终屏幕点反投影回海面平面，查 isOnLand；落陆地就绕锚点找
       *      一个「海面 + 与其余点 ≥44px」的替代位，找不到才退回锚点
       *      —— 锚点是漂流物生成时保证过的海面点。
       * 陆地数据没加载完时只做 ①，不靠猜测判海陆。
       * 代价要说清楚：极端贴岸、四周全是陆地时仍会退回锚点，两两只差 1~3px；
       * 这时优先保证"图标不画在陆地上"，因为画错地方比挤在一起更容易点空。
       * 简单退回锚点是不行的：实测两两间距会掉到 34px，热区重新互相盖住。
       */
      const landReady = isLandLoaded()
      /** 屏幕点 → 反投影回海面平面 → 查是不是陆地（复用项目自己的投影函数） */
      const onLandAt = (sx: number, sy: number): boolean => {
        rayDir.set((sx / width) * 2 - 1, -(sy / height) * 2 + 1, 0.5)
          .unproject(camera).sub(camera.position)
        if (Math.abs(rayDir.y) < 1e-6) return false
        const t = (DEBRIS_Y - camera.position.y) / rayDir.y
        if (t <= 0) return false
        return isOnLand(
          worldZToLat(camera.position.z + rayDir.z * t),
          worldXToLon(camera.position.x + rayDir.x * t),
        )
      }
      for (const pt of pts) {
        const ox = pt.x - pt.ax, oy = pt.y - pt.ay
        const off = Math.hypot(ox, oy)
        if (off > MAX_OFFSET) {
          pt.x = pt.ax + (ox / off) * MAX_OFFSET
          pt.y = pt.ay + (oy / off) * MAX_OFFSET
        }
      }
      if (landReady) {
        for (const pt of pts) {
          if (!onLandAt(pt.x, pt.y)) continue
          /*
           * 不能简单退回锚点：实测那样做两两中心距掉到 34px，热区又互相盖住
           * （debris-3d.mjs 抓到）。以锚点为圆心绕一圈，找一个既在海面、
           * 又与其余点 ≥44px 的位置；找不到才退回，并承认这时间距可能让步。
           */
          const baseR = Math.max(MIN_GAP, Math.hypot(pt.x - pt.ax, pt.y - pt.ay))
          let placed = false
          for (let k = 0; k < 16 && !placed; k++) {
            const a = k * Math.PI / 8
            for (const r of [baseR, MIN_GAP, MIN_GAP * 1.5]) {
              const nx = pt.ax + Math.cos(a) * r
              const ny = pt.ay + Math.sin(a) * r
              if (onLandAt(nx, ny)) continue
              if (pts.some(o => o !== pt && Math.hypot(o.x - nx, o.y - ny) < 44)) continue
              pt.x = nx; pt.y = ny; placed = true
              break
            }
          }
          if (!placed) { pt.x = pt.ax; pt.y = pt.ay }
        }
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
