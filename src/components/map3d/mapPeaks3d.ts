import * as THREE from 'three'
import type { TerrainSymbol } from '@/utils/terrainDecor'
import { latToWorldZ, lonToWorldX } from '@/utils/mapProjection'

/**
 * 2.5D 海图的地形符号（山）。
 *
 * 【为什么只画山，不画树】
 * 2D 那边山和树是一起撒的（kind 随机 62% 山 / 38% 树），而树没有任何
 * 诚实的地理依据——`painted-land.png` 的颜色不是生态（实测撒哈拉腹地
 * rgb(85,94,48) 深橄榄、亚马逊 rgb(170,149,93) 浅棕），所以 2D 至今有
 * "撒哈拉长松树"这个已知缺陷。
 * 3D 之前**没有**这个缺陷（陆地是空的）。如果照抄 2D 把树也撒上，
 * 等于主动把这个错误搬到一个本来没有它的视图里，而且 3D 的符号更大更清楚。
 * 山是唯一有诚实门控的：高程（elev-map.png）能把"平原上的山"否掉（否决，不指定）。
 * 所以这里只保留 kind === 'peak'。
 * 附带的好处：波托兰海图上本来也只标山与城市，不标森林。
 *
 * 【为什么符号是**平铺在地面**的，不是面向相机的广告牌】
 * 广告牌（sprite）会永远正对相机，在斜俯视下读作"浮在空中的图标"，
 * 而且随相机转动而转 —— 那是游戏 UI 的语言，不是画在纸上的符号。
 * 平铺在地面时，符号是**画在羊皮纸上的一笔**，相机一转它就跟着透视变，
 * 和海岸墨线、经纬网是同一套语义。
 * 代价是低倾角时符号被压扁 —— 但本作的相机仰角固定在俯视一档，不构成问题。
 */

/** 符号的世界尺寸（宽，世界单位）。1 单位 ≈ 36px（默认视野），约 11px 宽 */
const PEAK_SIZE = 0.44

/**
 * 符号朝向：
 *  · 'flat'    —— 平铺在纸面上（像真的画上去的一笔）
 *  · 'upright' —— 竖直站立、只绕竖轴朝向相机（像插在纸上的立牌）
 * 两版都拍过 A/B，结论写在调用处。
 */
export type PeakFacing = 'flat' | 'upright'

export interface Map3DPeaks {
  meshes: THREE.InstancedMesh[]
  /** 材质（不受光，需要随昼夜/天气手动乘亮度） */
  materials: THREE.MeshBasicMaterial[]
  count: number
  /**
   * 按相机距离重算实例矩阵（符号在屏幕上大致定尺寸）。
   *
   * 【为什么必须这样】世界尺寸固定时，近景（dist≈8）符号会放大到 120px 以上，
   * 一座"山"比港口还大；远景又只有 5px，等于没有。2D 的图标是 26px 定尺寸的，
   * 3D 想读作同一套图例就必须跟着距离缩放。
   * 只在**缩放变化超过 6%** 时重算，不是每帧：几千个矩阵的 compose 不该进帧循环。
   */
  setScale(dist: number): void
  dispose(): void
}

/**
 * 画一座山的图标（64×64，底边居中）。
 *
 * 配色直接取 2D 的 drawPeakAt：填充 rgba(138,106,62,0.72)（羊皮纸上的土黄），
 * 描边 rgba(63,44,20,0.75)（墨褐）。两个视图用同一组数，切过去才不会"换画风"。
 */
function buildPeakTexture(snow: boolean): { texture: THREE.Texture } {
  /*
   * 【为什么一张贴图里画一组山，而不是一座】
   *
   * 2D 踩过同样的坑：每座山都是等大的孤立三角，撒满陆地之后"像图钉"。
   * 古地图的山是**一组高低错落的三角挤在一条脊线上**，读作"山脉"。
   * 3D 里符号更小（11px），单座三角更读不出来 —— 实测整片陆地像撒了一地纸箭头。
   *
   * 所以按 2D 的构图（主峰 + 1~2 座更小更淡的肩峰，横向错开半个峰宽）
   * 把一整组烙进一张 128×64 的贴图，每个实例就是"一段山脉"。
   * 代价是贴图宽了一倍（世界尺寸 0.44 单位），所以撒点步长也放大到 2.2°，
   * 避免相邻两组叠在一起。
   */
  const W = 128, H = 64
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const g = canvas.getContext('2d')!
  g.lineJoin = 'round'

  /** 画一座山：底边中心 (cx, by)，半宽 hw，高 hh */
  const peak = (cx: number, by: number, hw: number, hh: number, faded: boolean) => {
    const apexY = by - hh
    g.beginPath()
    g.moveTo(cx - hw, by)
    g.lineTo(cx, apexY)
    g.lineTo(cx + hw, by)
    g.closePath()
    g.fillStyle = faded ? 'rgba(150,116,70,0.55)' : 'rgba(150,116,70,0.92)'
    g.fill()
    /*
     * 描边 5px（128 宽的图上）：符号在屏幕上只有 11~15px 宽，
     * 5px 折合 ≈0.7px，正好是 2D 图标的 1px 墨线。3px 会被抗锯齿糊掉，
     * 只剩那块暗面 —— 于是三角形读作"一张折起来的纸"（第一版的实测结果）。
     */
    g.strokeStyle = faded ? 'rgba(58,40,18,0.55)' : 'rgba(58,40,18,0.94)'
    g.lineWidth = faded ? 3.5 : 5
    g.stroke()

    // 右下暗面：只覆盖一角，暗示"两个面"，不是把右半整块压黑
    g.beginPath()
    g.moveTo(cx + hw * 0.32, by)
    g.lineTo(cx + hw, by)
    g.lineTo(cx, apexY + hh * 0.45)
    g.closePath()
    g.fillStyle = faded ? 'rgba(58,40,18,0.10)' : 'rgba(58,40,18,0.16)'
    g.fill()

    if (snow) {
      // 雪帽：顶部 30%
      const k = 0.3
      const sy = apexY + hh * k
      const sx = hw * k
      g.beginPath()
      g.moveTo(cx, apexY)
      g.lineTo(cx + sx, sy)
      g.lineTo(cx - sx, sy)
      g.closePath()
      g.fillStyle = 'rgba(247,240,216,0.80)'
      g.fill()
    }
  }

  // 底边 y=56（留 8px 给描边溢出）。主峰居中，两侧肩峰更小更淡
  peak(26, 56, 15, 34, true)
  peak(104, 56, 13, 30, true)
  peak(64, 56, 20, 44, false)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  // 斜视 + mip：线性过滤让山脊在拉远时"变淡"而不是"变脏"
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  return { texture }
}

/**
 * 建地形符号（一次 static，之后每帧零成本）。
 *
 * 【为什么不做 rank 分级】
 * 2D 是按 zoom 用 rank 阈值筛点的（DOM 节点太贵）。3D 是 InstancedMesh，
 * 一个 draw call 画几万个都不心疼，所以**全画**，不做每帧的矩阵重建。
 * 距离远时它们会被 mip 抹淡 —— 那正好是"远景不需要细节"想要的效果。
 */
export function buildMap3DPeaks(symbols: TerrainSymbol[], y: number, facing: PeakFacing = 'flat'): Map3DPeaks {
  const peaks = symbols.filter(s => s.kind === 'peak')
  const snow = peaks.filter(s => Math.abs(s.lat) >= 48)
  const bare = peaks.filter(s => Math.abs(s.lat) < 48)

  // 贴图是 128×64（2:1），所以世界尺寸也按 2:1
  const plane = new THREE.PlaneGeometry(PEAK_SIZE, PEAK_SIZE * 0.5)
  // flat：绕 X 转 -90°，把平面放平；upright：保持竖直（底边正好落在 y）
  const geo = facing === 'flat' ? plane.rotateX(-Math.PI / 2) : plane.translate(0, PEAK_SIZE * 0.25, 0)
  const meshes: THREE.InstancedMesh[] = []
  /**
   * 「这批符号 ↔ 这个 mesh」的配对。
   * 【为什么不用下标猜】meshes 的构造会跳过空列表（某类符号可能一个都没有），
   * 用 i===0 判 bare 在那种情况下会把 snow 的符号写进 bare 的 mesh。
   */
  const pairs: { list: TerrainSymbol[]; mesh: THREE.InstancedMesh }[] = []
  const materials: THREE.MeshBasicMaterial[] = []
  const textures: THREE.Texture[] = []
  const dummy = new THREE.Object3D()

  for (const [list, isSnow] of [[bare, false], [snow, true]] as const) {
    if (!list.length) continue
    const { texture } = buildPeakTexture(isSnow)
    textures.push(texture)
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      // 与墨线同一套语义：符号是画在纸上的，不是立体物件
      opacity: 0.95,
    })
    const mesh = new THREE.InstancedMesh(geo, mat, list.length)
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage)
    // 实例分布在整个海图上，包围球按默认几何算会错 → 关掉视锥剔除
    mesh.frustumCulled = false
    mesh.name = isSnow ? 'map3d-peaks-snow' : 'map3d-peaks'
    mesh.renderOrder = 3

    for (let i = 0; i < list.length; i++) {
      const s = list[i]
      dummy.position.set(lonToWorldX(s.lng), y, latToWorldZ(s.lat))
      /*
       * 【朝向不许随机】
       *
       * 第一版按 s.scale 给了 0~2π 的随机偏航，理由是"让笔画不整齐"。
       * 实测截图里整片陆地像撒了一地纸箭头 —— 因为山尖朝向在古地图上是
       * **语义**：一律朝北（图的上方），观众靠它判断方向。
       * 随机化等于把语义抹掉，只剩"碎纸片"。
       * 需要不整齐时改大小与是否有雪，不改方向。
       */
      dummy.rotation.set(0, 0, 0)
      dummy.scale.setScalar(0.8 + s.scale * 0.4)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    materials.push(mat)
    meshes.push(mesh)
    pairs.push({ list, mesh })
  }

  /** 上一次应用的距离（用来判断"是否值得重算"） */
  let lastDist = -1

  return {
    meshes,
    materials,
    count: peaks.length,
    setScale(dist: number) {
      // 6% 的滞回：连续滚动时不会每帧重算，但停下来一定是准的
      if (lastDist > 0 && Math.abs(dist - lastDist) / lastDist < 0.06) return
      lastDist = dist
      // 目标：屏幕宽 ≈ 22px。1 世界单位在 dist=22 时约 20px（默认视野实测 36px/dist 换算）
      /*
       * 下限定 0.3：近景（dist≈8）时 k=0.36 → 符号宽约 45px。
       * 第一版下限给了 0.45，实测近景一段山脉有 65px 宽，比港口基座还抢眼；
       * 上限 1.7 让远景（dist≈40）也只到 ~1.7 倍，不会糊成一片。
       */
      const k = Math.min(1.7, Math.max(0.3, dist / 22))
      for (const { list, mesh } of pairs) {
        for (let i = 0; i < list.length; i++) {
          const s = list[i]
          dummy.position.set(lonToWorldX(s.lng), y, latToWorldZ(s.lat))
          dummy.rotation.set(0, 0, 0)
          dummy.scale.setScalar((0.8 + s.scale * 0.4) * k)
          dummy.updateMatrix()
          mesh.setMatrixAt(i, dummy.matrix)
        }
        mesh.instanceMatrix.needsUpdate = true
      }
    },
    dispose() {
      geo.dispose()
      for (const m of materials) m.dispose()
      for (const t of textures) t.dispose()
    },
  }
}
