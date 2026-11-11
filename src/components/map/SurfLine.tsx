import { useMemo } from 'react'
import { GeoJSON } from 'react-leaflet'
import { useGameStore } from '@/store/useGameStore'
import { surfDash, surfOpacity, surfStrength, surfWeight } from '@/utils/surf'

/**
 * 岸边浪线：沿海岸画一道白沫。
 *
 * 【位置靠**渲染顺序**，不靠 z-index】描边是沿几何线居中画的，所以「落在陆地上」
 * 的那半截必须被陆地填色盖住，只留海面外侧那一道 —— 这就是浅水带用的同一个办法
 * （12 层由粗到细的描边，内侧被陆地吃掉，不需要任何几何裁剪）。
 *
 * 于是本组件在 MapView 里必须夹在 **浅水层之后、陆地之前**：
 *   · 排在浅水层**之后**，白沫才不被那 12 层叠起来的青蓝（约 45%）洗淡；
 *   · 排在陆地**之前**，内半边才被陆地填色盖住（否则整条海岸套一圈亮边，
 *     连陆地内侧也亮，读起来像"地图外框"而不是浪）。
 *
 * 【试过又换掉的做法】自建 `surf` pane、z=398（在陆地之下）：位置对，但它同时
 * 落在浅水层**之下** —— A/B 差分里"亮度 >30 的像素"只有 0.11%，白沫被洗掉大半。
 *
 * 【为什么是静态的】白沫沿虚线爬（`stroke-dashoffset` 动画）实测代价：
 * 同一台无头 Edge（软件渲染）里 60 → **10.2 fps**（关掉动画立刻回到 59.5，
 * 图层留着不掉帧）。责任不在虚线本身（1420 条虚线静态绘制 60.0fps），
 * 而在"整片 SVG 每帧重新光栅化"——放在 3400 条 path 的大 SVG 里尤其明显
 * （挪进独立 pane 也要掉到 48）。为一个 1~2 Hz 的装饰丢掉帧率不划算，
 * 所以改成静态：强弱仍由风速决定（线宽 / 亮度 / 白沫段疏密），只是不爬。
 * 这个文件里**没有** animation / keyframes —— 不是漏了。
 */
export function SurfLine({ land }: { land: GeoJSON.GeoJsonObject | null }) {
  const windSpeed = useGameStore((s) => s.weather.windSpeed)
  const s = surfStrength(windSpeed)

  const style = useMemo(() => {
    const weight = surfWeight(s)
    const opacity = surfOpacity(s)
    const dashArray = surfDash(s)
    return () => ({
      color: '#eef8fd',
      weight,
      opacity,
      dashArray,
      lineCap: 'round' as const,
    })
  }, [s])

  if (!land) return null

  return <GeoJSON key="surf" data={land} style={style as never} interactive={false} />
}

export default SurfLine
