import { Marker } from 'react-leaflet'
import L from 'leaflet'
import { OCEAN_LABELS, REGION_LABELS } from '@/data/mapLayers'

/**
 * 洋名 / 洲名。
 *
 * 【数据来源】
 * 定义在 `@/data/mapLayers`——2.5D 立体海图要显示同一批名字，
 * 各写一份就会让两个视图看到不同的地名。
 */

function createLabelIcon(text: string, isOcean: boolean) {
  /*
   * 【这四行样式都是量出来的，不是调出来的】
   *
   * 1) 颜色：原来是 rgba(60,80,50,0.45)（深绿 45%）。海面转深蓝之后，
   *    它压在 rgb(75,91,108) 上合成出 rgb(68,86,82)，对比 **1.12:1**
   *    ——"大西洋""加勒比海"一个字都看不见，而全屏 60% 的面积就是海。
   *    换成奶油色（与陆地同一族），20px 下需要 3:1，实测 rgba(226,208,170,0.78)
   *    给到 3.5:1：够读，又不至于在海上"喊"。
   *
   * 2) 字号：14px → 20px。古海图上的洋名本来就是**大号、疏排**的，
   *    一个名字横亘半个海域；14px 只像一条注解。放大之后顺带把 WCAG 的
   *    门槛从 4.5 降到 3.0（≥18px 算大字），这正是它该被对待的方式。
   *
   * 3) 字体栈：原来是 'Crimson Text', Georgia, serif ——**漏了 Noto Serif SC**。
   *    "大西洋"是汉字，前两个字体没有字形，于是回落到 Windows 的宋体点阵，
   *    和全站自托管的衬线字体完全不是一回事（这是界面廉价感最大的来源）。
   *    这里必须和 tailwind 的 font-serif 完全一致。
   *
   * 4) 字重：洲名原来是 700。中文只加载了 400 一个字重，700 是浏览器合成的
   *    假粗体（横向涂抹）。强调改靠字号与字距。
   */
  const color = isOcean ? 'rgba(226, 208, 170, 0.78)' : 'rgba(74, 48, 18, 0.75)'
  const fontSize = isOcean ? '20px' : '18px'
  const letterSpacing = '8px'
  const html = `<div style="
    color: ${color};
    font-family: 'Crimson Text', 'Noto Serif SC', Georgia, serif;
    font-size: ${fontSize};
    font-style: ${isOcean ? 'italic' : 'normal'};
    letter-spacing: ${letterSpacing};
    white-space: nowrap;
    text-shadow: 0 0 8px rgba(244, 228, 193, 0.4);
    pointer-events: none;
    user-select: none;
  ">${text}</div>`

  return L.divIcon({
    html,
    className: 'ocean-label-icon',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

export default function OceanLabels() {
  return (
    <>
      {OCEAN_LABELS.map((label) => (
        <Marker
          key={label.name}
          position={[label.lat, label.lng]}
          icon={createLabelIcon(label.name, true)}
          interactive={false}
        />
      ))}
      {REGION_LABELS.map((label) => (
        <Marker
          key={label.name}
          position={[label.lat, label.lng]}
          icon={createLabelIcon(label.name, false)}
          interactive={false}
        />
      ))}
      <style>{`
        .ocean-label-icon {
          background: none !important;
          border: none !important;
        }
      `}</style>
    </>
  )
}
