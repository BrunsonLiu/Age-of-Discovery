/**
 * 海图的比例尺：把"屏幕像素 / 海里"换算成一条**整数海里**的尺子。
 *
 * 【为什么海图必须有比例尺】玩家在图上看到"2017 海里"，但画面上没有任何参照 ——
 * 那一句数字等于"很远"。比例尺把"多远"变成可以拿眼睛量的东西：
 * 一条 100 海里的尺子有多长，接下来每一段航线都能拿它去比。
 * 这不是装饰：尺子的长度是从**当前投影**算出来的（见 `ScaleBar`），
 * 换缩放级别它就跟着变，所以它永远说真话。
 *
 * 【为什么不能直接给一个固定长度】Mercator 的像素/海里 随纬度和缩放级别都在变
 * （纬度 60° 处横向被拉伸一倍）。写死一个长度，到了高纬度就会差一半 ——
 * 那比没有比例尺更糟：玩家会按它估算补给。
 */

/**
 * 比例尺可以取的整数海里档位。
 *
 * 【为什么是这几档】1-2-5 系列（人眼最容易对半、对五地估算），再往上加密到
 * 2000/5000 覆盖"整个世界"那一档缩放。不用 3、7 这种档位：那种尺子量出来
 * 玩家还得心算。
 */
export const SCALE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000] as const

/** 尺子在屏幕上的可接受长度（像素）：太短量不准，太长会横穿半个海图 */
export const SCALE_MIN_PX = 64
export const SCALE_MAX_PX = 190

/**
 * 给定"像素/海里"，挑一条合适档位的尺子。
 *
 * @param pxPerNm 当前投影下 1 海里等于多少像素（必须 > 0）
 * @returns `{ nm, px }`；`px` 是**取整**后的像素数（渲染用宽度），
 *          `pxPerNm` 不可用时返回 null
 *
 * 【为什么先找"落在区间里"的档位，而不是取最接近中间值的】取最接近会让尺子
 * 在缩放时反复跳档（60→64→70→…），玩家看到的是一条忽长忽短的尺子；
 * 先满足区间、再按档位顺序取第一个，尺子只会在**该换档**的时候换一次。
 */
export function pickScale(pxPerNm: number): { nm: number; px: number } | null {
  if (!Number.isFinite(pxPerNm) || pxPerNm <= 0) return null
  for (const nm of SCALE_STEPS) {
    const px = pxPerNm * nm
    if (px >= SCALE_MIN_PX && px <= SCALE_MAX_PX) return { nm, px: Math.round(px) }
  }
  /*
   * 都不在区间里（极端缩放）：取**最接近区间中心**的那一档。
   *
   * 【但长度仍然不许说谎】尺子的像素必须等于 `pxPerNm × nm` —— 拉长或压短去
   * 凑区间，玩家量出来的距离就是错的。所以只做"取最近档"，然后**再判断这个
   * 长度还能不能叫尺子**：
   *  · 太短（< 半个下限）：读不出刻段，等于没有；
   *  · 太长（> 两倍上限）：会横穿大半个海图，比没有更糟。
   * 两种都返回 null（不画尺子）。极端缩放下"没有尺子"才是诚实的。
   */
  const mid = (SCALE_MIN_PX + SCALE_MAX_PX) / 2
  let best = SCALE_STEPS[0] as number
  let bestD = Infinity
  for (const nm of SCALE_STEPS) {
    const d = Math.abs(pxPerNm * nm - mid)
    if (d < bestD) { bestD = d; best = nm }
  }
  const px = pxPerNm * best
  if (px < SCALE_MIN_PX * 0.5 || px > SCALE_MAX_PX * 2) return null
  return { nm: best, px: Math.round(px) }
}

/**
 * 比例尺下方的换算说明（例如 "≈ 185 公里"）。
 *
 * 【为什么要给公里】海里是航海单位，但玩家对"公里"更熟；两个单位并排，
 * 玩家第一次看到就知道 100 海里大概有多远，不用去查。
 */
export function scaleHint(nm: number): string {
  const km = nm * 1.852
  return `≈ ${km < 10 ? km.toFixed(1) : Math.round(km)} 公里`
}
