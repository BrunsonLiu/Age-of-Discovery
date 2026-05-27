import { useMapEvents } from 'react-leaflet'
import { useGameStore } from '@/store/useGameStore'
import { useMapStore } from '@/store/useMapStore'
import { ports } from '@/data/ports'
import type { Waypoint } from '@/types'

export default function MapClickHandler() {
  const fleet = useGameStore(s => s.fleet)
  const shipPosition = useGameStore(s => s.shipPosition)
  const setWaypoint = useGameStore(s => s.setWaypoint)
  const sailToWaypoint = useGameStore(s => s.sailToWaypoint)
  const changeCourse = useGameStore(s => s.changeCourse)
  const setActivePanel = useGameStore(s => s.setActivePanel)
  const discoverPort = useGameStore(s => s.discoverPort)
  const setSelectedPortId = useMapStore(s => s.setSelectedPortId)

  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng

      const nearbyPort = ports.find(p => {
        const dLat = p.latitude - lat
        const dLng = p.longitude - lng
        return Math.sqrt(dLat * dLat + dLng * dLng) < 2
      })

      if (nearbyPort) {
        if (nearbyPort.id === fleet.currentPortId) return

        const waypoint: Waypoint = {
          latitude: nearbyPort.latitude,
          longitude: nearbyPort.longitude,
          name: nearbyPort.nameCn,
          portId: nearbyPort.id,
        }

        if (fleet.isSailing) {
          changeCourse(waypoint)
        } else {
          setWaypoint(waypoint)
          sailToWaypoint(waypoint)
        }
        discoverPort(nearbyPort.id)
        setSelectedPortId(nearbyPort.id)
        setActivePanel('port')
        return
      }

      const waypoint: Waypoint = { latitude: lat, longitude: lng }

      if (fleet.isSailing) {
        changeCourse(waypoint)
      } else if (fleet.currentPortId || shipPosition) {
        setWaypoint(waypoint)
        sailToWaypoint(waypoint)
      }
    },
  })

  return null
}
