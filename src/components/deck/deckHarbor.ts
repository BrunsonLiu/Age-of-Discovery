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
    stone: 0x8a8377,
    roofPitch: 0.75,
    houses: [7, 10],
    piers: 4,
    moorings: 4,
    spire: true,
    palms: 0,
    banner: 0xb03a2e,
    quay: 0x9a9184,
    sail: 'square',
    lamp: [1.5, 1.05, 0.6],
  },
  /* 哈瓦那 / 托尔图加 / 皇家港：木棚 + 茅草顶 + 木栈桥 + 棕榈 */
  caribbean: {
    id: 'caribbean',
    name: '木棚茅顶',
    wall: 0xb08a5c,
    roof: 0x8e7a44,
    timber: 0x5a4430,
    stone: 0x6f6455,
    roofPitch: 0.55,
    houses: [5, 8],
    piers: 3,
    moorings: 3,
    spire: false,
    palms: 7,
    banner: 0x2f6b4f,
    quay: 0x5a4430,
    sail: 'square',
    lamp: [1.45, 1.0, 0.5],
  },
  /* 广州 / 满剌加 / 果阿：木构 + 青瓦（带翘檐）+ 石堤 + 硬帆 */
  asia: {
    id: 'asia',
    name: '木构青瓦',
    wall: 0xc9b189,
    roof: 0x4a5560,
    timber: 0x4a3524,
    stone: 0x7d7a70,
    roofPitch: 0.62,
    houses: [8, 11],
    piers: 4,
    moorings: 4,
    spire: false,
    palms: 5,
    banner: 0xc0392b,
    quay: 0x8c8478,
    sail: 'junk',
    lamp: [1.55, 0.95, 0.45],
  },
  /* 埃尔米纳 / 蒙巴萨 / 桑给巴尔：平顶土屋 + 珊瑚石 + 少量棕榈 */
  africa: {
    id: 'africa',
    name: '平顶土屋',
    wall: 0xc4a06a,
    roof: 0x8a7550,
    timber: 0x4f3c26,
    stone: 0x8f8574,
    roofPitch: 0.18,
    houses: [6, 9],
    piers: 3,
    moorings: 3,
    spire: false,
    palms: 6,
    banner: 0x7a5230,
    quay: 0x9c8f78,
    sail: 'square',
    lamp: [1.5, 1.0, 0.52],
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
  piers: HarborPier[]
  breakwaters: HarborBreakwater[]
  moorings: HarborMooring[]
  palms: { x: number; z: number; h: number }[]
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
  piers: [],
  breakwaters: [],
  moorings: [],
  palms: [],
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

  const nHouse = Math.round(style.houses[0] + (style.houses[1] - style.houses[0]) * rnd(1))
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
    const h = (back ? 0.56 : 0.42) * s * (0.85 + 0.35 * rnd(i * 5.7 + 9))
    const x = (t - 0.5) * 2 * halfW + (rnd(i * 7.3 + 3) - 0.5) * (halfW / nHouse) * 0.9
    houses.push({
      x,
      z: back ? 1.35 + 0.5 * rnd(i * 2.2 + 11) : 0.72 + 0.18 * rnd(i * 2.2 + 11),
      w,
      h,
      d: w * (0.62 + 0.4 * rnd(i * 4.4 + 13)),
      roofH: h * style.roofPitch,
      lit: rnd(i * 9.9 + 17) > 0.42,
      yaw: (rnd(i * 6.1 + 19) - 0.5) * 0.12,
    })
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

  /* 停泊商船：在防波堤内侧、栈桥外侧，朝向大致对着口子 */
  const moorings: HarborMooring[] = []
  for (let i = 0; i < style.moorings; i++) {
    const side = i % 2 === 0 ? -1 : 1
    const t = Math.floor(i / 2) + 1
    moorings.push({
      x: side * (halfW * (0.34 + 0.16 * t) + (rnd(i * 5.3 + 31) - 0.5) * 0.6),
      /*
       * 【第一条船要贴着栈桥】前几条在 z=−0.8 一带（离相机只有 16 单位），
       * 屏幕上是"一条真的船"；后面的退到 −3~−6，只贡献桅杆林。
       * 全放在远处时四条船在 250 米外只剩八根细线 —— 甲板上根本读不出"码头边
       * 停着船"（实测截图）。近一条远三条，才是真实港口的样子。
       */
      z: i === 0 ? -0.8 : -(2.8 + 1.2 * t + 0.5 * rnd(i * 7.7 + 37)),
      yaw: Math.PI * (0.5 + side * 0.08) + (rnd(i * 3.3 + 41) - 0.5) * 0.3,
      /*
       * 船长：0.9~1.4 世界单位 = 16~26 米。**不能乘 presence**——
       * 那是"景别"，乘上去会做出 100 米长的商船（第一版就是这样：屏幕上
       * 两块深棕大板横在码头上，把房子全挡住，实测截图）。
       */
      len: 0.9 + 0.5 * rnd(i * 4.9 + 43),
    })
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
    deckZ0: -0.2,
    deckZ1: 3.4,
    deckY: 0.16 + 0.07 * s,
    houses,
    piers,
    breakwaters,
    moorings,
    palms,
    spire: style.spire
      /*
       * 尖顶 = 方形钟楼 + 尖锥：只给一个细锥时比例是 1:11（一根针，实测）。
       * 高度取 1.5s（≈2.9 单位 = 52 米），底座另由几何给半径。
       */
      ? { x: halfW * 0.2 + (rnd(61) - 0.5) * 0.8, z: 2.1, h: 1.5 * s }
      : null,
    /* 吊货臂架：两台，摆在码头上（港口才有的"在干活"的符号） */
    cranes: [
      { x: -halfW * 0.55, z: 0.42, arm: 1.5 * s },
      { x: halfW * 0.62, z: 0.5, arm: 1.65 * s },
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
