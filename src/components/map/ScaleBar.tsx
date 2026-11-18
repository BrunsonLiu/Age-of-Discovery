import { useEffect, useState } from 'react'
import { useMap } from 'react-leaflet'
import { pxPerNmAt } from '@/utils/mapScale'
import { pickScale, scaleHint } from '@/utils/scaleBar'

/**
 * 海图比例尺（右下角）。
 *
 * 【长度是量出来的，不是写死的】每次缩放/平移结束，沿**当前中心的经线**取 1 度、
 * 量它在容器上的像素数，再用 `haversineNm` 换算成海里 —— 于是尺子永远等于
 * "屏幕上这么长 = 这么多海里"。Mercator 的像素/海里随纬度与缩放变（60° 处横向
 * 拉伸一倍），写死一个长度到了高纬度会差一半，那比没有比例尺更糟：
 * 玩家会拿它估算补给。
 *
 * 【为什么取经线方向】比例尺是"当地"的：沿经线的 1 度在任何纬度都是 60 海里，
 * 像素长只随缩放与纬度变 —— 正是屏幕上那条竖直方向的比例。
 *
 * 【为什么 pointer-events-none】海图上压着的浮层不许整张吃掉点击（这条踩过 4 次）：
 * 它只要看得见，不需要点。
 */
function ScaleBarInner() {
  const map = useMap()
  const [bar, setBar] = useState<{ nm: number; px: number } | null>(null)

  useEffect(() => {
    const update = () => {
      // 比例 = 沿经线量 1 度纬度（见 utils/mapScale，与航程圈共用同一份）
      setBar(pickScale(pxPerNmAt(map)))
    }
    update()
    map.on('zoomend', update)
    map.on('moveend', update)
    return () => {
      map.off('zoomend', update)
      map.off('moveend', update)
    }
  }, [map])

  if (!bar) return null
  return (
    <div
      data-testid="map-scale"
      /*
       * 【材质 = 可交互性，这是全站第一条视觉逻辑】
       * 上一版把它换成了 `.side-plate`（铜木铭牌：顶棱受光 + 外投影），
       * 想解决"它是全站唯一一块半透明浮层"的不一致 —— 但换错了方向：
       * `.side-plate` 在这个项目里的语义是**凸起 = 能按**（侧栏十颗按钮、小地图），
       * 而比例尺是 `pointer-events-none`。于是一块看起来能按的铜牌按下去没反应。
       *
       * 正确的一档是「读数板」：压下去、没有外投影（不离开桌面）、边框极淡。
       * 全站同一个道理 —— 凸起只给能点的东西，读数一律平/凹。
       */
      className="absolute bottom-[88px] right-3 z-[900] pointer-events-none select-none
                 rounded-sm px-2.5 py-1.5 font-serif"
      style={{
        backgroundColor: 'rgba(12, 9, 5, 0.62)',
        border: '1px solid rgba(158, 128, 76, 0.22)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.55)',
      }}
      aria-hidden="true"
    >
      {/* 经典海图尺：四段黑白相间，比一条实线更容易对半估 */}
      <div
        className="flex h-[6px] border border-[#e8d4a8]/80"
        style={{ width: bar.px }}
        data-scale-px={bar.px}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex-1" style={{ background: i % 2 ? 'transparent' : '#e8d4a8' }} />
        ))}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2 text-[12px] tabular-nums leading-none text-[#e8d4a8]">
        <span>{bar.nm} 海里</span>
        <span className="text-[#a08a5a]">{scaleHint(bar.nm)}</span>
      </div>
    </div>
  )
}

export function ScaleBar() {
  return <ScaleBarInner />
}
