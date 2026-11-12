import * as THREE from 'three'
import { HARBOR_STYLES } from '../deck/deckHarbor'

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

/*
 * 【为什么颜色从 deckHarbor 取】同一座加勒比港在两个视图里必须像同一座城：
 * 甲板视角（`HARBOR_STYLES`）给的是木棚 + 茅草土黄，而这里原来写死成砖红
 * 0xb4522f —— 玩家出海图看一眼、进港看一眼，两处是两种建筑。这不是"风格差异"，
 * 是**同一份事实被抄了两遍**。
 *
 * 3D 这边走 Standard 材质 + ACES，同样的 sRGB 值渲染出来比甲板上的 Basic 材质
 * 暗约一档，所以取色时统一提亮 `PORT_TINT_LIFT` —— 这是**补偿**，不是另一套配色。
 */
const PORT_TINT_LIFT = 1.18
function tinted(hex: number): THREE.Color {
  return new THREE.Color(hex).multiplyScalar(PORT_TINT_LIFT)
}

/**
 * 港口规模档位。
 *
 * 【为什么用 services 数量推导，而不是另加一个 size 字段】
 * `services` 是**已经在用的真实数据**——港口面板就按它决定显示哪些按钮。
 * 另加一个 size 字段，就得保证两份描述同一件事的数据永远一致，
 * 迟早会打架（改了一边忘了另一边）。能从既有数据推导的，就不要新增字段。
 */
/**
 * 规模档位与推导规则都挪到 `utils/portScale.ts`：2D 地图的港口徽章也要按它分级，
 * 而本文件引了 three.js，2D 组件不该为了一个三行函数把整个 three 拖进主图包。
 * 这里只做转出，保持 3D 侧的 import 路径不变。
 */
import { portScaleOf, type PortScale } from '@/utils/portScale'
import { portLightPlan, type PortLightKind } from '@/utils/portLights'
import { flagYaw, smokePose } from '@/utils/portLife'
export { portScaleOf, type PortScale }

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
  /** 墙色按海域分（2026-11-12）：与甲板视角的 `HARBOR_STYLES` 同源 */
  houseMat: Record<PortRegion, THREE.MeshStandardMaterial>
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
  /**
   * 烟的材料模板（每缕会 clone 一份，因为 SpriteMaterial 的 opacity 是材质级的，
   * 共用一份就变成"三缕烟一起淡出"）。贴在软边径向渐变图上。
   */
  smokeMat: THREE.SpriteMaterial
}

/**
 * 给港口底座上一层逐顶点的明暗。
 *
 * 【为什么必须做】底座是 `CylinderGeometry(0.15, 0.19, 0.075, 16)` + 单一纯色
 * `0x8a5a2c`，光滑着色 —— 5 倍放大下就是一块**均匀的橙色蛋糕**：
 * 侧面每一处亮度完全一样，既没有"这是块地"的厚度感，也没有石头/泥土的质感。
 * 整个港口模型里最扎眼的就是它，因为它面积最大。
 *
 * 做法与海岸侧壁一致（那边也是不受光的顶点色）：
 *   顶面（法线朝上）→ 踩实的深土 #6d4626
 *   上缘            → #8a5a2c（原来的颜色）
 *   底部            → #452b12（贴水/接地处压暗）
 * 同时把材质换成 flatShading —— 16 个侧面各成一片，读作削出来的岩块，
 * 而不是一根光滑的圆柱。
 *
 * 【为什么转线性】顶点色属于工作色彩空间（线性），直接塞 sRGB 百分比会被
 * ACES 提亮，颜色会整体浮起来发白（海岸侧壁踩过这个坑）。
 */
function paintPortBase(g: THREE.BufferGeometry): void {
  const srgbToLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  /*
   * 明暗顺序：顶面最亮、上缘次之、底部最暗。
   * 第一版把顶面做得比侧面暗（想做"踩实的深土"），结果整个底座读成一个**碗**
   * ——光从上方来，水平面必然吃到最多光，把它压暗就是在跟光打架。
   * 与海岸侧壁那次是同一个教训：垂直面/水平面的相对亮度不能靠"题材想象"定。
   */
  /*
   * 【2026-11-03 改色：从"橙色木头"到"砂岩"】
   * 陆地改成羊皮纸调子之后，原来那套 0x9c6d3c 的橙棕在奶油底子上像一只木桶，
   * 而且和船体、屋顶的红棕撞色。砂岩更接近"从海图上凸起的一块岩台"：
   * 色相往黄灰挪、饱和度压下去，同时**保持三段明暗关系不变**
   * （顶面最亮 → 上缘 → 底部最暗），那条曲线是量出来的，不动。
   */
  const TOP: [number, number, number] = [0xa8 / 255, 0x92 / 255, 0x72 / 255]
  const RIM: [number, number, number] = [0x8e / 255, 0x78 / 255, 0x59 / 255]
  const LOW: [number, number, number] = [0x6f / 255, 0x5c / 255, 0x42 / 255]

  const pos = g.attributes.position
  const nrm = g.attributes.normal
  const h = 0.075
  const col = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const c = nrm.getY(i) > 0.85
      ? TOP
      : (() => {
          // y 从 -h/2（底）到 +h/2（顶）
          const t = Math.min(1, Math.max(0, pos.getY(i) / h + 0.5))
          return [
            LOW[0] + (RIM[0] - LOW[0]) * t,
            LOW[1] + (RIM[1] - LOW[1]) * t,
            LOW[2] + (RIM[2] - LOW[2]) * t,
          ] as [number, number, number]
        })()
    col[i * 3] = srgbToLinear(c[0])
    col[i * 3 + 1] = srgbToLinear(c[1])
    col[i * 3 + 2] = srgbToLinear(c[2])
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
}

/**
 * 烟与海鸥的贴图（各一张，20 个港口共用）。
 *
 * 【为什么画在 canvas 而不是用现成素材】这两个都是 16~32px 的小东西：
 * 烟只要"软边圆斑"，鸟只要"两笔 V 形"。为它们各导一张 PNG 会多两个网络请求，
 * 而且尺寸一旦不匹配，缩放后边缘会发灰。
 *
 * 都用 alpha 通道表达形状、不用 alphaTest 硬切（硬切在低分辨率下会锯齿）。
 */
export function createSmokeTexture(): THREE.Texture {
  const S = 64
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  // 中心不太实、边缘完全透明：烟是散射体，没有硬芯
  grd.addColorStop(0, 'rgba(255,255,255,0.85)')
  grd.addColorStop(0.45, 'rgba(255,255,255,0.45)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, S, S)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export function createBirdTexture(): THREE.Texture {
  const W = 48, H = 24
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')!
  g.strokeStyle = '#2b2118'
  g.lineWidth = 3
  g.lineCap = 'round'
  // 展翅的 "M"：两个上凸的弧，中间一点向下的身体
  g.beginPath()
  g.moveTo(6, 16)
  g.quadraticCurveTo(15, 3, 24, 14)
  g.quadraticCurveTo(33, 3, 42, 16)
  g.stroke()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 建一套港口模型用的几何体与材质（20 个港口共用，别每个港口各建一份） */
/**
 * 灯火用的光晕贴图（一盏灯一张 64×64 的径向渐变）。
 *
 * 【为什么必须有软边】Points 是一个**方形的 point**，直接给颜色画出来是方块。
 * 加一张中心亮、边缘归零的贴图，叠加混合下才读作"一团光"。
 *
 * 【为什么内核要小、外圈要长】内核（0~0.18）决定"这是一点光"，
 * 外圈（到 1.0）决定光晕的大小。内核做大了会变成一颗白球，
 * 反而不像远处的灯——真实的灯在暗处是一小点实心加一大圈非常淡的光。
 */
export function createGlowTexture(): THREE.Texture {
  const S = 64
  const c = document.createElement('canvas')
  c.width = S; c.height = S
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  /*
   * 【光晕中段为什么要到 0.8】叠加混合之后，只有**接近白**的部分才看得出来：
   * 夜色里海面才 0.2 左右的亮度，加一层 0.3 的暖色，结果还是"稍微亮一点的蓝"，
   * 读作脏点而不是光。第一版把中段压到 0.34，结果是"一圈几乎看不见的雾 + 一个硬核"，
   * 4 倍放大才认得出是灯。把中段提到 0.8、外圈留一段才散，才读作一团光。
   */
  grad.addColorStop(0, 'rgba(255,252,240,1)')
  grad.addColorStop(0.20, 'rgba(255,246,220,1)')
  grad.addColorStop(0.40, 'rgba(255,228,168,0.80)')
  grad.addColorStop(0.62, 'rgba(255,204,136,0.34)')
  grad.addColorStop(0.84, 'rgba(255,188,118,0.06)')
  grad.addColorStop(1, 'rgba(255,180,110,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, S, S)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** 一个灯位：坐标是**相对港口原点**（已含 0.8 缩放与建筑群朝向） */
export interface PortLightSpot {
  x: number
  y: number
  z: number
  kind: PortLightKind
}

export function createPortModelKit(): PortModelKit {
  const base = new THREE.CylinderGeometry(0.15, 0.19, 0.075, 16)
  paintPortBase(base)
  return {
    base,
    house: new THREE.BoxGeometry(0.055, 0.07, 0.055),
    roof: new THREE.ConeGeometry(0.048, 0.05, 4),
    pole: new THREE.CylinderGeometry(0.007, 0.007, 0.19, 5),
    // 原点挪到左边缘：旗要绕**杆**摆。不挪的话旋转绕旗面中心，
    // 两端反向甩，读起来像风车而不是旗（几何与 20 个港共用，挪一次即可）
    flag: new THREE.PlaneGeometry(0.072, 0.038).translate(0.036, 0, 0),
    tower: new THREE.CylinderGeometry(0.03, 0.036, 0.17, 8),
    towerTop: new THREE.ConeGeometry(0.046, 0.055, 8),
    unit: new THREE.BoxGeometry(1, 1, 1),
    // 底座的颜色全部来自顶点色（见 paintPortBase），所以 color 保持白。
    // flatShading：16 个侧面各成一片，读作削出来的岩块而不是光滑圆柱。
    baseMat: new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0,
      /*
       * 【为什么要一点 emissive】球状底座的背光面只吃到 ambient，
       * 实测渲染出来是 rgb(6,4,3) —— 纯黑。在这个尺度上它读作
       * **"模型缺了一块"**，而不是暗面（4 倍放大截图里最刺眼的东西）。
       * 加一层很暗的暖色自发光当"地面反光"，暗面回到 rgb(28,22,16) 左右：
       * 仍然明显暗于顶面，但不再是洞。
       * 不能用调高 ambient 的办法——那会同时抬亮海面，把海色与昼夜校准全打乱。
       */
      emissive: 0x2a2018,
      emissiveIntensity: 0.55,
    }),
    houseMat: {
      caribbean: new THREE.MeshStandardMaterial({ color: tinted(HARBOR_STYLES.caribbean.wall), roughness: 0.9 }),
      europe: new THREE.MeshStandardMaterial({ color: tinted(HARBOR_STYLES.europe.wall), roughness: 0.9 }),
      africa: new THREE.MeshStandardMaterial({ color: tinted(HARBOR_STYLES.africa.wall), roughness: 0.92 }),
      asia: new THREE.MeshStandardMaterial({ color: tinted(HARBOR_STYLES.asia.wall), roughness: 0.9 }),
    },
    roofMat: {
      /* 屋顶的粗糙度按样式给：茅草/土顶更哑，瓦顶带一点高光 */
      caribbean: new THREE.MeshStandardMaterial({ color: tinted(HARBOR_STYLES.caribbean.roof), roughness: 0.95 }),
      europe: new THREE.MeshStandardMaterial({ color: tinted(HARBOR_STYLES.europe.roof), roughness: 0.85 }),
      africa: new THREE.MeshStandardMaterial({ color: tinted(HARBOR_STYLES.africa.roof), roughness: 0.95 }),
      asia: new THREE.MeshStandardMaterial({ color: tinted(HARBOR_STYLES.asia.roof), roughness: 0.8 }),
    },
    poleMat: new THREE.MeshStandardMaterial({ color: 0x3f2a14, roughness: 0.9 }),
    flagMat: new THREE.MeshStandardMaterial({ color: 0xc9483c, roughness: 0.8, side: THREE.DoubleSide }),
    towerMat: new THREE.MeshStandardMaterial({ color: 0xcfbc98, roughness: 0.9 }),
    woodMat: new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.88 }),
    deckMat: new THREE.MeshStandardMaterial({ color: 0xa87f4c, roughness: 0.85 }),
    smokeMat: new THREE.SpriteMaterial({
      map: createSmokeTexture(),
      color: 0xc9c2b2,
      transparent: true,
      depthWrite: false,
      opacity: 1,
    }),
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
  const houseMat = kit.houseMat[port.region] ?? kit.houseMat.europe
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

  /** 房屋锚点（灯位要用它的世界位置：窗开在房子上，不在港口中心） */
  const houseAnchors: THREE.Mesh[] = []
  /** 旗杆锚点（码头灯挂在旗杆上） */
  const poleAnchors: THREE.Mesh[] = []
  /** 塔顶锚点（大港的信标） */
  const beaconAnchors: THREE.Mesh[] = []

  // ---- 小屋（屋身 + 四棱锥屋顶，成对出现）----
  const addHouse = (x: number, z: number, ry = Math.PI / 4) => {
    const h = new THREE.Mesh(kit.house, houseMat)
    h.position.set(x, baseTopY + 0.035, z)
    h.castShadow = true
    town.add(h)
    houseAnchors.push(h)
    const r = new THREE.Mesh(kit.roof, roofMat)
    r.position.set(x, baseTopY + 0.087, z)
    r.rotation.y = ry
    town.add(r)
  }

  // ---- 旗（杆 + 面）----
  /** 每根旗的旗面（待机动画要原地摆，见 animatePortLife） */
  const flags: THREE.Mesh[] = []
  const addFlag = (x: number, z: number) => {
    const pole = new THREE.Mesh(kit.pole, kit.poleMat)
    pole.position.set(x, baseTopY + 0.095, z)
    town.add(pole)
    poleAnchors.push(pole)
    const flag = new THREE.Mesh(kit.flag, kit.flagMat)
    // x 就是杆的位置（几何原点已在左边缘，见 createPortModelKit）
    flag.position.set(x, baseTopY + 0.15, z)
    town.add(flag)
    flags.push(flag)
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
    beaconAnchors.push(cap)

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

  /*
   * ---- 青烟 ----
   *
   * 烟必须从**屋顶**出来，而不是港口中心：20 个港同屏时，从中心升起的那一坨
   * 会盖住塔楼，看起来像港口失火。坐标复用上面 addHouse 的位置
   * （烟挂在 town 里，跟着建筑群一起转）。
   *
   * 【为什么大港 2 缕、中港 1 缕、小港没有】
   * 每个 Sprite 是一次独立 draw call（SpriteMaterial 的 opacity 是材质级的，
   * 不能共用一份，否则三缕烟一起淡出）。20 个港如果都 2 缕就是 40 个 draw call，
   * 而小补给站在多数机位下只有几个像素——给它们加烟纯属浪费。
   * 大港 2 缕错开相位才读得出"烟柱"，1 缕只是一个会动的点。
   */
  const puffs: THREE.Sprite[] = []
  // 大港 3 缕：2 缕叠出来更像"两个点"，3 缕才连成一根柱；中港 1 缕。
  // 合计 8×3 + 9×1 = 33 个 sprite（每 sprite 一次 draw call，而且只在近景可见）。
  const puffCount = scale === 'major' ? 3 : scale === 'medium' ? 1 : 0
  const chimney: [number, number] = scale === 'major' ? [-0.03, -0.05]
    : scale === 'medium' ? [-0.048, -0.008] : [-0.018, 0.008]
  for (let i = 0; i < puffCount; i++) {
    const mat = kit.smokeMat.clone()
    const sp = new THREE.Sprite(mat)
    sp.position.set(chimney[0], baseTopY + 0.13, chimney[1])
    sp.scale.setScalar(0.05)
    sp.userData.baseY = baseTopY + 0.13
    sp.userData.baseX = chimney[0]
    sp.userData.baseZ = chimney[1]
    town.add(sp)
    puffs.push(sp)
  }

  g.scale.setScalar(0.8)

  /*
   * ---- 灯位 ----
   *
   * 【为什么在这里算、而不是渲染时再算】灯要合成**一个** Points 对象
   * （20 个港各画一份就是 20 次 draw call，而灯本来就只是几个顶点）。
   * 合成的前提是坐标统一到同一空间，所以建模结束时把每盏灯的位置算成
   * "相对港口原点"的坐标，交给 Map3DView 加上港口自身的位置即可。
   *
   * 【必须在 setScalar 和 updateMatrixWorld 之后】灯位要含 0.8 的缩放，
   * 也要含建筑群的朝向（town 的 jitter 旋转）——窗开在房子上，
   * 不在港口中心。早一步算，灯会浮在房子外面，而且 20 个港全浮在同一个方向。
   */
  g.updateMatrixWorld(true)
  const lights: PortLightSpot[] = []
  const tmpV = new THREE.Vector3()
  const plan = portLightPlan(scale)
  const pushSpot = (o: THREE.Object3D, dy: number, dz: number, kind: PortLightKind) => {
    o.getWorldPosition(tmpV)
    lights.push({
      x: +tmpV.x.toFixed(4),
      y: +(tmpV.y + dy).toFixed(4),
      z: +(tmpV.z + dz).toFixed(4),
      kind,
    })
  }
  // 暖光池：整个港口中心，略高于底座顶面（压在陆地上，不埋进底座）
  for (let i = 0; i < plan.halo; i++) {
    lights.push({ x: 0, y: +((baseTopY + 0.02) * 0.8).toFixed(4), z: 0, kind: 'halo' })
  }
  // 窗：房子的前脸（+Z 侧，默认视角那一面），抬高一点点到窗台高度
  for (let i = 0; i < Math.min(plan.windows, houseAnchors.length); i++) {
    pushSpot(houseAnchors[i], 0.018, 0.03, 'window')
  }
  // 码头灯：挂在旗杆上（真实港口的灯就挂在杆子/桅杆上，不悬空）
  for (let i = 0; i < Math.min(plan.lanterns, poleAnchors.length); i++) {
    pushSpot(poleAnchors[i], 0.035, 0, 'lantern')
  }
  // 塔顶信标
  for (const cap of beaconAnchors) pushSpot(cap, 0.03, 0, 'beacon')

  /*
   * 大港多出来的那盏码头灯：摆在底座边缘（+X/-X 一侧）。
   *
   * 一个港只有一根旗杆，第二盏灯没有杆可挂。摆在底座边缘是**故意的**：
   * 真实的码头灯就是沿石砌岸边一溜排开的，正好把黑影里的底座轮廓勾出来。
   * 坐标在这里是"已缩放"的空间（g.scale = 0.8），所以乘了 0.8。
   */
  const extraLanterns = plan.lanterns - Math.min(plan.lanterns, poleAnchors.length)
  for (let i = 0; i < extraLanterns; i++) {
    const ang = Math.PI * (0.62 + 0.55 * i)
    lights.push({
      x: +(Math.cos(ang) * 0.13 * baseR * 0.8).toFixed(4),
      y: +((baseTopY + 0.03) * 0.8).toFixed(4),
      z: +(Math.sin(ang) * 0.13 * baseR * 0.8).toFixed(4),
      kind: 'lantern',
    })
  }

  g.userData.portScale = scale
  g.userData.portId = port.id
  g.userData.baseTopR = baseTopR
  g.userData.portLife = { flags, puffs, seed: port.id }
  g.userData.portLights = lights
  return g
}


/**
 * 每帧更新一个港口的待机动画（旗 / 烟）。
 *
 * 【为什么 detail 是开关而不是"按距离淡出"】
 * 角度和透明度连续变化没问题，但 draw call 的代价是阶跃的：烟在屏幕上只有
 * 2 个像素时仍然各占一次 draw call。远景（dist > 22）直接整组隐藏，
 * 省下的是一次次的绘制；近景才恢复。所以是布尔开关，不是渐变。
 *
 * 数学全在 utils/portLife（纯函数、可单测），这里只做赋值。
 */
export function animatePortLife(group: THREE.Group, t: number, detail: boolean): void {
  const life = group.userData.portLife as
    | { flags: THREE.Mesh[]; puffs: THREE.Sprite[]; seed: number }
    | undefined
  if (!life) return

  // 旗：幅度小、频率快，读作"风里的布"
  for (let i = 0; i < life.flags.length; i++) {
    life.flags[i].rotation.y = flagYaw(t, life.seed + i)
  }

  // 烟：远景就别画了
  for (let i = 0; i < life.puffs.length; i++) {
    const sp = life.puffs[i]
    sp.visible = detail
    if (!detail) continue
    const pose = smokePose(i, t, life.seed)
    sp.position.set(
      (sp.userData.baseX as number) + pose.sway,
      (sp.userData.baseY as number) + pose.rise,
      sp.userData.baseZ as number,
    )
    sp.scale.setScalar(pose.scale)
    // 峰值 0.34：再高就变成一块白斑（软边 sprite 在深色海面上尤其显眼）
    sp.material.opacity = pose.alpha * 0.42
  }
}

export interface ShipModelKit {
  /** 'player' 才有桅顶红旗（见 createShipModelKit 的说明） */
  kind: 'player' | 'merchant'
  hull: THREE.BufferGeometry
  deck: THREE.BoxGeometry
  mast: THREE.CylinderGeometry
  sail: THREE.BufferGeometry
  yard: THREE.CylinderGeometry
  bowsprit: THREE.CylinderGeometry
  /** 桅顶红旗：与港口旗共用同一份几何/材质（0.072×0.038 的小三角旗） */
  flag: THREE.PlaneGeometry
  flagMat: THREE.MeshStandardMaterial
  hullMat: THREE.MeshStandardMaterial
  deckMat: THREE.MeshStandardMaterial
  mastMat: THREE.MeshStandardMaterial
  sailMat: THREE.MeshStandardMaterial
}

/**
 * 船的几何。
 *
 * 【原来为什么像"一张漂在水上的棕色饼 + 三根棍子"】
 * 三处叠加错了：
 * ① 船体：`CylinderGeometry(0.5, 0.3, 0.32)` 先 `scale(1.7, 1, 0.8)` 再 `rotateX(90°)`，
 *    圆柱的**高**只有 0.32、而半径 0.5 被 X 拉成 0.85 —— 转完之后船体
 *    横向 1.7、纵向只有 0.32，是"横着比竖着宽"的澡盆。俯视看就是一张饼。
 * ② 桅杆：按 x = -0.28 / 0.08 / 0.38 排——那是**横向**（船宽方向），
 *    三根桅杆并排立在船的左右舷之间。
 * ③ 帆：`rotation.y = π/2` 让帆面朝左右。方帆的帆面应该**垂直于龙骨**（朝前后），
 *    转了 90° 之后帆变成两片侧向的鳍，从默认的西南向俯视几乎看成一条边。
 *
 * 现在：船体沿 Z（船首方向）拉长到 1.3、横向 0.4、竖向 0.25；
 * 桅杆沿 Z 排在同一条龙骨线上；帆面朝前后，并带一点**鼓胀**（正弦鼓起 0.07），
 * 这样即使在侧视角度也不会退化成一条线。
 * 另外每根桅杆加一根横桁（yard）：帆被看成一条边的时候，横桁仍然清晰可见，
 * 一眼就能读出"这是帆船"——真实帆船的横桁本来也比帆宽。
 */
/**
 * @param kind 'player' = 玩家座舰（暖米色帆 + 桅顶红旗）；
 *             'merchant' = NPC 商船（冷灰帆、无旗）。
 *
 * 【为什么必须区分】原来两边共用同一个套件，只靠 0.72 的缩放区分。
 * 实测默认视野下船长只有 30~40px，缩放差 28% 在小尺寸上几乎读不出来 ——
 * 玩家经常分不清"哪艘是我的船"。改颜色（帆的色相）比改尺寸更容易在
 * 这个尺度上被认出来，红旗是第二重保险（在深色海面上红色最跳）。
 */
export function createShipModelKit(kind: 'player' | 'merchant' = 'player'): ShipModelKit {
  // 圆柱的"高"就是船长：转 90° 之后沿 Z 展开
  const hull = new THREE.CylinderGeometry(0.20, 0.13, 1.30, 8, 1)
  hull.rotateX(Math.PI / 2)
  hull.scale(1, 0.62, 1)

  // 帆：带鼓胀的曲面（平面在 XY，法线 +Z；沿 +Z 方向鼓起 = 顺风鼓帆）
  const sail = new THREE.PlaneGeometry(0.36, 0.30, 8, 1)
  {
    const pos = sail.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const u = (pos.getX(i) + 0.18) / 0.36
      pos.setZ(i, Math.sin(Math.PI * u) * 0.07)
    }
    pos.needsUpdate = true
    sail.computeVertexNormals()
  }

  return {
    kind,
    hull,
    deck: new THREE.BoxGeometry(0.34, 0.04, 1.02),
    mast: new THREE.CylinderGeometry(0.018, 0.024, 0.9, 6),
    sail,
    yard: new THREE.CylinderGeometry(0.013, 0.013, 0.44, 6),
    bowsprit: new THREE.CylinderGeometry(0.014, 0.014, 0.44, 6),
    // 红旗：右边缘对齐桅杆（几何原点在左边缘），这样绕 Y 摆动时像旗
    // 尺寸按"远景也能看见"定：0.14×0.075 × 船体 0.8 ≈ 0.11 世界单位（默认视野约 4px）
    flag: new THREE.PlaneGeometry(0.14, 0.075).translate(0.07, 0, 0),
    flagMat: new THREE.MeshStandardMaterial({
      color: 0xc0392b, roughness: 0.85, side: THREE.DoubleSide,
      // 一点自发光：暗侧（背光面）也要读得出是红的，否则远景就是一粒黑点
      emissive: 0x3a0f0a, emissiveIntensity: 0.6,
    }),
    hullMat: new THREE.MeshStandardMaterial({
      color: kind === 'merchant' ? 0x6b4a24 : 0x5c2e0a, roughness: 0.88,
    }),
    deckMat: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 }),
    mastMat: new THREE.MeshStandardMaterial({ color: 0x3f2410, roughness: 0.9 }),
    /*
     * 帆：暖米色，不是白。
     *
     * 原来 color 0xf6ecd6 + emissive 0x2a2418@1，实测渲染出来是 rgb(226,213,187)
     * ——亮度是旁边海面 rgb(25,73,85) 的 **11 倍**，全屏最亮的东西变成三块帆布。
     * 而这张图的基调是"暗桌上的铜木海图"，最亮的不该是玩家的船帆。
     * 现在压到 0xded0b0、自发光减半（自发光是常数项，在暗部占比很大，
     * 它才是"发光感"的来源），目标是落在 rgb(200,186,160) 附近。
     */
    sailMat: new THREE.MeshStandardMaterial({
      /*
       * 商船用冷灰帆（0xb9bdb6）：亮度与玩家帆（0xded0b0）接近，
       * 只改色相 —— 改亮度会让某一方在海面上"更亮"，反而变成"谁是主角"的误导。
       */
      color: kind === 'merchant' ? 0xa8b2b4 : 0xded0b0,
      roughness: 0.92, side: THREE.DoubleSide,
      emissive: 0x1a1710, emissiveIntensity: 0.5,
    }),
  }
}

/** 造一艘低模帆船（船首朝 +Z） */
export function makeShipModel(kit: ShipModelKit): THREE.Group {
  const g = new THREE.Group()

  const hull = new THREE.Mesh(kit.hull, kit.hullMat)
  hull.position.y = 0.06
  hull.castShadow = true
  g.add(hull)

  const deck = new THREE.Mesh(kit.deck, kit.deckMat)
  deck.position.y = 0.17
  g.add(deck)

  // 桅杆沿龙骨（Z）排：前 / 中 / 后。船首是 +Z，所以最前那根离桅顶最近。
  for (const z of [-0.36, 0.04, 0.40]) {
    const m = new THREE.Mesh(kit.mast, kit.mastMat)
    m.position.set(0, 0.17 + 0.45, z)
    m.castShadow = true
    g.add(m)

    // 方帆：帆面垂直于龙骨（朝前后），不做 rotation.y
    const sail = new THREE.Mesh(kit.sail, kit.sailMat)
    sail.position.set(0, 0.17 + 0.46, z)
    sail.castShadow = true
    g.add(sail)

    // 横桁：比帆更宽，帆看成一条边时靠它保住"帆船"的轮廓
    const yard = new THREE.Mesh(kit.yard, kit.mastMat)
    yard.rotation.z = Math.PI / 2
    yard.position.set(0, 0.17 + 0.46 + 0.17, z)
    g.add(yard)
  }

  /*
   * 桅顶红旗（只给玩家）。
   * 【为什么加这个】商船与座舰的差别原来只有缩放，近景能看出来、远景不能。
   * 红旗是"最高饱和度的最小色块"，在深青绿海面上是全图最跳的颜色之一，
   * 30px 尺度下也能一眼锁定自己的船。几何只有 4 个三角形。
   */
  if (kit.kind === 'player') {
    const flag = new THREE.Mesh(kit.flag, kit.flagMat)
    // 挂在后桅顶下方一点（桅顶 y=1.07，旗中心 1.00）
    flag.position.set(0.02, 1.0, 0.40)
    g.add(flag)
  }

  // 船首斜桁：从船头向前上方伸出
  const bs = new THREE.Mesh(kit.bowsprit, kit.mastMat)
  bs.rotation.x = Math.PI / 2 - 0.22
  bs.position.set(0, 0.22, 0.74)
  g.add(bs)

  g.scale.setScalar(0.8)
  return g
}
