import { Task } from '@/types'

export const tasks: Task[] = [
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
    description: '传说东方遍地黄金和香料。如果你有勇气，可以尝试绕过好望角前往果阿，那里是葡萄牙在印度的据点。',
    type: 'main',
    status: 'available',
    reward: { gold: 500, fame: 20 },
    portId: 10,
    targetPortId: 11,
  },
  {
    id: 3,
    title: '海盗的宝藏',
    description: '据说加勒比海深处藏着一艘沉没的西班牙珍宝船。也许在托尔图加附近能找到线索……',
    type: 'treasure',
    status: 'available',
    reward: { gold: 800, fame: 30 },
    portId: 3,
    targetPortId: 4,
  },
]
