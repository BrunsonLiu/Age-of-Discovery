import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface MapState {
  center: [number, number]
  zoom: number
  showWindOverlay: boolean
  showCurrentOverlay: boolean
  showPirateZones: boolean
  selectedPortId: number | null
  setCenter: (center: [number, number]) => void
  setZoom: (zoom: number) => void
  toggleWindOverlay: () => void
  toggleCurrentOverlay: () => void
  togglePirateZones: () => void
  setSelectedPortId: (id: number | null) => void
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
      setCenter: (center) => set({ center }),
      setZoom: (zoom) => set({ zoom }),
      toggleWindOverlay: () => set((s) => ({ showWindOverlay: !s.showWindOverlay })),
      toggleCurrentOverlay: () => set((s) => ({ showCurrentOverlay: !s.showCurrentOverlay })),
      togglePirateZones: () => set((s) => ({ showPirateZones: !s.showPirateZones })),
      setSelectedPortId: (id) => set({ selectedPortId: id }),
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
