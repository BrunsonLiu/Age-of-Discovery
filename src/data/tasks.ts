import { Task } from '@/types'

/**
 * 冒险任务线。
 * - main     主线：远洋探索，推动玩家驶出欧洲
 * - trade    送货合约：在接任务的港口买下便宜货，运到目标港交货领赏
 *             （requiredGoods 会在交货时扣除，赏金叠加在贸易利润之上）
 * - treasure 寻宝
 * - escort   护送
 * minDay 让任务随航行天数逐步浮现，避免一次性铺满列表。
 */
export const tasks: Task[] = [
  /* ============ 主线 ============ */
  {
    id: 1,
    title: '驶向新世界',
    description: '从塞维利亚出发，前往加勒比海的哈瓦那。哥伦布已经证明那里有一片新大陆，去看看吧。',
    type: 'main',
    status: 'available',
    reward: { gold: 200, fame: 10 },
    portId: 6,
    targetPortId: 1,
  },
  {
    id: 2,
    title: '东方的诱惑',
    description: '传说东方遍地黄金和香料。若你有勇气绕过好望角，可到开普敦补给后前往果阿——葡萄牙在印度的据点。',
    type: 'main',
    status: 'available',
    reward: { gold: 500, fame: 20 },
    portId: 6,
    targetPortId: 11,
    minDay: 10,
  },
  {
    id: 3,
    title: '环球之梦',
    description: '麦哲伦证明了这个星球可以绕着走一圈。从塞维利亚启程，抵达遥远的澳门，把东西方连成一线。',
    type: 'main',
    status: 'available',
    reward: { gold: 1200, fame: 40 },
    portId: 6,
    targetPortId: 18,
    minDay: 25,
  },

  /* ============ 送货合约（贸易） ============ */
  {
    id: 4,
    title: '蔗糖订单',
    description: '哈瓦那的蔗糖庄园主委托你把一批优质蔗糖运回塞维利亚。当地糖价便宜，交货还有赏金。',
    type: 'trade',
    status: 'available',
    reward: { gold: 300, fame: 12 },
    portId: 1,
    targetPortId: 6,
    requiredGoods: [{ goodId: 5, quantity: 6 }],
  },
  {
    id: 5,
    title: '朗姆酒贸易',
    description: '皇家港的酒商需要把上等朗姆酒运往伦敦。海盗港的酒便宜得惊人，伦敦人却愿意出高价。',
    type: 'trade',
    status: 'available',
    reward: { gold: 350, fame: 14 },
    portId: 2,
    targetPortId: 8,
    requiredGoods: [{ goodId: 1, quantity: 8 }],
  },
  {
    id: 6,
    title: '象牙委托',
    description: '伦敦的商行委托你从黄金海岸的埃尔米纳采买象牙。西非的象牙比欧洲便宜太多，是一本万利的买卖。',
    type: 'trade',
    status: 'available',
    reward: { gold: 450, fame: 16 },
    portId: 9,
    targetPortId: 8,
    requiredGoods: [{ goodId: 2, quantity: 6 }],
    minDay: 15,
  },
  {
    id: 7,
    title: '香料合约',
    description: '里斯本的王室采购官急需一批东方香料。果阿是香料之都，运回欧洲转手就是数倍利润。',
    type: 'trade',
    status: 'available',
    reward: { gold: 600, fame: 22 },
    portId: 11,
    targetPortId: 7,
    requiredGoods: [{ goodId: 9, quantity: 5 }],
    minDay: 28,
  },
  {
    id: 8,
    title: '丝路余晖',
    description: '阿姆斯特丹的东印度公司想要中国的上等丝绸。澳门的丝价冠绝全球，一趟远航可抵数年积蓄。',
    type: 'trade',
    status: 'available',
    reward: { gold: 800, fame: 28 },
    portId: 18,
    targetPortId: 15,
    requiredGoods: [{ goodId: 10, quantity: 5 }],
    minDay: 35,
  },

  /* ============ 寻宝 / 护送 ============ */
  {
    id: 9,
    title: '海盗的宝藏',
    description: '据说加勒比海深处藏着一艘沉没的西班牙珍宝船。也许在托尔图加附近能找到线索……',
    type: 'treasure',
    status: 'available',
    reward: { gold: 800, fame: 30 },
    portId: 3,
    targetPortId: 4,
  },
  {
    id: 10,
    title: '护送商船',
    description: '卡塔赫纳的商团担心海盗袭扰，请一位可靠的船长护送他们的商船前往圣胡安。',
    type: 'escort',
    status: 'available',
    reward: { gold: 250, fame: 12 },
    portId: 13,
    targetPortId: 5,
    minDay: 12,
  },
]
