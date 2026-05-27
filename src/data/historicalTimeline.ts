export interface HistoricalEvent {
  day: number
  year: number
  title: string
  description: string
  region?: string
}

export const historicalTimeline: HistoricalEvent[] = [
  { day: 1, year: 1492, title: '哥伦布发现新大陆', description: '克里斯托弗·哥伦布率领三艘帆船横渡大西洋，于10月12日到达巴哈马群岛，开启了欧洲对美洲的殖民时代。', region: 'caribbean' },
  { day: 10, year: 1494, title: '托尔德西利亚斯条约', description: '西班牙与葡萄牙在教皇的仲裁下签订条约，将世界划分为两半，确定了两国在海外的势力范围。' },
  { day: 20, year: 1498, title: '达伽马到达印度', description: '瓦斯科·达伽马绕过好望角到达印度卡利卡特，开辟了欧洲到东方的海上航线。', region: 'asia' },
  { day: 30, year: 1500, title: '卡布拉尔发现巴西', description: '葡萄牙航海家佩德罗·阿尔瓦雷斯·卡布拉尔在前往印度的途中意外发现了巴西。' },
  { day: 40, year: 1513, title: '巴尔沃亚发现太平洋', description: '瓦斯科·努涅斯·德·巴尔沃亚穿越巴拿马地峡，成为第一个看到太平洋的欧洲人。' },
  { day: 50, year: 1519, title: '麦哲伦开始环球航行', description: '费尔南多·麦哲伦率领5艘船从塞维利亚出发，开始了人类历史上第一次环球航行。', region: 'europe' },
  { day: 60, year: 1521, title: '科尔特斯征服阿兹特克', description: '埃尔南·科尔特斯率领西班牙征服者攻陷特诺奇蒂特兰，阿兹特克帝国灭亡。' },
  { day: 70, year: 1533, title: '皮萨罗征服印加帝国', description: '弗朗西斯科·皮萨罗率领远征队攻占印加帝国首都库斯科，印加文明走向终结。' },
  { day: 80, year: 1545, title: '波托西银矿发现', description: '在今天的玻利维亚发现了世界上最大的银矿，西班牙帝国的财富急剧增长。' },
  { day: 90, year: 1565, title: '马尼拉大帆船贸易开始', description: '西班牙建立了从马尼拉到阿卡普尔科的跨太平洋贸易航线，连接了亚洲和美洲。', region: 'asia' },
  { day: 100, year: 1588, title: '无敌舰队覆灭', description: '西班牙无敌舰队在进攻英格兰时遭到惨败，标志着英国海上霸权的崛起。', region: 'europe' },
  { day: 110, year: 1600, title: '英国东印度公司成立', description: '英国东印度公司获得皇家特许状，开始了英国在东方的殖民扩张。' },
  { day: 120, year: 1602, title: '荷兰东印度公司成立', description: '荷兰东印度公司成立，成为世界上第一家跨国公司，垄断了香料贸易。', region: 'asia' },
  { day: 130, year: 1620, title: '五月花号抵达新大陆', description: '载有清教徒的五月花号抵达普利茅斯，北美殖民历史翻开新篇章。' },
  { day: 140, year: 1630, title: '加勒比海盗黄金时代', description: '以拿骚和托尔图加为基地的海盗活动达到顶峰，黑胡子、亨利·摩根等传奇海盗活跃于加勒比海域。', region: 'caribbean' },
  { day: 150, year: 1650, title: '大航海时代落幕', description: '随着殖民体系的建立和海上霸权的转移，大航海时代逐渐落幕，但它的遗产永远改变了世界。' },
]
