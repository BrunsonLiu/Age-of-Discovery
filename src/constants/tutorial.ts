/**
 * 教学引导的步骤定义。
 *
 * 单独成文件而不是放在 TutorialOverlay 里：
 * - hooks/useKeyboardControls 需要 TUTORIAL_STEP_COUNT，让 hook 反向依赖组件是多余的耦合
 * - 测试需要断言教学文案（小游戏那步必须存在且说明按键），文案得能被直接 import
 *
 * 增删步骤必须同步 TUTORIAL_STEP_COUNT——TutorialOverlay 内部有一致性自检，
 * 不一致会在控制台告警。
 */

export interface TutorialStep {
  text: string
  /**
   * 聚光目标：**DOM 锚点名**（对应元素上的 data-tut 属性）。
   * null 表示整屏压暗、无聚光。
   *
   * 之前这里写的是硬编码像素（{ left:'20px', top:'50%', width:'40px' }），
   * 结果聚光框永远照在空白处——侧栏按钮的实际 y 是 388，定义却是 50%（=500）。
   * 改成锚点后由 TutorialOverlay 运行时测量真实矩形，
   * 窗口大小变化、按钮重排都不会再错位。
   */
  target?: string
  /** 聚光框相对目标元素的额外外扩（像素） */
  pad?: number
  buttonText: string
}

export const TUTORIAL_STEP_COUNT = 10

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    text: '欢迎来到大航海时代。让我带你走一遍基本操作。',
    buttonText: '下一步',
  },
  {
    text: '左边是舰队面板：船只状态、资源、可用航线。点击这个图标打开。',
    target: 'fleet',
    pad: 6,
    buttonText: '下一步',
  },
  {
    text: '右边是港口面板：港口信息与服务。点击这个图标查看。',
    target: 'port',
    pad: 6,
    buttonText: '下一步',
  },
  {
    text: '港口可买卖商品赚钱。点击这个图标打开贸易面板。',
    target: 'trade',
    pad: 6,
    buttonText: '下一步',
  },
  {
    text: '点地图上的港口或任意位置会弹出「出航计划」：距离、危险、风向、补给够不够，一目了然。底部这条栏控制模拟快慢，"+1天"直接推进一天。',
    target: 'bottombar',
    buttonText: '下一步',
  },
  {
    text: '起航后会立刻让你选「航行方针」——抢行、按部就班还是谨慎。这一步决定这一段的航速、补给、磨损和遇事率，三张卡上把账都摊给你了：快的更险，稳的更贵。选完会弹出一段操舵，想玩就玩，不想玩就点「交给水手」跳过（没有奖励，仅此而已）。',
    buttonText: '下一步',
  },
  {
    text: '航行中会遇到风暴、奇遇、陌生船只。每个选项下方都摆着赌注——预计得失与[稳/搏/险]：数字是按概率加权的估算，实际仍看运气。船员是航行的根本，人手不足会掉速，港口记得招人。',
    target: 'ship',
    pad: 14,
    buttonText: '下一步',
  },
  {
    text: '有些选项右上角带小标——选它就得亲手操作一段小游戏。做得好，结果明显偏向好结局；不带标的选项则只是抉择。',
    buttonText: '下一步',
  },
  {
    text: '六种小标各有各的玩法：收帆按空格、接舷按 1/2/3、逃脱和瞭望按方向键、对赌押大押小、议价加价或成交。',
    buttonText: '下一步',
  },
  {
    text: '基本操作讲完了。发现新港口、完成冒险、积累财富——祝你旅途愉快，船长！',
    buttonText: '开始冒险',
  },
]

/** 教学步骤文案（测试用：断言小游戏那步确实存在且说明了按键） */
export const TUTORIAL_STEP_TEXTS: string[] = TUTORIAL_STEPS.map(s => s.text)

/** 教学用到的锚点名（测试用：断言每个锚点都有对应元素） */
export const TUTORIAL_TARGETS: string[] = TUTORIAL_STEPS
  .map(s => s.target)
  .filter((t): t is string => !!t)
