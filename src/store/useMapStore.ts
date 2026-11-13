import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 玩家所处的空间：海图 = 从船上看世界；岸上 = 靠港后的近景舞台 */
export type ViewMode = 'chart' | 'harbor'

interface MapState {
  center: [number, number]
  zoom: number
  /**
   * 【故意不持久化，理由同 renderMode】
   * 这是"这一刻人在哪儿"的会话状态，不是资产。写进存档会让玩家清缓存前
   * 停在岸上、读档后还停在岸上，甚至在没有港口的存档里卡住。
   * 刷新一律回到海图，成本零、无迁移风险。
   */
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  showWindOverlay: boolean
  showCurrentOverlay: boolean
  showPirateZones: boolean
  /** 航程圈（以本船为中心、5/10 天等距圈）：默认关，免得开局就糊住海图 */
  showVoyageRings: boolean
  selectedPortId: number | null
  /**
   * 地图渲染模式：'2d' = Leaflet 矢量图（默认），'3d' = three.js 立体海图。
   *
   * 【故意不持久化】
   * useMapStore 的 persist 没有 version 字段，给它加版本号就得配 migrate，
   * 老存档（version 0）一旦迁移出错就是玩家丢进度。
   * 视图偏好属于"这次的会话状态"，不值得为它冒这个险——
   * 不写进 partialize，老存档读回来时 renderMode 保持初始值 '2d'。
   */
  renderMode: '2d' | '3d'
  /**
   * 船上视角（第三个空间）：贴着海面看自己的船。
   *
   * 【为什么也放在 useMapStore 而不是游戏状态】与 viewMode/renderMode 同理：
   * 这是"这一刻站在哪看"，不是资产；不写进 partialize，刷新回海图。
   */
  deckView: boolean
  setDeckView: (v: boolean) => void
  /**
   * 海陆掩码与航线几何是否已就绪。
   *
   * 【为什么需要这个开关】航线弧长（避陆后的真实航程）要靠 A* 在海陆掩码上搜，
   * 掩码是异步加载的。掩码没到位时算出来的「航线」是**一条直线**——
   * 塞维利亚→埃尔米纳会少报 961 海里（49%）。掩码到位后缓存被清掉重算，
   * 但 React 不知道这件事，组件不会自己重画。
   *
   * 所以这里给一个明确的「几何已就绪」信号：掩码到位并清完缓存后由
   * MapView 置 true，需要真实航程的地方（主屏「下一站」指引）等它。
   * 在此之前那些地方**不显示里程**，而不是显示一个错的。
   *
   * 【不持久化】与 renderMode 同理：这是「这一刻数据到位了没」的会话状态，
   * 不写进存档（刷新后重新加载掩码即可）。
   */
  landDataReady: boolean
  /**
   * 海陆掩码**加载失败**（不是「还没到」，是「确认拿不到」）。
   *
   * 【为什么单独一个标志，而不是把 landDataReady 留在 false 就算完】
   * 掩码到位之前，航线几何是**没结论**的（可能被陆地横穿）；
   * 掩码确认失败之后，几何是**有结论的**——虽然那条结论是「只能走直线」。
   *
   * 这两种状态对待方式不同：
   *   - 没结论 → 界面不许报里程/天数（还没到时候）；
   *   - 失败   → 界面仍不报里程（数据确实没有），
   *              但**地图要照常出来**（不能因为一个可选文件拿不到就把游戏卡死）。
   *
   * 地图内容（航线虚线、商船）挂载的判据是这两个标志的**或**：
   * 几何有结论之后才挂载，于是玩家永远不会看到一条横穿陆地的航线。
   *
   * 【不持久化】同 landDataReady。
   */
  landDataFailed: boolean
  setCenter: (center: [number, number]) => void
  setZoom: (zoom: number) => void
  toggleWindOverlay: () => void
  toggleCurrentOverlay: () => void
  togglePirateZones: () => void
  toggleVoyageRings: () => void
  setSelectedPortId: (id: number | null) => void
  setRenderMode: (mode: '2d' | '3d') => void
  setLandDataReady: (ready: boolean) => void
  setLandDataFailed: (failed: boolean) => void
}

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      /*
       * 开局视野：以**船所在的海域**为中心，而不是大西洋正中央。
       *
       * 【为什么改】原默认 (25°N, 20°W) / zoom 5 实测构图（1440×900）：
       * 左半屏是空海 + 一个"大西洋"标签，塞维利亚的船被挤到**右上角**，
       * 正压在右上角的缩略图和"3D 海图"按钮下面 —— 全屏最重要的那个点
       * 正好在最差的位置。
       * 改成 (34°N, 9°W)：船落在画面中部偏右上、伊比利亚占住中央，
       * 地中海入口与北非海岸都在框内，西侧仍留出大西洋（那是航线图要用的）。
       */
      center: [34, -9],
      zoom: 5,
      showWindOverlay: false,
      showCurrentOverlay: true,
      showPirateZones: true,
      showVoyageRings: false,
      selectedPortId: null,
      renderMode: '2d',
      deckView: false,
      viewMode: 'chart',
      landDataReady: false,
      landDataFailed: false,
      setViewMode: (mode) => set({ viewMode: mode }),
      setCenter: (center) => set({ center }),
      setZoom: (zoom) => set({ zoom }),
      toggleWindOverlay: () => set((s) => ({ showWindOverlay: !s.showWindOverlay })),
      toggleCurrentOverlay: () => set((s) => ({ showCurrentOverlay: !s.showCurrentOverlay })),
      togglePirateZones: () => set((s) => ({ showPirateZones: !s.showPirateZones })),
      toggleVoyageRings: () => set((s) => ({ showVoyageRings: !s.showVoyageRings })),
      setSelectedPortId: (id) => set({ selectedPortId: id }),
      setRenderMode: (mode) => set({ renderMode: mode }),
      setDeckView: (v) => set({ deckView: v }),
      setLandDataReady: (ready) => set({ landDataReady: ready }),
      setLandDataFailed: (failed) => set({ landDataFailed: failed }),
    }),
    {
      name: 'age-of-discovery-map',
      partialize: (state) => ({
        center: state.center,
        zoom: state.zoom,
        showWindOverlay: state.showWindOverlay,
        showCurrentOverlay: state.showCurrentOverlay,
        showPirateZones: state.showPirateZones,
        showVoyageRings: state.showVoyageRings,
      }),
    }
  )
)

/**
 * 开发调试钩子：仅在 dev 构建下暴露 store，便于自动化验证（生产构建会被 tree-shake 掉）。
 *
 * 【为什么需要】
 * 图层开关（风向/洋流/海盗区域）在 2D 与 3D 两个视图里都生效，
 * e2e 要验证"在 3D 里点开关 → 场景里对应图层真的出现"，
 * 就需要一个能在测试里读图层状态的入口。
 * 之前 e2e 里写的是 `window.__mapStore?.getState?.()`，
 * 但这个钩子**从来没存在过**——可选链一直在静默返回 undefined，
 * 那条断言等于没查（典型的假测试）。
 */
if (
  typeof import.meta !== 'undefined' && typeof window !== 'undefined' &&
  (import.meta.env?.DEV || import.meta.env?.VITE_PROBE === '1')
) {
  ;(window as unknown as { __mapStore: typeof useMapStore }).__mapStore = useMapStore
}
