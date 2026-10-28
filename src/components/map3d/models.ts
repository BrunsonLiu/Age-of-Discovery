import * as THREE from 'three'

/**
 * 2.5D 海图用的程序化模型（微缩港口 + 帆船）。
 *
 * 全部用基础几何体拼，**不引入任何外部模型文件**——
 * 下载目录里的 177 张素材全是 2D PNG，没有一个 3D 模型可用（已全盘核查）。
 * 程序化建模的成本全在代码里，一次写完所有港口共用同一套几何体。
 *
 * 造型参照 Age of Sail：港口是一个圆形木底座 + 几间小屋 + 一面旗；
 * 船是低模帆船（船体 + 甲板 + 三桅 + 横帆 + 斜桅）。
 */

// ============================================================
// 港口：三档规模 + 干船坞
// ============================================================

/** 港口所属海域（与 Port.region 一致） */
export type PortRegion = 'caribbean' | 'europe' | 'africa' | 'asia'

/**
 * 港口规模档位。
 *
 * 【为什么用 services 数量推导，而不是另加一个 size 字段】
 * `services` 是**已经在用的真实数据**——港口面板就按它决定显示哪些按钮。
 * 另加一个 size 字段，就得保证两份描述同一件事的数据永远一致，
 * 迟早会打架（改了一边忘了另一边）。能从既有数据推导的，就不要新增字段。
 */
export type PortScale = 'major' | 'medium' | 'minor'

/**
 * 从港口服务列表推导规模档位。
 *
 * 实测分布（20 个港口）：5 项 8 个 / 4 项 3 个 / 3 项 6 个 / 2 项 3 个。
 *
 * 【为什么这个档位值得做进模型】
 * 玩家在 3D 地图上看到一堆一模一样的小房子时，没法判断
 * "这个港值不值得绕过去"。大港（5 项服务，含船坞与招募）在模型上
 * 就该比小补给站大一圈——"要不要去"从「打开面板才知道」变成「一眼能看出来」。
 */
export function portScaleOf(port: { services: readonly string[] }): PortScale {
  if (port.services.length >= 5) return 'major'
  if (port.services.length >= 3) return 'medium'
  return 'minor'
}

/** 港口模型需要的最小数据形状（只取建模用得到的字段） */
export interface PortModelInput {
  id: number
  region: PortRegion
  services: readonly string[]
}

export interface PortModelKit {
  base: THREE.BufferGeometry
  house: THREE.BufferGeometry
  roof: THREE.ConeGeometry
  pole: THREE.BufferGeometry
  flag: THREE.PlaneGeometry
  /** 塔楼（钟楼）——只有大港有 */
  tower: THREE.BufferGeometry
  /** 塔顶锥 */
  towerTop: THREE.ConeGeometry
  /**
   * 通用单位盒（1×1×1）。
   * 栈桥、干船坞的壁与船台都用它缩放拼出来——
   * 为每个小件单独建几何不划算，一个单位盒足够。
   */
  unit: THREE.BoxGeometry
  baseMat: THREE.MeshStandardMaterial
  houseMat: THREE.MeshStandardMaterial
  /**
   * 屋顶材质：按 region 分四套。
   *
   * 【这是风格差异，**不是**给玩家的编码信号】
   * 别指望玩家能从屋顶颜色读出"这是加勒比"——没有图例的东西没人会去学。
   * 它的作用只是让 20 个微缩模型不至于像复制粘贴：斜俯视下屋顶
   * 是唯一显眼的色块，四套之间拉开一点色相就够了。
   * 真正的可行动信号是**规模**（底座大小 + 建筑数量）与**干船坞**。
   */
  roofMat: Record<PortRegion, THREE.MeshStandardMaterial>
  poleMat: THREE.MeshStandardMaterial
  flagMat: THREE.MeshStandardMaterial
  towerMat: THREE.MeshStandardMaterial
  woodMat: THREE.MeshStandardMaterial
  /**
   * 栈桥甲板材质：比底座亮一档。
   * 【为什么不能用 woodMat】woodMat 与底座同色系，小港的栈桥实测
   * 糊进底座里看不见——栈桥要的是"这个港有个码头"，看不见就白做。
   */
  deckMat: THREE.MeshStandardMaterial
}

/** 建一套港口模型用的几何体与材质（20 个港口共用，别每个港口各建一份） */
export function createPortModelKit(): PortModelKit {
  return {
    base: new THREE.CylinderGeometry(0.15, 0.19, 0.075, 16),
    house: new THREE.BoxGeometry(0.055, 0.07, 0.055),
    roof: new THREE.ConeGeometry(0.048, 0.05, 4),
    pole: new THREE.CylinderGeometry(0.007, 0.007, 0.19, 5),
    flag: new THREE.PlaneGeometry(0.095, 0.05),
    tower: new THREE.CylinderGeometry(0.03, 0.036, 0.17, 8),
    towerTop: new THREE.ConeGeometry(0.046, 0.055, 8),
    unit: new THREE.BoxGeometry(1, 1, 1),
    baseMat: new THREE.MeshStandardMaterial({ color: 0x8a5a2c, roughness: 0.78, metalness: 0.04 }),
    houseMat: new THREE.MeshStandardMaterial({ color: 0xd8c9a4, roughness: 0.9 }),
    roofMat: {
      caribbean: new THREE.MeshStandardMaterial({ color: 0xb4522f, roughness: 0.85 }),
      europe: new THREE.MeshStandardMaterial({ color: 0x8f4530, roughness: 0.85 }),
      africa: new THREE.MeshStandardMaterial({ color: 0xb8873f, roughness: 0.9 }),
      asia: new THREE.MeshStandardMaterial({ color: 0x6b463a, roughness: 0.85 }),
    },
    poleMat: new THREE.MeshStandardMaterial({ color: 0x3f2a14, roughness: 0.9 }),
    flagMat: new THREE.MeshStandardMaterial({ color: 0xc9483c, roughness: 0.8, side: THREE.DoubleSide }),
    towerMat: new THREE.MeshStandardMaterial({ color: 0xcfbc98, roughness: 0.9 }),
    woodMat: new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.88 }),
    deckMat: new THREE.MeshStandardMaterial({ color: 0xa87f4c, roughness: 0.85 }),
  }
}

/**
 * 造一个港口微缩模型。
 *
 * 【三档规模的差异放在"轮廓"上，不是"尺度微调"上】
 * 如果只是把底座放大 20%，玩家得并排对比才看得出差别——那等于没做。
 * 所以差异用**建筑数量**表达：
 *   大港  base×1.20 + 4 座屋 + 1 座塔楼（塔高 0.17，是全场最高的单体）
 *   中港  base×1.00 + 2 座屋
 *   小港  base×0.76 + 1 座屋 + 一座伸向海面的栈桥
 * 远看剪影就不同，不需要看清细节。
 *
 * 【干船坞：唯一一个"直接可行动"的标记】
 * 只有 9 个港口有 shipyard。船体耐久见底时，玩家最需要知道的是
 * "最近的能修船的港在哪"。给这 9 个港加一座凹形船坞，
 * 让这个问题在 3D 地图上就有答案，不用逐个开面板查。
 */
export function makePortModel(kit: PortModelKit, port: PortModelInput): THREE.Group {
  const g = new THREE.Group()
  const scale = portScaleOf(port)
  const roofMat = kit.roofMat[port.region] ?? kit.roofMat.europe
  const baseR = scale === 'major' ? 1.2 : scale === 'medium' ? 1.0 : 0.76

  /**
   * 底座顶面高度。
   *
   * 【为什么必须算出来，不能写死】
   * 底座要按档位缩放（baseR），缩放同时影响高度——写死 y 的话，
   * 小港（baseR 0.76）的房子会悬在底座上方 0.05 处，远看像浮空。
   * 所有"坐在底座上"的附件都从这个值推导，三档都不会穿模或悬空。
   */
  const baseTopY = (0.037 + 0.075 / 2) * baseR
  /** 底座顶面半径（用于判断附件会不会伸出底座外） */
  const baseTopR = 0.15 * baseR

  /**
   * 【为什么只旋转"建筑群"，不旋转整个港口】
   * 20 个港口用同一套布局，朝向也一样的话，一眼就是复制粘贴。
   * 但整体旋转有个致命副作用（实测踩到）：旋转 240° 后，
   * 干船坞和栈桥被转到背对视角的一侧，**从画面上完全看不见**——
   * 那两个结构存在的唯一意义就是被看见。
   * 所以旋转只作用在 town（房子/塔/旗）上，船坞与栈桥留在 g 上固定朝 +Z（默认视角侧）。
   *
   * 确定性很重要：每次进游戏同一港口朝向必须一致，否则玩家会以为港口"动了"。
   */
  const jitter = ((port.id * 47) % 12) * (Math.PI / 6)
  const town = new THREE.Group()
  town.rotation.y = jitter
  g.add(town)
  g.userData.townRotation = jitter

  // ---- 底座 ----
  const base = new THREE.Mesh(kit.base, kit.baseMat)
  base.position.y = 0.037
  base.scale.setScalar(baseR)
  base.castShadow = true
  base.receiveShadow = true
  g.add(base)

  // ---- 小屋（屋身 + 四棱锥屋顶，成对出现）----
  const addHouse = (x: number, z: number, ry = Math.PI / 4) => {
    const h = new THREE.Mesh(kit.house, kit.houseMat)
    h.position.set(x, baseTopY + 0.035, z)
    h.castShadow = true
    town.add(h)
    const r = new THREE.Mesh(kit.roof, roofMat)
    r.position.set(x, baseTopY + 0.087, z)
    r.rotation.y = ry
    town.add(r)
  }

  // ---- 旗（杆 + 面）----
  const addFlag = (x: number, z: number) => {
    const pole = new THREE.Mesh(kit.pole, kit.poleMat)
    pole.position.set(x, baseTopY + 0.095, z)
    town.add(pole)
    const flag = new THREE.Mesh(kit.flag, kit.flagMat)
    flag.position.set(x + 0.048, baseTopY + 0.15, z)
    town.add(flag)
  }

  if (scale === 'major') {
    // 四座屋 + 中央高塔（塔是全场唯一的高塔，远看就是"大港"的剪影）
    // 【为什么建筑集中在 -Z 半区】把 +Z 一侧空出来给干船坞——
    // 干船坞如果被建筑挡住，等于没做（实测过：摆在 -Z 时整根被底座吞掉/被房子遮住）
    addHouse(-0.055, -0.012)
    addHouse(0.042, -0.052)
    addHouse(0.052, 0.004)
    addHouse(-0.03, -0.05)

    const tower = new THREE.Mesh(kit.tower, kit.towerMat)
    tower.position.set(-0.005, baseTopY + 0.11, 0.028)
    tower.castShadow = true
    town.add(tower)
    const cap = new THREE.Mesh(kit.towerTop, roofMat)
    // 塔身高 0.17、中心在 +0.11 → 塔顶 = +0.195；塔顶锥高 0.055 → 中心 = +0.2225
    cap.position.set(-0.005, baseTopY + 0.2225, 0.028)
    town.add(cap)

    addFlag(0.078, -0.024)
  } else if (scale === 'medium') {
    addHouse(-0.048, -0.008)
    addHouse(0.03, -0.052)
    addFlag(0.052, 0.026)
  } else {
    // 小补给站：一间屋 + 一条栈桥
    addHouse(-0.018, 0.008)
    // 旗杆摆到房子左后方，避开栈桥（实测放在右前方时，透视下旗杆像插在栈桥上）
    addFlag(-0.05, -0.014)

    const jetty = new THREE.Mesh(kit.unit, kit.deckMat)
    jetty.scale.set(0.13, 0.014, 0.042)
    // 一半压在底座顶面上、一半伸出边缘——栈桥本来就该"伸出去"
    jetty.position.set(0.04, baseTopY + 0.007, 0.055)
    jetty.castShadow = true
    g.add(jetty)
  }

  // ---- 干船坞（只有能修船的港口才有）----
  //
  // 【为什么摆在底座顶面上，而不是"伸进海里"】
  // 第一版把它放在底座外的 -Z 方向（像真的伸进水里的船坞），
  // 实测**完全看不见**：底座是实心圆柱，半径 0.19×baseR 已经包住了那个位置，
  // 船坞被整根吞进底座里。摆在顶面上才一定可见。
  //
  // 凹形：左右两道侧壁 + 一道后壁，中间空出来当船台。
  // 不做成实心方块——实心块读起来像"又一个房子"，凹形才一眼认出是"把船拖进去的坑"。
  if (port.services.includes('shipyard')) {
    const dock = new THREE.Group()
    dock.name = 'drydock'
    const dy = baseTopY + 0.006
    // 摆在 +Z（朝向默认视角的一侧），并按档位压回底座顶面范围内
    const dz = 0.115 * baseR

    const floor = new THREE.Mesh(kit.unit, kit.woodMat)
    floor.scale.set(0.082, 0.012, 0.052)
    floor.position.set(0, dy, dz)
    floor.receiveShadow = true
    dock.add(floor)
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(kit.unit, kit.woodMat)
      wall.scale.set(0.013, 0.03, 0.052)
      wall.position.set(side * 0.041, dy + 0.014, dz)
      wall.castShadow = true
      dock.add(wall)
    }
    const back = new THREE.Mesh(kit.unit, kit.woodMat)
    back.scale.set(0.082, 0.03, 0.013)
    back.position.set(0, dy + 0.014, dz - 0.024)
    dock.add(back)
    g.add(dock)
  }

  g.userData.portScale = scale
  g.userData.portId = port.id
  g.userData.baseTopR = baseTopR
  g.scale.setScalar(0.8)
  return g
}


export interface ShipModelKit {
  hull: THREE.BufferGeometry
  deck: THREE.BoxGeometry
  mast: THREE.CylinderGeometry
  sail: THREE.PlaneGeometry
  bowsprit: THREE.CylinderGeometry
  hullMat: THREE.MeshStandardMaterial
  deckMat: THREE.MeshStandardMaterial
  mastMat: THREE.MeshStandardMaterial
  sailMat: THREE.MeshStandardMaterial
}

export function createShipModelKit(): ShipModelKit {
  const hull = new THREE.CylinderGeometry(0.5, 0.3, 0.32, 6, 1)
  hull.scale(1.7, 1, 0.8)
  hull.rotateX(Math.PI / 2)
  return {
    hull,
    deck: new THREE.BoxGeometry(0.92, 0.05, 0.4),
    mast: new THREE.CylinderGeometry(0.02, 0.028, 0.9, 6),
    sail: new THREE.PlaneGeometry(0.42, 0.4),
    bowsprit: new THREE.CylinderGeometry(0.016, 0.016, 0.4, 6),
    hullMat: new THREE.MeshStandardMaterial({ color: 0x5c2e0a, roughness: 0.88 }),
    deckMat: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 }),
    mastMat: new THREE.MeshStandardMaterial({ color: 0x3f2410, roughness: 0.9 }),
    sailMat: new THREE.MeshStandardMaterial({
      color: 0xf6ecd6, roughness: 0.92, side: THREE.DoubleSide,
      emissive: 0x2a2418, emissiveIntensity: 1,
    }),
  }
}

/** 造一艘低模帆船（船首朝 +Z） */
export function makeShipModel(kit: ShipModelKit): THREE.Group {
  const g = new THREE.Group()

  const hull = new THREE.Mesh(kit.hull, kit.hullMat)
  hull.position.y = 0.09
  hull.castShadow = true
  g.add(hull)

  const deck = new THREE.Mesh(kit.deck, kit.deckMat)
  deck.position.y = 0.25
  g.add(deck)

  for (const x of [-0.28, 0.08, 0.38]) {
    const m = new THREE.Mesh(kit.mast, kit.mastMat)
    m.position.set(x, 0.25 + 0.45, 0)
    m.castShadow = true
    g.add(m)
    const s = new THREE.Mesh(kit.sail, kit.sailMat)
    s.rotation.y = Math.PI / 2
    s.position.set(x, 0.25 + 0.48, 0)
    s.castShadow = true
    g.add(s)
  }

  const bs = new THREE.Mesh(kit.bowsprit, kit.mastMat)
  bs.rotation.x = Math.PI / 2
  bs.position.set(0, 0.33, 0.5)
  g.add(bs)

  g.scale.setScalar(0.8)
  return g
}
