import { useGameStore } from '@/store/useGameStore'
import ParchmentCard from '@/components/ui/ParchmentCard'
import {
  HelpCircle, Ship, Anchor, Package, Users,
  Coins, Utensils, Droplets, Heart, Shield,
} from 'lucide-react'

const sections = [
  {
    title: '游戏目标',
    icon: <HelpCircle size={14} />,
    items: [
      '自由航行于大航海时代的世界，探索你感兴趣的每一个角落。',
      '发现新港口、完成冒险传闻、积累财富——三条路都通向"传奇船长"结局。',
      '酒馆传闻和港口行情速报会告诉你哪里高价收货，低买高卖致富。',
    ],
  },
  {
    title: '基本操作',
    icon: <Ship size={14} />,
    items: [
      '点击左侧图标打开舰队/任务/日志面板',
      '点击右侧图标打开港口/贸易/造船厂面板',
      '点击地图上的港口或任意位置，船会自动起航',
      '底部速度档（⏸/1x/3x/8x）控制航行快慢，"+1天"直接推进一天',
      '顺风方向航行更快——低纬度向东、中纬度向西，开风带图层查看',
    ],
  },
  {
    title: '资源说明',
    icon: <Coins size={14} />,
    items: [
      { icon: <Coins size={12} />, text: '金币：购买商品、修理、补给、招募、购船' },
      { icon: <Utensils size={12} />, text: '食物：航行中每日消耗，耗尽后士气下降' },
      { icon: <Droplets size={12} />, text: '淡水：航行中每日消耗，耗尽后士气下降' },
      { icon: <Heart size={12} />, text: '士气：降至0则游戏结束' },
      { icon: <Shield size={12} />, text: '耐久：船只生命值，全部归零则游戏结束' },
      { icon: <Users size={12} />, text: '船员：人手不足会掉速，死亡会削弱舰队' },
    ],
  },
  {
    title: '贸易技巧',
    icon: <Package size={14} />,
    items: [
      '每个港口都有便宜的特产和高价的渴求品',
      '绿色价格 = 便宜，红色价格 = 昂贵',
      '大额买入会推高当地价格，看准库存再下手',
      '跨洲贸易利润最高：加勒比的糖酒、东方的香料丝绸',
    ],
  },
  {
    title: '航行提示',
    icon: <Anchor size={14} />,
    items: [
      '危险等级越高，遇到奇遇和灾难的概率都越大',
      '出发前备足补给、补满船员，旅途会更从容',
      '开风带图层看风向：顺风能省下近一半时间',
      '随时可以在港口休整，不必赶路',
    ],
  },
]

export default function HelpPanel() {
  const setShowHelp = useGameStore(s => s.setShowHelp)

  return (
    <div className="w-80 animate-slide-in-right">
      <ParchmentCard title="航海指南" onClose={() => setShowHelp(false)}>
        <div className="scroll-parchment max-h-[70vh] space-y-4 pr-1">
          {sections.map((section) => (
            <div key={section.title}>
              <h4 className="text-gold-300 font-serif text-sm mb-2 flex items-center gap-1.5">
                {section.icon}
                {section.title}
              </h4>
              <div className="space-y-1.5 pl-5">
                {section.items.map((item, i) => {
                  if (typeof item === 'string') {
                    return (
                      <p key={i} className="text-gold-500 text-xs font-serif leading-relaxed">
                        • {item}
                      </p>
                    )
                  }
                  return (
                    <p key={i} className="text-gold-500 text-xs font-serif leading-relaxed flex items-start gap-1.5">
                      <span className="text-gold-400 mt-0.5 flex-shrink-0">{item.icon}</span>
                      {item.text}
                    </p>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </ParchmentCard>
    </div>
  )
}
