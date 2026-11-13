import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * 把一个 Group 里的**静态子网格按材质合并**，压掉 draw call。
 *
 * 【为什么需要】实测甲板视角 **974 次 draw call**，其中 `deck-ship` 一个对象就占
 * **384 次** —— 舵轮 21 个网格（轮缘/8 根辐条/铜毂/把手）、舱口 13 个、兽栏 33 个、
 * 船首像 8 个…… 每一个都是一次 CPU 提交（0.05~0.1ms）。384 次就是 20~40ms，
 * 60fps 的整帧预算只有 16.7ms —— **玩家说的"很卡"就是这个**。
 *
 * 这些子件本身**不需要单独动**：舵轮是整个 Group 在转、舱口根本不动，
 * 所以它们的几何可以烘进世界（父级局部）坐标后合而为一。
 *
 * 【为什么按材质分组】合并的前提是同一份材质（同一 program + 同一组 uniform）。
 * 木暗 / 木中 / 铜 / 布 各合成一个 mesh —— 舵轮 21 → 2~3。
 *
 * 【必须保留的】① `material.visible === false` 的命中体（e2e 按名字找它来做点击）；
 * ② `userData.noMerge` 的对象（有单独动画或需要被脚本拿引用的）。
 *
 * 【为什么要递归进无名组】实测剩下的 308 次提交里，`deck-ship` 占 207 次，但它的
 * **直接**子级只有 10 个无名网格 —— 另外 95 个可绘制对象全在 8 个**没有名字的
 * Group** 里（32 / 10 / 10 / 9×4 / 7 个部件）。这些组是建造时临时建的中转层，
 * 组本身要留着（整组在摆、在晃），但组里的零件不必各自提交：一组 32 个零件
 * 只用了 6 份材质实例，按材质合并后就是 6 次。
 *
 * 递归的**安全前提**：进入的组没有名字。有名字的组是运行时会点名找的，
 * 往里塞合并网格可能让 `getObjectByName` 拿到意料外的对象。
 */
export function mergeStaticChildren(
  root: THREE.Object3D,
  opts: { keep?: (m: THREE.Mesh) => boolean; onlyUnnamed?: boolean; recurse?: boolean } = {},
): { before: number; after: number } {
  const before = countDrawables(root)
  const keep = opts.keep ?? (() => false)
  /** 材质 → 待合并的网格 */
  const buckets = new Map<THREE.Material, THREE.Mesh[]>()
  const victims: THREE.Mesh[] = []

  for (const child of root.children) {
    if (!(child instanceof THREE.Mesh)) continue
    if (child.children.length > 0) continue
    const mat = child.material
    if (Array.isArray(mat)) continue
    // 命中体（不可见的盒子）必须留着自己：点击与 e2e 都按名字找
    if (mat.visible === false) continue
    if (child.userData.noMerge) continue
    if (keep(child)) continue
    /*
     * 【为什么要有 onlyUnnamed】有名字的网格是**运行时会点名找的**：湿痕带
     * （改 opacity）、白沫带、护舷木条、斜桅（BOWSPRIT_TIP）、船首柱、船首像，
     * 还有 e2e 的一整套结构判据。把整船的直接子级一股脑合掉时，这些名字只剩
     * 第一个留下的那个 —— 12 条 e2e 立刻红，运行时也可能改错对象。
     * 只合"没名字"的那些（船壳板、腰板、甲板面之类），既压 draw call 又不动引用。
     */
    if (opts.onlyUnnamed && child.name) continue
    const arr = buckets.get(mat)
    if (arr) arr.push(child)
    else buckets.set(mat, [child])
  }

  for (const [mat, meshes] of buckets) {
    if (meshes.length < 2) continue
    const geos: THREE.BufferGeometry[] = []
    for (const m of meshes) {
      m.updateMatrix()
      const g = m.geometry.clone()
      /*
       * 属性必须一致，否则 mergeGeometries 返回 null（整组放弃合并）：
       * 只保留 position / normal / uv / color 四项，缺的补上默认值。
       */
      for (const key of Object.keys(g.attributes)) {
        if (!['position', 'normal', 'uv', 'color'].includes(key)) g.deleteAttribute(key)
      }
      if (!g.getAttribute('normal')) g.computeVertexNormals()
      if (!g.getAttribute('uv')) {
        const n = g.getAttribute('position').count
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
      }
      if (!g.getAttribute('color')) {
        const n = g.getAttribute('position').count
        const arr = new Float32Array(n * 3).fill(1)
        g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
      }
      g.applyMatrix4(m.matrix)
      geos.push(g)
    }
    const merged = mergeGeometries(geos, false)
    for (const g of geos) g.dispose()
    if (!merged) continue
    const mesh = new THREE.Mesh(merged, mat)
    // 名字沿用第一个：e2e 里按 `ship-wheel` 之类找对象时不会失联
    mesh.name = meshes[0].name
    mesh.userData.mergedFrom = meshes.length
    root.add(mesh)
    for (const m of meshes) {
      root.remove(m)
      m.geometry.dispose()
      victims.push(m)
    }
  }
  victims.length = 0
  /*
   * 递归：进**没有名字**的 Group 再合一层。组本身不删（整组还在摆/晃），
   * 只是把组里的零件按材质烘成几个网格挂回该组 —— 组级动画照旧生效。
   */
  if (opts.recurse) {
    for (const child of root.children) {
      if (child instanceof THREE.Mesh) continue
      if (child.name) continue
      if (!(child instanceof THREE.Group)) continue
      /*
       * 更深一层一律 `onlyUnnamed`：即使外层是"连同名字一起合"的调用，
       * 也不能让子里有名字的零件失去引用（运行时会按名字改它）。
       */
      mergeStaticChildren(child, { ...opts, onlyUnnamed: true, recurse: true })
    }
  }
  return { before, after: countDrawables(root) }
}

function countDrawables(root: THREE.Object3D): number {
  let n = 0
  root.traverseVisible((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line) n++
  })
  return n
}
