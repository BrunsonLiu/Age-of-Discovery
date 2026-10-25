import type { Rival } from '@/types'

/**
 * 竞争船长（AI 对手）：让世界“活”起来的三张面孔。
 * 每 RIVAL_TICK_DAYS 天推进一次，增长参数决定其发展倾向。
 */
export const RIVALS: Rival[] = [
  {
    id: 'blackjack',
    name: '“黑帆”杰克',
    title: '私掠船长',
    style: 'aggressive',
    gold: 400,
    fame: 5,
    portsFound: 2,
    lastAction: '在圣多明各的酒馆里招募亡命徒',
    lastActionDay: 0,
  },
  {
    id: 'maria',
    name: '“白银”玛丽亚',
    title: '商会代理人',
    style: 'steady',
    gold: 600,
    fame: 10,
    portsFound: 3,
    lastAction: '与塞维利亚商会签下长期供货契约',
    lastActionDay: 0,
  },
  {
    id: 'diego',
    name: '“星眸”迭戈',
    title: '王室制图师',
    style: 'explorer',
    gold: 250,
    fame: 15,
    portsFound: 4,
    lastAction: '向王室献上新海岸的测绘图',
    lastActionDay: 0,
  },
]

/** 每个 rival 每次推进时可能产生的行动叙事（按风格分池） */
export const RIVAL_ACTIONS: Record<Rival['style'], string[]> = {
  aggressive: [
    '在加勒比海域截了一艘葡萄牙商船，货舱堆得冒尖',
    '把整船火药卖给了海盗窝点，价钱好得离谱',
    '顶着暴风雨抢过魔鬼岛，主帆撕成了条',
    '悬赏一千金币雇了一批不要命的炮手',
    '在哈瓦那湾和巡逻舰干了一仗，船壳全是弹孔',
  ],
  steady: [
    '又跑了一趟里斯本—安特卫普的常规航线，账目漂亮',
    '低价吃进一批橄榄油，据说要做大买卖',
    '修缮了旗舰，船底重新包了铜',
    '和三个港口签下了稳定供货契约',
    '拒绝了王室护航委托——她说利润太薄',
  ],
  explorer: [
    '在北纬四十度的无名海岸插上了王室的旗',
    '测绘了一处从未标注的浅滩，海图商抢着买',
    '和水手们分享了新大陆的传闻，酒馆炸了锅',
    '给一座火山岛命名，用的是一位王后的名字',
    '在土著部落换到了罕见的香料，只有他找得到路',
  ],
}
