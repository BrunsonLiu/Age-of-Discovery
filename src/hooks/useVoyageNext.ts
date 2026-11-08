import { useMemo } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { nextMilestone, suggestPortFor, voyageMilestones } from '@/data/voyageMilestones'
import { ports } from '@/data/ports'
import { routeFacts, voyageDays } from '@/utils/voyage'
import type { VoyageMilestone } from '@/data/voyageMilestones'

export interface VoyageNextInfo {
  target: VoyageMilestone | null
  /**
   * 下一步的目的港。
   *
   * `distanceNm` 是**实际航线弧长**（避陆后），与出航计划面板的「航程」同源；
   * `null` 表示航线几何还没就绪（海陆掩码未加载），此时**不显示里程**，
   * 而不是显示一个少报近一半的直线距离。
   */
  suggest: { id: number; nameCn: string; distanceNm: number | null } | null
  /** 按部就班走到目标港约需几天；与出航计划面板的「约 N 天可达」同源 */
  days: number | null
  doneCount: number
}

/**
 * 「下一步往哪开」的**唯一计算来源**。
 *
 * 【为什么要抽出来】这段账原本只活在 `VoyageNextCard` 里。把指引做成主屏
 * 常驻条之后，如果新条自己再算一遍，两处迟早分叉：一张写「约 14 天」、
 * 另一张写「约 20 天」，玩家不知道该按哪张备水。这里让两个 UI 共用同一个
 * hook，天数、港名、海里数只能有一个值。
 *
 * 【里程与天数为什么必须与出航计划同源】这是第 33 轮修掉的硬伤：
 * 常驻条原先用 haversine **大圆距离**报里程、用**当前方针**算天数，
 * 而船实际走的是避陆弧线、天数按「按部就班」算。实测 20 条里程碑航线
 * **全部**少报：塞维利亚→埃尔米纳主屏写「1956 海里 · 约 10 天」，
 * 出航计划写「航程 2917 海里 · 约 15 天可达」——差 49%、差 5 天。
 * 补给够不够又是按出航计划那个天数判的，于是主屏在骗玩家备货。
 *
 * 现在里程走 `routeFacts`（与 store.sailToWaypoint 同一个 A* 几何），
 * 天数走 `voyageDays`（与出航计划面板的 steady 一份总账同一个函数），
 * 军官（领航员 +15%）也一并算进去。
 *
 * 【为什么等「几何已就绪」】海陆掩码是异步加载的。掩码没到位时 A* 只能给
 * 一条直线，算出来的弧长少报近一半。所以掩码到位前不给数字——
 * 空着比给个错的强。
 */
export function useVoyageNext(): VoyageNextInfo {
  const discoveredPorts = useGameStore(s => s.discoveredPorts)
  const fleet = useGameStore(s => s.fleet)
  // 已识得的航路：拾到迪亚士的石十字之后，风暴带不再拖慢这一站
  const knownPassages = useGameStore(s => s.knownPassages)
  const shipPosition = useGameStore(s => s.shipPosition)
  const officers = useGameStore(s => s.officers)
  const weather = useGameStore(s => s.weather)
  const landDataReady = useMapStore(s => s.landDataReady)
  // 注意这里**不订阅方针**：天数固定按「按部就班」算（与出航计划面板同口径），
  // 方针要到每段起点才选，不该在这一层参与天数计算。

  const here = useMemo<[number, number] | null>(() => {
    if (fleet.isSailing && shipPosition && Number.isFinite(shipPosition[0]) && Number.isFinite(shipPosition[1])) {
      return [shipPosition[0], shipPosition[1]]
    }
    const p = ports.find(p => p.id === fleet.currentPortId)
    return p ? [p.latitude, p.longitude] : null
  }, [fleet.isSailing, fleet.currentPortId, shipPosition])

  const target = useMemo(() => nextMilestone(discoveredPorts), [discoveredPorts])
  // 挑选目的港只按大圆距离排序（便宜，且同一批候选的绕行代价量级相近），
  // 显示用的真实航程在下面用航线弧长重算。
  const picked = useMemo(
    () => (target ? suggestPortFor(target, discoveredPorts, here) : null),
    [target, discoveredPorts, here],
  )

  /** 真实航线弧长 + 这条航线的风向（含季风：印度洋半年反向） */
  const route = useMemo(() => {
    if (!picked || !here || !landDataReady) return null
    const p = ports.find(x => x.id === picked.id)
    if (!p) return null
    return routeFacts(here, [p.latitude, p.longitude], fleet.day, knownPassages)
  }, [picked, here, landDataReady, fleet.day, knownPassages])

  const suggest = useMemo(
    () => (picked ? { id: picked.id, nameCn: picked.nameCn, distanceNm: route ? route.distanceNm : null } : null),
    [picked, route],
  )

  const days = useMemo(() => {
    if (!route || route.distanceNm <= 0) return null
    return voyageDays({
      distanceNm: route.distanceNm,
      windFavor: route.windFavor,
      fleet,
      officers,
      weather,
    })
  }, [route, fleet, officers, weather])

  const doneCount = voyageMilestones.filter(m => m.atPorts.some(id => discoveredPorts.includes(id))).length

  return { target, suggest, days, doneCount }
}
