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
  const html = `<div style="
    color: ${isOcean ? 'rgba(60, 80, 50, 0.45)' : 'rgba(90, 62, 26, 0.5)'};
    font-family: 'Crimson Text', Georgia, serif;
    font-size: ${isOcean ? '14px' : '13px'};
    font-weight: ${isOcean ? '400' : '700'};
    font-style: ${isOcean ? 'italic' : 'normal'};
    letter-spacing: ${isOcean ? '4px' : '6px'};
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
