import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { cursorLabel, readoutPlacement } from '@/utils/cursorReadout'

/**
 * 光标读数（跟随鼠标的经纬度 + 气候带）。
 *
 * 【为什么不进 React state】mousemove 是逐像素来的（60~120 次/秒），
 * 每次 `setState` 都会重渲染这棵子树并重算样式 —— 这是本项目已经踩过的坑
 * （逐帧 `setLatLngs` 把 60fps 砍到 27fps）。所以这里**只改 DOM**：
 * 一个 ref 的 `textContent` 与两处 `transform`，React 全程不重渲染。
 * 判据里写着"移动 30 次后仍然只有 1 个节点"，见 `map-cursor.mjs`。
 *
 * 【为什么要有十字准星】读数框摆在光标右下方，如果光标落在一片没有特征的蓝上，
 * 玩家不能确定这个数是"指着哪儿"的。一个 13px 的小十字把"读数所属的点"
 * 钉死 —— 它是量具的一部分，不是装饰。
 *
 * 【为什么 pointer-events-none】压在海图上的浮层不许吃点击（本项目踩过 4 次：
 * 透明的浮层会把"点海面出航"整片吃掉）。读数框只是看得见，不需要点。
 */

export function CursorCoords() {
  const map = useMap()
  const pillRef = useRef<HTMLDivElement | null>(null)
  const crossRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const pill = pillRef.current
    const cross = crossRef.current
    if (!pill || !cross) return
    const container = map.getContainer()

    const hide = () => {
      pill.style.opacity = '0'
      cross.style.opacity = '0'
    }

    /*
     * 【为什么自己挂原生监听、而且用**捕获**阶段】
     * 海图上压着一些**吃点击的浮层**（掮客卡片、「买进并起航」按钮…），它们是
     * 容器的子节点。指针移到按钮上时：原生 mousemove 被按钮那层截住
     * （React 的合成事件里 stopPropagation 会把冒泡掐断），Leaflet 的
     * `map.on('mousemove')` 因此收不到 —— 读数就**停在上一处**的坐标上，
     * 玩家会以为按钮旁边那个点就是 22°01′N（实测到的假读数）。
     * 捕获阶段在容器上先跑，子节点的 stopPropagation 拦不住它；
     * 再按事件目标分两种情况：落在海图 pane 里就更新，落在浮层上就藏起来。
     */
    const onMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      /*
       * 命中判据：**容器本身**（海面/陆地上的 pane 多半 pointer-events:none，
       * 事件目标就落在容器上）或容器里某个 `.leaflet-pane` 的后代都算海图；
       * 其余（掮客卡片、按钮那类浮层）不算 —— 读数没有意义，藏起来，
       * 宁可没有，也不可停留在旧值。
       */
      const onMap = !!target && (target === container || !!target.closest('.leaflet-pane'))
      if (!onMap) { hide(); return }
      const ll = map.mouseEventToLatLng(e)
      const p = map.mouseEventToContainerPoint(e)
      const text = cursorLabel(ll.lat, ll.lng)
      // 只在文字真的变了才写 DOM（同一像素上重复触发时不产生布局抖动）
      if (pill.dataset.text !== text) {
        pill.textContent = text
        pill.dataset.text = text
        pill.dataset.zone = text.split('· ')[1] ?? ''
      }
      const place = readoutPlacement(p.x, p.y, pill.offsetWidth, pill.offsetHeight, map.getSize())
      pill.style.transform = `translate3d(${place.x}px, ${place.y}px, 0)`
      cross.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`
      pill.style.opacity = '1'
      cross.style.opacity = '1'
      pill.dataset.flip = `${place.flippedX ? 'x' : ''}${place.flippedY ? 'y' : ''}`
    }

    container.addEventListener('mousemove', onMove, true)
    container.addEventListener('mouseleave', hide)
    map.on('mouseout', hide)
    // 拖动/缩放时光标与经纬度的对应关系会瞬变，先藏起来，下一次 move 再显示
    map.on('movestart', hide)
    map.on('zoomstart', hide)
    return () => {
      container.removeEventListener('mousemove', onMove, true)
      container.removeEventListener('mouseleave', hide)
      map.off('mouseout', hide)
      map.off('movestart', hide)
      map.off('zoomstart', hide)
    }
  }, [map])

  return (
    <>
      {/* 十字准星：钉住"读数属于这个点" */}
      <div
        ref={crossRef}
        data-testid="cursor-cross"
        className="absolute left-0 top-0 z-[899] pointer-events-none select-none"
        style={{ opacity: 0 }}
        aria-hidden="true"
      >
        {/* 准星要有暗色描边：金色落在沙色陆地上几乎看不见（实测） */}
        <svg width="13" height="13" viewBox="0 0 13 13"
          style={{ transform: 'translate(-50%,-50%)', display: 'block', filter: 'drop-shadow(0 0 1.2px rgba(6,18,26,0.95))' }}>
          <path d="M6.5 0.5 V4 M6.5 9 V12.5 M0.5 6.5 H4 M9 6.5 H12.5"
            stroke="#0a141c" strokeWidth="2.4" opacity="0.55" />
          <path d="M6.5 0.5 V4 M6.5 9 V12.5 M0.5 6.5 H4 M9 6.5 H12.5"
            stroke="#e8d4a8" strokeWidth="1" opacity="0.85" />
          <circle cx="6.5" cy="6.5" r="0.9" fill="#e8d4a8" />
        </svg>
      </div>
      <div
        ref={pillRef}
        data-testid="cursor-readout"
        className="absolute left-0 top-0 z-[900] pointer-events-none select-none whitespace-nowrap
                   rounded border border-[#8b6f3e]/60 bg-[#1b1408]/95 px-2 py-1
                   font-serif text-[12px] tabular-nums tracking-[0.06em] text-[#e8d4a8]
                   shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
        style={{ opacity: 0 }}
        aria-hidden="true"
      />
    </>
  )
}

export default CursorCoords
