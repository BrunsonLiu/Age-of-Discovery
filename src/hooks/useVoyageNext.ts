import { useMemo } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { nextMilestone, suggestPortFor, voyageMilestones } from '@/data/voyageMilestones'
import { ports } from '@/data/ports'
import { computeWindFavor, dailyDistanceNm } from '@/utils/navigation'
import { STANCES } from '@/utils/segment'
import { WEATHER_INFO, weatherFavorFactor } from '@/utils/weather'
import type { VoyageMilestone } from '@/data/voyageMilestones'

export interface VoyageNextInfo {
  target: VoyageMilestone | null
  suggest: { id: number; nameCn: string; distanceNm: number } | null
  /** 按部就班走到目标港约需几天；与航路卡用同一套口径 */
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
 * 【天数为何要算全】日航程 = 船速 × 风向 × 方针 × 天候 × 24，不能用基础值。
 * 风向按「当前位置 → 目标港」的方位算，与生成航线时同源，所以这里写的天数
 * 和舰队面板里点开那条航线的天数对得上。
 */
export function useVoyageNext(): VoyageNextInfo {
  const discoveredPorts = useGameStore(s => s.discoveredPorts)
  const fleet = useGameStore(s => s.fleet)
  const shipPosition = useGameStore(s => s.shipPosition)
  // 方针与天候会改变日航程，订阅必须在任何 early return 之前
  const stance = useGameStore(s => s.stance)
  const weather = useGameStore(s => s.weather)

  const here = useMemo<[number, number] | null>(() => {
    if (fleet.isSailing && shipPosition && Number.isFinite(shipPosition[0]) && Number.isFinite(shipPosition[1])) {
      return [shipPosition[0], shipPosition[1]]
    }
    const p = ports.find(p => p.id === fleet.currentPortId)
    return p ? [p.latitude, p.longitude] : null
  }, [fleet.isSailing, fleet.currentPortId, shipPosition])

  const target = useMemo(() => nextMilestone(discoveredPorts), [discoveredPorts])
  const suggest = useMemo(
    () => (target ? suggestPortFor(target, discoveredPorts, here) : null),
    [target, discoveredPorts, here],
  )

  const weatherMul = WEATHER_INFO[weather.kind].sailMul * weatherFavorFactor(weather.kind)
  const windFavor = here && suggest
    ? computeWindFavor(here[0], here[1],
        ports.find(p => p.id === suggest.id)?.latitude ?? here[0],
        ports.find(p => p.id === suggest.id)?.longitude ?? here[1])
    : 1
  const perDay = dailyDistanceNm(fleet, [], windFavor, STANCES[stance].speedMul, weatherMul)
  const days = suggest && suggest.distanceNm > 0
    ? Math.max(1, Math.ceil(suggest.distanceNm / Math.max(1, perDay)))
    : null
  const doneCount = voyageMilestones.filter(m => m.atPorts.some(id => discoveredPorts.includes(id))).length

  return { target, suggest, days, doneCount }
}
