import type { ReactElement } from 'react'
import { useState } from 'react'
import { DefaultScene } from './sceneKit'
import { sceneImage, shouldUseSceneImage } from '@/data/sceneImages'
import {
  StormScene, FairwindScene, DoldrumsScene, CapeScene, FogScene, MeteorScene,
  IslandScene, WhaleScene, DolphinScene, SchoolScene, VolcanoScene, SirenScene, KrakenScene,
} from './scenes/natureScenes'
import {
  PirateScene, GhostShipScene, MarketScene, NavyScene, TreasureScene, ReefScene,
  DiseaseScene, FestivalScene, MutinyScene, SmuggleScene, ChartScene, TavernScene,
} from './scenes/humanScenes'

/**
 * 事件场景注册表：事件数据里的 sceneKey 映射到具体插图。
 * 每个场景都是 400×140 viewBox 的 SVG 片段。
 */
const SCENE_REGISTRY: Record<string, () => ReactElement> = {
  /* 天气与海洋 */
  storm: StormScene,
  fairwind: FairwindScene,
  doldrums: DoldrumsScene,
  cape: CapeScene,
  fog: FogScene,
  meteor: MeteorScene,
  reef: ReefScene,
  /* 生物与岛屿 */
  island: IslandScene,
  whale: WhaleScene,
  dolphin: DolphinScene,
  school: SchoolScene,
  kraken: KrakenScene,
  siren: SirenScene,
  volcano: VolcanoScene,
  /* 人与船 */
  pirate: PirateScene,
  ghostship: GhostShipScene,
  market: MarketScene,
  navy: NavyScene,
  treasure: TreasureScene,
  disease: DiseaseScene,
  festival: FestivalScene,
  mutiny: MutinyScene,
  smuggle: SmuggleScene,
  chart: ChartScene,
  tavern: TavernScene,
}

export const SCENE_KEYS = Object.keys(SCENE_REGISTRY)

interface EventSceneProps {
  sceneKey?: string
  className?: string
}

/**
 * 事件插图容器：渲染对应场景，无匹配时回退到默认海景。
 * 外层 div 负责圆角与高度，SVG 自适应填充。
 */
export default function EventScene({ sceneKey, className = '' }: EventSceneProps) {
  // 有 GPT 真实插图的场景优先用插图（风暴/海盗/海怪/幽灵船 + 火山/浓雾/庆典/藏宝/塞壬/走私），
  // 其余仍走手绘 SVG；插图加载失败时回退 SVG，两条路都不空。
  const imgSrc = sceneImage(sceneKey)
  /**
   * 记录「加载失败的是哪个 URL」，而不是场景键，也不是一个全局布尔值。
   *
   * 失败是 URL 的属性，不是场景的属性——同一个地址 404，换个场景来用也一样拿不到。
   * 所以按 URL 记最贴合实际：
   *   · 不会跨场景污染：别的场景用的是别的 URL，不受影响；
   *   · 素材补齐后能自动恢复：路径一变（开发时补图、或 CDN 换资源），
   *     新 URL 不在失败名单里，真图重新生效，不必刷新整页。
   * 早期版本用的是全局布尔值 imgFailed，一旦某个场景加载失败就会置 true，
   * 之后**所有**场景都被误判为失败而退化成手绘 SVG（风暴/海盗/海怪这些
   * 本来有真图的场景也一起受害）。
   */
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const Scene = (sceneKey && SCENE_REGISTRY[sceneKey]) || DefaultScene
  const useImage = shouldUseSceneImage(failedSrc, imgSrc)
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio: '400 / 140' }}>
      {useImage ? (
        <img
          // key 让场景切换时重建 <img> 节点：否则 React 复用同一节点，
          // 换 src 不会重新解码（且旧图的失败状态会跟着节点走）
          key={`${sceneKey ?? 'none'}-${imgSrc}`}
          src={imgSrc}
          alt=""
          aria-hidden="true"
          className="w-full h-full block object-cover"
          onError={() => setFailedSrc(imgSrc)}
        />
      ) : (
        <svg
          viewBox="0 0 400 140"
          className="w-full h-full block"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <Scene />
        </svg>
      )}
      {/* 底部压暗，让标题文字无论场景明暗都清晰 */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
        style={{ background: 'linear-gradient(180deg, rgba(10,18,25,0) 0%, rgba(10,18,25,0.72) 100%)' }}
      />
    </div>
  )
}
