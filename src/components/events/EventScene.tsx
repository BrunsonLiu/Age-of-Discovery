import type { ReactElement } from 'react'
import { useState } from 'react'
import { DefaultScene } from './sceneKit'
import { sceneImage } from '@/data/sceneImages'
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
  const [imgFailed, setImgFailed] = useState(false)
  const Scene = (sceneKey && SCENE_REGISTRY[sceneKey]) || DefaultScene
  const useImage = !!imgSrc && !imgFailed
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ aspectRatio: '400 / 140' }}>
      {useImage ? (
        <img
          src={imgSrc}
          alt=""
          aria-hidden="true"
          className="w-full h-full block object-cover"
          onError={() => setImgFailed(true)}
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
