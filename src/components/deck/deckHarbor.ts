import { hash01 } from './deckCoast'

/**
 * 靠港近景：从甲板上看见的那座城。
 *
 * 【为什么需要这一层】`coastModel` 给的是一条**通用海岸**——山脊、树、一座灯塔。
 * 它解决的是"我在某片陆地的附近"，但回答不了"我到了哪座港"：停在塞维利亚港和
 * 停在无人的荒岛，甲板上的画面一模一样。用户的原话是"上岸走走似乎也没做成 3D"、
 * "细节还是差很多"。所以这一层要给出**只有港口才有的东西**：
 * 防波堤、码头面、栈桥、成排的仓库与民居、停泊的商船（桅杆林）、吊货的臂架、旗。
 *
 * 【为什么按 region 分样式，而不是每港一套】21 个港做 21 套模型是做不到的（也没有
 * 足够的历史资料）。但"大西洋边的石砌红瓦""加勒比的木棚茅顶""南海的木构青瓦"
 * 这三种在剪影上就能分开，而且正好对应本作已有的五个海域。差异落在**屋顶、
 * 墙色、防波堤材质、船型（硬帆/软帆）** 四件事上——看剪影就能认出到哪片海了。
 *
 * 【为什么全在这里写成数据 + 纯函数】几何那一半（`harborModel.ts`）只负责把数字
 * 变成 mesh。这样"房子有没有超出岸线宽度""栈桥会不会跟防波堤撞上""沉船有没有
 * 横在船头正前方"这些都能在单测里直接算，不用开浏览器量像素。
 */

/** 港口样式（与 `data/ports` 的 region 一一对应） */
export type HarborStyleId = 'europe' | 'caribbean' | 'asia' | 'africa'

export interface HarborStyle {
  id: HarborStyleId
  /** 取证用的一句话（不写进 UI） */
  name: string
  /** 墙 / 屋顶 / 木料 / 石堤 */
  wall: number
  roof: number
  timber: number
  stone: number
  /** 屋顶高 / 房高大（0.4 = 缓坡，0.9 = 陡尖顶） */
  roofPitch: number
  /** 房屋数范围（取 [min,max] 之间） */
  houses: [number, number]
  /** 栈桥数 */
  piers: number
  /** 停泊商船数 */
  moorings: number
  /** 教堂尖顶 / 望楼：有就比房屋高出一截，是港口的天际线 */
  spire: boolean
  /** 棕榈 / 榕树的棵数（热带的识别符号） */
  palms: number
  /** 旗色 */
  banner: number
  /** 码头面（石砌 or 木栈）：欧洲/非洲是石，加勒比/南洋是木 */
  quay: number
  /** 帆型：'square' 方帆（欧洲）、'junk' 硬帆（中式/南洋） */
  sail: 'square' | 'junk'
  /** 窗光色（暖黄 / 偏橙 / 偏白） */
  lamp: [number, number, number]
  /**
   * 墙面调色板（**乘**在 `wall` 上，逐栋按 hash 取一条）。
   *
   * 【为什么必须逐栋换色相，而不只是换亮度】一套样式只有一个 `wall` 色值，
   * 逐栋只抖 ±8% 亮度时，屏幕上得到的是"一种颜色有深有浅"——它仍然是一条色带。
   * 真实的地中海/伊比利亚港是**粉墙、赭墙、奶白墙、淡青墙**混在一条街上：
   * 相邻两栋的色相不同，眼睛才开始把它们数成"一栋一栋的房子"。
   * 三个分量都贴 1.0，最大偏离 15%：换样式（白墙→木棚→土屋→青瓦）时
   * 每一栋仍然落在该海域的色系里，不会出现"广州的粉墙"。
   */
  wallTints: readonly (readonly [number, number, number])[]
}

/**
 * 四套样式。
 *
 * 【配色为什么比"真实"更饱和】这是夜景 + 距离 24 单位的小体量建筑，按照片调色
 * 在屏幕上只剩一团灰。屋顶与墙各自压到剪影能分开的明度差（约 20 级），
 * 才读得出"这是一排房子"。
 */
export const HARBOR_STYLES: Record<HarborStyleId, HarborStyle> = {
  /* 里斯本 / 塞维利亚 / 伦敦 / 阿姆斯特丹：白石墙 + 红瓦陡顶 + 石砌防波堤 */
  europe: {
    id: 'europe',
    name: '红瓦石堤',
    wall: 0xd8cdb6,
    roof: 0x9c4a33,
    timber: 0x4a3a28,
    stone: 0x6f6a61,
    roofPitch: 0.75,
    houses: [7, 10],
    piers: 4,
    moorings: 4,
    spire: true,
    palms: 0,
    banner: 0xb03a2e,
    quay: 0x6c6659,
    sail: 'square',
    lamp: [1.5, 1.05, 0.6],
    /* 奶白 / 赭黄 / 陶粉 / 淡橄榄 / 灰青 —— 里斯本与塞维利亚的真实街色 */
    wallTints: [
      [1.0, 1.0, 1.0],
      [1.10, 0.90, 0.64],
      [1.06, 0.82, 0.76],
      [0.97, 1.0, 0.85],
      [0.93, 0.96, 1.02],
    ],
  },
  /* 哈瓦那 / 托尔图加 / 皇家港：木棚 + 茅草顶 + 木栈桥 + 棕榈 */
  caribbean: {
    id: 'caribbean',
    name: '木棚茅顶',
    wall: 0xb08a5c,
    roof: 0x8e7a44,
    timber: 0x5a4430,
    stone: 0x5b5346,
    roofPitch: 0.55,
    houses: [5, 8],
    piers: 3,
    moorings: 3,
    spire: false,
    palms: 7,
    banner: 0x2f6b4f,
    quay: 0x423323,
    sail: 'square',
    lamp: [1.45, 1.0, 0.5],
    /* 新木 / 旧木（发灰）/ 刷过白灰 / 日晒褪色 —— 加勒比木棚的四种状态 */
    wallTints: [
      [1.0, 1.0, 1.0],
      [0.88, 0.88, 0.86],
      [1.08, 1.06, 1.0],
      [1.02, 0.91, 0.78],
    ],
  },
  /* 广州 / 满剌加 / 果阿：木构 + 青瓦（带翘檐）+ 石堤 + 硬帆 */
  asia: {
    id: 'asia',
    name: '木构青瓦',
    wall: 0xc9b189,
    roof: 0x4a5560,
    timber: 0x4a3524,
    stone: 0x64615a,
    roofPitch: 0.62,
    houses: [8, 11],
    piers: 4,
    moorings: 4,
    spire: false,
    palms: 5,
    banner: 0xc0392b,
    quay: 0x625d53,
    sail: 'junk',
    lamp: [1.55, 0.95, 0.45],
    /* 白灰墙 / 原木 / 青灰砖 / 淡赭 —— 广州与南洋的临水街面 */
    wallTints: [
      [1.03, 1.03, 1.02],
      [0.95, 0.87, 0.77],
      [0.86, 0.89, 0.92],
      [1.05, 0.97, 0.86],
    ],
  },
  /* 埃尔米纳 / 蒙巴萨 / 桑给巴尔：平顶土屋 + 珊瑚石 + 少量棕榈 */
  africa: {
    id: 'africa',
    name: '平顶土屋',
    wall: 0xc4a06a,
    roof: 0x8a7550,
    timber: 0x4f3c26,
    stone: 0x736b5c,
    roofPitch: 0.18,
    houses: [6, 9],
    piers: 3,
    moorings: 3,
    spire: false,
    palms: 6,
    banner: 0x7a5230,
    quay: 0x6f6653,
    sail: 'square',
    lamp: [1.5, 1.0, 0.52],
    /* 夯土 / 珊瑚石刷白 / 赭红土 / 深色土 —— 东非海岸的土屋 */
    wallTints: [
      [1.0, 1.0, 1.0],
      [1.1, 1.09, 1.06],
      [1.06, 0.88, 0.74],
      [0.85, 0.83, 0.8],
    ],
  },
}

/** `data/ports` 的 region → 样式（america 归到 caribbean：都是西班牙殖民港的样子） */
export function harborStyleFor(region: string): HarborStyle {
  if (region === 'asia') return HARBOR_STYLES.asia
  if (region === 'africa') return HARBOR_STYLES.africa
  if (region === 'caribbean' || region === 'america') return HARBOR_STYLES.caribbean
  return HARBOR_STYLES.europe
}

/**
 * 超过这个距离就不画港：6 海里以外只保留 `coastModel` 的通用海岸。
 *
 * 【为什么是 6】亭可马里的灯塔在 6 海里处约 40px 高，房屋（1.6 世界单位）约 22px——
 * 再远房子就只剩贴在地上的一条色带，画出来反而是噪点。而 6 海里内正好是
 * "准备进港"的那一段：玩家这时候最需要看清码头在哪一侧。
 */
export const HARBOR_MAX_NM = 6

/* ---------------------------------------------------------------- 布局 */

export interface HarborHouse {
  /** 沿案线的位置（世界单位，本地 x） */
  x: number
  /** 向海为负（本地 z） */
  z: number
  w: number
  h: number
  d: number
  /** 屋顶高 */
  roofH: number
  /** 这一栋亮着灯吗（夜里才有区别） */
  lit: boolean
  /** 稍微歪一点，成排的房子不该像贴图 */
  yaw: number
  /*
   * ---- 打破"方块感"的三个形状参数（第 118 轮）----
   *
   * 用户的原话是"几何太简单，方块感重" —— 一栋房 = 一个盒子 + 一个三角顶，
   * 加再多贴图也还是盒子。真实的排屋在**体块**上就有凹凸：
   */
  /**
   * 二层挑出量（`w` 的比例，0 = 不挑）。都铎与地中海老城最常见的做法：
   * 上层比下层宽 4~8%，转角处因此有一道真实的阴影线。
   */
  jetty: number
  /** 挑出发生在房高的哪一层（0.42~0.52 = 一层半的位置） */
  splitY: number
  /**
   * 侧向偏房（加建）：真实街面上的房子不是一刀切的排屋，隔几栋就有一段
   * 矮一点的披屋（厨房、货栈、马厩）。`null` = 没有。
   */
  annex: { x: number; z: number; w: number; h: number; d: number } | null
  /**
   * 山墙面朝街（屋脊垂直于岸线）。
   *
   * 【为什么这条比加贴图有用】真实的地中海与都铎排屋有近一半是"山墙朝街"的：
   * 立面是一个**大三角**，两侧是坡面。现在所有房子的屋脊都平行岸线，
   * 从甲板看过去是一排一模一样的红三角 —— 重复感本身就是"模型"的信号。
   * 三分之一转 90° 之后，立面在"长坡"与"三角"之间交替，轮廓立刻不一样。
   */
  endGable: boolean
}

/**
 * 城内第三排「远屋顶」。
 *
 * 【为什么必须再加一排】前两排都在 z=0.7~1.9，从甲板看过去，城就是**一条贴岸
 * 的房子带**；带子上面直接接草地与松树 —— 读作"码头边一排仓库"，而不是一座城
 * （1440×900 截图实测）。真实港口的天际线是三层：临街仓库、后排商馆、再后面
 * 一片更密更高的屋顶，一层比一层淡（空气透视）。
 *
 * 【为什么只给墙 + 屋顶】这一排在 40 单位外，窗与烟囱都不到两个像素，
 * 建模成本全白花；三层的高度差与色差才是它要提供的信号。
 */
export interface HarborFarHouse {
  x: number
  z: number
  w: number
  h: number
  d: number
  roofH: number
  yaw: number
}

/**
 * 墙上的窗洞（不是窗光：白天也要看得见的那几个凹口）。
 *
 * 【为什么单独一层】房屋墙是 Basic 材质的一块纯色，白天读作"白板"——
 * 一排没有窗的房子在甲板上看就是几块纸板（实测截图）。窗洞是**白天唯一的
 * 立面细节**，也是判断"这是民居不是仓库"的依据。夜里同一位置再叠一层
 * 加法光点（`deck-harbor-windows`）。
 */
export interface HarborPane {
  x: number
  y: number
  z: number
  w: number
  h: number
  /**
   * 门（不再是窗）。
   * 【为什么必须区分】一排只有窗、没有门的房子，在甲板视角上读作"仓库模型"：
   * 窗在墙的上半、一排排整齐地排着，没有任何"从这里进去"的暗示。真实的地中海
   * 排屋每栋临街一个门（比窗高、贴地、木色、有石框）。这里用同一个实例池，
   * 只把框的比例收窄（门框比窗框小得多）、位置贴地。
   */
  door?: boolean
}

/**
 * 码头上的一盏灯（灯笼 / 火把）。
 *
 * 【为什么要有】夜里的港口现在只有房子的窗光（一排小点，且都在墙上）。
 * 真实的码头是**沿着水边挂一排灯**的：栈桥末端、系缆桩、货堆旁。
 * 这一排灯是夜里"这里是码头"最强的形状信号 —— 它沿着岸线走，
 * 与散在墙上的窗光完全不同的分布。
 *
 * 【为什么挂在栈桥末端】那儿是船靠上来系缆的地方，也是唯一必须看清的地方；
 * 灯挂在尽头，还能让栈桥本身在夜里显出长度（否则夜里只剩一片黑）。
 */
export interface HarborLamp {
  x: number
  z: number
  /** 灯的高度（世界单位） */
  y: number
  /** 灯的亮度系数（0.7~1.2，让一排灯不是同样的亮） */
  k: number
}

/**
 * 一根系泊缆绳（从停泊的商船拉到岸上）。
 *
 * 【为什么要有】停在码头边的船现在只是"浮在那里"：一根缆绳都没有，
 * 看久了会发现它在漂（船体还随浪起伏）。真实的系泊是**船首与船尾各一根、
 * 斜着拉到码头的系缆桩**上，形成一个"八"字 —— 这个形状一眼就能读出
 * "这条船被系住了"，比任何细节都省。
 */
export interface MooringLine {
  /** 船上一端（本地坐标，y 在甲板高度附近） */
  from: [number, number, number]
  /** 岸上一端 */
  to: [number, number, number]
  /** 中段下垂量（世界单位）—— 真实缆绳不会绷成直线 */
  sag: number
}

/**
 * 灯在水面上的倒影长度（世界单位）。
 *
 * 【为什么倒影要"躺"在水面上、朝相机方向拉长】真实的水面倒影不是"灯下面的
 * 一团亮"，而是**沿视线方向**被拉成一条竖带（水面波纹把像横向揉开、纵向拉长）。
 * 相机在船尾看着 +z，所以这条带从灯的水面投影点朝 −z（相机）延伸。
 *
 * 【长度为什么跟灯高走】越高的光源，倒影越长（几何上就是 y/视线角）。给 1.6 倍
 * 是为了在小尺度上读得出来 —— 按严格反射该是 tan 关系，但那是"景别"，不是比例尺。
 */
export function lampReflectionLen(lampY: number): number {
  const y = Number.isFinite(lampY) ? Math.max(0, lampY) : 0
  return Math.min(3.4, y * 2.2)
}

/**
 * 岸壁上的一块压顶石。
 *
 * 【为什么要把一整块岸壁拆成石块】岸壁原来是一整块 Box —— 从甲板上看，
 * 码头朝水的那一面是**一条笔直的水平边**，十几米长一个像素不变，读作"水泥台"。
 * 真实码头是石块砌的：块与块之间有竖缝、每块高度略差、前沿略有参差。
 * 一条"有齿"的边就够把"水泥台"变成"石砌码头"。
 */
export interface HarborQuayStone {
  x: number
  w: number
  /** 前沿前后参差（±0.025 单位） */
  dz: number
  /** 这块的明暗系数（0.86~1.06） */
  k: number
}

/** 系缆桩（码头边一排，船靠上来系缆绳的地方） */
export interface HarborBollard {
  x: number
}

/** 码头上的货堆（板条箱 / 木桶 / 麻袋） */
export type CargoKind = 'crate' | 'barrel' | 'sack'

/**
 * 码头前沿的一件货。
 *
 * 【为什么必须有】码头前沿（栈桥两侧那条窄带）原来是空的 —— 只有十几个人，
 * 没有一件**货**。而"这里是码头"最强的信号恰恰是货：板条箱叠着、木桶排着、
 * 麻袋堆在栈桥口。它们就在相机的正前方 20 米，屏幕上每件 10~25 像素，
 * 是这一层唯一还能"加物件"而不显得刻意的位置。
 */
export interface HarborCargo {
  x: number
  z: number
  w: number
  h: number
  d: number
  yaw: number
  kind: CargoKind
}

/** 码头上的人的三种身份（只影响衣服颜色与站位，不影响任何数值） */
export type FolkKind = 'porter' | 'sailor' | 'idle'

/**
 * 码头上的一个人（远景剪影）。
 *
 * 【为什么要有】房子、栈桥、防波堤都做完之后，这座城里**一个人都没有** ——
 * 画面上读作"模型"而不是"地方"。人在 18 单位外只有十来个像素，但正是这十来个
 * 像素（会动、会挡、会聚成三两个一组）让港口活起来。
 *
 * 【为什么尺寸夸张】真实 1.7 米 = 0.09 世界单位，在 18 单位外是 **5 像素** ——
 * 那是噪点，不是人。0.13~0.17 单位（2.3~3 米）时屏幕上是 3×8 像素，
 * 实测仍然读不出来（而且一半会被停泊船挡住）。给到 0.19~0.24（3.5~4.3 米）
 * 才有 5×13 像素：能看出"一个人站在那"。与灯塔同一个取舍 ——
 * 远处的识别特征允许放大，比例尺由 HUD 的数字负责。
 */
export interface HarborFolk {
  x: number
  z: number
  /** 朝向（弧度，0 = 面向内陆） */
  yaw: number
  kind: FolkKind
  /** 身高（世界单位） */
  h: number
  /** 走路的相位（每人的摇摆不同步） */
  phase: number
}

export interface HarborChimney {
  x: number
  z: number
  h: number
  w: number
}

export interface HarborPier {
  x: number
  /** 从这条 z 向海伸出（负数） */
  z0: number
  z1: number
  w: number
}

export interface HarborBreakwater {
  /** 内端 / 外端（本地坐标） */
  x0: number
  z0: number
  x1: number
  z1: number
  h: number
}

export interface HarborMooring {
  x: number
  z: number
  yaw: number
  /** 船长（世界单位） */
  len: number
}

export interface HarborPlan {
  visible: boolean
  /** 码头面：沿案线的半宽、z 范围、顶面高度 */
  deckHalfW: number
  deckZ0: number
  deckZ1: number
  deckY: number
  houses: HarborHouse[]
  /** 城内第三排（只有墙与屋顶，向灰蓝里压，做空气透视） */
  farHouses: HarborFarHouse[]
  piers: HarborPier[]
  breakwaters: HarborBreakwater[]
  moorings: HarborMooring[]
  palms: { x: number; z: number; h: number }[]
  /** 墙上的窗洞 */
  panes: HarborPane[]
  /** 屋顶上的烟囱 */
  chimneys: HarborChimney[]
  /** 岸壁的压顶石（沿 x 一排） */
  quayStones: HarborQuayStone[]
  /** 系缆桩 */
  bollards: HarborBollard[]
  /** 码头上的货堆 */
  cargo: HarborCargo[]
  /** 码头上的人 */
  folk: HarborFolk[]
  /** 水边的灯 */
  lamps: HarborLamp[]
  /** 系泊缆绳 */
  lines: MooringLine[]
  /** 尖顶（x, z, 高度）—— 没有 spire 的样式返回 null */
  spire: { x: number; z: number; h: number } | null
  /** 吊货臂架（x, z, 臂长） */
  cranes: { x: number; z: number; arm: number }[]
  /** 旗杆位置 */
  flag: { x: number; z: number; h: number }
}

const EMPTY_PLAN: HarborPlan = {
  visible: false,
  deckHalfW: 0,
  deckZ0: 0,
  deckZ1: 0,
  deckY: 0,
  houses: [],
  farHouses: [],
  piers: [],
  breakwaters: [],
  moorings: [],
  palms: [],
  panes: [],
  chimneys: [],
  quayStones: [],
  bollards: [],
  cargo: [],
  folk: [],
  lamps: [],
  lines: [],
  spire: null,
  cranes: [],
  flag: { x: 0, z: 0, h: 0 },
}

/**
 * 生成一座港的布局。
 *
 * @param style   样式（决定房屋数、栈桥数、尖顶有没有）
 * @param width   岸线总宽（世界单位，来自 `coastLayout`）
 * @param presence 0..1（越近越大；房屋与栈桥都跟着放大）
 * @param seed    港 id：同一个港每次进来都是同一座城，不同的港长得不一样
 *
 * 【坐标约定】本地 x 沿案线（−0.5W..0.5W），本地 z **向海为负**（相机在船尾 −z，
 * 所以负 z 更靠近玩家）。码头面在 z≈0..+1.2（贴着水线），栈桥与防波堤伸向负 z。
 * 这个方向写反过一版：栈桥朝内陆伸，画面上一条都看不到（全在岸后面）。
 */
export function harborPlan(style: HarborStyle, width: number, presence: number, seed = 1): HarborPlan {
  const W = Number.isFinite(width) && width > 0 ? width : 0
  const p = Math.max(0, Math.min(1, Number.isFinite(presence) ? presence : 0))
  if (W <= 0 || p <= 0) return EMPTY_PLAN

  /*
   * 尺度：房屋随 presence 长（远处一小簇，近处一排）。**但不跟着 width 线性放大** ——
   * width 是"岸线要铺满视野"定的（2×半径），如果房子也乘上去，靠近时每栋房子会有
   * 20 米高。房屋的绝对尺寸只由 presence 决定（0.55 ~ 1.9 世界单位 ≈ 10~34 米），
   * 只有**数量与排布范围**跟 width 走。
   */
  const s = 0.55 + 1.35 * Math.pow(p, 0.8)
  const halfW = Math.min(W * 0.34, 9.5 * s)
  const rnd = (k: number) => hash01(seed * 13.7 + k)

  /** 码头面顶面高度（房子站在上面） */
  const deckTopY = 0.16 + 0.07 * s
  /** 码头面靠海那一侧的边（人不能站到边上掉进水里） */
  /*
   * 码头面靠海那一侧的边。
   *
   * 【为什么从 −0.2 推到 −0.45】0.2 时，从甲板上看"房子底部 → 水面"之间只有
   * 十几像素的深褐色 —— 房子像**直接浮在水上**，整座港没有"岸"这个厚度。
   * 铺到 −0.45（≈8 米）之后房子脚下有一条能看清的石面，压顶石与矮墙也才有
   * 地方站。人仍然站在 +0.14 之后，不会掉进水里。
   */
  const deckNearZ = -0.45
  /*
   * 房数取区间的**偏上**一半：房子之间的缝是"一排独立盒子"的元凶 ——
   * 缝里直接露出背后的草地与松树，视线就穿到城后面去了。
   * 7~10 栋时随机取值平均只有 8.5 栋，实测那张全景里能数出 3 道明显的缝。
   */
  const nHouse = Math.round(style.houses[1] - (style.houses[1] - style.houses[0]) * 0.3 * rnd(1))
  const houses: HarborHouse[] = []
  for (let i = 0; i < nHouse; i++) {
    const t = (i + 0.5) / nHouse
    /*
     * 两排：前排矮（仓库，紧贴码头），后排高（民居/商馆）。
     * 【为什么必须两排】一排房子的天际线是一条直线，看起来像一堵墙；
     * 交错的两排才有"城"的厚度，而且前排能挡住后排的地基，省掉建模。
     */
    const back = i % 3 === 1
    const w = (0.62 + 0.5 * rnd(i * 3.1 + 5)) * s * (back ? 1.15 : 1)
    /*
     * 【高度是量出来的】第一版 0.72·s（s=1.9）→ 每栋房 1.4 单位 ≈ 25 米高、
     * 宽 1.2~2.1 单位，高宽比接近 1:1.2 —— 屏幕上是一排**塔**（实测截图里
     * 房子像钟楼，天际线全是尖顶）。0.42·s 让前排仓库 12 米、后排商馆 16 米，
     * 才是"码头边一排三四层的房子"。
     */
    /*
     * 高度抖动 0.85~1.2 → 0.78~1.33：原来的区间只有 ±1 米，一排房顶几乎齐平，
     * 天际线是一条红线（这正是"积木感"的一半）。真实街面上的房子是一栋三层
     * 挨着一栋两层，差一层人才读得出"这是一座城"。
     */
    const h = (back ? 0.56 : 0.42) * s * (0.78 + 0.55 * rnd(i * 5.7 + 9))
    const x = (t - 0.5) * 2 * halfW + (rnd(i * 7.3 + 3) - 0.5) * (halfW / nHouse) * 0.5
    houses.push({
      x,
      /*
       * 前后错落 ±0.25：原来的 z 只有两档（0.72 / 1.35），从甲板平视过去，
       * 房子之间**看不到侧墙** —— 一排立面平铺在一条线上，正是"纸片"的来源。
       * 错落之后房子之间露出侧墙（`shadeFaces` 给侧面暗一档），立体感来自明暗差。
       */
      z: back ? 1.3 + 0.6 * rnd(i * 2.2 + 11) : 0.62 + 0.4 * rnd(i * 2.2 + 11),
      w,
      h,
      d: w * (0.62 + 0.4 * rnd(i * 4.4 + 13)),
      /*
       * 屋顶高度 = 房高 × 坡度 × 0.56 × 逐栋抖动。
       * 【为什么是 0.56】原来是 h × 坡度（欧洲 0.75）—— 屋顶有房高的 75%，
       * 再加 14% 的挑檐、又是在 20 单位外的俯视角，屏幕上屋顶比墙还大，
       * 一排房子读作"一排红帽子"。真实的地中海排屋屋顶只占房高的 25~35%。
       */
      /*
       * 逐栋抖 ±20%：同一个坡度的一排房子，屋顶在屏幕上是**同一形状**重复十次
       * —— 这比任何贴图都更像"模型"。
       */
      roofH: h * style.roofPitch * 0.56 * (0.82 + 0.4 * rnd(i * 3.3 + 47)),
      lit: rnd(i * 9.9 + 17) > 0.42,
      yaw: (rnd(i * 6.1 + 19) - 0.5) * 0.12,
      /*
       * 一半多一点的房子有挑出（4~7%），挑出位置在房高 42~52%。
       * 比例必须小：10% 以上时屏幕上是"头重脚轻的蘑菇"（实测），
       * 4~7% 只够让那个转角投出一条阴影。
       */
      jetty: rnd(i * 2.7 + 31) > 0.42 ? 0.04 + 0.03 * rnd(i * 3.9 + 33) : 0,
      splitY: 0.42 + 0.1 * rnd(i * 5.3 + 35),
      /*
       * 三分之一多一点带偏房：宽 40~60%、高 55~75% 的一截，贴在左右任一侧。
       * 这一截打断"一排等高盒子"的整齐律 —— 天际线立刻有次要起伏。
       */
      endGable: rnd(i * 2.3 + 51) > 0.62,
      annex: (() => {
        if (rnd(i * 7.1 + 37) <= 0.58) return null
        const side = rnd(i * 8.3 + 39) > 0.5 ? 1 : -1
        const aw = w * (0.4 + 0.2 * rnd(i * 9.7 + 41))
        /*
         * 偏房的位置**夹在码头面里**：直接 `h.x + side*(w/2 + aw/2)` 会让最外侧
         * 那几栋的偏房悬到水上（单测"不越出码头面"会红，画面里是悬空的房子）。
         * 夹住之后它与主屋部分重叠 —— 视觉上反而更像"后来贴上去的一间"。
         */
        const ax = Math.max(-halfW * 0.96, Math.min(halfW * 0.96, x + side * (w * 0.5 + aw * 0.45)))
        return {
          x: ax,
          z: (back ? 1.35 : 0.72) + 0.12,
          w: aw,
          h: h * (0.55 + 0.2 * rnd(i * 4.7 + 43)),
          d: w * (0.45 + 0.25 * rnd(i * 6.3 + 45)),
        }
      })(),
    })
  }

  /*
   * 第三排：城内的远屋顶（只有墙与屋顶，由模型压向灰蓝）。
   *
   * z 上限卡在 `deckZ1`（3.4）以内：越过它就站到草地上、脚下露一条绿边；
   * x 照前排同一个约束（|x| + w/2 ≤ halfW），否则悬在水上。
   * 数量 10~15、每栋更窄 —— **密**才是"一片屋顶"，少数几栋只会读成"又三栋房子"。
   */
  const farHouses: HarborFarHouse[] = []
  {
    const nFar = 10 + Math.floor(rnd(151) * 6)
    for (let i = 0; i < nFar; i++) {
      const t = (i + 0.5) / nFar
      const w = (0.5 + 0.36 * rnd(i * 3.7 + 157)) * s
      /*
       * 远排**必须比后排高**，不能更矮。甲板视角的视线几乎是平的（眼高 1.5、
       * 远排在 27 单位外）：后排房顶 1.45 时，远排若只有 1.1，整排会被挡得
       * 一个像素都看不见（按直线求交算过）。0.55~1.0·s（17~32 米，四五层）
       * 才在前排屋脊之上露出一层屋顶 —— 这也是真实港口天际线的样子。
       */
      const h = (0.55 + 0.45 * rnd(i * 9.1 + 167)) * s
      farHouses.push({
        x: Math.max(-halfW * 0.82, Math.min(halfW * 0.82, (t - 0.5) * 1.5 * halfW + (rnd(i * 5.3 + 161) - 0.5) * 0.4 * s)),
        z: 2.15 + 1.15 * rnd(i * 7.9 + 163),
        w,
        h,
        d: w * (0.62 + 0.4 * rnd(i * 4.1 + 173)),
        // 屋顶比前两排更陡：远排要的是"层叠的坡面"，平顶在这里只是几条横线
        roofH: h * style.roofPitch * 0.66,
        yaw: (rnd(i * 2.9 + 179) - 0.5) * 0.34,
      })
    }
  }

  /*
   * 窗与烟囱：跟着房子走。
   * 窗**只在正面**（z 小于房中心 = 朝海那面），一排房子面对码头的那面才有窗；
   * 正面按房宽分 2~3 个、两排（一层与二层）。背面不画（看不见，省实例）。
   */
  const panes: HarborPane[] = []
  const chimneys: HarborChimney[] = []
  for (let i = 0; i < houses.length; i++) {
    const h = houses[i]
    const cols = h.w > 1.05 * s ? 3 : 2
    /*
     * 【窗必须**贴在墙面外侧**】第一版放在 `z - d/2 - 0.01`、厚度 0.03：
     * 一半嵌进墙里、露出来的 1.5 厘米在 18 单位外不到一个像素，而且与墙面
     * 深度冲突 —— 白天一个窗都看不见（实测放大截图里是一排纯白墙）。
     * 现在整块落在墙外（-0.05），厚度 0.05。
     */
    const zf = h.z - h.d * 0.5 - 0.05
    /*
     * 门：只有**临码头那排**（z < 1.0）开门。门洞贴地、比窗高、比窗窄，
     * 正对街面正中；与门在同一列的下层窗要让位（否则门窗叠在一起）。
     */
    const hasDoor = h.z < 1.0
    const doorW = Math.min(0.24 * s, h.w * 0.24)
    const doorH = Math.min(0.4 * s, h.h * 0.46)
    for (let c = 0; c < cols; c++) {
      const t = (c + 0.5) / cols - 0.5
      const px = h.x + t * h.w * 0.66
      for (const [row, yy] of [[0, 0.42], [1, 0.7]] as const) {
        // 后排（商馆）高，两排窗都有；前排仓库矮，只开一层
        if (h.h < 0.52 * s && row === 1) continue
        // 门的正上方那格窗让位
        if (hasDoor && row === 0 && Math.abs(px - h.x) < doorW * 0.95) continue
        /*
         * 12% 的窗**不开**：真实老城的立面不会每格都开窗（有的是实墙、有的
         * 封死了）。等差排列的三乘二窗格是"模型"最强的信号之一 —— 一格缺掉，
         * 眼睛立刻把它读成一栋有历史的房子而不是一个盒子。
         */
        if (rnd(i * 11.3 + c * 3.7 + row * 5.9 + 21) < 0.12) continue
        panes.push({
          x: px,
          y: deckTopY + h.h * yy,
          z: zf,
          w: Math.min(0.2 * s, h.w * 0.16),
          h: Math.min(0.26 * s, h.h * 0.2),
        })
      }
    }
    if (hasDoor) {
      panes.push({
        x: h.x,
        y: deckTopY + doorH * 0.5,
        z: zf,
        w: doorW,
        h: doorH,
        door: true,
      })
    }
    // 烟囱：一半的房子有，站在屋脊上偏一侧
    if (rnd(i * 8.3 + 71) > 0.45) {
      chimneys.push({
        x: h.x + h.w * (rnd(i * 5.1 + 73) - 0.5) * 0.5,
        z: h.z,
        h: Math.max(0.16, h.roofH * 0.7),
        w: Math.min(0.16 * s, h.w * 0.14),
      })
    }
  }

  /* 栈桥：均匀分在码头面上，但避开最中间（那里是小艇靠泊的口） */
  const piers: HarborPier[] = []
  for (let i = 0; i < style.piers; i++) {
    const t = (i + 0.5) / style.piers
    const x = (t - 0.5) * 1.72 * halfW
    if (Math.abs(x) < halfW * 0.12) continue
    const reach = (2.2 + 2.6 * rnd(i * 3.9 + 23)) * s
    piers.push({ x, z0: 0.16, z1: -reach, w: 0.34 * s })
  }

  /*
   * 岸壁的压顶石：沿 x 一排，宽度 0.24~0.38、前沿前后参差、逐块明暗不同。
   * 块间留 0.012 的缝（露出后面那块深色的底衬）—— 竖缝是"石砌"最强的信号。
   */
  const quayStones: HarborQuayStone[] = []
  {
    const span = halfW * 2.7
    let cx = -span / 2
    while (cx < span / 2 && quayStones.length < 240) {
      const w = 0.24 + 0.14 * rnd(cx * 7.3 + 251)
      quayStones.push({
        x: cx + w * 0.5,
        w,
        dz: (rnd(cx * 5.9 + 257) - 0.5) * 0.05,
        k: 0.86 + 0.2 * rnd(cx * 3.1 + 253),
      })
      cx += w + 0.012
    }
  }

  /*
   * 系缆桩：沿岸每 ~1.55 单位一根。船靠上来系缆绳的地方 —— 原来码头边
   * 一根桩都没有，缆绳直接系在"地"上（放大截图里很怪）。
   */
  const bollards: HarborBollard[] = []
  for (let bx = -halfW * 0.92; bx <= halfW * 0.92; bx += 1.55) {
    bollards.push({ x: bx + (rnd(bx * 3.3 + 261) - 0.5) * 0.3 })
  }

  /*
   * 码头前沿的货堆。
   *
   * 位置规则与栈桥绑：每件货摆在**某条栈桥的根部两侧**（卸货就是从这里下来的），
   * 沿 z 散在 0.06~0.52 那条带上。这样"货在哪"永远讲得通，也不与房子穿模。
   */
  const cargo: HarborCargo[] = []
  if (piers.length > 0) {
    const nCargo = 7 + Math.floor(rnd(191) * 5)
    for (let i = 0; i < nCargo; i++) {
      const base = piers[i % piers.length]
      const side = rnd(i * 3.1 + 193) > 0.5 ? 1 : -1
      const kind: CargoKind = i % 3 === 0 ? 'barrel' : i % 3 === 1 ? 'crate' : 'sack'
      /*
       * 横向偏移：贴着栈桥的边（半宽 + 货的半宽 + 余量）。货堆不能压在栈桥上，
       * 否则从甲板看过去会与木板穿模 —— 木板离水面只有 0.02。
       */
      const half = kind === 'barrel' ? 0.12 : 0.14
      cargo.push({
        x: base.x + side * (base.w * 0.5 + half + 0.04 + 0.16 * rnd(i * 5.7 + 197)),
        z: 0.06 + 0.5 * rnd(i * 7.3 + 199),
        /*
         * 尺寸 0.22~0.33 单位（4~6 米）。真实板条箱 0.8 米 = 0.044 单位 =
         * 屏幕 1 像素 —— 按真实比例做出来，码头上什么都没有。0.2 时是 4px，
         * 能看出"有东西"但读不出是什么；0.26 起才像箱/桶。
         */
        w: (kind === 'barrel' ? 0.22 : 0.26) * (0.8 + 0.5 * rnd(i * 2.9 + 203)),
        h: (kind === 'barrel' ? 0.26 : 0.2) * (0.8 + 0.5 * rnd(i * 4.3 + 207)),
        d: (kind === 'barrel' ? 0.22 : 0.26) * (0.8 + 0.5 * rnd(i * 6.1 + 211)),
        yaw: (rnd(i * 8.7 + 213) - 0.5) * 0.9,
        kind,
      })
      // 三分之一再叠一件在上头（码头上的货是堆的，不是摆的）
      if (rnd(i * 9.9 + 217) > 0.66) {
        const below = cargo[cargo.length - 1]
        cargo.push({
          x: below.x + (rnd(i * 3.3 + 219) - 0.5) * 0.06,
          z: below.z + (rnd(i * 5.1 + 221) - 0.5) * 0.06,
          w: below.w * 0.82,
          h: below.h * 0.8,
          d: below.d * 0.82,
          yaw: below.yaw + 0.5,
          kind: below.kind === 'sack' ? 'crate' : 'sack',
        })
      }
    }
  }

  /*
   * 码头上的人。
   *
   * 【为什么只撒在 z < 0.65 那条带】房子从 z=0.72 起，栈桥从 z=0.16 伸出去。
   * 中间那条 0.1~0.65 的窄带是**码头前沿**（卸货、系缆绳、等人），人站那里
   * 既不与房子穿模、也不站在水里 —— 一条带就避开了两类错，不用做碰撞。
   *
   * 【为什么成组】均匀撒点是"雨滴"，三两个凑一处才是"有人在做一件事"。
   * 所以先撒几个"堆"，再在每个堆周围撒人。
   */
  const folk: HarborFolk[] = []
  {
    const nFolk = Math.max(4, Math.min(14, Math.round(houses.length * 1.25)))
    const groups = 2 + Math.floor(rnd(83) * 2)
    const kinds: FolkKind[] = ['porter', 'sailor', 'idle']
    for (let i = 0; i < nFolk; i++) {
      const g = i % groups
      /* 只在视野中部撒（±0.62 halfW）：撒满整条岸时一半的人落在画面外或被栈桥挡住 */
      const gx = (rnd(g * 4.1 + 87) - 0.5) * 1.24 * halfW
      const gz = 0.02 + rnd(g * 6.7 + 89) * 0.4
      /*
       * 避开货堆：人站在箱子里面是这一层最容易露馅的一种穿模。
       * 货堆最多 20 件、人最多 14 个，逐对比较的代价可以忽略。
       */
      let gx2 = Math.max(-halfW * 0.7, Math.min(halfW * 0.7, gx + (rnd(i * 3.3 + 91) - 0.5) * 0.9))
      const gz2 = Math.max(deckNearZ + 0.14, Math.min(0.5, gz + (rnd(i * 5.9 + 93) - 0.5) * 0.24))
      for (const cg of cargo) {
        if (Math.abs(cg.x - gx2) < cg.w * 0.7 && Math.abs(cg.z - gz2) < cg.d * 0.7) {
          gx2 += (gx2 > cg.x ? 1 : -1) * (cg.w * 0.9)
        }
      }
      folk.push({
        x: gx2,
        z: gz2,
        yaw: (rnd(i * 7.1 + 97) - 0.5) * 2.4 + (i % 2 === 0 ? 0 : Math.PI),
        kind: kinds[Math.floor(rnd(i * 2.3 + 101) * 3) % 3],
        h: (0.19 + 0.05 * rnd(i * 9.7 + 103)) * (0.9 + 0.08 * s),
        phase: rnd(i * 8.9 + 107) * Math.PI * 2,
      })
    }
  }

  /*
   * 防波堤：两道石臂从岸边伸出去，**口子留在正中间**。
   *
   * 【为什么一定要有口子】它是"这是港口不是海岸"最强的形状信号——两道臂夹着
   * 一个缺口，任何看过海图的人都读得懂。留口子的另一个好处：正前方那条
   * 视线（玩家最常看的）不被挡住。
   */
  /*
   * 【防波堤第一版为什么难看】`armLen` 给到 4~10、高度 0.52s（≈1 单位）、
   * 宽度 0.9 单位，从水线一路伸到离相机 13 单位的地方 —— 屏幕上是一块
   * 半透明的**水泥台**，把右下四分之一的画面压掉了（实测截图）。
   * 现实里的防波堤是低矮的抛石堤，只在**开口两侧**露一段头。
   * 现在：只伸 2.5~4.5 单位、高 0.3s、并且向外张得更开（0.72→0.98 halfW），
   * 让它读成"两道石臂夹着口子"，而不是一堵墙。
   */
  const armLen = (2.4 + 1.6 * rnd(29)) * s
  const breakwaters: HarborBreakwater[] = [
    { x0: -halfW * 0.98, z0: -0.1, x1: -halfW * 0.72, z1: -armLen, h: 0.3 * s },
    { x0: halfW * 0.98, z0: -0.1, x1: halfW * 0.72, z1: -armLen * 0.94, h: 0.3 * s },
  ]

  /*
   * 停泊商船：**沿着栈桥的侧舷**停，不是停在栈桥底下。
   *
   * 【为什么重写】原来按 `x = ±halfW(0.34+0.16t)`、`z = −0.8` 放 —— 那个位置
   * 正好落在栈桥板的投影里（栈桥从 z=0.16 伸到 −2.2~−4.8，x 也重叠）：从甲板
   * 望过去，四条船**全被木板盖住**，只剩桅杆从板边戳出来。探针把船心投到屏幕
   * (852,410)，正落在栈桥中段 —— 用户看到的"一排栅栏"就是这些桅杆。
   * 贴着栈桥侧舷停靠之后，船体在板旁边露出来，也才是真实的靠泊方式
   * （船要靠桩，不会横在栈桥底下）。
   */
  const moorings: HarborMooring[] = []
  /*
   * 有一条船必须是"主力"：它停在**伸得最远的那条栈桥**上（离相机最近），
   * 船长 2.1~2.4 单位（38~43 米）。其余都是 1.15~1.65 的中型商船。
   *
   * 【为什么】四条船一样大时，每条在屏幕上只有 60~70px 长、10px 高，
   * 全是"红棕色的一个方块 + 两根线"（放大截图）。港口需要一条能看清
   * 船形的船当视觉锚点 —— 真实港口里也总有一条大船系在栈桥头。
   */
  const farthestPier = piers.reduce((a, b) => (b.z1 < a.z1 ? b : a), piers[0])
  for (let i = 0; i < style.moorings && piers.length > 0; i++) {
    const p = i === 0 ? farthestPier : piers[i % piers.length]
    /*
     * 一律停在栈桥的**内侧**（朝港湾中心），不是外侧。
     * 【为什么】外侧那条正好落在抛石堤的内端（x ≈ 0.72 halfW）上 —— 放大截图里
     * 一条商船**搁在石堆上**，船底与石块穿在一起。内侧离防波堤有 2 个单位。
     */
    const side = p.x > 0 ? -1 : 1
    const len = i === 0 ? 2.1 + 0.3 * rnd(43) : 1.15 + 0.5 * rnd(i * 4.9 + 43)
    /*
     * 船长 1.15~1.65 单位 = 21~30 米（卡拉维尔/克拉克级商船）。原来的
     * 0.9~1.4 在 22 单位外只有 60 像素长、12 像素高，配上深棕船体就是
     * 海面上的一条暗痕 —— 认不出是船。
     */
    moorings.push({
      // 船中心离栈桥中心 = 半宽 + 半个船宽 + 一点余量，贴着但不穿模
      /*
       * 横向偏移 len*0.28（原 0.2）：船身要**斜一点**停在栈桥边（见下面 yaw），
       * 斜过来之后船的横向占位从 len*0.13 涨到 len*0.24 —— 偏移不够就会插进栈桥。
       */
      x: p.x + side * (p.w * 0.5 + len * 0.28 + 0.04),
      /*
       * 停在**栈桥末端外侧**（z 比 z1 再出 0.4~0.9），不是中段。
       * 【为什么】中段时船与栈桥板在同一 z、x 只差 0.6 —— 从甲板望过去，
       * 视线沿 −z 走，栈桥板正好挡住船的下半截，屏幕上只剩"栈桥尽头堆了一堆
       * 红棕色的东西"（放大截图）。挪到末端外侧，船体整条露出来，
       * 也符合真实靠泊：船系在栈桥头上的缆桩，不会横在栈桥中段。
       */
      z: p.z1 - 0.45 - 0.5 * rnd(i * 7.7 + 37),
      /*
       * 船首朝海（长轴沿栈桥）+ 一点偏角：+x 转 90° 后指向 −z。
       * 【为什么要斜】完全正对海时，甲板视角看到的是**船尾的一个方块**（艉楼），
       * 尖头尖尾的船形一点都看不到 —— 放大截图里那条船是"几块棕色板叠在一起"。
       * 偏 0.22 rad（12°）就够露出侧舷的收分：真实靠泊的船本来也不会跟栈桥
       * 严丝合缝地平行（缆绳一拉就有角度）。
       */
      yaw: Math.PI * 0.5 + (rnd(i * 3.3 + 41) - 0.5) * 0.44,
      len,
    })
  }

  /*
   * 系泊缆绳：只给**离岸最近的那一两条**船。
   * 【为什么不全给】远处的船（z = −5）系到岸上要拉 5 个单位（90 米）的缆，
   * 在画面上是一条横跨半个港的斜线，比"没系"更怪。近的那条船才看得清缆绳。
   */
  const lines: MooringLine[] = []
  {
    const sorted = [...moorings].sort((a, b) => b.z - a.z).slice(0, 2)
    for (const m of sorted) {
      /*
       * 缆绳拉到**最近那条栈桥的末端**，不是码头前沿。船在栈桥头外侧，
       * 拉到岸上要横跨整条栈桥板 —— 屏幕上一根线穿过木板，比"没系"更怪。
       */
      const nearPier = piers.reduce((best, q) => (Math.abs(q.x - m.x) < Math.abs(best.x - m.x) ? q : best), piers[0])
      /*
       * 船首朝海、船尾朝岸 —— 缆绳只能从**船尾**拉向岸。
       * 【为什么原来是错的】旧写法按"长轴方向 ±"取两端，船首那端在 z − len*0.44
       * （海里），拉到岸上就横跨整条栈桥，屏幕上是一根从船顶甩到码头的黑线
       * （放大截图里像一根鞭子）。真实靠泊是尾缆两根呈"八"字。
       */
      const sternZ = m.z + m.len * 0.42
      lines.push({
        from: [m.x - m.len * 0.11, 0.3, sternZ],
        to: [nearPier.x - nearPier.w * 0.32, deckTopY + 0.02, nearPier.z1 * 0.55],
        sag: 0.07,
      })
      lines.push({
        from: [m.x + m.len * 0.11, 0.3, sternZ],
        to: [nearPier.x + nearPier.w * 0.32, deckTopY + 0.02, nearPier.z1 * 0.55],
        sag: 0.07,
      })
    }
  }

  /*
   * 水边的灯：每条栈桥末端一盏，码头前沿再补两三盏。
   * 高度 0.55~0.75 单位（10~13 米，比人高很多）—— 灯笼挂在高杆上，
   * 才能照到栈桥与靠上来的船。
   */
  const lamps: HarborLamp[] = []
  for (let i = 0; i < piers.length; i++) {
    const p = piers[i]
    lamps.push({ x: p.x, z: p.z1 + 0.12, y: 0.62 + 0.12 * rnd(i * 3.1 + 109), k: 0.85 + 0.3 * rnd(i * 5.7 + 113) })
  }
  {
    const extra = 2 + Math.floor(rnd(117) * 2)
    for (let i = 0; i < extra; i++) {
      lamps.push({
        x: (rnd(i * 4.3 + 119) - 0.5) * 1.5 * halfW,
        z: 0.05 + 0.1 * rnd(i * 6.1 + 127),
        y: 0.6 + 0.14 * rnd(i * 7.3 + 131),
        k: 0.8 + 0.35 * rnd(i * 9.1 + 137),
      })
    }
  }

  const palms: { x: number; z: number; h: number }[] = []
  for (let i = 0; i < style.palms; i++) {
    palms.push({
      x: (rnd(i * 2.7 + 47) - 0.5) * 1.8 * halfW,
      z: 2.0 + 0.8 * rnd(i * 3.1 + 53),
      h: (1.0 + 0.7 * rnd(i * 5.9 + 59)) * s,
    })
  }

  return {
    visible: true,
    deckHalfW: halfW,
    /*
     * 【码头面为什么要铺到 3.4】只铺一条贴着水线的窄板时，房子直接站在草地上，
     * 而 `coastModel` 的松树会从房子中间长出来（实测截图里三栋房之间插着两棵树）。
     * 铺到内陆 3.4 之后，房子站的地方变成石砌码头，草与树被挡在城后面 ——
     * 这才是港口该有的地面，也顺手解决了"树穿房"。
     */
    deckZ0: deckNearZ,
    deckZ1: 3.4,
    deckY: deckTopY,
    houses,
    farHouses,
    piers,
    breakwaters,
    moorings,
    palms,
    panes,
    chimneys,
    quayStones,
    bollards,
    cargo,
    folk,
    lamps,
    lines,
    spire: style.spire
      /*
       * 尖顶 = 方形钟楼 + 尖锥：只给一个细锥时比例是 1:11（一根针，实测）。
       * 高度取 1.5s（≈2.9 单位 = 52 米），底座另由几何给半径。
       */
      ? { x: halfW * 0.2 + (rnd(61) - 0.5) * 0.8, z: 2.1, h: 1.5 * s }
      : null,
    /* 吊货臂架：两台，摆在码头上（港口才有的"在干活"的符号） */
    cranes: [
      { x: -halfW * 0.55, z: 0.42, arm: 0.62 * s },
      { x: halfW * 0.62, z: 0.5, arm: 0.7 * s },
    ],
    flag: { x: -halfW * 0.2, z: 0.5, h: 1.6 * s },
  }
}

/**
 * 靠港时的岸线半径。
 *
 * 【为什么不直接用 `coastLayout` 的半径】**到港**与**望见陆地**是两件事：
 * 后者 24 单位外看见一条岸是对的（还有几海里），但 HUD 写着"0.0 海里"、
 * 画面里岸还在 24 单位外，就成了"隔着一段海停在港里"（实测截图里船离码头
 * 还有一大片水）。港口自己用一档更近的景别：贴岸 18 单位。
 */
export function harborRadius(presence: number): number {
  const p = Math.max(0, Math.min(1, Number.isFinite(presence) ? presence : 0))
  return 18 + 24 * Math.pow(1 - p, 1.7)
}

/**
 * 港内浪高系数（0.34 = 防波堤里几乎没有浪，1 = 外海原样）。
 *
 * 【为什么要有】防波堤的意义就是**让堤内的水面平静**：现在从甲板上看，
 * 停在塞维利亚港里与在比斯开湾中间的海面一模一样（同一套全局波浪），
 * 那座防波堤就只是一个装饰。停泊时压到 0.34，船也跟着不摇 ——
 * 一进港，整个世界安静下来，这是"到港了"最直接的体感。
 *
 * 【为什么 8 海里渐变而不是硬切】靠港的最后一段航程里海面该慢慢平下来；
 * 硬切会在跨越阈值那一帧"海面忽然静止"，比不平还怪。
 */
export const HARBOR_CALM_NM = 8

export function harborCalm(distNm: number, isSailing: boolean): number {
  if (!Number.isFinite(distNm)) return 1
  const t = Math.max(0, Math.min(1, 1 - distNm / HARBOR_CALM_NM))
  const base = 1 - 0.62 * Math.pow(t, 0.8)
  /*
   * 停泊时再压一档：船就靠在码头边（HUD 写着 0.0 海里），堤内不该还有 0.38 的浪。
   * **但仍要过距离这一关**：`isSailing=false` 不等于"在港里"（起手还没出航、
   * 参观模式、或者调试时把船挪到海上）—— 只看这一个布尔会把远洋也压平。
   */
  if (!isSailing && distNm <= HARBOR_MAX_NM * 1.6) return Math.min(base, 0.34)
  return base
}

/**
 * 这一刻该不该画港。
 *
 * 【为什么停泊时无条件画】`deckCoast` 里有一条规定：岸在正后方（>120°）就不画，
 * 因为视野里本来就看不到、硬画会变成"前方凭空出现陆地"。但**停泊时是例外**：
 * 船就靠在码头边，玩家回头看不到岸只是因为他背对着——这时不画港，画面就是
 * 一片空海，与 HUD 上"塞维利亚 · 1.2 海里"直接矛盾。所以停泊一律给港。
 */
export function harborVisible(distNm: number, isSailing: boolean): boolean {
  if (!Number.isFinite(distNm)) return false
  if (!isSailing) return distNm <= HARBOR_MAX_NM * 1.6
  return distNm <= HARBOR_MAX_NM
}
