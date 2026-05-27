import { Marker } from 'react-leaflet'
import L from 'leaflet'

const oceanLabels = [
  { name: '大西洋', lat: 25, lng: -35 },
  { name: '加勒比海', lat: 16, lng: -72 },
  { name: '太平洋', lat: 5, lng: -130 },
  { name: '印度洋', lat: -15, lng: 75 },
  { name: '地中海', lat: 37, lng: 18 },
  { name: '北海', lat: 57, lng: 3 },
  { name: '几内亚湾', lat: 3, lng: 5 },
  { name: '好望角海域', lat: -34, lng: 19 },
  { name: '马六甲海峡', lat: 4, lng: 100 },
  { name: '莫桑比克海峡', lat: -16, lng: 42 },
  { name: '英吉利海峡', lat: 50, lng: -2 },
  { name: '波罗的海', lat: 60, lng: 20 },
  { name: '黑海', lat: 43, lng: 35 },
  { name: '红海', lat: 22, lng: 38 },
  { name: '阿拉伯海', lat: 15, lng: 63 },
  { name: '南海', lat: 12, lng: 113 },
  { name: '日本海', lat: 40, lng: 135 },
  { name: '墨西哥湾', lat: 25, lng: -90 },
]

const regionLabels = [
  { name: '欧 洲', lat: 52, lng: 15 },
  { name: '非 洲', lat: 5, lng: 22 },
  { name: '亚 洲', lat: 45, lng: 85 },
  { name: '北 美 洲', lat: 48, lng: -100 },
  { name: '南 美 洲', lat: -15, lng: -55 },
  { name: '澳大利亚', lat: -25, lng: 135 },
  { name: '格陵兰', lat: 72, lng: -40 },
  { name: '印度半岛', lat: 22, lng: 78 },
  { name: '阿拉伯半岛', lat: 23, lng: 48 },
  { name: '西伯利亚', lat: 62, lng: 100 },
]

function createLabelIcon(text: string, isOcean: boolean) {
  const html = `<div style="
    color: ${isOcean ? 'rgba(80,160,220,0.3)' : 'rgba(201,169,110,0.25)'};
    font-family: 'Crimson Text', Georgia, serif;
    font-size: ${isOcean ? '13px' : '12px'};
    font-weight: ${isOcean ? '400' : '600'};
    letter-spacing: ${isOcean ? '5px' : '3px'};
    white-space: nowrap;
    text-shadow: 0 0 10px rgba(0,0,0,0.6);
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
      {oceanLabels.map((label) => (
        <Marker
          key={label.name}
          position={[label.lat, label.lng]}
          icon={createLabelIcon(label.name, true)}
          interactive={false}
        />
      ))}
      {regionLabels.map((label) => (
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
