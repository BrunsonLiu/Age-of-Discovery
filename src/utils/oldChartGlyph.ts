/**
 * 古海图标记的 HTML：2D 平面海图与 2.5D 立体海图**共用这一份**。
 *
 * 【为什么抽出来】与 `relicGlyph` 同一个理由：同一件事在两个视图里必须长得一样，
 * 否则玩家切一次视图会以为"这是两种东西"，更糟的是以后改了 2D 忘了改 3D。
 *
 * 【为什么它不像遗物那样有铜环与剪影】见 index.css 里 `.old-chart-ring` 的说明：
 * 遗物是水里的实物（静止铜环），漂流物是水面的浮物（脉冲光圈），
 * 古海图是**画在纸上的记号** —— 虚线墨圈 + 墨字，不做任何发光或动画。
 */

/** 距离取整到 10 海里：逐海里跳变会让标签宽度一直抖，而图上这只是量级 */
export function roundNm10(nm: number): number {
  return Math.max(0, Math.round(nm / 10) * 10)
}

/**
 * @param portId 目标港口（写作稳定锚点 `data-old-chart-nm`，e2e 按它找那一处）
 * @param nm 当前距离（海里，会取整到 10）
 */
export function oldChartMarkerHtml(portId: number, nm: number): string {
  /*
   * 标签拆成两行（"古海图" / "170 海里"），不是一行写完。
   * 两处标记常常挨得很近，一行「古海图 · 170 海里」有 110px 宽，两个就叠在一起；
   * 拆成两行后宽度只剩一半，横向叠字的概率大幅下降 ——
   * 而"这是什么"和"多远"本来就是两个问题，分行也好读。
   */
  return '<div class="old-chart-ring"></div>' +
    '<div class="old-chart-dot"></div>' +
    '<div class="old-chart-label">' +
      '<span class="old-chart-label__t">古海图</span>' +
      `<span class="old-chart-label__d" data-old-chart-nm="${portId}">${roundNm10(nm)} 海里</span>` +
    '</div>'
}
