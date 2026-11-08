import { Fragment, useMemo } from 'react'
import { Polygon, Marker } from 'react-leaflet'
import L from 'leaflet'
import { useGameStore } from '@/store/useGameStore'
import { activePhenomena, phenomenonRing } from '@/data/seaPhenomena'

/**
 * 季节性海上现象（2D）：这一季的这片水。
 *
 * 【为什么不给玩家一句说明，而画一片区域】
 * 用户的方向是「季节要融进来，但不要只用文字」。给一句"秋季好望角有风暴"
 * 是文字；让那片海**在图上真的有一圈界线**、开进去天数真的变多、
 * 出事真的更频繁，才是季节。
 *
 * 【为什么整层 interactive:false】
 * 这层是纯展示，压在底图上。项目里已有约定：压在海图上的浮层绝不能吃掉点击
 * （见 NotificationToast 与 BrokerTip 的教训——掮客浮条当年整张卡吃点击，
 * 把 3D 里一件遗物的热区盖成了死区）。实测：圈内任意一点
 * `elementFromPoint` 命中的是 `.leaflet-container`，不是 path。
 *
 * 【为什么用 Polygon 而不是 Leaflet 的 Circle】
 * 3D 那侧要靠 `phenomenonRing` 的点去画同一圈线。
 * 用 L.Circle 的话 2D 是个"以米为单位的正圆"、3D 是我们自己算的点，
 * 两个视图在高纬度会差出一圈；现在两边读的是同一段点。
 *
 * 【为什么是两重圈（外粗内细）】
 * 单圈读作"一个圆圈符号"，像调试标记。外圈 + 一圈更淡的内圈，
 * 才读成"一片水域"——3D 那边同样两重（见 mapLayers3d.buildPhenomena），
 * 两个视图因此是同一个东西。
 *
 * 【标签为什么放在南缘而不是圆心】
 * 圆心几乎一定压着别的东西：港口名、海洋注记（"南海海域"）、海上遗物的图标。
 * 实测秋季把标签放在好望角圆心时，它整个被"南海海域"那道注记盖住。
 * 挪到偏南的圈内（`-0.66 × 半径`）通常是空水面。
 */
export function SeaPhenomena() {
  const day = useGameStore(s => s.fleet.day)
  // 只有四条数据、换季才变：不必每帧重算
  const active = useMemo(() => activePhenomena(day), [day])

  return (
    <>
      {active.map(p => {
        const ring = phenomenonRing(p)
        const inner = phenomenonRing({ ...p, radiusDeg: p.radiusDeg * 0.86 })
        return (
          <Fragment key={`phenom-${p.id}`}>
            <Polygon
              positions={ring}
              pathOptions={{
                color: p.color,
                weight: 2.2,
                opacity: 0.75,
                // 长虚线 + 大间隔：读作"一片水域的界线"，不是国界
                dashArray: '9 6',
                lineJoin: 'round',
                fill: true,
                fillColor: p.color,
                fillOpacity: 0.12,
              }}
              interactive={false}
            />
            <Polygon
              positions={inner}
              pathOptions={{
                color: p.color,
                weight: 1,
                opacity: 0.32,
                dashArray: '5 9',
                fill: false,
              }}
              interactive={false}
            />
          </Fragment>
        )
      })}
      {active.map(p => (
        <Marker
          key={`phenom-label-${p.id}`}
          position={[p.lat - p.radiusDeg * 0.66, p.lng]}
          icon={L.divIcon({
            className: 'phenom-label-icon',
            /*
             * 名字用**羊皮纸色**而不是现象本身的颜色：
             * 现象色是为深蓝海面挑的低饱和色（#7b5a86 之类），拿来写字实测
             * 在 1× 下几乎读不出来。颜色的关联由那一圈虚线承担，
             * 文字只负责"这片水叫什么"，所以按海图注记的规矩来。
             */
            html: `<span>${p.name}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          })}
          interactive={false}
          zIndexOffset={-180}
        />
      ))}
      <style>{`
        /* 名字是坐标注释，不是按钮：不吃点击、不抢对比度 */
        .phenom-label-icon {
          background: none !important;
          border: none !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
        }
        .phenom-label-icon span {
          position: absolute;
          transform: translate(-50%, -50%);
          white-space: nowrap;
          font-family: 'Noto Serif SC', var(--font-serif, serif);
          font-size: 12px;
          letter-spacing: 0.14em;
          color: rgba(231, 216, 181, 0.82);
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 0 10px rgba(0, 0, 0, 0.7);
        }
      `}</style>
    </>
  )
}
