/**
 * 环境氛围资产路径（GPT 生成，来自 A-H 全集包 2026-10-24）。
 * B 组海面已由 MapView 直接以 sea-tile 文件名引用（ocean_waves/ocean_deep 真无缝平铺，
 * 实测接缝差 0.00/0.15），这里只放 G 组天气层与 H 组结局背景。
 *
 *   fx_rain   雨丝层 1024×1024 RGBA（G1，程序生成的周期性雨条）
 *   fx_fog    雾团层 1024×1024 RGBA（G2，程序生成的周期性雾团）
 *   fx_spray  浪花飞沫 1024×1024 RGBA（G3，透明底提取，沫集中在画面下方）
 *   clouds    云层 1024×1024 RGBA（B3，阴/雨/暴风雨的天空）
 *   bg_title   主标题背景 1920×1080（H1，夜景母港+银河；程序延展的天地交界有可见接缝）
 *   bg_victory 胜利结局背景 1920×1080（H2，金色夕阳凯旋）
 *   bg_defeat  失败结局背景 1920×1080（H3，暴风雨沉船）
 *
 * 第 4 批（2026-10-25 收，5 张 1024×1024 RGBA，四角透明，
 * 已逐张合成到 sea-tile.png 上目检通过）：
 *   bowWave     船首分波与尾迹，V 尖在顶部、尾迹向下渐隐 → 随船 bearing 旋转
 *   cannonFlash 炮口火光，中心白热焰 + 外围琥珀火星与硝烟
 *   waterSpout  炮弹落水水柱，底部水花环 + 竖直喷柱 + 顶部飞沫
 *   hullBurst   船体中弹，偏向一侧的木屑碎块 + 火光 + 烟气
 *   smokePuff   硝烟团，可多层叠加（原图 alpha 封顶 174，
 *               已归一化到 235，否则叠海面上偏淡）
 *
 * ⚠️ 质量声明（README）：非原生分辨率、程序延展，可见接缝可能需要修图；
 *    均以压暗衬底方式使用（上叠 UI），接缝不明显。
 */

const BASE = (import.meta.env?.BASE_URL as string | undefined) || '/'

export const FX_ASSETS = {
  rain: `${BASE}assets/fx/fx_rain.png`,
  fog: `${BASE}assets/fx/fx_fog.png`,
  spray: `${BASE}assets/fx/fx_spray.png`,
  clouds: `${BASE}assets/fx/weather_clouds.png`,
  bowWave: `${BASE}assets/fx/fx_bow_wave.png`,
  cannonFlash: `${BASE}assets/fx/fx_cannon_flash.png`,
  waterSpout: `${BASE}assets/fx/fx_water_spout.png`,
  hullBurst: `${BASE}assets/fx/fx_hull_burst.png`,
  smokePuff: `${BASE}assets/fx/fx_smoke_puff.png`,
} as const

export const BG_ASSETS = {
  title: `${BASE}assets/bg/bg_title.png`,
  victory: `${BASE}assets/bg/bg_victory.png`,
  defeat: `${BASE}assets/bg/bg_defeat.png`,
} as const
