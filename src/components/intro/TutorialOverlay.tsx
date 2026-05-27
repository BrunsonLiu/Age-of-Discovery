import { useGameStore } from '@/store/useGameStore'

interface SpotlightConfig {
  left?: string
  top?: string
  right?: string
  bottom?: string
  width?: string
  height?: string
}

interface TutorialStep {
  text: string
  spotlight: SpotlightConfig | null
  buttonText: string
}

const steps: TutorialStep[] = [
  {
    text: '欢迎来到大航海时代！让我为你介绍基本操作',
    spotlight: null,
    buttonText: '下一步',
  },
  {
    text: '左侧的舰队面板显示你的船只状态、资源和可用航线。点击左侧的🚢图标打开它。',
    spotlight: { left: '20px', top: '50%', width: '40px', height: '40px' },
    buttonText: '下一步',
  },
  {
    text: '右侧的港口面板显示当前港口的信息和服务。点击右侧的⚓图标查看港口详情。',
    spotlight: { right: '20px', top: '50%', width: '40px', height: '40px' },
    buttonText: '下一步',
  },
  {
    text: '在港口可以买卖商品赚取差价。低买高卖是致富的关键！点击📦图标打开贸易面板。',
    spotlight: { right: '20px', top: '55%', width: '40px', height: '40px' },
    buttonText: '下一步',
  },
  {
    text: '点击地图上的港口标记即可设定目的地，也可以在舰队面板中选择航线。确认出航后，使用底部的"推进一天"按钮推进时间，船只就会向目的地航行。',
    spotlight: { left: '0', right: '0', bottom: '0', height: '48px' },
    buttonText: '下一步',
  },
  {
    text: '航行中偶尔会遇到一些有趣的事情——风暴、奇遇、陌生的船只……不同的选择会带来不同的经历！',
    spotlight: { left: 'calc(50% - 100px)', top: 'calc(50% - 100px)', width: '200px', height: '200px' },
    buttonText: '下一步',
  },
  {
    text: '你已经了解了基本操作！记住：没有必须完成的任务，想去哪里就去哪里。祝你旅途愉快，船长！',
    spotlight: null,
    buttonText: '开始冒险',
  },
]

function getTooltipPosition(step: TutorialStep, idx: number): React.CSSProperties {
  if (!step.spotlight) return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  if (idx === 1) return { left: '80px', top: '50%', transform: 'translateY(-50%)' }
  if (idx === 2 || idx === 3) return { right: '80px', top: '50%', transform: 'translateY(-50%)' }
  if (idx === 4) return { left: '50%', bottom: '64px', transform: 'translateX(-50%)' }
  return { top: 'calc(50% + 120px)', left: '50%', transform: 'translateX(-50%)' }
}

export default function TutorialOverlay() {
  const tutorialStep = useGameStore(s => s.tutorialStep)
  const nextTutorialStep = useGameStore(s => s.nextTutorialStep)
  const skipTutorial = useGameStore(s => s.skipTutorial)

  if (tutorialStep === null || tutorialStep < 0 || tutorialStep >= steps.length) return null

  const step = steps[tutorialStep]
  const hasSpotlight = step.spotlight !== null

  return (
    <div className="fixed inset-0 transition-all duration-300" style={{ zIndex: 9999 }}>
      {hasSpotlight && (
        <div
          className="fixed rounded-md transition-all duration-500"
          style={{
            ...step.spotlight,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.80)',
            border: '2px solid rgba(201, 169, 110, 0.6)',
            zIndex: 1,
          }}
        />
      )}

      {!hasSpotlight && (
        <div className="fixed inset-0 bg-black/80" />
      )}

      <div
        className="fixed z-10 transition-all duration-300"
        style={getTooltipPosition(step, tutorialStep)}
      >
        <div className="parchment-bg-dark gold-border rounded-lg p-5 max-w-xs">
          <p className="font-serif text-gold-200 text-sm leading-relaxed mb-4">
            {step.text}
          </p>
          <div className="flex items-center justify-between">
            <button
              onClick={skipTutorial}
              className="text-gold-600 hover:text-gold-400 text-xs font-serif transition-colors"
            >
              跳过引导
            </button>
            <button
              onClick={() => {
                if (tutorialStep === steps.length - 1) {
                  skipTutorial()
                } else {
                  nextTutorialStep()
                }
              }}
              className="btn-nautical px-4 py-1.5 rounded text-sm font-serif"
            >
              {step.buttonText}
            </button>
          </div>
          <div className="text-center mt-3 text-gold-600 text-xs font-serif">
            {tutorialStep + 1} / {steps.length}
          </div>
        </div>
      </div>
    </div>
  )
}
