import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { TUTORIAL_STEPS, TUTORIAL_STEP_COUNT, type TutorialStep } from '@/constants/tutorial'

export { TUTORIAL_STEP_COUNT }

// 步骤数与实际内容必须一致（MainMap 用它判断教学是否还在进行）
if (TUTORIAL_STEPS.length !== TUTORIAL_STEP_COUNT) {
  console.warn(`[教学] 步骤常量(${TUTORIAL_STEP_COUNT}) 与实际步骤数(${TUTORIAL_STEPS.length})不符`)
}

/** 聚光框的目标矩形（视口坐标） */
interface SpotRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 测量 data-tut 锚点元素的真实矩形。
 *
 * 为什么不用硬编码像素：侧栏按钮是 flex 垂直居中排布的，
 * 真实 y 取决于窗口高度、按钮数量、面板是否展开。
 * 之前定义里写死 top:'50%'，实测落在 y=500，
 * 而按钮实际在 y=388 —— 聚光框照的是一片空白。
 */
function measureTarget(target: string | undefined, pad: number): SpotRect | null {
  if (!target) return null
  const el = document.querySelector<HTMLElement>(`[data-tut="${target}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return {
    left: r.left - pad,
    top: r.top - pad,
    width: r.width + pad * 2,
    height: r.height + pad * 2,
  }
}

/**
 * 提示框位置：优先放在目标旁边，且**永不遮挡**目标。
 * 目标靠左 → 放右侧；靠右 → 放左侧；靠上 → 放下方；靠下 → 放上方。
 */
function computeTooltipStyle(
  spot: SpotRect | null,
  tooltipW: number,
  tooltipH: number,
): React.CSSProperties {
  const margin = 20
  if (!spot) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
  }

  const vw = window.innerWidth
  const vh = window.innerHeight
  const spotCx = spot.left + spot.width / 2
  const spotCy = spot.top + spot.height / 2

  // 目标偏左 → 提示框放右；偏右 → 放左
  let left: number
  if (spotCx < vw * 0.38) {
    left = spot.left + spot.width + margin
  } else if (spotCx > vw * 0.62) {
    left = spot.left - tooltipW - margin
  } else {
    left = spotCx - tooltipW / 2
  }
  // 贴边时收回来，避免出屏
  left = Math.max(margin, Math.min(left, vw - tooltipW - margin))

  // 垂直：默认与目标平齐，但**目标贴底时必须整体上移**——
  // 底栏是通栏的，提示框一旦压上去就把目标挡住了，等于没打光。
  let top = spotCy - tooltipH / 2
  if (spot.top + spot.height > vh - margin) {
    // 目标在屏幕底部 → 提示框放到目标上方
    top = spot.top - tooltipH - margin
  } else if (spot.top < margin) {
    // 目标在屏幕顶部 → 提示框放到目标下方
    top = spot.top + spot.height + margin
  }
  top = Math.max(margin, Math.min(top, vh - tooltipH - margin))

  return { left, top }
}

export default function TutorialOverlay() {
  const tutorialStep = useGameStore(s => s.tutorialStep)
  const nextTutorialStep = useGameStore(s => s.nextTutorialStep)
  const skipTutorial = useGameStore(s => s.skipTutorial)

  const [spot, setSpot] = useState<SpotRect | null>(null)
  const [tipSize, setTipSize] = useState({ w: 320, h: 180 })

  const step: TutorialStep | undefined =
    tutorialStep !== null && tutorialStep >= 0 ? TUTORIAL_STEPS[tutorialStep] : undefined

  const remeasure = useCallback(() => {
    if (!step) {
      setSpot(null)
      return
    }
    setSpot(measureTarget(step.target, step.pad ?? 0))
  }, [step])

  // 步骤切换 / 首次挂载后测量
  useLayoutEffect(() => {
    remeasure()
  }, [remeasure])

  // 窗口尺寸变化时重新测量（聚光框必须跟着按钮走）
  useEffect(() => {
    if (!step?.target) return
    const onResize = () => remeasure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [step?.target, remeasure])

  // 提示框自身尺寸变化会影响避让计算，量一次存起来
  useEffect(() => {
    if (!step) return
    const el = document.querySelector<HTMLElement>('[data-tut-tip]')
    if (el) setTipSize({ w: el.offsetWidth, h: el.offsetHeight })
  }, [step, spot])

  if (!step) return null

  const hasSpotlight = !!spot

  // portal 到 body：教学是全屏遮罩，必须压过一切图层。
  // 之前挂在 MainMap 的 OVERLAY 容器里，内部的 z-index 9999 只在该容器的
  // stacking context 内生效，实际层级反而低于剧情对白层，老船长立绘会盖住提示框。
  return createPortal(
    <div className="fixed inset-0 transition-all duration-300" style={{ zIndex: 9999 }}>
      {hasSpotlight && (
        <div
          className="fixed rounded-md transition-all duration-300 pointer-events-none"
          style={{
            left: spot!.left,
            top: spot!.top,
            width: spot!.width,
            height: spot!.height,
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
        className="fixed z-10 transition-all duration-300 pointer-events-none"
        style={computeTooltipStyle(spot, tipSize.w, tipSize.h)}
      >
        <div
          data-tut-tip
          className="parchment-bg-dark gold-border rounded-lg p-5 max-w-xs pointer-events-auto"
        >
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
                if (tutorialStep === TUTORIAL_STEPS.length - 1) {
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
            {tutorialStep + 1} / {TUTORIAL_STEPS.length}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
