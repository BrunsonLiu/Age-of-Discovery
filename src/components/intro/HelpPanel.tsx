import { useGameStore } from '@/store/useGameStore'
import ParchmentCard from '@/components/ui/ParchmentCard'
import {
  HelpCircle, Ship, Anchor, Package,
  Coins, Utensils, Droplets, Heart, Shield,
} from 'lucide-react'

const sections = [
  {
    title: '游戏目标',
    icon: <HelpCircle size={14} />,
    items: [
      '自由航行于大航海时代的世界，探索你感兴趣的每一个角落。',
      '没有强制任务，你可以自由航行到任何地方。',
      '酒馆里偶尔能听到一些冒险传闻，感兴趣的话可以记下来，不感兴趣也完全没关系。',
    ],
  },
  {
    title: '基本操作',
    icon: <Ship size={14} />,
    items: [
      '点击左侧图标打开舰队/任务/日志面板',
      '点击右侧图标打开港口/贸易面板',
      '点击地图上的港口标记查看港口信息',
      '在舰队面板中选择航线并确认出航',
      '使用底部"推进一天/一周"按钮推进时间',
    ],
  },
  {
    title: '资源说明',
    icon: <Coins size={14} />,
    items: [
      { icon: <Coins size={12} />, text: '金币：用于购买商品、修理船只、补给、招募' },
      { icon: <Utensils size={12} />, text: '食物：航行中每日消耗，耗尽后士气下降' },
      { icon: <Droplets size={12} />, text: '淡水：航行中每日消耗，耗尽后士气下降' },
      { icon: <Heart size={12} />, text: '士气：降至0则游戏结束' },
      { icon: <Shield size={12} />, text: '耐久：船只生命值，降至0则游戏结束' },
    ],
  },
  {
    title: '贸易技巧',
    icon: <Package size={14} />,
    items: [
      '不同港口商品价格不同，低买高卖',
      '绿色价格 = 便宜，红色价格 = 昂贵',
      '远距离贸易利润更高但风险更大',
    ],
  },
  {
    title: '航行提示',
    icon: <Anchor size={14} />,
    items: [
      '危险等级越高，遇到有趣事件的概率越大',
      '出发前备足补给，旅途会更从容',
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
