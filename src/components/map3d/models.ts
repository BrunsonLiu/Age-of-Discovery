import * as THREE from 'three'

/**
 * 2.5D 海图用的程序化模型（微缩港口底座 + 帆船）。
 *
 * 全部用基础几何体拼，**不引入任何外部模型文件**——
 * 下载目录里的 177 张素材全是 2D PNG，没有一个 3D 模型可用（已全盘核查）。
 * 程序化建模的成本全在代码里，一次写完所有港口共用同一套几何体。
 *
 * 造型参照 Age of Sail：港口是一个圆形木底座 + 几间小屋 + 一面旗；
 * 船是低模帆船（船体 + 甲板 + 三桅 + 横帆 + 斜桅）。
 */

export interface PortModelKit {
  base: THREE.BufferGeometry
  house: THREE.BufferGeometry
  roof: THREE.ConeGeometry
  pole: THREE.BufferGeometry
  flag: THREE.PlaneGeometry
  baseMat: THREE.MeshStandardMaterial
  houseMat: THREE.MeshStandardMaterial
  roofMat: THREE.MeshStandardMaterial
  poleMat: THREE.MeshStandardMaterial
  flagMat: THREE.MeshStandardMaterial
}

/** 建一套港口模型用的几何体与材质（20 个港口共用，别每个港口各建一份） */
export function createPortModelKit(): PortModelKit {
  return {
    base: new THREE.CylinderGeometry(0.15, 0.19, 0.075, 16),
    house: new THREE.BoxGeometry(0.055, 0.07, 0.055),
    roof: new THREE.ConeGeometry(0.048, 0.05, 4),
    pole: new THREE.CylinderGeometry(0.007, 0.007, 0.19, 5),
    flag: new THREE.PlaneGeometry(0.095, 0.05),
    baseMat: new THREE.MeshStandardMaterial({ color: 0x8a5a2c, roughness: 0.78, metalness: 0.04 }),
    houseMat: new THREE.MeshStandardMaterial({ color: 0xd8c9a4, roughness: 0.9 }),
    roofMat: new THREE.MeshStandardMaterial({ color: 0x9c4b2e, roughness: 0.85 }),
    poleMat: new THREE.MeshStandardMaterial({ color: 0x3f2a14, roughness: 0.9 }),
    flagMat: new THREE.MeshStandardMaterial({ color: 0xc9483c, roughness: 0.8, side: THREE.DoubleSide }),
  }
}

/** 造一个港口微缩模型（圆底座 + 小屋 + 旗） */
export function makePortModel(kit: PortModelKit): THREE.Group {
  const g = new THREE.Group()

  const base = new THREE.Mesh(kit.base, kit.baseMat)
  base.position.y = 0.037
  base.castShadow = true
  g.add(base)

  const h1 = new THREE.Mesh(kit.house, kit.houseMat)
  h1.position.set(-0.045, 0.11, 0.01)
  h1.castShadow = true
  g.add(h1)
  const r1 = new THREE.Mesh(kit.roof, kit.roofMat)
  r1.position.set(-0.045, 0.162, 0.01)
  r1.rotation.y = Math.PI / 4
  g.add(r1)

  const h2 = new THREE.Mesh(kit.house, kit.houseMat)
  h2.position.set(0.03, 0.105, -0.038)
  h2.castShadow = true
  g.add(h2)
  const r2 = new THREE.Mesh(kit.roof, kit.roofMat)
  r2.position.set(0.03, 0.152, -0.038)
  r2.rotation.y = Math.PI / 4
  g.add(r2)

  const pole = new THREE.Mesh(kit.pole, kit.poleMat)
  pole.position.y = 0.19
  g.add(pole)
  const flag = new THREE.Mesh(kit.flag, kit.flagMat)
  flag.position.set(0.048, 0.245, 0)
  g.add(flag)

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
