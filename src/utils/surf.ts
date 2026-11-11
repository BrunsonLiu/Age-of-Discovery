/**
 * 2D 海图的岸边浪线（surf）：**纯计算**，不碰 Leaflet。
 *
 * 【为什么需要它】现在的海岸是"12 层浅水描边 + 一条深褐墨线"，从远看是干净的，
 * 但海与岸的交界是一条**静止**的线 —— 真实海图上没有这样的岸：只要有风，
 * 岸线外侧就有一道白沫。这一层就是把"海在动"这件事画到岸上。
 *
 * 【为什么强弱要绑风速，而不是写死】风速是这局游戏里已经在算的数
 * （`weather.windSpeed`，晴天 8~14 节、风暴 24~38 节），它决定航速、决定帆鼓成什么样。
 * 如果岸上的白沫在 38 节风暴里和 4 节无风时一模一样，那这层就是纯贴图，
 * 和画面里其它一切"随风变化"的东西对不上。所以这里只做一件事：
 * **风速 → 浪强度 → 线宽/亮度/白沫段长度/推进速度**，四者同源。
 */

/** 夹到 0..1 */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** 低于这个风速基本没有白沫（风平浪静、锚地里的那种海面） */
export const SURF_WIND_MIN = 3

/** 到这个风速浪就"打满"（风暴） */
export const SURF_WIND_FULL = 30

/**
 * 浪的强弱 0..1（由风速决定）。
 *
 * 无效输入（NaN / undefined）返回 **0**：宁可没有白沫，也不要拿一个假数去画。
 * 这个取向和比例尺、航程圈一致 —— 数不可用就不画。
 */
export function surfStrength(windKnots: number): number {
  if (!Number.isFinite(windKnots)) return 0
  return clamp01((windKnots - SURF_WIND_MIN) / (SURF_WIND_FULL - SURF_WIND_MIN))
}

/**
 * 线宽（屏幕像素）：无风 3.4、风暴 6.6。
 *
 * 【为什么要 3.4 起步】描边是沿几何线**居中**画的，落进陆地的那一半会被
 * 陆地填色盖住 —— 玩家真正看到的只有 `weight / 2`。第一版给 1.8~4.4，
 * 可见部分只有 1~2px，A/B 差分里"亮度 >30 的像素"只占 **0.01%**，
 * 等于没画。要看得见，weight 必须按"可见厚度的两倍"给。
 */
export function surfWeight(s: number): number {
  return 3.4 + 3.2 * clamp01(s)
}

/** 不透明度：无风 0.30、风暴 0.64（再高会盖住海岸墨线） */
export function surfOpacity(s: number): number {
  return 0.3 + 0.34 * clamp01(s)
}

/**
 * 虚线周期固定 **12px**。
 *
 * 【为什么周期不能随手改】白沫是"沿虚线方向推进"的：CSS 让
 * `stroke-dashoffset` 从 0 走到 −周期，走到恰好一个周期才会无缝回卷。
 * 周期一变，动画的终点就对不上，浪会**每循环一次抖一下**。
 * 所以强度的差异只体现在"白沫段占多少"（下面）和线宽/亮度上，周期恒定。
 */
export const SURF_PERIOD_PX = 12

/**
 * 虚线：白沫段 2.4~4.8px，剩下的都是空隙（周期恒 12）。
 *
 * 【为什么占空比要给到 20%~40%】第一版 1.0/12（8%）—— 一条 2px 的线里有 92%
 * 是空的，加上半截被陆地盖住，远看就是"没有"。白沫本来就该成段连片，
 * 断得太碎只是在画虚线，不是在画浪。
 */
export function surfDash(s: number): string {
  const d = 2.4 + 2.4 * clamp01(s)
  return `${d.toFixed(2)} ${(SURF_PERIOD_PX - d).toFixed(2)}`
}

/*
 * 【没有再做的两件事，写在这里免得下次重做】
 *
 *  ① 白沫沿虚线爬（`stroke-dashoffset` 动画）。实测（无头 Edge，软件渲染）：
 *     图层留着、只关动画 59.5 fps；一开动画 **10.2 fps**。责任不在虚线本身
 *     （1420 条虚线静态绘制 60.0 fps），而在整片 SVG 每帧重新光栅化。
 *     挪进独立 pane 也只剩 48 fps。为一个 1~2 Hz 的装饰效果不划算，撤掉。
 *  ② 按面积挑"流动的海岸"（先按 `featureArea >= 0.3` 挑，land.geojson 里有
 *     316 个；改按面积取前 14 块）。动画撤掉之后它没有调用方了，一并删掉 ——
 *     两个数的实测代价都写在 `MapView` 与 `SurfLine` 的注释里。
 */
