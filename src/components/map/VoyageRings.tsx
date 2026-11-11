import { useMemo } from 'react'
import { Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useMapStore } from '@/store/useMapStore'
import { useGameStore } from '@/store/useGameStore'
import { dailyDistanceNm } from '@/utils/navigation'
import { WEATHER_INFO, weatherFavorFactor } from '@/utils/weather'
import { STANCES } from '@/utils/segment'
import { circleLatLngs, pickRingDays, RING_SEGMENTS, ringRadii } from '@/utils/voyageRings'
import { pxPerNmAt } from '@/utils/mapScale'

/**
 * 航程圈：以本船为中心，"约 5 天 / 10 天航程"的等距圈。
 *
 * 【半径来自单一来源】`dailyDistanceNm(fleet, officers, 1, steady, weatherMul)` ——
 * 与出航计划、底部状态栏**同一个函数**。右边这一串参数不是随手挑的：
 *  · `windFavor = 1`：还没定航线，用中性风；
 *  · `STANCES.steady.speedMul`：按部就班（面板默认口径）；
 *  · `weatherMul`：与 `voyageDays` 里那份一样的算法（sailMul × favorFactor）。
 * 漏乘任何一个，圈就会比面板乐观或悲观 —— 那是最难发现的一类不一致。
 *
 * 【为什么标"约"】中性风 + 定方针只是基准；真跑起来顺风更远、逆风更近。
 */
function ringIcon(text: string) {
  const S = 40
  const html = `<div style="
    width:${S}px;height:${S}px;display:flex;align-items:center;justify-content:center;
    font-family:inherit;font-size:12px;letter-spacing:1px;
    color:#e8d4a8;text-shadow:0 1px 2px rgba(0,0,0,0.85);
    background:rgba(27,20,8,0.86);border:1px solid rgba(139,111,62,0.7);border-radius:999px;
    white-space:nowrap;padding:0 4px;
  ">${text}</div>`
  return L.divIcon({ html, className: 'voyage-ring-icon', iconSize: [S, 20], iconAnchor: [S / 2, 10] })
}

export function VoyageRings() {
  const show = useMapStore((s) => s.showVoyageRings)
  const pos = useGameStore((s) => s.shipPosition)
  const fleet = useGameStore((s) => s.fleet)
  const officers = useGameStore((s) => s.officers)
  const weather = useGameStore((s) => s.weather)
  const map = useMap()

  const rings = useMemo(() => {
    if (!pos) return []
    const w = WEATHER_INFO[weather.kind]
    const weatherMul = (w?.sailMul ?? 1) * weatherFavorFactor(weather.kind)
    const nmPerDay = dailyDistanceNm(fleet, officers, 1, STANCES.steady.speedMul, weatherMul)
    /*
     * 标签贴在哪：**圈上离画面中心最近的那一点**。
     *
     * 【为什么不是正北】第一版贴在正北（圈顶）—— 默认缩放下一圈半径 430px，
     * 船在画面下半部，圈顶直接跑到画面外，标签一个都看不见（实测截图：
     * 只看到两条弧，没有字）。朝画面中心方向贴，标签就会落在框内那一段弧上。
     * 船正好在中心时方向退化，退回正北。
     */
    const c = map.getCenter()
    const dLat = c.lat - pos[0]
    const dLng = c.lng - pos[1]
    const bearing = (Math.atan2(dLng, dLat) * 180) / Math.PI // 0 = 正北
    const idx = Math.round(((bearing + 360) % 360) / 360 * RING_SEGMENTS) % RING_SEGMENTS
    // 天数跟着缩放挑：固定 5/10 天时，10 天圈在默认缩放下整圈都在画面外
    const dayList = pickRingDays(nmPerDay, pxPerNmAt(map))
    return ringRadii(nmPerDay, dayList).map((r) => {
      const points = circleLatLngs(pos[0], pos[1], r.nm)
      return { ...r, points, label: points[idx] }
    })
  }, [pos, fleet, officers, weather, map])

  if (!show || rings.length === 0) return null

  return (
    <div data-testid="voyage-rings">
      {rings.map((r) => (
        <Polyline
          key={`ring-${r.days}`}
          positions={r.points}
          pathOptions={{
            color: '#c9a96e',
            weight: 1.3,
            opacity: 0.66,
            dashArray: '7 7',
            fill: false,
            interactive: false,
          }}
        />
      ))}
      {rings.map((r) => (
        <Marker
          key={`ring-label-${r.days}`}
          position={r.label}
          icon={ringIcon(`约 ${r.days} 天`)}
          interactive={false}
          zIndexOffset={-100}
        />
      ))}
      <style>{`.voyage-ring-icon { background: none !important; border: none !important; }`}</style>
    </div>
  )
}
