/**
 * 海面漂流物：地图上可以主动去点的东西。
 *
 * 【为什么加这个】
 * 用户的反馈是"交互或者一些东西还是很少"。查下来玩家能做的事其实不少
 * （出航、买卖、修理、招募、接单、买情报、改方针、操舵、事件选项），
 * 但**全部是菜单式的**：点按钮 → 面板里出现文字 → 再点按钮。
 * 地图本身是一张只能看、只能拖的图。
 *
 * 漂流物把"地图"变成可交互的表面：航行时海面上漂着木桶、货箱、漂流的船板，
 * 你看见、你点它、你拿到东西。全程不弹窗、不打断、不要求回答任何问题。
 *
 * 【为什么不做成自动拾取】
 * 自动拾取只需要一次代码改动，但玩家不会记得自己捡过什么 ——
 * 而"我看见了，我决定伸手"这件事本身就是交互的全部意义。
 */

export type DebrisKind = 'barrel' | 'crate' | 'coins' | 'bottle'

export interface DebrisSpot {
  id: string
  kind: DebrisKind
  lat: number
  lng: number
  /** 出现的那一天：过了 DEBRIS_TTL_DAYS 就漂走了 */
  bornDay: number
}

export interface DebrisGain {
  gold: number
  food: number
  water: number
  fame: number
  /** 打捞时那一句反馈（飘字 + 日志），不弹窗 */
  text: string
}

/** 漂流物最多同时在海上漂几个 */
export const DEBRIS_MAX = 3
/**
 * 每过一天生成一个的概率。
 *
 * 0.34 → 0.45。漂流物是唯一**不打断、不惩罚、纯正向**的内容，
 * 提高它比提高事件频率安全（事件大多带代价，加频率等于加难度）。
 *
 * 【更正一个我先前的错误判据】第一版采样按"当天有没有新漂来"算，
 * 得出"55% 的天完全无事" —— 那是错的：漂流物会在海上存在 3 天，
 * 当天没新的不等于海面空了。按玩家视角（当天没有事件 + 没有异闻 +
 * 海面上没有任何漂流物）重算，全空的天只有 **15%**。
 */
export const DEBRIS_SPAWN_CHANCE = 0.45
/** 几天后漂走 */
export const DEBRIS_TTL_DAYS = 3

export const DEBRIS_INFO: Record<DebrisKind, { label: string; hint: string }> = {
  barrel: { label: '漂流木桶', hint: '桶盖被海水泡开了，里面是腌菜和几皮囊淡水。' },
  crate: { label: '散落的货箱', hint: '哪条船在风暴里丢了货。箱子上没有主人的记号。' },
  coins: { label: '泛光的零钱', hint: '一只钱袋浮在水面，大概是哪个倒霉水手的全部家当。' },
  bottle: { label: '瓶中信', hint: '蜡封还在。信上是一段没写完的航路记录。' },
}

/**
 * 打捞收益。
 *
 * 【数值刻意小】这是"路上顺手捡的"，不是"一条新的赚钱路线"。
 * 若收益可观，玩家会开始绕路捡垃圾 —— 那是把航海游戏玩成拾荒模拟。
 * 60 金大约是一单短途贸易的 1/8，够让人觉得"没白点"，不够改变航向。
 */
export function debrisGain(kind: DebrisKind): DebrisGain {
  switch (kind) {
    case 'barrel':
      return { gold: 0, food: 6, water: 6, fame: 0, text: '打捞上来一桶腌菜和两皮囊淡水' }
    case 'crate':
      return { gold: 45, food: 0, water: 0, fame: 0, text: '货箱里是能出手的零碎，换了 45 金' }
    case 'coins':
      return { gold: 60, food: 0, water: 0, fame: 0, text: '捞起 60 金——主人已经不需要了' }
    case 'bottle':
      return { gold: 0, food: 0, water: 0, fame: 3, text: '把瓶中的航路记录交给学者，声望 +3' }
  }
}
