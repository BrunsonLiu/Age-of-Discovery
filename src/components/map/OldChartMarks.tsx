import { Marker } from 'react-leaflet'
import L from 'leaflet'
import { useEffect, useMemo, useRef } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { oldChartMarks } from '@/utils/oldChart'
import { oldChartMarkerHtml, roundNm10 } from '@/utils/oldChartGlyph'
import { haversineNm } from '@/utils/navigation'

/**
 * 古海图（学者公会 90 档）：画在海图上的一卷旧图。
 *
 * 【它和遗物/漂流物最大的区别：它不是世界里的东西，是**图上的墨**】
 * 遗物是半埋在海里的实物（铜环 + 剪影、有拾取半径、能点）；
 * 漂流物是水面上的木桶（脉冲光圈、会漂走）。
 * 古海图既不是实物也不会漂走 —— 它是某个死掉的制图师画在纸上的记号。
 * 所以：
 *   · 视觉是**虚线墨圈 + 墨字**，没有任何发光/脉冲（一张纸不会呼吸）；
 *   · `pointer-events: none`，**点不到** —— 它只回答"再往前有什么"，
 *     不替你出航、不承诺奖赏（这是"卖航路，不卖金币"那条方向的直接推论）。
 *     一个看得见却点不动的东西会被当成 bug，所以它连手型光标都没有。
 *
 * 【为什么订阅 day 而不是 shipPosition】
 * 船在航行时每帧都在动，订阅 shipPosition 会让这一层每帧重建 Marker。
 * 但"离船最近的未至之地"只在跨天时可能改变，所以按天重算；
 * 而标签上的距离由下面那个 rAF 直接改 DOM（变了才写，与 SeaRelics 同一套）。
 *
 * 【3D 也有】标记的 HTML 与选点规则和 2.5D 立体海图共用
 * （utils/oldChartGlyph + utils/oldChart），3D 侧走 seaLayer3d 的 `passive`
 * 纯标注通道：不生成 button、不吃指针、**不参与屏幕疏散**（被推开就等于指错地方）。
 *
 * 【为什么距离取整到 10 海里】
 * 逐海里跳变的数字会让标签宽度一直抖（"1240" → "1239" → "1238"），
 * 而这张图上的距离本来就只是量级。取整到 10：读起来稳，语义也没丢。
 */
export default function OldChartMarks() {
  const discovered = useGameStore(s => s.discoveredPorts)
  const scholarsRep = useGameStore(s => s.factionRep.scholars ?? 0)
  // 跨天才有机会换标的（见上面"为什么订阅 day"）
  const day = useGameStore(s => s.fleet.day)

  const marks = useMemo(
    () => oldChartMarks({
      discovered,
      ship: useGameStore.getState().shipPosition,
      scholarsRep,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [discovered, scholarsRep, day],
  )

  const icons = useMemo(() => {
    const m = new Map<number, L.DivIcon>()
    for (const mark of marks) {
      m.set(mark.portId, L.divIcon({
        className: 'old-chart-mark',
        // 与 3D 共用同一段 HTML（utils/oldChartGlyph）：两个视图里必须长得一样
        html: oldChartMarkerHtml(mark.portId, mark.nm),
        // 容器只用来定位；命中区按项目规矩给 44，虽然这里点不到
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      }))
    }
    return m
  }, [marks])

  /** 标签元素：只改 textContent，不重建 Marker */
  const labels = useRef(new Map<number, Element>())

  useEffect(() => {
    /*
     * 不用 Marker 的 ref 拿元素：react-leaflet 的 ref 在"层创建"时触发，
     * 那一刻 DOM 还没挂上去（getElement() 是 null），ref 里存不到东西。
     * 改成第一次需要时按 data 属性找一次（找不到就下一帧再找）——
     * 两个节点，querySelector 一次的成本可以忽略，而它不会猜错时机。
     */
    // 每次标的变了就丢掉旧索引：留着 detached 节点会让标签永远不更新
    labels.current.clear()
    const collect = () => {
      for (const mark of marks) {
        if (labels.current.has(mark.portId)) continue
        const el = document.querySelector(`.old-chart-label[data-old-chart-nm="${mark.portId}"]`)
        if (el) labels.current.set(mark.portId, el)
      }
    }
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const pos = useGameStore.getState().shipPosition
      if (!pos) return
      collect()
      for (const mark of marks) {
        const el = labels.current.get(mark.portId)
        if (!el) continue
        const text = `${roundNm10(haversineNm(pos[0], pos[1], mark.lat, mark.lng))} 海里`
        // 变了才写 DOM（项目规矩：不乱写）
        if (el.textContent !== text) el.textContent = text
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [marks])

  if (marks.length === 0) return null

  return (
    <>
      {marks.map(mark => (
        <Marker
          key={mark.portId}
          position={[mark.lat, mark.lng]}
          icon={icons.get(mark.portId)!}
          /*
           * 不可交互：古海图是纸上的墨，不是能拿的东西。
           * 压在所有"实物"之下（遗物 -120 / 漂流物 -100），只比底图高一点。
           */
          interactive={false}
          zIndexOffset={-160}
        />
      ))}
    </>
  )
}
