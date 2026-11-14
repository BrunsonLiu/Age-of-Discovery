import { Banknote, Beer, BookOpen, Calendar, ClipboardList, Coins, Crown, Gem, Globe, Handshake, Landmark, Map, Package, Sailboat, Scroll, Skull } from 'lucide-react'
import type { Achievement } from '@/types'
import { ports } from '@/data/ports'
import { RELICS } from '@/data/relics'

/**
 * 成就系统：给"自由探索"装上可见的里程碑。
 * 判定全部基于 GameState，纯函数，便于在 store 各动作后统一检查。
 */
export const achievements: Achievement[] = [
  {
    id: 'first_trade',
    title: '第一笔交易',
    description: '完成第一次商品买卖——商人的账本从今天开始。',
    icon: Handshake,
    check: (s) => s.stats.trades >= 1,
  },
  {
    id: 'merchant_1000',
    title: '小富之家',
    description: '持有 1000 金币。',
    icon: Coins,
    check: (s) => s.fleet.gold >= 1000,
  },
  {
    id: 'merchant_5000',
    title: '富甲一方',
    description: '持有 5000 金币——港口的银行家开始记住你的名字。',
    icon: Landmark,
    check: (s) => s.fleet.gold >= 5000,
  },
  {
    id: 'tycoon_20000',
    title: '传奇富翁',
    description: '持有 20000 金币，比西班牙珍宝舰队还令人垂涎。',
    icon: Crown,
    check: (s) => s.fleet.gold >= 20000,
  },
  {
    id: 'explorer_5',
    title: '五港通商',
    description: '发现 5 座港口。',
    icon: Sailboat,
    check: (s) => s.discoveredPorts.length >= 5,
  },
  {
    id: 'explorer_10',
    title: '十港连航',
    description: '发现 10 座港口——这条航线上没人比你更熟。',
    icon: Map,
    check: (s) => s.discoveredPorts.length >= 10,
  },
  {
    id: 'explorer_all',
    title: '四海归一',
    /*
     * 数字必须来自 ports.length —— 加了大明广州（第 21 港）之后，
     * 这里还写着 20：玩家走到第 20 座港就解锁「发现全部港口」，
     * 可地图上明明还剩一座没去过。成就是最不该说谎的地方。
     * 文案里的数字同样不能写死，否则以后再加港又要漏一处。
     */
    description: `发现全部 ${ports.length} 座港口。`,
    icon: Globe,
    check: (s) => s.discoveredPorts.length >= ports.length,
  },
  {
    id: 'sailor_50',
    title: '五十日航行',
    description: '航海生涯进入第 50 天。',
    icon: Calendar,
    check: (s) => s.fleet.day >= 50,
  },
  {
    id: 'veteran_100',
    title: '百日船长',
    description: '在第 100 天仍然掌着舵——老船长们会敬你一杯。',
    icon: Beer,
    check: (s) => s.fleet.day >= 100,
  },
  {
    id: 'eventful_15',
    title: '见多识广',
    description: '经历并结算 15 次海上事件。',
    icon: BookOpen,
    check: (s) => s.stats.eventsSurvived >= 15,
  },
  {
    id: 'pirate_slayer',
    title: '海盗克星',
    description: '3 次在海盗袭击中取胜。',
    icon: Skull,
    check: (s) => s.stats.pirateWins >= 3,
  },
  {
    id: 'treasure_hunter',
    title: '寻宝猎人',
    description: '集齐海图残片，完成"完整的藏宝图"。',
    icon: Gem,
    check: (s) => (s.eventFlags?.treasure_found ?? 0) > 0,
  },
  {
    id: 'trade_master',
    title: '贸易大师',
    description: '完成 20 笔交易。',
    icon: Package,
    check: (s) => s.stats.trades >= 20,
  },
  {
    id: 'big_deal',
    title: '巨额订单',
    description: '单笔成交额达到 500 金币。',
    icon: Banknote,
    check: (s) => s.stats.bestDeal >= 500,
  },
  {
    id: 'historian',
    title: '博学者',
    description: '目击 5 个历史节点。',
    icon: Scroll,
    check: (s) => s.stats.historySeen >= 5,
  },
  {
    id: 'contractor',
    title: '契约达人',
    description: '完成 5 份冒险合约。',
    icon: ClipboardList,
    check: (s) => s.completedTasks.length >= 5,
  },
  {
    /*
     * 收齐全部海上遗物。
     *
     * 【为什么要有这一条】图鉴里 9 件遗物各占一格，收齐这件事原来**没有任何回执**：
     * 第 9 件拾起来时和之前 8 件一模一样——一条通知、三秒飘字，然后就没了。
     * 而这正是玩家攒了整局的目标（有的遗物还限定季节）。"完成了却没人告诉你"
     * 是本作反复修的一类问题（第 21 座港就是这样）。
     * 计数的分母用 RELICS.length：以后加遗物，这条自动跟着变，不会写死。
     */
    id: 'relic_collector',
    title: '海上拾荒人',
    description: `集齐全部 ${RELICS.length} 件海上遗物。`,
    icon: Sailboat,
    check: (s) => (s.collectedRelics?.length ?? 0) >= RELICS.length,
  },
]

/** 返回本局新解锁的成就（不含已解锁） */
export function checkAchievements(state: {
  fleet: { gold: number; day: number }
  discoveredPorts: number[]
  completedTasks: number[]
  achievements: string[]
  stats: { trades: number; eventsSurvived: number; pirateWins: number; bestDeal: number; historySeen: number }
  eventFlags?: Record<string, number>
}): Achievement[] {
  return achievements.filter(a => !state.achievements.includes(a.id) && a.check(state as never))
}
