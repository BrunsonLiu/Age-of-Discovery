/**
 * 地图 GeoJSON 的**共享取数入口**。
 *
 * 【为什么要单独立一个模块】
 * land.geojson 已经有 `landCheck.fetchLandGeojsonForRender()` 做单一 Promise，
 * 但 borders.geojson（国界线，640KB）在 2D 的 MapView 里是直接 fetch 的。
 * 现在 3D 也要用它——如果两边各 fetch 一次，同一份 640KB 就在网络上白跑两趟。
 *
 * 这里的做法和 land.geojson 一致：**模块级缓存 Promise**，
 * 谁先调用谁发请求，后来者直接复用同一个 Promise。
 *
 * 【失败怎么办】
 * 国界线是装饰性图层，缺了不影响玩法。
 * 所以失败时返回 null，调用方跳过该图层即可——不能因为一个装饰图层
 * 把整个地图搞崩（2D 的 Promise.allSettled 就是这个思路）。
 */

/**
 * borders.geojson 的类型。
 * 直接用 GeoJSON.FeatureCollection —— @types/geojson 已在项目里，
 * 2D 的 MapView 也用同一套类型（GeoJsonObject），两边保持一致。
 */
export type BordersGeoJson = GeoJSON.FeatureCollection

let bordersPromise: Promise<BordersGeoJson | null> | null = null

/**
 * 取 borders.geojson（国界线）。
 * 全局只发一次请求；失败返回 null（调用方跳过该图层）。
 */
export function fetchBordersGeojson(): Promise<BordersGeoJson | null> {
  if (bordersPromise) return bordersPromise
  bordersPromise = fetch(`${import.meta.env.BASE_URL}data/borders.geojson`)
    .then(r => {
      if (!r.ok) throw new Error(`borders.geojson ${r.status}`)
      return r.json() as Promise<BordersGeoJson>
    })
    .catch(err => {
      console.warn('国界线数据加载失败，该图层将不显示', err)
      return null
    })
  return bordersPromise
}
