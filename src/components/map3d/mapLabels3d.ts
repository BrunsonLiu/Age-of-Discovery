import * as THREE from 'three'
import { lonToWorldX, latToWorldZ } from '@/utils/mapProjection'
import { OCEAN_LABELS, REGION_LABELS } from '@/data/mapLayers'

/**
 * 2.5D 立体海图的**屏幕标签层**。
 *
 * 【为什么标签是 DOM 而不是 three.js 的 Sprite】
 * 1. 文字清晰度：DOM 由浏览器排版，任意缩放都锐利；
 *    Sprite 靠 Canvas 纹理，缩小后字会糊。
 * 2. 与 2D 视图一致：2D 的海名/洲名/港口名全是 DOM 标签，
 *    3D 用同一种机制，玩家切视图时看到的排版习惯不变。
 * 3. 成本：Canvas 纹理要按标签数各生成一张（28 张文字纹理），
 *    而 DOM 标签只是几个绝对定位的 div。
 *
 * 【为什么单独抽成模块】
 * 原来港口标签的投影与避让逻辑直接写在 Map3DView 的帧循环里，
 * 现在要加 18 个洋名 + 10 个洲名，三类标签必须共用同一套
 * 「投影 → 排序 → 避让 → 落位」流程，共用才有一致的行为。
 *
 * 【数据来源】
 * 海名/洲名来自 `@/data/mapLayers`——与 2D 的 OceanLabels 同一份定义。
 * 两个视图看到不同的地名，就是"承诺不兑现"。
 */

/** 标签类别。priority 越小越先占位（越重要的标签越不容易被挤掉）。 */
export type LabelKind = 'port' | 'region' | 'ocean'

export interface ScreenLabel {
  el: HTMLDivElement
  kind: LabelKind
  /** 锚点的世界坐标（x=东, z=南, y=高度） */
  x: number
  y: number
  z: number
  /** 像素尺寸缓存。文字不变，所以只需量一次（见 measureLabels） */
  w: number
  h: number
  /** 本帧是否参与布局 */
  shown: boolean
  /**
   * 上一次真正写进 DOM 的可见性 / 位置（缓存，避免每帧重复写样式）。
   *
   * 【为什么要缓存】
   * placeLabels 每帧都跑，48 个标签 × (display + left + top) = 每帧 144 次样式写。
   * 而玩家看海图时相机常常是静止的，位置一点没变却照样重写一遍。
   * 给相同值赋值浏览器虽然会跳过重排，但 CSSStyleDeclaration 的赋值本身要走
   * 解析 + 比较，实测这一次白写是纯浪费。
   * 这里只在「真的变了」时写，相机静止时 DOM 一次都不碰。
   */
  domShown?: boolean
  domLeft?: number
  domTop?: number
}

/** 锚点高度：港口名挂在模型上方，海名贴海面，洲名贴陆地顶面 */
const PORT_LABEL_Y = 0.30
const SEA_LABEL_Y = -0.0862   // 与风带箭头同一层：紧贴海面
const LAND_LABEL_Y = 0.004    // 略高于陆地顶面（y=0），避免被顶面 z-fighting

/**
 * 造海名/洲名的 DOM 元素。
 *
 * 港口标签由 Map3DView 创建（它要知道港口的发现状态），
 * 这里只负责静态的区域名。
 */
export function createAreaLabels(mount: HTMLElement): ScreenLabel[] {
  const out: ScreenLabel[] = []

  for (const l of OCEAN_LABELS) {
    const el = document.createElement('div')
    el.className = 'map3d-area-label map3d-area-label--ocean'
    el.textContent = l.name
    mount.appendChild(el)
    out.push({
      el, kind: 'ocean',
      x: lonToWorldX(l.lng), y: SEA_LABEL_Y, z: latToWorldZ(l.lat),
      w: 0, h: 0, shown: true,
    })
  }

  for (const l of REGION_LABELS) {
    const el = document.createElement('div')
    el.className = 'map3d-area-label map3d-area-label--region'
    el.textContent = l.name
    mount.appendChild(el)
    out.push({
      el, kind: 'region',
      x: lonToWorldX(l.lng), y: LAND_LABEL_Y, z: latToWorldZ(l.lat),
      w: 0, h: 0, shown: true,
    })
  }

  return out
}

/** 港口标签的元素工厂（尺寸与样式由 CSS 决定，这里只给锚点高度） */
export function createPortLabel(mount: HTMLElement, text: string, x: number, z: number): ScreenLabel {
  const el = document.createElement('div')
  el.className = 'map3d-port-label'
  el.textContent = text
  mount.appendChild(el)
  return { el, kind: 'port', x, y: PORT_LABEL_Y, z, w: 0, h: 0, shown: true }
}

/**
 * 批量测量所有标签的像素尺寸，并缓存起来。
 *
 * 【为什么必须缓存，而不是每帧读 offsetWidth】
 * offsetWidth 是**布局属性**，读它会强制浏览器同步重排（reflow）。
 * 原来的代码在帧循环里交替读 offsetWidth 与写 style.left/top，
 * 每个标签各触发一次强制重排——20 个港口标签 = 每帧 20 次 reflow。
 * 标签文字是静态的，尺寸永远不变，量一次就够。
 *
 * 【两阶段：先全部显示，再全部读，最后全部恢复】
 * 读 offsetWidth 会触发重排。如果「显示→读→恢复」在循环里交替做，
 * 48 个标签就是 48 次重排。改成三个阶段后只重排一次：
 *   阶段1  全部设为可见（写）
 *   阶段2  全部读尺寸（读）→ 只触发一次重排
 *   阶段3  全部恢复原状（写）
 * 测量期间用 visibility:hidden 而非 display:none——
 * display:none 的元素没有布局盒，offsetWidth 恒为 0，读不到尺寸。
 *
 * 【为什么还要在字体就绪后重量一次】
 * 中文标签用的是 Crimson Text（web font），字体没加载完时
 * 浏览器用后备字体排版，宽度会偏小。document.fonts.ready 之后重量一次。
 */
export function measureLabels(labels: ScreenLabel[]): void {
  const prevDisplay: string[] = []
  const prevVisibility: string[] = []

  // 阶段 1：全部显示（写）
  for (let i = 0; i < labels.length; i++) {
    prevDisplay.push(labels[i].el.style.display)
    prevVisibility.push(labels[i].el.style.visibility)
    labels[i].el.style.display = 'block'
    labels[i].el.style.visibility = 'hidden'
  }
  // 阶段 2：全部读尺寸（只触发一次重排）
  for (const l of labels) {
    l.w = l.el.offsetWidth || Math.max(24, l.el.textContent!.length * 13)
    l.h = l.el.offsetHeight || 16
  }
  // 阶段 3：全部恢复（写）
  // 恢复后把可见性缓存对齐 —— 测量期间 display 被临时改成 block，
  // 缓存（domShown）必须跟着实际值走，否则 placeLabels 会以为"已经显示着"而漏写。
  for (let i = 0; i < labels.length; i++) {
    labels[i].el.style.display = prevDisplay[i]
    labels[i].el.style.visibility = prevVisibility[i]
    labels[i].domShown = prevDisplay[i] !== 'none'
  }
}

/** 字体加载完成后重量一次（web font 落地后备字体会变宽） */
export function remeasureWhenFontsReady(labels: ScreenLabel[]): void {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
  if (!fonts) return
  fonts.ready.then(() => measureLabels(labels)).catch(() => { /* 字体加载失败就用后备字体 */ })
}

interface Candidate {
  label: ScreenLabel
  anchorX: number
  anchorY: number
  /** 锚点模式：'bottom' = 标签底边中点对齐锚点（港口名）；'center' = 标签中心对齐锚点（区域名） */
  mode: 'bottom' | 'center'
}

/** 标签优先级：港口 > 洲名 > 洋名 */
function priorityOf(kind: LabelKind): number {
  return kind === 'port' ? 0 : kind === 'region' ? 1 : 2
}

/**
 * 把标签投影到屏幕、互相避让、批量落位。
 *
 * 【避让规则】
 * - 港口名（'port'）：允许六个候选位（正上/正下/右上/左上/右下/左下），
 *   都撞上就隐藏。它标的是具体点位，挪一点仍然指得对。
 * - 区域名（'region'/'ocean'）：**只允许居中一个位置**，撞上就隐藏。
 *   区域名一挪位置就"说谎"了——"大西洋"跑到非洲旁边会误导玩家。
 *   宁可少显示一个名字，也不能让名字指错地方。
 *
 * 【为什么批量写】
 * 先把所有位置算完，最后统一写 style。读写分离后，
 * 循环里不再有「读布局 → 写样式」的交替，不触发强制重排。
 */
export function placeLabels(
  labels: ScreenLabel[],
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  tmpV: THREE.Vector3,
): void {
  const cands: Candidate[] = []

  for (const l of labels) {
    if (!l.shown) {
      hideLabel(l)
      continue
    }
    tmpV.set(l.x, l.y, l.z)
    tmpV.project(camera)
    // z>=1 表示在相机背后（project 对背后的点不做透视除法）
    if (tmpV.z >= 1) {
      hideLabel(l)
      continue
    }
    const anchorX = ((tmpV.x + 1) / 2) * width
    const anchorY = ((-tmpV.y + 1) / 2) * height
    cands.push({
      label: l,
      anchorX,
      anchorY,
      mode: l.kind === 'port' ? 'bottom' : 'center',
    })
  }

  // 优先级高的先占位（港口 > 洲名 > 洋名）；同优先级按屏幕 y 从上往下
  cands.sort((a, b) => {
    const p = priorityOf(a.label.kind) - priorityOf(b.label.kind)
    if (p !== 0) return p
    return a.anchorY - b.anchorY
  })

  const placed: { x: number; y: number; w: number; h: number }[] = []
  const writes: { label: ScreenLabel; left: number; top: number }[] = []

  for (const c of cands) {
    const { label, anchorX, anchorY, mode } = c
    const w = label.w
    const h = label.h
    // baseX/baseY = 标签左上角位置
    const baseX = anchorX - w / 2
    const baseY = mode === 'bottom' ? anchorY - h : anchorY - h / 2

    const offsets: [number, number][] =
      mode === 'bottom'
        ? [
            [0, 0],                  // 正上方
            [0, h + 3],              // 正下方
            [w * 0.62, -2],          // 右上
            [-w * 0.62, -2],         // 左上
            [w * 0.62, h + 1],       // 右下
            [-w * 0.62, h + 1],      // 左下
          ]
        : [[0, 0]]                 // 区域名只认居中这一个位置

    let best: { x: number; y: number; w: number; h: number } | null = null
    for (const [dx, dy] of offsets) {
      const box = { x: baseX + dx, y: baseY + dy, w, h }
      // 越界检查用**标签自己的矩形**，不是锚点。
      // 只查锚点的话，边缘上的标签会有一半被裁在视口外
      // （实测「日本海」就是这样：锚点还在屏内，文字却已经出屏）。
      if (box.x < 0 || box.y < 0 || box.x + box.w > width || box.y + box.h > height) continue
      const hit = placed.some(p =>
        box.x < p.x + p.w && box.x + box.w > p.x &&
        box.y < p.y + p.h && box.y + box.h > p.y)
      if (!hit) { best = box; break }
    }
    if (!best) {
      // 无处可放 → 隐藏该标签（宁缺勿叠）。
      // 【必须走 hideLabel】这里如果直接写 el.style.display = 'none'，
      // 缓存还会以为"正显示着"，下一帧即使能落位也不会写回 block ——
      // 标签就永久卡在隐藏状态（实测 48 个标签全变 none 就是这么来的）。
      hideLabel(label)
      continue
    }
    placed.push(best)
    // transform 决定 left/top 的含义：
    //   港口名 translate(-50%,-100%) → left/top 是底边中点
    //   区域名 translate(-50%,-50%)  → left/top 是中心点
    // 所以要按各自的语义换算，不能一刀切。
    const left = best.x + w / 2
    const top = mode === 'bottom' ? best.y + h : best.y + h / 2
    writes.push({ label, left, top })
  }

  // 统一写入：只在真的变了时碰 DOM（见 ScreenLabel.domShown 的注释）
  for (const wr of writes) {
    const { label, left, top } = wr
    const el = label.el
    if (label.domShown !== true) {
      el.style.display = 'block'
      label.domShown = true
    }
    // 半像素阈值：亚像素抖动不值得写一次样式，但累积到 0.5px 就会写，
    // 所以不会出现"永远差一点、慢慢漂走"的偏移。
    if (label.domLeft === undefined || Math.abs(label.domLeft - left) > 0.5) {
      el.style.left = `${left}px`
      label.domLeft = left
    }
    if (label.domTop === undefined || Math.abs(label.domTop - top) > 0.5) {
      el.style.top = `${top}px`
      label.domTop = top
    }
  }
}

/** 隐藏一个标签；只在状态变化时真正写 display */
function hideLabel(l: ScreenLabel): void {
  if (l.domShown !== false) {
    l.el.style.display = 'none'
    l.domShown = false
  }
}
