import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface MapState {
  center: [number, number]
  zoom: number
  showWindOverlay: boolean
  showCurrentOverlay: boolean
  showPirateZones: boolean
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
  setCenter: (center: [number, number]) => void
  setZoom: (zoom: number) => void
  toggleWindOverlay: () => void
  toggleCurrentOverlay: () => void
  togglePirateZones: () => void
  setSelectedPortId: (id: number | null) => void
  setRenderMode: (mode: '2d' | '3d') => void
}

export const useMapStore = create<MapState>()(
  persist(
    (set) => ({
      center: [25, -20],
      zoom: 5,
      showWindOverlay: false,
      showCurrentOverlay: false,
      showPirateZones: false,
      selectedPortId: null,
      renderMode: '2d',
      setCenter: (center) => set({ center }),
      setZoom: (zoom) => set({ zoom }),
      toggleWindOverlay: () => set((s) => ({ showWindOverlay: !s.showWindOverlay })),
      toggleCurrentOverlay: () => set((s) => ({ showCurrentOverlay: !s.showCurrentOverlay })),
      togglePirateZones: () => set((s) => ({ showPirateZones: !s.showPirateZones })),
      setSelectedPortId: (id) => set({ selectedPortId: id }),
      setRenderMode: (mode) => set({ renderMode: mode }),
    }),
    {
      name: 'age-of-discovery-map',
      partialize: (state) => ({
        center: state.center,
        zoom: state.zoom,
        showWindOverlay: state.showWindOverlay,
        showCurrentOverlay: state.showCurrentOverlay,
        showPirateZones: state.showPirateZones,
      }),
    }
  )
)
