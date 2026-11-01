/**
 * 羊皮纸装饰层：只保留纸纹与暗角两张"整屏材质"。
 *
 * 【为什么把罗盘玫瑰、海怪、罗盘星全部删掉了】
 * 它们都是 `absolute` 定位的**屏幕固定**插画，位置写死在四个角上，
 * 而四个角恰好全被 UI 占着。实测（像素 A/B：关掉装饰后比同一区域的差异）：
 *   · 左下罗盘星 (12,756)  → 最大差 **0**，被掮客卡完全压住，从来没显示过；
 *   · 右上罗盘玫瑰 (1300,12) → 被「3D 海图」按钮与小地图埋掉，只剩一道弧线露在外面，
 *     那道弧线看起来像个渲染错误；
 *   · 左上/右下海怪 → 半透明褐色压在**陆地上**（默认视角右下就是撒哈拉），
 *     3 倍放大下是一团污渍，不像印花。
 * 这个文件里本来就写着一句「装饰只有在看得清的时候才是装饰，看不清就只是脏」——
 * 按同一条标准，它们该走。
 *
 * 取而代之的是 **世界坐标**里的罗经玫瑰（见 RhumbLines）：钉在开阔洋面上，
 * 随地图平移缩放，四周还有从它量出去的等角航线——那才是波托兰海图的构图。
 * 屏幕固定的插画永远躲不开 UI，也永远不知道自己底下是海还是沙漠。
 *
 * dimmed=true 时把纸纹与暗角压到三成——2.5D 立体海图用。
 * 原因：.vintage-paper 是 mix-blend-mode: multiply，
 * 在 2D 的纯色羊皮纸底图上只是"年代感"，
 * 但压在受光照的 3D 画面上会把陆地亮度压到只剩 20%（实测 p90 203 → 41）。
 */
export default function VintageMapOverlay({ dimmed = false }: { dimmed?: boolean }) {
  return (
    <div
      className={`vintage-map-overlay pointer-events-none absolute inset-0${dimmed ? ' vintage-map-overlay--dimmed' : ''}`}
      aria-hidden="true"
    >
      <div className="vintage-paper" />
      <div className="vintage-vignette" />
    </div>
  )
}
