import { useMemo } from 'react'
import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports } from '@/data/ports'
import { chooseLabelSides, type LabelSide } from '@/utils/portLabels'
import { portScaleOf, type PortScale } from '@/utils/portScale'

/**
 * 徽章直径按港口规模分级。
 *
 * 【为什么】20 个港口原来一模一样大，玩家在图上**无法区分大港和小补给站**，
 * 而这两者在玩法上差得很远（大港有船坞、能招募、货多）。古海图就是靠符号大小
 * 分级：大城画一座城，小村只有一个点。
 * 数值：小 21 / 中 26 / 大 32；当前所在港口再 +4 并带辉光。
 * 21px 是下限——再小锚的笔画就只有 1px 宽，糊成一团。
 */
const SCALE_SIZE: Record<PortScale, number> = { minor: 21, medium: 26, major: 32 }

/**
 * 统一的**命中框**尺寸（CSS px）。
 *
 * 【为什么不用徽章尺寸当命中框】按规模分级之后小港只有 21px，手机上点不中。
 * 视觉可以有大中小，可点区域不能——这里固定 40（比任何一档徽章都大，
 * 也超过 32px 的手指最小目标），徽章画在框中央。
 */
const HIT = 40

/** 徽章的视觉直径（当前港口 +4 放大） */
function badgeSize(isCurrent: boolean, scale: PortScale): number {
  return isCurrent ? SCALE_SIZE[scale] + 4 : SCALE_SIZE[scale]
}

function createPortIcon(isCurrent: boolean, scale: PortScale) {
  const size = badgeSize(isCurrent, scale)
  // 锚改用金色：徽章是深底，原来那个深褐锚在深底上等于没有。
  const color = isCurrent ? '#f0d88a' : '#d4b884'
  const glow = isCurrent
    ? 'box-shadow: 0 0 10px rgba(212,168,56,0.6), 0 2px 6px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,240,200,0.22);'
    : 'box-shadow: 0 1px 4px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,240,200,0.16);'
  const pulse = isCurrent
    ? 'animation: portPulse 2.5s ease-in-out infinite;'
    : ''

  const anchorSvg = `
    <svg width="${size * 0.5}" height="${size * 0.5}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="5" r="3"/>
      <line x1="12" y1="8" x2="12" y2="21"/>
      <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
    </svg>
  `

  /*
   * 【为什么把底色从近黑改成黄铜渐变】
   * 原来是 #3a2a18 → #1c130a，压在浅米色的陆地上就是一枚**黑孔**——
   * 1:1 看过去像地图被戳了个洞，不像图钉。真实海图上的港口记号是
   * 钉在图上的一枚铜钉/蜡封：外圈有厚度、面有受光。
   * 现在用暖褐渐变（#5a4225 → #2a1c0e）+ 一道顶部内高光，
   * 读作"黄铜"，而奶油色锚在它上面仍然是 8:1 以上的对比，不受影响。
   */
  const html = `
    <div style="width:${HIT}px;height:${HIT}px;display:flex;align-items:center;justify-content:center;">
    <div style="
      position:relative;
      width:${size}px;height:${size}px;
      background:radial-gradient(circle at 34% 26%, #6b5030 0%, #4a3520 42%, #2a1c0e 100%);
      border:1.5px solid #c9a96e;border-radius:50%;
      display:flex;align-items:center;justify-content:center;
      ${glow}${pulse}
      transition: all 0.3s ease;
    ">
      ${anchorSvg}
      ${scale === 'major' ? `<span style="position:absolute;inset:-4px;border-radius:50%;border:1px solid rgba(201,169,110,0.45);pointer-events:none;"></span>` : ''}
    </div>
    </div>
  `
  return L.divIcon({
    html,
    className: 'port-marker-icon',
    iconSize: [HIT, HIT],
    iconAnchor: [HIT / 2, HIT / 2],
  })
}

export function PortMarker() {
  const discoveredPorts = useGameStore((s) => s.discoveredPorts)
  const currentPortId = useGameStore((s) => s.fleet.currentPortId)
  const setSelectedPortId = useMapStore((s) => s.setSelectedPortId)
  const setActivePanel = useGameStore((s) => s.setActivePanel)
  const discoverPort = useGameStore((s) => s.discoverPort)

  /*
   * 每个港口名写在哪一侧：按"最近的邻居"决定，背离它写。
   * 见 utils/portLabels.ts —— 挨着的港口（塞维利亚/加的斯、伦敦/阿姆斯特丹）
   * 会因此天然分开，不需要碰撞消解。
   * 偏移必须跟着方向走，否则文字会压在图标上。
   */
  const sides = useMemo(() => chooseLabelSides(ports), [])
  /*
   * 拉远到 zoom ≤3 时，20 个港口名会挤成一团（实测 zoom 3 下
   * 「哈瓦那 × 韦拉克鲁斯」重叠 21×12px、「托尔图加 × 圣胡安」17×11px）。
   * 那一级缩放下名字本来也读不动，留着只是噪声。
   * 所以只让**当前所在港口**常显名字，其余港口改成悬停才显示——
   * 信息没有减少，只是把"一直挂着"换成"要的时候出现"。
   * 默认缩放是 5，所以这条只在玩家主动拉远时生效。
   */
  const zoom = useMapStore((s) => s.zoom)
  const namesAlwaysOn = zoom > 3
  /*
   * 标签偏移必须按**徽章半径**算，不能用固定 16。
   * 徽章现在按规模 21/26/32（当前港口再 +4），而 Leaflet 的 tooltip 偏移是
   * 相对图标锚点（= 命中框中心）量的：固定 16 会让大港的标签压在徽章上。
   * 留 4px 间隙，读起来是"贴在图钉旁边"而不是"叠在图钉上"。
   */
  const offsetFor = (side: LabelSide, scale: PortScale, isCurrent: boolean): [number, number] => {
    const r = badgeSize(isCurrent, scale) / 2 + 4
    if (side === 'top') return [0, -r]
    if (side === 'bottom') return [0, r]
    if (side === 'left') return [-r - 4, 0]
    return [r + 4, 0]
  }

  return (
    <>
      {ports.map((port) => {
        const isCurrent = port.id === currentPortId
        const side = sides[port.id] ?? 'top'
        const isDiscovered = discoveredPorts.includes(port.id)
        const showDiscoveredMarker = isCurrent || isDiscovered

        // 未发现的港口不渲染任何标记——"未知海域"的位置应当保密，
        // 直到船的瞭望范围（SailingController 的 SIGHT_RANGE）真正看到它
        if (!showDiscoveredMarker) {
          return null
        }

        return (
          <Marker
            key={port.id}
            position={[port.latitude, port.longitude]}
            icon={createPortIcon(isCurrent, portScaleOf(port))}
            eventHandlers={{
              click: () => {
                setSelectedPortId(port.id)
                setActivePanel('port')
                discoverPort(port.id)
              },
            }}
          >
            <Tooltip
              direction={side}
              offset={offsetFor(side, portScaleOf(port), isCurrent)}
              className="port-tooltip"
              permanent={namesAlwaysOn || isCurrent}
            >
              {/* 港口名是地图上最常被读的字，12px → 13px。
                  当前港口原先用 fontWeight:bold 强调——中文只有 400 字重，
                  那是浏览器合成的假粗体（笔画横向涂抹），在 13px 上会糊。
                  改用"提亮 + 加宽字距"：字距是排印里最干净的强调手段，
                  而且不会改变字形本身。 */}
              <span className="font-serif text-[13px]" style={{
                color: isCurrent ? '#fff6dc' : '#f0dfb4',
                letterSpacing: isCurrent ? '0.08em' : '0.05em',
                /*
                 * 描边只做上下左右四个方向，**不做对角**。
                 * 八向版本在 5 倍放大下是"气泡字"：对角的两份描边把衬线的
                 * 细笔画（横画两端、撇捺收笔）整片糊掉，13px 的中文直接读成
                 * 一团带边的色块。四向 + 一层模糊阴影就够了：模糊负责让字
                 * 从花哨的纸纹里脱开，方向描边负责给深蓝海面上的字一个边界。
                 */
                textShadow: [
                  '1px 0 0 #2b1e0e', '-1px 0 0 #2b1e0e',
                  '0 1px 0 #2b1e0e', '0 -1px 0 #2b1e0e',
                  '0 0 5px rgba(20, 13, 6, 0.55)',
                ].join(', '),
              }}>
                {port.nameCn}
              </span>
            </Tooltip>
          </Marker>
        )
      })}
      <style>{`
        .port-marker-icon {
          background: none !important;
          border: none !important;
        }
        /*
         * 【为什么把底板整个去掉】
         * 原来港口名是一块深色圆角牌子 + 金色细边 + 一个指向图标的小三角，
         * 那是网页 tooltip 的做法。而这张图上真正像"海图"的文字（大西洋、
         * 加勒比海）是**直接印在纸上**的衬线字，没有任何底板。
         * 两者并排时，港口名看起来像浮在地图上的控件，地名反倒像地图本身。
         * 现在港口名也走"印在图上"：奶油色字 + 深褐描边，没有底板、没有箭头。
         *
         * 【为什么需要描边而不是只用阴影】
         * 港口骑在海岸线上，标签一侧压在陆地（浅米色）、另一侧压在海面（深蓝）。
         * 只靠一种文字颜色，总有一半读不出来：深墨在海上消失，浅奶在陆上发虚。
         * 描边（四向 1px + 对角 1px）同时给两边提供边界对比，
         * 这是纸质地图标注地名的常规做法。
         */
        .port-tooltip {
          background: transparent !important;
          border: none !important;
          border-radius: 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
          white-space: nowrap !important;
        }
        .port-tooltip::before { display: none !important; }
        @keyframes portPulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 10px rgba(212,168,56,0.7), 0 0 20px rgba(212,168,56,0.3); }
          50% { transform: scale(1.1); box-shadow: 0 0 15px rgba(212,168,56,0.9), 0 0 30px rgba(212,168,56,0.4); }
        }
      `}</style>
    </>
  )
}
